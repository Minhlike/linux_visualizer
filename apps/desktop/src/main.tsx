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
import { invoke, isTauri } from "@tauri-apps/api/core";
import fixtureSource from "../../../semantic-core/fixtures/cat-grep.json";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing");
}

interface NativeReplayFrame {
  readonly sequence: number;
  readonly stage: string;
  readonly event_kind: string;
  readonly summary: string;
  readonly node_count: number;
  readonly edge_count: number;
  readonly focus_node_ids: readonly string[];
}

interface NativeReplayPresentation {
  readonly scenario_id: string;
  readonly title: string;
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
  readonly evidence_mode: "synthetic_replay";
  readonly caveat: string;
  readonly events: readonly FixtureEnvelope[];
}

const fixture = fixtureSource as unknown as ReplayFixture;

const eventSummaries: Readonly<Record<string, string>> = {
  shell_started: "Shell accepts the pipeline",
  pipe_created: "Kernel creates an anonymous pipe",
  process_forked: "Shell forks a pipeline process",
  file_descriptor_duplicated: "A descriptor is redirected with dup semantics",
  file_descriptor_closed: "An inherited descriptor is closed",
  process_executed: "Child image is replaced by the target executable",
  file_opened: "CAT opens file.txt for reading",
  bytes_read: "Bytes cross a kernel I/O boundary",
  bytes_written: "CAT writes bytes into the pipe",
  process_exited: "Pipeline process exits",
  process_waited: "Shell observes child completion",
};

const entityCards: Readonly<Record<VisualEntityId, InfoCardView>> = {
  overview: {
    name: "Industrial Megacity",
    type: "SYSTEM PROJECTION",
    visualMetaphor: "A city of specialized runtime facilities connected by directed infrastructure.",
    technicalReality: "A disposable visual projection of the validated semantic replay graph.",
    limitations: "Distance and building scale do not represent kernel memory, latency, or privilege.",
  },
  shell: {
    name: "Shell Control Center",
    type: "PROCESS / ORCHESTRATOR",
    visualMetaphor: "A control tower commissioning the pipeline.",
    technicalReality: "The shell creates the pipe, forks children, manages descriptors, and waits.",
    limitations: "This view omits parsing details, job control, and shell-specific scheduling behavior.",
  },
  cat: {
    name: "CAT Process Factory",
    type: "USER-SPACE PROCESS",
    visualMetaphor: "A factory pulling material from storage and feeding a conduit.",
    technicalReality: "A child process execs /bin/cat, reads file.txt, and writes bytes to stdout.",
    limitations: "The building is not an address-space map and its size is not resource usage.",
  },
  grep: {
    name: "GREP Process Factory",
    type: "USER-SPACE PROCESS",
    visualMetaphor: "A filtering plant receiving the conduit stream.",
    technicalReality: "A child process execs /bin/grep and reads the pipe through stdin.",
    limitations: "Matching internals, buffering, and output writes are outside this 22-frame replay.",
  },
  filesystem: {
    name: "Filesystem Storage",
    type: "KERNEL-BACKED RESOURCE",
    visualMetaphor: "A storage depot supplying source material.",
    technicalReality: "file.txt is opened and bytes are read through CAT's file descriptor.",
    limitations: "No specific filesystem, cache layer, block device, or physical layout is claimed.",
  },
  kernel: {
    name: "Kernel Core",
    type: "MEDIATION LAYER",
    visualMetaphor: "A central power and routing core beneath process activity.",
    technicalReality: "Kernel mechanisms mediate process, descriptor, file, pipe, and wait operations.",
    limitations: "Not a literal single core; scheduler, VFS, memory, and syscall internals are compressed.",
  },
  pipe: {
    name: "Anonymous Pipe",
    type: "KERNEL BYTE STREAM",
    visualMetaphor: "A directional industrial conduit from CAT to GREP.",
    technicalReality: "A kernel byte stream referenced by CAT stdout and GREP stdin descriptors.",
    limitations: "Not a file, not process-owned, and it preserves no message boundaries.",
  },
};

function collectSemanticIds(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^(process|pipe|file):/.test(value)) result.add(value);
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

