#![forbid(unsafe_code)]

use serde::Serialize;

#[derive(Serialize)]
struct ArchitectureStatus {
    phase: &'static str,
    semantic_schema_version: &'static str,
    live_evidence: bool,
    render_backend: &'static str,
}

#[tauri::command]
fn architecture_status() -> ArchitectureStatus {
    ArchitectureStatus {
        phase: "P0",
        semantic_schema_version: semantic_core::SEMANTIC_SCHEMA_VERSION,
        live_evidence: false,
        render_backend: "deferred",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![architecture_status])
        .run(tauri::generate_context!())
        .expect("failed to run Linux Observatory");
}
