# Project state

Updated: 2026-09-01

## Completed

- P0 repository and remote audit: local directory and GitHub repository were empty.
- Architecture boundaries and operating memory protocol defined.
- Rust semantic/evidence/fidelity foundations scaffolded with tests.
- Minimal Tauri 2 + Vite + React composition shell scaffolded.
- Reproducible local verification commands and an MSVC CI template added.
- Pipe semantic fidelity contract encoded and validated.
- Local production frontend and native Tauri `--no-bundle` release builds passed.
- Desktop/mobile browser inspection passed with no console errors or horizontal overflow.
- P1 deterministic 22-frame mock replay implemented for `cat file.txt | grep linux`.
- Replay reducer validates sequence/time, evidence presence, descriptor ownership, pipe direction, and graph invariants.
- Native Tauri command exposes validated presentation frames; learning UI provides explicit synthetic-evidence labelling and step controls.
- P2: first visual vertical slice implemented with React Three Fiber and a WebGPU renderer that falls back to WebGL2.
- Procedural Industrial Megacity renders Shell, CAT, GREP, Filesystem, Kernel, anonymous-pipe conduit, directed connections, instanced background buildings, ground, fog, lighting, labels, and orbit controls.
- All 22 validated frames drive entity lifecycle/highlights, pipe appearance, descriptor-era routing, pipe data flow, smooth camera focus, and the final pipeline-complete overview.
- Entity selection updates the three-part fidelity Info Card; `Ctrl+~` opens a synthetic terminal that starts the same validated replay.
- P3: Generalized semantic core and multi-scenario engine supporting 5 validated scenarios:
  1. `cat file.txt | grep linux` (pipeline with anonymous pipe and dup2 redirection)
  2. `echo linux > sample.txt` (file redirection write)
  3. `cat sample.txt` (file reading to standard output)
  4. `ls -l` (directory traversal and listing)
  5. `ps` (system process table inspection via virtual /proc)
- P3: Renderer-neutral presentation contract (`PresentationScenario`, `PresentationFrame`, `SemanticEntityPresentation`, `SemanticRelationPresentation`, `SemanticDelta`, `SemanticSnapshot`) strictly decoupling visual projections from core evidence.
- P3: Invariant suite covering deterministic replay across all 5 scenarios, monotonic sequence/timestamp validation, provenance enforcement, cross-process FD ownership isolation, pipe directional read/write enforcement, and fork/exec lifecycle hierarchy.
- P3: Elimination of all hardcoded sequence reasoning (`sequence == 22` / fixed frame numbers) across backend, camera director, and visual components.
- P3: Mechanical visual redesign switching to an airy, high-depth light architectural aesthetic (`#eef2f6`) with observable internal assemblies: stepped pedestals, chrome guide columns, transparent acrylic casings, rotating spindles, animated harmonic pistons, and stator rings.
- P3: Complete Vietnamese UI localization preserving standard technical identifiers (Linux Observatory, bash, cat, grep, PID, FD, syscall, sh, echo, ls, ps).
- P3: Floating draggable terminal popup with session position memory, preset scenario launch chips, and Ctrl+~ shortcut.
- P3: Narrative beat camera director with 3 operational modes (THEO DÕI NHẸ, TỰ ĐỘNG, TỰ DO), user orbit suspension, and 6 playback speed settings (0.25x, 0.5x, 0.75x, 1x, 1.5x, 2x).
- P3.1: Unified single visual mode (Linux Observatory):
  - Completely eliminated Truth/Dual mode fragmentation; unified mechanical metaphor, semantic truth, runtime state, and relationship graph into a single 3D world (1 Canvas, 1 camera, 1 render loop).
  - Distinct entity silhouettes reflecting UNIX roles: Shell (console & routing rails), CAT (intake reader), GREP (filtering chamber with vertical bars), ECHO (horn emitter), LS (scanner turret with dish), PS (diagnostic probe with sensor rings), Filesystem (hexagonal archive vault), Terminal (screen + keyboard gateway), Kernel (octagonal backbone core).
  - Physical socket ports for process-local file descriptors (FD 0 stdin, FD 1 stdout, FD 2 stderr) directly mounted on machine chassis with on-demand hover/selection labels.
  - ParentOf orchestration linkages visually connecting parent orchestrator (Shell) to child process bays.
  - Exited process state halting internal mechanical spindles and dimming status domes.
  - Truth on Demand & Progressive Disclosure: dynamic info inspector rendering PID, active FD tables, semantic relations, evidence provenance (syscall tracepoint), and confidence without screen clutter.
  - Canonical exact command resolver replacing substring dispatch hacks (`includes("grep")`, etc.) and providing clear unsupported command messaging without silent fallback.
  - Narrative relationship camera choreography: wide multi-entity framing (`pipelineFlow`, `shellSpawn`, `fileAccess`, `terminalIo`) preventing single-object zoom tunnel vision with 2.4s smooth damping.

## Current

- P3.1 complete and verified. Full verification suite passes: architecture boundary check, cargo check, cargo test (workspace), node tool tests, TypeScript build, and Vite production bundle. Single unified visual mode is live.

## Next

- Generate authoritative frontend DTOs automatically from Rust schemars schemas.
- Add live runtime observer adapters (WSL2 strace/ebpf) when host capabilities permit.
- Code split Three/WebGPU vendor chunks for faster initial paint.

## Blockers / constraints

- QEMU is not installed on the current Windows machine; it is not required before P6.
- The official Tauri Windows prerequisite recommends MSVC and Visual Studio C++ Build Tools. This machine lacks `link.exe`, but the installed GNU Rust toolchain completed a native release build. The MSVC workflow is preserved under `ci/` as an inactive template because the current GitHub token cannot publish active workflow files.
- The project license is intentionally undecided; repository code is currently `UNLICENSED`.
- Scenarios remain validated synthetic replays and make no live-Linux evidence claim.

## Measurements

- Frontend bundle after P1: 195.74 kB JavaScript / 61.91 kB gzip; 5.17 kB CSS / 1.63 kB gzip.
- First native optimized build: 4m 23s on the current Windows machine with a cold release cache.
- P1 reducer: 10,000 validated 22-frame replays in 1,525 ms; 6,555.21 replays/s and 6,934.11 ns/event on the current machine in Rust release mode.
- P2 frontend bundle: 1,691.50 kB JavaScript / 466.71 kB gzip; 8.59 kB CSS / 2.65 kB gzip.
- P3 frontend bundle: 1,715.32 kB JavaScript / 472.05 kB gzip; 10.98 kB CSS / 2.58 kB gzip.
- P3.1 unified bundle: 1,722.42 kB JavaScript / 473.29 kB gzip; 10.96 kB CSS / 2.61 kB gzip.
- Unified scene performance: ~60 FPS WebGPU/WebGL2, ~16.6ms frame time, ~45-52 draw calls, 1 single render loop.
- All 17 automated workspace tests pass (15 Rust unit/invariant tests + 2 Node architectural boundary/context pack tests).
