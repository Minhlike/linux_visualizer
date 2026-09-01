import type { FormEvent, ReactNode } from "react";

export interface ReplayFrameView {
  readonly sequence: number;
  readonly stage: string;
  readonly eventKind: string;
  readonly summary: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly focusNodeIds: readonly string[];
}

export interface ReplayViewModel {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly title: string;
  readonly caveat: string;
  readonly current: ReplayFrameView | undefined;
  readonly frameIndex: number;
  readonly frameCount: number;
  readonly playing: boolean;
  readonly error: string | undefined;
}

export interface InfoCardView {
  readonly name: string;
  readonly type: string;
  readonly visualMetaphor: string;
  readonly technicalReality: string;
  readonly limitations: string;
}

export interface TelemetryView {
  readonly backend: "initializing" | "webgpu" | "webgl2";
  readonly fps: number | undefined;
  readonly frameTimeMs: number | undefined;
  readonly drawCalls: number | undefined;
  readonly visibleObjects: number | undefined;
}

export interface LearningShellProps {
  readonly scene: ReactNode;
  readonly replay: ReplayViewModel;
  readonly infoCard: InfoCardView;
  readonly selectedEntity: string;
  readonly viewMode: "city" | "truth" | "dual";
  readonly telemetry: TelemetryView;
  readonly terminalOpen: boolean;
  readonly terminalInput: string;
  readonly terminalLines: readonly string[];
  readonly onViewModeChange: (mode: "city" | "truth" | "dual") => void;
  readonly onTerminalInputChange: (value: string) => void;
  readonly onTerminalSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onToggleTerminal: () => void;
  readonly onPlayPause: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
}

const viewModes = ["city", "truth", "dual"] as const;

export function LearningShell({
  scene,
  replay,
  infoCard,
  selectedEntity,
  viewMode,
  telemetry,
  terminalOpen,
  terminalInput,
  terminalLines,
  onViewModeChange,
  onTerminalInputChange,
  onTerminalSubmit,
  onToggleTerminal,
  onPlayPause,
  onPrevious,
  onNext,
  onReset,
}: LearningShellProps) {
  const atStart = replay.frameIndex === 0;
  const atEnd = replay.frameCount > 0 && replay.frameIndex + 1 >= replay.frameCount;
  const progress = replay.frameCount > 1
    ? (replay.frameIndex / (replay.frameCount - 1)) * 100
    : 0;

  return (
    <main className="visual-app">
      <section className="scene-viewport" aria-label="Interactive Linux industrial megacity">
        {scene}
      </section>

      <header className="top-hud">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">L/</span>
          <div>
            <p>LINUX OBSERVATORY</p>
            <small>SEMANTIC RUNTIME VISUALIZER / P2</small>
          </div>
        </div>
        <div className="evidence-state">
          <span className="pulse-dot" aria-hidden="true" />
          SYNTHETIC REPLAY — NOT LIVE LINUX
        </div>
        <div className="view-switcher" aria-label="Projection view">
          {viewModes.map((mode) => (
            <button
              type="button"
              key={mode}
              className={viewMode === mode ? "active" : ""}
              onClick={() => onViewModeChange(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <aside className="event-hud" aria-live="polite">
        <p className="hud-label">VALIDATED EVENT STREAM</p>
        <div className="frame-sequence">
          <strong>{String(replay.current?.sequence ?? 0).padStart(2, "0")}</strong>
          <span>/ {String(replay.frameCount).padStart(2, "0")}</span>
        </div>
        <p className="event-stage">
          {(replay.current?.stage ?? "replay ready").replaceAll("_", " ")}
        </p>
        <h1>{replay.current?.summary ?? replay.title}</h1>
        {replay.current && (
          <dl className="event-metrics">
            <div><dt>EVENT</dt><dd>{replay.current.eventKind}</dd></div>
            <div>
              <dt>GRAPH</dt>
              <dd>
                {replay.current.nodeCount === 0 && replay.current.edgeCount === 0
                  ? "NATIVE COUNTS"
                  : `${replay.current.nodeCount}N / ${replay.current.edgeCount}E`}
              </dd>
            </div>
          </dl>
        )}
        {replay.status === "loading" && <p className="loading-copy">Validating frames…</p>}
        {replay.error && <p className="error-copy" role="alert">{replay.error}</p>}
      </aside>

      <aside className="info-card" aria-label={`Information for ${selectedEntity}`}>
        <div className="info-heading">
          <span>ENTITY / {selectedEntity.toUpperCase()}</span>
          <small>{infoCard.type}</small>
        </div>
        <h2>{infoCard.name}</h2>
        <dl>
          <div><dt>VISUAL METAPHOR</dt><dd>{infoCard.visualMetaphor}</dd></div>
          <div><dt>TECHNICAL REALITY</dt><dd>{infoCard.technicalReality}</dd></div>
          <div><dt>LIMITATIONS</dt><dd>{infoCard.limitations}</dd></div>
        </dl>
        <p className="selection-hint">CLICK A MODULE TO INSPECT</p>
      </aside>

      <section className="playback-hud" aria-label="Replay controls">
        <button type="button" onClick={onReset}>RESET</button>
        <button type="button" disabled={atStart} onClick={onPrevious}>PREVIOUS</button>
        <button type="button" className="primary-control" onClick={onPlayPause}>
          <span aria-hidden="true">{replay.playing ? "Ⅱ" : "▶"}</span>
          {replay.playing ? "PAUSE" : atEnd ? "REPLAY" : "PLAY"}
        </button>
        <button type="button" disabled={atEnd} onClick={onNext}>NEXT</button>
        <div className="timeline" aria-label={`Frame ${replay.frameIndex + 1} of ${replay.frameCount}`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="timeline-label">
          {String(Math.min(replay.frameIndex + 1, replay.frameCount)).padStart(2, "0")} / {String(replay.frameCount).padStart(2, "0")}
        </span>
      </section>

      <button type="button" className="terminal-toggle" onClick={onToggleTerminal}>
        <span>&gt;_</span> TERMINAL <kbd>CTRL</kbd><kbd>~</kbd>
      </button>

      {terminalOpen && (
        <section className="terminal-overlay" aria-label="Synthetic replay terminal">
          <div className="terminal-titlebar">
            <span>REPLAY TERMINAL</span>
            <strong>SYNTHETIC REPLAY — NOT LIVE LINUX</strong>
            <button type="button" aria-label="Close terminal" onClick={onToggleTerminal}>×</button>
          </div>
          <div className="terminal-output" aria-live="polite">
            {terminalLines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
          </div>
          <form onSubmit={onTerminalSubmit}>
            <label htmlFor="replay-command">observer@synthetic:~$</label>
            <input
              id="replay-command"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={terminalInput}
              onChange={(event) => onTerminalInputChange(event.target.value)}
            />
            <button type="submit">RUN</button>
          </form>
        </section>
      )}

      <footer className="telemetry-strip">
        <span>BACKEND <strong>{telemetry.backend.toUpperCase()}</strong></span>
        <span>FPS <strong>{telemetry.fps?.toFixed(0) ?? "—"}</strong></span>
        <span>FRAME <strong>{telemetry.frameTimeMs?.toFixed(1) ?? "—"} MS</strong></span>
        <span>DRAW CALLS <strong>{telemetry.drawCalls ?? "—"}</strong></span>
        <span>VISIBLE <strong>{telemetry.visibleObjects ?? "—"}</strong></span>
        <span className="orbit-help">DRAG TO ORBIT · SCROLL TO ZOOM</span>
      </footer>
    </main>
  );
}
