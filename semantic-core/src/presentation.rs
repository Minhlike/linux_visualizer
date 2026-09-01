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
    ClaimConfidence, CommandGraph, CommandPlanner, EvidenceMode, EvidenceRef, FidelityLevel,
    FileAccess, NodeId, NodeKind, RelationKind, ReplayFrame, ReplayScenario, ReplayStage,
    SemanticEvent, SemanticGraph,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActionEventType {
    ShellStart,
    StreamInit,
    PipeCreate,
    Spawn,
    FdDuplicate,
    FdClose,
    Exec,
    Open,
    Read,
    Write,
    Exit,
    Wait,
    UnknownInternal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ActionContext {
    pub event_type: ActionEventType,
    pub actor: Option<String>,
    pub parent: Option<String>,
    pub child: Option<String>,
    pub executable: Option<String>,
    pub descriptor: Option<String>,
    pub descriptor_target: Option<String>,
    pub target_node_kind: Option<NodeKind>,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub relation: Option<RelationKind>,
    pub byte_count: Option<u64>,
    pub file_access: Option<FileAccess>,
    pub pipeline_id: Option<String>,
    pub evidence_mode: EvidenceMode,
    pub confidence: ClaimConfidence,
}

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
    pub action_context: ActionContext,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PresentationScenario {
    pub scenario_id: String,
    pub title: String,
    pub command: String,
    pub evidence_mode: EvidenceMode,
    pub fidelity_level: FidelityLevel,
    pub caveat: String,
    pub command_graph: CommandGraph,
    pub frames: Vec<PresentationFrame>,
}

impl PresentationScenario {
    pub fn from_replay(scenario: &ReplayScenario, frames: &[ReplayFrame]) -> Self {
        let mut command_graph = CommandPlanner::parse(&scenario.command).unwrap_or(CommandGraph {
            raw_command: scenario.command.clone(),
            fidelity_level: FidelityLevel::OpaqueCommand,
            pipelines: Vec::new(),
            execution_edges: Vec::new(),
        });
        command_graph.fidelity_level = match scenario.evidence_mode {
            EvidenceMode::SyntheticReplay => FidelityLevel::EvidenceGrounded,
            EvidenceMode::StructurallyDerived => FidelityLevel::StructurallyDerived,
            EvidenceMode::OpaqueCommand => FidelityLevel::OpaqueCommand,
        };
        align_command_graph_with_replay(&mut command_graph, frames);
        Self::from_replay_with_command_graph(scenario, frames, command_graph)
    }

    pub fn from_replay_with_command_graph(
        scenario: &ReplayScenario,
        frames: &[ReplayFrame],
        command_graph: CommandGraph,
    ) -> Self {
        let mut presentation_frames = Vec::with_capacity(frames.len());
        let mut previous_graph = SemanticGraph::empty();
        let mut persistent_lifecycles = std::collections::HashMap::<String, EntityLifecycle>::new();
        let mut entity_provenance = std::collections::HashMap::<String, Vec<EvidenceRef>>::new();
        let mut executable_by_process = frames
            .iter()
            .filter_map(|frame| {
                if let SemanticEvent::ProcessExecuted {
                    process,
                    executable,
                    ..
                } = &frame.envelope.event
                {
                    Some((process.as_str().to_owned(), executable.clone()))
                } else {
                    None
                }
            })
            .collect::<std::collections::HashMap<String, String>>();

        for frame in frames {
            if let SemanticEvent::ProcessExecuted {
                process,
                executable,
                ..
            } = &frame.envelope.event
            {
                executable_by_process.insert(process.as_str().to_owned(), executable.clone());
            }
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
                    persistent_lifecycles
                        .insert(descriptor.as_str().to_owned(), EntityLifecycle::Closed);
                }
                crate::SemanticEvent::ProcessExecuted { process, .. } => {
                    // Only transition to Executing if not already exited
                    if !matches!(
                        persistent_lifecycles.get(process.as_str()),
                        Some(EntityLifecycle::Exited { .. })
                    ) {
                        persistent_lifecycles
                            .insert(process.as_str().to_owned(), EntityLifecycle::Executing);
                    }
                }
                _ => {}
            }

            // Record and accumulate provenance for nodes referenced in this event
            for node_id in &focus_candidates {
                let prov = entity_provenance.entry(node_id.clone()).or_default();
                for ev in &frame.envelope.evidence {
                    if !prov.contains(ev) {
                        prov.push(ev.clone());
                    }
                }
            }

            // Derive lifecycle and provenance for each node in current graph
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

                    let provenance = entity_provenance.get(id_str).cloned().unwrap_or_default();

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
                previous_graph
                    .edges
                    .iter()
                    .map(|e| (&e.from, &e.to, &e.relation))
                    .collect();
            let curr_edge_keys: std::collections::HashSet<(&NodeId, &NodeId, &RelationKind)> =
                frame
                    .graph
                    .edges
                    .iter()
                    .map(|e| (&e.from, &e.to, &e.relation))
                    .collect();

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

            let action_context = action_context_from_frame(
                frame,
                &previous_graph,
                &executable_by_process,
                scenario.evidence_mode.clone(),
            );

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
                action_context,
            });

            previous_graph = frame.graph.clone();
        }

        PresentationScenario {
            scenario_id: scenario.id.clone(),
            title: scenario.title.clone(),
            command: scenario.command.clone(),
            evidence_mode: scenario.evidence_mode.clone(),
            fidelity_level: command_graph.fidelity_level.clone(),
            caveat: scenario.caveat.clone(),
            command_graph,
            frames: presentation_frames,
        }
    }
}

