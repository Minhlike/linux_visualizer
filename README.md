# Linux Observatory

Linux Observatory is a research-oriented desktop application for teaching operating-system concepts through runtime-grounded, semantically constrained visualization.

It is not a command executor or a 3D city generator. The semantic graph is the source of truth; the daylight Mechanical Plant is a disposable projection bounded by explicit fidelity contracts.

## What it understands

The desktop terminal parses a deliberately small, non-executing shell grammar: executable/arguments, pipelines (`|`), input/output/append redirection (`<`, `>`, `>>`), background (`&`), and safe structural chaining (`&&`, `||`, `;`). Parsed commands become a `CommandGraph`, typed semantic actions, `ActionContext`, and one canonical `ActionPlan`. Input is never interpolated into a host shell.

Every command is labelled at one of three fidelity levels:

- **Level A — Evidence-grounded:** a validated semantic fixture or future live evidence exists. Current built-in fixtures remain explicitly synthetic, not live kernel traces.
- **Level B — Structurally derived:** the executable has a semantic adapter and shell structure is known, but no runtime trace exists. The UI states: “SUY DIỄN TỪ CẤU TRÚC LỆNH — KHÔNG PHẢI TRACE KERNEL.”
- **Level C — Opaque command:** the shell can show spawn/exec and declared stdin/stdout/pipeline/redirection, while the program body stays closed. The UI states: “Nội bộ chương trình chưa được quan sát.”

Linux Observatory can generally visualize shell execution structure and known Linux primitives; executable internals are described only when evidence or a semantic adapter exists.

## Architecture

- `runtime-observer/`: normalized evidence from Linux runtime sources
- `semantic-core/`: renderer-independent Linux semantic graph, shell structure parser, planner, reducer, typed presentation contract
- `fidelity-engine/`: contract validation and misconception guardrails
- `renderer/`: React Three Fiber/Three.js Mechanical Plant projection and honest display telemetry
- `camera-director/`: the canonical typed `ActionContext -> ActionPlan` resolver and camera policy
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
