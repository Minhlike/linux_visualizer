# Project state

Updated: 2026-09-01

## Completed

- P0 repository and remote audit: local directory and GitHub repository were empty.
- Architecture boundaries and operating memory protocol defined.
- Rust semantic/evidence/fidelity foundations scaffolded with tests.
- Minimal Tauri 2 + Vite + React composition shell scaffolded.
- CI and reproducible local verification commands added.
- Pipe semantic fidelity contract encoded and validated.
- Local production frontend and native Tauri `--no-bundle` release builds passed.
- Desktop/mobile browser inspection passed with no console errors or horizontal overflow.
- P1 deterministic 22-frame mock replay implemented for `cat file.txt | grep linux`.
- Replay reducer validates sequence/time, evidence presence, descriptor ownership, pipe direction, and graph invariants.
- Native Tauri command exposes validated presentation frames; learning UI provides explicit synthetic-evidence labelling and step controls.

## Current

- P1 quality gate complete; P2 renderer-adapter design is next.

## Next

- Generate frontend DTOs from the authoritative schema instead of maintaining parallel semantic types.
- Add property tests for graph invariants and replay determinism.
- P2: consume validated replay frames in a minimal instanced scene with selection, Info Card, camera focus intent, and measured WebGPU/WebGL2 backend choice.

## Blockers / constraints

- QEMU is not installed on the current Windows machine; it is not required before P6.
- The official Tauri Windows prerequisite recommends MSVC and Visual Studio C++ Build Tools. This machine lacks `link.exe`, but the installed GNU Rust toolchain completed a native release build; CI is configured for MSVC, with execution pending a workflow-authorized push.
- GitHub rejected the workflow-containing push because the current OAuth token lacks the `workflow` scope. Local commits are intact; publishing requires the repository owner to authorize that scope or provide an already-trusted SSH path.
- The project license is intentionally undecided; repository code is currently `UNLICENSED`.
- No empirical learning or frame-rate claim exists yet. P1 has no 3D scene and no live Linux evidence.

## Measurements

- Frontend bundle after P1: 195.74 kB JavaScript / 61.91 kB gzip; 5.17 kB CSS / 1.63 kB gzip.
- First native optimized build: 4m 23s on the current Windows machine with a cold release cache.
- P1 reducer: 10,000 validated 22-frame replays in 1,525 ms; 6,555.21 replays/s and 6,934.11 ns/event on the current machine in Rust release mode.
- Runtime FPS: not applicable; renderer is deliberately deferred to P2.
