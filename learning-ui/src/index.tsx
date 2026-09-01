import { useState, useRef, useEffect, type FormEvent, type ReactNode } from "react";

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
  readonly viewMode: "city" | "truth" | "dual";
  readonly cameraMode?: "gentle" | "auto" | "free";
  readonly playbackSpeed?: number;
  readonly availableScenarios?: readonly ScenarioChoice[];
  readonly currentScenarioId?: string;
  readonly telemetry: TelemetryView;
  readonly terminalOpen: boolean;
  readonly terminalInput: string;
  readonly terminalLines: readonly string[];
  readonly dualGraphOverlay?: ReactNode;
  readonly onViewModeChange: (mode: "city" | "truth" | "dual") => void;
  readonly onCameraModeChange?: (mode: "gentle" | "auto" | "free") => void;
  readonly onPlaybackSpeedChange?: (speed: number) => void;
  readonly onSelectScenario?: (id: string) => void;
  readonly onTerminalInputChange: (value: string) => void;
  readonly onTerminalSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onToggleTerminal: () => void;
  readonly onPlayPause: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
}

const viewModeLabels: Record<"city" | "truth" | "dual", string> = {
  city: "CƠ KHÍ",
  truth: "ĐỒ THỊ THỰC",
  dual: "SONG SONG",
};

const cameraModeLabels: Record<"gentle" | "auto" | "free", string> = {
  gentle: "THEO DÕI NHẸ",
  auto: "TỰ ĐỘNG",
  free: "TỰ DO",
};

const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

function translateStage(stage: string): string {
  switch (stage) {
    case "shell":
      return "KHỞI TẠO SHELL";
    case "pipe_creation":
      return "TẠO ĐƯỜNG ỐNG (PIPE)";
    case "fork":
      return "PHÂN NHÁNH TIẾN TRÌNH (FORK)";
    case "file_descriptor_redirection":
      return "CHUYỂN HƯỚNG FILE DESCRIPTOR";
    case "exec":
      return "THAY THẾ HÌNH ẢNH (EXEC)";
    case "file_io":
      return "I/O TẬP TIN";
    case "pipe_io":
      return "I/O ĐƯỜNG ỐNG";
    case "terminal_io":
      return "I/O TERMINAL";
    case "exit":
      return "KẾT THÚC TIẾN TRÌNH";
    case "wait":
      return "SHELL ĐỢI TIẾN TRÌNH (WAIT)";
    default:
      return stage.replaceAll("_", " ").toUpperCase();
  }
}

