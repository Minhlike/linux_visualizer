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

export type ActionPlanType =
  | "shell_boot"
  | "stream_init"
  | "pipe_create"
  | "process_fork"
  | "fd_dup"
  | "fd_close"
  | "process_exec"
  | "file_open"
  | "byte_transfer"
  | "process_exit"
  | "process_wait"
  | "idle_overview";

export type FlowPathId =
  | "file_to_cat"
  | "cat_to_pipe"
  | "pipe_to_grep"
  | "grep_to_terminal"
  | "cat_to_terminal"
  | "echo_to_file"
  | "ls_to_terminal"
  | "ps_to_terminal"
  | "shell_to_cat"
  | "shell_to_grep"
  | "shell_to_echo"
  | "shell_to_ls"
  | "shell_to_ps";

export interface ActionPlan {
  readonly actionType: ActionPlanType;
  readonly sourceEntity: VisualEntityId;
  readonly targetEntity: VisualEntityId;
  readonly connector: "routing_rail" | "pipe_conduit" | "file_conduit" | "terminal_conduit" | "fd_socket" | "backbone_bus" | "none";
  readonly flowPath: FlowPathId | null;
  readonly mechanicalResponse: {
    readonly sourceAction: "lever_dispatch" | "hatch_open" | "hopper_intake" | "horn_charge" | "scanner_sweep" | "probe_pulse" | "terminal_pulse" | "none";
    readonly targetAction: "power_on" | "buffer_fill" | "filter_pass" | "screen_ripple" | "cassette_absorb" | "none";
    readonly durationSec: number;
  };
  readonly audioCue: string;
  readonly cameraHint: {
    readonly beat: CameraBeat;
    readonly focusEntities: readonly VisualEntityId[];
  };
}

/* ── Poses framing source + connector + destination ───────────────── */
const plantOverview = { position: [10, 8.5, 12] as Vector3Tuple, target: [0, 1.2, 0] as Vector3Tuple };
const plantWideAngle = { position: [-8, 9, 10] as Vector3Tuple, target: [0, 1.0, 0] as Vector3Tuple };

const relShots = {
  shellToChild: { position: [-5.5, 6, 8] as Vector3Tuple, target: [-1.5, 1.2, 1] as Vector3Tuple },
  fileToCat: { position: [-4.2, 6, 5] as Vector3Tuple, target: [-2.0, 1.2, 0] as Vector3Tuple },
  pipelineFlow: { position: [1.8, 6.5, 9.5] as Vector3Tuple, target: [0.5, 1.5, 1.8] as Vector3Tuple },
  catToTerm: { position: [2.5, 6.5, 7.5] as Vector3Tuple, target: [0.8, 1.2, -1.5] as Vector3Tuple },
  grepToTerm: { position: [5.2, 6, 5.5] as Vector3Tuple, target: [3.2, 1.2, -1.5] as Vector3Tuple },
  echoToFile: { position: [-4.5, 6, 5] as Vector3Tuple, target: [-2.5, 1.2, -1.5] as Vector3Tuple },
  lsToTerm: { position: [3, 7, 7] as Vector3Tuple, target: [1, 1.2, -1.5] as Vector3Tuple },
  psToTerm: { position: [3, 7, 7] as Vector3Tuple, target: [1, 1.2, -1.5] as Vector3Tuple },
  terminalIo: { position: [5, 5, -5] as Vector3Tuple, target: [3.2, 1.2, -3.5] as Vector3Tuple },
} as const;

const flowShots = {
  pipe: { position: [2.8, 5, 8] as Vector3Tuple, target: [0.5, 1.6, 1.8] as Vector3Tuple },
  fileRead: { position: [-3.5, 5, 3] as Vector3Tuple, target: [-2.8, 1.2, -1.5] as Vector3Tuple },
  termWrite: { position: [4.5, 5, -2] as Vector3Tuple, target: [3.4, 1.2, -3.5] as Vector3Tuple },
} as const;

