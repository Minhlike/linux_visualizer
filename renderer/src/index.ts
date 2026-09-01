/** A minimal projection boundary. The authoritative schema lives in semantic-core. */
export interface SemanticSnapshotEnvelope {
  readonly schemaVersion: string;
  readonly revision: number;
  readonly payload: unknown;
}

export interface RenderTelemetry {
  readonly backend: "webgpu" | "webgl2" | "none";
  readonly frameTimeMs: number | null;
  readonly visibleInstances: number;
}

export interface SemanticProjection {
  mount(target: HTMLElement): Promise<void>;
  project(snapshot: SemanticSnapshotEnvelope): void;
  telemetry(): RenderTelemetry;
  dispose(): void;
}

export class NullProjection implements SemanticProjection {
  mount(_target: HTMLElement): Promise<void> {
    return Promise.resolve();
  }

  project(_snapshot: SemanticSnapshotEnvelope): void {}

  telemetry(): RenderTelemetry {
    return { backend: "none", frameTimeMs: null, visibleInstances: 0 };
  }

  dispose(): void {}
}
