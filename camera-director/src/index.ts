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

export interface CameraDirector {
  requestFocus(request: SemanticFocusRequest): void;
  cancelPending(): void;
}

export type VisualEntityId =
  | "overview"
  | "shell"
  | "cat"
  | "grep"
  | "filesystem"
  | "kernel"
  | "pipe";

export type Vector3Tuple = readonly [number, number, number];

export interface CameraDirective {
  readonly entityId: VisualEntityId;
  readonly sequence: number;
  readonly position: Vector3Tuple;
  readonly target: Vector3Tuple;
}

const cameraPoses: Readonly<
  Record<VisualEntityId, { position: Vector3Tuple; target: Vector3Tuple }>
> = {
  overview: { position: [13, 11, 16], target: [0, 1.4, -1] },
  shell: { position: [-12, 8, 11], target: [-4.8, 1.7, -0.5] },
  cat: { position: [-8, 6.5, 10], target: [-1.2, 1.7, 0.7] },
  grep: { position: [9, 6.8, 10], target: [2.1, 1.7, 0.7] },
  filesystem: { position: [-9, 7, -10], target: [-2, 1.5, -4] },
  kernel: { position: [7, 8, -10], target: [0.5, 1.6, -2] },
  pipe: { position: [5.8, 7.5, 12], target: [0.7, 2, 1] },
};

export function resolveCameraDirective(
  semanticNodeIds: readonly string[],
  stage: string,
  sequence: number,
): CameraDirective {
  let entityId: VisualEntityId = "overview";

  if (sequence <= 1 || sequence >= 22) {
    entityId = "overview";
  } else if (stage === "pipe_io" || semanticNodeIds.some((id) => id.startsWith("pipe:"))) {
    entityId = "pipe";
  } else if (semanticNodeIds.some((id) => id === "file:file.txt")) {
    entityId = "filesystem";
  } else if (semanticNodeIds.some((id) => id === "process:grep")) {
    entityId = "grep";
  } else if (semanticNodeIds.some((id) => id === "process:cat")) {
    entityId = "cat";
  } else if (semanticNodeIds.some((id) => id === "process:shell")) {
    entityId = "shell";
  }

  const pose = cameraPoses[entityId];
  return { entityId, sequence, ...pose };
}
