# Code arena

**Decided.** This is the sixth arena, run on 2026-11-13 and 2026-11-14. It chose how the code is laid out. It changes no behaviour of the locked design.

The folder `arena-code/` holds the brief, the rubric, both candidates with their sketches and probes, and the judge's verdict.

## What was asked

The locked design fixes what Tau does. It does not say which packages exist, how TypeScript runs, or how a wrong import is stopped. Two runners each proposed a module map and a type sketch for the build agents to fill in. Candidate 1 ran on `claude-opus-5-5`, candidate 2 on `gpt-6.1-sol`. The judge ran on `gpt-6-astra`. The picker wrote no candidate.

## The scores

| Criterion | Candidate 1 | Candidate 2 |
| --- | ---: | ---: |
| Fidelity to the locked design | 3 | 3 |
| Boundaries enforced by the build | 2 | 5 |
| Depth and reader load | 3 | 3 |
| Builds unit by unit | 4 | 4 |
| Toolchain proven | 3 | 3 |
| Tests attach at honest seams | 4 | 4 |
| Total out of 30 | 19 | 22 |

## The pick

**The base is candidate 2.** The owner said to take the design with the highest score. The judge's reason holds up: four ordinary wrong imports passed candidate 1's checks (measured by the judge, `arena-code/verdict.md`, "Boundaries enforced by the build"), and candidate 2's checker refused them all.

What the base fixes:

- Seven packages under `packages/`: `tau-store`, `tau-host`, `tau-kit`, `tau-websearch`, `tau-w2`, `tau-w1`, and `tau`.
- `tau-store` exports the five functions an extension may call from its root, and `answer` from the subpath `tau-store/host`.
- A checker, `tools/check-boundaries.mjs`, reads `boundaries.json` and refuses an import that crosses a boundary. It runs before TypeScript.
- TypeScript emits to `dist/` in each package. Tests and the server run the emitted JavaScript.
- The 20 calls are one list in `packages/host/src/calls.ts`.

## Taken from candidate 1

- The four Decision functions sit in one file, with the `answer` table written out row by row as the plan for the code.
- One table of refusal codes with their HTTP statuses, without the two codes candidate 1 added.
- Two measured facts about pi-durable. Reading a member of a document family creates it, so `decision()` must check a counter first. A test can kill a process inside a commit by wrapping the `Storage` it passes in, so production code needs no hook.
- Type tests and an export test that run in the normal gate.
- Task stubs that are real `defineTask` objects.
- The module map derives each name from `extension.name`.

## Rejected

- Candidate 1's Biome rules as the only guard on imports.
- Candidate 1's refusal codes `unknown_extension` and `bad_code`. The design names neither, and it records an unknown extension as missing.
- Candidate 2's replacement of the six design spikes. They stay as their own check.
- Candidate 2's `declare const` tasks, which compile and do not exist at run time.

## What neither settled

The judge lists these under "What both got wrong or left out". Each goes to the unit that meets it, and what that unit chose is recorded in [Build notes](build-notes/README.md).

- How a workspace package resolves under the flake's `node_modules`.
- What an `input` call does when `whenBusy` is left out.
- The closed schemas for the pairing and admin messages.
