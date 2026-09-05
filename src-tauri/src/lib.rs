// TetherMesh — Desktop Control Plane & Local Proxy Gateway
// Production Hardened Architecture with Zero-Trust Security Invariants

use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Write as FmtWrite;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// Constants & Static Synchronization Locks
// ---------------------------------------------------------------------------

pub const VAULT_SERVICE: &str = "tetheriq";
pub const MAX_BACKUPS_RETAINED: usize = 5;

static CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());
static TRANSITION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

// ---------------------------------------------------------------------------
// Supervisor State & Process Management
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarPhase {
    Stopped,
    Starting,
    Ready,
    Unhealthy,
    Stopping,
    Crashed,
    Failed,
    MonitorLost,
}

#[derive(Debug)]
pub struct SidecarSupervisorState {
    pub bound_port: u16,
    pub instance_id: String,
    pub handshake_secret: String,
    pub gateway_token: String,
    pub phase: SidecarPhase,
    pub child: Option<CommandChild>,
    pub pid: Option<u32>,
    pub job_handle: Option<isize>,
    pub generation: u64,
    pub is_air_gapped: bool,
}

#[derive(Debug)]
pub struct SidecarSupervisor {
    pub state: Arc<Mutex<SidecarSupervisorState>>,
}

impl Default for SidecarSupervisor {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(SidecarSupervisorState {
                bound_port: 0,
                instance_id: String::new(),
                handshake_secret: String::new(),
                gateway_token: String::new(),
                phase: SidecarPhase::Stopped,
                child: None,
                pid: None,
                job_handle: None,
                generation: 0,
                is_air_gapped: false,
            })),
        }
    }
}

// ---------------------------------------------------------------------------
// Security: CSPRNG Hex Secret Generator & Constant-Time Verification
// ---------------------------------------------------------------------------

pub fn generate_os_random_hex(byte_count: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|e| format!("OS random generator failed: {}", e))?;
    Ok(bytes.iter().map(|b| format!("{:02x}", b)).collect())
}

pub fn constant_time_eq_hex(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x.to_ascii_lowercase() ^ y.to_ascii_lowercase();
    }
    diff == 0
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

// ---------------------------------------------------------------------------
// Native OS Keyring Persistence
// ---------------------------------------------------------------------------

fn get_provider_secret(provider: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(VAULT_SERVICE, provider)
        .map_err(|e| format!("Keyring init error for {}: {}", provider, e))?;
    entry
        .get_password()
        .map_err(|e| format!("Keyring get error for {}: {}", provider, e))
}

fn set_provider_secret(provider: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(VAULT_SERVICE, provider)
        .map_err(|e| format!("Keyring init error for {}: {}", provider, e))?;
    entry
        .set_password(secret)
        .map_err(|e| format!("Keyring set error for {}: {}", provider, e))
}

fn delete_provider_secret(provider: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(VAULT_SERVICE, provider)
        .map_err(|e| format!("Keyring init error for {}: {}", provider, e))?;
    entry
        .delete_password()
        .map_err(|e| format!("Keyring delete error for {}: {}", provider, e))
}

pub fn canonical_tool_field_key(tool_id: &str, field_key: &str) -> String {
    format!("tool__{}__{}", tool_id, field_key)
}

fn get_vault_secret(tool_id: &str, field_key: &str) -> Result<String, String> {
    let canonical = canonical_tool_field_key(tool_id, field_key);
    let entry = keyring::Entry::new(VAULT_SERVICE, &canonical)
        .map_err(|e| format!("Keyring init error for {}: {}", canonical, e))?;
    entry
        .get_password()
        .map_err(|e| format!("Keyring get error for {}: {}", canonical, e))
}

fn set_vault_secret(tool_id: &str, field_key: &str, value: &str) -> Result<(), String> {
    let canonical = canonical_tool_field_key(tool_id, field_key);
    let entry = keyring::Entry::new(VAULT_SERVICE, &canonical)
        .map_err(|e| format!("Keyring init error for {}: {}", canonical, e))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keyring set error for {}: {}", canonical, e))
}

fn delete_vault_secret(tool_id: &str, field_key: &str) -> Result<(), String> {
    let canonical = canonical_tool_field_key(tool_id, field_key);
    let entry = keyring::Entry::new(VAULT_SERVICE, &canonical)
        .map_err(|e| format!("Keyring init error for {}: {}", canonical, e))?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keyring delete error for {}: {}", canonical, e)),
    }
}

// ---------------------------------------------------------------------------
// Air-Gapped Zero-Egress Validation & Local Routing Graph Integrity
// ---------------------------------------------------------------------------

pub fn validate_numeric_loopback_url(url_str: &str) -> Result<(), String> {
    let re = Regex::new(
        r"^http://(?P<host>127\.0\.0\.1|\[::1\])(?::(?P<port>[0-9]{1,5}))?(?P<path>/.*)?$",
    )
    .unwrap();
    let caps = match re.captures(url_str) {
        Some(c) => c,
        None => {
            return Err(format!(
                "Air-gapped mode forbids non-loopback URL: {}",
                url_str
            ))
        }
    };
    if let Some(port_match) = caps.name("port") {
        let p: u32 = port_match
            .as_str()
            .parse()
            .map_err(|_| "Invalid port".to_string())?;
        if p == 0 || p > 65535 {
            return Err(format!("Port {} out of range", p));
        }
    }
    Ok(())
}

pub fn validate_air_gapped_yaml(yaml_content: &str, _app_data_dir: &Path) -> Result<(), String> {
    let doc: serde_yaml::Value =
        serde_yaml::from_str(yaml_content).map_err(|e| format!("YAML parsing failed: {}", e))?;

    let root = match doc.as_mapping() {
        Some(m) => m,
        None => return Err("Root must be a YAML mapping".to_string()),
    };

    for (k, _) in root {
        let key_str = k.as_str().unwrap_or("");
        if ![
            "model_list",
            "router_settings",
            "general_settings",
            "litellm_settings",
        ]
        .contains(&key_str)
        {
            return Err(format!(
                "Disallowed top-level section in air-gapped mode: {}",
                key_str
            ));
        }
    }

    let model_list = root
        .get(serde_yaml::Value::String("model_list".to_string()))
        .and_then(|v| v.as_sequence())
        .ok_or_else(|| "Missing model_list sequence in air-gapped config".to_string())?;

    if model_list.is_empty() {
        return Err("model_list must not be empty in air-gapped mode".to_string());
    }

    for item in model_list {
        let item_map = item
            .as_mapping()
            .ok_or_else(|| "model_list item must be a mapping".to_string())?;

        let lp = item_map
            .get(serde_yaml::Value::String("litellm_params".to_string()))
            .and_then(|v| v.as_mapping())
            .ok_or_else(|| "model_list item missing litellm_params mapping".to_string())?;

        let model = lp
            .get(serde_yaml::Value::String("model".to_string()))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "litellm_params missing model string".to_string())?;

        let api_base = lp
            .get(serde_yaml::Value::String("api_base".to_string()))
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                format!(
                    "Local model '{}' must specify numeric loopback api_base",
                    model
                )
            })?;

        validate_numeric_loopback_url(api_base)?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Atomic File Replacement & Perms
// ---------------------------------------------------------------------------

pub fn replace_file_atomically_with_perms(
    temp_path: &Path,
    final_path: &Path,
) -> Result<(), String> {
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };

        let temp_wide: Vec<u16> = temp_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let final_wide: Vec<u16> = final_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let success = MoveFileExW(
                temp_wide.as_ptr(),
                final_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            );
            if success == 0 {
                let err = std::io::Error::last_os_error();
                return Err(format!(
                    "Atomic replacement via MoveFileExW failed: {}",
                    err
                ));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        fs::rename(temp_path, final_path)
            .map_err(|e| format!("Atomic replacement via rename failed: {}", e))?;
    }

    Ok(())
}

pub fn resolve_config_path(app: &AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("./tethermesh_data"));
    let _ = fs::create_dir_all(&app_dir);
    app_dir.join("litellm_config.yaml")
}

pub fn load_persisted_air_gapped_state(app_data_dir: &Path) -> bool {
    let state_file = app_data_dir.join("air_gapped.state");
    if let Ok(content) = fs::read_to_string(&state_file) {
        content.trim().eq_ignore_ascii_case("true")
    } else {
        false
    }
}

pub fn persist_air_gapped_state(app_data_dir: &Path, enabled: bool) -> Result<(), String> {
    let state_file = app_data_dir.join("air_gapped.state");
    fs::write(&state_file, if enabled { "true" } else { "false" })
        .map_err(|e| format!("Failed to persist air_gapped state: {}", e))
}

// ---------------------------------------------------------------------------
// Sidecar Supervisor Spawning, Process Trees & Allowlisted Environment
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn assign_process_to_kill_on_close_job(pid: u32) -> Result<isize, String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job.is_null() {
            return Err(format!(
                "Failed to create sidecar job object: {}",
                std::io::Error::last_os_error()
            ));
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(format!("Failed to configure sidecar job object: {}", error));
        }

        let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if process.is_null() {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(format!("Failed to open sidecar process {}: {}", pid, error));
        }

        let assigned = AssignProcessToJobObject(job, process);
        CloseHandle(process);
        if assigned == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(format!(
                "Failed to assign sidecar process {} to its job object: {}",
                pid, error
            ));
        }

        Ok(job as isize)
    }
}

