export type SemanticFocusReason =
  | "command_parse"
  | "runtime_event"
  | "learner_selection"
  | "lesson_step";

export interface SemanticFocusRequest {
  readonly semanticNodeIds: readonly string[];
  readonly reason: SemanticFocusReason;
  readonly requestedAtRevision: number;
}

export type CameraFollowMode = "gentle" | "auto" | "free";

export type VisualEntityId =
  | "overview"
  | "shell"
  | "cat"
  | "grep"
  | "echo"
  | "ls"
  | "ps"
  | "filesystem"
  | "terminal"
  | "kernel"
  | "pipe";

export type NarrativeBeat =
  | "initial_overview"
  | "orchestration"
  | "io_pipeline"
  | "final_overview";

export type Vector3Tuple = readonly [number, number, number];

export interface CameraDirective {
  readonly entityId: VisualEntityId;
  readonly sequence: number;
  readonly beat: NarrativeBeat;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
}

/* Individual entity poses — used by auto mode */
const entityPoses: Readonly<
  Record<VisualEntityId, { position: Vector3Tuple; target: Vector3Tuple }>
> = {
  overview: { position: [14, 11, 16], target: [0, 1.2, -1] },
  shell: { position: [-10, 7.5, 10], target: [-4.5, 1.6, -0.5] },
  cat: { position: [-7.5, 6, 9.5], target: [-1.5, 1.6, 0.8] },
  echo: { position: [-7.5, 6, 9.5], target: [-1.5, 1.6, 0.8] },
  ls: { position: [-7.5, 6, 9.5], target: [-1.5, 1.6, 0.8] },
  ps: { position: [-7.5, 6, 9.5], target: [-1.5, 1.6, 0.8] },
  grep: { position: [8.5, 6.5, 9.5], target: [2.2, 1.6, 0.8] },
  filesystem: { position: [-8.5, 6.8, -9], target: [-2.2, 1.4, -3.8] },
  terminal: { position: [8, 7, -8.5], target: [2, 1.4, -3.5] },
  kernel: { position: [6.5, 7.5, -9], target: [0.5, 1.5, -2] },
  pipe: { position: [5.2, 6.8, 11], target: [0.6, 1.8, 1] },
};

/* Relationship poses — camera sees 2–3 entities interacting (gentle mode) */
const relationshipPoses = {
  pipelineFlow: { position: [2, 10, 15], target: [0.5, 1.5, 0.8] },
  shellSpawn: { position: [-1, 11, 14], target: [-1.5, 1.5, 0] },
  fileAccess: { position: [-5, 9, 7], target: [-3, 1.2, -2] },
  terminalIo: { position: [4, 9, 6], target: [1.5, 1.2, -2] },
} as const;

export function resolveNarrativeBeat(
  stage: string,
  sequence: number,
  totalFrames: number,
): NarrativeBeat {
  if (sequence <= 1) return "initial_overview";
  if (totalFrames > 0 && sequence >= totalFrames) return "final_overview";
  if (stage === "shell" || stage === "pipe_creation" || stage === "fork") {
    return "orchestration";
  }
  if (stage === "pipe_io" || stage === "file_io" || stage === "terminal_io" || stage === "exec") {
    return "io_pipeline";
  }
  if (stage === "exit" || stage === "wait") {
    return "final_overview";
  }
  return "orchestration";
}

export function resolveCameraDirective(
  semanticNodeIds: readonly string[],
  stage: string,
  sequence: number,
  totalFrames = 0,
  mode: CameraFollowMode = "gentle",
): CameraDirective {
  const beat = resolveNarrativeBeat(stage, sequence, totalFrames);

  let entityId: VisualEntityId = "overview";
  let pose = entityPoses.overview;

  if (mode === "gentle") {
    switch (beat) {
      case "initial_overview":
      case "final_overview":
        entityId = "overview";
        pose = entityPoses.overview;
        break;
      case "orchestration":
        entityId = "shell";
        pose = relationshipPoses.shellSpawn;
        break;
      case "io_pipeline":
        if (stage === "pipe_io" || semanticNodeIds.some((id) => id.startsWith("pipe:"))) {
          entityId = "pipe";
          pose = relationshipPoses.pipelineFlow;
        } else if (semanticNodeIds.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc"))) {
          entityId = "filesystem";
          pose = relationshipPoses.fileAccess;
        } else if (semanticNodeIds.some((id) => id.includes("tty") || id.includes("terminal"))) {
          entityId = "terminal";
          pose = relationshipPoses.terminalIo;
        } else {
          entityId = "kernel";
          pose = relationshipPoses.pipelineFlow;
        }
        break;
    }
  } else {
    if (stage === "pipe_io" || semanticNodeIds.some((id) => id.startsWith("pipe:"))) {
      entityId = "pipe";
    } else if (semanticNodeIds.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc"))) {
      entityId = "filesystem";
    } else if (semanticNodeIds.some((id) => id.includes("tty") || id.includes("terminal"))) {
      entityId = "terminal";
    } else if (semanticNodeIds.some((id) => id.includes("grep"))) {
      entityId = "grep";
    } else if (semanticNodeIds.some((id) => id.includes("echo"))) {
      entityId = "echo";
    } else if (semanticNodeIds.some((id) => id.includes("ls"))) {
      entityId = "ls";
    } else if (semanticNodeIds.some((id) => id.includes("ps"))) {
      entityId = "ps";
    } else if (semanticNodeIds.some((id) => id.includes("cat"))) {
      entityId = "cat";
    } else if (semanticNodeIds.some((id) => id.includes("shell"))) {
      entityId = "shell";
    } else {
      entityId = beat === "final_overview" || beat === "initial_overview" ? "overview" : "kernel";
    }
    pose = entityPoses[entityId] ?? entityPoses.overview;
  }

  return { entityId, sequence, beat, ...pose };
}
