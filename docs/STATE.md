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

## Current

- P1 design: versioned graph-event envelopes and deterministic mock replay.

## Next

- P1: define versioned graph-event envelopes and deterministic mock replay for the `cat file.txt | grep linux` slice.
- Generate frontend DTOs from the authoritative schema instead of maintaining parallel semantic types.
- Add property tests for graph invariants and replay determinism.

## Blockers / constraints

- QEMU is not installed on the current Windows machine; it is not required before P6.
- The official Tauri Windows prerequisite recommends MSVC and Visual Studio C++ Build Tools. This machine lacks `link.exe`, but the installed GNU Rust toolchain completed a native release build; CI covers the MSVC path.
- The project license is intentionally undecided; repository code is currently `UNLICENSED`.
- No empirical learning or frame-rate claim exists yet. P0 has no 3D scene to benchmark.

## P0 measurements

- Frontend bundle: 192.65 kB JavaScript / 60.85 kB gzip; 3.34 kB CSS / 1.23 kB gzip.
- First native optimized build: 4m 23s on the current Windows machine with a cold release cache.
- Runtime FPS: not applicable; renderer is deliberately deferred to P2.
