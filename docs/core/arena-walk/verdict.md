# Scores

Scores judge the paper walks, not their length. C1/C2/C3 mean directory numbers.

| Criterion | C1 | C2 | C3 |
|---|---:|---:|---:|
| The walk is real | 4 | 5 | 3 |
| Legal on pi-durable | 4 | 4 | 3 |
| Failure paths | 3 | 4 | 3 |
| Respects rulings and admission rule | 3 | 5 | 2 |
| Actionable findings | 4 | 4 | 3 |
| Candor and evidence | 4 | 5 | 4 |
| **Total / 30** | **22** | **27** | **18** |

Evidence, one line per scored cell:

- **C1, walk:** W1 9–22 follows design→implementation→review→handover; row 19 compresses the second pass, and conversation creation is partly outside the numbered walk.
- **C1, legality:** W1 10/13 correctly separates creation/configuration from submission; P4 confirms the ordering.
- **C1, failures:** U2 covers failed implementer/reviewer runs, but calls the missing designer handoff “ordinary chat”; U4 deletes an unregistered directory without proving ownership.
- **C1, rulings:** “`declare function role(spec: RoleSpec): AgentChange`” replaces the agreed settings type; Annotation receives five explicit passes and keeps dispositions in W1.
- **C1, findings:** W1 17's SHA-pinned reviewer tools and W2 7's immediate withdrawal are useful; F1's timestamp change does not replace operation receipts.
- **C1, candor:** “No workflow code ran” and memory-only probe limits are clear; U1 overstates faults as heard “only by onReport.”
- **C2, walk:** P−1–P19, G1–G3 and E1–E4 distinguish setup, application commits, Git effects and hook commits; provenance is explicit.
- **C2, legality:** M1/M4 correctly state admission ordering and request-ID semantics; Q2 omits the consequential background setting.
- **C2, failures:** X1–X6 durably cancel before physical stops; E1–E4 cover normal non-handoff, with failed/aborted-run coverage honestly excluded.
- **C2, rulings:** “`role(tx: Tx, settings: AgentChange, ownership: ConversationOwnership)`” uses the agreed settings; Annotation check 4 explicitly invokes the generic-client alternative.
- **C2, findings:** Q8/Q13 withdraw stale decisions and reject stale score tasks; P19 records repair-needed but leaves its recovery unspecified.
- **C2, candor:** “Measured here means source read, not execution”; “No probe” and hook-failure limitations are unambiguous.
- **C3, walk:** W1 1–24 names ownership and the evidence chain, but omits working model setup for its ownerless designer and compresses W2 scoring guards.
- **C3, legality:** Probe C establishes task-owned configuration; W1 2 incorrectly relies on an ownerless designer whose settings omit a model.
- **C3, failures:** The idle-abort/drop distinction is good; W1 11 treats a listed worktree path as sufficient proof, and reviewer HEAD equality does not prove reviewed file contents.
- **C3, rulings:** “Annotation fails as a primitive” followed by admission as a field, with its range “on probation,” bypasses the accepted rule.
- **C3, findings:** F11 correctly says “In one commit that order throws”; F3's expanded conflict response is convenience, not a demonstrated core necessity.
- **C3, candor:** “Probe check D closes the Harness, which is not a crash”; replay guards and Git are explicitly untested.

# Claims checked

Source prefix **D** = `/tmp/render-ground/pi/packages/durable`. These were read, not executed.

## C1

1. **Held:** no table read after a table write, and submission before the first table write: `D/src/session/transaction.ts:1140-1156`, `D/src/harness/submissions.ts:75-85`. Document-only `configure` is legal after creation: `D/src/harness/agent.ts:91-95`.
2. **Held:** ordinary conversation abort skips background tasks: `D/src/harness/scheduler.ts:668-691`; background is allowed only for conversation-owned tasks: `D/src/session/transaction.ts:476-489`.
3. **Held, with qualification:** repeated crashes can fault a custom driver at `restartLimit`: `D/src/harness/scheduler.ts:1944-1957`; committed progress clears the count at `:3143-3147`. But fault records remain readable through `getTask`, `D/src/harness/types.ts:921`; they are not merely callbacks.

## C2

1. **Held:** equal submission request IDs check type, not content: `D/src/harness/submissions.ts:231-239`. Freezing the payload is therefore important.
2. **Held:** `afterRun` tasks are generation-owned, hold the conversation busy, and exclude failures/aborts: `D/src/harness/types.ts:1018-1025`, `D/src/harness/generation.ts:367-388`.
3. **Held:** `Conversation.abort()` makes its own commit; it cannot be included in X2: `D/src/harness/scheduler.ts:673-691`.
4. **Missing setting:** Q2's overdue timer can run after reopening (`D/src/harness/scheduler.ts:553-562`), but `background` defaults to false (`D/src/session/transaction.ts:509`). Ordinary Stop would cancel these timers. C1/C3 address this; C2 does not.

