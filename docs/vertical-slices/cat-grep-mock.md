# Mock vertical slice: `cat file.txt | grep linux`

- Phase: P1
- Evidence mode: `synthetic_replay`
- Fixture: `semantic-core/fixtures/cat-grep.json`
- Contract: `docs/concepts/pipe.json`

## Purpose

Exercise the evidence-reference, semantic-graph, fidelity, native-command, and learning-UI boundaries before QEMU or a renderer is allowed to add complexity. This is a software fixture, not an observation of Linux.

## Represented flow

1. A shell process exists and creates an anonymous pipe with read/write endpoints and two FD entries.
2. The shell forks the `cat` child; inherited descriptors refer to the same pipe endpoints.
3. The child duplicates the write descriptor onto stdout and closes unused originals before exec.
4. The shell forks the `grep` child; it duplicates the read descriptor onto stdin and closes unused originals before exec.
5. The shell closes its own pipe descriptors so it does not keep either endpoint artificially alive.
6. `cat` opens and reads `file.txt`, writes bytes through its stdout pipe endpoint, and `grep` reads through stdin.
7. Exiting processes lose their remaining FD entries, and the shell observes both completions through wait events.

## Fidelity boundary

- Valid: descriptors in multiple processes can refer to endpoints of one pipe object.
- Forbidden: the pipe belongs to one process, persists as a regular file, preserves write-to-read message boundaries, or proves a physical byte path.
- Omitted: syscall return values, partial reads/writes, buffer capacity, blocking/wakeup detail, signals, exact close-on-exec flags, and alternative valid interleavings.
- Schedule caveat: event order is one valid teaching schedule, not a universal shell/kernel schedule.

## Automated gate

- The fixture deserializes under schema version `1.0.0`.
- All 22 frames replay deterministically and pass graph validation.
- Each event cites synthetic evidence and monotonic sequence/time.
- FD reads/writes require descriptor ownership and the correct endpoint direction.
- Closing the final referring descriptor removes the anonymous pipe projection; completed waits do not remain as active graph edges.
- Native presentation exposes only reducer-approved frames.
