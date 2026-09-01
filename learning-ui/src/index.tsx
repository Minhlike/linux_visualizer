import { useState, useRef, useEffect, useMemo, type FormEvent, type ReactNode } from "react";

export interface ReplayFrameView {
  readonly sequence: number;
  readonly stage: string;
  readonly eventKind: string;
  readonly summary: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly focusNodeIds: readonly string[];
}

export interface EventBoardItem {
  readonly index: number;
  readonly sequence: number;
  readonly stage: string;
  readonly eventKind: string;
  readonly summary: string;
  readonly status: "past" | "current" | "upcoming";
  readonly sourceId: string | null;
  readonly destinationId: string | null;
  readonly relation: string | null;
}

export interface CommandGraphView {
  readonly pipelines: readonly {
    readonly id: string;
    readonly processes: readonly { readonly id: string; readonly executable: string; readonly opaque_internals: boolean }[];
  }[];
  readonly execution_edges: readonly { readonly source: string; readonly destination: string; readonly relation: string }[];
}

export interface ReplayViewModel {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly title: string;
  readonly caveat: string;
  readonly evidenceMode: "synthetic_replay" | "structurally_derived" | "opaque_command";
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
  readonly pid?: string | undefined;
  readonly lifecycle?: string | undefined;
  readonly activeFds?: readonly string[] | undefined;
  readonly relations?: readonly string[] | undefined;
  readonly evidenceSource?: string | undefined;
  readonly confidence?: string | undefined;
}

export interface TelemetryView {
  readonly backend: "initializing" | "webgpu" | "webgl2";
  readonly fps: number | undefined;
  readonly frameIntervalAvgMs: number | undefined;
  readonly frameIntervalP95Ms: number | undefined;
  readonly drawCalls: number | undefined;
  readonly triangles: number | undefined;
  readonly visibleObjects: number | undefined;
}

export interface ScenarioChoice {
  readonly id: string;
  readonly title: string;
  readonly command: string;
}

export interface LearningShellProps {
  readonly scene: ReactNode;
  readonly replay: ReplayViewModel;
  readonly infoCard: InfoCardView;
  readonly selectedEntity: string;
  readonly cameraMode?: "gentle" | "auto" | "free" | undefined;
  readonly playbackSpeed?: number | undefined;
  readonly availableScenarios?: readonly ScenarioChoice[] | undefined;
  readonly currentScenarioId?: string | undefined;
  readonly commandGraph?: CommandGraphView | undefined;
  readonly telemetry: TelemetryView;
  readonly terminalOpen: boolean;
  readonly terminalInput: string;
  readonly terminalLines: readonly string[];
  readonly allEvents?: readonly EventBoardItem[] | undefined;
  readonly onJumpToFrame?: ((index: number) => void) | undefined;
  readonly onHoverEntity?: ((entityId: string | null) => void) | undefined;
  readonly audioMuted?: boolean | undefined;
  readonly audioVolume?: number | undefined;
  readonly onToggleMute?: (() => void) | undefined;
  readonly onVolumeChange?: ((volume: number) => void) | undefined;
  readonly onCameraModeChange?: ((mode: "gentle" | "auto" | "free") => void) | undefined;
  readonly onPlaybackSpeedChange?: ((speed: number) => void) | undefined;
  readonly onSelectScenario?: ((id: string) => void) | undefined;
  readonly onTerminalInputChange: (value: string) => void;
  readonly onTerminalSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onToggleTerminal: () => void;
  readonly onPlayPause: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
}

const cameraModeLabels: Record<"gentle" | "auto" | "free", string> = {
  gentle: "THEO DÕI NHẸ",
  auto: "TỰ ĐỘNG",
  free: "TỰ DO",
};

const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

