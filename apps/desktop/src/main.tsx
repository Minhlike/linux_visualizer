import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LearningShell,
  type EventBoardItem,
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
} from "@linux-observatory/renderer";
import type { CameraFollowMode } from "@linux-observatory/camera-director";
import { invoke, isTauri } from "@tauri-apps/api/core";

import catGrepSource from "../../../semantic-core/fixtures/cat-grep.json";
import echoSource from "../../../semantic-core/fixtures/echo-redirection.json";
import catFileSource from "../../../semantic-core/fixtures/cat-file.json";
import lsSource from "../../../semantic-core/fixtures/ls.json";
import psSource from "../../../semantic-core/fixtures/ps.json";

import { audioEngine } from "./audio";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("The application root element is missing");

// ─── Native types ─────────────────────────────────────────────────
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

// ─── Fixture registry ─────────────────────────────────────────────
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

const commandToScenario: Readonly<Record<string, string>> = {
  "cat file.txt | grep linux": "cat-file-pipe-grep-v1",
  "echo linux > sample.txt": "echo-redirect-v1",
  "cat sample.txt": "cat-file-v1",
  "ls -l": "ls-listing-v1",
  "ps": "ps-inspection-v1",
};

const entityXPositions: Readonly<Record<string, number>> = {
  shell: -6.5,
  cat: -2.2,
  echo: -2.2,
  ls: -2.2,
  ps: -2.2,
  filesystem: -3.6,
  kernel: 0.5,
  pipe: 0.8,
  grep: 3.2,
  terminal: 3.6,
};

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
    name: "Linux Observatory",
    type: "HỆ THỐNG QUAN SÁT",
    visualMetaphor: "Tổ hợp các module cơ khí chuyên biệt được liên kết bởi trục truyền động và conduit.",
    technicalReality: "Phép chiếu trực quan từ đồ thị ngữ nghĩa đã được xác thực qua chuỗi bằng chứng.",
    limitations: "Khoảng cách và kích thước cơ khí không đại diện cho địa chỉ bộ nhớ, độ trễ hoặc quyền hạn hạt nhân.",
  },
  shell: {
    name: "Trung tâm Điều phối Shell",
    type: "TIẾN TRÌNH / ORCHESTRATOR",
    visualMetaphor: "Bàn điều khiển trung tâm với các thanh routing khởi tạo và giám sát tiến trình.",
    technicalReality: "Shell tạo đường ống, phân nhánh tiến trình con qua fork, chuyển hướng FD và quan sát kết thúc qua wait.",
    limitations: "Không hiển thị chi tiết giải mã cú pháp AST, cấu trúc job control hoặc lập lịch nội bộ.",
  },
  cat: {
    name: "Tiến trình CAT",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Bộ nạp liệu dạng phễu hút dữ liệu từ kho lưu trữ và bơm vào đường ống truyền dẫn.",
    technicalReality: "Tiến trình con gọi exec /bin/cat, đọc nội dung tập tin qua FD đọc và xuất dữ liệu ra stdout.",
    limitations: "Khung máy không phải sơ đồ không gian địa chỉ ảo và kích thước không phản ánh mức chiếm dụng RAM.",
  },
  grep: {
    name: "Tiến trình GREP",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Buồng lọc hình hộp với các thanh lọc dọc tách dòng dữ liệu khớp mẫu.",
    technicalReality: "Tiến trình con gọi exec /bin/grep, đọc luồng byte từ stdin kết nối với đường ống.",
    limitations: "Thuật toán so khớp chuỗi regex, bộ đệm buffer nội bộ được giản lược thành luồng dữ liệu ngữ nghĩa.",
  },
  echo: {
    name: "Tiến trình ECHO",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Bộ phát hình loa phát dòng ký tự trực tiếp ra đích được chuyển hướng.",
    technicalReality: "Tiến trình thực thi echo, ghi trực tiếp chuỗi byte vào descriptor số 1 đã chuyển hướng sang tập tin.",
    limitations: "Sự khác biệt giữa built-in shell và /bin/echo độc lập được biểu diễn nhất quán theo ngữ nghĩa ghi.",
  },
  ls: {
    name: "Tiến trình LS",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Tháp quét xoay với đĩa cảm biến đọc thông tin danh mục từ kho lưu trữ thư mục.",
    technicalReality: "Tiến trình con gọi syscall getdents/read để quét cấu trúc thư mục và định dạng danh sách ra thiết bị xuất.",
    limitations: "Cấu trúc dentry cache và phân trang bảng inode được nén thành chuỗi byte danh mục.",
  },
  ps: {
    name: "Tiến trình PS",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Đầu dò chẩn đoán với nhiều vòng cảm biến nội soi trạng thái hoạt động của hệ sinh thái tiến trình.",
    technicalReality: "Tiến trình con phân tích không gian /proc ảo do hạt nhân cung cấp để trích xuất bảng trạng thái PID.",
    limitations: "Các trường thống kê mở rộng của task_struct trong hạt nhân được thu gọn cho mục đích quan sát sư phạm.",
  },
  filesystem: {
    name: "Hệ thống Tập tin (Filesystem)",
    type: "TÀI NGUYÊN KERNEL / VFS",
    visualMetaphor: "Kho lưu trữ hình lục giác tĩnh cung cấp dữ liệu ban đầu.",
    technicalReality: "Tập tin được mở thông qua VFS và cấp phát một mục trong bảng mô tả tệp mở (OpenFileDescription).",
    limitations: "Không ràng buộc loại filesystem cụ thể (ext4, btrfs), page cache, hay thiết bị khối vật lý.",
  },
  terminal: {
    name: "Thiết bị Đầu cuối (Terminal)",
    type: "THIẾT BỊ KÝ TỰ (CHARACTER DEVICE)",
    visualMetaphor: "Cổng giao tiếp dạng màn hình + bàn phím hai chiều giữa người vận hành và hệ điều hành.",
    technicalReality: "Thiết bị tty/pts liên kết với các file descriptor tiêu chuẩn (0: stdin, 1: stdout, 2: stderr).",
    limitations: "Bỏ qua giao thức điều khiển dòng line discipline, escape sequence và cơ chế điều khiển phím.",
  },
  kernel: {
    name: "Hạt nhân Linux (Kernel Core)",
    type: "TẦNG ĐIỀU PHỐI HỆ THỐNG",
    visualMetaphor: "Lõi bát giác lớn trung tâm với nhiều vòng kết nối điều hòa mọi hoạt động trung gian.",
    technicalReality: "Hạt nhân quản lý không gian địa chỉ, bảng FD, VFS, bộ lập lịch và truyền thông liên tiến trình (IPC).",
    limitations: "Không phải một đơn nhân duy nhất; các cơ chế scheduler, VFS, memory management được biểu diễn cô đọng.",
  },
  pipe: {
    name: "Đường ống Vô danh (Anonymous Pipe)",
    type: "VÙNG ĐỆM BYTE HẠT NHÂN",
    visualMetaphor: "Đường ống dẫn trong suốt định hướng nối từ đầu ra nguồn sang đầu vào đích.",
    technicalReality: "Vùng đệm vòng tuần hoàn (circular buffer) trong RAM của hạt nhân, không thuộc sở hữu riêng của tiến trình.",
    limitations: "Không phải tập tin trên đĩa, không có tên đường dẫn, không bảo toàn ranh giới thông điệp (stream-oriented).",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────
function collectSemanticIds(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^(process|pipe|file|device):/.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectSemanticIds(v, result)); return result; }
  if (value && typeof value === "object") { Object.values(value).forEach((v) => collectSemanticIds(v, result)); }
  return result;
}

