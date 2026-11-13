# How the walk was chosen

The design in this folder was walked on paper in a second arena on 2026-11-11. This note records what ran, what was picked, and why. The raw files are in `arena-walk/`, kept as their authors wrote them.

[Arena](arena.md) records the first arena, which chose the design itself.

## What ran

Three authors walked the same two scripts through `docs/core`, one commit at a time (`arena-walk/brief.md`). The brief also carried eleven rulings that the owner made after the first arena. It asked each author to put `role()` on paper, to take Annotation through the admission rule, and to list where the design fell short. It said that a walk that finds no problem is suspect.

| Label | Author | Size | Ran code |
| --- | --- | --- | --- |
| Candidate 1 | `claude-opus-5-5` | 3,791 words | A probe with five checks, P1 to P5, on in-memory storage |
| Candidate 2 | `gpt-6.1-sol` | 3,323 words | Nothing. Its "measured" means source that it read. |
| Candidate 3 | The picker | 3,797 words | A probe with six checks, A to F, on SQLite with clean closes |

Candidates 1 and 2 could not read each other or the rubric (`arena-walk/rubric.md`). Candidate 3 is not blind in that way. Its author wrote the brief and the rubric.

One judge, `gpt-6-astra`, scored all three by path label (`arena-walk/verdict.md`). It comes from a different model family than the picker. It ran both probes again, and both passed.

The picker then ran the probes again, read the walks against the source, and wrote a crash test for the points the walks disagreed on. See "What the picker ran afterwards".

## Scores

Each criterion is scored from 1 to 5. "Picker" is the author of this note. The picker wrote candidate 3 and does not score it.

| Criterion | C1 judge | C1 picker | C2 judge | C2 picker | C3 judge |
| --- | --- | --- | --- | --- | --- |
| The walk is real | 4 | 4 | 5 | 5 | 3 |
| Legal on pi-durable | 4 | 5 | 4 | 4 | 3 |
| Failure paths | 3 | 4 | 4 | 4 | 3 |
| Respects the rulings and the rule | 3 | 3 | 5 | 5 | 2 |
| Findings a maintainer can act on | 4 | 4 | 4 | 4 | 3 |
| Candor and evidence | 4 | 4 | 5 | 5 | 4 |
| Total | 22 | 24 | 27 | 27 | 18 |

Where the picker's score differs from the judge's:

- **C1, legal on pi-durable.** The judge named no illegal step in candidate 1. The crash test then confirmed the two claims of candidate 1 that carry the most weight: a receipt keyed by the tool's task ID (K1), and a changed checkpoint before a wait (K5). The judge could only read them.
- **C1, failure paths.** Candidate 1 is the only walk that saw the restart limit on a waiting task, and its fix survived seven kills (K3, K5). It also covers a run that fails, which candidate 2 leaves open. Its worktree cleanup still deletes a directory that it cannot prove is its own.

The judge's low scores for candidate 3 are fair, and the picker takes them as given. Its designer had no model, so its first run would end with `no_model`. And it failed Annotation on check 4, then let the same shape in as a field "on probation". The judge was right that this goes around the rule.

## The base is candidate 2

The judge and the picker agree.

- Its rows keep four kinds of step apart: setup, store commits, Git effects, and hook commits. An engineer can build from it.
- Its cancel is durable before any agent is stopped.
- It refuses to delete a worktree that it cannot prove is its own.
- It says "handed over" and never "merged".
- Its `role()` takes the settings type the owner agreed, with nothing added.
- It says plainly what it did not do: "Measured here means source read, not execution."

Its weakness is that it ran nothing. The judge found two defects in it. Its timers are not `background`, so a Stop would abort them, and candidate 1's first probe check catches exactly that. And its handover records "repair needed" on a mismatch and does not say what happens next.

## What was changed in the base

