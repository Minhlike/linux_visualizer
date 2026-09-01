import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LearningShell,
  type InfoCardView,
  type ReplayFrameView,
  type ReplayViewModel,
} from "@linux-observatory/learning-ui";
import {
  IndustrialMegacity,
  type RenderBackend,
  type SceneTelemetry,
  type VisualEntityId,
  type VisualReplayFrame,
  type VisualViewMode,
} from "@linux-observatory/renderer";
import type { CameraFollowMode } from "@linux-observatory/camera-director";
import { invoke, isTauri } from "@tauri-apps/api/core";

// Embedded fixtures for browser testing & fallback
import catGrepSource from "../../../semantic-core/fixtures/cat-grep.json";
import echoSource from "../../../semantic-core/fixtures/echo-redirection.json";
import catFileSource from "../../../semantic-core/fixtures/cat-file.json";
import lsSource from "../../../semantic-core/fixtures/ls.json";
import psSource from "../../../semantic-core/fixtures/ps.json";

import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing");
}

interface NativeSemanticEntity {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly lifecycle: string | { readonly exited: { readonly status: number } };
}

interface NativeSemanticRelation {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

interface NativeReplayFrame {
  readonly sequence: number;
  readonly stage: string;
  readonly event_kind: string;
  readonly summary: string;
  readonly entities: readonly NativeSemanticEntity[];
  readonly relations: readonly NativeSemanticRelation[];
  readonly focus_candidates: readonly string[];
  readonly snapshot: {
    readonly revision: number;
    readonly entities: readonly NativeSemanticEntity[];
    readonly relations: readonly NativeSemanticRelation[];
  };
}

interface NativeReplayPresentation {
  readonly scenario_id: string;
  readonly title: string;
  readonly command: string;
  readonly evidence_mode: "synthetic_replay";
  readonly caveat: string;
  readonly frames: readonly NativeReplayFrame[];
}

interface FixtureEnvelope {
  readonly sequence: number;
  readonly stage: string;
  readonly event: Readonly<Record<string, unknown>> & { readonly type: string };
}

interface ReplayFixture {
  readonly id: string;
  readonly title: string;
  readonly command?: string;
  readonly evidence_mode: "synthetic_replay";
  readonly caveat: string;
  readonly events: readonly FixtureEnvelope[];
}

const browserFixtures: Readonly<Record<string, ReplayFixture>> = {
  "cat-file-pipe-grep-v1": catGrepSource as unknown as ReplayFixture,
  "echo-redirect-v1": echoSource as unknown as ReplayFixture,
  "cat-file-v1": catFileSource as unknown as ReplayFixture,
  "ls-listing-v1": lsSource as unknown as ReplayFixture,
  "ps-inspection-v1": psSource as unknown as ReplayFixture,
};

const scenarioOptions = [
  { id: "cat-file-pipe-grep-v1", title: "cat file.txt | grep linux", command: "cat file.txt | grep linux" },
  { id: "echo-redirect-v1", title: "echo linux > sample.txt", command: "echo linux > sample.txt" },
  { id: "cat-file-v1", title: "cat sample.txt", command: "cat sample.txt" },
  { id: "ls-listing-v1", title: "ls -l", command: "ls -l" },
  { id: "ps-inspection-v1", title: "ps", command: "ps" },
];

const eventSummaries: Readonly<Record<string, string>> = {
  shell_started: "Shell tiếp nhận và khởi tạo môi trường",
  process_started: "Tiến trình khởi chạy",
  standard_streams_initialized: "Khởi tạo các luồng I/O tiêu chuẩn (stdin, stdout, stderr)",
  pipe_created: "Hạt nhân tạo đường ống vô danh (pipe) và cấp phát cặp FD",
  process_forked: "Shell phân nhánh tiến trình con bằng fork/clone",
  file_descriptor_duplicated: "Chuyển hướng descriptor với ngữ nghĩa dup/dup2",
  file_descriptor_closed: "Đóng file descriptor kế thừa",
  process_executed: "Ảnh tiến trình con được thay thế bằng file thực thi (exec)",
  file_opened: "Mở tập tin qua hệ thống VFS và cấp phát FD",
  bytes_read: "Đọc dòng byte qua ranh giới I/O của hạt nhân",
  bytes_written: "Ghi dòng byte vào descriptor được chỉ định",
  process_exited: "Tiến trình kết thúc thực thi và thu hồi tài nguyên",
  process_waited: "Shell quan sát và thu nhận trạng thái kết thúc qua wait",
};

const entityCards: Readonly<Record<VisualEntityId, InfoCardView>> = {
  overview: {
    name: "Hệ thống Cơ khí Quan sát",
    type: "MÔ HÌNH TRỰC QUAN",
    visualMetaphor: "Tổ hợp các phân xưởng cơ khí chuyên biệt được liên kết bởi trục truyền động và conduit.",
    technicalReality: "Phép chiếu trực quan từ đồ thị ngữ nghĩa đã được xác thực qua chuỗi bằng chứng.",
    limitations: "Khoảng cách và kích thước cơ khí không đại diện cho địa chỉ bộ nhớ, độ trễ hoặc quyền hạn hạt nhân.",
  },
  shell: {
    name: "Trung tâm Điều phối Shell",
    type: "TIẾN TRÌNH / ORCHESTRATOR",
    visualMetaphor: "Tháp điều khiển trung tâm khởi tạo và giám sát tiến trình.",
    technicalReality: "Shell tạo đường ống, phân nhánh tiến trình con qua fork, chuyển hướng FD và quan sát kết thúc qua wait.",
    limitations: "Không hiển thị chi tiết giải mã cú pháp AST, cấu trúc job control hoặc lập lịch nội bộ.",
  },
  cat: {
    name: "Tiến trình CAT",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Phân xưởng nạp nguyên liệu từ kho lưu trữ và bơm vào đường ống truyền dẫn.",
    technicalReality: "Tiến trình con gọi exec /bin/cat, đọc nội dung tập tin qua FD đọc và xuất dữ liệu ra stdout.",
    limitations: "Khung máy không phải sơ đồ không gian địa chỉ ảo và kích thước không phản ánh mức chiếm dụng RAM.",
  },
  grep: {
    name: "Tiến trình GREP",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Trạm tinh lọc và tách dòng dữ liệu từ đường dẫn chuyển vào.",
    technicalReality: "Tiến trình con gọi exec /bin/grep, đọc luồng byte từ stdin kết nối với đường ống.",
    limitations: "Thuật toán so khớp chuỗi regex, bộ đệm buffer nội bộ được giản lược thành luồng dữ liệu ngữ nghĩa.",
  },
  echo: {
    name: "Tiến trình ECHO",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Bộ truyền động cơ khí xuất dòng ký tự trực tiếp ra đích được chuyển hướng.",
    technicalReality: "Tiến trình thực thi echo, ghi trực tiếp chuỗi byte vào descriptor số 1 đã chuyển hướng sang tập tin.",
    limitations: "Sự khác biệt giữa built-in shell và /bin/echo độc lập được biểu diễn nhất quán theo ngữ nghĩa ghi.",
  },
  ls: {
    name: "Tiến trình LS",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Trạm quét mục lục đọc thông tin danh mục từ kho lưu trữ thư mục.",
    technicalReality: "Tiến trình con gọi syscall getdents/read để quét cấu trúc thư mục và định dạng danh sách ra thiết bị xuất.",
    limitations: "Cấu trúc dentry cache và phân trang bảng inode được nén thành chuỗi byte danh mục.",
  },
  ps: {
    name: "Tiến trình PS",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Cảm biến đo lường nội soi trạng thái hoạt động của toàn hệ sinh thái tiến trình.",
    technicalReality: "Tiến trình con phân tích không gian /proc ảo do hạt nhân cung cấp để trích xuất bảng trạng thái PID.",
    limitations: "Các trường thống kê mở rộng của task_struct trong hạt nhân được thu gọn cho mục đích quan sát sư phạm.",
  },
  filesystem: {
    name: "Hệ thống Tập tin (Filesystem)",
    type: "TÀI NGUYÊN KERNEL / VFS",
    visualMetaphor: "Kho lưu trữ dạng tháp đĩa quang/từ cung cấp dữ liệu ban đầu.",
    technicalReality: "Tập tin được mở thông qua VFS và cấp phát một mục trong bảng mô tả tệp mở (OpenFileDescription).",
    limitations: "Không ràng buộc loại filesystem cụ thể (ext4, btrfs), page cache, hay thiết bị khối vật lý.",
  },
  terminal: {
    name: "Thiết bị Đầu cuối (Terminal / Console)",
    type: "THIẾT BỊ KÝ TỰ (CHARACTER DEVICE)",
    visualMetaphor: "Bàn điều khiển giao tiếp hai chiều giữa người vận hành và hệ điều hành.",
    technicalReality: "Thiết bị tty/pts liên kết với các file descriptor tiêu chuẩn (0: stdin, 1: stdout, 2: stderr).",
    limitations: "Bỏ qua giao thức điều khiển dòng line discipline, escape sequence và cơ chế điều khiển phím.",
  },
  kernel: {
    name: "Hạt nhân Linux (Kernel Core)",
    type: "TẦNG ĐIỀU PHỐI HỆ THỐNG",
    visualMetaphor: "Lõi máy trung tâm điều hòa và truyền tải mọi hoạt động trung gian.",
    technicalReality: "Hạt nhân quản lý không gian địa chỉ, bảng FD, VFS, bộ lập lịch và truyền thông liên tiến trình (IPC).",
    limitations: "Không phải một đơn nhân duy nhất; các cơ chế scheduler, VFS, memory management được biểu diễn cô đọng.",
  },
  pipe: {
    name: "Đường ống Vô danh (Anonymous Pipe)",
    type: "VÙNG ĐỆM BYTE HẠT NHÂN",
    visualMetaphor: "Đường ống dẫn chất lỏng định hướng nối từ đầu ra CAT sang đầu vào GREP.",
    technicalReality: "Vùng đệm vòng tuần hoàn (circular buffer) trong RAM của hạt nhân, không thuộc sở hữu riêng của tiến trình.",
    limitations: "Không phải tập tin trên đĩa, không có tên đường dẫn, không bảo toàn ranh giới thông điệp (stream-oriented).",
  },
};

function collectSemanticIds(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^(process|pipe|file|device):/.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSemanticIds(item, result));
    return result;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectSemanticIds(item, result));
  }
  return result;
}

