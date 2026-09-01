# Project State: Linux Observatory

## Current
- Baseline: P3.3 Unified Mechanical Plant & Causal Mission Control Architecture
- Single unified 3D mechanical plant environment (Daylight Scientific palette: `#f1f5f9` background, `#e2e8f0` light fog, studio daylight lighting, polished steel and chrome structural chassis).
- Distinct workcell implementations with specialized physical mechanisms:
  - `ShellWorkcell`: Dispatcher console with illuminated routing levers and rail relay coils.
  - `CatWorkcell`: Suction hopper with dual counter-rotating intake rollers and vacuum chamber.
  - `GrepWorkcell`: Vertical optical filter chamber with phased oscillating filter grates.
  - `EchoWorkcell`: Directional acoustic byte burst horn emitter.
  - `LsWorkcell`: Rotating dual-prism optical scanner turret sweeping directory spaces.
  - `PsWorkcell`: Concentric expanding/contracting multi-tier diagnostic sensor probe for `/proc`.
  - `FilesystemAssembly`: Hexagonal data vault with pneumatic hatch and cassette bay.
  - `PipeAssembly`: Borosilicate glass directional conduit with sequencing chevron rings.
  - `TerminalConsole`: Dual-tier operator terminal with phosphor display.
  - `KernelBackbone`: Distributed structural backbone interconnect with 4 chrome distribution buses.
- Semantic Choreography Engine: Typed mapping of real semantic events (`shell_started`, `pipe_created`, `process_forked`, `file_opened`, `bytes_read`, `bytes_written`, `process_exited`, `process_waited`) into a 5-phase action timeline (`Anticipation` → `Actuation` → `Transfer` → `Reaction` → `Settle`).
- Instant Preview on Pause/Jump: Timeline scrubbing or event jumping automatically plays a 1.2s action preview so the plant is never frozen or dead on step.
- Causal Lanes Mission Control: Dual-view Event Board with Causal Lane Matrix (SHELL, CAT, GREP, PIPE, FS, TERM with causal connections) and detailed timeline list.
- WebGPU Primary with WebGL2 Fallback: Dynamically initializes `WebGPURenderer` and falls back gracefully to `WebGLRenderer`.
- Rust Semantic Invariants: Persistent process lifecycle tracking across wait frames and per-entity historical evidence provenance.

## Completed
- P1: Vertical slice validation (synthetic traces, semantic graph, fidelity engine, basic 3D projection)
- P2: Industrial megacity architecture, Tauri 2 integration, multi-scenario generic reducer, exact command matching
- P3.1: Unified single visual mode, distinct process silhouettes, honest synthetic labeling
- P3.2: Procedural Web Audio API engine with machine ambience and stereo panning
- P3.3: Complete Unified Mechanical Plant overhaul, real semantic choreography, causal lanes mission control, persistent lifecycle invariants, and daylight scientific visual fidelity

## Blockers / constraints
- None. All architectural boundaries and quality gates pass.
- Desktop-first Tauri application is the primary target.

## Next
- Continue fine-tuning visual parameters and real-world Linux tracepoint telemetry integration.
