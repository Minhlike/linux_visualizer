const modules = [
  ["OBSERVE", "Runtime evidence with source and confidence"],
  ["MODEL", "Renderer-independent Linux semantic graph"],
  ["CONSTRAIN", "Valid, forbidden, and omitted interpretations"],
  ["PROJECT", "City, truth graph, and dual views"],
] as const;

export function LearningShell() {
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

      <footer>
        <span>SEMANTIC SCHEMA 1.0.0</span>
        <span>EVIDENCE MODE: NONE / P0</span>
        <span>RENDER BACKEND: DEFERRED</span>
      </footer>
    </main>
  );
}
