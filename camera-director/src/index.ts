export type CameraFollowMode = "gentle" | "auto" | "free";
export type CameraBeat = "establish" | "relationship" | "flow" | "mechanism" | "recovery";
export type Vector3Tuple = readonly [number, number, number];

export type SemanticNodeKind =
  | "shell" | "process" | "anonymous_pipe" | "pipe_endpoint"
  | "file_descriptor_entry" | "open_file_description" | "regular_file"
  | "terminal" | "directory";
export type EvidenceMode = "synthetic_replay" | "structurally_derived" | "opaque_command";
export type ClaimConfidence = "observed" | "inferred" | "approximation" | "unknown";
export type FileAccess = "read_only" | "write_only" | "append_only" | "read_write";
export type RelationKind =
  | "parent_of" | "has_file_descriptor" | "refers_to" | "read_end_of"
  | "write_end_of" | "reads_from" | "writes_to" | "executes" | "waits_for";

export type ActionEventType =
  | "shell_start" | "stream_init" | "pipe_create" | "spawn" | "fd_duplicate"
  | "fd_close" | "exec" | "open" | "read" | "write" | "exit" | "wait"
  | "unknown_internal";

/** Renderer-neutral action input emitted by semantic-core. */
export interface ActionContext {
  readonly event_type: ActionEventType;
  readonly actor: string | null;
  readonly parent: string | null;
  readonly child: string | null;
  readonly executable: string | null;
  readonly descriptor: string | null;
  readonly descriptor_target: string | null;
  readonly target_node_kind: SemanticNodeKind | null;
  readonly source: string | null;
  readonly destination: string | null;
  readonly relation: RelationKind | null;
  readonly byte_count: number | null;
  readonly file_access: FileAccess | null;
  readonly pipeline_id: string | null;
  readonly evidence_mode: EvidenceMode;
  readonly confidence: ClaimConfidence;
}

export type VisualRole =
  | "overview" | "shell" | "process" | "cat" | "grep" | "echo" | "ls" | "ps"
  | "filesystem" | "terminal" | "kernel" | "pipe" | "fd";
export type VisualEntityId = string;

export interface ActionEndpoint {
  readonly semanticId: string;
  readonly role: VisualRole;
  readonly label: string;
}

export type ActionPrimitive =
  | "SPAWN" | "EXEC" | "OPEN" | "READ" | "WRITE" | "PIPE_CREATE"
  | "FD_DUP" | "FD_CLOSE" | "REDIRECT" | "WAIT" | "EXIT" | "TERMINAL_IO"
  | "UNKNOWN_INTERNAL" | "SHELL_START" | "STREAM_INIT";

export type MechanicalActuation =
  | "lever_dispatch" | "hatch_open" | "hopper_intake" | "horn_charge"
  | "scanner_sweep" | "probe_pulse" | "terminal_pulse" | "port_rotate"
  | "valve_open" | "chassis_lock" | "power_down" | "none";
export type MechanicalReaction =
  | "power_on" | "buffer_fill" | "filter_pass" | "screen_ripple"
  | "cassette_absorb" | "port_latch" | "chassis_settle" | "power_down" | "none";

export interface ActionPlan {
  readonly primitive: ActionPrimitive;
  readonly source: ActionEndpoint;
  readonly target: ActionEndpoint;
  readonly connector: "routing_rail" | "pipe_conduit" | "file_conduit" | "terminal_conduit" | "fd_socket" | "backbone_bus" | "none";
  readonly flowPath: { readonly id: string; readonly sourceId: string; readonly destinationId: string } | null;
  readonly mechanicalResponse: {
    readonly anticipation: number;
    readonly actuation: MechanicalActuation;
    readonly transfer: boolean;
    readonly reaction: MechanicalReaction;
    readonly settle: number;
    readonly durationSec: number;
  };
  readonly audioCue: ActionPrimitive;
  readonly cameraHint: { readonly beat: CameraBeat; readonly focusEntities: readonly string[] };
  readonly evidenceMode: EvidenceMode;
  readonly confidence: ClaimConfidence;
}

export interface CameraDirective {
  readonly entityId: string;
  readonly sequence: number;
  readonly beat: CameraBeat;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
  readonly durationSec: number;
}

function basename(executable: string | null): string | null {
  if (!executable) return null;
  return executable.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? null;
}

