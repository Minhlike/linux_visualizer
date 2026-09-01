# ADR 0002: Runtime evidence is immutable and provenanced

- Status: accepted
- Date: 2026-09-01

## Context

`/proc`, tracepoints, ftrace, and process exit data expose different partial views. Observation is not identical to interpretation, and collection may drop events.

## Decision

Normalize observations into timestamped evidence records with source kind, source locator, sequence, and payload. Derived semantic claims cite evidence and confidence. Missing evidence remains unknown rather than being reconstructed as fact.

## Consequences

- Replay can be deterministic over an evidence log.
- Collection loss and inference are visible.
- Adapters may evolve independently of graph semantics.
