# Research ledger

Record hypotheses before interpreting results. Keep observations, inferences, and opinions separate. Preserve negative results.

## H-001: semantic constraint and misconception

- Status: proposed; untested
- Hypothesis: learners using runtime-grounded, fidelity-constrained visualization will show lower concept-specific misconception scores than learners using terminal/text instruction alone.
- Null: there is no difference in misconception score between conditions.
- Primary outcome: post-task concept inventory score on process/pipe/file-descriptor semantics.
- Planned secondary outcomes: task correctness, completion time, cognitive load, and delayed retention.
- Falsification: a sufficiently powered preregistered comparison does not reject the null, or the visualization group develops new metaphor-induced misconceptions at an equal or higher rate.
- Current evidence: none. Product architecture is not evidence of educational effectiveness.

## E-001: P0 dependency and architecture research

- Type: evidence review
- Observation: current Three.js `WebGPURenderer` selects WebGPU when available and documents a WebGL2 backend fallback.
- Decision: record WebGPU as progressive enhancement, not a hard runtime requirement.
- Observation: Linux tracepoints are runtime hooks and ftrace exposes event tracing through tracefs.
- Decision: treat trace data as evidence requiring normalization and provenance, never as the semantic graph itself.
- Limitation: no runtime specimen or learner experiment exists in P0.

## Negative results

- 2026-09-01: local QEMU executable not found.
- 2026-09-01: local Visual Studio C++ linker not found. This did not prevent the installed GNU Rust toolchain from producing the P0 native release executable; MSVC remains covered by CI.
