#![forbid(unsafe_code)]
//! Renderer-neutral semantic presentation contract.
//!
//! Explicitly free of visual/rendering artifacts:
//! - NO spatial coordinates (x, y, z)
//! - NO visual colors or palettes
//! - NO camera directives or angles
//! - NO animation timings or durations

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    ClaimConfidence, EvidenceRef, NodeId, NodeKind, ReplayFrame, ReplayScenario,
    ReplayStage, RelationKind, SemanticGraph,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EntityLifecycle {
    Created,
    Active,
    Executing,
    Exited { status: i32 },
    Closed,
    Destroyed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticEntityPresentation {
    pub id: String,
    pub kind: NodeKind,
    pub label: String,
    pub lifecycle: EntityLifecycle,
    pub provenance: Vec<EvidenceRef>,
    pub confidence: ClaimConfidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticRelationPresentation {
    pub from: String,
    pub to: String,
    pub relation: RelationKind,
    pub provenance: Vec<EvidenceRef>,
    pub confidence: ClaimConfidence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticDelta {
    pub added_entities: Vec<String>,
    pub removed_entities: Vec<String>,
    pub added_relations: Vec<SemanticRelationPresentation>,
    pub removed_relations: Vec<SemanticRelationPresentation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticSnapshot {
    pub revision: u64,
    pub entities: Vec<SemanticEntityPresentation>,
    pub relations: Vec<SemanticRelationPresentation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PresentationFrame {
    pub sequence: u64,
    pub stage: ReplayStage,
    pub event_kind: String,
    pub summary: String,
    pub entities: Vec<SemanticEntityPresentation>,
    pub relations: Vec<SemanticRelationPresentation>,
    pub focus_candidates: Vec<String>,
    pub evidence_provenance: Vec<EvidenceRef>,
    pub confidence: ClaimConfidence,
    pub semantic_delta: SemanticDelta,
    pub snapshot: SemanticSnapshot,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PresentationScenario {
    pub scenario_id: String,
    pub title: String,
    pub command: String,
    pub evidence_mode: String,
    pub caveat: String,
    pub frames: Vec<PresentationFrame>,
}

impl PresentationScenario {
    pub fn from_replay(
        scenario: &ReplayScenario,
        frames: &[ReplayFrame],
    ) -> Self {
        let mut presentation_frames = Vec::with_capacity(frames.len());
        let mut previous_graph = SemanticGraph::empty();
        let mut persistent_lifecycles = std::collections::HashMap::<String, EntityLifecycle>::new();
        let mut entity_provenance = std::collections::HashMap::<String, Vec<EvidenceRef>>::new();

        for frame in frames {
            let focus_candidates: Vec<String> = frame
                .envelope
                .event
                .referenced_node_ids()
                .into_iter()
                .map(|id| id.as_str().to_owned())
                .collect();

            // Update lifecycles and provenance for affected nodes in current event
            match &frame.envelope.event {
                crate::SemanticEvent::ProcessExited { process, status } => {
                    persistent_lifecycles.insert(
                        process.as_str().to_owned(),
                        EntityLifecycle::Exited { status: *status },
                    );
                }
                crate::SemanticEvent::FileDescriptorClosed { descriptor, .. } => {
                    persistent_lifecycles.insert(
                        descriptor.as_str().to_owned(),
                        EntityLifecycle::Closed,
                    );
                }
                crate::SemanticEvent::ProcessExecuted { process, .. } => {
                    // Only transition to Executing if not already exited
                    if !matches!(
                        persistent_lifecycles.get(process.as_str()),
                        Some(EntityLifecycle::Exited { .. })
                    ) {
                        persistent_lifecycles.insert(
                            process.as_str().to_owned(),
                            EntityLifecycle::Executing,
                        );
                    }
                }
                _ => {}
            }

            // Record provenance for nodes referenced in this event
            for node_id in &focus_candidates {
                entity_provenance
                    .entry(node_id.clone())
                    .or_insert_with(|| frame.envelope.evidence.clone());
            }

            // Derive lifecycle for each node in current graph
            let current_entities: Vec<SemanticEntityPresentation> = frame
                .graph
                .nodes
                .iter()
                .map(|node| {
                    let id_str = node.id.as_str();
                    let lifecycle = persistent_lifecycles
                        .get(id_str)
                        .cloned()
                        .unwrap_or(EntityLifecycle::Active);

                    let provenance = entity_provenance
                        .get(id_str)
                        .cloned()
                        .unwrap_or_else(|| frame.envelope.evidence.clone());

                    let confidence = ClaimConfidence::Inferred;

                    SemanticEntityPresentation {
                        id: id_str.to_owned(),
                        kind: node.kind.clone(),
                        label: node.label.clone(),
                        lifecycle,
                        provenance,
                        confidence,
                    }
                })
                .collect();

            let current_relations: Vec<SemanticRelationPresentation> = frame
                .graph
                .edges
                .iter()
                .map(|edge| SemanticRelationPresentation {
                    from: edge.from.as_str().to_owned(),
                    to: edge.to.as_str().to_owned(),
                    relation: edge.relation.clone(),
                    provenance: edge.evidence.clone(),
                    confidence: edge.confidence.clone(),
                })
                .collect();

            // Compute delta against previous graph
            let prev_node_ids: std::collections::HashSet<&NodeId> =
                previous_graph.nodes.iter().map(|n| &n.id).collect();
            let curr_node_ids: std::collections::HashSet<&NodeId> =
                frame.graph.nodes.iter().map(|n| &n.id).collect();

            let added_entities = curr_node_ids
                .difference(&prev_node_ids)
                .map(|id| id.as_str().to_owned())
                .collect();
            let removed_entities = prev_node_ids
                .difference(&curr_node_ids)
                .map(|id| id.as_str().to_owned())
                .collect();

            let prev_edge_keys: std::collections::HashSet<(&NodeId, &NodeId, &RelationKind)> =
                previous_graph.edges.iter().map(|e| (&e.from, &e.to, &e.relation)).collect();
            let curr_edge_keys: std::collections::HashSet<(&NodeId, &NodeId, &RelationKind)> =
                frame.graph.edges.iter().map(|e| (&e.from, &e.to, &e.relation)).collect();

            let added_relations = frame
                .graph
                .edges
                .iter()
                .filter(|e| !prev_edge_keys.contains(&(&e.from, &e.to, &e.relation)))
                .map(|e| SemanticRelationPresentation {
                    from: e.from.as_str().to_owned(),
                    to: e.to.as_str().to_owned(),
                    relation: e.relation.clone(),
                    provenance: e.evidence.clone(),
                    confidence: e.confidence.clone(),
                })
                .collect();

            let removed_relations = previous_graph
                .edges
                .iter()
                .filter(|e| !curr_edge_keys.contains(&(&e.from, &e.to, &e.relation)))
                .map(|e| SemanticRelationPresentation {
                    from: e.from.as_str().to_owned(),
                    to: e.to.as_str().to_owned(),
                    relation: e.relation.clone(),
                    provenance: e.evidence.clone(),
                    confidence: e.confidence.clone(),
                })
                .collect();

            let snapshot = SemanticSnapshot {
                revision: frame.graph.revision,
                entities: current_entities.clone(),
                relations: current_relations.clone(),
            };

            presentation_frames.push(PresentationFrame {
                sequence: frame.envelope.sequence,
                stage: frame.envelope.stage.clone(),
                event_kind: frame.envelope.event.kind().to_owned(),
                summary: frame.envelope.event.summary(),
                entities: current_entities,
                relations: current_relations,
                focus_candidates,
                evidence_provenance: frame.envelope.evidence.clone(),
                confidence: ClaimConfidence::Inferred,
                semantic_delta: SemanticDelta {
                    added_entities,
                    removed_entities,
                    added_relations,
                    removed_relations,
                },
                snapshot,
            });

            previous_graph = frame.graph.clone();
        }

        PresentationScenario {
            scenario_id: scenario.id.clone(),
            title: scenario.title.clone(),
            command: scenario.command.clone(),
            evidence_mode: "synthetic_replay".to_owned(),
            caveat: scenario.caveat.clone(),
            frames: presentation_frames,
        }
    }
}
