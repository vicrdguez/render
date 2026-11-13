# Host arena

This note records the third arena, run on 2026-11-12. It produced [Host](host.md). The raw files are in `arena-host/`, as their authors wrote them.

## What ran

The owner reviewed [the walk](walk.md) and answered its open questions. The brief carried those answers as seven rulings, numbered 12 to 18, and asked for the design work they left: the client's calls, binding a project, a workflow's options, the faulted tasks, and joining a running agent. Each author walked the same script of nine steps and wrote the same eight sections.

| Label | Author | Size | Ran code |
| --- | --- | --- | --- |
| Candidate 1 | `claude-opus-5-5` | 3,169 words | A probe, H1 to H8, on SQLite |
| Candidate 2 | `gpt-6.1-sol` | 2,940 words | Nothing |
| Candidate 3 | The picker | 3,196 words | A probe, H1 to H6, on SQLite |

- Candidates 1 and 2 could not read each other or the rubric. Candidate 3's author wrote the brief and the rubric.
- The first launch of candidates 1 and 2 was lost when the session was interrupted. Both were launched again with the same prompt, and nothing of the first launch was used.
- The judge was `gpt-6-astra`, from another model family than the picker. It scored by path label, ran both probes again, and wrote a probe of its own.

## Scores

Each criterion is scored from 1 to 5. "Picker" is the author of this note. The picker wrote candidate 3 and does not score it.

| Criterion | C1 judge | C1 picker | C2 judge | C2 picker | C3 judge |
| --- | --- | --- | --- | --- | --- |
| A list an engineer can build from | 3 | 4 | 5 | 5 | 3 |
| Legal on pi-durable | 4 | 5 | 4 | 4 | 2 |
| Options meet the owner's ask | 4 | 4 | 3 | 3 | 4 |
| Small, and by the rules | 2 | 3 | 4 | 4 | 2 |
| The script holds | 4 | 4 | 4 | 4 | 4 |
| Candor and evidence | 4 | 4 | 5 | 5 | 3 |
| Total | 21 | 24 | 25 | 25 | 18 |

The picker's first reading put candidate 1 ahead. Candidate 1 has the same shape as candidate 3, which the picker wrote, so that reading was biased. Two findings of the judge moved it, and both held when checked:

- **The stored options do not pass check 3.** Candidates 1 and 3 put the options record in the core, because "only the host serves clients". Candidate 2 showed that the host can call a contract on the workflow's module and store nothing. An extension can then keep the promise, and the admission rule keeps the storage out.
- **Uninstalling does not park running work.** Candidate 3 said it does and labelled the claim measured, with a check that had only reopened a store. The judge's probe ran a task through its second phase after the uninstall.

Where the picker still differs from the judge on candidate 1:

- **The list.** Its rows are complete, and its one false claim is the resend of a Stop. That is worth one point, not two.
- **Legal on pi-durable.** Its eight checks passed again for the picker, and the sampled citations hold.

The judge's low scores for candidate 3 are fair, and the picker takes them as given.

## The base is candidate 2

The judge and the picker agree.

- Its list is the clearest. It keeps agent calls off the event log, it gives older history its own call, and its resend column is right, including the Stop.
- Its core is the smallest. The core stores no options, and no workflow is removed.
- Its core changes go through the five checks without leaning on convenience.
- It says plainly what it did not do: "measured by source reading, not execution".

Its weaknesses are the ones the judge named. It ran nothing. A workflow's author must define the options document, which misses the owner's request for one function. It keeps a catalogue file beside the stores, so two records can disagree. And at start it makes a whole project unavailable when one workflow's options do not fit.

## What was changed in the base

