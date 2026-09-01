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

export type CameraBeat =
  | "establish"
  | "relationship"
  | "flow"
  | "mechanism"
  | "recovery";

export type Vector3Tuple = readonly [number, number, number];

export interface CameraDirective {
  readonly entityId: VisualEntityId;
  readonly sequence: number;
  readonly beat: CameraBeat;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
}

/* ── Shot Grammar ─────────────────────────────────────────────────
   ESTABLISH   → wide overview of the entire plant
   RELATIONSHIP → frame source + connector + destination together
   FLOW        → medium shot following data flow path
   MECHANISM   → close-up on active module machinery (used sparingly)
   RECOVERY    → pull back to establish after completion/exit
   ───────────────────────────────────────────────────────────────── */

/* Plant-relative poses: the entire plant is compact [-4..3, 0, -3..3] */
const plantOverview = { position: [10, 8.5, 12] as Vector3Tuple, target: [0, 1.2, 0] as Vector3Tuple };
const plantWideAngle = { position: [-8, 9, 10] as Vector3Tuple, target: [0, 1.0, 0] as Vector3Tuple };

/* Relationship shots: 2-3 modules + conduit visible */
const relShots = {
  shellToChild: { position: [-5, 6, 8] as Vector3Tuple, target: [-1, 1.2, 1] as Vector3Tuple },
  fileToCat: { position: [-4, 6, 5] as Vector3Tuple, target: [-1.5, 1.2, 0] as Vector3Tuple },
  pipelineFlow: { position: [2, 7, 10] as Vector3Tuple, target: [0.5, 1.5, 2] as Vector3Tuple },
  grepToTerm: { position: [5, 6, 5] as Vector3Tuple, target: [2.5, 1.2, 0] as Vector3Tuple },
  echoToFile: { position: [-4, 6, 5] as Vector3Tuple, target: [-1.5, 1.2, 0] as Vector3Tuple },
  lsToTerm: { position: [3, 7, 7] as Vector3Tuple, target: [1, 1.2, 0] as Vector3Tuple },
  psToTerm: { position: [3, 7, 7] as Vector3Tuple, target: [1, 1.2, 0] as Vector3Tuple },
  terminalIo: { position: [5, 5, -5] as Vector3Tuple, target: [2.5, 1.2, -2] as Vector3Tuple },
} as const;

/* Flow shots: medium framing of data path */
const flowShots = {
  pipe: { position: [3, 5, 8] as Vector3Tuple, target: [0.5, 1.6, 2.5] as Vector3Tuple },
  fileRead: { position: [-3, 5, 3] as Vector3Tuple, target: [-2, 1.2, -1] as Vector3Tuple },
  termWrite: { position: [4, 5, -2] as Vector3Tuple, target: [3, 1.2, -3] as Vector3Tuple },
} as const;

/* Mechanism detail (used sparingly — only on exec/fork) */
const mechShots: Readonly<Partial<Record<VisualEntityId, { position: Vector3Tuple; target: Vector3Tuple }>>> = {
  shell: { position: [-5.5, 4, 3] as Vector3Tuple, target: [-4, 1.5, 0] as Vector3Tuple },
  cat: { position: [-2, 4, 5.5] as Vector3Tuple, target: [-1.5, 1.5, 2.5] as Vector3Tuple },
  grep: { position: [3, 4, 5.5] as Vector3Tuple, target: [2.5, 1.5, 2.5] as Vector3Tuple },
  kernel: { position: [2, 5, -1] as Vector3Tuple, target: [0, 2, 0] as Vector3Tuple },
};

export function resolveCameraBeat(
  stage: string,
  sequence: number,
  totalFrames: number,
): CameraBeat {
  if (sequence <= 1) return "establish";
  if (totalFrames > 0 && sequence >= totalFrames) return "recovery";
  if (stage === "exit" || stage === "wait") return "recovery";

  if (stage === "fork" || stage === "exec") return "mechanism";
  if (stage === "pipe_creation" || stage === "file_descriptor_redirection") return "relationship";
  if (stage === "shell") return "establish";

  if (stage === "pipe_io" || stage === "file_io" || stage === "terminal_io") return "flow";

  return "relationship";
}

export function resolveCameraDirective(
  semanticNodeIds: readonly string[],
  stage: string,
  sequence: number,
  totalFrames = 0,
  mode: CameraFollowMode = "gentle",
): CameraDirective {
  const beat = resolveCameraBeat(stage, sequence, totalFrames);

  /* Free mode: no camera changes */
  if (mode === "free") {
    return { entityId: "overview", sequence, beat, ...plantOverview };
  }

  /* Resolve which entity is primary focus */
  let entityId: VisualEntityId = "overview";
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
  }

  /* Resolve camera pose based on beat + entity */
  let pose = plantOverview;

  if (mode === "gentle") {
    switch (beat) {
      case "establish":
        pose = plantOverview;
        entityId = "overview";
        break;

      case "relationship":
        if (entityId === "pipe") pose = relShots.pipelineFlow;
        else if (entityId === "filesystem") pose = relShots.fileToCat;
        else if (entityId === "terminal") pose = relShots.terminalIo;
        else if (entityId === "echo") pose = relShots.echoToFile;
        else if (entityId === "ls") pose = relShots.lsToTerm;
        else if (entityId === "ps") pose = relShots.psToTerm;
        else if (entityId === "grep") pose = relShots.grepToTerm;
        else pose = relShots.shellToChild;
        break;

      case "flow":
        if (entityId === "pipe") pose = flowShots.pipe;
        else if (entityId === "filesystem") pose = flowShots.fileRead;
        else if (entityId === "terminal") pose = flowShots.termWrite;
        else pose = relShots.pipelineFlow;
        break;

      case "mechanism":
        pose = mechShots[entityId] ?? relShots.shellToChild;
        break;

      case "recovery":
        entityId = "overview";
        pose = plantWideAngle;
        break;
    }
  } else {
    /* Auto mode: tighter framing per entity */
    switch (beat) {
      case "establish":
      case "recovery":
        entityId = "overview";
        pose = plantOverview;
        break;

      default:
        if (entityId === "pipe") pose = flowShots.pipe;
        else if (entityId === "filesystem") pose = relShots.fileToCat;
        else if (entityId === "terminal") pose = relShots.terminalIo;
        else if (entityId === "grep") pose = relShots.grepToTerm;
        else if (entityId === "echo") pose = relShots.echoToFile;
        else if (entityId === "shell") pose = mechShots.shell ?? relShots.shellToChild;
        else if (entityId === "cat") pose = mechShots.cat ?? relShots.fileToCat;
        else if (entityId === "ls") pose = relShots.lsToTerm;
        else if (entityId === "ps") pose = relShots.psToTerm;
        else pose = plantOverview;
        break;
    }
  }

  return { entityId, sequence, beat, ...pose };
}

/* Backward compat re-exports */
export type NarrativeBeat = CameraBeat;
export const resolveNarrativeBeat = resolveCameraBeat;
