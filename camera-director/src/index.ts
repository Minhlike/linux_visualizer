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
