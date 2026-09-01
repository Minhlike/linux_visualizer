import assert from "node:assert/strict";
import test from "node:test";

import { resolveActionPlan } from "../camera-director/src/index.ts";

const base = {
  actor: "process:cat",
  parent: null,
  child: null,
  executable: "/bin/cat",
  descriptor: "fd:cat:1",
  descriptor_target: "device:tty",
  target_node_kind: "terminal",
  source: "process:cat",
  destination: "device:tty",
  relation: "writes_to",
  byte_count: 12,
  file_access: null,
  pipeline_id: null,
  evidence_mode: "synthetic_replay",
  confidence: "inferred",
};

test("typed terminal write keeps cat isolated from grep", () => {
  const plan = resolveActionPlan({ ...base, event_type: "write" });
  assert.equal(plan.primitive, "TERMINAL_IO");
  assert.equal(plan.source.role, "cat");
  assert.equal(plan.target.role, "terminal");
  assert.equal(plan.flowPath.sourceId, "process:cat");
  assert.equal(plan.flowPath.destinationId, "device:tty");
});

test("pipe direction comes from typed descriptor target", () => {
  const plan = resolveActionPlan({
    ...base,
    event_type: "write",
    descriptor_target: "pipe:1:write",
    destination: "pipe:1:write",
    target_node_kind: "pipe_endpoint",
    pipeline_id: "pipe:1",
  });
  assert.equal(plan.source.role, "cat");
  assert.equal(plan.target.role, "pipe");
  assert.equal(plan.connector, "pipe_conduit");
});

test("opaque executable receives a generic process workcell contract", () => {
  const plan = resolveActionPlan({
    ...base,
    event_type: "exec",
    actor: "process:derived:0:0",
    executable: "ffmpeg",
    descriptor: null,
    descriptor_target: null,
    target_node_kind: null,
    source: "process:derived:0:0",
    destination: "process:derived:0:0",
    relation: null,
    byte_count: null,
    evidence_mode: "opaque_command",
    confidence: "unknown",
  });
  assert.equal(plan.source.role, "process");
  assert.equal(plan.primitive, "EXEC");
  assert.equal(plan.evidenceMode, "opaque_command");
  assert.equal(plan.mechanicalResponse.actuation, "chassis_lock");
});
