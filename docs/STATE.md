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
- P2 first visual vertical slice implemented with React Three Fiber and a WebGPU renderer that falls back to WebGL2.
- Procedural Industrial Megacity renders Shell, CAT, GREP, Filesystem, Kernel, anonymous-pipe conduit, directed connections, instanced background buildings, ground, fog, lighting, labels, and orbit controls.
- All 22 validated frames drive entity lifecycle/highlights, pipe appearance, descriptor-era routing, pipe data flow, smooth camera focus, and the final pipeline-complete overview.
- Entity selection updates the three-part fidelity Info Card; `Ctrl+~` opens a synthetic terminal that starts the same validated replay.

## Current

- P2 visual quality gate complete locally; the replay-driven 3D scene is now the primary desktop surface.

## Next

- Generate frontend DTOs from the authoritative schema instead of maintaining parallel semantic types.
- Add property tests for graph invariants and replay determinism.
- Split the Three/WebGPU production bundle before expanding scene scope.

## Blockers / constraints

- QEMU is not installed on the current Windows machine; it is not required before P6.
- The official Tauri Windows prerequisite recommends MSVC and Visual Studio C++ Build Tools. This machine lacks `link.exe`, but the installed GNU Rust toolchain completed a native release build. The MSVC workflow is preserved under `ci/` as an inactive template because the current GitHub token cannot publish active workflow files.
- The project license is intentionally undecided; repository code is currently `UNLICENSED`.
- P2 remains a synthetic replay and makes no live-Linux evidence claim.
- Three.js 0.185 emits a development-only `THREE.Clock` deprecation warning through the current React Three Fiber render loop; fresh-page QA had no console errors.

## Measurements

- Frontend bundle after P1: 195.74 kB JavaScript / 61.91 kB gzip; 5.17 kB CSS / 1.63 kB gzip.
- First native optimized build: 4m 23s on the current Windows machine with a cold release cache.
- P1 reducer: 10,000 validated 22-frame replays in 1,525 ms; 6,555.21 replays/s and 6,934.11 ns/event on the current machine in Rust release mode.
- P2 frontend bundle: 1,691.50 kB JavaScript / 466.71 kB gzip; 8.59 kB CSS / 2.65 kB gzip.
- Browser visual QA at 1280×720 used WebGPU and measured 98–102 FPS / 9.8–10.2 ms average frame time, 2 reported render calls, and 61–66 visible scene objects. These are local development measurements, not a cross-device benchmark.