| Change | Why | Source |
| --- | --- | --- |
| Every W1 and W2 task that must outlive a Stop is `background`. | A Stop in the conversation aborted a plain sleeping task and spared a `background` one. | Candidates 1 and 3 for W2's timers, candidate 1 for W1's tasks. P1 and probe E. |
| The control conversation is gone. The designer's conversation owns W1's tasks, and its ID is the work's key. | With `background` tasks, a Stop in that conversation no longer reaches them. One conversation less to create and to name. | Candidates 1 and 3 both key the work by the designer's conversation. |
| The host creates the designer's conversation from the workflow's `entry`. The bootstrap task is gone. | The host creates conversations for clients anyway. A task that only creates the first conversation adds a step that can fail. | Candidate 1 |
| The reviewer has no `read` and no `bash`. Its tools read Git objects at the SHA in W1's document. | With `read`, a review can cover files that are not in the commit. | Candidate 1. The judge called it the strongest provenance. |
| Tool names lost the `w1.` prefix. | A model provider takes no dot in a tool name (reported, not checked here). Task names keep the prefix. | The picker |
| An annotation has no ID and no author of its own. | The decision ID and the index name it. The answer already holds the device and the time. | Candidate 1. The judge called this shape smaller. |
| A handover that finds the branch moved opens a decision, and "retry" sends the new head to review. | The base recorded "repair needed" and stopped there. The judge asked for the recovery. | The picker, W1 row 19 |

## Taken from candidate 1

| Part | Why |
| --- | --- |
| `decision(tx, id)` and `eventLog(tx)` as reads for extensions | A `then` task cannot read the annotations without the first, and a tool cannot find the log without the second. All three walks needed both. Candidate 1 gave the smallest form, two reads over a `tx`. |
| The `then` task is `background`. | An answer is the owner's act, and a Stop must not cancel it. |
| A changed checkpoint before a wait in memory | It is now a rule for workflow authors. K5 measured it. |
| The requirement that a role names its model and its extensions | It is kept as a narrower type on `role()`, not as a second settings type. |

## Taken from candidate 3

| Part | Why |
| --- | --- |
| The gap between a tool's commit and its stored result | The judge asked for it. It became checks K1 and K2. |
| The correction of the order in `primitives.md` | The first version told workflows to append, then `request`, then `submit(tx, draft)`. That order throws. All three walks hit it, and candidate 3 said so most plainly. |
| `annotations` replaces `notes`. | The other two kept both fields. One field is enough when the core only stores. |
| A range is two offsets into `text`, and nothing more. | Candidates 1 and 2 stored a quote beside the offsets, and candidate 2 added a JSON pointer. The basis is one `text` field in an entry that never changes, so neither is needed. |
| The server opens every project at start. | A closed store never wakes. |
| "It owns nothing stored" as a check for the standard library | It is the line between a helper and a part of a workflow. |

## Taken from the judge

- Both of its findings on what every walk missed. See below.
- Its question on annotations that come with an approval, when no revision follows. [The walk](walk.md) now says what W1 does with them.
- Its ruling on Annotation. Checks 1, 2, 3, and 5 pass for a field that the core only stores. Check 4 rests on the client that knows no workflow, and not on W2.
- Its view that real call sites are better evidence for a library part than a second user who might come.

## What all three found

The walks were written apart, and each of them reached these. That makes them the firmest results of the arena.

- A client that knows no workflow cannot show a basis. The basis entry needs a `text` field.
- The order that `primitives.md` gave for `request` and `submit(tx, draft)` throws.
- A `then` task has no way to read its decision, and a tool has no way to find the event log.
- A tool that publishes declares `replay: "safe"` and keeps a receipt under its task ID.
- A revised forecast withdraws its open decision in the revising commit, and "not yet" starts a new timer.
- The handover names a SHA, and the owner merges that SHA. A branch that moves afterwards then changes nothing.

## Where the walks disagreed

| Question | Positions | Result |
| --- | --- | --- |
| Who owns the `then` task | Candidate 1: `background`. Candidate 3: not. Candidate 2: a control conversation. | `background`, in the decision's conversation. The judge said both policies are legal. This one does not lose an answer to a Stop, and it costs an explicit cancel. |
| How W1 notices a run that ends without a handoff | Candidates 1 and 3: a task submits and waits. Candidate 2: an `afterRun` hook. | The hook, from the base. It misses a run that fails. The task covers that and costs a long-lived task. Left open in [the walk](walk.md). |
| The worst place for a crash | Candidate 1: a long wait. Candidate 2: after `git commit`, before the build entry. Candidate 3: inside a publishing tool. | Candidate 2's. Nothing in the store can say whose commit that is. The other two are now rules with a measured fix. |
| Who owns the worker conversations | Candidate 3: the build task. Candidates 1 and 2: nobody. | Nobody. The cancel visits each one. The judge said both are legal. |
| Annotation through the rule | Candidates 1 and 2: a pass on the client clause. Candidate 3: a fail as a primitive, then admitted as a field. | A pass on the client clause. |
| The shape of `role()` | Candidates 1 and 3: a pure function over a settings type of their own. Candidate 2: `role(tx, settings, ownership)` over `AgentChange`. | Candidate 2's. |