function roleFor(id: string | null, executable: string | null, kind: SemanticNodeKind | null): VisualRole {
  if (!id) return "overview";
  if (kind === "shell") return "shell";
  if (kind === "anonymous_pipe" || kind === "pipe_endpoint") return "pipe";
  if (kind === "regular_file" || kind === "directory" || kind === "open_file_description") return "filesystem";
  if (kind === "terminal") return "terminal";
  if (kind === "file_descriptor_entry") return "fd";
  const exe = basename(executable);
  if (exe === "cat" || exe === "grep" || exe === "echo" || exe === "ls" || exe === "ps") return exe;
  if (id === "shell:derived" || id === "shell:main") return "shell";
  return "process";
}

function endpoint(id: string | null, executable: string | null, kind: SemanticNodeKind | null): ActionEndpoint {
  const semanticId = id ?? "overview";
  const role = roleFor(id, executable, kind);
  return { semanticId, role, label: role === "process" ? (basename(executable) ?? "opaque process") : role };
}

const response = (
  actuation: MechanicalActuation,
  reaction: MechanicalReaction,
  durationSec: number,
  transfer = false,
) => ({ anticipation: 0.18, actuation, transfer, reaction, settle: 0.18, durationSec });

function processActuation(role: VisualRole): MechanicalActuation {
  if (role === "cat") return "hopper_intake";
  if (role === "echo") return "horn_charge";
  if (role === "ls") return "scanner_sweep";
  if (role === "ps") return "probe_pulse";
  return "chassis_lock";
}

function processReaction(role: VisualRole): MechanicalReaction {
  if (role === "grep") return "filter_pass";
  return role === "process" ? "chassis_settle" : "buffer_fill";
}

/** The only semantic-to-choreography resolver. No stage, summary, ID substring, or scenario heuristic. */
export function resolveActionPlan(context: ActionContext): ActionPlan {
  const actor = endpoint(context.actor, context.executable, null);
  const child = endpoint(context.child, context.executable, "process");
  const targetKind = context.target_node_kind;
  let source = endpoint(context.source ?? context.actor, context.executable, null);
  let target = endpoint(context.destination ?? context.descriptor_target ?? context.actor, context.executable, targetKind);
  let primitive: ActionPrimitive = "UNKNOWN_INTERNAL";
  let connector: ActionPlan["connector"] = "none";
  let mechanicalResponse = response("none", "none", 1);
  let beat: CameraBeat = "mechanism";
  let transfer = false;

  switch (context.event_type) {
    case "shell_start":
      primitive = "SHELL_START"; source = endpoint(context.actor, null, "shell"); target = source; beat = "establish";
      mechanicalResponse = response("lever_dispatch", "power_on", 1.2); break;
    case "stream_init":
      primitive = "STREAM_INIT"; source = endpoint(context.actor, null, "shell"); target = endpoint(context.destination, null, "terminal"); connector = "terminal_conduit"; beat = "relationship";
      mechanicalResponse = response("lever_dispatch", "screen_ripple", 1); break;
    case "pipe_create":
      primitive = "PIPE_CREATE"; source = endpoint(context.actor, null, "shell"); target = endpoint(context.destination, null, "anonymous_pipe"); connector = "pipe_conduit"; beat = "relationship";
      mechanicalResponse = response("valve_open", "power_on", 1.1); break;
    case "spawn":
      primitive = "SPAWN"; source = endpoint(context.parent ?? context.actor, null, "shell"); target = child;
      connector = "routing_rail"; beat = "relationship";
      mechanicalResponse = response("lever_dispatch", "power_on", 1.25, true); break;
    case "fd_duplicate":
      primitive = context.descriptor_target ? "REDIRECT" : "FD_DUP"; source = actor; target = endpoint(context.descriptor_target ?? context.descriptor, context.executable, targetKind);
      connector = "fd_socket"; mechanicalResponse = response("port_rotate", "port_latch", 0.9); break;
    case "fd_close":
      primitive = "FD_CLOSE"; source = actor; target = actor; connector = "fd_socket";
      mechanicalResponse = response("port_rotate", "none", 0.8); break;
    case "exec":
      primitive = "EXEC"; source = actor; target = actor;
      mechanicalResponse = response(processActuation(actor.role), "power_on", 1.2); break;
    case "open": {
      primitive = "OPEN"; connector = "file_conduit"; beat = "relationship";
      const file = endpoint(context.descriptor_target, null, targetKind);
      if (context.file_access === "read_only") { source = file; target = actor; }
      else { source = actor; target = file; }
      mechanicalResponse = response("hatch_open", context.file_access === "read_only" ? processReaction(actor.role) : "cassette_absorb", 1.1);
      break;
    }
    case "read":
      primitive = "READ"; source = endpoint(context.source, null, targetKind); target = actor;
      connector = targetKind === "pipe_endpoint" || targetKind === "anonymous_pipe" ? "pipe_conduit" : targetKind === "terminal" ? "terminal_conduit" : "file_conduit";
      beat = "flow"; transfer = true;
      mechanicalResponse = response(source.role === "filesystem" ? "hatch_open" : "valve_open", processReaction(actor.role), 1.35, true); break;
    case "write":
      primitive = context.target_node_kind === "terminal" ? "TERMINAL_IO" : "WRITE";
      source = actor; target = endpoint(context.destination, null, targetKind);
      connector = target.role === "pipe" ? "pipe_conduit" : target.role === "terminal" ? "terminal_conduit" : "file_conduit";
      beat = "flow"; transfer = true;
      mechanicalResponse = response(processActuation(actor.role), target.role === "terminal" ? "screen_ripple" : target.role === "filesystem" ? "cassette_absorb" : "buffer_fill", 1.35, true); break;
    case "exit":
      primitive = "EXIT"; source = actor; target = actor; beat = "recovery";
      mechanicalResponse = response("power_down", "power_down", 1); break;
    case "wait":
      primitive = "WAIT"; source = endpoint(context.parent ?? context.actor, null, "shell"); target = child;
      connector = "routing_rail"; beat = "recovery";
      mechanicalResponse = response("lever_dispatch", "none", 1); break;
    case "unknown_internal": break;
  }

  const flowPath = transfer ? {
    id: `${primitive}:${source.semanticId}->${target.semanticId}`,
    sourceId: source.semanticId,
    destinationId: target.semanticId,
  } : null;
  return {
    primitive, source, target, connector, flowPath, mechanicalResponse,
    audioCue: primitive, cameraHint: { beat, focusEntities: [source.semanticId, target.semanticId] },
    evidenceMode: context.evidence_mode, confidence: context.confidence,
  };
}