const mechShots: Readonly<Partial<Record<VisualEntityId, { position: Vector3Tuple; target: Vector3Tuple }>>> = {
  shell: { position: [-5.5, 4, 3] as Vector3Tuple, target: [-6.5, 1.2, -1] as Vector3Tuple },
  cat: { position: [-2, 4, 5.5] as Vector3Tuple, target: [-2.2, 1.5, 1.2] as Vector3Tuple },
  grep: { position: [3.2, 4, 5.5] as Vector3Tuple, target: [3.2, 1.5, 1.2] as Vector3Tuple },
  echo: { position: [-2, 4, 5.5] as Vector3Tuple, target: [-2.2, 1.5, 1.2] as Vector3Tuple },
  ls: { position: [-2, 4, 5.5] as Vector3Tuple, target: [-2.2, 1.5, 1.2] as Vector3Tuple },
  ps: { position: [-2, 4, 5.5] as Vector3Tuple, target: [-2.2, 1.5, 1.2] as Vector3Tuple },
  filesystem: { position: [-3.6, 4.5, -1.5] as Vector3Tuple, target: [-3.6, 1.2, -4.5] as Vector3Tuple },
  terminal: { position: [4.5, 4.5, -1.5] as Vector3Tuple, target: [3.6, 1.2, -4.5] as Vector3Tuple },
};

