# Project State: Linux Observatory

## Current

- Baseline: final generic shell-structure visualization architecture.
- Desktop-first Tauri 2 application with a daylight scientific Mechanical Plant.
- Non-executing `CommandPlanner` supports executables/arguments, arbitrary pipelines, `<`, `>`, `>>`, `&`, `&&`, `||`, and `;` within its documented grammar.
- Three explicit fidelity levels: evidence-grounded fixture, structurally derived, and opaque command.
- Renderer-neutral typed `ActionContext` is emitted by `semantic-core`; the canonical `resolveActionPlan(ActionContext)` contains no stage, summary, scenario-ID, or process-ID substring inference.
- Renderer, semantic camera, procedural audio, and graph-driven Mission Control consume the canonical plan/graph.
- Known CAT/GREP/ECHO/LS/PS behavior modules remain available; unknown executables use a closed Generic Process Workcell without invented internals.
- One-shot choreography executes typed mechanical actuation/reaction metadata with `useRef`/imperative updates and no React state updates inside `useFrame`.
- Playback speed scales action duration, camera transition, event cadence, and audio envelope scheduling.
- Telemetry reports FPS, display frame interval average/p95, draw calls, triangles, and visible objects. Frame interval is not labelled as CPU/GPU render cost.

## Measured visual QA (2026-09-01)

- Foreground desktop-size WebGPU preview capture: 129 FPS, 7.7 ms average display interval, 10.7 ms p95 display interval, 38 estimated visible draw submissions, 1,908 visible triangles, and 60 visible objects at the initial frame.
- Browser automation background throttling was observed and is excluded from the foreground measurement.
- Frame 17 visually showed CAT-to-pipe directional transfer, semantic camera focus, active workcell response, and the daylight scene without console errors. The only console warning is Three/R3F's upstream `THREE.Clock` deprecation notice.
- Optimized native executable launched and remained responsive in a smoke test.

## Verified compatibility

- Existing five validated synthetic fixtures still use the shared reducer and Level A presentation path.
- Generic planner tests cover `foo`, arguments, truncate/append/input redirects, two/three-stage pipelines, and combined input-pipeline-output composition.
- Provenance accumulation, persistent Exited/Closed lifecycle, FD ownership, pipe direction, fork/exec identity, deterministic replay, and dangling-reference rejection remain gated.

## Completed

- P1: deterministic semantic replay and fidelity boundaries.
- P2: first replay-driven 3D desktop vertical slice.
- P3: daylight Mechanical Plant, semantic audio, one-shot choreography, and canonical ActionPlan.
- Final generic iteration: non-executing shell parser/planner, typed ActionContext, three fidelity levels, generic workcells, and graph-driven Mission Control.

## Evidence boundary

- Built-in fixtures are validated synthetic schedules, not live Linux traces.
- Structurally derived commands are not executed and do not claim kernel evidence.
- Opaque executable internals remain unknown.

## Blockers / constraints

- No live Linux adapter is included in this iteration.
- Parser intentionally is not a complete Bash implementation; command substitution, grouping, shell expansion, and arbitrary shell language are rejected or left opaque.

## Next

- No new feature milestone is declared. The repository is ready for desktop evaluation against the current fidelity contract.
