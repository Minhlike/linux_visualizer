# Architecture

## Truth pipeline

```text
Linux specimen
  -> runtime-observer (immutable, sourced observations)
  -> semantic-core (versioned entities, relations, events)
  -> fidelity-engine (allowed, forbidden, omitted meanings)
  -> projection DTO
  -> renderer / camera-director / learning-ui
  -> learner actions and experiment measures
```

Data only flows right. A renderer may request selection or focus by semantic identifier, but it cannot mutate or infer Linux state. UI labels must expose evidence confidence and the distinction between metaphor and technical reality.

## Module ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| `runtime-observer` | timestamps, source identifiers, raw/normalized observations | visualization, educational claims |
| `semantic-core` | graph vocabulary, identity, causal/structural relations, graph invariants | Tauri, UI, geometry, metaphors |
| `fidelity-engine` | concept-contract schema and validation | runtime collection, rendering |
| `renderer` | disposable scene projection and performance telemetry | semantic truth, command execution |
| `camera-director` | focus intent and transition policy | graph mutation, runtime observation |
| `learning-ui` | technical reality, metaphor, limitation presentation | hidden semantic inference |
| `apps/desktop` | composition and trusted native capability boundary | domain truth |

## Versioning

Every serialized snapshot and event envelope carries a schema version. Breaking semantic changes require an ADR and migration strategy. Raw evidence is retained by reference/hash when practical so graph claims can be audited.

## Security boundary

The guest is an instrumented specimen, not a security boundary. Terminal input will eventually use an allowlisted lesson command surface inside the disposable guest. The host app must not interpolate learner input into a host shell.