## Rejected

| Part | Source | Why |
| --- | --- | --- |
| A flag on the request that turns annotations on | Candidate 1 | The owner's ruling is that the core only stores. |
| `notes` kept beside `annotations` | Candidates 1 and 2 | An annotation without a range is a note. |
| A client-made ID, a JSON pointer, and an author on each annotation | Candidate 2 | The smaller shape names the same thing. |
| A quote on each range | Candidates 1 and 2 | The host checks the offsets against a text that never changes. |
| A `conflict` that returns the subject's open decision | Candidate 3 | The judge called it convenience. The client reads the inbox again. |
| A change to `request` that ignores the time, as the fix for reruns | Candidate 1 | The judge was right that it does not replace receipts. The change is kept as a backstop only. |
| A fault event from the host | Candidate 1 | For a `then` task the host reads the task's state and shows it with the decision. A faulted task that no decision points at is still open. It is finding 20 in [the walk](walk.md). |
| A worktree cleanup that deletes an unregistered directory | Candidate 1 | It cannot prove the directory is its own. |
| A listed worktree path as proof of ownership | Candidate 3 | The same. The plan is stored first, and a mismatch stops the work. |
| A settings type for roles | Candidates 1 and 3 | The owner ruled that a role's settings are `AgentChange`. |
| "No store access" as a rule for the standard library | Candidate 1 | It excludes `role()` and names no failure. |
| A label on a conversation | Candidate 3's finding 14 | Candidate 3 itself showed that it fails check 4. |

## What every walk missed

The judge named two gaps. Both are now closed on paper.

1. **An answered decision can become a dead end.** Its `then` task throws or runs out of restarts. Sending the answer again returned the same dead task. The judge called this the most serious gap. `answer` now creates the task again on an equal resend when the old one ended `faulted`. See [Primitives](primitives.md). K3, K4, and K6 are the evidence.
2. **A publish is not the end of a run.** Tool calls of one round run in parallel, and a round ends the run only when every call asks for it. So a `bash` call can change files beside a publish. A publishing tool is now sequential and reads the state itself. This rests on source that was read and not run.

## What the picker ran afterwards

`spikes/crash.mjs` runs on pi-durable 1.5.2 with SQLite files. It starts child processes and kills each one with `SIGKILL`.

| Check | Result |
| --- | --- |
| K1 | A `replay: "safe"` tool ran again after the kill with the same task ID, found its receipt, and appended nothing more. |
| K2 | A tool with the default `replay` was not run again. The model called a second time, and that call appended a twin entry. |
| K3 | A task that waited in memory was ended `faulted` after five kills in a row. `onReport` heard `task_faulted`. |
| K4 | A commit read the faulted task and created a replacement, and the replacement ran. |
| K5 | With a changed checkpoint before the wait, the task was still running after seven kills. |
| K6 | Killed inside an answer-shaped commit, the store held neither the answer nor the task. Killed right after it, the store held both. |

K3 changed the picker's view of two walks. Candidates 1 and 3 both drive an agent from a task that waits. Only candidate 1 saw that five restarts end such a task.

## Verification

- `spikes/crash.mjs` printed `ok: checks K1-K6 passed`.
- `spikes/substrate.mjs` printed `ok: checks 1-7 passed`.
- `arena-walk/candidate-1-probe.mjs` printed `ok: probe P1-P5 passed`.
- `arena-walk/candidate-3-probe.mjs` printed `ok: checks A-F passed`.
- All four ran from this folder on pi-durable 1.5.2.
- Every `path:line` citation in the ten notes of this folder was resolved against its source. The ones in notes that this round changed were read against their claims, and two were corrected. The raw files in `arena-walk/` were not checked this way.

Not verified:

- No workflow code exists, and no row of the walk has run.
- The real `request`, `withdraw`, `answer`, `emit`, `decision`, and `eventLog` do not exist. The checks used plain documents with the same shape.
- No Git command, worktree, or shell ran.
- No hook ran, and no sequential round ran.
- K6 does not kill the process in the middle of SQLite's own write.
- No client placed an annotation.
- No workflow upgrade was walked with a decision open.
