# Lane, through the rules

The owner is considering a new concept and asked that it be tested like any other:

> A lane is basically the concept of an agentRole/conversation that is long running, keeps compacting holding history and knowledge of a particular role and hands actual work for to other agents. For example, W1 could create the implementor lane, which is basically a long running conversation that dispatches implementor agents, and keeps the history of the project as it has been built so it becomes always more accurate at handing over task to agents as it knows the project much better than a fresh-context implementor building a particular work item.

**Proposed.** Three authors put Lane through the admission rule and the library's rule, and walked W1 with an implementer lane over three work items. All three reached the same verdict, and the judge agreed. [Extension arena](arena-ext.md) has the record, and `spikes/ext.mjs` ran the facts below as checks E8 to E12.

## The verdict

**Lane is not a core part, and not yet a library helper. A workflow can build one from pi-durable parts today. The first thing to try is cheaper than a lane: a notes document that fresh workers read.**

As a core part:

| Check | Result | Evidence |
| --- | --- | --- |
| 1. A real failure | Fail | No row of the walk fails without a lane. Its promise is better briefs, and no run has measured that. |
| 2. pi-durable does not provide it | Fail | It provides each part: a lasting conversation, compaction, a tool that submits to another conversation, and an example of persistent subagents that report back (measured, `test/examples/22-subagent-background.ts`). |
| 3. An extension cannot keep the promise | Fail | A lane guards no act at the boundary to the human, and a client reads it as a conversation. Two candidates built one as an extension in a probe. |
| 4. Two unlike users | Fail | Only W1's implementer. W2 creates no worker, and no client needs to tell a lane from a conversation. |
| 5. A small shape | Mixed | The candidates split. A lane that only exists is `role()` and a document. One that dispatches is a queue and a report back. It does not matter, since checks 1 to 4 fail. |

As a library helper beside `role()`:

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Callers today | Fail | No proving workflow has a lane. Several work items through one lane are one call site. |
| 2. No guarantee | Pass | It would use public pi-durable calls only. |
| 3. No stored name | Fail | The reworded check allows a document for the caller. A lane that dispatches also needs a tool and a task under a name. What would pass is "find or create the role's conversation", which is `role()` and one document read. |
| 4. No workflow concept | Pass | A long-running role is a way to define roles. |

## What a lane knows in pi-durable

The owner expects a lane that "becomes always more accurate". pi-durable's compaction does not give a transcript that property.

- **After a compaction the model sees a summary and a recent window.** By default the window is about 20,000 tokens, and the summary is at most about 13,100 tokens (measured, `src/harness/agent.ts:29-34`, `src/harness/compaction.ts:153-156`).
- **The summary is written by a model, and nobody reviews it.** It is one extra model request. The next request held the summary and no longer the first turn (measured, E11).
- **The summarizer does not see everything.** It gets no system message and no thinking, and each tool result is cut to 2,000 characters (measured, `src/harness/compaction.ts:67-68,398-402`).
- **Each compaction folds the last summary into the next** (measured, `src/harness/compaction.ts:78`). A lane's memory of the first work item is then a summary of a summary.
- **Nothing is deleted.** Every entry stays in the store (measured, `README.md:608`, E11). But the lane's model cannot read its own old entries.

So a lane keeps an aging summary and a fixed window. Only what is written to a document is kept exactly. Ultimate's project memory is a document too, of up to 150 entries (measured, line 55 of its `extensions/lineage/README.md`).

One part of pi-durable helps. A `beforeCompact` hook can supply the summary itself, and it supplied one from a document with no model request (measured, `src/harness/compaction.ts:142-147`, E12). A lane's memory is then the workflow's own stored notes. That is the notes design below with a conversation on top.

## What a lane costs

