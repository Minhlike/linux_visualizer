# Initial threat model

## Assets

- Host filesystem and user credentials
- Integrity of recorded Linux evidence
- Integrity of semantic and experimental data
- Availability of the desktop application

## Trust boundaries

- React WebView to Tauri commands
- Tauri backend to QEMU process/QMP/serial interfaces
- Host to disposable Linux guest
- Runtime evidence to semantic inference

## P0 controls

- Tauri capability set contains only core defaults; shell/process/filesystem plugins are absent.
- No host command execution API is exposed to the frontend.
- Semantic identifiers are typed and graph invariants are validated.
- Generated guest images and caches are excluded from Git.
- Dependency installation is lockfile-based; CI uses clean installs.

## Required before live terminal mode

- Execute only inside a disposable guest; never pass input to a host shell.
- Use structured argv, command allowlists, time/resource limits, output caps, and explicit cancellation.
- Authenticate and frame the observer channel; reject malformed or out-of-order events.
- Scrub host paths and secrets from logs and research exports.
- Define consent, pseudonymization, retention, and deletion for learner telemetry.
