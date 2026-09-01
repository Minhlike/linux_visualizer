# Linux Observatory

Linux Observatory is a research-oriented desktop application for teaching operating-system concepts through runtime-grounded, semantically constrained visualization.

It is not a 3D city generator. The semantic graph is the source of truth; city, truth-graph, and dual views are projections whose interpretations are bounded by explicit fidelity contracts.

## Current milestone

P0 established the repository, architecture boundaries, machine-readable fidelity contracts, CI, and a minimal Tauri 2 + React shell. P1 adds a deterministic, explicitly synthetic replay of `cat file.txt | grep linux` through a validated semantic graph. See [`docs/STATE.md`](docs/STATE.md).

## Architecture

- `runtime-observer/`: normalized evidence from Linux runtime sources
- `semantic-core/`: renderer-independent Linux semantic graph
- `fidelity-engine/`: contract validation and misconception guardrails
- `renderer/`: projection interface; Three.js integration starts in P2
- `camera-director/`: semantic focus requests, independent of scene implementation
- `learning-ui/`: learner-facing React components
- `apps/desktop/`: Tauri composition root
- `experiments/`: study designs and analysis artifacts
- `specimen/`: future Buildroot/BusyBox/QEMU specimen configuration, not generated images

## Development

Prerequisites: Node.js, npm, Rust, and the platform requirements from the Tauri 2 documentation. On Windows, use the MSVC Rust toolchain and Visual Studio C++ Build Tools. QEMU is not required until the specimen milestone.

```text
npm install
npm run verify
npm run bench:replay
npm run context-pack
```

Run the desktop app after the Tauri platform prerequisites are installed:

```text
npm run tauri:dev
```

## Scientific position

The working paper is “Linux Observatory: Runtime-Grounded and Semantically Faithful Visualization for Operating-System Education.” Hypotheses and negative results belong in [`docs/RESEARCH_LEDGER.md`](docs/RESEARCH_LEDGER.md), not in product claims.

## License

No project license has been selected yet. All rights are reserved until the repository owner records a license decision. Dependency and reuse notices are tracked in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