- **Model requests.** With no lane, W1 row 10 submits the design to the implementer with no model request. With a lane, each hand-over is at least one request at the lane's full context, when the dispatch tool ends the run (measured, E8). Two candidates measured two. Reading history or writing a note adds more.
- **One queue.** One conversation runs one thing at a time. Two inputs were two runs, one after the other (measured, `README.md:541-542`, E8). Two work items that need the implementer at once wait for each other at the lane, though their workers run side by side.
- **A report back.** A `write` with a model message reached the lane's next context at no cost (measured, E9). It needs a commit of its own: appending the review entry and then submitting in one commit throws (measured, E10). The judge caught one design on this.
- **A new place to fail.** A lane's run that fails on a model error holds every item that waits for a dispatch. No `afterRun` hook fires, so nothing reaches the inbox. You find the lane as failed in `conversations` and continue it.
- **A brief nobody approved.** The lane's brief steers the build. No decision covers it. A wrong brief fails review where the approved design speaks and passes where the design is silent.
- **A wrong belief is hard to see.** A wrong note is visible, because it is stored text. A wrong belief in the summary shows only in a brief or in code.

What a lane does not change: W1's chain of evidence. The worker's input carries the design's text from the entry, the build entry names the design and the SHA from Git, and no tool takes a SHA or a verdict from the lane.

## Four ways to get the benefit

| | A core primitive | A library helper | A lane that W1 builds alone | No lane: fresh workers and notes |
| --- | --- | --- | --- | --- |
| The rules | Fails four checks | Fails two checks | Nothing shared | Nothing shared |
| Where knowledge lives | The transcript and its summary | The same | The same, or a document | A document |
| Two items at once | One queue | One queue | One queue | No queue |
| Extra model requests per hand-over | One or more, at the lane's size | The same | The same | None |
| Fixing a wrong belief | Tell the lane, or replace it | The same | The same | Edit the notes |
| You can talk to the role in one place | Yes | Yes | Yes | No. You set an option, or tell one worker. |

## What to do first

**Notes, with no lane.** One candidate recommended this, and the judge asked that it be the baseline for any trial.

1. A workflow option holds your standing instructions for a role, such as `notes: str({ default: "" })`. You set it from any client, with no model run.
2. A document of the workflow holds what the role learned: for W1, the newest failed reviews of the project, which `publish_review` already writes.
3. The commit that submits to a worker adds the notes and those findings to the worker's input. Both are stored data, so a rerun sends the same input.

It adds no conversation, no task, and no model request. "Stop using the old serializer everywhere" is one `setOptions`.

**Then a lane, if a run shows it is worth it.** The smallest lane that a workflow builds alone:

- One ownerless conversation for the role, created with `role()` as a closed role, and one document that holds its ID, the notes, and the items that wait for a dispatch.
- A `dispatch` tool that reads the work item, stores the brief as an entry, submits the design's text and the brief to a worker, and ends the run. It declares `replay: "safe"`, `executionMode: "sequential"`, and `callers: ["model"]`. The build entry then names the brief, so the brief is in the chain even though nobody approved it.
- A report back as a `write`, from a task of its own.
- The notes rendered into each request through a section that checks who it is for, or supplied as the summary through `beforeCompact`.
- A fresh lane on your word: a new conversation, or a new context in the same one. The notes carry over, and the transcript does not.

Keep the lane only if a run of the same work items shows that its briefs do better than the notes alone. No such run exists.

## What would change the verdict

- **For the library:** a second call site, in another workflow or another role. The helper would then be "find or create the role's conversation" and no more.
- **For the core:** nothing in sight. A lane guards no boundary to the human.

## What every design missed

The judge ran one more check. Two work items that start from the same base branch cannot both be handed over with `git merge --ff-only`: after the first is merged, the second no longer fast-forwards. Each item's evidence stays valid, and the hand-over that W1 promises fails for the second. This is about two work items at once in one repository, with or without a lane, and W1 does not walk it yet.

## Not verified

- No lane ran against fresh workers with notes. That a lane hands work over better is untested, and so is the opposite.
- No real model wrote a summary. What a summary keeps of three work items is unknown.
- The rows of a lane in W1 are in the raw candidate files, on paper. The checks ran the moves they lean on, with a faux model.