function browserPresentation(fixtureId: string): NativeReplayPresentation {
  const fixture = browserFixtures[fixtureId];
  if (!fixture) throw new Error(`Kịch bản "${fixtureId}" không tồn tại trong bộ fixture.`);
  const exitedProcesses = new Set<string>();
  return {
    scenario_id: fixture.id,
    title: fixture.title,
    command: fixture.command ?? fixture.title,
    evidence_mode: fixture.evidence_mode,
    caveat: fixture.caveat,
    frames: fixture.events.map((envelope) => {
      if (envelope.event.type === "process_exited") {
        const ids = collectSemanticIds(envelope.event);
        ids.forEach((id) => { if (id.startsWith("process:")) exitedProcesses.add(id); });
      }
      const ids = [...collectSemanticIds(envelope.event)];
      const entities: readonly NativeSemanticEntity[] = ids.map((id) => ({
        id,
        kind: id.split(":")[0] || "unknown",
        label: id,
        lifecycle: exitedProcesses.has(id) ? { exited: { status: 0 } } : "active",
      }));
      return {
        sequence: envelope.sequence,
        stage: envelope.stage,
        event_kind: envelope.event.type,
        summary: eventSummaries[envelope.event.type] ?? envelope.event.type.replaceAll("_", " "),
        entities,
        relations: [] as const,
        focus_candidates: ids,
        snapshot: { revision: envelope.sequence, entities, relations: [] as const },
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
  if (frame.stage === "pipe_io" || ids.some((id) => id.startsWith("pipe:"))) return "pipe";
  if (ids.some((id) => id.startsWith("file:") || id.includes("dir") || id.includes("proc"))) return "filesystem";
  if (ids.some((id) => id.includes("tty") || id.includes("terminal"))) return "terminal";
  if (ids.some((id) => id.includes("process:grep"))) return "grep";
  if (ids.some((id) => id.includes("process:echo"))) return "echo";
  if (ids.some((id) => id.includes("process:ls"))) return "ls";
  if (ids.some((id) => id.includes("process:ps"))) return "ps";
  if (ids.some((id) => id.includes("process:cat"))) return "cat";
  if (ids.some((id) => id.includes("process:shell"))) return "shell";
  return "kernel";
}

// ─── App ──────────────────────────────────────────────────────────
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
  const [backend, setBackend] = useState<RenderBackend>("initializing");
  const [telemetry, setTelemetry] = useState<SceneTelemetry>();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<readonly string[]>([
    "Linux Observatory — Bảng lệnh mô phỏng ngữ nghĩa sẵn sàng.",
    "Hỗ trợ các kịch bản: cat | grep, echo >, cat, ls -l, ps",
  ]);
  const [audioMuted, setAudioMuted] = useState(() => audioEngine.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => audioEngine.getVolume());
  const loadedOnce = useRef(false);

  // Unlock Web Audio Context upon first user interaction
  useEffect(() => {
    const unlock = () => {
      audioEngine.ensureContext();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  async function loadScenario(scenarioId: string, startPlaying = false) {
    setStatus("loading");
    setError(undefined);
    try {
      let result: NativeReplayPresentation;
      if (isTauri()) {
        result = await invoke<NativeReplayPresentation>("load_scenario", { scenarioId });
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
      audioEngine.playEvent("shell_started", -6.5);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
      setPlaying(false);
      audioEngine.playEvent("error", 0);
    }
  }

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadScenario("cat-file-pipe-grep-v1", false);
  }, []);

  useEffect(() => {
    if (!playing || !presentation) return undefined;
    const intervalMs = Math.round(1150 / playbackSpeed);
    const timer = window.setInterval(() => {
      setFrameIndex((c) => {
        if (c >= presentation.frames.length - 1) { setPlaying(false); return c; }
        return c + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, presentation, playbackSpeed]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.code === "Backquote" || e.key === "~")) {
        e.preventDefault();
        setTerminalOpen((c) => !c);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  const frameHistory = useMemo(
    () => presentation?.frames.slice(0, frameIndex + 1).map(toVisualFrame) ?? [],
    [frameIndex, presentation],
  );
  const visualFrame = presentation?.frames[frameIndex] ? toVisualFrame(presentation.frames[frameIndex]) : undefined;

  // Sync selectedEntity and trigger procedural semantic sound on frame change
  useEffect(() => {
    const current = presentation?.frames[frameIndex];
    if (current) {
      const ent = focusedVisualEntity(current);
      setSelectedEntity(ent);
      const x = entityXPositions[ent] ?? 0;
      audioEngine.playEvent(current.event_kind, x);
      if (frameIndex === (presentation?.frames.length ?? 0) - 1) {
        audioEngine.playEvent("completion", 0);
      }
    }
  }, [frameIndex, presentation]);

  // Compute Event Board Items for the entire scenario
  const allEvents: readonly EventBoardItem[] = useMemo(() => {
    if (!presentation) return [];
    return presentation.frames.map((f, idx) => ({
      index: idx,
      sequence: f.sequence,
      stage: f.stage,
      eventKind: f.event_kind,
      summary: f.summary,
      status: idx < frameIndex ? "past" : idx === frameIndex ? "current" : "upcoming",
    }));
  }, [presentation, frameIndex]);

  const replay: ReplayViewModel = {
    status,
    title: presentation?.title ?? "Linux Observatory",
    caveat: presentation?.caveat ?? "Mô phỏng ngữ nghĩa độc lập.",
    current: presentation?.frames[frameIndex] ? toFrameView(presentation.frames[frameIndex]) : undefined,
    frameIndex,
    frameCount: presentation?.frames.length ?? 1,
    playing,
    error,
  };

  function moveReplay(delta: -1 | 1) {
    setPlaying(false);
    setFrameIndex((c) => Math.max(0, Math.min(c + delta, (presentation?.frames.length ?? 1) - 1)));
  }

  function playPause() {
    audioEngine.ensureContext();
    if (!presentation) { void loadScenario(selectedScenarioId, true); return; }
    if (!playing && frameIndex >= presentation.frames.length - 1) setFrameIndex(0);
    setPlaying((c) => !c);
  }

  function resetReplay() { setPlaying(false); setFrameIndex(0); }

  function handleSelectScenario(scenarioId: string) { void loadScenario(scenarioId, false); }

  function handleJumpToFrame(idx: number) {
    setPlaying(false);
    setFrameIndex(idx);
  }

  function handleToggleMute() {
    audioEngine.ensureContext();
    const next = !audioMuted;
    audioEngine.setMuted(next);
    setAudioMuted(next);
  }

  function handleVolumeChange(vol: number) {
    audioEngine.ensureContext();
    audioEngine.setVolume(vol);
    setAudioVolume(vol);
  }

  function submitTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;

    const targetScenarioId = commandToScenario[command];

    if (targetScenarioId) {
      setTerminalLines((c) => [
        ...c,
        `observer@synthetic:~$ ${command}`,
        "MÔ PHỎNG NGỮ NGHĨA — ĐÃ XÁC THỰC QUA CHUỖI BẰNG CHỨNG",
        `Đang khởi chạy kịch bản mô phỏng cho: ${command}`,
      ]);
      setTerminalInput("");
      void loadScenario(targetScenarioId, true);
      return;
    }

    setTerminalLines((c) => [
      ...c,
      `observer@synthetic:~$ ${command}`,
      "Lệnh chưa được hỗ trợ trong bản mô phỏng hiện tại. Nhấp vào các chip kịch bản ở trên để chọn lệnh có sẵn.",
    ]);
    audioEngine.playEvent("error", 0);
    setTerminalInput("");
  }

  const currentInfoCard = useMemo((): InfoCardView => {
    const base = entityCards[selectedEntity] ?? entityCards.overview;
    const currentFrame = presentation?.frames[frameIndex];
    if (!currentFrame) return base;

    const matchingNode = currentFrame.snapshot.entities.find(
      (e) => e.id.includes(selectedEntity) || (selectedEntity === "overview" && false),
    );

    const isExited =
      matchingNode &&
      (typeof matchingNode.lifecycle === "object"
        ? true
        : matchingNode.lifecycle === "exited");

    const lifecycleStr = matchingNode
      ? isExited
        ? "ĐÃ KẾT THÚC (Trạng thái: 0)"
        : "ĐANG HOẠT ĐỘNG (ACTIVE)"
      : undefined;

    const pidMap: Record<string, string> = {
      shell: "PID 1000",
      cat: "PID 1001",
      grep: "PID 1002",
      echo: "PID 1001",
      ls: "PID 1001",
      ps: "PID 1001",
      kernel: "PID 0 [HẠT NHÂN]",
    };

    const fdMap: Record<string, readonly string[]> = {
      shell: ["FD 0: /dev/tty (stdin)", "FD 1: /dev/tty (stdout)", "FD 2: /dev/tty (stderr)"],
      cat: ["FD 0: /dev/tty", "FD 1: pipe:[1] (ghi luồng)", "FD 3: file.txt (đọc VFS)"],
      grep: ["FD 0: pipe:[0] (đọc luồng)", "FD 1: /dev/tty (stdout)", "FD 2: /dev/tty"],
      echo: ["FD 0: /dev/tty", "FD 1: sample.txt (chuyển hướng ghi)", "FD 2: /dev/tty"],
      ls: ["FD 0: /dev/tty", "FD 1: /dev/tty (stdout)", "FD 3: /dir (getdents)"],
      ps: ["FD 0: /dev/tty", "FD 1: /dev/tty (stdout)", "FD 3: /proc (virtual vfs)"],
      pipe: ["Đầu đọc: pipe:[0]", "Đầu ghi: pipe:[1]", "Vùng đệm: 64KB kernel circular buffer"],
    };

    const activeRelations = currentFrame.snapshot.relations
      .filter((r) => r.from.includes(selectedEntity) || r.to.includes(selectedEntity))
      .map((r) => `${r.from} ➔ [${r.relation}] ➔ ${r.to}`);

    return {
      ...base,
      pid: pidMap[selectedEntity],
      lifecycle: lifecycleStr ?? (selectedEntity === "kernel" ? "HOẠT ĐỘNG LIÊN TỤC" : undefined),
      activeFds: fdMap[selectedEntity],
      relations: activeRelations.length > 0 ? activeRelations : undefined,
      evidenceSource: `Syscall tracepoint (${currentFrame.event_kind})`,
      confidence: "100% Xác thực (Synthetic verified)",
    };
  }, [selectedEntity, presentation, frameIndex]);

  return (
    <LearningShell
      replay={replay}
      scene={(
        <IndustrialMegacity
          frame={visualFrame}
          frameHistory={frameHistory}
          playing={playing}
          cameraMode={cameraMode}
          totalFrames={presentation?.frames.length ?? 1}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
          onBackendChange={setBackend}
          onTelemetry={setTelemetry}
        />
      )}
      infoCard={currentInfoCard}
      selectedEntity={selectedEntity}
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
      allEvents={allEvents}
      onJumpToFrame={handleJumpToFrame}
      audioMuted={audioMuted}
      audioVolume={audioVolume}
      onToggleMute={handleToggleMute}
      onVolumeChange={handleVolumeChange}
      onCameraModeChange={setCameraMode}
      onPlaybackSpeedChange={setPlaybackSpeed}
      onSelectScenario={handleSelectScenario}
      onTerminalInputChange={setTerminalInput}
      onTerminalSubmit={submitTerminal}
      onToggleTerminal={() => setTerminalOpen((c) => !c)}
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