export function LearningShell({
  scene,
  replay,
  infoCard,
  selectedEntity,
  viewMode,
  cameraMode = "gentle",
  playbackSpeed = 0.5,
  availableScenarios = [],
  currentScenarioId,
  telemetry,
  terminalOpen,
  terminalInput,
  terminalLines,
  dualGraphOverlay,
  onViewModeChange,
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
  const progress =
    replay.frameCount > 1 ? (replay.frameIndex / (replay.frameCount - 1)) * 100 : 0;

  // Draggable terminal state
  const [terminalPos, setTerminalPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = sessionStorage.getItem("linux_obs_terminal_pos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 32, y: 92 };
  });

  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === "BUTTON") return;
    isDragging.current = true;
    dragOffset.current = {
      x: event.clientX - terminalPos.x,
      y: event.clientY - terminalPos.y,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleTitlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const nextX = Math.max(8, Math.min(window.innerWidth - 360, event.clientX - dragOffset.current.x));
    const nextY = Math.max(50, Math.min(window.innerHeight - 150, event.clientY - dragOffset.current.y));
    const newPos = { x: nextX, y: nextY };
    setTerminalPos(newPos);
    try {
      sessionStorage.setItem("linux_obs_terminal_pos", JSON.stringify(newPos));
    } catch {}
  };

  const handleTitlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {}
  };

  return (
    <main className="visual-app">
      <section className="scene-viewport" aria-label="Khu vực quan sát máy cơ khí Linux">
        {scene}
      </section>

      {/* Dual view 2D Graph Overlay if present */}
      {viewMode === "dual" && dualGraphOverlay && (
        <aside className="dual-graph-panel" aria-label="Bản đồ đồ thị thực thi song song">
          <div className="dual-graph-header">
            <span>ĐỒ THỊ NGỮ NGHĨA LINUX THẬT (TRUTH)</span>
            <small>ĐỒ THỊ ĐỘC LẬP VỚI ẢN DỤ 3D</small>
          </div>
          <div className="dual-graph-content">{dualGraphOverlay}</div>
        </aside>
      )}

      {/* Top Navigation HUD */}
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
          MÔ PHỎNG NGỮ NGHĨA — KHÔNG PHẢI LINUX TRỰC TIẾP
        </div>

        {/* View Mode & Camera Selectors */}
        <div className="top-controls">
          <div className="view-switcher" aria-label="Chế độ hiển thị">
            {(["city", "truth", "dual"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={viewMode === mode ? "active" : ""}
                onClick={() => onViewModeChange(mode)}
              >
                {viewModeLabels[mode]}
              </button>
            ))}
          </div>

          {onCameraModeChange && (
            <div className="camera-switcher" aria-label="Chế độ camera">
              {(["gentle", "auto", "free"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={cameraMode === mode ? "active" : ""}
                  onClick={() => onCameraModeChange(mode)}
                  title={`Camera: ${cameraModeLabels[mode]}`}
                >
                  {cameraModeLabels[mode]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Event HUD */}
      <aside className="event-hud" aria-live="polite">
        <div className="hud-header-line">
          <p className="hud-label">DÒNG SỰ KIỆN ĐÃ XÁC THỰC</p>
          {availableScenarios.length > 0 && onSelectScenario && (
            <select
              className="scenario-select"
              value={currentScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              aria-label="Chọn kịch bản mô phỏng"
            >
              {availableScenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.command}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="frame-sequence">
          <strong>{String(replay.current?.sequence ?? 0).padStart(2, "0")}</strong>
          <span>/ {String(replay.frameCount).padStart(2, "0")}</span>
        </div>

        <p className="event-stage">
          {translateStage(replay.current?.stage ?? "replay ready")}
        </p>

        <h1>{replay.current?.summary ?? replay.title}</h1>

        {replay.current && (
          <dl className="event-metrics">
            <div>
              <dt>SỰ KIỆN</dt>
              <dd>{replay.current.eventKind}</dd>
            </div>
            <div>
              <dt>ĐỒ THỊ</dt>
              <dd>
                {replay.current.nodeCount === 0 && replay.current.edgeCount === 0
                  ? "ĐÃ KIỂM CHỨNG"
                  : `${replay.current.nodeCount} nút / ${replay.current.edgeCount} cạnh`}
              </dd>
            </div>
          </dl>
        )}

        {replay.status === "loading" && <p className="loading-copy">Đang kiểm chứng các khung hình…</p>}
        {replay.error && (
          <p className="error-copy" role="alert">
            {replay.error}
          </p>
        )}
      </aside>

      {/* Info Card */}
      <aside className="info-card" aria-label={`Thông tin cho ${selectedEntity}`}>
        <div className="info-heading">
          <span>THỰC THỂ / {selectedEntity.toUpperCase()}</span>
          <small>{infoCard.type}</small>
        </div>
        <h2>{infoCard.name}</h2>
        <dl>
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
        <button type="button" onClick={onReset}>
          ĐẶT LẠI
        </button>
        <button type="button" disabled={atStart} onClick={onPrevious}>
          TRƯỚC
        </button>
        <button type="button" className="primary-control" onClick={onPlayPause}>
          <span aria-hidden="true">{replay.playing ? "Ⅱ" : "▶"}</span>
          {replay.playing ? "TẠM DỪNG" : atEnd ? "PHÁT LẠI" : "PHÁT"}
        </button>
        <button type="button" disabled={atEnd} onClick={onNext}>
          TIẾP
        </button>

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

        <div
          className="timeline"
          aria-label={`Khung hình ${replay.frameIndex + 1} trên ${replay.frameCount}`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="timeline-label">
          {String(Math.min(replay.frameIndex + 1, replay.frameCount)).padStart(2, "0")} /{" "}
          {String(replay.frameCount).padStart(2, "0")}
        </span>
      </section>

      {/* Terminal Toggle Button */}
      <button type="button" className="terminal-toggle" onClick={onToggleTerminal}>
        <span>&gt;_</span> TERMINAL <kbd>CTRL</kbd><kbd>~</kbd>
      </button>

      {/* Floating Draggable Terminal Popup */}
      {terminalOpen && (
        <section
          className="terminal-overlay floating-terminal"
          aria-label="Cửa sổ lệnh mô phỏng"
          style={{
            transform: `translate(${terminalPos.x}px, ${terminalPos.y}px)`,
          }}
        >
          <div
            className="terminal-titlebar"
            onPointerDown={handleTitlePointerDown}
            onPointerMove={handleTitlePointerMove}
            onPointerUp={handleTitlePointerUp}
          >
            <div className="terminal-drag-label">
              <span className="drag-dots">⋮⋮</span>
              <span>TERMINAL MÔ PHỎNG</span>
            </div>
            <strong>MÔ PHỎNG — KHÔNG PHẢI LIVE LINUX</strong>
            <button
              type="button"
              className="terminal-close-btn"
              aria-label="Đóng terminal"
              onClick={onToggleTerminal}
            >
              ×
            </button>
          </div>

          {/* Quick Scenario Launch Buttons */}
          <div className="terminal-presets">
            <span className="preset-label">Kịch bản:</span>
            {[
              "cat file.txt | grep linux",
              "echo linux > sample.txt",
              "cat sample.txt",
              "ls -l",
              "ps",
            ].map((cmd) => (
              <button
                type="button"
                key={cmd}
                className="preset-btn"
                onClick={() => {
                  onTerminalInputChange(cmd);
                }}
              >
                {cmd}
              </button>
            ))}
          </div>

          <div className="terminal-output" aria-live="polite">
            {terminalLines.map((line, index) => (
              <p key={`${index}-${line}`}>{line}</p>
            ))}
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
              placeholder="Nhập lệnh hoặc chọn kịch bản ở trên…"
            />
            <button type="submit">CHẠY</button>
          </form>
        </section>
      )}

      {/* Telemetry Strip */}
      <footer className="telemetry-strip">
        <span>
          BỘ KẾT XUẤT <strong>{telemetry.backend.toUpperCase()}</strong>
        </span>
        <span>
          FPS <strong>{telemetry.fps?.toFixed(0) ?? "—"}</strong>
        </span>
        <span>
          THỜI GIAN KHUNG <strong>{telemetry.frameTimeMs?.toFixed(1) ?? "—"} MS</strong>
        </span>
        <span>
          LỆNH VẼ <strong>{telemetry.drawCalls ?? "—"}</strong>
        </span>
        <span>
          ĐỐI TƯỢNG <strong>{telemetry.visibleObjects ?? "—"}</strong>
        </span>
        <span className="orbit-help">KÉO ĐỂ XOAY · CUỘN ĐỂ PHÓNG TO</span>
      </footer>
    </main>
  );
}
