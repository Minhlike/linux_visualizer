# Linux Observatory operating contract

## Mission

Test whether runtime-grounded, semantically constrained visualization reduces operating-system misconceptions. Linux evidence is authoritative; 3D is only a projection.

## Session protocol

1. Read this file and `docs/STATE.md`.
2. Load only ADRs, concept contracts, and source relevant to the current task.
3. Search before opening large files.
4. Work in a thin vertical slice: research, design, implement, test, verify fidelity, benchmark, document, commit.
5. Update `docs/STATE.md` after a milestone. Use `npm run context-pack` for a compact handoff.

## Invariants

- Truth chain: real Linux execution -> evidence -> semantic graph -> fidelity constraints -> projection -> interaction -> measured outcome.
- `semantic-core` cannot depend on Tauri, React, Three.js, renderer, camera, UI, or metaphors.
- `runtime-observer` records evidence; it does not invent semantic facts.
- `fidelity-engine` rejects incomplete or misleading concept contracts.
- Renderer state is derived and disposable. Never make it the source of Linux state.
- Every metaphor needs a machine-readable contract under `docs/concepts/` with valid, forbidden, omitted, and confidence semantics.
- Unknown or inferred claims must be marked; never fabricate runtime evidence.
- Do not add a new Linux topic until the current vertical slice passes its gates.
- Do not commit secrets, caches, generated VM images, large models, build output, or vendored dependencies.

## Done gate

Build and relevant tests pass; boundaries hold; evidence and fidelity contract exist; misleading limitations are recorded; performance is measured where applicable; state and provenance are current; the commit is reviewable.