export function resolveActionPlan(
  eventKind: string,
  stage: string,
  focusNodeIds: readonly string[],
  sequence: number,
  totalFrames: number,
): ActionPlan {
  // 1. Identify specific child process from focus IDs
  let childEntity: VisualEntityId = "cat";
  if (focusNodeIds.some((id) => id.includes("grep"))) childEntity = "grep";
  else if (focusNodeIds.some((id) => id.includes("echo"))) childEntity = "echo";
  else if (focusNodeIds.some((id) => id.includes("ls"))) childEntity = "ls";
  else if (focusNodeIds.some((id) => id.includes("ps"))) childEntity = "ps";
  else if (focusNodeIds.some((id) => id.includes("cat"))) childEntity = "cat";

  // 2. Map canonical semantic events to exact ActionPlans
  switch (eventKind) {
    case "shell_started":
      return {
        actionType: "shell_boot",
        sourceEntity: "shell",
        targetEntity: "shell",
        connector: "none",
        flowPath: null,
        mechanicalResponse: { sourceAction: "lever_dispatch", targetAction: "power_on", durationSec: 1.2 },
        audioCue: "shell_started",
        cameraHint: { beat: "establish", focusEntities: ["shell"] },
      };

    case "standard_streams_initialized":
      return {
        actionType: "stream_init",
        sourceEntity: "shell",
        targetEntity: "terminal",
        connector: "terminal_conduit",
        flowPath: null,
        mechanicalResponse: { sourceAction: "lever_dispatch", targetAction: "screen_ripple", durationSec: 1.0 },
        audioCue: "standard_streams_initialized",
        cameraHint: { beat: "relationship", focusEntities: ["shell", "terminal"] },
      };

    case "pipe_created":
      return {
        actionType: "pipe_create",
        sourceEntity: "shell",
        targetEntity: "pipe",
        connector: "pipe_conduit",
        flowPath: null,
        mechanicalResponse: { sourceAction: "lever_dispatch", targetAction: "power_on", durationSec: 1.1 },
        audioCue: "pipe_created",
        cameraHint: { beat: "relationship", focusEntities: ["shell", "pipe"] },
      };

    case "process_forked": {
      let flowPath: FlowPathId = "shell_to_cat";
      if (childEntity === "grep") flowPath = "shell_to_grep";
      else if (childEntity === "echo") flowPath = "shell_to_echo";
      else if (childEntity === "ls") flowPath = "shell_to_ls";
      else if (childEntity === "ps") flowPath = "shell_to_ps";

      return {
        actionType: "process_fork",
        sourceEntity: "shell",
        targetEntity: childEntity,
        connector: "routing_rail",
        flowPath,
        mechanicalResponse: { sourceAction: "lever_dispatch", targetAction: "power_on", durationSec: 1.25 },
        audioCue: "process_forked",
        cameraHint: { beat: "relationship", focusEntities: ["shell", childEntity] },
      };
    }

    case "file_descriptor_duplicated":
      return {
        actionType: "fd_dup",
        sourceEntity: childEntity,
        targetEntity: childEntity,
        connector: "fd_socket",
        flowPath: null,
        mechanicalResponse: { sourceAction: "none", targetAction: "buffer_fill", durationSec: 0.9 },
        audioCue: "file_descriptor_duplicated",
        cameraHint: { beat: "mechanism", focusEntities: [childEntity] },
      };

    case "file_descriptor_closed":
      return {
        actionType: "fd_close",
        sourceEntity: childEntity,
        targetEntity: childEntity,
        connector: "fd_socket",
        flowPath: null,
        mechanicalResponse: { sourceAction: "none", targetAction: "none", durationSec: 0.8 },
        audioCue: "file_descriptor_closed",
        cameraHint: { beat: "relationship", focusEntities: [childEntity] },
      };

    case "process_executed":
      return {
        actionType: "process_exec",
        sourceEntity: childEntity,
        targetEntity: childEntity,
        connector: "none",
        flowPath: null,
        mechanicalResponse: { sourceAction: "hopper_intake", targetAction: "power_on", durationSec: 1.2 },
        audioCue: "process_executed",
        cameraHint: { beat: "mechanism", focusEntities: [childEntity] },
      };

    case "file_opened":
      return {
        actionType: "file_open",
        sourceEntity: "filesystem",
        targetEntity: childEntity,
        connector: "file_conduit",
        flowPath: null,
        mechanicalResponse: { sourceAction: "hatch_open", targetAction: "none", durationSec: 1.1 },
        audioCue: "file_opened",
        cameraHint: { beat: "relationship", focusEntities: ["filesystem", childEntity] },
      };

    case "bytes_read": {
      // Differentiate between File Read vs Pipe Read
      if (stage === "pipe_io" || focusNodeIds.some((id) => id.startsWith("pipe:"))) {
        return {
          actionType: "byte_transfer",
          sourceEntity: "pipe",
          targetEntity: "grep",
          connector: "pipe_conduit",
          flowPath: "pipe_to_grep",
          mechanicalResponse: { sourceAction: "none", targetAction: "filter_pass", durationSec: 1.35 },
          audioCue: "bytes_read",
          cameraHint: { beat: "flow", focusEntities: ["pipe", "grep"] },
        };
      }
      return {
        actionType: "byte_transfer",
        sourceEntity: "filesystem",
        targetEntity: childEntity,
        connector: "file_conduit",
        flowPath: childEntity === "cat" ? "file_to_cat" : null,
        mechanicalResponse: { sourceAction: "hatch_open", targetAction: "buffer_fill", durationSec: 1.35 },
        audioCue: "bytes_read",
        cameraHint: { beat: "flow", focusEntities: ["filesystem", childEntity] },
      };
    }

    case "bytes_written": {
      if (stage === "pipe_io") {
        return {
          actionType: "byte_transfer",
          sourceEntity: "cat",
          targetEntity: "pipe",
          connector: "pipe_conduit",
          flowPath: "cat_to_pipe",
          mechanicalResponse: { sourceAction: "hopper_intake", targetAction: "buffer_fill", durationSec: 1.35 },
          audioCue: "bytes_written",
          cameraHint: { beat: "flow", focusEntities: ["cat", "pipe"] },
        };
      }
      if (childEntity === "echo") {
        return {
          actionType: "byte_transfer",
          sourceEntity: "echo",
          targetEntity: "filesystem",
          connector: "file_conduit",
          flowPath: "echo_to_file",
          mechanicalResponse: { sourceAction: "horn_charge", targetAction: "cassette_absorb", durationSec: 1.35 },
          audioCue: "bytes_written",
          cameraHint: { beat: "flow", focusEntities: ["echo", "filesystem"] },
        };
      }
      if (childEntity === "ls") {
        return {
          actionType: "byte_transfer",
          sourceEntity: "ls",
          targetEntity: "terminal",
          connector: "terminal_conduit",
          flowPath: "ls_to_terminal",
          mechanicalResponse: { sourceAction: "scanner_sweep", targetAction: "screen_ripple", durationSec: 1.35 },
          audioCue: "bytes_written",
          cameraHint: { beat: "flow", focusEntities: ["ls", "terminal"] },
        };
      }
      if (childEntity === "ps") {
        return {
          actionType: "byte_transfer",
          sourceEntity: "ps",
          targetEntity: "terminal",
          connector: "terminal_conduit",
          flowPath: "ps_to_terminal",
          mechanicalResponse: { sourceAction: "probe_pulse", targetAction: "screen_ripple", durationSec: 1.35 },
          audioCue: "bytes_written",
          cameraHint: { beat: "flow", focusEntities: ["ps", "terminal"] },
        };
      }
      if (childEntity === "grep" || stage === "terminal_io") {
        return {
          actionType: "byte_transfer",
          sourceEntity: "grep",
          targetEntity: "terminal",
          connector: "terminal_conduit",
          flowPath: "grep_to_terminal",
          mechanicalResponse: { sourceAction: "none", targetAction: "screen_ripple", durationSec: 1.35 },
          audioCue: "bytes_written",
          cameraHint: { beat: "flow", focusEntities: ["grep", "terminal"] },
        };
      }
      // CAT single command write to terminal (cat sample.txt - scenario C)
      return {
        actionType: "byte_transfer",
        sourceEntity: "cat",
        targetEntity: "terminal",
        connector: "terminal_conduit",
        flowPath: "cat_to_terminal",
        mechanicalResponse: { sourceAction: "hopper_intake", targetAction: "screen_ripple", durationSec: 1.35 },
        audioCue: "bytes_written",
        cameraHint: { beat: "flow", focusEntities: ["cat", "terminal"] },
      };
    }

    case "process_exited":
      return {
        actionType: "process_exit",
        sourceEntity: childEntity,
        targetEntity: childEntity,
        connector: "none",
        flowPath: null,
        mechanicalResponse: { sourceAction: "none", targetAction: "none", durationSec: 1.0 },
        audioCue: "process_exited",
        cameraHint: { beat: "recovery", focusEntities: [childEntity] },
      };

    case "process_waited":
      return {
        actionType: "process_wait",
        sourceEntity: "shell",
        targetEntity: childEntity,
        connector: "routing_rail",
        flowPath: null,
        mechanicalResponse: { sourceAction: "lever_dispatch", targetAction: "none", durationSec: 1.0 },
        audioCue: "process_waited",
        cameraHint: { beat: "recovery", focusEntities: ["shell", childEntity] },
      };

    default:
      return {
        actionType: "idle_overview",
        sourceEntity: "overview",
        targetEntity: "overview",
        connector: "none",
        flowPath: null,
        mechanicalResponse: { sourceAction: "none", targetAction: "none", durationSec: 1.0 },
        audioCue: "unknown",
        cameraHint: { beat: sequence >= totalFrames && totalFrames > 0 ? "recovery" : "establish", focusEntities: ["overview"] },
      };
  }
}