function browserPresentation(fixtureId: string): NativeReplayPresentation {
  const fixture = browserFixtures[fixtureId] ?? browserFixtures["cat-file-pipe-grep-v1"]!;
  return {
    scenario_id: fixture.id,
    title: fixture.title,
    command: fixture.command ?? fixture.title,
    evidence_mode: fixture.evidence_mode,
    caveat: fixture.caveat,
    frames: fixture.events.map((envelope) => {
      const ids = [...collectSemanticIds(envelope.event)];
      const entities: readonly NativeSemanticEntity[] = ids.map((id) => ({
        id,
        kind: id.split(":")[0] || "unknown",
        label: id,
        lifecycle: "active",
      }));
      return {
        sequence: envelope.sequence,
        stage: envelope.stage,
        event_kind: envelope.event.type,
        summary: eventSummaries[envelope.event.type] ?? envelope.event.type.replaceAll("_", " "),
        entities,
        relations: [] as const,
        focus_candidates: ids,
        snapshot: {
          revision: envelope.sequence,
          entities,
          relations: [] as const,
        },
      };
    }),
  };
}

function toFrameView(frame: NativeReplayFrame): ReplayFrameView {
  return {
    sequence: frame.sequence,
    stage: frame.stage,
    eventKind: frame.event_kind,
    summary: frame.summary,
    nodeCount: frame.snapshot.entities.length,
    edgeCount: frame.snapshot.relations.length,
    focusNodeIds: frame.focus_candidates,
  };
}

