import assert from "node:assert/strict";
import test from "node:test";

import { boundaryViolations } from "./check-boundaries.mjs";

test("authoritative modules do not depend on projections", async () => {
  assert.deepEqual(await boundaryViolations(), []);
});