| Change | Why | Source |
| --- | --- | --- |
| One call defines the options document and returns the reads and the write. | The owner asked for a single function that stores the values by itself. The judge said to resolve this before building. | The picker. It needs the reworded check 3 in [Standard library](library.md), which the owner then accepted. |
| The host merges a patch and stores only the keys that were set. The schema's defaults fill the rest at read. | Two devices that set different options do not undo each other. A default that changes later reaches projects that never set the key. | Candidates 1 and 3 |
| A model is a string with the format `model`, and the host checks that the server has it. | A wrong model is refused when it is set, not at the first run. A client can show a picker. | Candidate 1, its check H7 |
| The catalogue file is gone. The directories are the catalogue. | A second record needs its own safe write and can disagree with the stores. | Candidates 1 and 3. The judge agreed. |
| `bind` takes a path, not the key of a workspace. | A key needs an edit on the server before each bind. | Candidates 1 and 3. The owner then chose the path. |
| The fault scan goes by task kind. | A scan by status reads every model request and tool call a project ever made. | Candidates 1 and 3, H10 |
| A fault carries its decision only when that decision's `continuation` is the task. | The judge found that a match by kind can hide a replaced `then` task. Candidate 2 returned no mark at all. | The picker |
| A project still opens when the server no longer has one of its workflows. | The other workflows' timers should run. | The judge |
| `setModel` works during a run. | pi-durable applies the change from the next request, and the transcript names the model of each message. | Candidates 1 and 3, H5 |
| The calls that read one submission, one task, and the workspaces are gone. | A resent `input` returns the submission, and a decision carries its task's state. | The picker |
| The host checks the options before it creates a conversation. | A refusal then creates nothing. | Candidate 1 |

## Taken from candidate 1

| Part | Why |
| --- | --- |
| The `model` format, with pi-schema's `formats` | It ran, and it is one name in a schema. |
| The split between the keys that are set and the defaults | The judge asked for it. |
| "A `required` error refuses a create but not a patch" | A client can then set one key at a time. |
| Its probe | All eight of its checks are in `spikes/host.mjs`, most of them merged with candidate 3's. |

## Taken from candidate 3

| Part | Why |
| --- | --- |
| The `client:` prefix on a client's request ID | A client's ID can then never equal one that a workflow uses in the same conversation. The judge asked for it. |
| The state of each conversation in the list | A failed run opens no decision. The judge asked for it. |
| `onReport` comes after the fault is stored | It is the reason the host scans and does not keep a list of its own. |
| "A `tx` names a store, not a directory" | It is the first row of the comparison of where options live. |

## Taken from the judge

- Uninstalling does not park running work. Its probe is check H12.
- A second Stop ends a newer run. Candidates 1 and 3 both said that it finds nothing to stop.
- An unknown model ends a run with `no_model`, not `model_error`.
- The limit of a scan bounds the rows that come back, not the rows that SQLite looks at.
- What every design missed. See below.

## What all three found

The designs were written apart, and each of them reached these.

- A workflow's options belong in a document in the project's store, not in a JSON file. The owner had suggested a file.
- A workflow reads its options in the commit that uses them. W1 sets a role's model when it submits to that role, so a running review ends on the model it had.
- `entry` must be able to read the options, or the first conversation has no model.
- A project's record lives in its store, and the client picks the project's ID, so a resent `bind` finds its project.
- At start the server opens each store with an empty registry, reads the workflow list from the store, installs, and resumes.
- The faulted tasks are found by scanning finished tasks. A list fed by `onReport` can lose a fault.
- Joining a running agent needs no workflow code. An event names the conversation.
- Nothing is added for a retried create.

## Where the designs disagreed

| Question | Positions | Result |
| --- | --- | --- |
| Who stores the options | Candidates 1 and 3: the core. Candidate 2: the workflow. | The workflow. The judge ruled on check 3. |
| What the author writes | Candidate 1: a library helper over a core read. Candidate 2: a document, then a library helper. Candidate 3: a core function. | One library call that defines the document. |
| The catalogue | Candidate 2: a file. Candidates 1 and 3: the directories. | The directories. |
| The working directory | Candidates 1 and 3: a path. Candidate 2: a workspace key. | A path. The owner agreed. |
| Removing a workflow | Candidate 1: refused while in use. Candidate 2: not offered. Candidate 3: allowed, and "parks" the work. | Not offered. |
| A patch or a whole value | Candidates 1 and 3: a patch. Candidate 2: a whole value, and the last write wins. | A patch. |
| An unknown model | Candidate 1: refused when set. Candidates 2 and 3: the run fails. | Refused when set. |
| The fault scan | Candidates 1 and 3: by kind. Candidate 2: by status. | By kind. |
| `then` tasks in the fault list | Candidate 1: left out. Candidate 2: listed with no mark. Candidate 3: marked by kind. | Listed, with an exact mark. |
| `setModel` during a run | Candidate 2: refused. Candidates 1 and 3: allowed. | Allowed. |

