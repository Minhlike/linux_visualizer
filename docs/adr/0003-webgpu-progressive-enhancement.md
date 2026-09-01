# ADR 0003: WebGPU is progressive enhancement

- Status: accepted
- Date: 2026-09-01

## Context

The product prefers WebGPU, but availability varies across WebView2 installations, drivers, and operating systems. A hard WebGPU requirement would reduce reproducibility and learner access.

## Decision

P2 will place renderer creation behind an adapter. It will prefer Three.js `WebGPURenderer`, record the selected backend, and retain a tested WebGL2 path. Semantic behavior and learning content must be identical across backends.

## Consequences

- GPU capability is measured at startup rather than assumed.
- Renderer-specific effects cannot carry semantic meaning.
- Performance results must record backend, device, resolution, and scene workload.