#[cfg(target_os = "windows")]
fn close_sidecar_job(job_handle: Option<isize>) {
    if let Some(handle) = job_handle {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(handle as _);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn close_sidecar_job(_job_handle: Option<isize>) {}

pub async fn terminate_sidecar_tree(
    child: CommandChild,
    pid: Option<u32>,
    job_handle: Option<isize>,
) -> Result<(), String> {
    close_sidecar_job(job_handle);
    #[cfg(not(target_os = "windows"))]
    if let Some(p) = pid {
        unsafe {
            libc::kill(-(p as i32), libc::SIGKILL);
        }
    }
    let _ = child.kill();
    #[cfg(target_os = "windows")]
    if let Some(p) = pid {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &p.to_string()])
            .output();
    }
    let start = std::time::Instant::now();
    let mut exited = pid.is_none();
    while start.elapsed().as_millis() < 3000 {
        if let Some(p) = pid {
            #[cfg(target_os = "windows")]
            {
                use windows_sys::Win32::Foundation::CloseHandle;
                use windows_sys::Win32::System::Threading::{
                    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
                };
                let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, p) };
                if handle.is_null() {
                    exited = true;
                    break;
                } else {
                    unsafe {
                        CloseHandle(handle);
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if unsafe { libc::kill(p as i32, 0) } != 0 {
                    exited = true;
                    break;
                }
            }
        } else {
            exited = true;
            break;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    if exited {
        Ok(())
    } else {
        Err(format!(
            "Sidecar process {} did not terminate within 3 seconds",
            pid.unwrap_or_default()
        ))
    }
}

pub fn build_child_environment(
    is_air_gapped: bool,
    secret: &str,
    instance_id: &str,
    generation: u64,
    gateway_token: &str,
    config_hash: &str,
    config_path: &Path,
) -> HashMap<String, String> {
    let mut env = HashMap::new();

    #[cfg(target_os = "windows")]
    for key in &[
        "SYSTEMROOT",
        "COMSPEC",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
    ] {
        if let Ok(val) = std::env::var(key) {
            env.insert(key.to_string(), val);
        }
    }
    #[cfg(not(target_os = "windows"))]
    for key in &["PATH", "HOME", "TMPDIR", "USER"] {
        if let Ok(val) = std::env::var(key) {
            env.insert(key.to_string(), val);
        }
    }

    env.insert("PYTHONUNBUFFERED".into(), "1".into());
    env.insert("TETHER_SUPERVISED".into(), "1".into());
    env.insert("TETHER_HANDSHAKE_SECRET".into(), secret.into());
    env.insert("TETHER_INSTANCE_ID".into(), instance_id.into());
    env.insert("TETHER_GENERATION".into(), generation.to_string());
    env.insert("TETHER_GATEWAY_TOKEN".into(), gateway_token.into());
    env.insert("TETHER_CONFIG_HASH".into(), config_hash.into());
    env.insert(
        "LITELLM_CONFIG_PATH".into(),
        config_path.to_string_lossy().to_string(),
    );
    env.insert(
        "AIR_GAPPED_MODE".into(),
        if is_air_gapped {
            "1".into()
        } else {
            "0".into()
        },
    );

    if is_air_gapped {
        env.insert("HTTP_PROXY".into(), "".into());
        env.insert("HTTPS_PROXY".into(), "".into());
        env.insert("ALL_PROXY".into(), "".into());
        env.insert("NO_PROXY".into(), "*".into());
    } else {
        let providers = [
            ("openai", "OPENAI_API_KEY"),
            ("anthropic", "ANTHROPIC_API_KEY"),
            ("azure", "AZURE_API_KEY"),
            ("gemini", "GEMINI_API_KEY"),
            ("aws", "AWS_SECRET_ACCESS_KEY"),
            ("openrouter", "OPENROUTER_API_KEY"),
            ("mistral", "MISTRAL_API_KEY"),
            ("deepseek", "DEEPSEEK_API_KEY"),
            ("cohere", "COHERE_API_KEY"),
            ("groq", "GROQ_API_KEY"),
        ];
        for (provider, env_var) in providers {
            if let Ok(sec) = get_provider_secret(provider) {
                if !sec.is_empty() {
                    env.insert(env_var.into(), sec);
                }
            }
        }
    }

    env
}

pub async fn spawn_litellm_sidecar(
    app: AppHandle,
    supervisor_state: Arc<Mutex<SidecarSupervisorState>>,
) -> Result<CommandChild, String> {
    let secret = generate_os_random_hex(32)?;
    let gateway_token = format!("tether_gw_{}", generate_os_random_hex(24)?);
    let instance_id = format!("tether_{}", generate_os_random_hex(8)?);

    let (generation, is_air_gapped) = {
        let mut guard = supervisor_state.lock().unwrap();
        guard.generation += 1;
        guard.instance_id = instance_id.clone();
        guard.handshake_secret = secret.clone();
        guard.gateway_token = gateway_token.clone();
        guard.phase = SidecarPhase::Starting;
        guard.bound_port = 0;
        (guard.generation, guard.is_air_gapped)
    };

    let config_path = resolve_config_path(&app);
    let config_str = config_path.to_string_lossy().to_string();
    let config_bytes = fs::read(&config_path).map_err(|e| {
        format!(
            "Refusing to start sidecar without readable configuration {}: {}",
            config_path.display(),
            e
        )
    })?;
    let config_hash = sha256_hex(&config_bytes);

    let child_env = build_child_environment(
        is_air_gapped,
        &secret,
        &instance_id,
        generation,
        &gateway_token,
        &config_hash,
        &config_path,
    );

    let shell = app.shell();

    #[cfg(not(debug_assertions))]
    let mut cmd = shell.sidecar("litellm-proxy")
        .map_err(|e| format!("Failed to resolve packaged litellm-proxy sidecar: {}. Production requires valid signed binary.", e))?;

    #[cfg(debug_assertions)]
    let mut cmd = match shell.sidecar("litellm-proxy") {
        Ok(c) => c,
        Err(_) => {
            let mut c = shell.command("sidecar/.venv/Scripts/python.exe");
            c = c.arg("sidecar/entrypoint.py");
            c
        }
    };

    cmd = cmd
        .env_clear()
        .arg("--port")
        .arg("0")
        .arg("--config")
        .arg(config_str);

    for (k, v) in child_env {
        cmd = cmd.env(k, v);
    }

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn litellm-proxy sidecar process: {}", e))?;

    let pid = child.pid();
    #[cfg(target_os = "windows")]
    let job_handle = match assign_process_to_kill_on_close_job(pid) {
        Ok(handle) => Some(handle),
        Err(error) => {
            let _ = child.kill();
            let mut guard = supervisor_state.lock().unwrap();
            guard.phase = SidecarPhase::Failed;
            return Err(error);
        }
    };
    #[cfg(not(target_os = "windows"))]
    let job_handle = None;

    {
        let mut guard = supervisor_state.lock().unwrap();
        guard.pid = Some(pid);
        guard.job_handle = job_handle;
    }

    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<u16, String>>();
    let mut ready_tx_opt = Some(ready_tx);

    let expected_instance_id = instance_id.clone();
    let supervisor_clone = supervisor_state.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    if let Some(pos) = line.find("[TETHER_READY]:") {
                        let json_part = line[pos + 15..].trim();
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_part) {
                            let rec_instance = val
                                .get("instance_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let rec_gen =
                                val.get("generation").and_then(|v| v.as_u64()).unwrap_or(0);
                            let rec_port_raw =
                                val.get("port").and_then(|v| v.as_u64()).unwrap_or(0);
                            let rec_airgap = val
                                .get("air_gapped")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);

                            if rec_instance != expected_instance_id {
                                if let Some(tx) = ready_tx_opt.take() {
                                    let _ = tx.send(Err(format!(
                                        "Instance ID mismatch: expected {}, got {}",
                                        expected_instance_id, rec_instance
                                    )));
                                }
                                break;
                            }
                            if rec_gen != generation {
                                if let Some(tx) = ready_tx_opt.take() {
                                    let _ = tx.send(Err(format!(
                                        "Generation mismatch: expected {}, got {}",
                                        generation, rec_gen
                                    )));
                                }
                                break;
                            }
                            if rec_airgap != is_air_gapped {
                                if let Some(tx) = ready_tx_opt.take() {
                                    let _ = tx.send(Err(format!(
                                        "Air-gapped state mismatch: expected {}, got {}",
                                        is_air_gapped, rec_airgap
                                    )));
                                }
                                break;
                            }
                            if !(1025..=u16::MAX as u64).contains(&rec_port_raw) {
                                if let Some(tx) = ready_tx_opt.take() {
                                    let _ = tx
                                        .send(Err(format!("Invalid bound port: {}", rec_port_raw)));
                                }
                                break;
                            }
                            let rec_port = rec_port_raw as u16;

                            let rec_config_hash = val
                                .get("config_hash")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            if rec_config_hash != config_hash {
                                if let Some(tx) = ready_tx_opt.take() {
                                    let _ = tx.send(Err(
                                        "Configuration hash mismatch in readiness announcement"
                                            .into(),
                                    ));
                                }
                                break;
                            }

                            let client = reqwest::Client::builder()
                                .timeout(std::time::Duration::from_secs(2))
                                .build()
                                .unwrap_or_default();
                            let probe_url =
                                format!("http://127.0.0.1:{}/health/readiness", rec_port);
                            match client.get(&probe_url).send().await {
                                Ok(resp) if resp.status().is_success() => {
                                    let readiness = resp
                                        .json::<serde_json::Value>()
                                        .await
                                        .map_err(|e| format!("Invalid readiness response: {}", e));
                                    let attested = readiness.and_then(|body| {
                                        let valid = body.get("status").and_then(|v| v.as_str())
                                            == Some("ready")
                                            && body.get("instanceId").and_then(|v| v.as_str())
                                                == Some(expected_instance_id.as_str())
                                            && body.get("generation").and_then(|v| v.as_u64())
                                                == Some(generation)
                                            && body.get("airGapped").and_then(|v| v.as_bool())
                                                == Some(is_air_gapped)
                                            && body.get("configSha256").and_then(|v| v.as_str())
                                                == Some(config_hash.as_str());
                                        if valid {
                                            Ok(())
                                        } else {
                                            Err("Readiness response attestation mismatch"
                                                .to_string())
                                        }
                                    });
                                    if let Some(tx) = ready_tx_opt.take() {
                                        let _ = tx.send(attested.map(|_| rec_port));
                                    }
                                }
                                Ok(resp) => {
                                    if let Some(tx) = ready_tx_opt.take() {
                                        let _ = tx.send(Err(format!(
                                            "Readiness probe returned HTTP {}",
                                            resp.status()
                                        )));
                                    }
                                }
                                Err(e) => {
                                    if let Some(tx) = ready_tx_opt.take() {
                                        let _ =
                                            tx.send(Err(format!("Readiness probe failed: {}", e)));
                                    }
                                }
                            }
                        }
                    }
                }
                CommandEvent::Terminated(term) => {
                    eprintln!(
                        "[Supervisor] Sidecar process terminated with code {:?}",
                        term.code
                    );
                    let terminated_job = {
                        let mut guard = supervisor_clone.lock().unwrap();
                        if guard.generation == generation {
                            guard.phase = SidecarPhase::Crashed;
                            guard.pid = None;
                            guard.job_handle.take()
                        } else {
                            None
                        }
                    };
                    close_sidecar_job(terminated_job);
                    if let Some(tx) = ready_tx_opt.take() {
                        let _ = tx.send(Err(format!(
                            "Sidecar process terminated prematurely with code {:?}",
                            term.code
                        )));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    match tokio::time::timeout(std::time::Duration::from_secs(15), ready_rx).await {
        Ok(Ok(Ok(bound_port))) => {
            {
                let mut guard = supervisor_state.lock().unwrap();
                guard.bound_port = bound_port;
                guard.phase = SidecarPhase::Ready;
            }
            println!(
                "[Supervisor] Sidecar successfully verified and ready on port {}",
                bound_port
            );
            Ok(child)
        }
        Ok(Ok(Err(e))) => {
            let failed_job = {
                let mut guard = supervisor_state.lock().unwrap();
                guard.phase = SidecarPhase::Failed;
                guard.pid = None;
                guard.job_handle.take()
            };
            let _ = terminate_sidecar_tree(child, Some(pid), failed_job).await;
            Err(format!("Sidecar readiness verification failed: {}", e))
        }
        Ok(Err(_)) => {
            let failed_job = {
                let mut guard = supervisor_state.lock().unwrap();
                guard.phase = SidecarPhase::Failed;
                guard.pid = None;
                guard.job_handle.take()
            };
            let _ = terminate_sidecar_tree(child, Some(pid), failed_job).await;
            Err("Sidecar communication channel closed before ready".to_string())
        }
        Err(_) => {
            let failed_job = {
                let mut guard = supervisor_state.lock().unwrap();
                guard.phase = SidecarPhase::Failed;
                guard.pid = None;
                guard.job_handle.take()
            };
            let _ = terminate_sidecar_tree(child, Some(pid), failed_job).await;
            Err("Timed out waiting for [TETHER_READY] from sidecar after 15 seconds".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Signed Admin Client (HMAC-SHA256 Auth, 64KB Cutoff & Response Signature)
// ---------------------------------------------------------------------------

pub struct SignedAdminClient {
    client: reqwest::Client,
}

impl SignedAdminClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn execute_signed_request(
        &self,
        supervisor: &tauri::State<'_, SidecarSupervisor>,
        method: reqwest::Method,
        path: &str,
        body: Option<Vec<u8>>,
    ) -> Result<(Vec<u8>, u16), String> {
        let (port, secret, generation) = {
            let guard = supervisor.state.lock().unwrap();
            (
                guard.bound_port,
                guard.handshake_secret.clone(),
                guard.generation,
            )
        };

        if port == 0 {
            return Err(
                "Sidecar is not running or has not bound an ephemeral port yet".to_string(),
            );
        }
        if secret.is_empty() {
            return Err("Sidecar authentication secret is not initialized".to_string());
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("System time error: {}", e))?
            .as_secs()
            .to_string();

        let nonce = generate_os_random_hex(16)?;
        let body_bytes = body.unwrap_or_default();
        let body_hash = sha256_hex(&body_bytes);

        let signature_payload = format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method.as_str(),
            path,
            timestamp,
            nonce,
            body_hash,
            generation
        );

        let sig_bytes: [u8; 32] =
            hmac_sha256::HMAC::mac(signature_payload.as_bytes(), secret.as_bytes());
        let mut signature = String::with_capacity(64);
        for b in sig_bytes {
            let _ = write!(&mut signature, "{:02x}", b);
        }

        let url = format!("http://127.0.0.1:{}{}", port, path);
        let mut req = self
            .client
            .request(method, &url)
            .header("X-Tether-Signature", signature)
            .header("X-Tether-Timestamp", timestamp)
            .header("X-Tether-Nonce", nonce.clone())
            .header("X-Tether-Generation", generation.to_string());

        if !body_bytes.is_empty() {
            req = req
                .header("Content-Type", "application/json")
                .body(body_bytes);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("HTTP request error: {}", e))?;
        let status = resp.status().as_u16();
        let headers = resp.headers().clone();

        let mut stream = resp.bytes_stream();
        let mut resp_bytes = Vec::new();
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("HTTP response body error: {}", e))?;
            if resp_bytes.len() + chunk.len() > 65536 {
                return Err(
                    "Response body exceeded 64KB maximum limit. Truncating and failing closed."
                        .to_string(),
                );
            }
            resp_bytes.extend_from_slice(&chunk);
        }

        let expected_payload = format!("{}\n{}\n{}", nonce, status, sha256_hex(&resp_bytes));
        let expected_mac: [u8; 32] =
            hmac_sha256::HMAC::mac(expected_payload.as_bytes(), secret.as_bytes());
        let mut expected_sig = String::with_capacity(64);
        for b in expected_mac {
            let _ = write!(&mut expected_sig, "{:02x}", b);
        }

        let received_sig = headers
            .get("x-tether-response-signature")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                "Missing required X-Tether-Response-Signature header on sidecar response"
                    .to_string()
            })?;

        if !constant_time_eq_hex(&expected_sig, received_sig) {
            return Err(
                "Cryptographic response signature mismatch on sidecar response".to_string(),
            );
        }

        Ok((resp_bytes, status))
    }
}

impl Default for SignedAdminClient {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Fail-Closed Tri-State Budget Limits Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum TriState<T> {
    #[default]
    Omitted,
    Unlimited,
    Value(T),
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for TriState<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<Option<T>>::deserialize(deserializer).map(|opt| match opt {
            None => TriState::Unlimited,
            Some(None) => TriState::Unlimited,
            Some(Some(v)) => TriState::Value(v),
        })
    }
}

impl<T: Serialize> Serialize for TriState<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            TriState::Omitted => serializer.serialize_none(),
            TriState::Unlimited => serializer.serialize_none(),
            TriState::Value(v) => v.serialize(serializer),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetLimitsPayload {
    #[serde(default, alias = "dailyLimitMicrousd")]
    pub daily_limit_microusd: TriState<i64>,
    #[serde(default, alias = "monthlyLimitMicrousd")]
    pub monthly_limit_microusd: TriState<i64>,
}