function translateStage(stage: string): string {
  switch (stage) {
    case "shell": return "KHỞI TẠO SHELL";
    case "pipe_creation": return "TẠO ĐƯỜNG ỐNG (PIPE)";
    case "fork": return "PHÂN NHÁNH TIẾN TRÌNH (FORK)";
    case "file_descriptor_redirection": return "CHUYỂN HƯỚNG FILE DESCRIPTOR";
    case "exec": return "THAY THẾ HÌNH ẢNH (EXEC)";
    case "file_io": return "I/O TẬP TIN";
    case "pipe_io": return "I/O ĐƯỜNG ỐNG";
    case "terminal_io": return "I/O TERMINAL";
    case "exit": return "KẾT THÚC TIẾN TRÌNH";
    case "wait": return "SHELL ĐỢI TIẾN TRÌNH (WAIT)";
    default: return stage.replaceAll("_", " ").toUpperCase();
  }
}

function getPhaseTitle(stage: string): string {
  switch (stage) {
    case "shell":
    case "standard_streams_initialized":
      return "I. KHỞI TẠO & MÔI TRƯỜNG SHELL";
    case "pipe_creation":
    case "fork":
    case "file_descriptor_redirection":
    case "exec":
      return "II. ĐIỀU PHỐI TIẾN TRÌNH & ĐƯỜNG ỐNG";
    case "file_opened":
    case "file_io":
    case "pipe_io":
    case "terminal_io":
      return "III. I/O & DÒNG DỮ LIỆU THỰC THI";
    case "exit":
    case "wait":
      return "IV. KẾT THÚC & THU HỒI TÀI NGUYÊN";
    default:
      return "TIẾN TRÌNH HỆ THỐNG";
  }
}

// ─── Causal Lane Helper ──────────────────────────────────────────
interface CausalLaneDef {
  id: string;
  label: string;
  color: string;
}

function getEventInvolvedLanes(event: EventBoardItem): string[] {
  return [...new Set([event.sourceId, event.destinationId].filter((id): id is string => Boolean(id)))];
}

function laneLabel(id: string, commandGraph: CommandGraphView | undefined): string {
  const process = commandGraph?.pipelines.flatMap((pipeline) => pipeline.processes).find((item) => item.id === id);
  if (process) return `${process.executable.toUpperCase()} [process]`;
  if (id.startsWith("file:")) return `${id.slice(id.lastIndexOf(":") + 1)} [file]`;
  if (id.startsWith("pipe:")) return "PIPE [anonymous]";
  if (id.startsWith("terminal:")) return "TERMINAL [tty]";
  if (id.startsWith("shell:")) return "SHELL [sh]";
  return id;
}

