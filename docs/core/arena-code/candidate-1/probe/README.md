# Probes

Each probe is a script and the output it printed. Node 24.21.0, TypeScript 7.0.2, Biome 2.6.7, pi-durable 1.5.2 from npm.
`node_modules` and `.scratch/` were deleted after the runs; `npm install --ignore-scripts` brings them back.

| Probe | Claim | Result |
| --- | --- | --- |
| `toolchain/run.sh` → `run.out.txt` | Node's type stripping runs a workspace of four packages from source: tests, a bin, a child process, SQLite; tsc checks it in one program; an extension imports `tau-core` by name. | T0 to T6 as claimed. T2: under a `node_modules` path Node refuses (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). T3b: plain `node --test` runs every `.ts` under `test/`. |
| `toolchain/boundaries.sh` → `boundaries.out.txt` | Each boundary fails the gate: deep import (tsc and Node), relative import, host import, core to kit, store to host, enum, undeclared package. A test may import the host. | B1 to B8 as claimed. |
| `sketch-check/run.sh` → `run.out.txt` | The sketch is a working repository: install, tsc, biome, `npm test`, the bin. | tsc and biome pass; 242 tests, 8 pass, 234 todo, 0 fail; the bin loads all six packages and stops at `main`. |
| `sketch-check/boundaries.sh` → `boundaries.out.txt` | The same rules hold on the sketch's own layout, plus: `answer` added to the extension entry fails the exports test; a module without `extension` fails `satisfies`; a devDependency in `src/` fails. | S1 to S10 as claimed. |
| `sketch-check/spikes.sh` → `spikes.out.txt` | The `spikes` command works against the workspace's `node_modules`. | All six spikes pass. |
| `pi-facts/family-read.ts` → `family-read.out.txt` | Does `tx.doc(family, key, seed)` store a member it only reads? | Yes. So `decision(tx, id)` checks the ID counter before it reads. |
| `pi-facts/storage-wrap.ts` → `storage-wrap.out.txt` | A test can kill a child inside a commit with no hook in production code, by wrapping the `Storage` it passes in. | Killed inside `Storage.commit`, the reopened store has neither the answer document nor the task; killed after, it has both (K6's shape). |