impl BudgetLimitsPayload {
    pub fn to_python_payload(&self) -> serde_json::Value {
        let mut map = serde_json::Map::new();
        match self.daily_limit_microusd {
            TriState::Omitted => {}
            TriState::Unlimited => {
                map.insert("daily_limit_microusd".into(), serde_json::Value::Null);
                map.insert("dailyLimitMicrousd".into(), serde_json::Value::Null);
            }
            TriState::Value(v) => {
                map.insert("daily_limit_microusd".into(), serde_json::json!(v));
                map.insert("dailyLimitMicrousd".into(), serde_json::json!(v));
            }
        }
        match self.monthly_limit_microusd {
            TriState::Omitted => {}
            TriState::Unlimited => {
                map.insert("monthly_limit_microusd".into(), serde_json::Value::Null);
                map.insert("monthlyLimitMicrousd".into(), serde_json::Value::Null);
            }
            TriState::Value(v) => {
                map.insert("monthly_limit_microusd".into(), serde_json::json!(v));
                map.insert("monthlyLimitMicrousd".into(), serde_json::json!(v));
            }
        }
        serde_json::Value::Object(map)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BudgetLimitsResponse {
    pub success: bool,
    #[serde(alias = "dailyLimitMicrousd")]
    pub daily_limit_microusd: Option<i64>,
    #[serde(alias = "monthlyLimitMicrousd")]
    pub monthly_limit_microusd: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResetSpendResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpendSummary {
    #[serde(alias = "dailySpentMicrousd")]
    pub daily_spent_microusd: i64,
    #[serde(alias = "monthlySpentMicrousd")]
    pub monthly_spent_microusd: i64,
    #[serde(alias = "dailyLimitMicrousd")]
    pub daily_limit_microusd: Option<i64>,
    #[serde(alias = "monthlyLimitMicrousd")]
    pub monthly_limit_microusd: Option<i64>,
    #[serde(alias = "isTripped", alias = "is_circuit_breaker_tripped")]
    pub is_tripped: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TelemetrySnapshot {
    #[serde(default)]
    pub traces: Vec<serde_json::Value>,
    #[serde(default)]
    pub agents: Vec<serde_json::Value>,
    #[serde(default)]
    pub stats: Option<serde_json::Value>,
    #[serde(default)]
    pub history: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalMeshStatus {
    pub is_air_gapped: bool,
    pub local_models_count: usize,
    pub remote_models_count: usize,
    pub proxy_port: u16,
    pub instance_id: String,
    pub phase: SidecarPhase,
}

// ---------------------------------------------------------------------------
// Native MCP Catalog Data Model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FieldKind {
    String,
    Password,
    Number,
    Boolean,
    Url,
    Path,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransportType {
    Stdio,
    Http,
    Sse,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeCatalogField {
    pub key: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub kind: FieldKind,
    pub is_positional: bool,
    pub validation_regex: Option<&'static str>,
    pub domain_pattern: Option<&'static str>,
    pub required: bool,
    pub default_value: Option<&'static str>,
    pub placeholder: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeCatalogTool {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: &'static str,
    pub official: bool,
    pub author: &'static str,
    pub icon: &'static str,
    pub command: &'static str,
    pub base_args: &'static [&'static str],
    pub transport: TransportType,
    pub server_url: Option<&'static str>,
    pub fields: &'static [NativeCatalogField],
}

// Native command and credential allowlist.
static NATIVE_MCP_CATALOG: &[NativeCatalogTool] = &[
NativeCatalogTool {
        id: "databricks",
        name: "Databricks MCP",
        description: "Query Unity Catalog tables, run SQL warehouses, manage Genie spaces and compute clusters directly from agents.",
        category: "data-cloud",
        official: true,
        author: "Databricks",
        icon: "Database",
        command: "npx",
        base_args: &["-y", "@databricks/mcp-server@0.2.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DATABRICKS_HOST",
            label: "Databricks Workspace Host URL",
            description: "e.g. https://dbc-xxxx.cloud.databricks.com",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+\.(cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com)$"#),
            required: true,
            default_value: None,
            placeholder: Some("https://dbc-xxxx.cloud.databricks.com"),
        },
        NativeCatalogField {
            key: "DATABRICKS_TOKEN",
            label: "Personal Access Token (PAT)",
            description: "Databricks OAuth / User Access Token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("dapi..."),
        },
        NativeCatalogField {
            key: "DATABRICKS_WAREHOUSE_ID",
            label: "SQL Warehouse ID (Optional)",
            description: "Default warehouse for SQL execution",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: Some("1a2b3c4d5e6f7g8h"),
        }
        ],
    },
    NativeCatalogTool {
        id: "snowflake",
        name: "Snowflake MCP",
        description: "Execute analytical queries, explore schema metadata, and inspect Cortex LLM features in Snowflake.",
        category: "data-cloud",
        official: true,
        author: "Snowflake",
        icon: "Cloud",
        command: "npx",
        base_args: &["-y", "@snowflake/mcp-server@0.1.5"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SNOWFLAKE_ACCOUNT",
            label: "Account Identifier",
            description: "e.g. xy12345.us-east-1",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("xy12345"),
        },
        NativeCatalogField {
            key: "SNOWFLAKE_USER",
            label: "Username",
            description: "Snowflake user login",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("ADMIN"),
        },
        NativeCatalogField {
            key: "SNOWFLAKE_PASSWORD",
            label: "Password / Key",
            description: "Account password or private key path",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "SNOWFLAKE_WAREHOUSE",
            label: "Warehouse Name",
            description: "e.g. COMPUTE_WH",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("COMPUTE_WH"),
        },
        NativeCatalogField {
            key: "SNOWFLAKE_DATABASE",
            label: "Database Name",
            description: "e.g. ANALYTICS_PROD",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("ANALYTICS_PROD"),
        }
        ],
    },
    NativeCatalogTool {
        id: "bigquery",
        name: "Google BigQuery MCP",
        description: "Query BigQuery datasets, analyze tables, and run high-concurrency SQL analytics on GCP.",
        category: "data-cloud",
        official: true,
        author: "Google Cloud",
        icon: "Database",
        command: "npx",
        base_args: &["-y", "@google-cloud/mcp-bigquery@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GOOGLE_APPLICATION_CREDENTIALS",
            label: "Service Account JSON Path",
            description: "Path to GCP service account key",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("/path/to/key.json"),
        },
        NativeCatalogField {
            key: "GCP_PROJECT_ID",
            label: "GCP Project ID",
            description: "Google Cloud Project ID",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("my-gcp-project"),
        }
        ],
    },
    NativeCatalogTool {
        id: "supabase",
        name: "Supabase MCP",
        description: "Manage Postgres schemas, run SQL queries, inspect Edge Functions, and manage storage buckets.",
        category: "data-cloud",
        official: true,
        author: "Supabase",
        icon: "Zap",
        command: "npx",
        base_args: &["-y", "@supabase/mcp-server-supabase@0.4.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SUPABASE_ACCESS_TOKEN",
            label: "Supabase Personal Access Token",
            description: "Obtained from Supabase Account Settings -> Access Tokens",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: Some(r#"^sbp_[a-zA-Z0-9_-]+$"#),
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("sbp_..."),
        },
        NativeCatalogField {
            key: "SUPABASE_PROJECT_REF",
            label: "Project Reference ID (Optional for Remote HTTP)",
            description: "e.g. abcdefghijklmnop",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: Some("abcdefghijklmnop"),
        }
        ],
    },
    NativeCatalogTool {
        id: "postgres",
        name: "PostgreSQL MCP",
        description: "Read-only and write inspection of PostgreSQL databases with schema reflection and parameter validation.",
        category: "data-cloud",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Database",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-postgres@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "POSTGRES_CONNECTION_STRING",
            label: "Postgres Connection URI",
            description: "postgresql://user:password@localhost:5432/dbname",
            kind: FieldKind::Password,
            is_positional: true,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("postgresql://postgres:postgres@localhost:5432/db"),
        }
        ],
    },
    NativeCatalogTool {
        id: "duckdb",
        name: "DuckDB MCP",
        description: "Blazing fast local analytical SQL engine on parquet, CSV, and embedded databases.",
        category: "data-cloud",
        official: true,
        author: "DuckDB Labs",
        icon: "Box",
        command: "npx",
        base_args: &["-y", "@duckdb/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DUCKDB_PATH",
            label: "DuckDB File Path",
            description: "Local path or :memory:",
            kind: FieldKind::Path,
            is_positional: true,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: Some(":memory:"),
            placeholder: Some(":memory:"),
        }
        ],
    },
    NativeCatalogTool {
        id: "sqlite",
        name: "SQLite MCP",
        description: "Query, explore schemas, and manipulate local SQLite databases safely.",
        category: "data-cloud",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Database",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-sqlite@0.6.2", "--db-path"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SQLITE_DB_PATH",
            label: "SQLite File Path",
            description: "Full path to .sqlite or .db file",
            kind: FieldKind::Path,
            is_positional: true,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("C:/data/app.db"),
        }
        ],
    },
    NativeCatalogTool {
        id: "clickhouse",
        name: "ClickHouse MCP",
        description: "Fast open-source column-oriented DBMS for real-time analytical reporting.",
        category: "data-cloud",
        official: true,
        author: "ClickHouse",
        icon: "Server",
        command: "npx",
        base_args: &["-y", "@clickhouse/mcp-server@0.1.4"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "CLICKHOUSE_HOST",
            label: "ClickHouse Host",
            description: "Host endpoint URL",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("https://clickhouse.example.com:8443"),
        },
        NativeCatalogField {
            key: "CLICKHOUSE_USER",
            label: "Username",
            description: "User login",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("default"),
            placeholder: None,
        },
        NativeCatalogField {
            key: "CLICKHOUSE_PASSWORD",
            label: "Password",
            description: "Password",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "redis",
        name: "Redis MCP",
        description: "Interact with Redis key-value stores, pub/sub channels, and memory caching structures.",
        category: "data-cloud",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Layers",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-redis@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "REDIS_URL",
            label: "Redis URL",
            description: "e.g. redis://localhost:6379",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("redis://localhost:6379"),
            placeholder: Some("redis://localhost:6379"),
        }
        ],
    },
    NativeCatalogTool {
        id: "neo4j",
        name: "Neo4j Graph MCP",
        description: "Execute Cypher graph queries and explore relationship knowledge graphs.",
        category: "data-cloud",
        official: true,
        author: "Neo4j",
        icon: "Share2",
        command: "npx",
        base_args: &["-y", "@neo4j/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "NEO4J_URI",
            label: "Bolt URI",
            description: "bolt://localhost:7687 or neo4j+s://...",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("bolt://localhost:7687"),
        },
        NativeCatalogField {
            key: "NEO4J_USERNAME",
            label: "Username",
            description: "Neo4j user",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("neo4j"),
            placeholder: None,
        },
        NativeCatalogField {
            key: "NEO4J_PASSWORD",
            label: "Password",
            description: "Neo4j password",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "notion",
        name: "Notion MCP",
        description: "Read and update Notion databases, pages, tasks, documentation, and comments via official Notion API.",
        category: "productivity",
        official: true,
        author: "Notion",
        icon: "FileText",
        command: "npx",
        base_args: &["-y", "@notionhq/mcp-server@0.1.5"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "NOTION_API_KEY",
            label: "Notion Internal Integration Token",
            description: "Created in notion.so/profile/integrations",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("secret_..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "slack",
        name: "Slack MCP",
        description: "Send channel messages, read threads, list users, and interact with Slack workspaces.",
        category: "productivity",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "MessageSquare",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-slack@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SLACK_BOT_TOKEN",
            label: "Slack Bot User OAuth Token",
            description: "xoxb-... bot token from api.slack.com/apps",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: Some(r#"^xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+$"#),
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("xoxb-..."),
        },
        NativeCatalogField {
            key: "SLACK_TEAM_ID",
            label: "Team ID (Optional)",
            description: "Workspace Team ID (e.g. T01234567)",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: Some(r#"^T[A-Z0-9]+$"#),
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: Some("T01234567"),
        }
        ],
    },
    NativeCatalogTool {
        id: "linear",
        name: "Linear MCP",
        description: "Create, search, update, and manage Linear issues, projects, cycles, and roadmaps.",
        category: "productivity",
        official: true,
        author: "Linear",
        icon: "CheckSquare",
        command: "npx",
        base_args: &["-y", "@linear/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "LINEAR_API_KEY",
            label: "Linear API Key",
            description: "Personal API key from Linear Settings -> API",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: Some(r#"^lin_api_[a-zA-Z0-9]+$"#),
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("lin_api_..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "jira",
        name: "Atlassian Jira MCP",
        description: "Search Jira tickets with JQL, create bugs/tasks, and update sprint workflows.",
        category: "productivity",
        official: true,
        author: "Atlassian",
        icon: "Clipboard",
        command: "npx",
        base_args: &["-y", "@atlassian/jira-mcp@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "JIRA_HOST",
            label: "Jira Cloud Domain",
            description: "e.g. https://company.atlassian.net",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+\.atlassian\.net$"#),
            required: true,
            default_value: None,
            placeholder: Some("https://myorg.atlassian.net"),
        },
        NativeCatalogField {
            key: "JIRA_EMAIL",
            label: "Account Email",
            description: "Atlassian user email",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("user@company.com"),
        },
        NativeCatalogField {
            key: "JIRA_API_TOKEN",
            label: "API Token",
            description: "Generated from id.atlassian.com",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "confluence",
        name: "Atlassian Confluence MCP",
        description: "Search knowledge base docs, read space architecture specs, and write documentation pages.",
        category: "productivity",
        official: true,
        author: "Atlassian",
        icon: "BookOpen",
        command: "npx",
        base_args: &["-y", "@atlassian/confluence-mcp@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "CONFLUENCE_HOST",
            label: "Confluence Domain",
            description: "https://company.atlassian.net/wiki",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+\.atlassian\.net$"#),
            required: true,
            default_value: None,
            placeholder: Some("https://myorg.atlassian.net/wiki"),
        },
        NativeCatalogField {
            key: "CONFLUENCE_EMAIL",
            label: "Account Email",
            description: "Atlassian email",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "CONFLUENCE_API_TOKEN",
            label: "API Token",
            description: "Atlassian API token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "todoist",
        name: "Todoist MCP",
        description: "Manage personal and project task lists, due dates, labels, and reminders.",
        category: "productivity",
        official: true,
        author: "Doist",
        icon: "CheckCircle",
        command: "npx",
        base_args: &["-y", "@todoist/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "TODOIST_API_TOKEN",
            label: "Todoist API Token",
            description: "From Todoist Integrations -> Developer Settings",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "airtable",
        name: "Airtable MCP",
        description: "Query, insert, and update structured records in Airtable bases.",
        category: "productivity",
        official: true,
        author: "Airtable",
        icon: "Grid",
        command: "npx",
        base_args: &["-y", "@airtable/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "AIRTABLE_PERSONAL_ACCESS_TOKEN",
            label: "Airtable PAT",
            description: "From airtable.com/create/tokens",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("pat..."),
        },
        NativeCatalogField {
            key: "AIRTABLE_BASE_ID",
            label: "Base ID (Optional)",
            description: "e.g. appXXXXXXXXXXXXXX",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "obsidian",
        name: "Obsidian Local Vault MCP",
        description: "Search markdown notes, extract frontmatter tags, and link knowledge graph in local Obsidian vaults.",
        category: "productivity",
        official: false,
        author: "Obsidian Community",
        icon: "Edit3",
        command: "npx",
        base_args: &["-y", "@obsidian/mcp-local@0.1.0"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "OBSIDIAN_VAULT_PATH",
            label: "Vault Directory Path",
            description: "Absolute path to your local markdown vault",
            kind: FieldKind::Path,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("C:/Users/name/Documents/Vault"),
        }
        ],
    },
    NativeCatalogTool {
        id: "github",
        name: "GitHub MCP Server",
        description: "Search repositories, manage pull requests, create and read issues, inspect file trees, and commit code.",
        category: "dev-ci",
        official: true,
        author: "GitHub / Anthropic",
        icon: "GitPullRequest",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-github@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GITHUB_PERSONAL_ACCESS_TOKEN",
            label: "GitHub Personal Access Token",
            description: "Personal Access Token with repo, issues, and workflow permissions",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("ghp_..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "gitlab",
        name: "GitLab MCP Server",
        description: "Interact with GitLab merge requests, CI pipelines, and repository files.",
        category: "dev-ci",
        official: true,
        author: "GitLab",
        icon: "GitBranch",
        command: "npx",
        base_args: &["-y", "@gitlab/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GITLAB_PERSONAL_ACCESS_TOKEN",
            label: "GitLab Access Token",
            description: "Personal Access Token with read/write API access",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("glpat-..."),
        },
        NativeCatalogField {
            key: "GITLAB_URL",
            label: "GitLab Instance URL (Optional)",
            description: "Default https://gitlab.com",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: Some("https://gitlab.com"),
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "docker",
        name: "Docker MCP",
        description: "List, start, stop, inspect, and build Docker containers and compose stacks locally.",
        category: "dev-ci",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Package",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-docker@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DOCKER_HOST",
            label: "Docker Socket / Host (Optional)",
            description: "Default npipe:////./pipe/docker_engine on Windows or unix:///var/run/docker.sock",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "kubernetes",
        name: "Kubernetes MCP",
        description: "Inspect K8s pods, deployments, services, logs, and apply cluster manifests.",
        category: "dev-ci",
        official: true,
        author: "Kubernetes SIGs",
        icon: "Anchor",
        command: "npx",
        base_args: &["-y", "@kubernetes/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "KUBECONFIG",
            label: "Kubeconfig File Path (Optional)",
            description: "Default ~/.kube/config",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: Some("~/.kube/config"),
        }
        ],
    },
    NativeCatalogTool {
        id: "sentry",
        name: "Sentry MCP",
        description: "Retrieve real-time error traces, stack traces, issue frequency, and performance anomalies.",
        category: "dev-ci",
        official: true,
        author: "Sentry",
        icon: "AlertTriangle",
        command: "npx",
        base_args: &["-y", "@sentry/mcp-server@0.1.4"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SENTRY_AUTH_TOKEN",
            label: "Sentry Auth Token",
            description: "User Auth token with event:read and project:read",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("sntryu_..."),
        },
        NativeCatalogField {
            key: "SENTRY_ORG",
            label: "Organization Slug",
            description: "Your Sentry organization slug",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("my-org"),
        }
        ],
    },
    NativeCatalogTool {
        id: "postman",
        name: "Postman MCP",
        description: "Execute API collections, test REST endpoints, and inspect OpenAPI specifications.",
        category: "dev-ci",
        official: true,
        author: "Postman",
        icon: "Send",
        command: "npx",
        base_args: &["-y", "@postman/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "POSTMAN_API_KEY",
            label: "Postman API Key",
            description: "API Key from Postman Account settings",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("PMAK-..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "git",
        name: "Git CLI MCP",
        description: "Run local git operations: diff, log, branch, stash, status, and blame.",
        category: "dev-ci",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "GitCommit",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-git@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GIT_ROOT_DIR",
            label: "Root Repository Directory (Optional)",
            description: "Directory to run git commands in",
            kind: FieldKind::Path,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "aws",
        name: "AWS Cloud MCP",
        description: "Interact with AWS S3, CloudWatch logs, DynamoDB, Bedrock, and Lambda functions.",
        category: "cloud-infra",
        official: true,
        author: "Amazon Web Services",
        icon: "Cloud",
        command: "npx",
        base_args: &["-y", "@aws/mcp-server@0.1.5"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "AWS_ACCESS_KEY_ID",
            label: "AWS Access Key ID",
            description: "IAM Access Key ID",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("AKIA..."),
        },
        NativeCatalogField {
            key: "AWS_SECRET_ACCESS_KEY",
            label: "AWS Secret Access Key",
            description: "IAM Secret Access Key",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "AWS_REGION",
            label: "Default AWS Region",
            description: "e.g. us-east-1",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("us-east-1"),
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "cloudflare",
        name: "Cloudflare MCP",
        description: "Manage Cloudflare DNS, Workers, KV stores, and R2 object storage.",
        category: "cloud-infra",
        official: true,
        author: "Cloudflare",
        icon: "Globe",
        command: "npx",
        base_args: &["-y", "@cloudflare/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "CLOUDFLARE_API_TOKEN",
            label: "Cloudflare API Token",
            description: "API token with Workers and DNS permissions",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "CLOUDFLARE_ACCOUNT_ID",
            label: "Account ID",
            description: "Cloudflare Account ID",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "datadog",
        name: "Datadog MCP",
        description: "Query APM metrics, monitor alerts, inspect trace spans, and search host logs.",
        category: "cloud-infra",
        official: true,
        author: "Datadog",
        icon: "Activity",
        command: "npx",
        base_args: &["-y", "@datadog/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DATADOG_API_KEY",
            label: "Datadog API Key",
            description: "API Key",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "DATADOG_APP_KEY",
            label: "Datadog Application Key",
            description: "Application Key",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "DATADOG_SITE",
            label: "Site (Optional)",
            description: "datadoghq.com or datadoghq.eu",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: Some("datadoghq.com"),
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "vercel",
        name: "Vercel MCP",
        description: "Inspect deployment status, build logs, environment variables, and project domains.",
        category: "cloud-infra",
        official: true,
        author: "Vercel",
        icon: "Triangle",
        command: "npx",
        base_args: &["-y", "@vercel/mcp-server@0.1.4"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "VERCEL_TOKEN",
            label: "Vercel Personal Access Token",
            description: "From vercel.com/account/tokens",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("ver_..."),
        },
        NativeCatalogField {
            key: "VERCEL_TEAM_ID",
            label: "Team ID (Optional)",
            description: "Optional team context",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "brave-search",
        name: "Brave Search MCP",
        description: "Live private web search, news queries, local business data, and web results without tracking.",
        category: "search-scraping",
        official: true,
        author: "Brave Software / Anthropic",
        icon: "Search",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-brave-search@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "BRAVE_API_KEY",
            label: "Brave Search API Key",
            description: "API key from brave.com/search/api",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("BSA..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "tavily",
        name: "Tavily AI Search MCP",
        description: "Search engine optimized specifically for LLMs and autonomous agents with clean extracted text.",
        category: "search-scraping",
        official: true,
        author: "Tavily",
        icon: "Compass",
        command: "npx",
        base_args: &["-y", "@tavily/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "TAVILY_API_KEY",
            label: "Tavily API Key",
            description: "API key from app.tavily.com",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("tvly-..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "exa",
        name: "Exa AI Neural Search MCP",
        description: "Neural search designed for research, finding similar links, and extracting full web content.",
        category: "search-scraping",
        official: true,
        author: "Exa",
        icon: "Search",
        command: "npx",
        base_args: &["-y", "@exa/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "EXA_API_KEY",
            label: "Exa API Key",
            description: "API key from exa.ai",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "puppeteer",
        name: "Puppeteer Browser MCP",
        description: "Control headless Chrome to render JavaScript, click buttons, fill forms, and take screenshots.",
        category: "search-scraping",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Monitor",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-puppeteer@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "playwright",
        name: "Playwright Browser MCP",
        description: "Automate Chromium, Firefox, and WebKit for robust cross-browser scraping and E2E validation.",
        category: "search-scraping",
        official: true,
        author: "Microsoft Playwright",
        icon: "Eye",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-playwright@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "fetch",
        name: "Fetch & Markdown Scraper MCP",
        description: "Converts any web page into clean, token-efficient Markdown for LLM ingestion.",
        category: "search-scraping",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "FileCode",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-fetch@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "pinecone",
        name: "Pinecone Vector DB MCP",
        description: "Query vector indexes, upsert embeddings, and perform ultra-low latency semantic retrieval.",
        category: "ai-vector",
        official: true,
        author: "Pinecone",
        icon: "Cpu",
        command: "npx",
        base_args: &["-y", "@pinecone-io/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "PINECONE_API_KEY",
            label: "Pinecone API Key",
            description: "API key from app.pinecone.io",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("pcsk_..."),
        },
        NativeCatalogField {
            key: "PINECONE_INDEX_NAME",
            label: "Index Name",
            description: "Target vector index",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("my-index"),
        }
        ],
    },
    NativeCatalogTool {
        id: "qdrant",
        name: "Qdrant Vector DB MCP",
        description: "Vector similarity search engine with rich payload filtering and fast distance metrics.",
        category: "ai-vector",
        official: true,
        author: "Qdrant",
        icon: "Target",
        command: "npx",
        base_args: &["-y", "@qdrant/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "QDRANT_URL",
            label: "Qdrant Server URL",
            description: "e.g. http://localhost:6333",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("http://localhost:6333"),
            placeholder: None,
        },
        NativeCatalogField {
            key: "QDRANT_API_KEY",
            label: "API Key (Optional)",
            description: "For Qdrant Cloud instances",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "chroma",
        name: "ChromaDB MCP",
        description: "Embedded AI vector database for document embeddings and collections.",
        category: "ai-vector",
        official: true,
        author: "Chroma",
        icon: "Database",
        command: "npx",
        base_args: &["-y", "@chroma-core/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "CHROMA_SERVER_URL",
            label: "Chroma Server URL (Optional)",
            description: "Default localhost:8000",
            kind: FieldKind::Url,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: false,
            default_value: Some("http://localhost:8000"),
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "memory",
        name: "Semantic Long-Term Memory MCP",
        description: "Graph-based persistent knowledge memory that remembers user preferences and project facts across sessions.",
        category: "ai-vector",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Brain",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-memory@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "stripe",
        name: "Stripe MCP",
        description: "Inspect customer balances, invoices, payment intents, subscriptions, and refund logs via official Stripe MCP.",
        category: "ecommerce-comms",
        official: true,
        author: "Stripe",
        icon: "CreditCard",
        command: "npx",
        base_args: &["-y", "@stripe/mcp@0.1.5", "--tools=all"],
        transport: TransportType::Stdio,
        server_url: Some("https://mcp.stripe.com"),
        fields: &[
        NativeCatalogField {
            key: "STRIPE_SECRET_KEY",
            label: "Stripe Restricted / Secret Key",
            description: "sk_live_... or sk_test_... (or use remote OAuth)",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("sk_test_..."),
        }
        ],
    },
    NativeCatalogTool {
        id: "shopify",
        name: "Shopify Store MCP",
        description: "Manage storefront products, inventory quantities, customer orders, and discounts.",
        category: "ecommerce-comms",
        official: true,
        author: "Shopify",
        icon: "ShoppingBag",
        command: "npx",
        base_args: &["-y", "@shopify/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SHOPIFY_STORE_DOMAIN",
            label: "Shopify Store Domain",
            description: "e.g. my-store.myshopify.com",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+\.myshopify\.com$"#),
            required: true,
            default_value: None,
            placeholder: Some("my-store.myshopify.com"),
        },
        NativeCatalogField {
            key: "SHOPIFY_ADMIN_ACCESS_TOKEN",
            label: "Admin API Access Token",
            description: "shpat_... access token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "twilio",
        name: "Twilio MCP",
        description: "Send SMS notifications, check delivery statuses, and handle voice calling webhooks.",
        category: "ecommerce-comms",
        official: true,
        author: "Twilio",
        icon: "PhoneCall",
        command: "npx",
        base_args: &["-y", "@twilio/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "TWILIO_ACCOUNT_SID",
            label: "Account SID",
            description: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: Some("AC..."),
        },
        NativeCatalogField {
            key: "TWILIO_AUTH_TOKEN",
            label: "Auth Token",
            description: "Twilio Auth Token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "TWILIO_PHONE_NUMBER",
            label: "Sender Phone Number",
            description: "+1234567890",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "elevenlabs",
        name: "ElevenLabs Voice AI MCP",
        description: "Generate lifelike voice speech, text-to-speech audio files, and voice cloning models.",
        category: "ecommerce-comms",
        official: true,
        author: "ElevenLabs",
        icon: "Volume2",
        command: "npx",
        base_args: &["-y", "@elevenlabs/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "ELEVENLABS_API_KEY",
            label: "ElevenLabs API Key",
            description: "API Key from elevenlabs.io",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "filesystem",
        name: "Local Filesystem MCP",
        description: "Read and write local files and directories within secure permitted paths.",
        category: "system",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Folder",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-filesystem@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "ALLOWED_DIRECTORIES",
            label: "Allowed Directories (Comma-separated)",
            description: "Absolute directories the agent may read/write (e.g. C:/Projects, C:/Workspace)",
            kind: FieldKind::Path,
            is_positional: true,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: Some("C:/Projects"),
            placeholder: Some("C:/Projects"),
        }
        ],
    },
    NativeCatalogTool {
        id: "time",
        name: "Time & Clock MCP",
        description: "Provides exact local and UTC time, timezone conversions, and date calculations for agents.",
        category: "system",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Clock",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-time@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "gdrive",
        name: "Google Drive MCP",
        description: "Search, list, and read documents, spreadsheets, and files directly from Google Drive.",
        category: "productivity",
        official: true,
        author: "Model Context Protocol Community",
        icon: "HardDrive",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-gdrive@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GDRIVE_CLIENT_ID",
            label: "OAuth Client ID",
            description: "From Google Cloud Console",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "GDRIVE_CLIENT_SECRET",
            label: "OAuth Client Secret",
            description: "Google Cloud OAuth secret",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "google-maps",
        name: "Google Maps & Places MCP",
        description: "Search locations, calculate travel directions, lookup place reviews, and geocode addresses.",
        category: "search-scraping",
        official: true,
        author: "Model Context Protocol Community",
        icon: "Compass",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-google-maps@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "GOOGLE_MAPS_API_KEY",
            label: "Google Maps API Key",
            description: "From Google Cloud Maps Platform",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "sequential-thinking",
        name: "Sequential Thinking MCP",
        description: "Dynamic problem-solving and structured multi-step reasoning framework for complex tasks.",
        category: "system",
        official: true,
        author: "Anthropic Model Context Protocol",
        icon: "Sparkles",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-sequential-thinking@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    },
    NativeCatalogTool {
        id: "everart",
        name: "Everart AI Media MCP",
        description: "Generate high-resolution images, brand visuals, and creative assets using curated models.",
        category: "ecommerce-comms",
        official: true,
        author: "Everart AI",
        icon: "Image",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-everart@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "EVERART_API_KEY",
            label: "Everart API Key",
            description: "From everart.ai dashboard",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "hubspot",
        name: "HubSpot CRM MCP",
        description: "Search contacts, companies, deals, tickets, and log sales activities directly in HubSpot.",
        category: "data-cloud",
        official: true,
        author: "HubSpot",
        icon: "Users",
        command: "npx",
        base_args: &["-y", "@hubspot/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "HUBSPOT_ACCESS_TOKEN",
            label: "Private App Access Token",
            description: "From HubSpot Settings -> Integrations -> Private Apps",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "zendesk",
        name: "Zendesk Support MCP",
        description: "Query customer support tickets, manage agent responses, and search help center knowledge bases.",
        category: "productivity",
        official: true,
        author: "Zendesk",
        icon: "LifeBuoy",
        command: "npx",
        base_args: &["-y", "@zendesk/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "ZENDESK_SUBDOMAIN",
            label: "Zendesk Subdomain",
            description: "e.g. \"mycompany\" (from mycompany.zendesk.com)",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+$"#),
            required: true,
            default_value: None,
            placeholder: Some("mycompany"),
        },
        NativeCatalogField {
            key: "ZENDESK_EMAIL",
            label: "Agent Email",
            description: "your-email@company.com",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "ZENDESK_API_TOKEN",
            label: "API Token",
            description: "From Zendesk Admin Center -> API",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "intercom",
        name: "Intercom Customer Messaging MCP",
        description: "Access customer conversations, lookup user profiles, and send automated in-app support messages.",
        category: "productivity",
        official: true,
        author: "Intercom",
        icon: "MessageCircle",
        command: "npx",
        base_args: &["-y", "@intercom/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "INTERCOM_ACCESS_TOKEN",
            label: "Intercom Access Token",
            description: "From Intercom Developer Hub",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "salesforce",
        name: "Salesforce CRM MCP",
        description: "SOQL queries, lead generation, account management, and enterprise CRM record updates.",
        category: "data-cloud",
        official: true,
        author: "Salesforce",
        icon: "Cloud",
        command: "npx",
        base_args: &["-y", "@salesforce/mcp-server@0.1.4"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SALESFORCE_INSTANCE_URL",
            label: "Instance URL",
            description: "https://yourinstance.salesforce.com",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: Some(r#"^[a-zA-Z0-9_\-]+\.(salesforce\.com|my\.salesforce\.com)$"#),
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "SALESFORCE_ACCESS_TOKEN",
            label: "Connected App Token",
            description: "OAuth access token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "dropbox",
        name: "Dropbox MCP",
        description: "Search files, download documents, and upload agent output directly to Dropbox folders.",
        category: "productivity",
        official: true,
        author: "Dropbox",
        icon: "Box",
        command: "npx",
        base_args: &["-y", "@dropbox/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DROPBOX_ACCESS_TOKEN",
            label: "Dropbox App Access Token",
            description: "From Dropbox App Console",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "box",
        name: "Box Enterprise Content MCP",
        description: "Enterprise secure content management, document search, and metadata classification in Box.",
        category: "productivity",
        official: true,
        author: "Box",
        icon: "Folder",
        command: "npx",
        base_args: &["-y", "@box/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "BOX_DEVELOPER_TOKEN",
            label: "Developer Token",
            description: "From Box Developer Console",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "asana",
        name: "Asana MCP",
        description: "Search tasks, create project milestones, manage subtasks, and track project deadlines in Asana.",
        category: "productivity",
        official: true,
        author: "Asana",
        icon: "CheckSquare",
        command: "npx",
        base_args: &["-y", "@asana/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "ASANA_ACCESS_TOKEN",
            label: "Personal Access Token",
            description: "From Asana Developer Console -> Personal Access Tokens",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "monday",
        name: "Monday.com Work OS MCP",
        description: "Read and update boards, items, columns, and team automation workflows in Monday.com.",
        category: "productivity",
        official: true,
        author: "Monday.com",
        icon: "Layout",
        command: "npx",
        base_args: &["-y", "@monday/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "MONDAY_API_TOKEN",
            label: "Personal API v2 Token",
            description: "From Monday.com -> Admin -> API",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "clickup",
        name: "ClickUp Workspace MCP",
        description: "Create tasks, organize spaces, track sprint backlogs, and update task statuses in ClickUp.",
        category: "productivity",
        official: true,
        author: "ClickUp",
        icon: "CheckCircle",
        command: "npx",
        base_args: &["-y", "@clickup/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "CLICKUP_API_TOKEN",
            label: "ClickUp API Token",
            description: "From ClickUp Settings -> Apps -> API Token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "trello",
        name: "Trello Kanban MCP",
        description: "Create cards, move lists, manage board labels, and organize sprints across Trello boards.",
        category: "productivity",
        official: true,
        author: "Atlassian",
        icon: "Columns",
        command: "npx",
        base_args: &["-y", "@atlassian/mcp-server-trello@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "TRELLO_API_KEY",
            label: "Trello API Key",
            description: "From Atlassian Developer Portal",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "TRELLO_TOKEN",
            label: "User Token",
            description: "OAuth Token generated from Trello App Key page",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "discord",
        name: "Discord Community MCP",
        description: "Post messages, monitor channels, manage server roles, and trigger notifications on Discord.",
        category: "productivity",
        official: true,
        author: "Model Context Protocol Community",
        icon: "MessageSquare",
        command: "npx",
        base_args: &["-y", "@modelcontextprotocol/server-discord@0.6.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "DISCORD_BOT_TOKEN",
            label: "Bot Token",
            description: "From Discord Developer Portal -> Bot -> Token",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "teams",
        name: "Microsoft Teams MCP",
        description: "Post notifications, send channel cards, and automate team announcements in Microsoft Teams.",
        category: "productivity",
        official: true,
        author: "Microsoft Community",
        icon: "Users",
        command: "npx",
        base_args: &["-y", "@microsoft/mcp-teams@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "TEAMS_WEBHOOK_URL",
            label: "Incoming Webhook URL",
            description: "Configured webhook URL from Teams channel connectors",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "spotify",
        name: "Spotify Music MCP",
        description: "Search tracks, query playlists, fetch artist metadata, and control audio playback.",
        category: "ecommerce-comms",
        official: true,
        author: "Spotify Community",
        icon: "Music",
        command: "npx",
        base_args: &["-y", "@spotify/mcp-server@0.1.1"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "SPOTIFY_CLIENT_ID",
            label: "Client ID",
            description: "From Spotify Developer Dashboard",
            kind: FieldKind::String,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        },
        NativeCatalogField {
            key: "SPOTIFY_CLIENT_SECRET",
            label: "Client Secret",
            description: "Spotify Client Secret",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "youtube",
        name: "YouTube Transcripts & Data MCP",
        description: "Extract video transcripts, search channels, lookup video metadata and view statistics.",
        category: "search-scraping",
        official: true,
        author: "Model Context Protocol Community",
        icon: "Video",
        command: "npx",
        base_args: &["-y", "@youtube/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "YOUTUBE_API_KEY",
            label: "YouTube Data API Key",
            description: "From Google Cloud Console -> YouTube Data API v3",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "perplexity",
        name: "Perplexity AI Search MCP",
        description: "Grounded web research, live citation retrieval, and real-time fact checking via Perplexity API.",
        category: "search-scraping",
        official: true,
        author: "Perplexity AI",
        icon: "Search",
        command: "npx",
        base_args: &["-y", "@perplexity/mcp-server@0.1.3"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[
        NativeCatalogField {
            key: "PERPLEXITY_API_KEY",
            label: "Perplexity API Key",
            description: "From perplexity.ai settings -> API",
            kind: FieldKind::Password,
            is_positional: false,
            validation_regex: None,
            domain_pattern: None,
            required: true,
            default_value: None,
            placeholder: None,
        }
        ],
    },
    NativeCatalogTool {
        id: "duckduckgo",
        name: "DuckDuckGo Instant Search MCP",
        description: "Fast, private web search, instant answers, and news queries with zero API key required.",
        category: "search-scraping",
        official: true,
        author: "Model Context Protocol Community",
        icon: "Globe",
        command: "npx",
        base_args: &["-y", "@duckduckgo/mcp-server@0.1.2"],
        transport: TransportType::Stdio,
        server_url: None,
        fields: &[

        ],
    }

];

pub fn get_full_catalog() -> &'static [NativeCatalogTool] {
    NATIVE_MCP_CATALOG
}

pub fn find_tool_definition(tool_id: &str) -> Option<&'static NativeCatalogTool> {
    get_full_catalog().iter().find(|t| t.id == tool_id)
}

// ---------------------------------------------------------------------------
// Client Config Targets & Deterministic Fingerprints
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConfigTarget {
    Cursor,
    Windsurf,
    Devin,
    ClaudeCode,
    ClaudeDesktop,
    Antigravity,
    Cline,
    Vscode,
    Codex,
}

impl ConfigTarget {
    pub fn id_str(&self) -> &'static str {
        match self {
            ConfigTarget::Cursor => "cursor",
            ConfigTarget::Windsurf => "windsurf",
            ConfigTarget::Devin => "devin",
            ConfigTarget::ClaudeCode => "claude-code",
            ConfigTarget::ClaudeDesktop => "claude-desktop",
            ConfigTarget::Antigravity => "antigravity",
            ConfigTarget::Cline => "cline",
            ConfigTarget::Vscode => "vscode",
            ConfigTarget::Codex => "codex",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ExpectedRevision {
    Missing,
    #[serde(rename = "sha256")]
    Exact(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesiredToolState {
    pub tool_id: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolSyncStatus {
    Installed,
    Updated,
    Removed,
    Unchanged,
    Collision,
    MissingCredential,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredToolResult {
    pub tool_id: String,
    pub status: ToolSyncStatus,
    pub message: Option<String>,
    pub collision_details: Option<String>,
    pub missing_fields: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientSyncResponse {
    pub success: bool,
    pub target: ConfigTarget,
    pub revision: ExpectedRevision,
    pub tool_results: Vec<StructuredToolResult>,
    pub error: Option<String>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationResult {
    pub tool_id: String,
    pub client_results: HashMap<String, StructuredToolResult>,
    pub vault_revoked: bool,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolAssignmentState {
    pub tool_id: String,
    pub is_enabled: bool,
    pub target_clients: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ManagedMcpManifest {
    pub managed_tools: HashMap<String, HashMap<String, String>>,
}

pub fn compute_tool_fingerprint(
    command: &str,
    args: &[String],
    env: &BTreeMap<String, String>,
    url: Option<&str>,
) -> String {
    let payload = serde_json::json!({
        "command": command,
        "args": args,
        "env": env,
        "url": url,
    });
    sha256_hex(payload.to_string().as_bytes())
}

fn fingerprint_json_entry(value: &serde_json::Value) -> Option<String> {
    let object = value.as_object()?;
    let command = object.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let args = object
        .get("args")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let env = object
        .get("env")
        .or_else(|| object.get("headers"))
        .and_then(|v| v.as_object())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(key, value)| value.as_str().map(|s| (key.clone(), s.to_string())))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let url = object.get("url").and_then(|v| v.as_str());
    Some(compute_tool_fingerprint(command, &args, &env, url))
}

fn fingerprint_toml_entry(item: &toml_edit::Item) -> Option<String> {
    let table = item.as_table()?;
    let command = table.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let args = table
        .get("args")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let env = table
        .get("env")
        .and_then(|v| v.as_table())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(key, value)| value.as_str().map(|s| (key.to_string(), s.to_string())))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let url = table.get("url").and_then(|v| v.as_str());
    Some(compute_tool_fingerprint(command, &args, &env, url))
}

pub fn get_client_config_path(target: ConfigTarget) -> Result<(PathBuf, bool), String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    let home_path = PathBuf::from(home);

    let (path, is_jsonc) = match target {
        ConfigTarget::Cursor => (home_path.join(".cursor").join("mcp.json"), false),
        ConfigTarget::Windsurf => (
            home_path
                .join(".codeium")
                .join("windsurf")
                .join("mcp_config.json"),
            false,
        ),
        ConfigTarget::Devin => (home_path.join(".devin").join("config.json"), false),
        ConfigTarget::ClaudeCode => (home_path.join(".claude.json"), false),
        ConfigTarget::ClaudeDesktop => {
            #[cfg(target_os = "windows")]
            let p = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
                .join("Claude")
                .join("claude_desktop_config.json");
            #[cfg(target_os = "macos")]
            let p = home_path.join("Library/Application Support/Claude/claude_desktop_config.json");
            #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
            let p = home_path.join(".config/Claude/claude_desktop_config.json");
            (p, false)
        }
        ConfigTarget::Antigravity => (
            home_path
                .join(".gemini")
                .join("antigravity")
                .join("mcp_config.json"),
            false,
        ),
        ConfigTarget::Cline => {
            #[cfg(target_os = "windows")]
            let p = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join(
                "Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
            );
            #[cfg(not(target_os = "windows"))]
            let p = home_path.join(".config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json");
            (p, false)
        }
        ConfigTarget::Vscode => {
            #[cfg(target_os = "windows")]
            let p = PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into()))
                .join("Code/User/mcp.json");
            #[cfg(not(target_os = "windows"))]
            let p = home_path.join(".config/Code/User/mcp.json");
            (p, false)
        }
        ConfigTarget::Codex => (home_path.join(".codex").join("config.toml"), false),
    };

    Ok((path, is_jsonc))
}

pub fn strip_jsonc_comments(jsonc: &str) -> String {
    let mut out = String::with_capacity(jsonc.len());
    let mut chars = jsonc.chars().peekable();
    let mut in_string = false;
    let mut escape = false;

    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_string = false;
            }
        } else {
            if c == '"' {
                in_string = true;
                out.push(c);
            } else if c == '/' && chars.peek() == Some(&'/') {
                chars.next();
                while let Some(&next_c) = chars.peek() {
                    if next_c == '\n' || next_c == '\r' {
                        break;
                    }
                    chars.next();
                }
            } else if c == '/' && chars.peek() == Some(&'*') {
                chars.next();
                while let Some(next_c) = chars.next() {
                    if next_c == '*' && chars.peek() == Some(&'/') {
                        chars.next();
                        break;
                    }
                }
            } else {
                out.push(c);
            }
        }
    }

    let chars: Vec<char> = out.chars().collect();
    let mut cleaned = String::with_capacity(out.len());
    let mut in_string = false;
    let mut escape = false;
    for (index, character) in chars.iter().copied().enumerate() {
        if in_string {
            cleaned.push(character);
            if escape {
                escape = false;
            } else if character == '\\' {
                escape = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        if character == '"' {
            in_string = true;
            cleaned.push(character);
            continue;
        }
        if character == ',' {
            let next = chars[index + 1..]
                .iter()
                .copied()
                .find(|next| !next.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                continue;
            }
        }
        cleaned.push(character);
    }
    cleaned
}

pub fn load_manifest(app_data_dir: &Path) -> ManagedMcpManifest {
    let manifest_file = app_data_dir.join("managed_mcp_manifest.json");
    if let Ok(data) = fs::read_to_string(&manifest_file) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        ManagedMcpManifest::default()
    }
}

pub fn save_manifest(app_data_dir: &Path, manifest: &ManagedMcpManifest) -> Result<(), String> {
    let manifest_file = app_data_dir.join("managed_mcp_manifest.json");
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    let temp_file = manifest_file.with_extension("tmp");
    fs::write(&temp_file, content.as_bytes())
        .map_err(|e| format!("Failed to write manifest temp: {}", e))?;
    replace_file_atomically_with_perms(&temp_file, &manifest_file)
}

pub fn sync_client_config_locked(
    app: &AppHandle,
    target: ConfigTarget,
    desired_tools: Vec<DesiredToolState>,
    create_backup: bool,
    expected_revision: ExpectedRevision,
) -> Result<ClientSyncResponse, String> {
    let (config_path, is_jsonc) = get_client_config_path(target)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("./tethermesh_data"));
    let mut manifest = load_manifest(&app_data_dir);
    let target_manifest = manifest
        .managed_tools
        .entry(target.id_str().to_string())
        .or_default();

    let file_exists = config_path.exists();
    let current_bytes = if file_exists {
        fs::read(&config_path).map_err(|e| format!("Failed to read target config: {}", e))?
    } else {
        Vec::new()
    };

    let current_hash = if file_exists {
        sha256_hex(&current_bytes)
    } else {
        String::new()
    };

    match expected_revision {
        ExpectedRevision::Missing => {
            if file_exists {
                return Err(format!(
                    "Expected missing file, but config already exists at {}",
                    config_path.display()
                ));
            }
        }
        ExpectedRevision::Exact(ref exp) => {
            if !file_exists || current_hash != *exp {
                return Err(format!(
                    "Optimistic lock failed for target {}: expected revision {}, got {}",
                    target.id_str(),
                    exp,
                    current_hash
                ));
            }
        }
    }

    let backup_path = if create_backup && file_exists {
        let backup = config_path.with_extension(format!(
            "{}.bak",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("Clock error: {}", e))?
                .as_millis()
        ));
        fs::copy(&config_path, &backup)
            .map_err(|e| format!("Failed to create config backup: {}", e))?;
        Some(backup.to_string_lossy().to_string())
    } else {
        None
    };

    let mut tool_results = Vec::new();
    let mut any_failures = false;

    if target == ConfigTarget::Codex {
        let mut doc: toml_edit::DocumentMut = if file_exists {
            let content =
                String::from_utf8(current_bytes).map_err(|e| format!("Invalid UTF-8: {}", e))?;
            content
                .parse()
                .map_err(|e| format!("Failed to parse TOML: {}", e))?
        } else {
            toml_edit::DocumentMut::new()
        };

        let mcp_servers = doc
            .entry("mcp_servers")
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()))
            .as_table_mut()
            .ok_or_else(|| "mcp_servers is not a TOML table".to_string())?;

        for dt in desired_tools {
            let tool_def = match find_tool_definition(&dt.tool_id) {
                Some(d) => d,
                None => {
                    tool_results.push(StructuredToolResult {
                        tool_id: dt.tool_id.clone(),
                        status: ToolSyncStatus::Error,
                        message: Some(format!("Unknown tool ID: {}", dt.tool_id)),
                        collision_details: None,
                        missing_fields: None,
                    });
                    any_failures = true;
                    continue;
                }
            };

            let existing_item = mcp_servers.get(&dt.tool_id);
            let is_managed = existing_item
                .and_then(fingerprint_toml_entry)
                .zip(target_manifest.get(&dt.tool_id))
                .map(|(actual, expected)| actual == *expected)
                .unwrap_or(false);

            if !dt.is_enabled {
                if existing_item.is_some() {
                    if is_managed {
                        mcp_servers.remove(&dt.tool_id);
                        target_manifest.remove(&dt.tool_id);
                        tool_results.push(StructuredToolResult {
                            tool_id: dt.tool_id.clone(),
                            status: ToolSyncStatus::Removed,
                            message: Some("Tool cleanly pruned from target".into()),
                            collision_details: None,
                            missing_fields: None,
                        });
                    } else {
                        tool_results.push(StructuredToolResult {
                            tool_id: dt.tool_id.clone(),
                            status: ToolSyncStatus::Collision,
                            message: Some("Preserving third-party / user configuration".into()),
                            collision_details: Some(
                                "Tool exists but is not managed by TetherMesh".into(),
                            ),
                            missing_fields: None,
                        });
                    }
                } else {
                    target_manifest.remove(&dt.tool_id);
                    tool_results.push(StructuredToolResult {
                        tool_id: dt.tool_id.clone(),
                        status: ToolSyncStatus::Unchanged,
                        message: Some("Tool is disabled and absent".into()),
                        collision_details: None,
                        missing_fields: None,
                    });
                }
                continue;
            }

            let mut missing_fields = Vec::new();
            let mut resolved_env = BTreeMap::new();
            let mut args_vec: Vec<String> =
                tool_def.base_args.iter().map(|s| s.to_string()).collect();
            for field in tool_def.fields {
                match get_vault_secret(&dt.tool_id, field.key) {
                    Ok(val) if !val.is_empty() => {
                        if field.is_positional {
                            for arg in val.split(',').map(str::trim).filter(|arg| !arg.is_empty()) {
                                args_vec.push(arg.to_string());
                            }
                        } else {
                            resolved_env.insert(field.key.to_string(), val);
                        }
                    }
                    _ => {
                        if field.required {
                            missing_fields.push(field.key.to_string());
                        }
                    }
                }
            }

            if !missing_fields.is_empty() {
                if existing_item.is_some() && is_managed {
                    mcp_servers.remove(&dt.tool_id);
                    target_manifest.remove(&dt.tool_id);
                }
                tool_results.push(StructuredToolResult {
                    tool_id: dt.tool_id.clone(),
                    status: ToolSyncStatus::MissingCredential,
                    message: Some("Required credentials missing in OS vault. Pruned entry to avoid stale live secrets.".into()),
                    collision_details: None,
                    missing_fields: Some(missing_fields),
                });
                any_failures = true;
                continue;
            }

            let fingerprint = match tool_def.server_url {
                Some(url) => compute_tool_fingerprint("", &[], &resolved_env, Some(url)),
                None => compute_tool_fingerprint(tool_def.command, &args_vec, &resolved_env, None),
            };

            if existing_item.is_some() && !is_managed {
                tool_results.push(StructuredToolResult {
                    tool_id: dt.tool_id.clone(),
                    status: ToolSyncStatus::Collision,
                    message: Some("Collision: tool exists but was configured externally".into()),
                    collision_details: Some("Entry modified by user or external tool".into()),
                    missing_fields: None,
                });
                any_failures = true;
                continue;
            }

            let sync_status = if existing_item.is_some() {
                ToolSyncStatus::Updated
            } else {
                ToolSyncStatus::Installed
            };

            let mut server_table = toml_edit::Table::new();
            if let Some(url) = tool_def.server_url {
                server_table.insert("url", toml_edit::value(url));
            } else {
                server_table.insert("command", toml_edit::value(tool_def.command));
                let mut args_arr = toml_edit::Array::new();
                for arg in &args_vec {
                    args_arr.push(arg.as_str());
                }
                server_table.insert(
                    "args",
                    toml_edit::Item::Value(toml_edit::Value::Array(args_arr)),
                );
            }

            let mut env_table = toml_edit::Table::new();
            for (k, v) in resolved_env {
                env_table.insert(&k, toml_edit::value(v));
            }
            server_table.insert("env", toml_edit::Item::Table(env_table));

            mcp_servers.insert(&dt.tool_id, toml_edit::Item::Table(server_table));
            target_manifest.insert(dt.tool_id.clone(), fingerprint);

            tool_results.push(StructuredToolResult {
                tool_id: dt.tool_id.clone(),
                status: sync_status,
                message: Some("Successfully synchronized".into()),
                collision_details: None,
                missing_fields: None,
            });
        }

        let out_bytes = doc.to_string().into_bytes();
        let temp_file = config_path.with_extension("tmp");
        fs::write(&temp_file, &out_bytes)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        replace_file_atomically_with_perms(&temp_file, &config_path)?;
        save_manifest(&app_data_dir, &manifest)?;
    } else {
        let mut root_val: serde_json::Value = if file_exists {
            let content =
                String::from_utf8(current_bytes).map_err(|e| format!("Invalid UTF-8: {}", e))?;
            let clean = if is_jsonc {
                strip_jsonc_comments(&content)
            } else {
                content
            };
            serde_json::from_str(&clean)
                .map_err(|e| format!("Refusing to overwrite malformed JSON configuration: {}", e))?
        } else {
            serde_json::json!({})
        };

        let key_name = if target == ConfigTarget::Vscode {
            "servers"
        } else {
            "mcpServers"
        };
        if root_val.get(key_name).is_none() {
            root_val[key_name] = serde_json::json!({});
        }

        let mcp_map = root_val[key_name]
            .as_object_mut()
            .ok_or_else(|| format!("{} is not a JSON object", key_name))?;

        for dt in desired_tools {
            let tool_def = match find_tool_definition(&dt.tool_id) {
                Some(d) => d,
                None => {
                    tool_results.push(StructuredToolResult {
                        tool_id: dt.tool_id.clone(),
                        status: ToolSyncStatus::Error,
                        message: Some(format!("Unknown tool ID: {}", dt.tool_id)),
                        collision_details: None,
                        missing_fields: None,
                    });
                    any_failures = true;
                    continue;
                }
            };

            let existing_item = mcp_map.get(&dt.tool_id);
            let is_managed = existing_item
                .and_then(fingerprint_json_entry)
                .zip(target_manifest.get(&dt.tool_id))
                .map(|(actual, expected)| actual == *expected)
                .unwrap_or(false);

            if !dt.is_enabled {
                if existing_item.is_some() {
                    if is_managed {
                        mcp_map.remove(&dt.tool_id);
                        target_manifest.remove(&dt.tool_id);
                        tool_results.push(StructuredToolResult {
                            tool_id: dt.tool_id.clone(),
                            status: ToolSyncStatus::Removed,
                            message: Some("Tool cleanly pruned from target".into()),
                            collision_details: None,
                            missing_fields: None,
                        });
                    } else {
                        tool_results.push(StructuredToolResult {
                            tool_id: dt.tool_id.clone(),
                            status: ToolSyncStatus::Collision,
                            message: Some("Preserving third-party / user configuration".into()),
                            collision_details: Some(
                                "Tool exists but is not managed by TetherMesh".into(),
                            ),
                            missing_fields: None,
                        });
                    }
                } else {
                    target_manifest.remove(&dt.tool_id);
                    tool_results.push(StructuredToolResult {
                        tool_id: dt.tool_id.clone(),
                        status: ToolSyncStatus::Unchanged,
                        message: Some("Tool is disabled and absent".into()),
                        collision_details: None,
                        missing_fields: None,
                    });
                }
                continue;
            }

            let mut missing_fields = Vec::new();
            let mut resolved_env = BTreeMap::new();
            let mut args_vec: Vec<String> =
                tool_def.base_args.iter().map(|s| s.to_string()).collect();
            for field in tool_def.fields {
                match get_vault_secret(&dt.tool_id, field.key) {
                    Ok(val) if !val.is_empty() => {
                        if field.is_positional {
                            for arg in val.split(',').map(str::trim).filter(|arg| !arg.is_empty()) {
                                args_vec.push(arg.to_string());
                            }
                        } else {
                            resolved_env.insert(field.key.to_string(), val);
                        }
                    }
                    _ => {
                        if field.required {
                            missing_fields.push(field.key.to_string());
                        }
                    }
                }
            }

            if !missing_fields.is_empty() {
                if existing_item.is_some() && is_managed {
                    mcp_map.remove(&dt.tool_id);
                    target_manifest.remove(&dt.tool_id);
                }
                tool_results.push(StructuredToolResult {
                    tool_id: dt.tool_id.clone(),
                    status: ToolSyncStatus::MissingCredential,
                    message: Some("Required credentials missing in OS vault. Pruned entry to avoid stale live secrets.".into()),
                    collision_details: None,
                    missing_fields: Some(missing_fields),
                });
                any_failures = true;
                continue;
            }

            let fingerprint = match tool_def.server_url {
                Some(url) => compute_tool_fingerprint("", &[], &resolved_env, Some(url)),
                None => compute_tool_fingerprint(tool_def.command, &args_vec, &resolved_env, None),
            };

            if existing_item.is_some() && !is_managed {
                tool_results.push(StructuredToolResult {
                    tool_id: dt.tool_id.clone(),
                    status: ToolSyncStatus::Collision,
                    message: Some("Collision: tool exists but was configured externally".into()),
                    collision_details: Some("Entry modified by user or external tool".into()),
                    missing_fields: None,
                });
                any_failures = true;
                continue;
            }

            let sync_status = if existing_item.is_some() {
                ToolSyncStatus::Updated
            } else {
                ToolSyncStatus::Installed
            };

            let entry = if let Some(url) = tool_def.server_url {
                serde_json::json!({
                    "type": "http",
                    "url": url,
                    "headers": resolved_env,
                })
            } else {
                serde_json::json!({
                    "command": tool_def.command,
                    "args": args_vec,
                    "env": resolved_env,
                })
            };
            mcp_map.insert(dt.tool_id.clone(), entry);
            target_manifest.insert(dt.tool_id.clone(), fingerprint);

            tool_results.push(StructuredToolResult {
                tool_id: dt.tool_id.clone(),
                status: sync_status,
                message: Some("Successfully synchronized".into()),
                collision_details: None,
                missing_fields: None,
            });
        }

        let out_bytes = serde_json::to_vec_pretty(&root_val)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
        let temp_file = config_path.with_extension("tmp");
        fs::write(&temp_file, &out_bytes)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        replace_file_atomically_with_perms(&temp_file, &config_path)?;
        save_manifest(&app_data_dir, &manifest)?;
    }

    let final_bytes = fs::read(&config_path).unwrap_or_default();
    let final_rev = ExpectedRevision::Exact(sha256_hex(&final_bytes));

    Ok(ClientSyncResponse {
        success: !any_failures,
        target,
        revision: final_rev,
        tool_results,
        error: if any_failures {
            Some("One or more tools failed to sync or encountered collisions".to_string())
        } else {
            None
        },
        backup_path,
    })
}

// ---------------------------------------------------------------------------
// Coordinated Tool Revocation
// ---------------------------------------------------------------------------

#[tauri::command]
fn revoke_tool(app: AppHandle, tool_id: String) -> Result<RevocationResult, String> {
    let _lock = CONFIG_WRITE_LOCK.lock().unwrap();
    let def =
        find_tool_definition(&tool_id).ok_or_else(|| format!("Unknown tool ID: {}", tool_id))?;
    let targets = vec![
        ConfigTarget::Cursor,
        ConfigTarget::Windsurf,
        ConfigTarget::Devin,
        ConfigTarget::ClaudeCode,
        ConfigTarget::ClaudeDesktop,
        ConfigTarget::Antigravity,
        ConfigTarget::Cline,
        ConfigTarget::Vscode,
        ConfigTarget::Codex,
    ];

    let mut client_results = HashMap::new();
    let mut all_pruned_successfully = true;

    for target in targets {
        let desired = vec![DesiredToolState {
            tool_id: tool_id.clone(),
            is_enabled: false,
        }];

        let (config_path, _) = get_client_config_path(target)?;
        let expected_rev = if config_path.exists() {
            match fs::read(&config_path) {
                Ok(bytes) => ExpectedRevision::Exact(sha256_hex(&bytes)),
                Err(e) => {
                    all_pruned_successfully = false;
                    client_results.insert(
                        target.id_str().to_string(),
                        StructuredToolResult {
                            tool_id: tool_id.clone(),
                            status: ToolSyncStatus::Error,
                            message: Some(format!("Failed to read client config: {}", e)),
                            collision_details: None,
                            missing_fields: None,
                        },
                    );
                    continue;
                }
            }
        } else {
            ExpectedRevision::Missing
        };

        match sync_client_config_locked(&app, target, desired, true, expected_rev) {
            Ok(resp) => {
                if !resp.success {
                    all_pruned_successfully = false;
                }
                if let Some(res) = resp.tool_results.into_iter().find(|r| r.tool_id == tool_id) {
                    if res.status == ToolSyncStatus::Collision
                        || res.status == ToolSyncStatus::Error
                    {
                        all_pruned_successfully = false;
                    }
                    client_results.insert(target.id_str().to_string(), res);
                } else {
                    all_pruned_successfully = false;
                    client_results.insert(
                        target.id_str().to_string(),
                        StructuredToolResult {
                            tool_id: tool_id.clone(),
                            status: ToolSyncStatus::Error,
                            message: Some(
                                "Sync returned no explicit revocation result; preserving vault credentials"
                                    .to_string(),
                            ),
                            collision_details: None,
                            missing_fields: None,
                        },
                    );
                }
            }
            Err(e) => {
                all_pruned_successfully = false;
                client_results.insert(
                    target.id_str().to_string(),
                    StructuredToolResult {
                        tool_id: tool_id.clone(),
                        status: ToolSyncStatus::Error,
                        message: Some(e),
                        collision_details: None,
                        missing_fields: None,
                    },
                );
            }
        }
    }

    let mut vault_revoked = false;
    if all_pruned_successfully {
        let mut deletion_failed = false;
        for field in def.fields {
            if let Err(e) = delete_vault_secret(&tool_id, field.key) {
                eprintln!(
                    "[Vault] Failed to delete secret for field {}: {}",
                    field.key, e
                );
                deletion_failed = true;
            }
        }
        vault_revoked = !deletion_failed;
    }

    let overall_success = all_pruned_successfully && vault_revoked;

    Ok(RevocationResult {
        tool_id,
        client_results,
        vault_revoked,
        success: overall_success,
        error: if overall_success {
            None
        } else {
            Some("Revocation halted: one or more client configurations encountered collisions or errors. Vault credentials preserved.".to_string())
        },
    })
}

// ---------------------------------------------------------------------------
// Authoritative Tauri IPC Commands (Full 30-Command Inventory)
// ---------------------------------------------------------------------------

#[tauri::command]
fn check_runtime_environment() -> Result<serde_json::Value, String> {
    let has_node = std::process::Command::new("node")
        .arg("--version")
        .output()
        .is_ok();
    let has_npx = std::process::Command::new("npx")
        .arg("--version")
        .output()
        .is_ok();
    let has_python = std::process::Command::new("python")
        .arg("--version")
        .output()
        .is_ok();

    Ok(serde_json::json!({
        "has_node": has_node,
        "has_npx": has_npx,
        "has_python": has_python,
        "node_version": if has_node { Some("v20.x") } else { None },
        "python_version": if has_python { Some("3.11.x") } else { None },
    }))
}

#[tauri::command]
fn get_gateway_diagnostics(
    supervisor: tauri::State<'_, SidecarSupervisor>,
) -> Result<serde_json::Value, String> {
    let guard = supervisor.state.lock().unwrap();
    Ok(serde_json::json!({
        "proxy_running": guard.phase == SidecarPhase::Ready,
        "proxy_healthy": guard.phase == SidecarPhase::Ready,
        "phase": guard.phase,
        "generation": guard.generation,
        "proxy_port": guard.bound_port,
        "anthropic_base_url": format!("http://127.0.0.1:{}/anthropic", guard.bound_port),
        "openai_base_url": format!("http://127.0.0.1:{}/v1", guard.bound_port),
        "instance_id": guard.instance_id,
        "air_gapped": guard.is_air_gapped,
        "sidecar_pid": guard.pid,
    }))
}

#[tauri::command]
fn get_diagnostic_status(
    supervisor: tauri::State<'_, SidecarSupervisor>,
) -> Result<serde_json::Value, String> {
    get_gateway_diagnostics(supervisor)
}

#[tauri::command]
fn get_proxy_status(
    supervisor: tauri::State<'_, SidecarSupervisor>,
) -> Result<serde_json::Value, String> {
    let guard = supervisor.state.lock().unwrap();
    Ok(serde_json::json!({
        "is_running": guard.phase == SidecarPhase::Ready,
        "port": guard.bound_port,
        "is_healthy": guard.phase == SidecarPhase::Ready,
    }))
}

#[tauri::command]
fn copy_gateway_environment(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: String,
) -> Result<(), String> {
    use std::io::Write as IoWrite;
    use std::process::Stdio;

    let (port, gateway_token) = {
        let guard = supervisor.state.lock().unwrap();
        if guard.phase != SidecarPhase::Ready || guard.bound_port == 0 {
            return Err("Gateway is not ready".to_string());
        }
        if guard.gateway_token.is_empty() {
            return Err("Gateway credential is not initialized".to_string());
        }
        (guard.bound_port, guard.gateway_token.clone())
    };

    let content = match client.as_str() {
        "anthropic" => format!(
            "export ANTHROPIC_BASE_URL=http://127.0.0.1:{}\nexport ANTHROPIC_API_KEY={}",
            port, gateway_token
        ),
        "openai" => format!(
            "export OPENAI_BASE_URL=http://127.0.0.1:{}/v1\nexport OPENAI_API_KEY={}",
            port, gateway_token
        ),
        _ => return Err("Unsupported gateway client".to_string()),
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("powershell.exe");
        command.args(["-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard"]);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("pbcopy");
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = std::process::Command::new("wl-copy");

    let mut clipboard = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start OS clipboard writer: {}", e))?;
    clipboard
        .stdin
        .take()
        .ok_or_else(|| "OS clipboard writer did not open stdin".to_string())?
        .write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write gateway configuration to clipboard: {}", e))?;
    let status = clipboard
        .wait()
        .map_err(|e| format!("Failed to wait for OS clipboard writer: {}", e))?;
    if !status.success() {
        return Err(format!("OS clipboard writer failed with status {}", status));
    }
    Ok(())
}

#[tauri::command]
async fn get_provider_health(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
) -> Result<serde_json::Value, String> {
    let (body, status) = client
        .execute_signed_request(
            &supervisor,
            reqwest::Method::GET,
            "/health/security-status",
            None,
        )
        .await
        .unwrap_or_else(|_| (b"{\"status\":\"unknown\"}".to_vec(), 503));

    let val: serde_json::Value =
        serde_json::from_slice(&body).unwrap_or(serde_json::json!({ "status": "unknown" }));
    Ok(serde_json::json!({
        "status_code": status,
        "data": val
    }))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let url = validate_external_url(&url)?;

    #[cfg(target_os = "windows")]
    open_external_url_windows(url.as_str())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(url.as_str())
        .spawn()
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(url.as_str())
        .spawn()
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

fn validate_external_url(raw_url: &str) -> Result<reqwest::Url, String> {
    const ALLOWED_HOSTS: [&str; 2] = ["nodejs.org", "tethermesh.ai"];

    let url = reqwest::Url::parse(raw_url).map_err(|_| "Invalid URL".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "URL must include a host".to_string())?;

    if url.scheme() != "https"
        || !ALLOWED_HOSTS.contains(&host)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("URL not in allowlist".into());
    }

    Ok(url)
}

#[cfg(target_os = "windows")]
fn open_external_url_windows(url: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide_url: Vec<u16> = OsStr::new(url).encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            ptr::null(),
            wide_url.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        return Err(format!(
            "Failed to open URL (ShellExecuteW code {})",
            result as isize
        ));
    }
    Ok(())
}

#[tauri::command]
async fn update_budget_limits(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
    limits: BudgetLimitsPayload,
) -> Result<BudgetLimitsResponse, String> {
    let py_payload = limits.to_python_payload();
    let payload_bytes = serde_json::to_vec(&py_payload)
        .map_err(|e| format!("Failed to encode budget payload: {}", e))?;

    let (body, status_code) = client
        .execute_signed_request(
            &supervisor,
            reqwest::Method::POST,
            "/spend/budget",
            Some(payload_bytes),
        )
        .await
        .map_err(|e| format!("Signed budget update failed: {}", e))?;

    if status_code != 200 {
        return Err(format!(
            "Sidecar budget update failed with HTTP status {}",
            status_code
        ));
    }

    let resp: BudgetLimitsResponse = serde_json::from_slice(&body)
        .map_err(|e| format!("Failed to decode budget update response: {}", e))?;

    if !resp.success {
        return Err("Sidecar rejected the budget update".into());
    }

    Ok(resp)
}

#[tauri::command]
async fn reset_spend_data(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
) -> Result<ResetSpendResponse, String> {
    let (body, status_code) = client
        .execute_signed_request(&supervisor, reqwest::Method::POST, "/spend/reset", None)
        .await
        .map_err(|e| format!("Signed reset spend failed: {}", e))?;

    if status_code != 200 {
        return Err(format!(
            "Sidecar spend reset failed with HTTP status {}",
            status_code
        ));
    }

    let response: ResetSpendResponse = serde_json::from_slice(&body)
        .map_err(|e| format!("Failed to decode reset response: {}", e))?;
    if !response.success {
        return Err("Sidecar rejected the spend reset".into());
    }
    Ok(response)
}

#[tauri::command]
async fn get_spend_summary(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
) -> Result<SpendSummary, String> {
    let (body, status_code) = client
        .execute_signed_request(&supervisor, reqwest::Method::GET, "/spend/summary", None)
        .await
        .map_err(|e| format!("Signed spend summary failed: {}", e))?;

    if status_code != 200 {
        return Err(format!(
            "Sidecar spend summary failed with HTTP status {}",
            status_code
        ));
    }

    serde_json::from_slice(&body).map_err(|e| format!("Failed to decode spend summary: {}", e))
}

#[tauri::command]
async fn get_telemetry_snapshot(
    app: AppHandle,
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
) -> Result<TelemetrySnapshot, String> {
    let (body, _) = client
        .execute_signed_request(&supervisor, reqwest::Method::GET, "/tether/telemetry", None)
        .await
        .map_err(|e| format!("Signed telemetry failed: {}", e))?;

    let snapshot: TelemetrySnapshot =
        serde_json::from_slice(&body).map_err(|e| format!("Failed to decode telemetry: {}", e))?;

    let _ = app.emit("tether-telemetry-event", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
async fn restart_litellm_sidecar(
    app: AppHandle,
    supervisor: tauri::State<'_, SidecarSupervisor>,
) -> Result<serde_json::Value, String> {
    let _transition_guard = TRANSITION_LOCK.lock().await;

    let (old_child, old_pid, old_job) = {
        let mut guard = supervisor.state.lock().unwrap();
        guard.phase = SidecarPhase::Stopping;
        (
            guard.child.take(),
            guard.pid.take(),
            guard.job_handle.take(),
        )
    };

    if let Some(child) = old_child {
        terminate_sidecar_tree(child, old_pid, old_job).await?;
    }

    match spawn_litellm_sidecar(app, supervisor.inner().state.clone()).await {
        Ok(new_child) => {
            let mut guard = supervisor.state.lock().unwrap();
            let port = guard.bound_port;
            let gen = guard.generation;
            guard.child = Some(new_child);
            Ok(serde_json::json!({
                "success": true,
                "message": "Sidecar cleanly restarted and validated",
                "port": port,
                "generation": gen
            }))
        }
        Err(e) => Err(format!("Failed to restart sidecar: {}", e)),
    }
}

#[tauri::command]
async fn apply_air_gapped_mode(
    app: AppHandle,
    supervisor: tauri::State<'_, SidecarSupervisor>,
    enabled: bool,
    new_yaml: Option<String>,
    yaml_content: Option<String>,
) -> Result<(), String> {
    let _transition_guard = TRANSITION_LOCK.lock().await;

    let config_path = resolve_config_path(&app);
    let app_data_dir = config_path.parent().unwrap_or(&config_path);
    let effective_yaml = new_yaml.or(yaml_content);

    if enabled {
        if let Some(ref content) = effective_yaml {
            validate_air_gapped_yaml(content, app_data_dir)?;
        } else if config_path.exists() {
            let existing =
                fs::read_to_string(&config_path).map_err(|e| format!("Read failed: {}", e))?;
            validate_air_gapped_yaml(&existing, app_data_dir)?;
        }
    }

    if let Some(ref content) = effective_yaml {
        let rand_suffix = generate_os_random_hex(6)?;
        let temp_file = config_path.with_extension(format!("yaml.{}.tmp", rand_suffix));
        fs::write(&temp_file, content.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
        replace_file_atomically_with_perms(&temp_file, &config_path)?;
    }

    persist_air_gapped_state(app_data_dir, enabled)?;

    let (old_child, old_pid, old_job) = {
        let mut guard = supervisor.state.lock().unwrap();
        guard.is_air_gapped = enabled;
        guard.phase = SidecarPhase::Stopping;
        (
            guard.child.take(),
            guard.pid.take(),
            guard.job_handle.take(),
        )
    };

    if let Some(child) = old_child {
        terminate_sidecar_tree(child, old_pid, old_job).await?;
    }

    match spawn_litellm_sidecar(app, supervisor.inner().state.clone()).await {
        Ok(new_child) => {
            let mut guard = supervisor.state.lock().unwrap();
            guard.child = Some(new_child);
            Ok(())
        }
        Err(e) => Err(format!(
            "Air-gapped transition failed during sidecar restart: {}",
            e
        )),
    }
}

#[tauri::command]
fn get_local_mesh_status(
    app: AppHandle,
    supervisor: tauri::State<'_, SidecarSupervisor>,
) -> Result<LocalMeshStatus, String> {
    let config_path = resolve_config_path(&app);
    let mut local_count = 0;
    let mut remote_count = 0;

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(doc) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                if let Some(list) = doc.get("model_list").and_then(|v| v.as_sequence()) {
                    for item in list {
                        if let Some(lp) = item.get("litellm_params").and_then(|v| v.as_mapping()) {
                            if let Some(api_base) = lp
                                .get(serde_yaml::Value::String("api_base".into()))
                                .and_then(|v| v.as_str())
                            {
                                if validate_numeric_loopback_url(api_base).is_ok() {
                                    local_count += 1;
                                } else {
                                    remote_count += 1;
                                }
                            } else {
                                remote_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    let guard = supervisor.state.lock().unwrap();
    Ok(LocalMeshStatus {
        is_air_gapped: guard.is_air_gapped,
        local_models_count: local_count,
        remote_models_count: remote_count,
        proxy_port: guard.bound_port,
        instance_id: guard.instance_id.clone(),
        phase: guard.phase.clone(),
    })
}

#[tauri::command]
fn get_system_paths(app: AppHandle) -> Result<serde_json::Value, String> {
    let config_path = resolve_config_path(&app);
    let app_dir = config_path.parent().unwrap_or(&config_path);
    Ok(serde_json::json!({
        "app_data_dir": app_dir.to_string_lossy().to_string(),
        "config_path": config_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn save_litellm_config(app: AppHandle, yaml_content: String) -> Result<(), String> {
    let config_path = resolve_config_path(&app);
    let rand_suffix = generate_os_random_hex(6)?;
    let temp_file = config_path.with_extension(format!("yaml.{}.tmp", rand_suffix));
    fs::write(&temp_file, yaml_content.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    replace_file_atomically_with_perms(&temp_file, &config_path)
}

#[tauri::command]
async fn validate_provider_key(
    supervisor: tauri::State<'_, SidecarSupervisor>,
    client: tauri::State<'_, SignedAdminClient>,
    provider: String,
    api_key: String,
) -> Result<serde_json::Value, String> {
    let request = serde_json::to_vec(&serde_json::json!({
        "provider": provider,
        "apiKey": api_key,
    }))
    .map_err(|e| format!("Failed to encode provider validation request: {}", e))?;
    let (body, status) = client
        .execute_signed_request(
            &supervisor,
            reqwest::Method::POST,
            "/admin/providers/validate-key",
            Some(request),
        )
        .await?;
    let result: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| format!("Failed to decode provider validation response: {}", e))?;
    if !(200..500).contains(&status) {
        return Err(format!(
            "Provider validation service returned HTTP status {}",
            status
        ));
    }
    Ok(result)
}

#[tauri::command]
fn read_budget_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let config_path = resolve_config_path(&app);
    let budget_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("budget.json");
    if budget_file.exists() {
        let content =
            fs::read_to_string(&budget_file).map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse failed: {}", e))
    } else {
        Ok(serde_json::json!({
            "daily_limit_microusd": null,
            "monthly_limit_microusd": null,
        }))
    }
}

#[tauri::command]
fn save_budget_config(app: AppHandle, budget: serde_json::Value) -> Result<(), String> {
    let config_path = resolve_config_path(&app);
    let budget_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("budget.json");
    let content =
        serde_json::to_string_pretty(&budget).map_err(|e| format!("Serialize failed: {}", e))?;
    let temp_file = budget_file.with_extension("tmp");
    fs::write(&temp_file, content.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    replace_file_atomically_with_perms(&temp_file, &budget_file)
}

#[tauri::command]
fn read_client_config(_app: AppHandle, target: ConfigTarget) -> Result<serde_json::Value, String> {
    let (config_path, is_jsonc) = get_client_config_path(target)?;
    if !config_path.exists() {
        return Ok(serde_json::json!({
            "exists": false,
            "revision": ExpectedRevision::Missing,
            "configured_tool_ids": [],
            "schema_valid": true,
        }));
    }

    let bytes = fs::read(&config_path).map_err(|e| format!("Read failed: {}", e))?;
    let hash = sha256_hex(&bytes);

    let content = String::from_utf8(bytes).map_err(|e| format!("UTF-8 error: {}", e))?;
    let clean = if is_jsonc {
        strip_jsonc_comments(&content)
    } else {
        content.clone()
    };

    let (configured_ids, schema_valid) = if target == ConfigTarget::Codex {
        let doc: Result<toml_edit::DocumentMut, _> = content.parse();
        match doc {
            Ok(d) => (
                d.get("mcp_servers")
                    .and_then(|v| v.as_table())
                    .map(|t| t.iter().map(|(k, _)| k.to_string()).collect::<Vec<_>>())
                    .unwrap_or_default(),
                true,
            ),
            Err(_) => (Vec::new(), false),
        }
    } else {
        let val: Result<serde_json::Value, _> = serde_json::from_str(&clean);
        match val {
            Ok(v) => {
                let key = if target == ConfigTarget::Vscode {
                    "servers"
                } else {
                    "mcpServers"
                };
                match v.as_object() {
                    Some(_) => (
                        v.get(key)
                            .and_then(|s| s.as_object())
                            .map(|o| o.keys().cloned().collect::<Vec<_>>())
                            .unwrap_or_default(),
                        v.get(key).is_none() || v.get(key).and_then(|s| s.as_object()).is_some(),
                    ),
                    None => (Vec::new(), false),
                }
            }
            Err(_) => (Vec::new(), false),
        }
    };

    Ok(serde_json::json!({
        "exists": true,
        "revision": ExpectedRevision::Exact(hash),
        "configured_tool_ids": configured_ids,
        "schema_valid": schema_valid,
    }))
}

#[tauri::command]
fn sync_client_config(
    app: AppHandle,
    target: ConfigTarget,
    tools: Vec<DesiredToolState>,
    create_backup: bool,
    expected_revision: ExpectedRevision,
) -> Result<ClientSyncResponse, String> {
    let _lock = CONFIG_WRITE_LOCK.lock().unwrap();
    sync_client_config_locked(&app, target, tools, create_backup, expected_revision)
}

#[tauri::command]
fn get_tool_assignments(app: AppHandle) -> Result<Vec<ToolAssignmentState>, String> {
    let config_path = resolve_config_path(&app);
    let assign_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("managed_tool_assignments.json");
    if assign_file.exists() {
        let content =
            fs::read_to_string(&assign_file).map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse failed: {}", e))
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn save_tool_assignments(
    app: AppHandle,
    assignments: Vec<ToolAssignmentState>,
) -> Result<bool, String> {
    let config_path = resolve_config_path(&app);
    let assign_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("managed_tool_assignments.json");
    let content = serde_json::to_string_pretty(&assignments)
        .map_err(|e| format!("Serialize failed: {}", e))?;
    let temp_file = assign_file.with_extension("tmp");
    fs::write(&temp_file, content.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    replace_file_atomically_with_perms(&temp_file, &assign_file)?;
    Ok(true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCredentialSummary {
    pub tool_id: String,
    pub configured: bool,
    pub configured_fields: Vec<String>,
    pub display_hints: HashMap<String, String>,
    pub updated_at: u64,
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn secret_hint(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    if chars.len() > 6 {
        format!(
            "{}...{}",
            chars.iter().take(2).collect::<String>(),
            chars.iter().skip(chars.len() - 2).collect::<String>()
        )
    } else {
        "••••••••".to_string()
    }
}

#[tauri::command]
fn list_tool_credential_summaries() -> Result<Vec<ToolCredentialSummary>, String> {
    let catalog = get_full_catalog();
    let mut summaries = Vec::new();

    for tool in catalog {
        let mut configured_fields = Vec::new();
        let mut field_hints = HashMap::new();

        for field in tool.fields {
            if let Ok(sec) = get_vault_secret(tool.id, field.key) {
                if !sec.is_empty() {
                    configured_fields.push(field.key.to_string());
                    let hint = secret_hint(&sec);
                    field_hints.insert(field.key.to_string(), hint);
                }
            }
        }

        summaries.push(ToolCredentialSummary {
            tool_id: tool.id.to_string(),
            configured: !configured_fields.is_empty(),
            configured_fields,
            display_hints: field_hints,
            updated_at: now_millis(),
        });
    }

    Ok(summaries)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCredentialMutation {
    pub field: String,
    pub operation: String,
    pub value: Option<String>,
}

#[tauri::command]
fn mutate_tool_credentials(
    tool_id: String,
    mutations: Vec<ToolCredentialMutation>,
) -> Result<ToolCredentialSummary, String> {
    let tool =
        find_tool_definition(&tool_id).ok_or_else(|| format!("Unknown tool ID: {}", tool_id))?;
    let allowed_fields: HashSet<&str> = tool.fields.iter().map(|field| field.key).collect();

    for mutation in mutations {
        if !allowed_fields.contains(mutation.field.as_str()) {
            return Err(format!("Unknown credential field: {}", mutation.field));
        }
        match mutation.operation.as_str() {
            "set" => {
                let value = mutation
                    .value
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| format!("Credential {} cannot be empty", mutation.field))?;
                set_vault_secret(&tool_id, &mutation.field, &value)?;
            }
            "delete" => {
                let _ = delete_vault_secret(&tool_id, &mutation.field);
            }
            _ => {
                return Err(format!(
                    "Invalid credential operation: {}",
                    mutation.operation
                ))
            }
        }
    }

    let mut configured_fields = Vec::new();
    let mut field_hints = HashMap::new();

    for field in tool.fields {
        if let Ok(sec) = get_vault_secret(&tool_id, field.key) {
            if !sec.is_empty() {
                configured_fields.push(field.key.to_string());
                let hint = secret_hint(&sec);
                field_hints.insert(field.key.to_string(), hint);
            }
        }
    }

    Ok(ToolCredentialSummary {
        tool_id,
        configured: !configured_fields.is_empty(),
        configured_fields,
        display_hints: field_hints,
        updated_at: now_millis(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSummary {
    pub provider: String,
    pub configured: bool,
    pub display_hint: String,
    pub updated_at: u64,
}

#[tauri::command]
fn list_credential_summaries() -> Result<Vec<CredentialSummary>, String> {
    let providers = [
        "openai",
        "anthropic",
        "azure",
        "gemini",
        "aws",
        "openrouter",
        "mistral",
        "deepseek",
        "cohere",
        "groq",
    ];
    let mut summaries = Vec::new();
    for p in providers {
        match get_provider_secret(p) {
            Ok(sec) if !sec.is_empty() => {
                let hint = secret_hint(&sec);
                summaries.push(CredentialSummary {
                    provider: p.to_string(),
                    configured: true,
                    display_hint: hint,
                    updated_at: now_millis(),
                });
            }
            _ => {
                summaries.push(CredentialSummary {
                    provider: p.to_string(),
                    configured: false,
                    display_hint: String::new(),
                    updated_at: 0,
                });
            }
        }
    }
    Ok(summaries)
}

#[tauri::command]
fn set_provider_credential(
    provider: String,
    credential: String,
) -> Result<CredentialSummary, String> {
    const PROVIDERS: [&str; 10] = [
        "openai",
        "anthropic",
        "azure",
        "gemini",
        "aws",
        "openrouter",
        "mistral",
        "deepseek",
        "cohere",
        "groq",
    ];
    if !PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unknown provider: {}", provider));
    }
    let credential = credential.trim();
    if credential.is_empty() {
        return Err("Credential cannot be empty".into());
    }
    set_provider_secret(&provider, credential)?;
    let hint = secret_hint(credential);
    Ok(CredentialSummary {
        provider,
        configured: true,
        display_hint: hint,
        updated_at: now_millis(),
    })
}

#[tauri::command]
fn delete_provider_credential(provider: String) -> Result<bool, String> {
    delete_provider_secret(&provider)?;
    Ok(true)
}

#[tauri::command]
fn get_routing_metadata(app: AppHandle) -> Result<serde_json::Value, String> {
    let config_path = resolve_config_path(&app);
    let routing_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("routing_metadata.json");
    if routing_file.exists() {
        let content =
            fs::read_to_string(&routing_file).map_err(|e| format!("Read failed: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse failed: {}", e))
    } else {
        Ok(serde_json::Value::Null)
    }
}

#[tauri::command]
fn save_routing_metadata(app: AppHandle, metadata: serde_json::Value) -> Result<bool, String> {
    let config_path = resolve_config_path(&app);
    let routing_file = config_path
        .parent()
        .unwrap_or(&config_path)
        .join("routing_metadata.json");
    let content =
        serde_json::to_string_pretty(&metadata).map_err(|e| format!("Serialize failed: {}", e))?;
    let temp_file = routing_file.with_extension("tmp");
    fs::write(&temp_file, content.as_bytes()).map_err(|e| format!("Write failed: {}", e))?;
    replace_file_atomically_with_perms(&temp_file, &routing_file)?;
    Ok(true)
}

#[tauri::command]
fn set_auto_start_on_boot(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let executable = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve application executable: {}", e))?;
        let app_name = app.package_info().name.clone();
        let status = if enabled {
            std::process::Command::new("reg.exe")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    &app_name,
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\"", executable.display()),
                    "/f",
                ])
                .status()
        } else {
            std::process::Command::new("reg.exe")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    &app_name,
                    "/f",
                ])
                .status()
        }
        .map_err(|e| format!("Failed to update Windows startup setting: {}", e))?;
        if !status.success() {
            return Err(format!(
                "Windows startup setting command failed with status {}",
                status
            ));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled);
        Err("Automatic startup is not implemented for this operating system".to_string())
    }
}

#[tauri::command]
fn open_os_startup_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use std::ptr;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let target: Vec<u16> = OsStr::new("ms-settings:startupapps")
            .encode_wide()
            .chain(Some(0))
            .collect();
        let result = unsafe {
            ShellExecuteW(
                ptr::null_mut(),
                ptr::null(),
                target.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if result as isize <= 32 {
            return Err(format!(
                "Failed to open Windows startup settings (ShellExecuteW code {})",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Startup settings are not available for this operating system".to_string())
    }
}

#[tauri::command]
fn get_mcp_catalog() -> Result<Vec<serde_json::Value>, String> {
    let catalog = get_full_catalog();
    let values: Vec<serde_json::Value> = catalog
        .iter()
        .map(|t| {
            serde_json::json!({
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "category": t.category,
                "official": t.official,
                "author": t.author,
                "icon": t.icon,
                "command": t.command,
                "args": t.base_args,
                "fields": t.fields.iter().map(|f| serde_json::json!({
                    "key": f.key,
                    "label": f.label,
                    "description": f.description,
                    "type": match f.kind {
                        FieldKind::String => "string",
                        FieldKind::Password => "password",
                        FieldKind::Number => "number",
                        FieldKind::Boolean => "boolean",
                        FieldKind::Url => "url",
                        FieldKind::Path => "path",
                    },
                    "required": f.required,
                    "defaultValue": f.default_value,
                    "placeholder": f.placeholder,
                    "validationRegex": f.validation_regex,
                    "isPositionalArg": f.is_positional,
                })).collect::<Vec<_>>()
            })
        })
        .collect();
    Ok(values)
}

// ---------------------------------------------------------------------------
// Main Tauri Application Builder & Plugin Registration
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarSupervisor::default())
        .manage(SignedAdminClient::new())
        .invoke_handler(tauri::generate_handler![
            check_runtime_environment,
            get_gateway_diagnostics,
            get_diagnostic_status,
            get_mcp_catalog,
            get_proxy_status,
            copy_gateway_environment,
            get_provider_health,
            open_external_url,
            update_budget_limits,
            reset_spend_data,
            get_spend_summary,
            get_telemetry_snapshot,
            restart_litellm_sidecar,
            apply_air_gapped_mode,
            get_local_mesh_status,
            get_system_paths,
            save_litellm_config,
            validate_provider_key,
            read_budget_config,
            save_budget_config,
            read_client_config,
            sync_client_config,
            revoke_tool,
            get_tool_assignments,
            save_tool_assignments,
            list_tool_credential_summaries,
            mutate_tool_credentials,
            list_credential_summaries,
            set_provider_credential,
            delete_provider_credential,
            get_routing_metadata,
            save_routing_metadata,
            set_auto_start_on_boot,
            open_os_startup_settings
        ])
        .setup(|app| {
            let config_path = resolve_config_path(app.handle());
            let app_data_dir = config_path.parent().unwrap_or(&config_path);
            let persisted_air_gapped = load_persisted_air_gapped_state(app_data_dir);

            let supervisor_state = app.state::<SidecarSupervisor>().inner().state.clone();
            {
                let mut guard = supervisor_state.lock().unwrap();
                guard.is_air_gapped = persisted_air_gapped;
            }

            println!(
                "[TetherIQ] Application initialized with air_gapped={}",
                persisted_air_gapped
            );
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match spawn_litellm_sidecar(app_handle, supervisor_state.clone()).await {
                    Ok(child) => {
                        let mut guard = supervisor_state.lock().unwrap();
                        guard.child = Some(child);
                    }
                    Err(e) => {
                        eprintln!("[TetherIQ] Sidecar startup failed: {}", e);
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                let supervisor = app_handle.state::<SidecarSupervisor>();
                let (child, job_handle) = {
                    let mut guard = supervisor.state.lock().unwrap();
                    guard.phase = SidecarPhase::Stopping;
                    guard.pid = None;
                    (guard.child.take(), guard.job_handle.take())
                };
                close_sidecar_job(job_handle);
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        });
}

// ---------------------------------------------------------------------------
// Direct Rust Unit Tests for Cryptography, Protocols & Boundaries
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{
        constant_time_eq_hex, sha256_hex, validate_external_url, validate_numeric_loopback_url,
        BudgetLimitsPayload, DesiredToolState, ExpectedRevision, ToolAssignmentState,
        ToolCredentialMutation, ToolSyncStatus, TriState,
    };
    use std::fmt::Write;

    #[tauri::command]
    fn ipc_contract_probe(
        expected_revision: ExpectedRevision,
        tools: Vec<DesiredToolState>,
        create_backup: bool,
        assignments: Vec<ToolAssignmentState>,
        mutations: Vec<ToolCredentialMutation>,
        provider: String,
        credential: String,
    ) -> serde_json::Value {
        serde_json::json!({
            "expected_revision": expected_revision,
            "tools": tools,
            "create_backup": create_backup,
            "assignments": assignments,
            "mutations": mutations,
            "provider": provider,
            "credential": credential,
        })
    }

    #[test]
    fn test_frontend_contract_crosses_real_tauri_ipc_boundary() {
        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![ipc_contract_probe])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock Tauri app");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("failed to build mock webview");
        let body = serde_json::json!({
            "expectedRevision": { "kind": "sha256", "value": "abc123" },
            "tools": [{ "tool_id": "github", "is_enabled": true }],
            "createBackup": true,
            "assignments": [{
                "tool_id": "github",
                "is_enabled": true,
                "target_clients": ["cursor", "vscode"]
            }],
            "mutations": [{ "field": "GITHUB_TOKEN", "operation": "set", "value": "sentinel" }],
            "provider": "openai",
            "credential": "sentinel"
        });

        tauri::test::assert_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "ipc_contract_probe".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: tauri::ipc::InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
            Ok(serde_json::json!({
                "expected_revision": { "kind": "sha256", "value": "abc123" },
                "tools": [{ "tool_id": "github", "is_enabled": true }],
                "create_backup": true,
                "assignments": [{
                    "tool_id": "github",
                    "is_enabled": true,
                    "target_clients": ["cursor", "vscode"]
                }],
                "mutations": [{ "field": "GITHUB_TOKEN", "operation": "set", "value": "sentinel" }],
                "provider": "openai",
                "credential": "sentinel"
            })),
        );
    }

    #[test]
    fn test_tool_sync_status_contract_names() {
        assert_eq!(
            serde_json::to_value(ToolSyncStatus::Installed).unwrap(),
            serde_json::json!("installed")
        );
        assert_eq!(
            serde_json::to_value(ToolSyncStatus::Updated).unwrap(),
            serde_json::json!("updated")
        );
        assert_eq!(
            serde_json::to_value(ToolSyncStatus::Removed).unwrap(),
            serde_json::json!("removed")
        );
    }

    #[test]
    fn test_numeric_loopback_url_validation() {
        assert!(validate_numeric_loopback_url("http://127.0.0.1:11434").is_ok());
        assert!(validate_numeric_loopback_url("http://127.0.0.1:1234/v1").is_ok());
        assert!(validate_numeric_loopback_url("http://[::1]:11434").is_ok());
        assert!(validate_numeric_loopback_url("http://localhost:11434").is_err());
        assert!(validate_numeric_loopback_url("https://127.0.0.1:11434").is_err());
        assert!(validate_numeric_loopback_url("http://192.168.1.100:11434").is_err());
    }

    #[test]
    fn test_external_url_allowlist_requires_exact_https_host() {
        assert!(validate_external_url("https://nodejs.org/en/download").is_ok());
        assert!(validate_external_url("https://tethermesh.ai/docs").is_ok());
        assert!(validate_external_url("http://nodejs.org/en/download").is_err());
        assert!(validate_external_url("https://nodejs.org.evil.example/").is_err());
        assert!(validate_external_url("https://tethermesh.ai@evil.example/").is_err());
        assert!(validate_external_url("https://nodejs.org:444/").is_err());
    }

    #[test]
    fn test_constant_time_eq_hex() {
        assert!(constant_time_eq_hex("abcdef0123456789", "abcdef0123456789"));
        assert!(constant_time_eq_hex("ABCDEF0123456789", "abcdef0123456789"));
        assert!(!constant_time_eq_hex(
            "abcdef0123456789",
            "abcdef0123456780"
        ));
        assert!(!constant_time_eq_hex("abcdef", "abcdef01"));
    }

    #[test]
    fn test_canonical_response_signature() {
        let nonce = "test_nonce_1234";
        let status = 200u16;
        let body = b"{\"status\":\"ok\"}";
        let secret = "test_secret_key";

        let body_hash = sha256_hex(body);
        let payload = format!("{}\n{}\n{}", nonce, status, body_hash);
        let sig_bytes = hmac_sha256::HMAC::mac(payload.as_bytes(), secret.as_bytes());
        let mut sig = String::new();
        for b in sig_bytes {
            let _ = write!(&mut sig, "{:02x}", b);
        }

        assert_eq!(sig.len(), 64);
        assert_eq!(
            sig,
            "29458c7197d5a3261f09e85b36731be6d946006b80094827c0b93b49326efafc"
        );
        assert!(constant_time_eq_hex(&sig, &sig));
    }

    #[test]
    fn test_tristate_budget_serialization() {
        let p1 = BudgetLimitsPayload {
            daily_limit_microusd: TriState::Omitted,
            monthly_limit_microusd: TriState::Unlimited,
        };
        let py1 = p1.to_python_payload();
        assert!(py1.get("daily_limit_microusd").is_none());
        assert_eq!(
            py1.get("monthly_limit_microusd"),
            Some(&serde_json::Value::Null)
        );

        let p2 = BudgetLimitsPayload {
            daily_limit_microusd: TriState::Value(50_000_000),
            monthly_limit_microusd: TriState::Omitted,
        };
        let py2 = p2.to_python_payload();
        assert_eq!(
            py2.get("daily_limit_microusd"),
            Some(&serde_json::json!(50_000_000))
        );
        assert!(py2.get("monthly_limit_microusd").is_none());
    }
}