export function resolveCameraDirective(
  semanticNodeIds: readonly string[],
  stage: string,
  sequence: number,
  totalFrames = 0,
  mode: CameraFollowMode = "gentle",
): CameraDirective {
  const plan = resolveActionPlan(
    "", // fallback if direct call
    stage,
    semanticNodeIds,
    sequence,
    totalFrames,
  );

  return resolveCameraDirectiveFromActionPlan(plan, sequence, totalFrames, mode);
}

export function resolveCameraDirectiveFromActionPlan(
  plan: ActionPlan,
  sequence: number,
  totalFrames: number,
  mode: CameraFollowMode = "gentle",
): CameraDirective {
  if (mode === "free") {
    return { entityId: "overview", sequence, beat: "establish", ...plantOverview };
  }

  const beat = plan.cameraHint.beat;
  const src = plan.sourceEntity;
  const tgt = plan.targetEntity;

  let entityId: VisualEntityId = src !== "overview" ? src : "overview";
  let pose = plantOverview;

  if (mode === "gentle") {
    switch (beat) {
      case "establish":
        pose = plantOverview;
        entityId = "overview";
        break;

      case "relationship":
        if (src === "shell" && tgt === "cat") pose = relShots.shellToChild;
        else if (src === "shell" && tgt === "grep") pose = relShots.shellToChild;
        else if (src === "filesystem") pose = relShots.fileToCat;
        else if (src === "echo") pose = relShots.echoToFile;
        else if (src === "ls") pose = relShots.lsToTerm;
        else if (src === "ps") pose = relShots.psToTerm;
        else if (tgt === "pipe") pose = relShots.pipelineFlow;
        else if (tgt === "terminal") pose = relShots.terminalIo;
        else pose = relShots.shellToChild;
        break;

      case "flow":
        if (plan.flowPath === "cat_to_pipe" || plan.flowPath === "pipe_to_grep") pose = flowShots.pipe;
        else if (plan.flowPath === "file_to_cat" || plan.flowPath === "echo_to_file") pose = flowShots.fileRead;
        else if (plan.flowPath === "cat_to_terminal") pose = relShots.catToTerm;
        else if (plan.flowPath === "grep_to_terminal" || plan.flowPath === "ls_to_terminal" || plan.flowPath === "ps_to_terminal") pose = flowShots.termWrite;
        else pose = relShots.pipelineFlow;
        break;

      case "mechanism":
        pose = mechShots[src] ?? relShots.shellToChild;
        break;

      case "recovery":
        pose = plantWideAngle;
        entityId = "overview";
        break;
    }
  } else {
    // Auto mode
    switch (beat) {
      case "establish":
      case "recovery":
        pose = plantOverview;
        entityId = "overview";
        break;

      default:
        pose = mechShots[src] ?? relShots.shellToChild;
        break;
    }
  }

  return { entityId, sequence, beat, ...pose };
}