fn align_command_graph_with_replay(command_graph: &mut CommandGraph, frames: &[ReplayFrame]) {
    let executions = frames
        .iter()
        .filter_map(|frame| {
            if let SemanticEvent::ProcessExecuted {
                process,
                executable,
                ..
            } = &frame.envelope.event
            {
                Some((process.as_str().to_owned(), executable.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    let mut id_map = std::collections::HashMap::<String, String>::new();
    for (intent, (semantic_id, executable)) in command_graph
        .pipelines
        .iter_mut()
        .flat_map(|pipeline| pipeline.processes.iter_mut())
        .zip(executions)
    {
        id_map.insert(intent.id.clone(), semantic_id.clone());
        intent.id = semantic_id;
        intent.executable = executable;
    }
    if let Some(shell_id) = frames.iter().find_map(|frame| match &frame.envelope.event {
        SemanticEvent::ShellStarted { shell } => Some(shell.id.as_str().to_owned()),
        _ => None,
    }) {
        id_map.insert("shell:derived".to_owned(), shell_id);
    }
    if let Some(terminal_id) = frames.iter().find_map(|frame| match &frame.envelope.event {
        SemanticEvent::StandardStreamsInitialized { terminal, .. } => {
            Some(terminal.id.as_str().to_owned())
        }
        _ => None,
    }) {
        id_map.insert("terminal:derived".to_owned(), terminal_id);
    }
    for edge in &mut command_graph.execution_edges {
        if let Some(id) = id_map.get(&edge.source) {
            edge.source = id.clone();
        }
        if let Some(id) = id_map.get(&edge.destination) {
            edge.destination = id.clone();
        }
    }
}

fn action_context_from_frame(
    frame: &ReplayFrame,
    previous_graph: &SemanticGraph,
    executable_by_process: &std::collections::HashMap<String, String>,
    evidence_mode: EvidenceMode,
) -> ActionContext {
    let graph = &frame.graph;
    let confidence = match evidence_mode {
        EvidenceMode::SyntheticReplay => ClaimConfidence::Inferred,
        EvidenceMode::StructurallyDerived => ClaimConfidence::Inferred,
        EvidenceMode::OpaqueCommand => ClaimConfidence::Unknown,
    };
    let mut context = ActionContext {
        event_type: ActionEventType::UnknownInternal,
        actor: None,
        parent: None,
        child: None,
        executable: None,
        descriptor: None,
        descriptor_target: None,
        target_node_kind: None,
        source: None,
        destination: None,
        relation: None,
        byte_count: None,
        file_access: None,
        pipeline_id: None,
        evidence_mode,
        confidence,
    };

    match &frame.envelope.event {
        SemanticEvent::ShellStarted { shell } => {
            context.event_type = ActionEventType::ShellStart;
            context.actor = Some(shell.id.as_str().to_owned());
            context.source = context.actor.clone();
            context.destination = context.actor.clone();
        }
        SemanticEvent::ProcessStarted { process } => {
            context.event_type = ActionEventType::Spawn;
            context.actor = Some(process.id.as_str().to_owned());
            context.destination = context.actor.clone();
        }
        SemanticEvent::StandardStreamsInitialized {
            process, terminal, ..
        } => {
            context.event_type = ActionEventType::StreamInit;
            context.actor = Some(process.as_str().to_owned());
            context.source = context.actor.clone();
            context.destination = Some(terminal.id.as_str().to_owned());
            context.target_node_kind = Some(NodeKind::Terminal);
        }
        SemanticEvent::PipeCreated { creator, pipe, .. } => {
            context.event_type = ActionEventType::PipeCreate;
            context.actor = Some(creator.as_str().to_owned());
            context.source = context.actor.clone();
            context.destination = Some(pipe.id.as_str().to_owned());
            context.target_node_kind = Some(NodeKind::AnonymousPipe);
            context.pipeline_id = context.destination.clone();
        }
        SemanticEvent::ProcessForked { parent, child, .. } => {
            context.event_type = ActionEventType::Spawn;
            context.actor = Some(parent.as_str().to_owned());
            context.parent = context.actor.clone();
            context.child = Some(child.id.as_str().to_owned());
            context.source = context.parent.clone();
            context.destination = context.child.clone();
            context.relation = Some(RelationKind::ParentOf);
        }
        SemanticEvent::FileDescriptorDuplicated {
            process,
            from_descriptor,
            to_descriptor,
        } => {
            context.event_type = ActionEventType::FdDuplicate;
            context.actor = Some(process.as_str().to_owned());
            context.descriptor = Some(to_descriptor.id.as_str().to_owned());
            let target = descriptor_target(graph, &to_descriptor.id)
                .or_else(|| descriptor_target(previous_graph, from_descriptor));
            assign_descriptor_target(&mut context, graph, previous_graph, target);
            context.source = Some(from_descriptor.as_str().to_owned());
            context.destination = context.descriptor.clone();
            context.relation = Some(RelationKind::RefersTo);
        }
        SemanticEvent::FileDescriptorClosed {
            process,
            descriptor,
        } => {
            context.event_type = ActionEventType::FdClose;
            context.actor = Some(process.as_str().to_owned());
            context.descriptor = Some(descriptor.as_str().to_owned());
            let target = descriptor_target(previous_graph, descriptor);
            assign_descriptor_target(&mut context, graph, previous_graph, target);
            context.source = context.actor.clone();
            context.destination = context.descriptor.clone();
        }
        SemanticEvent::ProcessExecuted {
            process,
            executable,
            ..
        } => {
            context.event_type = ActionEventType::Exec;
            context.actor = Some(process.as_str().to_owned());
            context.executable = Some(executable.clone());
            context.source = context.actor.clone();
            context.destination = context.actor.clone();
        }
        SemanticEvent::FileOpened {
            process,
            file,
            descriptor,
            access,
        } => {
            context.event_type = ActionEventType::Open;
            context.actor = Some(process.as_str().to_owned());
            context.executable = executable_by_process.get(process.as_str()).cloned();
            context.descriptor = Some(descriptor.id.as_str().to_owned());
            context.descriptor_target = Some(file.id.as_str().to_owned());
            context.target_node_kind = Some(file.kind.clone());
            context.file_access = Some(access.clone());
            match access {
                FileAccess::ReadOnly => {
                    context.source = Some(file.id.as_str().to_owned());
                    context.destination = context.actor.clone();
                    context.relation = Some(RelationKind::ReadsFrom);
                }
                FileAccess::WriteOnly | FileAccess::AppendOnly | FileAccess::ReadWrite => {
                    context.source = context.actor.clone();
                    context.destination = Some(file.id.as_str().to_owned());
                    context.relation = Some(RelationKind::WritesTo);
                }
            }
        }
        SemanticEvent::BytesRead {
            process,
            descriptor,
            byte_count,
        } => {
            context.event_type = ActionEventType::Read;
            context.actor = Some(process.as_str().to_owned());
            context.executable = executable_by_process.get(process.as_str()).cloned();
            context.descriptor = Some(descriptor.as_str().to_owned());
            context.byte_count = Some(*byte_count);
            let target = descriptor_target(graph, descriptor)
                .or_else(|| descriptor_target(previous_graph, descriptor));
            assign_descriptor_target(&mut context, graph, previous_graph, target.clone());
            context.source = target;
            context.destination = context.actor.clone();
            context.relation = Some(RelationKind::ReadsFrom);
        }
        SemanticEvent::BytesWritten {
            process,
            descriptor,
            byte_count,
        } => {
            context.event_type = ActionEventType::Write;
            context.actor = Some(process.as_str().to_owned());
            context.executable = executable_by_process.get(process.as_str()).cloned();
            context.descriptor = Some(descriptor.as_str().to_owned());
            context.byte_count = Some(*byte_count);
            let target = descriptor_target(graph, descriptor)
                .or_else(|| descriptor_target(previous_graph, descriptor));
            assign_descriptor_target(&mut context, graph, previous_graph, target.clone());
            context.source = context.actor.clone();
            context.destination = target;
            context.relation = Some(RelationKind::WritesTo);
        }
        SemanticEvent::ProcessExited { process, .. } => {
            context.event_type = ActionEventType::Exit;
            context.actor = Some(process.as_str().to_owned());
            context.executable = executable_by_process.get(process.as_str()).cloned();
            context.source = context.actor.clone();
            context.destination = context.actor.clone();
        }
        SemanticEvent::ProcessWaited { waiter, waited_for } => {
            context.event_type = ActionEventType::Wait;
            context.actor = Some(waiter.as_str().to_owned());
            context.parent = context.actor.clone();
            context.child = Some(waited_for.as_str().to_owned());
            context.source = context.parent.clone();
            context.destination = context.child.clone();
            context.relation = Some(RelationKind::WaitsFor);
        }
    }
    context.pipeline_id = context.pipeline_id.or_else(|| {
        resolve_pipeline_id(graph, previous_graph, context.descriptor_target.as_deref())
    });
    context
}

fn descriptor_target(graph: &SemanticGraph, descriptor: &NodeId) -> Option<String> {
    graph
        .edges
        .iter()
        .find(|edge| edge.from == *descriptor && edge.relation == RelationKind::RefersTo)
        .map(|edge| edge.to.as_str().to_owned())
}

fn assign_descriptor_target(
    context: &mut ActionContext,
    graph: &SemanticGraph,
    previous_graph: &SemanticGraph,
    target: Option<String>,
) {
    context.descriptor_target = target.clone();
    context.target_node_kind = target.as_deref().and_then(|id| {
        graph
            .nodes
            .iter()
            .chain(previous_graph.nodes.iter())
            .find(|node| node.id.as_str() == id)
            .map(|node| node.kind.clone())
    });
}

fn resolve_pipeline_id(
    graph: &SemanticGraph,
    previous_graph: &SemanticGraph,
    target: Option<&str>,
) -> Option<String> {
    let target = target?;
    for candidate in [graph, previous_graph] {
        if let Some(node) = candidate
            .nodes
            .iter()
            .find(|node| node.id.as_str() == target)
        {
            if node.kind == NodeKind::AnonymousPipe {
                return Some(target.to_owned());
            }
            if node.kind == NodeKind::PipeEndpoint {
                if let Some(edge) = candidate.edges.iter().find(|edge| {
                    edge.from == node.id
                        && matches!(
                            edge.relation,
                            RelationKind::ReadEndOf | RelationKind::WriteEndOf
                        )
                }) {
                    return Some(edge.to.as_str().to_owned());
                }
            }
        }
    }
    None
}