const overview = { position: [10, 8.5, 12] as Vector3Tuple, target: [0, 1.2, 0] as Vector3Tuple };
const wide = { position: [-8, 9, 10] as Vector3Tuple, target: [0, 1, 0] as Vector3Tuple };
const rolePos: Readonly<Record<VisualRole, Vector3Tuple>> = {
  overview: [0, 1.2, 0], shell: [-6.5, 1.2, -1], process: [0, 1.4, 1.2],
  cat: [-2.2, 1.5, 1.2], grep: [3.2, 1.5, 1.2], echo: [-2.2, 1.5, 1.2],
  ls: [-2.2, 1.5, 1.2], ps: [-2.2, 1.5, 1.2], filesystem: [-3.6, 1.2, -4.5],
  terminal: [3.6, 1.2, -4.5], kernel: [0, 0.5, 0], pipe: [0.5, 1.6, 1.8], fd: [0, 1.2, 0],
};

/** Camera consumes only ActionPlan; it never resolves semantic meaning. */
export function resolveCameraDirectiveFromActionPlan(
  plan: ActionPlan,
  sequence: number,
  _totalFrames: number,
  mode: CameraFollowMode = "gentle",
  playbackSpeed = 1,
): CameraDirective {
  if (mode === "free") return { entityId: "overview", sequence, beat: "establish", ...overview, durationSec: 0 };
  if (plan.cameraHint.beat === "establish") return { entityId: "overview", sequence, beat: "establish", ...overview, durationSec: 1.1 / playbackSpeed };
  if (plan.cameraHint.beat === "recovery") return { entityId: "overview", sequence, beat: "recovery", ...wide, durationSec: 1 / playbackSpeed };
  const a = rolePos[plan.source.role];
  const b = rolePos[plan.target.role];
  const target: Vector3Tuple = [(a[0] + b[0]) / 2, Math.max(1, (a[1] + b[1]) / 2), (a[2] + b[2]) / 2];
  const span = Math.max(4.5, Math.abs(a[0] - b[0]) + 3.5);
  const position: Vector3Tuple = [target[0] + span * 0.35, target[1] + 4.3, target[2] + span];
  return { entityId: plan.source.semanticId, sequence, beat: plan.cameraHint.beat, position, target, durationSec: Math.max(0.45, plan.mechanicalResponse.durationSec * 0.75) / playbackSpeed };
}
