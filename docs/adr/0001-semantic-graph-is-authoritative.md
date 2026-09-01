# ADR 0001: Semantic graph is authoritative

- Status: accepted
- Date: 2026-09-01

## Context

A visually compelling scene can encode false ownership, causality, permanence, or physicality. Those errors directly undermine the research question.

## Decision

`semantic-core` owns the versioned Linux graph. Runtime evidence supports graph claims; fidelity contracts constrain projections. Renderer objects are disposable derived state and cannot be referenced by the core.

## Consequences

- Multiple projections can share one truth snapshot.
- Scene implementation can change without redefining Linux semantics.
- Projection code must handle unknown, inferred, and omitted information explicitly.
- Some attractive animations will be rejected when they imply unsupported semantics.