## Rejected

| Part | Source | Why |
| --- | --- | --- |
| An options record in the core, with a core read | Candidates 1 and 3 | It fails check 3. |
| `options()` as a core function | Candidate 3 | The same. |
| A helper that takes a document the author defines | Candidate 2 | The owner asked for one function. It is kept as the fallback. |
| `catalogue.json` | Candidate 2 | A second record. |
| Refusing a removal while the workflow is in use | Candidate 1 | No removal is offered at all. |
| A removal that parks work | Candidate 3 | It is false. |
| A whole-value replace of the options | Candidate 2 | A late resend overwrites every key. |
| An idle check on `setModel` | Candidate 2 | It adds a refusal that nothing needs. |
| A call that watches every live task | Candidate 1 | No ruling asks for it. |
| A project that does not open when its options do not fit | Candidate 2 | The judge called it unjustified. |
| A display name on a project, and a description on a workflow | Candidates 1 and 2 | The ID is readable. Nothing needs more yet. |
| A label on a conversation | None proposed it | All three rejected it again. |

## What every design missed

The judge named one gap. **A run that the owner started can overlap the workflow's next dispatch.** Every design sets a role's model and then submits. If the owner is already chatting in that conversation, the model changes in the middle of the owner's run, and the claims of "the round ran on model C" are not true of every request. `configure` has no check for a working run.

The picker ran it. The dispatch queued behind the owner's run, the owner's run took the new model from its next request, and the queued input then started a run of its own (H7). [Host](host.md) records it as a limit of joining. Nothing breaks, because the tools read the workflow's state.

## What the picker ran afterwards

`spikes/host.mjs` runs on pi-durable 1.5.2 with SQLite files. It merges the two probes and the judge's check, and adds four checks for moves that only the merged design makes.

| Check | Result | From |
| --- | --- | --- |
| H1 | A store reopened with an empty registry kept a due timer blocked. The timer ran after the install. | Candidates 1 and 3 |
| H2 | A helper-defined document took a patch through `get` and `set`. An unknown model and an unknown key were refused, and `null` cleared a key. | New, with candidate 1's format check |
| H3 | One commit checked the options, created a conversation, ran `entry(tx)`, and configured the agent. | Candidates 1 and 3 |
| H4 | A steer sent during a tool round was in the next request of the same run. A resend returned the first submission. | Candidates 1 and 3 |
| H5 | A model change during a run applied from the next request. | Candidates 1 and 3 |
| H6 | A steer marked "only if running" to an idle conversation was refused. | New |
| H7 | A dispatch during an owner's run queued, and the owner's run took the new model. | New, from the judge's gap |
| H8 | A run that ended on a model error was continued. | Candidates 1 and 3 |
| H9 | A second Stop ended a newer run. | New, from the judge's ruling |
| H10 | A thrown phase ended `faulted`, and the scan by kind found it. | Candidates 1 and 3 |
| H11 | A later install did not reach a conversation that names its extensions. | Candidate 1 |
| H12 | A task that was running when its extension was uninstalled went on. | The judge |

## Verification

- `spikes/host.mjs` printed `ok: checks H1-H12 passed`, on six runs in a row.
- `arena-host/candidate-1-probe.mjs` printed `ok: checks H1-H8 passed`. It writes a `probe-data` folder beside itself.
- `arena-host/candidate-3-probe.mjs` printed `ok: checks H1-H6 passed`.
- `spikes/substrate.mjs`, `spikes/crash.mjs`, and the two probes of the walk arena passed again.
- All ran from this folder on pi-durable 1.5.2.
- Every `path:line` citation in the notes of this folder was resolved against its source. The raw files in `arena-host/` were not checked this way, beyond the samples the picker and the judge took.

Not verified:

- No host code, client, or transport exists.
- `options()`, `setOptions()`, and `create()` in the spike are stand-ins with the designed shape.
- No check killed a process during a `bind`, a `setOptions`, or a `create`.
- The lock and the directory listing did not run.
- The fault scan was not timed on a large store.
- No tool ran on another machine.