function browserPresentation(): NativeReplayPresentation {
  return {
    scenario_id: fixture.id,
    title: fixture.title,
    evidence_mode: fixture.evidence_mode,
    caveat: fixture.caveat,
    frames: fixture.events.map((envelope) => ({
      sequence: envelope.sequence,
      stage: envelope.stage,
      event_kind: envelope.event.type,
      summary: eventSummaries[envelope.event.type] ?? envelope.event.type.replaceAll("_", " "),
      node_count: 0,
      edge_count: 0,
      focus_node_ids: [...collectSemanticIds(envelope.event)],
    })),
  };
}

function toFrameView(frame: NativeReplayFrame): ReplayFrameView {
  return {
    sequence: frame.sequence,
    stage: frame.stage,
    eventKind: frame.event_kind,
    summary: frame.summary,
    nodeCount: frame.node_count,
    edgeCount: frame.edge_count,
    focusNodeIds: frame.focus_node_ids,
  };
}

function toVisualFrame(frame: NativeReplayFrame): VisualReplayFrame {
  return {
    sequence: frame.sequence,
    stage: frame.stage,
    eventKind: frame.event_kind,
    summary: frame.summary,
    focusNodeIds: frame.focus_node_ids,
  };
}

function focusedVisualEntity(frame: NativeReplayFrame): VisualEntityId {
  if (frame.sequence >= 22) return "overview";
  if (frame.stage === "pipe_io" || frame.focus_node_ids.some((id) => id.startsWith("pipe:"))) {
    return "pipe";
  }
  if (frame.focus_node_ids.includes("file:file.txt")) return "filesystem";
  if (frame.focus_node_ids.includes("process:grep")) return "grep";
  if (frame.focus_node_ids.includes("process:cat")) return "cat";
  if (frame.focus_node_ids.includes("process:shell")) return "shell";
  return "kernel";
}

function DesktopApp() {
  const [presentation, setPresentation] = useState<NativeReplayPresentation>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] = useState<ReplayViewModel["status"]>("loading");
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<VisualEntityId>("kernel");
  const [viewMode, setViewMode] = useState<VisualViewMode>("city");
  const [backend, setBackend] = useState<RenderBackend>("initializing");
  const [telemetry, setTelemetry] = useState<SceneTelemetry>();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLines, setTerminalLines] = useState<readonly string[]>([
    "Synthetic command console ready.",
    "Type: cat file.txt | grep linux",
  ]);
  const loadedOnce = useRef(false);

  async function loadReplay(startPlaying = false) {
    setStatus("loading");
    setError(undefined);
    try {
      const result = isTauri()
        ? await invoke<NativeReplayPresentation>("mock_pipe_replay")
        : browserPresentation();
      if (result.evidence_mode !== "synthetic_replay" || result.frames.length !== 22) {
        throw new Error("backend did not return the validated 22-frame replay");
      }
      setPresentation(result);
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
    void loadReplay(false);
  }, []);

  useEffect(() => {
    if (!playing || !presentation) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= presentation.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1150);
    return () => window.clearInterval(timer);
  }, [playing, presentation]);

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
    caveat: presentation?.caveat ?? "Synthetic replay only.",
    current: presentation?.frames[frameIndex]
      ? toFrameView(presentation.frames[frameIndex])
      : undefined,
    frameIndex,
    frameCount: presentation?.frames.length ?? 22,
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
      void loadReplay(true);
      return;
    }
    if (!playing && frameIndex >= presentation.frames.length - 1) setFrameIndex(0);
    setPlaying((current) => !current);
  }

  function resetReplay() {
    setPlaying(false);
    setFrameIndex(0);
  }

  function submitTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;
    if (command === "cat file.txt | grep linux") {
      setTerminalLines((current) => [
        ...current,
        `observer@synthetic:~$ ${command}`,
        "SYNTHETIC REPLAY — NOT LIVE LINUX",
        "Validated 22-frame semantic replay started.",
      ]);
      setTerminalInput("");
      void loadReplay(true);
      return;
    }
    setTerminalLines((current) => [
      ...current,
      `observer@synthetic:~$ ${command}`,
      "Unsupported in P2. Try: cat file.txt | grep linux",
    ]);
    setTerminalInput("");
  }

  return (
    <LearningShell
      replay={replay}
      scene={(
        <IndustrialMegacity
          frame={visualFrame}
          frameHistory={frameHistory}
          playing={playing}
          viewMode={viewMode}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
          onBackendChange={setBackend}
          onTelemetry={setTelemetry}
        />
      )}
      infoCard={entityCards[selectedEntity]}
      selectedEntity={selectedEntity}
      viewMode={viewMode}
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
      onViewModeChange={setViewMode}
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
