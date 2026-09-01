#![forbid(unsafe_code)]
//! Renderer-independent Linux semantic graph primitives.

use std::collections::HashSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod command;
mod presentation;
mod replay;

pub use command::*;
pub use presentation::*;
pub use replay::*;

pub const SEMANTIC_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct NodeId(String);

impl NodeId {
    pub fn new(value: impl Into<String>) -> Result<Self, GraphError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(GraphError::BlankNodeId);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Shell,
    Process,
    AnonymousPipe,
    PipeEndpoint,
    FileDescriptorEntry,
    OpenFileDescription,
    RegularFile,
    Terminal,
    Directory,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticNode {
    pub id: NodeId,
    pub kind: NodeKind,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RelationKind {
    ParentOf,
    HasFileDescriptor,
    RefersTo,
    ReadEndOf,
    WriteEndOf,
    ReadsFrom,
    WritesTo,
    Executes,
    WaitsFor,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct EvidenceRef {
    pub source_id: String,
    pub sequence: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ClaimConfidence {
    Observed,
    Inferred,
    Approximation,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticEdge {
    pub from: NodeId,
    pub to: NodeId,
    pub relation: RelationKind,
    pub evidence: Vec<EvidenceRef>,
    pub confidence: ClaimConfidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticGraph {
    pub schema_version: String,
    pub revision: u64,
    pub nodes: Vec<SemanticNode>,
    pub edges: Vec<SemanticEdge>,
}

impl SemanticGraph {
    pub fn empty() -> Self {
        Self {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            revision: 0,
            nodes: Vec::new(),
            edges: Vec::new(),
        }
    }

    pub fn validate(&self) -> Result<(), GraphError> {
        if self.schema_version != SEMANTIC_SCHEMA_VERSION {
            return Err(GraphError::UnsupportedSchemaVersion(
                self.schema_version.clone(),
            ));
        }

        let mut ids = HashSet::new();
        for node in &self.nodes {
            if node.label.trim().is_empty() {
                return Err(GraphError::BlankNodeLabel(node.id.clone()));
            }
            if !ids.insert(node.id.clone()) {
                return Err(GraphError::DuplicateNode(node.id.clone()));
            }
        }

        let mut edge_keys = HashSet::new();
        for edge in &self.edges {
            if edge.from == edge.to {
                return Err(GraphError::SelfEdge(edge.from.clone()));
            }
            if !ids.contains(&edge.from) {
                return Err(GraphError::MissingEndpoint(edge.from.clone()));
            }
            if !ids.contains(&edge.to) {
                return Err(GraphError::MissingEndpoint(edge.to.clone()));
            }
            if edge.evidence.is_empty() && edge.confidence == ClaimConfidence::Observed {
                return Err(GraphError::ObservedClaimWithoutEvidence);
            }
            let key = (edge.from.clone(), edge.to.clone(), edge.relation.clone());
            if !edge_keys.insert(key) {
                return Err(GraphError::DuplicateEdge {
                    from: edge.from.clone(),
                    to: edge.to.clone(),
                    relation: edge.relation.clone(),
                });
            }
        }

        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GraphError {
    BlankNodeId,
    BlankNodeLabel(NodeId),
    DuplicateEdge {
        from: NodeId,
        to: NodeId,
        relation: RelationKind,
    },
    DuplicateNode(NodeId),
    MissingEndpoint(NodeId),
    ObservedClaimWithoutEvidence,
    SelfEdge(NodeId),
    UnsupportedSchemaVersion(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, kind: NodeKind) -> SemanticNode {
        SemanticNode {
            id: NodeId::new(id).expect("valid fixture id"),
            kind,
            label: id.to_owned(),
        }
    }

    #[test]
    fn valid_pipe_relationship_is_accepted() {
        let process_id = NodeId::new("process:cat").unwrap();
        let fd_id = NodeId::new("fd:cat:1").unwrap();
        let graph = SemanticGraph {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            revision: 1,
            nodes: vec![
                node(process_id.as_str(), NodeKind::Process),
                node(fd_id.as_str(), NodeKind::FileDescriptorEntry),
            ],
            edges: vec![SemanticEdge {
                from: process_id,
                to: fd_id,
                relation: RelationKind::HasFileDescriptor,
                evidence: vec![EvidenceRef {
                    source_id: "replay:p0".to_owned(),
                    sequence: 1,
                }],
                confidence: ClaimConfidence::Inferred,
            }],
        };

        assert_eq!(graph.validate(), Ok(()));
    }

    #[test]
    fn observed_edges_require_evidence() {
        let mut graph = SemanticGraph {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            revision: 1,
            nodes: vec![
                node("process:cat", NodeKind::Process),
                node("process:grep", NodeKind::Process),
            ],
            edges: vec![SemanticEdge {
                from: NodeId::new("process:cat").unwrap(),
                to: NodeId::new("process:grep").unwrap(),
                relation: RelationKind::WritesTo,
                evidence: Vec::new(),
                confidence: ClaimConfidence::Observed,
            }],
        };

        assert_eq!(
            graph.validate(),
            Err(GraphError::ObservedClaimWithoutEvidence)
        );

        graph.edges[0].confidence = ClaimConfidence::Unknown;
        assert_eq!(graph.validate(), Ok(()));
    }
}
