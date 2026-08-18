use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub port: u16,
    pub host: String,
}

#[tauri::command]
fn get_proxy_status() -> ProxyStatus {
    ProxyStatus {
        is_running: true,
        port: 4000,
        host: "127.0.0.1".into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_proxy_status])
        .run(tauri::generate_context!())
        .expect("error while running TetherIQ application");
}
