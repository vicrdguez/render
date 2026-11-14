# Build notes

This folder records where the build met a gap or a small contradiction in the locked design, and what it did. The owner asked for this on 2026-11-14: note it, go on, and review it afterwards. Each choice here can be rolled back for the other alternative.

Each build unit writes its own file. A line names the place in the design, the two readings, the one taken, and why.

| File | Unit |
| --- | --- |
| [Coordinator](coordinator.md) | Choices the coordinator made across units |
| [Unit 0b](unit-0b.md) | The TypeScript workspace and the gate |
| [Unit 1](unit-1-store.md) | The store layer |
| [Kit](unit-k-kit.md) | The kit |
| [Unit 2](unit-2-host.md) | The host layer, the protocol, and the `tau` command |
| [Unit 3](unit-3-websearch.md) | Web search |
| [Unit 4](unit-4-w2.md) | W2 |
| [Unit 5](unit-5-w1.md) | W1 |
| [Unit 6](unit-6-integration.md) | The import map, the journeys through the server, and the build of `tau` |
| [Unit 7](unit-7-shell.md) | The dev shell no longer needs the built package |

`../build-log.tsv` is the decision trail of the whole run, one row per decision.
