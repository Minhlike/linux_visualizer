#![forbid(unsafe_code)]

use semantic_core::{
    PresentationScenario, ReplayEngine, ReplayScenario,
};
use serde::Serialize;

#[cfg(not(test))]
#[derive(Serialize)]
struct ArchitectureStatus {
    phase: &'static str,
    semantic_schema_version: &'static str,
    live_evidence: bool,
    render_backend: &'static str,
}

#[cfg(not(test))]
#[tauri::command]
fn architecture_status() -> ArchitectureStatus {
    ArchitectureStatus {
        phase: "P3",
        semantic_schema_version: semantic_core::SEMANTIC_SCHEMA_VERSION,
        live_evidence: false,
        render_backend: "webgpu_with_webgl2_fallback",
    }
}

#[derive(Serialize)]
pub struct ScenarioMetadata {
    pub id: String,
    pub title: String,
    pub command: String,
    pub caveat: String,
    pub frame_count: usize,
}

#[cfg_attr(not(test), tauri::command)]
fn get_available_scenarios() -> Result<Vec<ScenarioMetadata>, String> {
    let scenarios = ReplayScenario::all_scenarios()
        .map_err(|e| format!("failed to load scenarios: {e}"))?;
    Ok(scenarios
        .into_iter()
        .map(|s| ScenarioMetadata {
            id: s.id.clone(),
            title: s.title.clone(),
            command: if s.command.is_empty() {
                s.title.clone()
            } else {
                s.command.clone()
            },
            caveat: s.caveat.clone(),
            frame_count: s.events.len(),
        })
        .collect())
}

#[cfg_attr(not(test), tauri::command)]
fn load_scenario(scenario_id: String) -> Result<PresentationScenario, String> {
    let scenario = ReplayScenario::find_by_id(&scenario_id)
        .ok_or_else(|| format!("scenario not found: {scenario_id}"))?;
    let frames = ReplayEngine::replay(&scenario)
        .map_err(|e| format!("semantic replay rejected: {e:?}"))?;
    Ok(PresentationScenario::from_replay(&scenario, &frames))
}

#[cfg_attr(not(test), tauri::command)]
fn run_command_scenario(command: String) -> Result<PresentationScenario, String> {
    let scenario = ReplayScenario::find_by_command(&command)
        .ok_or_else(|| format!("unrecognized command: {command}"))?;
    let frames = ReplayEngine::replay(&scenario)
        .map_err(|e| format!("semantic replay rejected: {e:?}"))?;
    Ok(PresentationScenario::from_replay(&scenario, &frames))
}

#[cfg_attr(not(test), tauri::command)]
fn mock_pipe_replay() -> Result<PresentationScenario, String> {
    let scenario = ReplayScenario::embedded_cat_grep()
        .map_err(|error| format!("invalid embedded replay fixture: {error}"))?;
    let frames = ReplayEngine::replay(&scenario)
        .map_err(|error| format!("semantic replay rejected: {error:?}"))?;
    Ok(PresentationScenario::from_replay(&scenario, &frames))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            architecture_status,
            get_available_scenarios,
            load_scenario,
            run_command_scenario,
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
        assert!(presentation
            .frames
            .iter()
            .all(|frame| !frame.focus_candidates.is_empty()));
        assert!(presentation.frames[1]
            .focus_candidates
            .iter()
            .any(|id| id == "pipe:1"));
    }

    #[test]
    fn all_scenarios_can_be_loaded_through_commands() {
        let scenarios = get_available_scenarios().expect("scenarios should be listed");
        assert_eq!(scenarios.len(), 5);

        for s in scenarios {
            let loaded = load_scenario(s.id.clone()).expect("scenario must load");
            assert_eq!(loaded.scenario_id, s.id);
            assert_eq!(loaded.frames.len(), s.frame_count);

            let by_command = run_command_scenario(s.command.clone()).expect("command must match");
            assert_eq!(by_command.scenario_id, s.id);
        }
    }
}
