# Third-party notices and provenance

No source code has been copied or transplanted from another project.

Direct dependencies are installed from their official registries and remain under their own licenses:

| Component | Version baseline | License | Source | Use / modifications |
| --- | --- | --- | --- | --- |
| Tauri | Rust 2.11.5; CLI/API 2.11.x | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri | Desktop shell dependency; no source copied |
| React / React DOM | 19.2.x | MIT | https://github.com/facebook/react | UI dependency; no source copied |
| Vite | 8.2.x | MIT | https://github.com/vitejs/vite | Frontend build dependency; no source copied |
| serde | 1.0.x | MIT OR Apache-2.0 | https://github.com/serde-rs/serde | Rust serialization dependency; no source copied |
| schemars | 1.2.x | MIT | https://github.com/GREsau/schemars | JSON Schema support; no source copied |

Evaluated but deliberately deferred:

| Component | Evaluated version | License | Source | Decision |
| --- | --- | --- | --- | --- |
| Three.js | r185 / 0.185.x | MIT | https://github.com/mrdoob/three.js | Planned for P2; defer until a semantic snapshot exists |
| React Three Fiber | 9.7.x | MIT | https://github.com/pmndrs/react-three-fiber | Planned renderer adapter; React 19-compatible line |
| Buildroot | 2026.05 | GPL-2.0-or-later | https://buildroot.org/ | Planned specimen build system; no generated image committed |
| BusyBox | TBD at P6 | GPL-2.0-only | https://busybox.net/ | Planned guest userspace; pin and archive corresponding source at release |
| QEMU | TBD at P6 | GPL-2.0 | https://www.qemu.org/ | Planned system emulator; absent from current development machine |

When code is reused in the future, add source URL, license, exact commit/version, affected files, modifications, and the engineering reason before merge.
