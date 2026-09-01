#![forbid(unsafe_code)]
//! Minimal, non-executing shell structure parser and semantic planner.
//!
//! This module deliberately models only syntax that is safe to infer from the
//! command line. It never executes the command and never invents executable
//! internals, PIDs, byte counts, exit status, or syscalls.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    EvidenceMode, EvidenceRef, FileAccess, InheritedDescriptor, NodeId, NodeKind, ReplayScenario,
    ReplayStage, SEMANTIC_SCHEMA_VERSION, SemanticEvent, SemanticEventEnvelope, SemanticNode,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FidelityLevel {
    EvidenceGrounded,
    StructurallyDerived,
    OpaqueCommand,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RedirectionKind {
    Input,
    OutputTruncate,
    OutputAppend,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct RedirectionIntent {
    pub fd: u8,
    pub kind: RedirectionKind,
    pub file: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ProcessIntent {
    pub id: String,
    pub executable: String,
    pub arguments: Vec<String>,
    pub redirections: Vec<RedirectionIntent>,
    pub semantic_adapter: Option<String>,
    pub opaque_internals: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChainOperator {
    And,
    Or,
    Sequence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PipelineIntent {
    pub id: String,
    pub processes: Vec<ProcessIntent>,
    pub background: bool,
    pub next_operator: Option<ChainOperator>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionRelation {
    Controls,
    Pipe,
    FileRead,
    FileWrite,
    TerminalInput,
    TerminalOutput,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionEdge {
    pub source: String,
    pub destination: String,
    pub relation: ExecutionRelation,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CommandGraph {
    pub raw_command: String,
    pub fidelity_level: FidelityLevel,
    pub pipelines: Vec<PipelineIntent>,
    pub execution_edges: Vec<ExecutionEdge>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Token {
    Word(String),
    Pipe,
    Input,
    Output,
    Append,
    Background,
    And,
    Or,
    Sequence,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CommandParseError {
    EmptyCommand,
    UnterminatedQuote,
    MissingExecutable,
    MissingRedirectTarget,
    TrailingOperator,
    UnsupportedSyntax(char),
}

pub struct CommandPlanner;

impl CommandPlanner {
    pub fn parse(command: &str) -> Result<CommandGraph, CommandParseError> {
        let tokens = tokenize(command)?;
        if tokens.is_empty() {
            return Err(CommandParseError::EmptyCommand);
        }

        let mut pipelines = Vec::new();
        let mut processes = Vec::new();
        let mut words = Vec::new();
        let mut redirections = Vec::new();
        let mut pipeline_index = 0usize;
        let mut process_index = 0usize;
        let mut background = false;
        let mut index = 0usize;

        let finish_process = |words: &mut Vec<String>,
                              redirections: &mut Vec<RedirectionIntent>,
                              processes: &mut Vec<ProcessIntent>,
                              pipeline_index: usize,
                              process_index: usize|
         -> Result<(), CommandParseError> {
            if words.is_empty() {
                return Err(CommandParseError::MissingExecutable);
            }
            let executable = words.remove(0);
            let adapter = known_adapter(&executable).map(str::to_owned);
            processes.push(ProcessIntent {
                id: format!("process:derived:{pipeline_index}:{process_index}"),
                executable,
                arguments: std::mem::take(words),
                redirections: std::mem::take(redirections),
                opaque_internals: adapter.is_none(),
                semantic_adapter: adapter,
            });
            Ok(())
        };

        while index < tokens.len() {
            match &tokens[index] {
                Token::Word(word) => words.push(word.clone()),
                Token::Input | Token::Output | Token::Append => {
                    let Some(Token::Word(file)) = tokens.get(index + 1) else {
                        return Err(CommandParseError::MissingRedirectTarget);
                    };
                    let (fd, kind) = match tokens[index] {
                        Token::Input => (0, RedirectionKind::Input),
                        Token::Output => (1, RedirectionKind::OutputTruncate),
                        Token::Append => (1, RedirectionKind::OutputAppend),
                        _ => unreachable!(),
                    };
                    redirections.push(RedirectionIntent {
                        fd,
                        kind,
                        file: file.clone(),
                    });
                    index += 1;
                }
                Token::Pipe => {
                    finish_process(
                        &mut words,
                        &mut redirections,
                        &mut processes,
                        pipeline_index,
                        process_index,
                    )?;
                    if index + 1 == tokens.len() {
                        return Err(CommandParseError::MissingExecutable);
                    }
                    process_index += 1;
                }
                Token::Background | Token::And | Token::Or | Token::Sequence => {
                    finish_process(
                        &mut words,
                        &mut redirections,
                        &mut processes,
                        pipeline_index,
                        process_index,
                    )?;
                    background = matches!(tokens[index], Token::Background);
                    let next_operator = match tokens[index] {
                        Token::And => Some(ChainOperator::And),
                        Token::Or => Some(ChainOperator::Or),
                        Token::Sequence => Some(ChainOperator::Sequence),
                        _ => None,
                    };
                    pipelines.push(PipelineIntent {
                        id: format!("pipeline:{pipeline_index}"),
                        processes: std::mem::take(&mut processes),
                        background,
                        next_operator,
                    });
                    pipeline_index += 1;
                    process_index = 0;
                    background = false;
                    if index + 1 == tokens.len() && !matches!(tokens[index], Token::Background) {
                        return Err(CommandParseError::TrailingOperator);
                    }
                }
            }
            index += 1;
        }

        if !words.is_empty() || !redirections.is_empty() {
            finish_process(
                &mut words,
                &mut redirections,
                &mut processes,
                pipeline_index,
                process_index,
            )?;
        }
        if !processes.is_empty() {
            pipelines.push(PipelineIntent {
                id: format!("pipeline:{pipeline_index}"),
                processes,
                background,
                next_operator: None,
            });
        }
        if pipelines.is_empty() {
            return Err(CommandParseError::MissingExecutable);
        }

        let fidelity_level = if pipelines
            .iter()
            .flat_map(|p| &p.processes)
            .all(|p| !p.opaque_internals)
        {
            FidelityLevel::StructurallyDerived
        } else {
            FidelityLevel::OpaqueCommand
        };
        let mut graph = CommandGraph {
            raw_command: command.trim().to_owned(),
            fidelity_level,
            pipelines,
            execution_edges: Vec::new(),
        };
        graph.execution_edges = build_edges(&graph);
        Ok(graph)
    }

    pub fn plan(command: &str) -> Result<(CommandGraph, ReplayScenario), CommandParseError> {
        let graph = Self::parse(command)?;
        let scenario = scenario_from_graph(&graph);
        Ok((graph, scenario))
    }
}

fn known_adapter(executable: &str) -> Option<&'static str> {
    match executable.rsplit('/').next().unwrap_or(executable) {
        "cat" => Some("cat"),
        "grep" => Some("grep"),
        "echo" => Some("echo"),
        "ls" => Some("ls"),
        "ps" => Some("ps"),
        _ => None,
    }
}

fn tokenize(command: &str) -> Result<Vec<Token>, CommandParseError> {
    let mut tokens = Vec::new();
    let mut word = String::new();
    let mut quote: Option<char> = None;
    let chars: Vec<char> = command.chars().collect();
    let mut i = 0usize;
    let flush = |word: &mut String, tokens: &mut Vec<Token>| {
        if !word.is_empty() {
            tokens.push(Token::Word(std::mem::take(word)));
        }
    };

    while i < chars.len() {
        let ch = chars[i];
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else if ch == '\\' && q == '"' && i + 1 < chars.len() {
                i += 1;
                word.push(chars[i]);
            } else {
                word.push(ch);
            }
            i += 1;
            continue;
        }
        match ch {
            '\'' | '"' => quote = Some(ch),
            ' ' | '\t' | '\r' | '\n' => flush(&mut word, &mut tokens),
            '|' => {
                flush(&mut word, &mut tokens);
                if chars.get(i + 1) == Some(&'|') {
                    tokens.push(Token::Or);
                    i += 1;
                } else {
                    tokens.push(Token::Pipe);
                }
            }
            '&' => {
                flush(&mut word, &mut tokens);
                if chars.get(i + 1) == Some(&'&') {
                    tokens.push(Token::And);
                    i += 1;
                } else {
                    tokens.push(Token::Background);
                }
            }
            ';' => {
                flush(&mut word, &mut tokens);
                tokens.push(Token::Sequence);
            }
            '<' => {
                flush(&mut word, &mut tokens);
                tokens.push(Token::Input);
            }
            '>' => {
                flush(&mut word, &mut tokens);
                if chars.get(i + 1) == Some(&'>') {
                    tokens.push(Token::Append);
                    i += 1;
                } else {
                    tokens.push(Token::Output);
                }
            }
            '(' | ')' | '`' => return Err(CommandParseError::UnsupportedSyntax(ch)),
            '\\' if i + 1 < chars.len() => {
                i += 1;
                word.push(chars[i]);
            }
            _ => word.push(ch),
        }
        i += 1;
    }
    if quote.is_some() {
        return Err(CommandParseError::UnterminatedQuote);
    }
    flush(&mut word, &mut tokens);
    Ok(tokens)
}

fn build_edges(graph: &CommandGraph) -> Vec<ExecutionEdge> {
    let mut edges = Vec::new();
    for pipeline in &graph.pipelines {
        for (index, process) in pipeline.processes.iter().enumerate() {
            edges.push(ExecutionEdge {
                source: "shell:derived".into(),
                destination: process.id.clone(),
                relation: ExecutionRelation::Controls,
            });
            if index > 0 {
                edges.push(ExecutionEdge {
                    source: pipeline.processes[index - 1].id.clone(),
                    destination: process.id.clone(),
                    relation: ExecutionRelation::Pipe,
                });
            }
            let has_input = process
                .redirections
                .iter()
                .any(|r| r.kind == RedirectionKind::Input);
            let has_output = process.redirections.iter().any(|r| {
                matches!(
                    r.kind,
                    RedirectionKind::OutputTruncate | RedirectionKind::OutputAppend
                )
            });
            if index == 0 && !has_input {
                edges.push(ExecutionEdge {
                    source: "terminal:derived".into(),
                    destination: process.id.clone(),
                    relation: ExecutionRelation::TerminalInput,
                });
            }
            if index + 1 == pipeline.processes.len() && !has_output {
                edges.push(ExecutionEdge {
                    source: process.id.clone(),
                    destination: "terminal:derived".into(),
                    relation: ExecutionRelation::TerminalOutput,
                });
            }
            for redirect in &process.redirections {
                let file = format!("file:derived:{}", redirect.file);
                match redirect.kind {
                    RedirectionKind::Input => edges.push(ExecutionEdge {
                        source: file,
                        destination: process.id.clone(),
                        relation: ExecutionRelation::FileRead,
                    }),
                    RedirectionKind::OutputTruncate | RedirectionKind::OutputAppend => {
                        edges.push(ExecutionEdge {
                            source: process.id.clone(),
                            destination: file,
                            relation: ExecutionRelation::FileWrite,
                        })
                    }
                }
            }
        }
    }
    edges
}

fn node(id: impl Into<String>, kind: NodeKind, label: impl Into<String>) -> SemanticNode {
    SemanticNode {
        id: NodeId::new(id.into()).expect("planner emits non-empty IDs"),
        kind,
        label: label.into(),
    }
}

fn scenario_from_graph(graph: &CommandGraph) -> ReplayScenario {
    let source_id = "shell-structure-parser:v1".to_owned();
    let mut sequence = 0u64;
    let mut events = Vec::new();
    let mut push = |stage: ReplayStage, event: SemanticEvent| {
        sequence += 1;
        events.push(SemanticEventEnvelope {
            schema_version: SEMANTIC_SCHEMA_VERSION.to_owned(),
            sequence,
            monotonic_time_ns: sequence * 1_000_000,
            stage,
            evidence: vec![EvidenceRef {
                source_id: source_id.clone(),
                sequence,
            }],
            event,
        });
    };
    let shell = node("shell:derived", NodeKind::Shell, "shell");
    push(
        ReplayStage::Shell,
        SemanticEvent::ShellStarted {
            shell: shell.clone(),
        },
    );
    push(
        ReplayStage::Shell,
        SemanticEvent::StandardStreamsInitialized {
            process: shell.id.clone(),
            terminal: node("terminal:derived", NodeKind::Terminal, "terminal"),
            stdin_descriptor: node("fd:shell:0", NodeKind::FileDescriptorEntry, "shell stdin"),
            stdout_descriptor: node("fd:shell:1", NodeKind::FileDescriptorEntry, "shell stdout"),
            stderr_descriptor: node("fd:shell:2", NodeKind::FileDescriptorEntry, "shell stderr"),
        },
    );

    for (pipeline_index, pipeline) in graph.pipelines.iter().enumerate() {
        for pipe_index in 0..pipeline.processes.len().saturating_sub(1) {
            push(
                ReplayStage::PipeCreation,
                SemanticEvent::PipeCreated {
                    creator: shell.id.clone(),
                    pipe: node(
                        format!("pipe:derived:{pipeline_index}:{pipe_index}"),
                        NodeKind::AnonymousPipe,
                        format!("pipeline {} conduit {}", pipeline_index + 1, pipe_index + 1),
                    ),
                    read_endpoint: node(
                        format!("pipe-end:derived:{pipeline_index}:{pipe_index}:read"),
                        NodeKind::PipeEndpoint,
                        "pipe read end",
                    ),
                    write_endpoint: node(
                        format!("pipe-end:derived:{pipeline_index}:{pipe_index}:write"),
                        NodeKind::PipeEndpoint,
                        "pipe write end",
                    ),
                    read_descriptor: node(
                        format!("fd:shell:pipe:{pipeline_index}:{pipe_index}:read"),
                        NodeKind::FileDescriptorEntry,
                        "shell pipe read fd",
                    ),
                    write_descriptor: node(
                        format!("fd:shell:pipe:{pipeline_index}:{pipe_index}:write"),
                        NodeKind::FileDescriptorEntry,
                        "shell pipe write fd",
                    ),
                },
            );
        }

        for (process_index, process) in pipeline.processes.iter().enumerate() {
            let process_id = NodeId::new(process.id.clone()).unwrap();
            let mut inherited = vec![
                InheritedDescriptor {
                    from_parent: NodeId::new("fd:shell:0").unwrap(),
                    child_descriptor: node(
                        format!("fd:{}:0", process.id),
                        NodeKind::FileDescriptorEntry,
                        "stdin",
                    ),
                },
                InheritedDescriptor {
                    from_parent: NodeId::new("fd:shell:1").unwrap(),
                    child_descriptor: node(
                        format!("fd:{}:1", process.id),
                        NodeKind::FileDescriptorEntry,
                        "stdout",
                    ),
                },
                InheritedDescriptor {
                    from_parent: NodeId::new("fd:shell:2").unwrap(),
                    child_descriptor: node(
                        format!("fd:{}:2", process.id),
                        NodeKind::FileDescriptorEntry,
                        "stderr",
                    ),
                },
            ];
            for pipe_index in 0..pipeline.processes.len().saturating_sub(1) {
                inherited.push(InheritedDescriptor {
                    from_parent: NodeId::new(format!(
                        "fd:shell:pipe:{pipeline_index}:{pipe_index}:read"
                    ))
                    .unwrap(),
                    child_descriptor: node(
                        format!("fd:{}:pipe:{pipe_index}:read", process.id),
                        NodeKind::FileDescriptorEntry,
                        "inherited pipe read fd",
                    ),
                });
                inherited.push(InheritedDescriptor {
                    from_parent: NodeId::new(format!(
                        "fd:shell:pipe:{pipeline_index}:{pipe_index}:write"
                    ))
                    .unwrap(),
                    child_descriptor: node(
                        format!("fd:{}:pipe:{pipe_index}:write", process.id),
                        NodeKind::FileDescriptorEntry,
                        "inherited pipe write fd",
                    ),
                });
            }
            push(
                ReplayStage::Fork,
                SemanticEvent::ProcessForked {
                    parent: shell.id.clone(),
                    child: node(
                        process.id.clone(),
                        NodeKind::Process,
                        process.executable.clone(),
                    ),
                    inherited_descriptors: inherited,
                },
            );

            if process_index > 0 {
                let target = NodeId::new(format!("fd:{}:0", process.id)).unwrap();
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorClosed {
                        process: process_id.clone(),
                        descriptor: target.clone(),
                    },
                );
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorDuplicated {
                        process: process_id.clone(),
                        from_descriptor: NodeId::new(format!(
                            "fd:{}:pipe:{}:read",
                            process.id,
                            process_index - 1
                        ))
                        .unwrap(),
                        to_descriptor: node(
                            target.as_str(),
                            NodeKind::FileDescriptorEntry,
                            "stdin redirected from pipe",
                        ),
                    },
                );
            }
            if process_index + 1 < pipeline.processes.len() {
                let target = NodeId::new(format!("fd:{}:1", process.id)).unwrap();
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorClosed {
                        process: process_id.clone(),
                        descriptor: target.clone(),
                    },
                );
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorDuplicated {
                        process: process_id.clone(),
                        from_descriptor: NodeId::new(format!(
                            "fd:{}:pipe:{process_index}:write",
                            process.id
                        ))
                        .unwrap(),
                        to_descriptor: node(
                            target.as_str(),
                            NodeKind::FileDescriptorEntry,
                            "stdout redirected to pipe",
                        ),
                    },
                );
            }
            for (redirect_index, redirect) in process.redirections.iter().enumerate() {
                let opened_fd = format!("fd:{}:file:{}", process.id, redirect_index);
                let access = match redirect.kind {
                    RedirectionKind::Input => FileAccess::ReadOnly,
                    RedirectionKind::OutputTruncate => FileAccess::WriteOnly,
                    RedirectionKind::OutputAppend => FileAccess::AppendOnly,
                };
                push(
                    ReplayStage::FileIo,
                    SemanticEvent::FileOpened {
                        process: process_id.clone(),
                        file: node(
                            format!("file:derived:{}", redirect.file),
                            NodeKind::RegularFile,
                            redirect.file.clone(),
                        ),
                        descriptor: node(
                            opened_fd.clone(),
                            NodeKind::FileDescriptorEntry,
                            format!("{} fd", redirect.file),
                        ),
                        access,
                    },
                );
                let target_fd = format!("fd:{}:{}", process.id, redirect.fd);
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorClosed {
                        process: process_id.clone(),
                        descriptor: NodeId::new(target_fd.clone()).unwrap(),
                    },
                );
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorDuplicated {
                        process: process_id.clone(),
                        from_descriptor: NodeId::new(opened_fd.clone()).unwrap(),
                        to_descriptor: node(
                            target_fd,
                            NodeKind::FileDescriptorEntry,
                            format!("fd {} redirected to {}", redirect.fd, redirect.file),
                        ),
                    },
                );
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorClosed {
                        process: process_id.clone(),
                        descriptor: NodeId::new(opened_fd).unwrap(),
                    },
                );
            }
            // Every child closes all inherited pipe descriptors after dup/redirection.
            // This prevents hidden writers/readers from keeping a pipe artificially alive.
            for pipe_index in 0..pipeline.processes.len().saturating_sub(1) {
                for direction in ["read", "write"] {
                    push(
                        ReplayStage::FileDescriptorRedirection,
                        SemanticEvent::FileDescriptorClosed {
                            process: process_id.clone(),
                            descriptor: NodeId::new(format!(
                                "fd:{}:pipe:{pipe_index}:{direction}",
                                process.id
                            ))
                            .unwrap(),
                        },
                    );
                }
            }
            push(
                ReplayStage::Exec,
                SemanticEvent::ProcessExecuted {
                    process: process_id,
                    executable: process.executable.clone(),
                    argv: std::iter::once(process.executable.clone())
                        .chain(process.arguments.clone())
                        .collect(),
                },
            );
        }
        // The parent shell also releases its copies after every process has inherited them.
        for pipe_index in 0..pipeline.processes.len().saturating_sub(1) {
            for direction in ["read", "write"] {
                push(
                    ReplayStage::FileDescriptorRedirection,
                    SemanticEvent::FileDescriptorClosed {
                        process: shell.id.clone(),
                        descriptor: NodeId::new(format!(
                            "fd:shell:pipe:{pipeline_index}:{pipe_index}:{direction}"
                        ))
                        .unwrap(),
                    },
                );
            }
        }
    }

    let opaque = graph.fidelity_level == FidelityLevel::OpaqueCommand;
    ReplayScenario {
        id: format!("derived:{}", stable_command_id(&graph.raw_command)),
        title: graph.raw_command.clone(),
        command: graph.raw_command.clone(),
        evidence_mode: if opaque {
            EvidenceMode::OpaqueCommand
        } else {
            EvidenceMode::StructurallyDerived
        },
        caveat: if opaque {
            "Nội bộ chương trình chưa được quan sát. Chỉ cấu trúc shell, tiến trình và I/O đã khai báo được trực quan hóa.".to_owned()
        } else {
            "SUY DIỄN TỪ CẤU TRÚC LỆNH — KHÔNG PHẢI TRACE KERNEL.".to_owned()
        },
        events,
    }
}

fn stable_command_id(command: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in command.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ActionEventType, PresentationScenario, ReplayEngine};

    fn assert_shape(
        command: &str,
        processes: usize,
        pipes: usize,
        redirects: usize,
    ) -> CommandGraph {
        let (graph, scenario) = CommandPlanner::plan(command).expect("command should parse");
        assert_eq!(
            graph
                .pipelines
                .iter()
                .map(|p| p.processes.len())
                .sum::<usize>(),
            processes
        );
        assert_eq!(
            graph
                .execution_edges
                .iter()
                .filter(|e| e.relation == ExecutionRelation::Pipe)
                .count(),
            pipes
        );
        assert_eq!(
            graph
                .pipelines
                .iter()
                .flat_map(|p| &p.processes)
                .flat_map(|p| &p.redirections)
                .count(),
            redirects
        );
        ReplayEngine::replay(&scenario).expect("derived scenario must satisfy reducer invariants");
        graph
    }

    #[test]
    fn generic_command_matrix_is_planned_without_internal_fabrication() {
        for (command, processes, pipes, redirects) in [
            ("foo", 1, 0, 0),
            ("foo arg1 arg2", 1, 0, 0),
            ("foo > out.txt", 1, 0, 1),
            ("foo >> out.txt", 1, 0, 1),
            ("foo < in.txt", 1, 0, 1),
            ("foo | bar", 2, 1, 0),
            ("foo | bar | baz", 3, 2, 0),
            ("foo < in.txt | bar > out.txt", 2, 1, 2),
        ] {
            let graph = assert_shape(command, processes, pipes, redirects);
            assert_eq!(graph.fidelity_level, FidelityLevel::OpaqueCommand);
            assert!(
                graph
                    .pipelines
                    .iter()
                    .flat_map(|p| &p.processes)
                    .all(|p| p.opaque_internals)
            );
        }
    }

    #[test]
    fn input_pipe_output_edges_have_exact_direction() {
        let graph = assert_shape("foo < in.txt | bar >> out.log", 2, 1, 2);
        assert!(graph.execution_edges.contains(&ExecutionEdge {
            source: "file:derived:in.txt".into(),
            destination: "process:derived:0:0".into(),
            relation: ExecutionRelation::FileRead
        }));
        assert!(graph.execution_edges.contains(&ExecutionEdge {
            source: "process:derived:0:0".into(),
            destination: "process:derived:0:1".into(),
            relation: ExecutionRelation::Pipe
        }));
        assert!(graph.execution_edges.contains(&ExecutionEdge {
            source: "process:derived:0:1".into(),
            destination: "file:derived:out.log".into(),
            relation: ExecutionRelation::FileWrite
        }));
        let (_, scenario) = CommandPlanner::plan("foo | bar | baz").unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let final_graph = &frames.last().unwrap().graph;
        assert!(final_graph.nodes.iter().filter(|node| node.kind == NodeKind::FileDescriptorEntry).all(|node| !node.id.as_str().contains(":pipe:")), "temporary inherited pipe descriptors must be closed after dup");
    }

    #[test]
    fn known_adapters_are_structurally_derived_without_claiming_kernel_evidence() {
        let (graph, scenario) = CommandPlanner::plan("cat a | grep x > out.txt").unwrap();
        assert_eq!(graph.fidelity_level, FidelityLevel::StructurallyDerived);
        assert_eq!(scenario.evidence_mode, EvidenceMode::StructurallyDerived);
        assert!(scenario.caveat.contains("KHÔNG PHẢI TRACE KERNEL"));
    }

    #[test]
    fn quotes_and_safe_logical_chains_are_preserved() {
        let graph = assert_shape("echo 'hello linux' && grep linux out.txt; ps &", 3, 0, 0);
        assert_eq!(graph.pipelines.len(), 3);
        assert_eq!(graph.pipelines[0].next_operator, Some(ChainOperator::And));
        assert!(graph.pipelines[2].background);
    }

    #[test]
    fn malformed_or_unsupported_syntax_is_rejected() {
        assert_eq!(
            CommandPlanner::parse(""),
            Err(CommandParseError::EmptyCommand)
        );
        assert_eq!(
            CommandPlanner::parse("foo >"),
            Err(CommandParseError::MissingRedirectTarget)
        );
        assert_eq!(
            CommandPlanner::parse("foo |"),
            Err(CommandParseError::MissingExecutable)
        );
        assert_eq!(
            CommandPlanner::parse("foo $(bar)"),
            Err(CommandParseError::UnsupportedSyntax('('))
        );
    }

    #[test]
    fn presentation_emits_typed_context_without_fake_internal_io() {
        let (graph, scenario) = CommandPlanner::plan("foo < in.txt | bar > out.txt").unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation =
            PresentationScenario::from_replay_with_command_graph(&scenario, &frames, graph);
        assert!(
            presentation
                .frames
                .iter()
                .all(|frame| frame.action_context.byte_count.is_none())
        );
        assert!(presentation.frames.iter().any(|frame| {
            frame.action_context.event_type == ActionEventType::Open
                && frame.action_context.source.as_deref() == Some("file:derived:in.txt")
                && frame.action_context.destination.as_deref() == Some("process:derived:0:0")
        }));
        assert!(presentation.frames.iter().any(|frame| {
            frame.action_context.event_type == ActionEventType::Open
                && frame.action_context.source.as_deref() == Some("process:derived:0:1")
                && frame.action_context.destination.as_deref() == Some("file:derived:out.txt")
        }));
    }

    #[test]
    fn cat_file_terminal_write_is_typed_as_cat_to_terminal() {
        let scenario = ReplayScenario::embedded_cat_file().unwrap();
        let frames = ReplayEngine::replay(&scenario).unwrap();
        let presentation = PresentationScenario::from_replay(&scenario, &frames);
        let write = presentation
            .frames
            .iter()
            .find(|frame| frame.action_context.event_type == ActionEventType::Write)
            .expect("cat fixture must write output");
        assert_eq!(write.action_context.actor.as_deref(), Some("process:cat"));
        assert_eq!(
            write.action_context.destination.as_deref(),
            Some("device:tty")
        );
        assert_eq!(
            write.action_context.target_node_kind,
            Some(NodeKind::Terminal)
        );
    }
}
