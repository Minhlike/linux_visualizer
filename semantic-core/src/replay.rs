use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    ClaimConfidence, EvidenceRef, GraphError, NodeId, NodeKind, RelationKind,
    SEMANTIC_SCHEMA_VERSION, SemanticEdge, SemanticGraph, SemanticNode,
};

pub const CAT_GREP_SCENARIO_JSON: &str = include_str!("../fixtures/cat-grep.json");
pub const ECHO_REDIRECTION_SCENARIO_JSON: &str = include_str!("../fixtures/echo-redirection.json");
pub const CAT_FILE_SCENARIO_JSON: &str = include_str!("../fixtures/cat-file.json");
pub const LS_SCENARIO_JSON: &str = include_str!("../fixtures/ls.json");
pub const PS_SCENARIO_JSON: &str = include_str!("../fixtures/ps.json");

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceMode {
    SyntheticReplay,
    StructurallyDerived,
    OpaqueCommand,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReplayScenario {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub command: String,
    pub evidence_mode: EvidenceMode,
    pub caveat: String,
    pub events: Vec<SemanticEventEnvelope>,
}

impl ReplayScenario {
    pub fn embedded_cat_grep() -> Result<Self, serde_json::Error> {
        serde_json::from_str(CAT_GREP_SCENARIO_JSON)
    }

    pub fn embedded_echo_redirection() -> Result<Self, serde_json::Error> {
        serde_json::from_str(ECHO_REDIRECTION_SCENARIO_JSON)
    }

    pub fn embedded_cat_file() -> Result<Self, serde_json::Error> {
        serde_json::from_str(CAT_FILE_SCENARIO_JSON)
    }

    pub fn embedded_ls() -> Result<Self, serde_json::Error> {
        serde_json::from_str(LS_SCENARIO_JSON)
    }

    pub fn embedded_ps() -> Result<Self, serde_json::Error> {
        serde_json::from_str(PS_SCENARIO_JSON)
    }

    pub fn all_scenarios() -> Result<Vec<Self>, serde_json::Error> {
        Ok(vec![
            Self::embedded_cat_grep()?,
            Self::embedded_echo_redirection()?,
            Self::embedded_cat_file()?,
            Self::embedded_ls()?,
            Self::embedded_ps()?,
        ])
    }

    pub fn find_by_id(id: &str) -> Option<Self> {
        Self::all_scenarios().ok()?.into_iter().find(|s| s.id == id)
    }

    pub fn find_by_command(command: &str) -> Option<Self> {
        let normalized = command.trim();
        Self::all_scenarios()
            .ok()?
            .into_iter()
            .find(|s| s.command == normalized || s.title == normalized)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SemanticEventEnvelope {
    pub schema_version: String,
    pub sequence: u64,
    pub monotonic_time_ns: u64,
    pub stage: ReplayStage,
    pub evidence: Vec<EvidenceRef>,
    pub event: SemanticEvent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReplayStage {
    Shell,
    PipeCreation,
    Fork,
    FileDescriptorRedirection,
    Exec,
    FileIo,
    PipeIo,
    TerminalIo,
    Exit,
    Wait,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct InheritedDescriptor {
    pub from_parent: NodeId,
    pub child_descriptor: SemanticNode,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FileAccess {
    ReadOnly,
    WriteOnly,
    AppendOnly,
    ReadWrite,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SemanticEvent {
    ShellStarted {
        shell: SemanticNode,
    },
    ProcessStarted {
        process: SemanticNode,
    },
    StandardStreamsInitialized {
        process: NodeId,
        terminal: SemanticNode,
        stdin_descriptor: SemanticNode,
        stdout_descriptor: SemanticNode,
        stderr_descriptor: SemanticNode,
    },
    PipeCreated {
        creator: NodeId,
        pipe: SemanticNode,
        read_endpoint: SemanticNode,
        write_endpoint: SemanticNode,
        read_descriptor: SemanticNode,
        write_descriptor: SemanticNode,
    },
    ProcessForked {
        parent: NodeId,
        child: SemanticNode,
        inherited_descriptors: Vec<InheritedDescriptor>,
    },
    FileDescriptorDuplicated {
        process: NodeId,
        from_descriptor: NodeId,
        to_descriptor: SemanticNode,
    },
    FileDescriptorClosed {
        process: NodeId,
        descriptor: NodeId,
    },
    ProcessExecuted {
        process: NodeId,
        executable: String,
        argv: Vec<String>,
    },
    FileOpened {
        process: NodeId,
        file: SemanticNode,
        descriptor: SemanticNode,
        access: FileAccess,
    },
    BytesRead {
        process: NodeId,
        descriptor: NodeId,
        byte_count: u64,
    },
    BytesWritten {
        process: NodeId,
        descriptor: NodeId,
        byte_count: u64,
    },
    ProcessExited {
        process: NodeId,
        status: i32,
    },
    ProcessWaited {
        waiter: NodeId,
        waited_for: NodeId,
    },
}

impl SemanticEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::ShellStarted { .. } => "shell_started",
            Self::ProcessStarted { .. } => "process_started",
            Self::StandardStreamsInitialized { .. } => "standard_streams_initialized",
            Self::PipeCreated { .. } => "pipe_created",
            Self::ProcessForked { .. } => "process_forked",
            Self::FileDescriptorDuplicated { .. } => "file_descriptor_duplicated",
            Self::FileDescriptorClosed { .. } => "file_descriptor_closed",
            Self::ProcessExecuted { .. } => "process_executed",
            Self::FileOpened { .. } => "file_opened",
            Self::BytesRead { .. } => "bytes_read",
            Self::BytesWritten { .. } => "bytes_written",
            Self::ProcessExited { .. } => "process_exited",
            Self::ProcessWaited { .. } => "process_waited",
        }
    }

    pub fn summary(&self) -> String {
        match self {
            Self::ShellStarted { shell } => format!("shell {} starts", shell.label),
            Self::ProcessStarted { process } => format!("process {} starts", process.label),
            Self::StandardStreamsInitialized {
                process, terminal, ..
            } => {
                format!(
                    "{} initializes standard I/O on {}",
                    process.as_str(),
                    terminal.label
                )
            }
            Self::PipeCreated { creator, .. } => {
                format!("{} creates an anonymous pipe and two FDs", creator.as_str())
            }
            Self::ProcessForked { parent, child, .. } => {
                format!("{} forks {}", parent.as_str(), child.label)
            }
            Self::FileDescriptorDuplicated {
                process,
                from_descriptor,
                to_descriptor,
            } => format!(
                "{} duplicates {} onto {}",
                process.as_str(),
                from_descriptor.as_str(),
                to_descriptor.label
            ),
            Self::FileDescriptorClosed {
                process,
                descriptor,
            } => format!("{} closes {}", process.as_str(), descriptor.as_str()),
            Self::ProcessExecuted {
                process,
                executable,
                ..
            } => format!("{} execs {}", process.as_str(), executable),
            Self::FileOpened { process, file, .. } => {
                format!("{} opens {}", process.as_str(), file.label)
            }
            Self::BytesRead {
                process,
                byte_count,
                ..
            } => format!("{} reads {} bytes", process.as_str(), byte_count),
            Self::BytesWritten {
                process,
                byte_count,
                ..
            } => format!("{} writes {} bytes", process.as_str(), byte_count),
            Self::ProcessExited { process, status } => {
                format!("{} exits with status {}", process.as_str(), status)
            }
            Self::ProcessWaited { waiter, waited_for } => format!(
                "{} observes completion of {} via wait",
                waiter.as_str(),
                waited_for.as_str()
            ),
        }
    }

    pub fn referenced_node_ids(&self) -> Vec<NodeId> {
        match self {
            Self::ShellStarted { shell } => vec![shell.id.clone()],
            Self::ProcessStarted { process } => vec![process.id.clone()],
            Self::StandardStreamsInitialized {
                process,
                terminal,
                stdin_descriptor,
                stdout_descriptor,
                stderr_descriptor,
            } => vec![
                process.clone(),
                terminal.id.clone(),
                stdin_descriptor.id.clone(),
                stdout_descriptor.id.clone(),
                stderr_descriptor.id.clone(),
            ],
            Self::PipeCreated {
                creator,
                pipe,
                read_endpoint,
                write_endpoint,
                ..
            } => vec![
                creator.clone(),
                pipe.id.clone(),
                read_endpoint.id.clone(),
                write_endpoint.id.clone(),
            ],
            Self::ProcessForked { parent, child, .. } => {
                vec![parent.clone(), child.id.clone()]
            }
            Self::FileDescriptorDuplicated {
                process,
                from_descriptor,
                to_descriptor,
            } => vec![
                process.clone(),
                from_descriptor.clone(),
                to_descriptor.id.clone(),
            ],
            Self::FileDescriptorClosed {
                process,
                descriptor,
            } => vec![process.clone(), descriptor.clone()],
            Self::ProcessExecuted { process, .. } | Self::ProcessExited { process, .. } => {
                vec![process.clone()]
            }
            Self::FileOpened {
                process,
                file,
                descriptor,
                ..
            } => vec![process.clone(), file.id.clone(), descriptor.id.clone()],
            Self::BytesRead {
                process,
                descriptor,
                ..
            }
            | Self::BytesWritten {
                process,
                descriptor,
                ..
            } => vec![process.clone(), descriptor.clone()],
            Self::ProcessWaited { waiter, waited_for } => {
                vec![waiter.clone(), waited_for.clone()]
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReplayFrame {
    pub envelope: SemanticEventEnvelope,
    pub graph: SemanticGraph,
}

pub struct ReplayEngine {
    graph: SemanticGraph,
    last_time_ns: Option<u64>,
}

impl Default for ReplayEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayEngine {
    pub fn new() -> Self {
        Self {
            graph: SemanticGraph::empty(),
            last_time_ns: None,
        }
    }

    pub fn apply(&mut self, envelope: SemanticEventEnvelope) -> Result<ReplayFrame, ReplayError> {
        let expected_sequence = self.graph.revision + 1;
        if envelope.schema_version != SEMANTIC_SCHEMA_VERSION {
            return Err(ReplayError::UnsupportedSchemaVersion(
                envelope.schema_version,
            ));
        }
        if envelope.sequence != expected_sequence {
            return Err(ReplayError::OutOfOrder {
                expected: expected_sequence,
                actual: envelope.sequence,
            });
        }
        if envelope.evidence.is_empty() {
            return Err(ReplayError::MissingEvidence(envelope.sequence));
        }
        if self
            .last_time_ns
            .is_some_and(|previous| envelope.monotonic_time_ns < previous)
        {
            return Err(ReplayError::TimeWentBackward(envelope.sequence));
        }

        self.apply_event(&envelope)?;
        self.graph.revision = envelope.sequence;
        self.graph.validate().map_err(ReplayError::InvalidGraph)?;
        self.last_time_ns = Some(envelope.monotonic_time_ns);

        Ok(ReplayFrame {
            envelope,
            graph: self.graph.clone(),
        })
    }

    pub fn replay(scenario: &ReplayScenario) -> Result<Vec<ReplayFrame>, ReplayError> {
        let mut engine = Self::new();
        scenario
            .events
            .iter()
            .cloned()
            .map(|event| engine.apply(event))
            .collect()
    }

    fn apply_event(&mut self, envelope: &SemanticEventEnvelope) -> Result<(), ReplayError> {
        let evidence = &envelope.evidence;
        match &envelope.event {
            SemanticEvent::ShellStarted { shell } => self.add_node(shell.clone()),
            SemanticEvent::ProcessStarted { process } => self.add_node(process.clone()),
            SemanticEvent::StandardStreamsInitialized {
                process,
                terminal,
                stdin_descriptor,
                stdout_descriptor,
                stderr_descriptor,
            } => {
                self.require_node(process)?;
                if !self.graph.nodes.iter().any(|n| n.id == terminal.id) {
                    require_kind(terminal, NodeKind::Terminal)?;
                    self.add_node(terminal.clone())?;
                }
                self.add_descriptor(process, stdin_descriptor.clone(), &terminal.id, evidence)?;
                self.add_edge(
                    stdin_descriptor.id.clone(),
                    terminal.id.clone(),
                    RelationKind::ReadsFrom,
                    evidence,
                )?;
                self.add_descriptor(process, stdout_descriptor.clone(), &terminal.id, evidence)?;
                self.add_edge(
                    stdout_descriptor.id.clone(),
                    terminal.id.clone(),
                    RelationKind::WritesTo,
                    evidence,
                )?;
                self.add_descriptor(process, stderr_descriptor.clone(), &terminal.id, evidence)?;
                self.add_edge(
                    stderr_descriptor.id.clone(),
                    terminal.id.clone(),
                    RelationKind::WritesTo,
                    evidence,
                )?;
                Ok(())
            }
            SemanticEvent::PipeCreated {
                creator,
                pipe,
                read_endpoint,
                write_endpoint,
                read_descriptor,
                write_descriptor,
            } => {
                self.require_node(creator)?;
                require_kind(pipe, NodeKind::AnonymousPipe)?;
                require_kind(read_endpoint, NodeKind::PipeEndpoint)?;
                require_kind(write_endpoint, NodeKind::PipeEndpoint)?;
                self.add_node(pipe.clone())?;
                self.add_node(read_endpoint.clone())?;
                self.add_node(write_endpoint.clone())?;
                self.add_edge(
                    read_endpoint.id.clone(),
                    pipe.id.clone(),
                    RelationKind::ReadEndOf,
                    evidence,
                )?;
                self.add_edge(
                    write_endpoint.id.clone(),
                    pipe.id.clone(),
                    RelationKind::WriteEndOf,
                    evidence,
                )?;
                self.add_descriptor(
                    creator,
                    read_descriptor.clone(),
                    &read_endpoint.id,
                    evidence,
                )?;
                self.add_descriptor(
                    creator,
                    write_descriptor.clone(),
                    &write_endpoint.id,
                    evidence,
                )
            }
            SemanticEvent::ProcessForked {
                parent,
                child,
                inherited_descriptors,
            } => {
                self.require_node(parent)?;
                require_kind(child, NodeKind::Process)?;
                self.add_node(child.clone())?;
                self.add_edge(
                    parent.clone(),
                    child.id.clone(),
                    RelationKind::ParentOf,
                    evidence,
                )?;
                for inherited in inherited_descriptors {
                    let target = self.descriptor_target(parent, &inherited.from_parent)?;
                    self.add_descriptor(
                        &child.id,
                        inherited.child_descriptor.clone(),
                        &target,
                        evidence,
                    )?;
                    if self.has_specific_relation(
                        &inherited.from_parent,
                        &target,
                        RelationKind::ReadsFrom,
                    ) {
                        self.add_edge(
                            inherited.child_descriptor.id.clone(),
                            target.clone(),
                            RelationKind::ReadsFrom,
                            evidence,
                        )?;
                    }
                    if self.has_specific_relation(
                        &inherited.from_parent,
                        &target,
                        RelationKind::WritesTo,
                    ) {
                        self.add_edge(
                            inherited.child_descriptor.id.clone(),
                            target.clone(),
                            RelationKind::WritesTo,
                            evidence,
                        )?;
                    }
                }
                Ok(())
            }
            SemanticEvent::FileDescriptorDuplicated {
                process,
                from_descriptor,
                to_descriptor,
            } => {
                let target = self.descriptor_target(process, from_descriptor)?;
                self.add_descriptor(process, to_descriptor.clone(), &target, evidence)?;
                if self.has_specific_relation(from_descriptor, &target, RelationKind::ReadsFrom) {
                    self.add_edge(
                        to_descriptor.id.clone(),
                        target.clone(),
                        RelationKind::ReadsFrom,
                        evidence,
                    )?;
                }
                if self.has_specific_relation(from_descriptor, &target, RelationKind::WritesTo) {
                    self.add_edge(
                        to_descriptor.id.clone(),
                        target.clone(),
                        RelationKind::WritesTo,
                        evidence,
                    )?;
                }
                Ok(())
            }
            SemanticEvent::FileDescriptorClosed {
                process,
                descriptor,
            } => {
                self.descriptor_target(process, descriptor)?;
                self.remove_node(descriptor);
                Ok(())
            }
            SemanticEvent::ProcessExecuted { process, argv, .. } => {
                self.require_node(process)?;
                if argv.is_empty() {
                    return Err(ReplayError::EmptyArgv(process.clone()));
                }
                Ok(())
            }
            SemanticEvent::FileOpened {
                process,
                file,
                descriptor,
                access,
            } => {
                self.require_node(process)?;
                if !self.graph.nodes.iter().any(|n| n.id == file.id) {
                    if !matches!(
                        file.kind,
                        NodeKind::RegularFile | NodeKind::Directory | NodeKind::Terminal
                    ) {
                        return Err(ReplayError::WrongNodeKind {
                            node: file.id.clone(),
                            expected: NodeKind::RegularFile,
                            actual: file.kind.clone(),
                        });
                    }
                    self.add_node(file.clone())?;
                }
                self.add_descriptor(process, descriptor.clone(), &file.id, evidence)?;
                match access {
                    FileAccess::ReadOnly => {
                        self.add_edge(
                            descriptor.id.clone(),
                            file.id.clone(),
                            RelationKind::ReadsFrom,
                            evidence,
                        )?;
                    }
                    FileAccess::WriteOnly | FileAccess::AppendOnly => {
                        self.add_edge(
                            descriptor.id.clone(),
                            file.id.clone(),
                            RelationKind::WritesTo,
                            evidence,
                        )?;
                    }
                    FileAccess::ReadWrite => {
                        self.add_edge(
                            descriptor.id.clone(),
                            file.id.clone(),
                            RelationKind::ReadsFrom,
                            evidence,
                        )?;
                        self.add_edge(
                            descriptor.id.clone(),
                            file.id.clone(),
                            RelationKind::WritesTo,
                            evidence,
                        )?;
                    }
                }
                Ok(())
            }
            SemanticEvent::BytesRead {
                process,
                descriptor,
                byte_count,
            } => {
                require_positive_bytes(*byte_count)?;
                let target = self.descriptor_target(process, descriptor)?;
                let target_node = self.require_node(&target)?;
                match target_node.kind {
                    NodeKind::RegularFile | NodeKind::Directory
                        if self.has_specific_relation(
                            descriptor,
                            &target,
                            RelationKind::ReadsFrom,
                        ) =>
                    {
                        Ok(())
                    }
                    NodeKind::PipeEndpoint
                        if self.has_relation(&target, RelationKind::ReadEndOf) =>
                    {
                        Ok(())
                    }
                    NodeKind::Terminal
                        if self.has_specific_relation(
                            descriptor,
                            &target,
                            RelationKind::ReadsFrom,
                        ) =>
                    {
                        Ok(())
                    }
                    _ => Err(ReplayError::InvalidReadTarget(target)),
                }
            }
            SemanticEvent::BytesWritten {
                process,
                descriptor,
                byte_count,
            } => {
                require_positive_bytes(*byte_count)?;
                let target = self.descriptor_target(process, descriptor)?;
                let target_node = self.require_node(&target)?;
                match target_node.kind {
                    NodeKind::RegularFile
                        if self.has_specific_relation(
                            descriptor,
                            &target,
                            RelationKind::WritesTo,
                        ) =>
                    {
                        Ok(())
                    }
                    NodeKind::PipeEndpoint
                        if self.has_relation(&target, RelationKind::WriteEndOf) =>
                    {
                        Ok(())
                    }
                    NodeKind::Terminal
                        if self.has_specific_relation(
                            descriptor,
                            &target,
                            RelationKind::WritesTo,
                        ) =>
                    {
                        Ok(())
                    }
                    _ => Err(ReplayError::InvalidWriteTarget(target)),
                }
            }
            SemanticEvent::ProcessExited { process, .. } => {
                self.require_node(process)?;
                let descriptors: Vec<NodeId> = self
                    .graph
                    .edges
                    .iter()
                    .filter(|edge| {
                        edge.from == *process && edge.relation == RelationKind::HasFileDescriptor
                    })
                    .map(|edge| edge.to.clone())
                    .collect();
                for descriptor in descriptors {
                    self.remove_node(&descriptor);
                }
                Ok(())
            }
            SemanticEvent::ProcessWaited { waiter, waited_for } => {
                self.require_node(waiter)?;
                self.require_node(waited_for)?;
                Ok(())
            }
        }
    }

    fn add_node(&mut self, node: SemanticNode) -> Result<(), ReplayError> {
        if self
            .graph
            .nodes
            .iter()
            .any(|existing| existing.id == node.id)
        {
            return Err(ReplayError::DuplicateNode(node.id));
        }
        self.graph.nodes.push(node);
        Ok(())
    }

    fn remove_node(&mut self, id: &NodeId) {
        self.graph.nodes.retain(|node| node.id != *id);
        self.graph
            .edges
            .retain(|edge| edge.from != *id && edge.to != *id);
        self.collect_unreferenced_pipe_objects();
    }

    fn require_node(&self, id: &NodeId) -> Result<&SemanticNode, ReplayError> {
        self.graph
            .nodes
            .iter()
            .find(|node| node.id == *id)
            .ok_or_else(|| ReplayError::MissingNode(id.clone()))
    }

    fn add_descriptor(
        &mut self,
        process: &NodeId,
        descriptor: SemanticNode,
        target: &NodeId,
        evidence: &[EvidenceRef],
    ) -> Result<(), ReplayError> {
        self.require_node(process)?;
        self.require_node(target)?;
        require_kind(&descriptor, NodeKind::FileDescriptorEntry)?;
        self.add_node(descriptor.clone())?;
        self.add_edge(
            process.clone(),
            descriptor.id.clone(),
            RelationKind::HasFileDescriptor,
            evidence,
        )?;
        self.add_edge(
            descriptor.id,
            target.clone(),
            RelationKind::RefersTo,
            evidence,
        )
    }

    fn descriptor_target(
        &self,
        process: &NodeId,
        descriptor: &NodeId,
    ) -> Result<NodeId, ReplayError> {
        self.require_node(process)?;
        self.require_node(descriptor)?;
        let owned = self.graph.edges.iter().any(|edge| {
            edge.from == *process
                && edge.to == *descriptor
                && edge.relation == RelationKind::HasFileDescriptor
        });
        if !owned {
            return Err(ReplayError::DescriptorNotOwned {
                process: process.clone(),
                descriptor: descriptor.clone(),
            });
        }
        self.graph
            .edges
            .iter()
            .find(|edge| edge.from == *descriptor && edge.relation == RelationKind::RefersTo)
            .map(|edge| edge.to.clone())
            .ok_or_else(|| ReplayError::DescriptorHasNoTarget(descriptor.clone()))
    }

    fn has_relation(&self, from: &NodeId, relation: RelationKind) -> bool {
        self.graph
            .edges
            .iter()
            .any(|edge| edge.from == *from && edge.relation == relation)
    }

    fn has_specific_relation(&self, from: &NodeId, to: &NodeId, relation: RelationKind) -> bool {
        self.graph
            .edges
            .iter()
            .any(|edge| edge.from == *from && edge.to == *to && edge.relation == relation)
    }

    fn collect_unreferenced_pipe_objects(&mut self) {
        let orphaned_endpoints: Vec<NodeId> = self
            .graph
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::PipeEndpoint)
            .filter(|node| {
                !self
                    .graph
                    .edges
                    .iter()
                    .any(|edge| edge.to == node.id && edge.relation == RelationKind::RefersTo)
            })
            .map(|node| node.id.clone())
            .collect();

        for endpoint in orphaned_endpoints {
            self.graph.nodes.retain(|node| node.id != endpoint);
            self.graph
                .edges
                .retain(|edge| edge.from != endpoint && edge.to != endpoint);
        }

        let orphaned_pipes: Vec<NodeId> = self
            .graph
            .nodes
            .iter()
            .filter(|node| node.kind == NodeKind::AnonymousPipe)
            .filter(|node| {
                !self.graph.edges.iter().any(|edge| {
                    edge.to == node.id
                        && matches!(
                            edge.relation,
                            RelationKind::ReadEndOf | RelationKind::WriteEndOf
                        )
                })
            })
            .map(|node| node.id.clone())
            .collect();

        for pipe in orphaned_pipes {
            self.graph.nodes.retain(|node| node.id != pipe);
            self.graph
                .edges
                .retain(|edge| edge.from != pipe && edge.to != pipe);
        }
    }

    fn add_edge(
        &mut self,
        from: NodeId,
        to: NodeId,
        relation: RelationKind,
        evidence: &[EvidenceRef],
    ) -> Result<(), ReplayError> {
        self.require_node(&from)?;
        self.require_node(&to)?;
        if self
            .graph
            .edges
            .iter()
            .any(|edge| edge.from == from && edge.to == to && edge.relation == relation)
        {
            return Err(ReplayError::DuplicateRelation { from, to, relation });
        }
        self.graph.edges.push(SemanticEdge {
            from,
            to,
            relation,
            evidence: evidence.to_vec(),
            confidence: ClaimConfidence::Inferred,
        });
        Ok(())
    }
}

fn require_kind(node: &SemanticNode, expected: NodeKind) -> Result<(), ReplayError> {
    if node.kind != expected {
        return Err(ReplayError::WrongNodeKind {
            node: node.id.clone(),
            expected,
            actual: node.kind.clone(),
        });
    }
    Ok(())
}

fn require_positive_bytes(byte_count: u64) -> Result<(), ReplayError> {
    if byte_count == 0 {
        return Err(ReplayError::ZeroByteActivity);
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReplayError {
    DescriptorHasNoTarget(NodeId),
    DescriptorNotOwned {
        process: NodeId,
        descriptor: NodeId,
    },
    DuplicateNode(NodeId),
    DuplicateRelation {
        from: NodeId,
        to: NodeId,
        relation: RelationKind,
    },
    EmptyArgv(NodeId),
    InvalidGraph(GraphError),
    InvalidReadTarget(NodeId),
    InvalidWriteTarget(NodeId),
    MissingEvidence(u64),
    MissingNode(NodeId),
    OutOfOrder {
        expected: u64,
        actual: u64,
    },
    TimeWentBackward(u64),
    UnsupportedSchemaVersion(String),
    WrongNodeKind {
        node: NodeId,
        expected: NodeKind,
        actual: NodeKind,
    },
    ZeroByteActivity,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PresentationScenario;

    #[test]
    fn all_five_scenarios_replay_deterministically_with_same_reducer() {
        let scenarios = ReplayScenario::all_scenarios().expect("all 5 fixtures must deserialize");
        assert_eq!(scenarios.len(), 5);

        for scenario in &scenarios {
            let first = ReplayEngine::replay(scenario)
                .unwrap_or_else(|e| panic!("scenario {} failed replay: {:?}", scenario.id, e));
            let second = ReplayEngine::replay(scenario).unwrap_or_else(|e| {
                panic!("scenario {} failed second replay: {:?}", scenario.id, e)
            });

            assert_eq!(
                first, second,
                "replay of {} must be deterministic",
                scenario.id
            );
            assert_eq!(first.len(), scenario.events.len());
            assert_eq!(
                first.last().unwrap().graph.revision,
                scenario.events.len() as u64
            );

            // Invariant: after process exit, all descriptors belonging to that process are gone
            for frame in &first {
                frame
                    .graph
                    .validate()
                    .expect("graph must be valid at every frame");
            }

            // Invariant: neutral presentation contract converts cleanly
            let presentation = PresentationScenario::from_replay(scenario, &first);
            assert_eq!(presentation.frames.len(), scenario.events.len());
            assert_eq!(presentation.scenario_id, scenario.id);
        }
    }

    #[test]
    fn cat_grep_fixture_replays_deterministically() {
        let scenario = ReplayScenario::embedded_cat_grep().expect("fixture must deserialize");
        let first = ReplayEngine::replay(&scenario).expect("fixture must be semantically valid");
        let second = ReplayEngine::replay(&scenario).expect("fixture must remain deterministic");

        assert_eq!(first, second);
        assert_eq!(first.len(), 22);
        assert_eq!(first.last().unwrap().graph.revision, 22);
        assert!(
            first
                .last()
                .unwrap()
                .graph
                .nodes
                .iter()
                .all(|node| node.kind != NodeKind::FileDescriptorEntry),
            "process exit must close every remaining descriptor"
        );
        assert!(
            first.last().unwrap().graph.nodes.iter().all(|node| {
                !matches!(node.kind, NodeKind::AnonymousPipe | NodeKind::PipeEndpoint)
            }),
            "an anonymous pipe must disappear after its final descriptor closes"
        );
        assert!(
            first
                .last()
                .unwrap()
                .graph
                .edges
                .iter()
                .all(|edge| edge.relation != RelationKind::WaitsFor),
            "a completed wait must not remain as an active graph relationship"
        );
    }

    #[test]
    fn required_vertical_slice_stages_are_present() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let kinds: Vec<&str> = scenario
            .events
            .iter()
            .map(|event| event.event.kind())
            .collect();

        for required in [
            "shell_started",
            "pipe_created",
            "process_forked",
            "file_descriptor_duplicated",
            "process_executed",
            "bytes_read",
            "bytes_written",
            "process_waited",
        ] {
            assert!(kinds.contains(&required), "missing event kind {required}");
        }
    }

    #[test]
    fn replay_rejects_unprovenanced_events() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let mut event = scenario.events[0].clone();
        event.evidence.clear();

        assert_eq!(
            ReplayEngine::new().apply(event),
            Err(ReplayError::MissingEvidence(1))
        );
    }

    #[test]
    fn ordering_handling_rejects_out_of_order_sequences() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let mut engine = ReplayEngine::new();
        engine.apply(scenario.events[0].clone()).unwrap();

        // Sequence jump: expecting 2, but provide 5
        let mut skipped = scenario.events[1].clone();
        skipped.sequence = 5;
        assert_eq!(
            engine.apply(skipped),
            Err(ReplayError::OutOfOrder {
                expected: 2,
                actual: 5
            })
        );

        // Time went backward
        let mut backward = scenario.events[1].clone();
        backward.sequence = 2;
        backward.monotonic_time_ns = 500; // was 1000 in event 0
        assert_eq!(
            engine.apply(backward),
            Err(ReplayError::TimeWentBackward(2))
        );
    }

    #[test]
    fn fd_ownership_isolation_prevents_cross_process_access() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let mut engine = ReplayEngine::new();
        // Apply shell, pipe, and cat fork
        for event in &scenario.events[..3] {
            engine.apply(event.clone()).unwrap();
        }

        // Try to close shell's FD (fd:shell:10) from cat process
        let malicious_close = SemanticEventEnvelope {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            sequence: 4,
            monotonic_time_ns: 4000,
            stage: ReplayStage::FileDescriptorRedirection,
            evidence: vec![EvidenceRef {
                source_id: "test".to_owned(),
                sequence: 4,
            }],
            event: SemanticEvent::FileDescriptorClosed {
                process: NodeId::new("process:cat").unwrap(),
                descriptor: NodeId::new("fd:shell:10").unwrap(),
            },
        };

        assert_eq!(
            engine.apply(malicious_close),
            Err(ReplayError::DescriptorNotOwned {
                process: NodeId::new("process:cat").unwrap(),
                descriptor: NodeId::new("fd:shell:10").unwrap(),
            })
        );
    }

    #[test]
    fn pipe_data_direction_enforces_read_write_separation() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let mut engine = ReplayEngine::new();
        for event in &scenario.events[..3] {
            engine.apply(event.clone()).unwrap();
        }

        // Attempt to write to read-end descriptor (fd:cat:10 refers to pipe:1:read)
        let invalid_write = SemanticEventEnvelope {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            sequence: 4,
            monotonic_time_ns: 4000,
            stage: ReplayStage::PipeIo,
            evidence: vec![EvidenceRef {
                source_id: "test".to_owned(),
                sequence: 4,
            }],
            event: SemanticEvent::BytesWritten {
                process: NodeId::new("process:cat").unwrap(),
                descriptor: NodeId::new("fd:cat:10").unwrap(),
                byte_count: 32,
            },
        };

        assert_eq!(
            engine.apply(invalid_write),
            Err(ReplayError::InvalidWriteTarget(
                NodeId::new("pipe:1:read").unwrap()
            ))
        );

        // Attempt to read from write-end descriptor (fd:cat:11 refers to pipe:1:write)
        let invalid_read = SemanticEventEnvelope {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            sequence: 4,
            monotonic_time_ns: 4000,
            stage: ReplayStage::PipeIo,
            evidence: vec![EvidenceRef {
                source_id: "test".to_owned(),
                sequence: 4,
            }],
            event: SemanticEvent::BytesRead {
                process: NodeId::new("process:cat").unwrap(),
                descriptor: NodeId::new("fd:cat:11").unwrap(),
                byte_count: 32,
            },
        };

        assert_eq!(
            engine.apply(invalid_read),
            Err(ReplayError::InvalidReadTarget(
                NodeId::new("pipe:1:write").unwrap()
            ))
        );
    }

    #[test]
    fn fork_exec_lifecycle_preserves_pid_and_hierarchy() {
        let scenario = ReplayScenario::embedded_echo_redirection().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();

        // Fork is event 3
        let fork_frame = &frames[2];
        let parent_of_edge = fork_frame
            .graph
            .edges
            .iter()
            .find(|e| e.relation == RelationKind::ParentOf)
            .expect("fork must establish ParentOf relation");
        assert_eq!(parent_of_edge.from.as_str(), "process:shell");
        assert_eq!(parent_of_edge.to.as_str(), "process:echo");

        // Exec is event 7
        let exec_frame = &frames[6];
        let echo_node = exec_frame
            .graph
            .nodes
            .iter()
            .find(|n| n.id.as_str() == "process:echo")
            .expect("process:echo must retain its PID/NodeId after exec");
        assert_eq!(echo_node.kind, NodeKind::Process);
    }

    #[test]
    fn unique_ids_prevent_duplicate_nodes() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let mut engine = ReplayEngine::new();
        engine.apply(scenario.events[0].clone()).unwrap();

        // Attempt to add another node with the same ID
        let duplicate_start = SemanticEventEnvelope {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            sequence: 2,
            monotonic_time_ns: 2000,
            stage: ReplayStage::Shell,
            evidence: vec![EvidenceRef {
                source_id: "test".to_owned(),
                sequence: 2,
            }],
            event: SemanticEvent::ShellStarted {
                shell: SemanticNode {
                    id: NodeId::new("process:shell").unwrap(),
                    kind: NodeKind::Shell,
                    label: "second sh".to_owned(),
                },
            },
        };

        assert_eq!(
            engine.apply(duplicate_start),
            Err(ReplayError::DuplicateNode(
                NodeId::new("process:shell").unwrap()
            ))
        );
    }

    #[test]
    fn presentation_contract_is_renderer_neutral() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation = PresentationScenario::from_replay(&scenario, &frames);

        assert_eq!(presentation.scenario_id, "cat-file-pipe-grep-v1");
        assert_eq!(presentation.frames.len(), 22);

        for frame in &presentation.frames {
            assert!(!frame.summary.is_empty());
            assert!(!frame.focus_candidates.is_empty());
            assert!(!frame.evidence_provenance.is_empty());
            // Invariant: Snapshot has entities and relations
            assert!(frame.snapshot.revision > 0);
        }
    }

    #[test]
    fn process_lifecycle_persists_as_exited_across_subsequent_wait_frames() {
        use crate::EntityLifecycle;

        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation = PresentationScenario::from_replay(&scenario, &frames);

        // In cat-grep scenario, cat exits before grep exits, and shell waits for them
        // Find the frame where cat exits
        let cat_exit_idx = presentation
            .frames
            .iter()
            .position(|f| {
                f.event_kind == "process_exited"
                    && f.focus_candidates.contains(&"process:cat".to_string())
            })
            .expect("must have cat exit frame");

        // Verify that in all frames AFTER cat exit, cat's lifecycle is still Exited
        for frame in &presentation.frames[cat_exit_idx..] {
            if let Some(cat_entity) = frame.entities.iter().find(|e| e.id == "process:cat") {
                assert!(
                    matches!(cat_entity.lifecycle, EntityLifecycle::Exited { .. }),
                    "cat entity at sequence {} must remain Exited, found {:?}",
                    frame.sequence,
                    cat_entity.lifecycle
                );
            }
        }
    }

    #[test]
    fn entity_evidence_accumulates_and_unrelated_entities_do_not_receive_new_evidence() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation = PresentationScenario::from_replay(&scenario, &frames);

        // Frame 1: shell starts
        let frame1_shell = presentation.frames[0]
            .entities
            .iter()
            .find(|e| e.id == "process:shell")
            .unwrap();
        assert_eq!(frame1_shell.provenance.len(), 1);
        assert_eq!(frame1_shell.provenance[0].sequence, 1);

        // Frame 4: file_descriptor_duplicated on cat (shell is not in focus_candidates)
        let frame4 = &presentation.frames[3];
        assert_eq!(frame4.event_kind, "file_descriptor_duplicated");
        assert!(
            !frame4
                .focus_candidates
                .contains(&"process:shell".to_string())
        );

        let frame4_shell = frame4
            .entities
            .iter()
            .find(|e| e.id == "process:shell")
            .unwrap();
        // Shell provenance must NOT have sequence 4 evidence!
        assert!(
            !frame4_shell.provenance.iter().any(|ev| ev.sequence == 4),
            "unrelated entity process:shell must not receive evidence from sequence 4"
        );
    }

    #[test]
    fn fd_close_persists_removal_from_snapshot() {
        let scenario = ReplayScenario::embedded_cat_grep().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation = PresentationScenario::from_replay(&scenario, &frames);

        // In cat-grep scenario, cat closes fd:cat:10 at sequence 5
        let close_idx = presentation
            .frames
            .iter()
            .position(|f| {
                f.event_kind == "file_descriptor_closed" && f.summary.contains("fd:cat:10")
            })
            .expect("must have fd close frame");

        // Verify in all subsequent frames that fd:cat:10 is NOT present in graph entities
        for frame in &presentation.frames[close_idx..] {
            assert!(
                !frame.entities.iter().any(|e| e.id == "fd:cat:10"),
                "closed descriptor fd:cat:10 must not be present in active entities at sequence {}",
                frame.sequence
            );
        }
    }
}