export function LearningShell({
  scene,
  replay,
  infoCard,
  selectedEntity,
  cameraMode = "gentle",
  playbackSpeed = 0.5,
  availableScenarios = [],
  currentScenarioId,
  commandGraph,
  telemetry,
  terminalOpen,
  terminalInput,
  terminalLines,
  allEvents = [],
  onJumpToFrame,
  onHoverEntity,
  audioMuted = false,
  audioVolume = 0.55,
  onToggleMute,
  onVolumeChange,
  onCameraModeChange,
  onPlaybackSpeedChange,
  onSelectScenario,
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
  const progress = replay.frameCount > 1 ? (replay.frameIndex / (replay.frameCount - 1)) * 100 : 0;

  // View Mode: 'lanes' (Causal Matrix) vs 'timeline' (List)
  const [boardViewMode, setBoardViewMode] = useState<"lanes" | "timeline">("lanes");
  const [eventBoardCollapsed, setEventBoardCollapsed] = useState(false);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active event in the board
  useEffect(() => {
    if (activeItemRef.current && !eventBoardCollapsed) {
      activeItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [replay.frameIndex, eventBoardCollapsed]);

  // Group events by phase for timeline view
  const groupedEvents = useMemo(() => {
    const groups: Array<{ phaseTitle: string; items: EventBoardItem[] }> = [];
    let currentPhase = "";
    let currentGroup: EventBoardItem[] = [];

    allEvents.forEach((item) => {
      const phase = getPhaseTitle(item.stage);
      if (phase !== currentPhase) {
        if (currentGroup.length > 0) {
          groups.push({ phaseTitle: currentPhase, items: currentGroup });
        }
        currentPhase = phase;
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ phaseTitle: currentPhase, items: currentGroup });
    }

    return groups;
  }, [allEvents]);

  // Build lanes from the command graph and typed action endpoints; never from names or summaries.
  const causalLanes: readonly CausalLaneDef[] = useMemo(() => {
    const ordered = new Set<string>();
    const structuralRelations = new Set(["controls", "pipe", "file_read", "file_write", "terminal_input", "terminal_output"]);
    for (const edge of commandGraph?.execution_edges ?? []) {
      if (!structuralRelations.has(edge.relation)) continue;
      if (!edge.source.startsWith("fd:")) ordered.add(edge.source);
      if (!edge.destination.startsWith("fd:")) ordered.add(edge.destination);
    }
    for (const event of allEvents) {
      if (event.sourceId) ordered.add(event.sourceId);
      if (event.destinationId) ordered.add(event.destinationId);
    }
    const colors = ["#2563eb", "#d97706", "#059669", "#7c3aed", "#0891b2", "#db2777", "#0d9488", "#4f46e5"];
    return [...ordered].map((id, index) => ({ id, label: laneLabel(id, commandGraph), color: colors[index % colors.length] ?? "#64748b" }));
  }, [allEvents, commandGraph]);

  // Draggable terminal state
  const [terminalPos, setTerminalPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = sessionStorage.getItem("linux_obs_terminal_pos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 32, y: 80 };
  });

  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === "BUTTON") return;
    isDragging.current = true;
    dragOffset.current = { x: event.clientX - terminalPos.x, y: event.clientY - terminalPos.y };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleTitlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const next = {
      x: Math.max(8, Math.min(window.innerWidth - 360, event.clientX - dragOffset.current.x)),
      y: Math.max(50, Math.min(window.innerHeight - 150, event.clientY - dragOffset.current.y)),
    };
    setTerminalPos(next);
    try { sessionStorage.setItem("linux_obs_terminal_pos", JSON.stringify(next)); } catch {}
  };

  const handleTitlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try { (event.target as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
  };

  return (
    <main className="visual-app">
      <section className="scene-viewport" aria-label="Linux Observatory — Hệ thống quan sát cơ khí">
        {scene}
      </section>

      {/* Top HUD */}
      <header className="top-hud">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">L/</span>
          <div>
            <p>LINUX OBSERVATORY</p>
            <small>HỆ THỐNG QUAN SÁT NGỮ NGHĨA RUNTIME</small>
          </div>
        </div>

        <div className="evidence-state">
          <span className="pulse-dot" aria-hidden="true" />
          {replay.evidenceMode === "synthetic_replay"
            ? "LEVEL A — EVIDENCE-GROUNDED FIXTURE"
            : replay.evidenceMode === "structurally_derived"
              ? "LEVEL B — SUY DIỄN CẤU TRÚC, KHÔNG PHẢI TRACE KERNEL"
              : "LEVEL C — OPAQUE PROCESS, NỘI BỘ CHƯA QUAN SÁT"}
        </div>

        <div className="top-controls">
          {/* Audio Controls */}
          {onToggleMute && (
            <div className="audio-controls" aria-label="Điều khiển âm thanh ngữ nghĩa">
              <button
                type="button"
                className={`audio-btn ${audioMuted ? "muted" : "active"}`}
                onClick={onToggleMute}
                title={audioMuted ? "Bật âm thanh" : "Tắt âm thanh"}
              >
                {audioMuted ? "🔇 TẮT" : `🔊 ${Math.round(audioVolume * 100)}%`}
              </button>
              {onVolumeChange && !audioMuted && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={audioVolume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="volume-slider"
                  title={`Âm lượng: ${Math.round(audioVolume * 100)}%`}
                />
              )}
            </div>
          )}

          {/* Scenario selector */}
          {availableScenarios.length > 0 && onSelectScenario && (
            <select
              className="scenario-select"
              value={currentScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              aria-label="Chọn kịch bản mô phỏng"
            >
              {availableScenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.command}</option>
              ))}
            </select>
          )}

          {/* Camera mode */}
          {onCameraModeChange && (
            <div className="camera-switcher" aria-label="Chế độ camera">
              {(["gentle", "auto", "free"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={cameraMode === mode ? "active" : ""}
                  onClick={() => onCameraModeChange(mode)}
                >
                  {cameraModeLabels[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Mission Control Event Board (Causal Lanes + Timeline) */}
      <aside className={`event-board ${eventBoardCollapsed ? "collapsed" : ""}`} aria-live="polite">
        <div className="event-board-header">
          <div className="event-board-title">
            <p className="hud-label">TIẾN TRÌNH SỰ KIỆN</p>
            <div className="frame-sequence">
              <strong>{String(replay.current?.sequence ?? 0).padStart(2, "0")}</strong>
              <span>/ {String(replay.frameCount).padStart(2, "0")}</span>
            </div>
          </div>
          <div className="board-header-actions">
            <button
              type="button"
              className={`view-mode-pill ${boardViewMode === "lanes" ? "active" : ""}`}
              onClick={() => setBoardViewMode("lanes")}
              title="Xem ma trận tuyến nhân quả"
            >
              TUYẾN
            </button>
            <button
              type="button"
              className={`view-mode-pill ${boardViewMode === "timeline" ? "active" : ""}`}
              onClick={() => setBoardViewMode("timeline")}
              title="Xem danh sách chi tiết"
            >
              DANH SÁCH
            </button>
            <button
              type="button"
              className="collapse-btn"
              onClick={() => setEventBoardCollapsed((c) => !c)}
              title={eventBoardCollapsed ? "Mở rộng" : "Thu gọn"}
            >
              {eventBoardCollapsed ? "＋" : "−"}
            </button>
          </div>
        </div>

        {/* Current Active Event Highlight Card */}
        {replay.current && (
          <div className="active-event-card">
            <span className="active-stage-tag">{translateStage(replay.current.stage)}</span>
            <h2>{replay.current.summary}</h2>
            <div className="active-event-metrics">
              <span>SỰ KIỆN: <code>{replay.current.eventKind}</code></span>
              <span>ĐỒ THỊ: <strong>{replay.current.nodeCount} nút / {replay.current.edgeCount} cạnh</strong></span>
            </div>
            <p className="fidelity-caveat">{replay.caveat}</p>
          </div>
        )}

        {/* CAUSAL LANES VIEW */}
        {!eventBoardCollapsed && boardViewMode === "lanes" && allEvents.length > 0 && (
          <div className="causal-lanes-container">
            <div className="lanes-track-list">
              {causalLanes.map((lane) => (
                <div key={lane.id} className="causal-lane-row">
                  <div className="lane-label" style={{ borderLeftColor: lane.color }}>
                    {lane.label}
                  </div>
                  <div className="lane-timeline-track">
                    <div className="lane-guide-line" />
                    {allEvents.map((ev) => {
                      const involvedLanes = getEventInvolvedLanes(ev);
                      const isNodeInLane = involvedLanes.includes(lane.id);
                      const isCurrent = ev.status === "current";

                      if (!isNodeInLane) {
                        return <div key={ev.index} className="lane-slot empty" />;
                      }

                      return (
                        <div
                          key={ev.index}
                          className={`lane-slot node ${ev.status} ${isCurrent ? "pulse" : ""}`}
                          onClick={() => onJumpToFrame?.(ev.index)}
                          onMouseEnter={() => onHoverEntity?.(lane.id)}
                          onMouseLeave={() => onHoverEntity?.(null)}
                          title={`#${ev.sequence}: ${ev.summary}`}
                          role="button"
                          tabIndex={0}
                        >
                          <span className="node-badge" style={{ borderColor: lane.color }}>
                            {ev.sequence}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TIMELINE LIST VIEW */}
        {!eventBoardCollapsed && boardViewMode === "timeline" && allEvents.length > 0 && (
          <div className="timeline-event-list" ref={listContainerRef}>
            {groupedEvents.map((group) => (
              <div key={group.phaseTitle} className="timeline-phase-group">
                <div className="phase-header">{group.phaseTitle}</div>
                <div className="phase-events">
                  {group.items.map((ev) => {
                    const isCurrent = ev.status === "current";
                    return (
                      <div
                        key={ev.index}
                        ref={isCurrent ? activeItemRef : undefined}
                        className={`timeline-event-item ${ev.status}`}
                        onClick={() => onJumpToFrame?.(ev.index)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJumpToFrame?.(ev.index); }}
                      >
                        <span className="event-step-badge">#{String(ev.sequence).padStart(2, "0")}</span>
                        <div className="event-item-body">
                          <div className="event-item-top">
                            <span className="event-kind-pill">{ev.eventKind}</span>
                            <span className="event-status-pill">
                              {ev.status === "past" ? "✓ XONG" : ev.status === "current" ? "● HIỆN TẠI" : "○ CHỜ"}
                            </span>
                          </div>
                          <p className="event-summary-text">{ev.summary}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {replay.status === "loading" && <p className="loading-copy">Đang kiểm chứng các khung hình…</p>}
        {replay.error && <p className="error-copy" role="alert">{replay.error}</p>}
      </aside>

      {/* Info Card */}
      <aside className="info-card" aria-label={`Thông tin cho ${selectedEntity}`}>
        <div className="info-heading">
          <span>THỰC THỂ / {selectedEntity.toUpperCase()}</span>
          <small>{infoCard.type}</small>
        </div>
        <h2>{infoCard.name}</h2>

        {(infoCard.pid || infoCard.lifecycle) && (
          <div className="info-badge-row">
            {infoCard.pid && <span className="info-badge pid-badge">{infoCard.pid}</span>}
            {infoCard.lifecycle && (
              <span className={`info-badge lifecycle-badge ${infoCard.lifecycle.includes("KẾT THÚC") ? "exited" : "active"}`}>
                {infoCard.lifecycle}
              </span>
            )}
          </div>
        )}

        <dl>
          {infoCard.activeFds && infoCard.activeFds.length > 0 && (
            <div className="info-section-highlight">
              <dt>CỔNG FILE DESCRIPTOR (FD)</dt>
              <dd>
                <ul className="info-fd-list">
                  {infoCard.activeFds.map((fd, i) => (
                    <li key={i}><code>{fd}</code></li>
                  ))}
                </ul>
              </dd>
            </div>
          )}

          {infoCard.relations && infoCard.relations.length > 0 && (
            <div className="info-section-highlight">
              <dt>QUAN HỆ NGỮ NGHĨA HIỆN TẠI</dt>
              <dd>
                <ul className="info-relation-list">
                  {infoCard.relations.map((rel, i) => (
                    <li key={i}>{rel}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}

          {infoCard.evidenceSource && (
            <div>
              <dt>NGUỒN BẰNG CHỨNG (EVIDENCE)</dt>
              <dd className="info-evidence">
                <code>{infoCard.evidenceSource}</code>
                {infoCard.confidence && <span className="info-confidence"> · {infoCard.confidence}</span>}
              </dd>
            </div>
          )}

          <div>
            <dt>ẨN DỤ TRỰC QUAN</dt>
            <dd>{infoCard.visualMetaphor}</dd>
          </div>
          <div>
            <dt>BẢN CHẤT KỸ THUẬT LINUX</dt>
            <dd>{infoCard.technicalReality}</dd>
          </div>
          <div>
            <dt>GIỚI HẠN MÔ PHỎNG</dt>
            <dd>{infoCard.limitations}</dd>
          </div>
        </dl>
        <p className="selection-hint">NHẤP VÀO MODULE CƠ KHÍ ĐỂ QUAN SÁT</p>
      </aside>

      {/* Playback HUD */}
      <section className="playback-hud" aria-label="Điều khiển phát lại">
        <button type="button" onClick={onReset}>ĐẶT LẠI</button>
        <button type="button" disabled={atStart} onClick={onPrevious}>TRƯỚC</button>
        <button type="button" className="primary-control" onClick={onPlayPause}>
          <span aria-hidden="true">{replay.playing ? "Ⅱ" : "▶"}</span>
          {replay.playing ? "TẠM DỪNG" : atEnd ? "PHÁT LẠI" : "PHÁT"}
        </button>
        <button type="button" disabled={atEnd} onClick={onNext}>TIẾP</button>

        <div className="speed-selector" aria-label="Tốc độ phát lại">
          {playbackSpeeds.map((speed) => (
            <button
              type="button"
              key={speed}
              className={playbackSpeed === speed ? "active" : ""}
              onClick={() => onPlaybackSpeedChange?.(speed)}
            >
              {speed}x
            </button>
          ))}
        </div>

        <div className="timeline" aria-label={`Khung hình ${replay.frameIndex + 1} trên ${replay.frameCount}`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="timeline-label">
          {String(Math.min(replay.frameIndex + 1, replay.frameCount)).padStart(2, "0")} /{" "}
          {String(replay.frameCount).padStart(2, "0")}
        </span>
      </section>

      {/* Terminal Toggle */}
      <button type="button" className="terminal-toggle" onClick={onToggleTerminal}>
        <span>&gt;_</span> TERMINAL <kbd>CTRL</kbd><kbd>~</kbd>
      </button>

      {/* Floating Draggable Terminal */}
      {terminalOpen && (
        <section
          className="terminal-overlay floating-terminal"
          aria-label="Cửa sổ lệnh mô phỏng"
          style={{ transform: `translate(${terminalPos.x}px, ${terminalPos.y}px)` }}
        >
          <div
            className="terminal-titlebar"
            onPointerDown={handleTitlePointerDown}
            onPointerMove={handleTitlePointerMove}
            onPointerUp={handleTitlePointerUp}
          >
            <div className="terminal-drag-label">
              <span className="drag-dots">⋮⋮</span>
              <span>BẢNG LỆNH MÔ PHỎNG</span>
            </div>
            <strong>MÔ PHỎNG — KHÔNG PHẢI LIVE LINUX</strong>
            <button type="button" className="terminal-close-btn" aria-label="Đóng terminal" onClick={onToggleTerminal}>×</button>
          </div>

          <div className="terminal-presets">
            <span className="preset-label">Fixture mẫu:</span>
            {["cat file.txt | grep linux", "echo linux > sample.txt", "cat sample.txt", "ls -l", "ps"].map((cmd) => (
              <button type="button" key={cmd} className="preset-btn" onClick={() => onTerminalInputChange(cmd)}>
                {cmd}
              </button>
            ))}
          </div>

          <div className="terminal-output" aria-live="polite">
            {terminalLines.map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}
          </div>

          <form onSubmit={onTerminalSubmit}>
            <label htmlFor="replay-command">observer@planner:~$</label>
            <input
              id="replay-command"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={terminalInput}
              onChange={(e) => onTerminalInputChange(e.target.value)}
              placeholder="Nhập lệnh hoặc chọn kịch bản ở trên…"
            />
            <button type="submit">CHẠY</button>
          </form>
        </section>
      )}

      {/* Telemetry Strip */}
      <footer className="telemetry-strip">
        <span>BỘ KẾT XUẤT <strong>{telemetry.backend.toUpperCase()}</strong></span>
        <span>FPS <strong>{telemetry.fps?.toFixed(0) ?? "—"}</strong></span>
        <span>FRAME INTERVAL AVG <strong>{telemetry.frameIntervalAvgMs?.toFixed(1) ?? "—"} MS</strong></span>
        <span>FRAME INTERVAL P95 <strong>{telemetry.frameIntervalP95Ms?.toFixed(1) ?? "—"} MS</strong></span>
        <span>DRAW CALLS EST. <strong>{telemetry.drawCalls ?? "—"}</strong></span>
        <span>TAM GIÁC <strong>{telemetry.triangles?.toLocaleString() ?? "—"}</strong></span>
        <span>ĐỐI TƯỢNG <strong>{telemetry.visibleObjects ?? "—"}</strong></span>
        <span className="orbit-help">KÉO ĐỂ XOAY · CUỘN ĐỂ PHÓNG TO</span>
      </footer>
    </main>
  );
}