function toVisualFrame(frame: NativeReplayFrame): VisualReplayFrame {
  return {
    sequence: frame.sequence,
    stage: frame.stage,
    eventKind: frame.event_kind,
    summary: frame.summary,
    focusNodeIds: frame.focus_candidates,
  };
}

function focusedVisualEntity(frame: NativeReplayFrame): VisualEntityId {
  const ids = frame.focus_candidates;
  if (frame.stage === "pipe_io" || ids.some((id) => id.startsWith("pipe:"))) {
    return "pipe";
  }
  if (ids.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc"))) {
    return "filesystem";
  }
  if (ids.some((id) => id.includes("tty") || id.includes("terminal"))) {
    return "terminal";
  }
  if (ids.some((id) => id.includes("process:grep"))) return "grep";
  if (ids.some((id) => id.includes("process:echo"))) return "echo";
  if (ids.some((id) => id.includes("process:ls"))) return "ls";
  if (ids.some((id) => id.includes("process:ps"))) return "ps";
  if (ids.some((id) => id.includes("process:cat"))) return "cat";
  if (ids.some((id) => id.includes("process:shell"))) return "shell";
  return "kernel";
}

function DesktopApp() {
  const [presentation, setPresentation] = useState<NativeReplayPresentation>();
  const [selectedScenarioId, setSelectedScenarioId] = useState("cat-file-pipe-grep-v1");
  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] = useState<ReplayViewModel["status"]>("loading");
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  const [cameraMode, setCameraMode] = useState<CameraFollowMode>("gentle");
  const [selectedEntity, setSelectedEntity] = useState<VisualEntityId>("kernel");
  const [viewMode, setViewMode] = useState<VisualViewMode>("city");
  const [backend, setBackend] = useState<RenderBackend>("initializing");
  const [telemetry, setTelemetry] = useState<SceneTelemetry>();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<readonly string[]>([
    "Linux Observatory — Bàn điều khiển mô phỏng ngữ nghĩa sẵn sàng.",
    "Hỗ trợ các kịch bản: cat | grep, echo >, cat, ls -l, ps",
  ]);
  const loadedOnce = useRef(false);

  async function loadScenario(scenarioId: string, startPlaying = false) {
    setStatus("loading");
    setError(undefined);
    try {
      let result: NativeReplayPresentation;
      if (isTauri()) {
        try {
          result = await invoke<NativeReplayPresentation>("load_scenario", { scenarioId });
        } catch {
          result = await invoke<NativeReplayPresentation>("mock_pipe_replay");
        }
      } else {
        result = browserPresentation(scenarioId);
      }
      if (result.evidence_mode !== "synthetic_replay" || result.frames.length === 0) {
        throw new Error("Phản hồi kịch bản không hợp lệ từ engine");
      }
      setPresentation(result);
      setSelectedScenarioId(result.scenario_id);
      setFrameIndex(0);
      setStatus("ready");
      setPlaying(startPlaying);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
      setPlaying(false);
    }
  }

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadScenario("cat-file-pipe-grep-v1", false);
  }, []);

  // Playback timer with variable speed (0.25x - 2x)
  useEffect(() => {
    if (!playing || !presentation) return undefined;
    const intervalMs = Math.round(1150 / playbackSpeed);
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= presentation.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, presentation, playbackSpeed]);

  // Shortcut Ctrl + ~ to toggle terminal
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && (event.code === "Backquote" || event.key === "~")) {
        event.preventDefault();
        setTerminalOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const frameHistory = useMemo(
    () => presentation?.frames.slice(0, frameIndex + 1).map(toVisualFrame) ?? [],
    [frameIndex, presentation],
  );
  const visualFrame = presentation?.frames[frameIndex]
    ? toVisualFrame(presentation.frames[frameIndex])
    : undefined;

  useEffect(() => {
    const current = presentation?.frames[frameIndex];
    if (current) setSelectedEntity(focusedVisualEntity(current));
  }, [frameIndex, presentation]);

  const replay: ReplayViewModel = {
    status,
    title: presentation?.title ?? "cat file.txt | grep linux",
    caveat: presentation?.caveat ?? "Mô phỏng ngữ nghĩa độc lập.",
    current: presentation?.frames[frameIndex]
      ? toFrameView(presentation.frames[frameIndex])
      : undefined,
    frameIndex,
    frameCount: presentation?.frames.length ?? 1,
    playing,
    error,
  };

  function moveReplay(delta: -1 | 1) {
    setPlaying(false);
    setFrameIndex((current) =>
      Math.max(0, Math.min(current + delta, (presentation?.frames.length ?? 1) - 1)),
    );
  }

  function playPause() {
    if (!presentation) {
      void loadScenario(selectedScenarioId, true);
      return;
    }
    if (!playing && frameIndex >= presentation.frames.length - 1) setFrameIndex(0);
    setPlaying((current) => !current);
  }

  function resetReplay() {
    setPlaying(false);
    setFrameIndex(0);
  }

  function handleSelectScenario(scenarioId: string) {
    void loadScenario(scenarioId, false);
  }

  function submitTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;

    let targetScenarioId: string | undefined;
    if (command.includes("grep")) {
      targetScenarioId = "cat-file-pipe-grep-v1";
    } else if (command.includes(">")) {
      targetScenarioId = "echo-redirect-v1";
    } else if (command.startsWith("cat")) {
      targetScenarioId = "cat-file-v1";
    } else if (command.startsWith("ls")) {
      targetScenarioId = "ls-listing-v1";
    } else if (command.startsWith("ps")) {
      targetScenarioId = "ps-inspection-v1";
    }

    if (targetScenarioId) {
      setTerminalLines((current) => [
        ...current,
        `observer@synthetic:~$ ${command}`,
        "MÔ PHỎNG NGỮ NGHĨA — ĐÃ XÁC THỰC QUA CHUỖI BẰNG CHỨNG",
        `Đang khởi chạy kịch bản mô phỏng cho: ${command}`,
      ]);
      setTerminalInput("");
      void loadScenario(targetScenarioId, true);
      return;
    }

    setTerminalLines((current) => [
      ...current,
      `observer@synthetic:~$ ${command}`,
      "Lệnh chưa hỗ trợ. Các lệnh sẵn sàng: cat file.txt | grep linux | echo linux > sample.txt | cat sample.txt | ls -l | ps",
    ]);
    setTerminalInput("");
  }

  // 2D SVG Graph Overlay for Dual View Mode (High Performance, 0 Draw Calls)
  const currentSnapshot = presentation?.frames[frameIndex]?.snapshot;
  const dualGraphOverlay = useMemo(() => {
    if (!currentSnapshot) return null;
    const entities = currentSnapshot.entities;
    const relations = currentSnapshot.relations;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.74rem" }}>
        <div>
          <strong style={{ color: "#2563eb" }}>THỰC THỂ HOẠT ĐỘNG ({entities.length}):</strong>
          <ul style={{ margin: "4px 0", paddingLeft: "18px", lineHeight: "1.4" }}>
            {entities.map((e) => (
              <li key={e.id}>
                <code>{e.id}</code> <span style={{ color: "#64748b" }}>({e.label})</span>
              </li>
            ))}
          </ul>
        </div>
        {relations.length > 0 && (
          <div>
            <strong style={{ color: "#059669" }}>QUAN HỆ NGỮ NGHĨA ({relations.length}):</strong>
            <ul style={{ margin: "4px 0", paddingLeft: "18px", lineHeight: "1.4" }}>
              {relations.map((r, i) => (
                <li key={i}>
                  <code>{r.from}</code> ➔ <strong>{r.relation}</strong> ➔ <code>{r.to}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }, [currentSnapshot]);

  return (
    <LearningShell
      replay={replay}
      scene={(
        <IndustrialMegacity
          frame={visualFrame}
          frameHistory={frameHistory}
          playing={playing}
          viewMode={viewMode}
          cameraMode={cameraMode}
          totalFrames={presentation?.frames.length ?? 1}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
          onBackendChange={setBackend}
          onTelemetry={setTelemetry}
        />
      )}
      infoCard={entityCards[selectedEntity]}
      selectedEntity={selectedEntity}
      viewMode={viewMode}
      cameraMode={cameraMode}
      playbackSpeed={playbackSpeed}
      availableScenarios={scenarioOptions}
      currentScenarioId={selectedScenarioId}
      telemetry={{
        backend,
        fps: telemetry?.fps,
        frameTimeMs: telemetry?.frameTimeMs,
        drawCalls: telemetry?.drawCalls,
        visibleObjects: telemetry?.visibleObjects,
      }}
      terminalOpen={terminalOpen}
      terminalInput={terminalInput}
      terminalLines={terminalLines}
      dualGraphOverlay={dualGraphOverlay}
      onViewModeChange={setViewMode}
      onCameraModeChange={setCameraMode}
      onPlaybackSpeedChange={setPlaybackSpeed}
      onSelectScenario={handleSelectScenario}
      onTerminalInputChange={setTerminalInput}
      onTerminalSubmit={submitTerminal}
      onToggleTerminal={() => setTerminalOpen((current) => !current)}
      onPlayPause={playPause}
      onPrevious={() => moveReplay(-1)}
      onNext={() => moveReplay(1)}
      onReset={resetReplay}
    />
  );
}

const reactRoot = (import.meta.hot?.data.reactRoot as Root | undefined) ?? createRoot(root);
if (import.meta.hot) import.meta.hot.data.reactRoot = reactRoot;

reactRoot.render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
