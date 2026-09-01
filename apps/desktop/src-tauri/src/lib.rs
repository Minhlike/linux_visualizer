#![forbid(unsafe_code)]

use semantic_core::{ReplayEngine, ReplayScenario, ReplayStage};
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

#[derive(Serialize)]
struct ReplayPresentation {
    scenario_id: String,
    title: String,
    evidence_mode: &'static str,
    caveat: String,
    frames: Vec<ReplayFramePresentation>,
}

#[derive(Serialize)]
struct ReplayFramePresentation {
    sequence: u64,
    stage: ReplayStage,
    event_kind: &'static str,
    summary: String,
    node_count: usize,
    edge_count: usize,
}

#[tauri::command]
fn mock_pipe_replay() -> Result<ReplayPresentation, String> {
    let scenario = ReplayScenario::embedded_cat_grep()
        .map_err(|error| format!("invalid embedded replay fixture: {error}"))?;
    let frames = ReplayEngine::replay(&scenario)
        .map_err(|error| format!("semantic replay rejected: {error:?}"))?
        .into_iter()
        .map(|frame| ReplayFramePresentation {
            sequence: frame.envelope.sequence,
            stage: frame.envelope.stage,
            event_kind: frame.envelope.event.kind(),
            summary: frame.envelope.event.summary(),
            node_count: frame.graph.nodes.len(),
            edge_count: frame.graph.edges.len(),
        })
        .collect();

    Ok(ReplayPresentation {
        scenario_id: scenario.id,
        title: scenario.title,
        evidence_mode: "synthetic_replay",
        caveat: scenario.caveat,
        frames,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            architecture_status,
            mock_pipe_replay
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Linux Observatory");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_command_exposes_only_validated_replay_frames() {
        let presentation = mock_pipe_replay().expect("embedded replay must remain valid");

        assert_eq!(presentation.evidence_mode, "synthetic_replay");
        assert_eq!(presentation.frames.len(), 22);
        assert_eq!(presentation.frames.last().unwrap().sequence, 22);
    }
}
