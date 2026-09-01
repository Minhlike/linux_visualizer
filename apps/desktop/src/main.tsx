import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LearningShell,
  type ReplayFrameView,
  type ReplayViewModel,
} from "@linux-observatory/learning-ui";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
}

interface NativeReplayPresentation {
  readonly scenario_id: string;
  readonly title: string;
  readonly evidence_mode: "synthetic_replay";
  readonly caveat: string;
  readonly frames: readonly NativeReplayFrame[];
}

function toFrameView(frame: NativeReplayFrame): ReplayFrameView {
  return {
    sequence: frame.sequence,
    stage: frame.stage,
    eventKind: frame.event_kind,
    summary: frame.summary,
    nodeCount: frame.node_count,
    edgeCount: frame.edge_count,
  };
}

function DesktopApp() {
  const [presentation, setPresentation] =
    useState<NativeReplayPresentation>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] =
    useState<ReplayViewModel["status"]>("idle");
  const [error, setError] = useState<string>();

  const replay: ReplayViewModel = {
    available: isTauri(),
    status,
    title: presentation?.title,
    caveat: presentation?.caveat,
    current: presentation?.frames[frameIndex]
      ? toFrameView(presentation.frames[frameIndex])
      : undefined,
    frameIndex,
    frameCount: presentation?.frames.length ?? 0,
    error,
  };

  async function loadReplay() {
    setStatus("loading");
    setError(undefined);
    try {
      const result = await invoke<NativeReplayPresentation>("mock_pipe_replay");
      if (result.evidence_mode !== "synthetic_replay" || result.frames.length === 0) {
        throw new Error("native backend returned an invalid replay presentation");
      }
      setPresentation(result);
      setFrameIndex(0);
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    }
  }

  function moveReplay(delta: -1 | 1) {
    setFrameIndex((current) =>
      Math.max(0, Math.min(current + delta, (presentation?.frames.length ?? 1) - 1)),
    );
  }

  return (
    <LearningShell
      replay={replay}
      onLoadReplay={loadReplay}
      onMoveReplay={moveReplay}
    />
  );
}

createRoot(root).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
