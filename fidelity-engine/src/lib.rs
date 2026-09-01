#![forbid(unsafe_code)]
//! Validation for machine-readable semantic fidelity contracts.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const CONTRACT_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceSourceKind {
    Procfs,
    Sysfs,
    Tracepoint,
    Ftrace,
    ProcessExit,
    SyntheticReplay,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ObservableEvidence {
    pub source: EvidenceSourceKind,
    pub observation: String,
    pub supports: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    Observed,
    Inferred,
    Approximation,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Confidence {
    pub level: ConfidenceLevel,
    pub rationale: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FidelityContract {
    pub schema_version: String,
    pub concept: String,
    pub linux_definition: String,
    pub observable_evidence: Vec<ObservableEvidence>,
    pub graph_semantics: Vec<String>,
    pub visual_metaphor: String,
    pub valid_interpretations: Vec<String>,
    pub forbidden_interpretations: Vec<String>,
    pub abstraction_omissions: Vec<String>,
    pub confidence: Confidence,
}

impl FidelityContract {
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.schema_version != CONTRACT_SCHEMA_VERSION {
            return Err(ContractError::UnsupportedSchemaVersion(
                self.schema_version.clone(),
            ));
        }

        require_text("concept", &self.concept)?;
        require_text("linux_definition", &self.linux_definition)?;
        require_text("visual_metaphor", &self.visual_metaphor)?;
        require_text("confidence.rationale", &self.confidence.rationale)?;
        require_list("observable_evidence", self.observable_evidence.len())?;
        require_text_list("graph_semantics", &self.graph_semantics)?;
        require_text_list("valid_interpretations", &self.valid_interpretations)?;
        require_text_list("forbidden_interpretations", &self.forbidden_interpretations)?;
        require_text_list("abstraction_omissions", &self.abstraction_omissions)?;

        for evidence in &self.observable_evidence {
            require_text("observable_evidence.observation", &evidence.observation)?;
            require_text("observable_evidence.supports", &evidence.supports)?;
        }

        Ok(())
    }
}

fn require_text(field: &'static str, value: &str) -> Result<(), ContractError> {
    if value.trim().is_empty() {
        return Err(ContractError::BlankField(field));
    }
    Ok(())
}

fn require_list(field: &'static str, length: usize) -> Result<(), ContractError> {
    if length == 0 {
        return Err(ContractError::EmptyList(field));
    }
    Ok(())
}

fn require_text_list(field: &'static str, values: &[String]) -> Result<(), ContractError> {
    require_list(field, values.len())?;
    if values.iter().any(|value| value.trim().is_empty()) {
        return Err(ContractError::BlankListItem(field));
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ContractError {
    BlankField(&'static str),
    BlankListItem(&'static str),
    EmptyList(&'static str),
    UnsupportedSchemaVersion(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_in_pipe_contract_is_complete() {
        let contract: FidelityContract =
            serde_json::from_str(include_str!("../../docs/concepts/pipe.json"))
                .expect("pipe contract must deserialize");

        assert_eq!(contract.validate(), Ok(()));
        assert!(contract.forbidden_interpretations.len() >= 3);
    }

    #[test]
    fn an_empty_forbidden_list_is_rejected() {
        let mut contract: FidelityContract =
            serde_json::from_str(include_str!("../../docs/concepts/pipe.json"))
                .expect("pipe contract must deserialize");
        contract.forbidden_interpretations.clear();

        assert_eq!(
            contract.validate(),
            Err(ContractError::EmptyList("forbidden_interpretations"))
        );
    }
}
