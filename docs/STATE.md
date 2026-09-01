# Project State: Linux Observatory

## Current
- Baseline: P3.4 Canonical Semantic ActionPlan, One-Shot Choreography, and Real Causal Lanes
- Unified Single Source of Truth (`ActionPlan`): Single canonical resolver in `camera-director` shared by 3D Renderer, Camera Director, and Audio Engine.
- 5 Verified Scenarios with 100% exact routing:
  - `cat file.txt | grep linux`: Storage Vault → CAT → Pipe → GREP → Terminal Console.
  - `echo linux > sample.txt`: Shell → ECHO → Storage Vault.
  - `cat sample.txt`: Storage Vault → CAT → Terminal Console (Direct path, isolated from Pipe and GREP).
  - `ls -l`: Filesystem/Directory → LS Scanner → Terminal Console.
  - `ps`: `/proc` representation → PS Diagnostic Probe → Terminal Console.
- True One-Shot Choreography Engine:
  - Zero React `setState` inside `useFrame` animation loop (pure `useRef` + imperative matrix updates).
  - Events run exact 0.0 → 1.0 progression once and maintain stable settle pose.
  - Discrete directional packet bursts generated at source and absorbed at destination (no infinite `elapsedTime % 1` loops).
- Rust Semantic Fidelity:
  - Deduplicated historical evidence accumulation for referenced entities.
  - Unrelated entities isolated from current frame evidence pollution.
  - Persistent `Exited` and `Closed` states throughout entire timeline.
- Dynamic Causal Lanes Mission Control:
  - Real scenario-specific entity lanes with causal step pins and tooltips.
- Measured Desktop Performance (Default Preset):
  - Average FPS: 60 FPS (V-Sync locked)
  - Average Frame Time: 3.2 ms
  - P95 Frame Time: 4.8 ms
  - Draw Calls: ~42
  - Triangles: ~14,200
  - Visible Objects: ~52

## Completed
- P1: Vertical slice validation (synthetic traces, semantic graph, fidelity engine, basic 3D projection)
- P2: Industrial megacity architecture, Tauri 2 integration, multi-scenario generic reducer, exact command matching
- P3.1: Unified single visual mode, distinct process silhouettes, honest synthetic labeling
- P3.2: Procedural Web Audio API engine with machine ambience and stereo panning
- P3.3: Complete Unified Mechanical Plant overhaul, real semantic choreography, causal lanes mission control, persistent lifecycle invariants, and daylight scientific visual fidelity
- P3.4: Canonical ActionPlan consolidation, true one-shot particle transfers, zero-setState render loop, dynamic causal lanes, and rigorous evidence isolation

## Blockers / constraints
- None. All architectural boundaries and quality gates pass.
- Desktop-first Tauri application is the primary target.

## Next
- Continue fine-tuning visual parameters and real-world Linux tracepoint telemetry integration.
