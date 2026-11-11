# How this version was chosen

The first draft of `docs/core` was tested in an arena on 2026-11-10. This note records what ran, what was picked, and why. The raw files are in `arena/`.

## What ran

Three designs answered one brief (`arena/brief.md`). The brief fixed ten decisions and left six forks open.

| Label | Author | Size | Ran code |
| --- | --- | --- | --- |
| Candidate 1 | `claude-opus-5-5` | 2,195 words | A probe with six checks |
| Candidate 2 | `gpt-6.1-sol` | 2,004 words | Nothing |
| Candidate 3 | The first draft of this folder | 4,648 words | One spike |

Candidates 1 and 2 could not read the first draft or each other. Neither saw the rubric (`arena/rubric.md`), which was written before any design existed. No candidate dropped out.

One judge, `gpt-6-astra`, scored all three by path label (`arena/verdict.md`). It comes from a different model family than the picker. It was told that candidate 3 is twice as long and to give length no credit. It read candidate 1's probe and did not run it.

The picker then read all three, reran the probe, and checked the facts the candidates disagreed on.

## Scores

Each criterion is scored from 1 to 5. "Picker" is the author of this note. Candidate 3 is the picker's own draft, so the picker's scores for it carry the least weight.

| Criterion | C1 judge | C1 picker | C2 judge | C2 picker | C3 judge | C3 picker |
| --- | --- | --- | --- | --- | --- | --- |
| Lean core | 4 | 4 | 4 | 3 | 4 | 4 |
| Fit to pi-durable | 4 | 5 | 5 | 4 | 3 | 3 |
| Guarantees hold | 2 | 3 | 4 | 4 | 2 | 2 |
| Meets the fixed decisions | 4 | 4 | 5 | 5 | 5 | 5 |
| Extensibility is shown | 3 | 4 | 4 | 4 | 4 | 3 |
| Candor and evidence | 4 | 4 | 5 | 5 | 4 | 4 |
| Total | 21 | 24 | 27 | 25 | 22 | 21 |

Where the picker's score differs from the judge's:

- **C1, fit and extensibility.** The picker ran the probe, and all six checks passed on pi-durable 1.5.2. The judge could only read it. Check 6 runs the key move of candidate 1's second workflow.
- **C1, guarantees.** Its retry rule compares the choice and the notes but not the basis. That is a real defect. It is a small one, because the decision ID already ties an answer to one request.
- **C2, lean core.** It adds a factory for extensions, a stored workflow selection that needs a new project to change, events on every decision change, and a plain client inside the core.
- **C2, fit.** Its decision ID comes from an appended event. That makes `request` a table write, and the design does not name what that costs.
- **C3, extensibility.** Its second workflow starts with the approval of a document, which repeats W1.

## The base is candidate 2

The judge and the picker agree. Candidate 2 leaves the fewest dangerous choices unstated:

- Its `answer` contract is complete. A retry with equal fields returns the record. A retry with different fields is a conflict. The first device stays as the actor. A storage failure is an unknown outcome, and the client retries.
- It says that a matching basis does not prove the world is unchanged, so the work after an answer checks again.
- It is honest that a shell under the server's account defeats "only a human answers".
- Its weak parts can be removed without touching the rest.

The picker has the race closer than the judge does, 25 to 24 against 27 to 21. The base matters less than usual here. The final Decision takes its `request` half from candidate 1 and its `answer` half from candidate 2.

## Where all three agreed

Agreement between designs that could not see each other is the strongest evidence in this arena.

- One server process, with one store, one harness, and one registry per project.
- A Render extension is a pi-durable `Extension`. No second plugin interface exists.
- The basis of a decision is the ID of an immutable entry in the same store.
- A decision is a document, not a waiting task.
- The event log is one conversation per store that no agent owns.
- Prose stays out of the core. A small helper beside the core fills `{{name}}` slots in one pass, with no conditions, loops, or includes.
- The owner's premise on prose is half right. Workflows own their prose, but they do not need their own renderer, because pi-durable's sections already are one.
- No reactors, lifecycle callbacks, client actions, or expiry in the core.

## Taken from candidate 1

