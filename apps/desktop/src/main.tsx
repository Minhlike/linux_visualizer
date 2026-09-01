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
  type VisualCommandGraph,
  type VisualReplayFrame,
} from "@linux-observatory/renderer";
import { resolveActionPlan, type ActionContext, type CameraFollowMode, type EvidenceMode } from "@linux-observatory/camera-director";
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
  readonly action_context: ActionContext;
}

interface NativeCommandGraph extends VisualCommandGraph {
  readonly raw_command: string;
  readonly fidelity_level: "evidence_grounded" | "structurally_derived" | "opaque_command";
}

interface NativeReplayPresentation {
  readonly scenario_id: string;
  readonly title: string;
  readonly command: string;
  readonly evidence_mode: EvidenceMode;
  readonly fidelity_level: "evidence_grounded" | "structurally_derived" | "opaque_command";
  readonly caveat: string;
  readonly command_graph: NativeCommandGraph;
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

/* Entity X positions in the unified plant layout (for stereo panning) */
const entityXPositions: Readonly<Record<string, number>> = {
  shell: -4,
  cat: -1.5,
  echo: -1.5,
  ls: -1.5,
  ps: -1.5,
  filesystem: -2,
  kernel: 0,
  pipe: 0.5,
  grep: 2.5,
  terminal: 3,
  process: 0,
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

/* ── Entity info cards — honest about synthetic evidence ─────────── */
const entityCards: Readonly<Record<string, InfoCardView>> = {
  overview: {
    name: "Linux Observatory Plant",
    type: "HỆ MÁY QUAN SÁT HỢP KHỐI",
    visualMetaphor: "Hệ máy cơ khí hợp khối với lõi hạt nhân trung tâm, các bay tiến trình, conduit dữ liệu và console I/O.",
    technicalReality: "Phép chiếu trực quan từ đồ thị ngữ nghĩa. Khoảng cách và cơ chế mang tính ẩn dụ.",
    limitations: "Khoảng cách không đại diện cho địa chỉ bộ nhớ. Cơ chế là phép ẩn dụ, không phải mô phỏng phần cứng.",
  },
  shell: {
    name: "Shell Dispatch Bay",
    type: "TIẾN TRÌNH ĐIỀU PHỐI",
    visualMetaphor: "Bàn điều khiển relay với các thanh routing dispatch tới process bay.",
    technicalReality: "Shell tạo pipe, fork tiến trình con, dup2 chuyển hướng FD, wait thu nhận kết thúc.",
    limitations: "Không hiển thị AST parsing, job control hay lập lịch nội bộ.",
  },
  cat: {
    name: "CAT Intake Module",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Buồng nạp liệu với hatch và intake roller hút dữ liệu từ storage vault.",
    technicalReality: "exec /bin/cat → open(file) → read(fd) → write(stdout). Dữ liệu đi qua kernel buffer.",
    limitations: "Không mô phỏng page cache, read-ahead, hay buffer size thực tế.",
  },
  grep: {
    name: "GREP Filter Chamber",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Buồng lọc với các thanh lọc dọc. Dữ liệu khớp mẫu đi qua, phần còn lại bị triệt.",
    technicalReality: "exec /bin/grep → read(stdin/pipe) → regex match → write(stdout).",
    limitations: "Thuật toán regex, buffer nội bộ và line-buffering mode được giản lược.",
  },
  echo: {
    name: "ECHO Emitter Module",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Bộ phát horn đẩy byte burst trực tiếp ra đích chuyển hướng.",
    technicalReality: "echo → write(fd1 đã dup2 sang file). Chuỗi byte ghi trực tiếp.",
    limitations: "Sự khác biệt built-in/external echo được giản lược.",
  },
  ls: {
    name: "LS Scanner Turret",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Tháp quét xoay với đĩa cảm biến đọc danh mục thư mục.",
    technicalReality: "exec /bin/ls → getdents(dir_fd) → stat() → format → write(stdout).",
    limitations: "Cấu trúc dentry cache và inode table được giản lược.",
  },
  ps: {
    name: "PS Diagnostic Probe",
    type: "TIẾN TRÌNH USER-SPACE",
    visualMetaphor: "Đầu dò chẩn đoán với vòng cảm biến quét /proc.",
    technicalReality: "exec /bin/ps → read(/proc/[pid]/*) → format → write(stdout).",
    limitations: "Các trường task_struct mở rộng được thu gọn.",
  },
  filesystem: {
    name: "Storage Assembly",
    type: "TÀI NGUYÊN KERNEL / VFS",
    visualMetaphor: "Kho lưu trữ lục giác tĩnh với hatch mở khi file được truy cập.",
    technicalReality: "VFS abstraction layer. open() tạo file description entry + cấp phát FD.",
    limitations: "Không ràng buộc filesystem cụ thể, page cache, hay thiết bị khối.",
  },
  terminal: {
    name: "I/O Console",
    type: "THIẾT BỊ KÝ TỰ TTY",
    visualMetaphor: "Console màn hình + bàn phím. Phản ứng khi nhận stdout hoặc gửi stdin.",
    technicalReality: "Thiết bị tty/pts liên kết với FD 0/1/2 tiêu chuẩn.",
    limitations: "Line discipline, escape sequence, và termios config được bỏ qua.",
  },
  kernel: {
    name: "Kernel Core Spine",
    type: "CƠ SỞ HẠ TẦNG HỆ THỐNG",
    visualMetaphor: "Trục xương sống bát giác trung tâm với vòng kết nối điều phối.",
    technicalReality: "Hạt nhân quản lý FD table, VFS, scheduler, IPC, memory management.",
    limitations: "Không phải một process. Đây là cơ sở hạ tầng, không phải thực thể riêng biệt.",
  },
  pipe: {
    name: "Pipe Conduit",
    type: "VÙNG ĐỆM BYTE HẠT NHÂN",
    visualMetaphor: "Ống dẫn trong suốt có hướng giữa hai process bay.",
    technicalReality: "Circular buffer trong kernel RAM. Unidirectional, stream-oriented.",
    limitations: "Capacity phụ thuộc kernel config (thường 64KB nhưng không cố định).",
  },
  process: {
    name: "Generic Process Workcell",
    type: "OPAQUE USER-SPACE PROCESS",
    visualMetaphor: "Chassis tiến trình chuẩn với cổng I/O khai báo được và lõi nội bộ đóng kín.",
    technicalReality: "Shell có thể spawn/exec và nối stdin/stdout dựa trên cấu trúc lệnh đã parse.",
    limitations: "Nội bộ chương trình chưa được quan sát; không suy đoán syscall, thuật toán, PID hay lượng byte.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────
function collectSemanticIds(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^(process|pipe|file|device|fd):/.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectSemanticIds(v, result)); return result; }
  if (value && typeof value === "object") { Object.values(value).forEach((v) => collectSemanticIds(v, result)); }
  return result;
}

function semanticId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

function browserPresentation(fixtureId: string): NativeReplayPresentation {
  const fixture = browserFixtures[fixtureId];
  if (!fixture) throw new Error(`Kịch bản "${fixtureId}" không tồn tại trong bộ fixture.`);
  const exitedProcesses = new Set<string>();
  const descriptorTargets = new Map<string, string>();
  const nodeKinds = new Map<string, ActionContext["target_node_kind"]>();
  const executableByProcess = new Map<string, string>();
  fixture.events.forEach(({ event }) => {
    if (event.type === "process_executed") {
      const process = semanticId(event.process);
      if (process && typeof event.executable === "string") executableByProcess.set(process, event.executable);
    }
  });

  const contextFor = (event: FixtureEnvelope["event"]): ActionContext => {
    const process = semanticId(event.process);
    const descriptor = semanticId(event.descriptor);
    const target = descriptor ? descriptorTargets.get(descriptor) ?? null : null;
    const base = {
      actor: process, parent: null, child: null, executable: process ? executableByProcess.get(process) ?? null : null,
      descriptor, descriptor_target: target, target_node_kind: target ? nodeKinds.get(target) ?? null : null,
      source: null, destination: null, relation: null, byte_count: null, file_access: null,
      pipeline_id: null, evidence_mode: "synthetic_replay" as const, confidence: "inferred" as const,
    } satisfies Omit<ActionContext, "event_type">;
    switch (event.type) {
      case "shell_started": { const shell = semanticId(event.shell); return { ...base, event_type: "shell_start", actor: shell, source: shell, destination: shell }; }
      case "process_started": { const actor = semanticId(event.process); return { ...base, event_type: "spawn", actor, destination: actor }; }
      case "standard_streams_initialized": {
        const terminal = semanticId(event.terminal);
        for (const key of ["stdin_descriptor", "stdout_descriptor", "stderr_descriptor"] as const) { const fd = semanticId(event[key]); if (fd && terminal) descriptorTargets.set(fd, terminal); }
        if (terminal) nodeKinds.set(terminal, "terminal");
        return { ...base, event_type: "stream_init", source: process, destination: terminal, target_node_kind: "terminal" };
      }
      case "pipe_created": {
        const pipe = semanticId(event.pipe); const read = semanticId(event.read_endpoint); const write = semanticId(event.write_endpoint);
        const readFd = semanticId(event.read_descriptor); const writeFd = semanticId(event.write_descriptor);
        if (pipe) nodeKinds.set(pipe, "anonymous_pipe");
        if (read) nodeKinds.set(read, "pipe_endpoint"); if (write) nodeKinds.set(write, "pipe_endpoint");
        if (readFd && read) descriptorTargets.set(readFd, read); if (writeFd && write) descriptorTargets.set(writeFd, write);
        const creator = semanticId(event.creator);
        return { ...base, event_type: "pipe_create", actor: creator, source: creator, destination: pipe, target_node_kind: "anonymous_pipe", pipeline_id: pipe };
      }
      case "process_forked": {
        const parent = semanticId(event.parent); const child = semanticId(event.child);
        const inherited = Array.isArray(event.inherited_descriptors) ? event.inherited_descriptors : [];
        for (const item of inherited) {
          if (!item || typeof item !== "object") continue;
          const from = semanticId((item as Record<string, unknown>).from_parent);
          const childFd = semanticId((item as Record<string, unknown>).child_descriptor);
          const inheritedTarget = from ? descriptorTargets.get(from) : null;
          if (childFd && inheritedTarget) descriptorTargets.set(childFd, inheritedTarget);
        }
        return { ...base, event_type: "spawn", actor: parent, parent, child, executable: child ? executableByProcess.get(child) ?? null : null, source: parent, destination: child, relation: "parent_of" };
      }
      case "file_descriptor_duplicated": {
        const from = semanticId(event.from_descriptor); const to = semanticId(event.to_descriptor); const fdTarget = from ? descriptorTargets.get(from) ?? null : null;
        if (to && fdTarget) descriptorTargets.set(to, fdTarget);
        return { ...base, event_type: "fd_duplicate", descriptor: to, descriptor_target: fdTarget, target_node_kind: fdTarget ? nodeKinds.get(fdTarget) ?? null : null, source: from, destination: to, relation: "refers_to" };
      }
      case "file_descriptor_closed": return { ...base, event_type: "fd_close", source: process, destination: descriptor };
      case "process_executed": return { ...base, event_type: "exec", executable: typeof event.executable === "string" ? event.executable : null, source: process, destination: process };
      case "file_opened": {
        const file = semanticId(event.file); const openedFd = semanticId(event.descriptor); const access = typeof event.access === "string" ? event.access as ActionContext["file_access"] : null;
        if (file) nodeKinds.set(file, "regular_file"); if (openedFd && file) descriptorTargets.set(openedFd, file);
        const reads = access === "read_only";
        return { ...base, event_type: "open", descriptor: openedFd, descriptor_target: file, target_node_kind: "regular_file", file_access: access, source: reads ? file : process, destination: reads ? process : file, relation: reads ? "reads_from" : "writes_to" };
      }
      case "bytes_read": return { ...base, event_type: "read", source: target, destination: process, relation: "reads_from", byte_count: typeof event.byte_count === "number" ? event.byte_count : null };
      case "bytes_written": return { ...base, event_type: "write", source: process, destination: target, relation: "writes_to", byte_count: typeof event.byte_count === "number" ? event.byte_count : null };
      case "process_exited": return { ...base, event_type: "exit", source: process, destination: process };
      case "process_waited": { const waiter = semanticId(event.waiter); const child = semanticId(event.waited_for); return { ...base, event_type: "wait", actor: waiter, parent: waiter, child, executable: child ? executableByProcess.get(child) ?? null : null, source: waiter, destination: child, relation: "waits_for" }; }
      default: return { ...base, event_type: "unknown_internal" };
    }
  };
  /* Persistent lifecycle: once exited, stays exited across all subsequent frames */
  const frames = fixture.events.map((envelope) => {
    let actionContext = contextFor(envelope.event);
    if (actionContext.descriptor_target && actionContext.target_node_kind === "pipe_endpoint") {
      const pipeEvent = fixture.events.find(({ event }) => event.type === "pipe_created" && [semanticId(event.read_endpoint), semanticId(event.write_endpoint)].includes(actionContext.descriptor_target));
      actionContext = { ...actionContext, pipeline_id: pipeEvent ? semanticId(pipeEvent.event.pipe) : null };
    }
    if (envelope.event.type === "process_exited") {
      const ids = collectSemanticIds(envelope.event);
      ids.forEach((id) => { if (id.startsWith("process:")) exitedProcesses.add(id); });
    }
    const ids = [...collectSemanticIds(envelope.event)];
    const entities: readonly NativeSemanticEntity[] = ids
      .filter((id) => !id.startsWith("fd:"))
      .map((id) => ({ id, kind: id.split(":")[0] || "unknown", label: id, lifecycle: exitedProcesses.has(id) ? { exited: { status: 0 } } : "active" }));
    return {
      sequence: envelope.sequence, stage: envelope.stage, event_kind: envelope.event.type,
      summary: eventSummaries[envelope.event.type] ?? envelope.event.type.replaceAll("_", " "),
      entities, relations: [] as const, focus_candidates: ids.filter((id) => !id.startsWith("fd:")),
      snapshot: { revision: envelope.sequence, entities, relations: [] as const }, action_context: actionContext,
    };
  });
  const processes = [...executableByProcess].map(([id, executable]) => ({
    id, executable, semantic_adapter: ["cat", "grep", "echo", "ls", "ps"].includes(executable.replaceAll("\\", "/").split("/").pop() ?? "") ? executable.replaceAll("\\", "/").split("/").pop() ?? null : null,
    opaque_internals: false,
  }));
  return {
    scenario_id: fixture.id,
    title: fixture.title,
    command: fixture.command ?? fixture.title,
    evidence_mode: fixture.evidence_mode,
    fidelity_level: "evidence_grounded",
    caveat: fixture.caveat,
    command_graph: { raw_command: fixture.command ?? fixture.title, fidelity_level: "evidence_grounded", pipelines: [{ id: "fixture", processes }], execution_edges: frames.map((frame) => ({ source: frame.action_context.source ?? "shell:main", destination: frame.action_context.destination ?? frame.action_context.actor ?? "shell:main", relation: frame.action_context.relation ?? frame.action_context.event_type })) },
    frames,
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
    actionContext: frame.action_context,
  };
}

/**
 * Derive entity info from actual fixture evidence instead of hardcoding fake PIDs/FDs.
 * Entity provenance comes from the frame's own evidence chain, not a global lookup.
 */
function deriveInfoCard(
  entity: VisualEntityId,
  frame: NativeReplayFrame | undefined,
  history: readonly NativeReplayFrame[],
  evidenceMode: EvidenceMode = "synthetic_replay",
  commandGraph?: NativeCommandGraph,
): InfoCardView {
  const isGenericProcess = commandGraph?.pipelines.some((pipeline) => pipeline.processes.some((process) => process.id === entity && process.opaque_internals)) ?? false;
  const base = entityCards[entity] ?? (isGenericProcess ? entityCards.process : undefined) ?? entityCards.overview!;
  if (!frame) return base;

  /* Find matching entity in snapshot */
  const matchingNode = frame.snapshot.entities.find(
    (e) => e.id.includes(entity) || (entity === "overview" && false),
  );

  const isExited = matchingNode
    ? typeof matchingNode.lifecycle === "object" || matchingNode.lifecycle === "exited"
    : false;

  /* Persistent lifecycle: check entire history for exit */
  const everExited = history.some((f) =>
    f.snapshot.entities.some(
      (e) => e.id.includes(entity) && (typeof e.lifecycle === "object" || e.lifecycle === "exited"),
    ),
  );

  const lifecycleStr = matchingNode
    ? everExited || isExited
      ? "ĐÃ KẾT THÚC"
      : "ĐANG HOẠT ĐỘNG"
    : entity === "kernel"
      ? "HẠ TẦNG HOẠT ĐỘNG"
      : undefined;

  /* Derive FD info from evidence in history — only FDs actually mentioned */
  const mentionedFds: string[] = [];
  for (const f of history) {
    for (const id of f.focus_candidates) {
      if (id.startsWith(`fd:${entity}:`) || id.startsWith(`fd:${entity === "shell" ? "shell" : entity}:`)) {
        const label = f.snapshot.entities.find((e) => e.id === id)?.label;
        if (label && !mentionedFds.includes(label)) mentionedFds.push(label);
      }
    }
  }

  /* Derive relations from snapshot */
  const activeRelations = frame.snapshot.relations
    .filter((r) => r.from.includes(entity) || r.to.includes(entity))
    .map((r) => `${r.from} → [${r.relation}] → ${r.to}`);

  return {
    ...base,
    /* No fake PID — the fixture doesn't assign specific numeric PIDs */
    lifecycle: lifecycleStr,
    activeFds: mentionedFds.length > 0 ? mentionedFds : undefined,
    relations: activeRelations.length > 0 ? activeRelations : undefined,
    /* Honest evidence labeling */
    evidenceSource: evidenceMode === "synthetic_replay" ? `Synthetic semantic fixture (${frame.event_kind})` : `Shell structure parser (${frame.action_context.event_type})`,
    confidence: evidenceMode === "synthetic_replay"
      ? "LEVEL A — fixture có provenance, không phải live trace"
      : evidenceMode === "structurally_derived"
        ? "LEVEL B — suy diễn cấu trúc, không phải trace kernel"
        : "LEVEL C — opaque executable, nội bộ chưa quan sát",
  };
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
  const [selectedEntity, setSelectedEntity] = useState<VisualEntityId>("overview");
  const [backend, setBackend] = useState<RenderBackend>("initializing");
  const [telemetry, setTelemetry] = useState<SceneTelemetry>();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<readonly string[]>([
    "Linux Observatory — Bảng lệnh mô phỏng ngữ nghĩa sẵn sàng.",
    "Nhập pipeline/redirection shell an toàn; lệnh không được thực thi.",
  ]);
  const [audioMuted, setAudioMuted] = useState(() => audioEngine.isMuted());
  const [audioVolume, setAudioVolume] = useState(() => audioEngine.getVolume());
  const loadedOnce = useRef(false);
  const prevFrameIndex = useRef(-1);

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
      prevFrameIndex.current = -1;
      setStatus("ready");
      setPlaying(startPlaying);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
      setPlaying(false);
    }
  }

