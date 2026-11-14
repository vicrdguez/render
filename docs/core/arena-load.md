# Loader arena

**Decided.** This is the seventh arena, run on 2026-11-15. It chose how to carry out the owner's decisions in [Layout, loading, and reload](load.md). The folder `arena-load/` holds the brief, the rubric, the probe report, both candidates with their probes, and the judge's verdict.

Candidate 1 ran on `claude-opus-5-5`, candidate 2 on `gpt-6.1-sol`. The judge ran on `gpt-6-astra`. The picker wrote no candidate.

| Criterion | Candidate 1 | Candidate 2 |
| --- | ---: | ---: |
| Fidelity | 3 | 4 |
| Reload is safe | 2 | 4 |
| Least machinery | 3 | 3 |
| Boundaries by the build | 2 | 4 |
| Evidence | 4 | 4 |
| The restructure is buildable | 2 | 3 |
| Total out of 30 | 16 | 22 |

**The base is candidate 2.** The picker had leaned to candidate 1 after reading both. The judge's own probes settled it (measured, `arena-load/verdict.md`, "Reload attack table"):

- Candidate 1 said reload needs no lock. A `setOptions` call in flight keeps the old schema and can store a value after the new one is published.
- Its claim that each extension is replaced wholly or not at all is false. An install can throw after the registry has changed.
- Its order of units breaks the gate at the unit that deletes the kit before its callers move.

Taken from candidate 1: no file cache for `jiti`, the throwing alias for the testing entry, the alias table from the package's `exports` map, the folder-only form, tests from source, and smaller units.

Rejected from candidate 2: a second manifest of the import surface, the single-file form of an extension, emitting extensions for their tests, and refusing to start when one extension is broken. The owner decided the last one.

Neither candidate built the installed layout: a `tau` with no extension, and the three samples loaded into it through the admin socket. The restructure ends with that as a check.
