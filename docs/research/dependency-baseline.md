# Dependency and OSS baseline

Reviewed: 2026-09-01

## Selected for P0

- Tauri 2: official desktop shell; small native boundary and supported Vite integration. Rust crates are MIT OR Apache-2.0.
- React 19.2 and Vite 8: current official UI/build baseline compatible with the installed Node runtime.
- serde and schemars: typed serialization and machine-readable contract/schema support without binding the domain to UI technology.

## Evaluated and deferred

- Three.js and React Three Fiber: suitable MIT-licensed rendering stack. Three.js documents automatic WebGL2 fallback for `WebGPURenderer`; R3F 9 pairs with React 19. Deferred until P2 so semantic-core is established first.
- Buildroot + BusyBox + QEMU: appropriate for a minimal reproducible Linux specimen. Buildroot can generate kernel/root filesystem artifacts and legal-info; QEMU full-system emulation provides the guest boundary. Deferred to P6, with configuration files tracked and generated images ignored.
- Perfetto, Trace Compass, KernelShark, VizTracer, CodeCity-family projects: no code reuse in P0. Re-evaluate only against a concrete engineering need and record exact provenance before transplanting code.

## Primary references

- https://v2.tauri.app/start/create-project/
- https://v2.tauri.app/start/frontend/vite/
- https://v2.tauri.app/start/prerequisites/
- https://threejs.org/docs/pages/WebGPURenderer.html
- https://github.com/pmndrs/react-three-fiber
- https://www.kernel.org/doc/html/latest/trace/tracepoints.html
- https://www.kernel.org/doc/html/latest/trace/ftrace.html
- https://buildroot.org/downloads/manual/manual.html
- https://busybox.net/license.html
- https://www.qemu.org/docs/master/system/index.html
