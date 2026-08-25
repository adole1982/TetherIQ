use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

// ---------------------------------------------------------------------------
// IPC Data Structures
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub port: u16,
    pub host: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemPaths {
    pub home_dir: String,
    pub app_data_dir: String,
    pub os: String,
}

// ---------------------------------------------------------------------------
// Sidecar State — holds the child process handle for lifecycle management
// ---------------------------------------------------------------------------

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

// ---------------------------------------------------------------------------
// Tauri IPC Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_proxy_status(state: tauri::State<SidecarState>) -> ProxyStatus {
    let child = state.child.lock().unwrap();
    ProxyStatus {
        is_running: child.is_some(),
        port: 4000,
        host: "127.0.0.1".into(),
        pid: child.as_ref().map(|c| c.pid()),
    }
}

#[tauri::command]
fn get_system_paths() -> SystemPaths {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());

    let app_data = std::env::var("APPDATA")
        .unwrap_or_else(|_| format!("{}/AppData/Roaming", home));

    let os_name = if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    };

    SystemPaths {
        home_dir: home,
        app_data_dir: app_data,
        os: os_name.into(),
    }
}

#[tauri::command]
fn read_system_config_file(file_path: String) -> Result<String, String> {
    if !Path::new(&file_path).exists() {
        return Ok("{\n  \"mcpServers\": {}\n}".into());
    }
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file {}: {}", file_path, e))
}

#[tauri::command]
fn write_system_config_file(file_path: String, content: String, create_backup: bool) -> Result<String, String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
        }
    }

    if create_backup && path.exists() {
        let backup_path = format!("{}.bak", file_path);
        let _ = fs::copy(&file_path, &backup_path);
    }

    let temp_path = format!("{}.tmp.{}", file_path, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    fs::write(&temp_path, &content).map_err(|e| format!("Failed to write temp file: {}", e))?;
    fs::rename(&temp_path, &file_path).map_err(|e| format!("Failed to atomically rename file: {}", e))?;

    Ok("File written successfully".into())
}

/// Resolve the path where LiteLLM config YAML should live.
/// Uses the Tauri app data directory so it persists across sessions.
fn resolve_config_path(app: &AppHandle) -> std::path::PathBuf {
    let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".into());
        std::path::PathBuf::from(home).join(".tethermesh")
    });
    // Ensure directory exists
    let _ = fs::create_dir_all(&app_data_dir);
    app_data_dir.join("litellm_config.yaml")
}

/// Write a default LiteLLM config if none exists yet.
fn ensure_default_config(config_path: &std::path::Path) {
    if config_path.exists() {
        return;
    }
    let default_config = r#"# TetherMesh LiteLLM Configuration — Auto-generated
# Edit via the TetherMesh desktop UI (Matrix tab) or modify this file directly.

model_list:
  # --- heavy-reasoning alias ---
  - model_name: heavy-reasoning
    litellm_params:
      model: anthropic/claude-3-7-sonnet-20250219
      api_key: os.environ/ANTHROPIC_API_KEY
      timeout: 60

  - model_name: heavy-reasoning
    litellm_params:
      model: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
      aws_access_key_id: os.environ/AWS_ACCESS_KEY_ID
      aws_secret_access_key: os.environ/AWS_SECRET_ACCESS_KEY
      aws_region_name: us-east-1
      timeout: 60

  - model_name: heavy-reasoning
    litellm_params:
      model: openai/o3-mini
      api_key: os.environ/OPENAI_API_KEY
      timeout: 45

  # --- fast-code alias ---
  - model_name: fast-code
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY
      timeout: 10

  - model_name: fast-code
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY
      timeout: 15

  - model_name: fast-code
    litellm_params:
      model: ollama/qwen2.5-coder:14b
      api_base: http://localhost:11434
      timeout: 30

  # --- Standalone models ---
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4o-mini
    litellm_params:
      model: openai/gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-3-7-sonnet-20250219
    litellm_params:
      model: anthropic/claude-3-7-sonnet-20250219
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-3-5-haiku-20241022
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

router_settings:
  routing_strategy: "least-busy"
  num_retries: 2
  retry_after: 1
  cooldown_time: 30
  allowed_fails: 2
  fallbacks:
    - heavy-reasoning: ["gpt-4o", "fast-code"]
    - fast-code: ["gpt-4o-mini"]

litellm_settings:
  drop_params: true
  set_verbose: false
  request_timeout: 60
  max_budget: 10.0
  budget_duration: "1d"

general_settings:
  disable_admin_ui: true
"#;
    let _ = fs::write(config_path, default_config);
}

// ---------------------------------------------------------------------------
// Sidecar Lifecycle — spawn LiteLLM proxy on app startup, kill on shutdown
// ---------------------------------------------------------------------------

fn spawn_litellm_sidecar(app: &AppHandle) -> Option<CommandChild> {
    let config_path = resolve_config_path(app);
    ensure_default_config(&config_path);

    let config_str = config_path.to_string_lossy().to_string();
    println!("[TetherMesh] Starting LiteLLM sidecar with config: {}", config_str);

    let sidecar_cmd = match app.shell().sidecar("litellm-proxy") {
        Ok(cmd) => cmd.args([
            "--port", "4000",
            "--host", "127.0.0.1",
            "--config", &config_str,
        ]),
        Err(e) => {
            eprintln!("[TetherMesh] Failed to create sidecar command: {}", e);
            return None;
        }
    };

    match sidecar_cmd.spawn() {
        Ok((mut rx, child)) => {
            let pid = child.pid();
            println!("[TetherMesh] LiteLLM sidecar started (PID: {})", pid);

            // Stream sidecar stdout/stderr to console
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line);
                            println!("[LiteLLM]: {}", text.trim());
                        }
                        CommandEvent::Stderr(line) => {
                            let text = String::from_utf8_lossy(&line);
                            eprintln!("[LiteLLM ERR]: {}", text.trim());
                        }
                        CommandEvent::Terminated(payload) => {
                            println!(
                                "[TetherMesh] LiteLLM sidecar exited (code: {:?}, signal: {:?})",
                                payload.code, payload.signal
                            );
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Some(child)
        }
        Err(e) => {
            eprintln!("[TetherMesh] Failed to spawn LiteLLM sidecar: {}", e);
            eprintln!("[TetherMesh] The proxy will not be available. Ensure the sidecar binary exists in src-tauri/binaries/");
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Application Entry Point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let child = spawn_litellm_sidecar(&handle);

            let state = app.state::<SidecarState>();
            *state.child.lock().unwrap() = child;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_proxy_status,
            get_system_paths,
            read_system_config_file,
            write_system_config_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building TetherMesh application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Gracefully kill the sidecar when the app closes
                let state = app_handle.state::<SidecarState>();
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(child) = guard.take() {
                        println!("[TetherMesh] Shutting down LiteLLM sidecar (PID: {})...", child.pid());
                        let _ = child.kill();
                        println!("[TetherMesh] LiteLLM sidecar terminated.");
                    }
                }
            }
        });
}
