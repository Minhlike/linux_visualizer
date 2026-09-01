import assert from "node:assert/strict";
import test from "node:test";

import { createContextPack } from "./context_pack/index.mjs";

test("context pack contains current state and decisions without raw chat", async () => {
  const pack = await createContextPack();
  assert.match(pack, /## Objective/);
  assert.match(pack, /## Accepted decisions/);
  assert.match(pack, /P1:/);
  assert.ok(pack.length < 12_000, `context pack is too large: ${pack.length}`);
});
