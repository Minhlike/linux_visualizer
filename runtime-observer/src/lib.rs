#![forbid(unsafe_code)]
//! Provenanced runtime evidence. Interpretation belongs in semantic-core.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct EvidenceRecord {
    pub source_id: String,
    pub source_kind: EvidenceSourceKind,
    pub source_locator: String,
    pub sequence: u64,
    pub monotonic_time_ns: u64,
    pub payload: serde_json::Value,
}

impl EvidenceRecord {
    pub fn validate(&self) -> Result<(), EvidenceError> {
        if self.source_id.trim().is_empty() {
            return Err(EvidenceError::BlankSourceId);
        }
        if self.source_locator.trim().is_empty() {
            return Err(EvidenceError::BlankSourceLocator);
        }
        if self.payload.is_null() {
            return Err(EvidenceError::NullPayload);
        }
        Ok(())
    }
}

pub trait EvidenceSource {
    fn source_id(&self) -> &str;
    fn next_record(&mut self) -> Option<EvidenceRecord>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EvidenceError {
    BlankSourceId,
    BlankSourceLocator,
    NullPayload,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evidence_requires_provenance_and_payload() {
        let record = EvidenceRecord {
            source_id: "trace:p0".to_owned(),
            source_kind: EvidenceSourceKind::SyntheticReplay,
            source_locator: "fixtures/pipe.jsonl".to_owned(),
            sequence: 0,
            monotonic_time_ns: 0,
            payload: serde_json::json!({"event": "pipe_created"}),
        };

        assert_eq!(record.validate(), Ok(()));
    }
}