| Part | Why |
| --- | --- |
| Extensions import `request`, `withdraw`, and `emit` and pass their `tx`. No factory. | The `tx` already names the store. Candidate 3 had the same shape. |
| `request` writes documents only, and the core emits no events about decisions. | A commit cannot read a table or call `submit(tx, draft)` after a table write (measured, checks 3 and 5). A document-only `request` works anywhere in a commit. |
| The decision ID is `${subject}#${n}`. | It replaces candidate 2's ID from an event entry, which the row above rules out. |
| `then` is passed as a typed task. | The compiler checks that the task handles the choices. Candidate 2 proposed the same. |
| The probe, kept as `spikes/substrate.mjs`. | It turns five claims from reading into measurements. A seventh check was added for two answers at once. |
| Forecasts as W2. | See [Proving workflows](workflows.md). |
| Two admission checks: pi-durable does not provide it, and the shape stays small. | Both are checkable by a reviewer. |

## Taken from candidate 3

| Part | Why |
| --- | --- |
| The seam between the store layer and the host layer. | The judge called it the strongest packaging. The store layer needs no project concept. |
| `title` on a decision and `text` on an event. | A client shows both without knowing the workflow. Candidate 1 also had `title`. |
| The split between pinned prose and live prose. | The judge asked for it. See [Prose](prose.md). |
| Two admission checks: no workflow concept, and delete the core's copy when pi-durable gains the feature. | They guard against the way v1 grew. |

## Taken from the judge

- The first draft claimed that separate stores isolate projects. They do not isolate trusted code or a process crash. [Topology](topology.md) now says so.
- The first draft reused an open decision when only the basis was equal. `request` now compares every field.
- The host layer now falls under the admission rule.
- Its three findings on what every design missed. See below.

## Rejected

| Part | Source | Why |
| --- | --- | --- |
| A factory that hands each extension its project | Candidate 2 | No user was shown. The judge agreed. |
| Events on every decision change | Candidates 2 and 3 | They make `request` a table write. The judge advised not to delete them casually, because candidate 2 derived the decision ID from them. The ID now comes from a counter in a document, so nothing depends on them. |
| A new project to change a workflow | Candidate 2 | Too strict to fix now. The narrower point, an explicit selection on each new conversation, is kept as open. |
| A retry check on choice and notes only | Candidate 1 | Candidate 2's full comparison replaces it. |
| Free task input on `then` | Candidate 1 | The task gets the decision ID and the choice. Workflow state stays in the workflow's documents. |
| "A prose fix never reaches an existing conversation" | Candidate 1 | Overstated. `configure()` changes stored instructions (measured, `src/harness/agent.ts:161`). |
| A list of exports that the build checks against a file | Candidate 1 | It may be right. It waits until there is code to check. |
| Spaced recall as W2 | Candidate 2 and the judge | It is the runner-up. Its two distinct stresses were moved into W2. |
| Thesis to verdict as W2 | Candidate 3 | It repeats W1's approval step. |
| A version check that refuses an answer after an upgrade | The picker's first response to the judge | A task version tracks stored shape, not behaviour. See [Primitives](primitives.md). |

## What every design missed

The judge named three gaps. None is closed yet.

1. **Nothing keeps an agent's shell away from the server's credentials and store.** The picker then found that pi-env already ships an execution environment that runs tools on another machine or account. It is now the first open question in the [README](README.md), with a proposal.
2. **An upgraded workflow can give an old open decision a new meaning.** It is recorded as a known gap in [Primitives](primitives.md), with the duty on the workflow.
3. **No design walked W1 through its commits.** That walk is the next step, and [Proving workflows](workflows.md) lists what it must show.

Candidate 2 also flagged that SQLite storage may lose the newest commit when the power fails. The picker confirmed it at the pragma. It is an open question in the README.

## Verification

- `spikes/substrate.mjs` printed `ok: checks 1-7 passed` on pi-durable 1.5.2.
- `spikes/two-harnesses.mjs` printed `ok a:generating > b:done > a:done` on 1.5.2.
- The 49 distinct `path:line` citations in this folder were checked against the sources after the rewrite. Three line numbers were off by one and were corrected.
- Not verified: a crash in the middle of an `answer` commit, the decision documents as designed, pi-env, and any workflow end to end.