  async function loadCommand(command: string, startPlaying = true) {
    setStatus("loading");
    setError(undefined);
    try {
      let result: NativeReplayPresentation;
      if (isTauri()) {
        result = await invoke<NativeReplayPresentation>("run_command_scenario", { command });
      } else {
        const fixtureId = commandToScenario[command];
        if (!fixtureId) throw new Error("Generic command planning chạy trong desktop Tauri; web preview chỉ dùng fixture kiểm thử.");
        result = browserPresentation(fixtureId);
      }
      if (result.frames.length === 0) throw new Error("Planner không sinh action hợp lệ");
      setPresentation(result);
      setSelectedScenarioId(result.scenario_id);
      setFrameIndex(0);
      prevFrameIndex.current = -1;
      setStatus("ready");
      setPlaying(startPlaying);
      return result;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message); setStatus("error"); setPlaying(false);
      throw reason;
    }
  }

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadScenario("cat-file-pipe-grep-v1", false);
  }, []);

  useEffect(() => {
    if (!playing || !presentation) return undefined;
    const intervalMs = Math.round(1800 / playbackSpeed); // Slower default to let choreography breathe
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

  /* Sync selectedEntity and play audio only when frame actually changes using canonical ActionPlan */
  useEffect(() => {
    const current = presentation?.frames[frameIndex];
    if (!current) return;
    if (frameIndex === prevFrameIndex.current) return; // Prevent duplicate audio
    prevFrameIndex.current = frameIndex;

    const plan = resolveActionPlan(current.action_context);
    const ent = plan.source.role === "process" ? plan.source.semanticId : plan.source.role;
    setSelectedEntity(ent);
    const x = entityXPositions[plan.source.role] ?? 0;
    audioEngine.playEvent(plan.audioCue, x, playbackSpeed);

    /* Update audio ambience level based on how active the system is */
    const activeCount = frameHistory.filter((f) => f.actionContext.event_type !== "exit" && f.actionContext.event_type !== "wait").length;
    audioEngine.setActivityLevel(Math.min(1, activeCount / Math.max(1, presentation?.frames.length ?? 1)));

    if (frameIndex === (presentation?.frames.length ?? 0) - 1) {
      audioEngine.playEvent("completion", 0);
      audioEngine.setActivityLevel(0);
    }
  }, [frameIndex, presentation, frameHistory]);

  const allEvents: readonly EventBoardItem[] = useMemo(() => {
    if (!presentation) return [];
    return presentation.frames.map((f, idx) => {
      const plan = resolveActionPlan(f.action_context);
      return {
        index: idx,
        sequence: f.sequence,
        stage: f.stage,
        eventKind: f.event_kind,
        summary: f.summary,
        status: idx < frameIndex ? "past" : idx === frameIndex ? "current" : "upcoming",
        sourceId: plan.source.role === "pipe" ? f.action_context.pipeline_id ?? plan.source.semanticId : plan.source.semanticId,
        destinationId: plan.target.role === "pipe" ? f.action_context.pipeline_id ?? plan.target.semanticId : plan.target.semanticId,
        relation: f.action_context.relation,
      };
    });
  }, [presentation, frameIndex]);

  const replay: ReplayViewModel = {
    status,
    title: presentation?.title ?? "Linux Observatory",
    caveat: presentation?.caveat ?? "Mô phỏng ngữ nghĩa độc lập.",
    evidenceMode: presentation?.evidence_mode ?? "opaque_command",
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

    setTerminalLines((c) => [
      ...c,
      `observer@planner:~$ ${command}`,
      "Đang parse cấu trúc shell — KHÔNG THỰC THI LỆNH.",
    ]);
    setTerminalInput("");
    void loadCommand(command, true).then((result) => {
      setTerminalLines((lines) => [...lines, result.caveat]);
    }).catch((reason) => {
      setTerminalLines((lines) => [...lines, `TỪ CHỐI: ${reason instanceof Error ? reason.message : String(reason)}`]);
      audioEngine.playEvent("error", 0);
    });
  }

  /* Derive info card from evidence, not hardcoded data */
  const currentInfoCard = useMemo(
    () => deriveInfoCard(
      selectedEntity,
      presentation?.frames[frameIndex],
      presentation?.frames.slice(0, frameIndex + 1) ?? [],
      presentation?.evidence_mode,
      presentation?.command_graph,
    ),
    [selectedEntity, presentation, frameIndex],
  );

  return (
    <LearningShell
      replay={replay}
      scene={(
        <IndustrialMegacity
          frame={visualFrame}
          frameHistory={frameHistory}
          commandGraph={presentation?.command_graph}
          playing={playing}
          playbackSpeed={playbackSpeed}
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
      commandGraph={presentation?.command_graph}
      telemetry={{
        backend,
        fps: telemetry?.fps,
        frameIntervalAvgMs: telemetry?.frameIntervalAvgMs,
        frameIntervalP95Ms: telemetry?.frameIntervalP95Ms,
        drawCalls: telemetry?.drawCalls,
        triangles: telemetry?.triangles,
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