## C3

1. **Partly held:** task-owned conversations copy the owner's stored agent, but ownerless ones start empty: `D/src/harness/agent.ts:204-215`. W1's `Cw` is ownerless and `Designer` specifies no model. As written, kickoff ends `no_model`: `D/src/harness/generation.ts:185-189,606-609`. Probe C tests inheritance, not this creation path.
2. **Held:** abort traverses live ordinary owned work, not decision documents: `D/src/harness/scheduler.ts:668-691`. Thus the idle-decision problem is real. It does not establish that every pending continuation has adequate cancellation cleanup.
3. **Held:** tool intent persists before execution; replay requires both stored and current policies to be safe: `D/src/harness/tool.ts:183-224`. The tool-result gap is real; replay safety alone does not supply the receipt guard.

# Probes rerun

Both ran from their own directories with `PI_MODULES=/tmp/pi-latest/node_modules/@earendil-works node probe.mjs`:

- C1: exit 0; P1–P5 printed success, ending `ok: probe P1-P5 passed`.
- C3: exit 0; `ok: checks A-F passed`. `TMPDIR` was set to the judge directory beforehand, keeping its SQLite files within the permitted write area.
- C2 has no probe.

Neither proves abrupt-crash recovery of Render's proposed Decision/Annotation records. C1 uses memory; C3's restart is a clean close/reopen.

# Disagreements and who is right

**Work structure and abort.** C2's ownerless control/role conversations and C3's bounded build task owning its worker conversations are both legal. Task ownership is useful cancellation structure, not automatically an unwanted hours-long `completing` state as C1's rationale suggests. C2 gives the clearest durable cancellation sequence. C1's universal background continuations and C3's universal foreground continuations are opposing policies, neither a substrate requirement. Foreground tasks can lose already-accepted work to Stop; background tasks need explicit cancellation. All correctly distinguish idle decisions from running tasks.

**Worst crash.** C2 chooses the strongest case: Git committed, build evidence absent. Database replay cannot decide whether that external result belongs to this work. C3 adds the important tool-write/result gap. C1's long-wait restart problem is real, but duration alone does not make it worst. C2's refusal to delete mismatching worktrees is safer than C1/C3's reconciliation shortcuts.

**Provenance.** C1's pinned Git-object tools are strongest. C2 explicitly reviews `git show SHA`. C3's HEAD check does not exclude dirty files read through `read`.

**Annotation.** All choose an answer-attached list and defer draft syncing, appropriately. C1's decision/index IDs and inherited attribution are smaller than C2's client IDs and repeated device/time fields. C2's string-target approach avoids making Markdown a core artifact format. Checks 1/2/3/5 can pass for neutral storage; check 4 rests on the workflow-blind client's required commenting behavior, not W2. C3 cannot mark that requirement insufficient, then admit the same range under a different label. A second write function alone would not fail check 5 either. C1 also offers an `annotate` opt-in; C2/C3 need to explain what happens to annotations accepted with final approval, when no revision follows.

**Roles and library entry.** C2 best respects `AgentChange` without another settings schema. Its concrete repeated callers and direct verification are a useful lighter admission rule. C1's blanket ban on store access excludes C2's legitimate helper without showing a failure; C3's hypothetical second user is weaker evidence than actual reuse.

# Best base and what to port

**Use C2**, repairing its timer flags and unresolved recovery paths before treating it as executable guidance.

- From **C1**: port SHA-pinned reviewer tools and the background-timer/Stop check.
- From **C3**: port the tool-commit/result-gap analysis and explicit correction of `primitives.md`'s illegal append→request→submit order.

Do not port C3's Annotation admission workaround or C1's timestamp-only retry fix.

# What every candidate missed

1. **An answered decision can become a permanent dead end.** Its continuation throws or exhausts restarts; the scheduler durably faults it (`D/src/harness/scheduler.ts:2428-2440`). Retrying `answer` returns that same dead task. C1 adds a fault event, C2 acknowledges explicit recovery, C3 shows continuation status—but none walks the durable recovery action and its duplicate protection. Seeing failure is not being able to continue after reconnecting. This is the most serious shared gap.
2. **Publishing is not necessarily the end of a run.** Tools run in parallel by default (`D/src/harness/agent.ts:81`). A round terminates only if *every* call requests termination (`D/src/harness/generation.ts:1094-1097`). A handoff beside `bash` can publish evidence while another call still changes files; C2 can start review immediately. None walks this ordinary multi-tool case or establishes how publication and remaining work interact.
