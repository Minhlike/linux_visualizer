const modules = [
  ["OBSERVE", "Runtime evidence with source and confidence"],
  ["MODEL", "Renderer-independent Linux semantic graph"],
  ["CONSTRAIN", "Valid, forbidden, and omitted interpretations"],
  ["PROJECT", "City, truth graph, and dual views"],
] as const;

export interface ReplayFrameView {
  readonly sequence: number;
  readonly stage: string;
  readonly eventKind: string;
  readonly summary: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface ReplayViewModel {
  readonly available: boolean;
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly title: string | undefined;
  readonly caveat: string | undefined;
  readonly current: ReplayFrameView | undefined;
  readonly frameIndex: number;
  readonly frameCount: number;
  readonly error: string | undefined;
}

export interface LearningShellProps {
  readonly replay: ReplayViewModel;
  readonly onLoadReplay: () => void;
  readonly onMoveReplay: (delta: -1 | 1) => void;
}

export function LearningShell({
  replay,
  onLoadReplay,
  onMoveReplay,
}: LearningShellProps) {
  return (
    <main className="observatory-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">LINUX OBSERVATORY / P0</p>
          <h1>Truth before spectacle.</h1>
        </div>
        <span className="status-chip">ARCHITECTURE ONLINE</span>
      </header>

      <section className="hero-grid" aria-labelledby="mission-title">
        <div className="mission-panel">
          <p className="panel-index">00 / MISSION</p>
          <h2 id="mission-title">
            Runtime-grounded visualization for operating-system education.
          </h2>
          <p>
            This shell proves the composition boundary only. No live Linux
            execution and no 3D semantic claim are active in P0.
          </p>
        </div>

        <div className="truth-panel" aria-label="Required truth pipeline">
          {modules.map(([title, description], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="contract-card">
        <div>
          <p className="panel-index">FIRST FIDELITY CONTRACT</p>
          <h2>Anonymous pipe</h2>
        </div>
        <dl>
          <div>
            <dt>VISUAL METAPHOR</dt>
            <dd>Directional industrial conduit</dd>
          </div>
          <div>
            <dt>TECHNICAL REALITY</dt>
            <dd>Kernel byte stream referenced through file descriptors</dd>
          </div>
          <div>
            <dt>LIMITATION</dt>
            <dd>Not a file, not process-owned, not a message boundary</dd>
          </div>
        </dl>
      </section>

      <section className="replay-console" aria-labelledby="replay-title">
        <div className="replay-heading">
          <div>
            <p className="panel-index">P1 / VERIFIED MOCK REPLAY</p>
            <h2 id="replay-title">cat file.txt | grep linux</h2>
          </div>
          <span className="evidence-badge">SYNTHETIC — NOT LIVE EVIDENCE</span>
        </div>

        <div className="replay-body">
          <div className="replay-controls">
            {replay.status === "idle" && (
              <button
                type="button"
                disabled={!replay.available}
                onClick={onLoadReplay}
              >
                {replay.available ? "LOAD VERIFIED REPLAY" : "OPEN IN DESKTOP APP"}
              </button>
            )}
            {replay.status === "loading" && <p>Validating semantic frames…</p>}
            {replay.status === "error" && (
              <p role="alert">Replay rejected: {replay.error}</p>
            )}
            {replay.status === "ready" && replay.current && (
              <>
                <p className="frame-counter">
                  FRAME {replay.frameIndex + 1} / {replay.frameCount}
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={replay.frameIndex === 0}
                    onClick={() => onMoveReplay(-1)}
                  >
                    PREVIOUS
                  </button>
                  <button
                    type="button"
                    disabled={replay.frameIndex + 1 === replay.frameCount}
                    onClick={() => onMoveReplay(1)}
                  >
                    NEXT EVENT
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="frame-readout" aria-live="polite">
            {replay.current ? (
              <>
                <p>{replay.current.stage.replaceAll("_", " ")}</p>
                <h3>{replay.current.summary}</h3>
                <dl>
                  <div>
                    <dt>EVENT</dt>
                    <dd>{replay.current.eventKind}</dd>
                  </div>
                  <div>
                    <dt>GRAPH</dt>
                    <dd>
                      {replay.current.nodeCount} nodes / {replay.current.edgeCount}{" "}
                      edges
                    </dd>
                  </div>
                </dl>
                <small>{replay.caveat}</small>
              </>
            ) : (
              <p>
                The Rust reducer validates ordering, descriptor ownership, pipe
                direction, evidence references, and graph invariants before a
                frame reaches this UI.
              </p>
            )}
          </div>
        </div>
      </section>

      <footer>
        <span>SEMANTIC SCHEMA 1.0.0</span>
        <span>EVIDENCE MODE: NONE / P0</span>
        <span>RENDER BACKEND: DEFERRED</span>
      </footer>
    </main>
  );
}
