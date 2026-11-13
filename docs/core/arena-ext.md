# Extension arena

This note records the fourth arena, run on 2026-11-13. It produced [Extensions](extensions.md) and [Lane](lane.md). The raw files are in `arena-ext/`, as their authors wrote them.

## What ran

The owner wrote two notes on the design. The docs treated a workflow as the only kind of extension, and the extension should be the main unit. And the owner was considering Lane, a long-running conversation for one role. The brief asked each author to design the first, to put the second through the admission rule and the kit's rule, and to walk one script of twelve steps.

| Label | Author | Size | Ran code |
| --- | --- | --- | --- |
| Candidate 1 | `claude-opus-5-5` | 3,779 words | A probe, E1 to E6 |
| Candidate 2 | `gpt-6.1-sol` | 3,744 words | Nothing |
| Candidate 3 | The picker's model, in an agent with a fresh context | 3,789 words | A probe, X1 to X11 |

- **The picker wrote no candidate this time.** Its designs scored lowest in all three earlier arenas, and writing one biased its pick in the last. It framed the brief, probed, picked, and merged.
- No author could read another's files or the rubric.
- A rate limit cut two authors off near the end. Each was resumed from its own saved session and finished its own files.
- The judge was `gpt-6-astra`. It ran both probes again and wrote four checks of its own.

## Scores

| Criterion | C1 judge | C1 picker | C2 judge | C2 picker | C3 judge | C3 picker |
| --- | --- | --- | --- | --- | --- | --- |
| The extension is the unit, and the model stays small | 5 | 5 | 4 | 4 | 4 | 4 |
| Legal on pi-durable | 4 | 4 | 4 | 4 | 3 | 3 |
| The extension script holds | 3 | 4 | 4 | 4 | 4 | 4 |
| Lane gets an honest verdict | 4 | 4 | 5 | 5 | 4 | 4 |
| The lane walk holds | 3 | 3 | 4 | 4 | 2 | 3 |
| Candor and evidence | 4 | 4 | 3 | 3 | 3 | 3 |
| Total | 23 | 24 | 24 | 24 | 20 | 21 |

The picker has candidates 1 and 2 level. The judge's one point is a real defect: candidate 1 gave the implementer codemode with nothing to keep a nested publish in order.

## The base is candidate 2

- It applies the rules most carefully. "Several work items are not separate call sites" is the kit's check 1 read correctly.
- Its lane walk is the only one that is legal throughout. The lane owns no worker, and each report back has a commit of its own.
- It says most about what a stored key exposes: "including backups".

Its weaknesses: it ran nothing, it changed the owner's ruling on the bare agent without saying so, and its designer kept the reviewer's tools.

## What was changed in the base

| Change | Why | Source |
| --- | --- | --- |
| The change to the bare agent is flagged as a change to a Decided line. | The owner must agree to it. | Candidates 1 and 3 flagged it. The judge asked for it. |
| A secret is the format `secret`, not `writeOnly`. | pi-schema's builders take a format and no `writeOnly`, and the host already knows the format `model`. | Candidates 1 and 3 |
| An open role removes its extension's other tools by name. | The base's designer held the reviewer's tools. | The judge. Candidates 1 and 3 had it right. |
| A tool that publishes declares `callers: ["model"]`. | A nested call ignores `sequential`. | Candidate 3, its check X5. The judge asked for it. |
| A section checks who it is for. | A tool list does not hide a section. | The judge's check J3 |
| W1's implementer is a closed role, and W2's agent stays closed. | The base opened W2's agent to the project default. Its tools are its promise. | Candidates 1 and 3 |
| Notes come before a lane. | The base recommended a trial of a lane, with notes as the baseline. The notes are the cheaper first step. | Candidate 1. The judge asked for it. |
| The build entry names the lane's brief. | The brief steers the build, and nobody approves it. | Candidate 3 |

## What all three found

- A workflow is an extension whose module exports `entry`.
- A project selects extension names, and the host passes a default that a conversation follows, edits, or replaces. No candidate chose exact lists everywhere, and none chose an extension that turns itself on.
- A role whose tools are its promise names them exactly.
- An API key lives in the extension's options, in plain text in the project's store, and the host's reply hides it.
- Lane is not a core part and not yet a kit helper.
- A lane's knowledge in pi-durable is a summary and a window. Only a document keeps things exactly.

## Where the designs disagreed

| Question | Positions | Result |
| --- | --- | --- |
| What to do about Lane now | Candidate 1: no lane, notes instead. Candidate 2: a trial inside W1, against notes. Candidate 3: W1 builds one and keeps it only if a run shows a gain. | Notes first. A lane inside a workflow if a run shows a gain. |
| What a dispatch costs | Candidates 1 and 3: two model requests. Candidate 2: one. | One, when the tool ends the run. The judge ran it. |
| W2's agent after `websearch` is added | Candidate 2: it can search. Candidates 1 and 3: it cannot. | It cannot. |
| How a report reaches the lane | Candidate 1: a task that waits. Candidates 2 and 3: a `write`. | A `write`, from a commit of its own. |
| A fresh lane | Candidate 1: an option that counts up. Candidate 2: a decision. Candidate 3: a new context in the same conversation. | Left to the workflow. |
| `web_search` after a crash | Candidate 1: `replay: "safe"`. Candidate 2: not. | The extension's choice. |

## Rejected

| Part | Source | Why |
| --- | --- | --- |
| "A workflow is an extension that owns conversations" | Candidate 3 | The judge called it an extra rule. A tool extension may create a helper conversation. |
| A report keyed by the review entry, in the commit that appends the entry | Candidate 3 | It throws. The judge ran it. |
| `writeOnly: true` for a secret | Candidate 2 | See above. |
| A lane's trial written into W1's walk | Candidates 2 and 3 | W1 is a sample, and the lane is not adopted. The rows stay in the raw files. |
| A `lane` option that counts up to ask for a fresh lane | Candidate 1 | It is the workflow's own business. |

## What every design missed

The judge ran a Git check. Two work items that start from one base cannot both be handed over with `git merge --ff-only`. After the first is merged, the second no longer fast-forwards. No design walked it. [Lane](lane.md) and the README record it as open for W1.

## What the picker ran

`spikes/ext.mjs`, twelve checks. E1 to E5 come from the picker's probe and candidate 1's. E6 is candidate 3's check of nested calls. E7 to E10 are the judge's four checks. E11 and E12 are the picker's checks of compaction.

## Verification

- `spikes/ext.mjs` printed `ok: checks E1-E12 passed` on three runs in a row.
- `arena-ext/candidate-1-probe.mjs` printed `ok: checks E1-E6 passed`, and `arena-ext/candidate-3-probe.mjs` printed `ok: checks X1-X11 passed`, for the authors and for the judge.
- Every `path:line` citation in [Extensions](extensions.md) and [Lane](lane.md) was resolved against its source.

Not verified: see the ends of [Extensions](extensions.md) and [Lane](lane.md). No lane ran against notes, and no real model wrote a summary.
