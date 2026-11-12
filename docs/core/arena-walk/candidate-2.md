# W1, one commit at a time.

This is a proposed walk, not implemented behavior. P and Q have separate stores, registries, and harnesses. IDs below are local to their store; client calls also name the project. Reconnect reads a fresh inbox, decision documents, basis entries, and timeline—not a watch replay.

**Source key.** Paths beginning `D/` mean `/tmp/render-ground/pi/packages/durable/`. “Measured” here means source read, not execution. Applicability of this supplied 1.5.1 source to 1.5.2 is **reported** by the brief; I did not compare distributions.

- **M1, measured:** table reads fail after table writes; document access has a separate path (`D/src/session/transaction.ts:611-636,1140-1156`). Admission must precede even another admission (`D/src/harness/submissions.ts:75-85`).
- **M2, measured:** storage batches are atomic, commits serialized; storage rejection can mean unknown outcome (`D/src/types.ts:1320-1343`). Entries are immutable; payloads are application-defined (`D/src/types.ts:459-489`).
- **M3, measured:** task creation needs a conversation and uses the installed definition (`D/src/session/transaction.ts:476-512`). Task commits can replace checkpoint and state atomically (`D/src/types.ts:284-299`).
- **M4, measured:** reused submission request IDs compare type, **not content** (`D/src/harness/submissions.ts:231-239`).
- **M5, measured:** tool intent commits before execution; recovery reruns only when both replay policies say safe (`D/src/harness/tool.ts:183-226`).
- **M6, measured:** `afterRun` tasks are generation-owned, created once after an answer; not after failure/abort (`D/src/harness/types.ts:1018-1044`; `D/src/harness/generation.ts:367-388`).
- **M7, measured:** sleep stores an absolute deadline; overdue tasks count as runnable (`D/src/types.ts:357-362`; `D/src/harness/scheduler.ts:553-562`).

**Conversations.** `C` is ownerless, code-only control: no model, tools, or submissions. `D` is ownerless designer, model A, tools `read`, `bash`, `w1.publish_design`. `I` is ownerless implementer, model A, tools `read/write/edit/bash`, `w1.publish_build`; its cwd is the worktree. `R` is ownerless reviewer, model B, tools `read`, `bash`, `w1.review`. Each selects explicit extensions. `L` is ownerless event log: no model, tools, or submissions. W1 owns their association in its `Work` document; ownerless means cancellation must visit them explicitly. All answer-continuation tasks belong to C's conversation, not the agent tool that requested them. A1/A2 share subject `w1:k:design`; J1 uses `w1:k:merge`. These labels denote returned DecisionIds, not caller-selected IDs.

**Reading the rows.** Arrows give write order, after all stated reads. `Work` holds stage, turn, accepted design, candidate SHA, conversation IDs, and operation receipts. Each publishing tool declares `replay:"safe"`, first checks its receipt keyed by tool-task ID, then its expected stage/turn. Handoff receipts also name the originating input/run so an old turn's completion cannot satisfy a new turn. Receipt, output IDs, and state change commit together. Repetition returns the saved result, even after its decision was answered. Tasks change checkpoint or terminate in the same commit (M3). Thus **inferred from M2–M5:** uncommitted rows retry; committed rows return receipts or resume at their next phase. Times and submission payloads are saved, never regenerated under an existing key (M4). Requests/events take `api.now()` or `runtime.now()` from their caller, not a Tx clock (**measured**, `D/src/harness/types.ts:263-264`; `D/src/types.ts:342-343`).

The table lists application commits. Pi's model/progress commits are not one application transaction (**measured**, separate progress commits at `D/src/harness/generation.ts:690-695`). For every publishing tool, M5 also places a separate intent commit **before** its row and a result commit **after** it; on replay the tool returns its saved output before Pi writes the result (**measured** result boundary, `D/src/harness/tool.ts:828-872`). No external Git operation is smuggled into a database commit.

| Commit; starter | Reads; ordered writes; recovery beyond the common rule |
|---|---|
| P−1; project wiring | Read setup receipt; create ownerless C → configure no tools/model → create installed `w1.bootstrap` task in C → save receipt. No submission. |
| P0; W1 bootstrap task from project wiring | Read bootstrap receipt. `role()` creates D → Work ready → `emit` ready → terminal. C already exists. This is explicit setup, not a new lifecycle hook. |
| P1; client input | Read admission state. D.`submit(tx,{content:"Add a --json flag to the export command.",requestId:clientKey})`. Save immutable input; request-ID retry returns submission (M4). |
| P2; `w1.publish_design` tool | Read Work and source input. Append V1 with full `data.text` → Work V1 and receipt → `request(A1,basis:V1,choices:approve/revise/abort,then:w1.design_answer,conversation:C)` → `emit` review-ready. |
| P3; owner answers A1 | Host reads A1, V1, task registry. `answer(A1,{basis:V1,choice:revise,annotations:[a,b]})` writes answer/device/time → creates continuation T1 in C → stores T1 and clears open slot. a selects output format: “Use NDJSON, not one array.” b selects errors: “What happens on a partial write?” |
| P4; T1 | Read A1, Work, V1. Set next designer turn → D.`submit(tx,...,requestId:A1)` with fixed revision input → save receipt → `emit` revision-started → terminal. **Submission precedes event.** |
| P5; designer publishing tool | Read A1's annotations and Work. Append V2: one NDJSON record per line; write failure means nonzero exit/stderr, prior lines remain, last line may be partial. Include dispositions for a and b → Work/receipt → `request(A2,basis:V2,...)` → `emit`. Reject missing disposition IDs. |
| P6; stale phone | `answer(A1,{basis:V1,choice:approve})` reads answered A1. Returns **conflict**, not `not_open`: A1 already says revise. No writes; current A2 can be fetched. Never retarget to A2. |
| P7; laptop | `answer(A2,{basis:V2,choice:approve})`: same ordered writes as P3; continuation T2. A disconnected retry with identical fields returns T2, first device preserved; changed fields conflict. Unknown storage outcome requires reopening/retrying, not guessing success (M2). |
| P8; T2 | Read A2, V2, Work; inspect Git base outside callback. Save acceptedDesign=V2, acceptedDecision=A2 plus deterministic path/branch/base intent → create `w1.prepare` in C → `emit` → terminal. |
| P9; prepare phase | Outside commit, ensure worktree from P8. Then read Work; create I with `role()` and cwd → store I/receipt → checkpoint `submit`. Existing matching Git worktree is success; mismatching repo/base/branch stops, never deletes it. |
| P10; prepare submit phase | Read Work. I.`submit(tx,build(V2),requestId:A2)` → Work building → `emit` → terminal. Cannot combine with P9: creating a conversation is a table write (M1). |
| G1; implementer shell | External **Git commit S1**. Read worktree/index; write Git objects/ref. Not a Render commit. An interrupted unsafe shell is uncertain, not automatically safe to repeat (M5). |
| P11; `w1.publish_build` | Inspect branch/S1 outside callback; read Work and approved V2 inside. Append B1 `{design:V2,sha:S1,branch,checks}` → create R using `role()` → save receipt/candidate → create `w1.review_start` in C → `emit`. |
| P12; review-start task | Read B1, Work. R.`submit(tx,review(S1),requestId:B1)` → Work reviewing → `emit` → terminal. Reviewer inspects `git show S1`, not an unpinned moving working tree. |
| P13; `w1.review` finds problem | Read Work, B1. Append R1 `{sha:S1,verdict:fail,findings:["write failure exits zero"]}` → create `w1.fix_start` in C → Work/receipt → `emit`. |
| P14; fix-start task | Read R1, B1, Work. I.`submit(tx,fix(V2,R1),requestId:R1)` → Work fixing → `emit` → terminal. |
| G2; implementer shell | External Git commit S2, fixing R1. Same uncertainty rule as G1. |
| P15; publishing tool | Inspect S2; read Work, R1. Append B2 `{design:V2,sha:S2,fixes:R1,checks:"failing writer now exits nonzero"}` → Work/receipt → create review-start task → `emit`. |
| P16; review-start task | Read B2, Work. R.`submit(tx,review(S2),requestId:B2)` → Work reviewing → `emit` → terminal. |
| P17; reviewer passes | Read Work, B2, V2; require B2.design=acceptedDesign. Append R2 `{sha:S2,verdict:pass}` → append M `{design:V2,sha:S2,build:B2,review:R2,branch}` → Work/receipt → `request(J1,basis:M,choices:approve/abort,then:w1.handoff,conversation:C)` → `emit`. |
| P18; final owner approval | Read J1, M, registry. `answer` records approval → creates H in C → saves H/clears slot. No merge. |
| P19; H | Read branch ref outside callback; read Work, J1, M, R2 inside. Require M.design=acceptedDesign, R2 verdict pass, R2.sha=M.sha=current candidate=observed ref=S2. Save handed-off receipt → `emit` branch **and exact S2** → terminal. Mismatch stops handoff and records repair-needed, never silently approves new HEAD. |
| G3; owner | Human merges S2. No Render write is assumed; timeline says “handed over,” not “merged.” Repeating H never merges. |

**Worst crash:** after G1, before P11. Git changed but the store has no build evidence; database atomicity cannot restore that link. On reconnect inspect P8's named worktree and Git history. If S1 is present and matches this work, publish it; do not blindly repeat `git commit`. If identity is uncertain, stop for repair. A repeated worktree creation between P8/P9 similarly reconciles actual Git state. An answer/continuation crash is less bad: those writes share one commit.

**Run ending without handoff.** For each completed D/I/R run, these additional commit entries apply (M6):

| Commit; starter | Reads; ordered writes; rerun |
|---|---|
| E1; generation | Commit final answer/settle inputs; checkpoint finish. Durable answer survives before hook runs. |
| E2; `afterRun` hook | Hook reads turn identity and returns `runEndTask(w1.ensure_handoff,turn)`. Pi creates checker child and waits. Before creation, hook may repeat; after creation it does not (M6). |
| E3; checker task | Read Work, turn receipt, final answer. If handed off, terminal only. Otherwise append repair basis → request retry/abort decision owned by C → Work stopped → `emit` → terminal. Retry continuation resubmits a new, recorded turn; it cannot treat prose as handoff. |
| E4; generation | After checker terminal, end run. Repair continuation queues behind this boundary if it arrives early. |

**Abort while open:** every W1 decision offers abort, including J1; every continuation routes that choice to cancellation, before doing normal work.

| Commit; starter | Reads; ordered writes; rerun |
|---|---|
| X1; owner | `answer(openID,{basis,choice:abort})` reads current decision; writes answer → continuation in C → open-slot/continuation updates. Retry returns same task. |
| X2; cancellation continuation | Read Work and outstanding concerns. Mark cancelled → `withdraw` all work subjects → append explanations for outstanding concerns → create `w1.stop` in C → `emit` → terminal. No late tool/task may mutate cancelled Work; existing receipts remain readable. |
| X3; stop phase | D.`abort()` reads live scope; commits queued-input withdrawal/abort marks. Repetition is harmless. |
| X4; stop phase | Same, for I. |
| X5; stop phase | Same, for R. |
| X6; stop completion | After aborted tasks settle, read cancellation state → save cleanup receipt → terminal. Crash before X6 repeats stops, not work. |

Physical stop commits are not atomic with X2: **measured**, public `Tx` has no abort operation, while `Conversation.abort()` owns its own commit (`D/src/types.ts:989-1088`; `D/src/harness/scheduler.ts:668-691`). Pi writes individual aborted-task outcomes separately. Generic “stop this agent” is not “cancel this work.”

# W2, one commit at a time.

Q has ownerless conversation `F`, forecasting model, only `w2.record_forecast`, `w2.revise_forecast`, `w2.calibration`; no coding tools. Tasks belong to F. Its log LQ is ownerless and never submitted to. A workflow document holds latest entry, active timer, open round, resolved state, and operation receipts. Same read-before-write and retry rules apply. F1 and F2 are revisions of one forecast key and share subject `w2:k:resolve`.

| Commit; starter | Reads; ordered writes; rerun |
|---|---|
| Q0; project wiring | Create F → `configure` explicit agent/tools → save setup receipt. W2 deliberately skips `role()`. |
| Q1; client | F.`submit` owner's pi-durable 2.0-before-March claim, with client request ID. |
| Q2; record tool | Read receipt/current forecast. Append F1: stable npm 2.0.0 published before upcoming March 1 00:00Z, agent-estimated p=.70, cutoff t1 → create due task U1 with absolute t1 → document latest=F1/timer=U1 → `emit(w2.recorded,{forecast:F1,p:.70,...})`. The estimate is attributed to the agent, not invented owner confidence. |
| Q3; U1 sleep phase | Read saved deadline. Commit sleeping until t1, next phase ask (M7). No model. Stop server for a week; t1 passes without any commit. |
| Q4; restart, U1 ask | Host opens Q and resumes scheduling. Read document and F1; require latest=F1, active timer=U1, unresolved. `request(D1,basis:F1,choices:yes/no/void/"not yet",then:w2.score,conversation:F)` → save round → `emit` due → U1 terminal. Overdue sleep is runnable (M7), not restarted as “one week from now.” |
| Q5; human | `answer(D1,basis:F1,choice:"not yet")` → record/device/time → score task Z1 → continuation/open-slot updates. Identical retry returns Z1. |
| Q6; Z1 | Read D1 and forecast document. If still current/unresolved: create U1b with deadline D1.at+7 days → save timer and handled D1 → `emit` deferred → terminal. Never derive delay anew on restart. |
| Q7; client | F.`submit` revision with new request ID. |
| Q8; revision tool | Read latest/receipt. Append F2, new cutoff t2 later than U1b's deadline, and p=.60 → `withdraw` forecast subject now → create U2 → document latest=F2/timer=U2 → `emit(w2.revised,{from:F1,to:F2,...})`. Preserve F1; do not rewrite its pre-result probability. |
| Q9; U2 sleep phase | Commit sleep until absolute t2. U1b still sleeps; no need to cancel it. |
| Q10; U1b wakes | Read latest=F2, timer=U2. Commit terminal only. **No request, event, or model.** |
| Q11; U2 wakes | Read F2/document, require matching active timer and unresolved state. `request(D2,basis:F2,...)` → save round → `emit` due → terminal. |
| Q12; human yes | `answer(D2,basis:F2,choice:yes)` atomically records answer and creates Z2. |
| Q13; Z2 | Read D2, F2, document. Require current round, unscored F2. Compute (.60−1)²=.16 → mark resolved/handled D2 → `emit(w2.resolved,{forecast:F2,decision:D2,p:.60,outcome:1,score:.16,text,at})` → terminal. A stale score task ends without scoring. |
| Q14; client report input | F.`submit` calibration request with fresh request ID. |
| Q15; calibration tool | Read public log pointer, upper entry ID; scan all pages through that bound for recorded/revised/resolved events. Compute report; return tool output. No application writes. Show one scored forecast, .16, and one superseded forecast—not two scored forecasts or silently hidden attrition. |

“Not yet” defers observation, not F1's truth cutoff. F2 is a prospective replacement, not permission to edit F1 after learning its outcome. Workflow code owns these rules. At Q8 any still-open old decision is withdrawn immediately; waiting until F2's timer wakes is unsafe.

# `role()` on paper.

Proposed standard-library shape:

`role(tx: Tx, settings: AgentChange, ownership: ConversationOwnership): Promise<ConversationId>`

Inside the caller's commit: `tx.createConversation({ownership})`, then `configure(tx,id,settings)`, return ID. **Measured:** these are real parts; configure writes `pi.agent` (`D/src/types.ts:1015-1016`; `D/src/harness/agent.ts:91-95`). W1 saves the ID in its existing receipt, rather than adding a second role registry.

W1's three settings, each passed as `role(tx, settings, {kind:"ownerless"})`:

```ts
designer: AgentChange = {model:A, extensions:[CodingTools,W1],
  tools:[read,bash,publishDesign], instructions:designProse};
implementer: AgentChange = {model:A, extensions:[CodingTools,W1],
  tools:[read,write,edit,bash,publishBuild], cwd:worktree, instructions:implementProse};
reviewer: AgentChange = {model:B, extensions:[CodingTools,W1],
  tools:[read,bash,review], instructions:reviewProse};
```

**Measured:** AgentChange accepts these fields and replacement lists (`D/src/harness/types.ts:498-517`); CodingTools supplies those four tools (`D/src/tools/index.ts:27-35`). W1 owns B≠A, prose, receipts, permissions, submissions, cancellation, worktrees, and task routing. The helper submits nothing: its creation already prevents admission in that commit (M1). Tool selection is not shell confinement.

Library admission: a repeated concrete author need, an existing primitive-based solution, a smaller caller contract, direct verification, and no workflow policy. One workflow's three callers suffice; no human-boundary or two-unlike-workflows test. Keep `prose()` and `role()` in one optional library; core imports neither. W2 uses `prose()`, not `role()`.

# Annotation through the rule.

Scope: concerns saved **with a decision answer**, not an independent review draft service.

1. **Pass, real failure:** P3's two located concerns cannot be reliably mapped back from an undifferentiated notes string.
2. **Pass, substrate lacks it:** M2 supplies arbitrary payload storage, not attributable human annotations or an answer contract.
3. **Pass, extension falls short:** tried W1-encoded JSON in notes. W1 can decode it; an unaware phone cannot place/display concerns consistently. Human attribution belongs to host answer handling.
4. **Pass, generic client:** even if W2 never annotates, a workflow-blind client needs one concern format. This uses the rule's client alternative, not two fictional users.
5. **Pass, small neutral shape:** data added to Decision/answer; no scheduler, role, thread, or disposition policy.

Smallest shape: answered Decision adds `annotations: readonly Annotation[]`, default `[]`. Each has client-stable `id`, `text`, optional `target:{path,start,end,quote}`, and server-stamped `by,at`. Basis is inherited from Decision. `path` is a JSON pointer to a string in the immutable basis entry; offsets count Unicode code points in that raw string. Omitted target means whole basis. P3 uses `/data/text`.

`answer` adds annotation drafts without `by,at`. Before any writes it validates unique IDs, string targets, bounds, and quote against its quoted basis. Invalid annotation refuses the whole answer. Retry equality includes ordered IDs/text/targets, excluding server stamps; equal retry preserves original attribution. Existing basis/choice/notes rules stay. `request`/`withdraw` do not change and remain document-only.

Client reads the exact basis entry by ID in the authenticated project. It displays string fields as selectable plain text (W1's full document is `data.text`), with JSON fallback for unknown kinds. Anchors use source text, not rendered Markdown offsets. This needs no new core artifact type. Rich rendered selection is later client work.

Notes only is smaller but loses placement and separate dispositions. A structured answer list is the chosen minimum: one human call, one atomic save. Pre-answer annotation entries would permit reconnecting unfinished review, but require another authenticated write, retry rules, and freezing the set used by an answer. Reject that scope now. Unsent draft review remains device-local; submitted annotations move with the answer.

“Every annotation answered” is W1 code: P5 requires dispositions naming all concerns from A1 and stores explanations in V2; request A2 cannot bypass it. Recovery preserves outstanding IDs. Cancellation records why each outstanding concern was not pursued. Core checks storage/identity only, never whether a reply genuinely settles the human concern.

# What fell short.

1. **P2/P5: request is not general retry protection.** `primitives.md` is wrong to say equal open drafts alone make a repeated phase safe. A new basis/time differs; an already-answered request opens anew. Smallest fix: workflow operation receipts; freeze IDs/time/payload. No core idempotency service.
2. **P9/P10: role creation cannot include submission.** Docs leave role mechanics silent. Split commits, checkpoint the ID, use `configure` in `role()`. Standard library plus workflow.
3. **P11/G1: outside effects have no atomic receipt.** Intent, deterministic worktree identity, Git inspection, explicit repair on ambiguity. Workflow; no exactly-once claim.
4. **E1–E4: normal completion is not handoff.** Use afterRun checker, stage guards, recovery decision. Workflow. M6 excludes failed/aborted runs; those stay visibly failed and require explicit recovery, not claimed automatic handoff.
5. **Cancellation: agent abort does not cancel work or withdraw decisions.** Add abort choice and durable cancellation/cleanup task; workflow. Distinguish stop from cancel in clients. Do not invent an abort-in-Tx API.
6. **P3: annotations are missing.** Add the answer list above. Core, only after owner admission.
   Checks 1–2: located concerns fail today; generic substrate storage supplies no contract.
   Checks 3–4: notes encoding fails unaware devices; the generic client needs the same record.
   Check 5: one neutral record/answer extension; dispositions stay workflow-owned.
7. **P3/Q15: arbitrary entry payload is not a display format.** Use selectable raw string fields/JSON fallback; W1 supplies full text, not a mutable file path. Client convention over host wiring that returns existing EntryRecord, no new view schema.
   Checks 1–2: unaware client cannot render unknown data; M2 has no display contract.
   Checks 3–4: private renderers fail the unaware-client requirement.
   Check 5: expose existing entries; no workflow-specific view type.
8. **Q15: Event has no discovery contract.** Export the existing session log-pointer document token; `emit` creates L lazily and stores its ID atomically. Core interface completion, not a service registry.
   Checks 1–2: calibration cannot find events; substrate has no Render-log designation.
   Checks 3–4: private workflow pointers break one shared log; client and W2 need it.
   Check 5: one pointer/read contract, no loop or reactor.
9. **Q8/Q13: `workflows.md` is wrong to defer supersession until next request.** Withdraw on revision; score tasks recheck current round/unresolved state. `not yet` needs an explicit absolute reschedule rule. Workflow. Report superseded forecasts to expose selection bias.
10. **P19: approval does not pin a moving branch.** Recheck before handoff, identify exact SHA for human merge. Workflow; same-account shells remain the accepted security limit, not enforced merge protection.
11. **Setup/reconnect: explicit selections and startup remain underspecified.** Selection alone does not start a task. Outer project composition explicitly seeds bootstrap with an ordinary harness commit; do not add a lifecycle callback or make core recognize `w1.bootstrap`. Wiring pins tool/extension lists, locks each store, resumes Q after downtime. Host wiring, no lifecycle framework. Accepted limits remain power loss, upgrades with open decisions, unfinished cross-device review, and deferred shared knowledge.

# Not verified.

No probe, Render implementation, Git mutation, or source execution. Source reading establishes interfaces, not end-to-end correctness. Not tested: SQLite kill during answer, the real Decision family/open index, concurrent answer/annotation validation, hook failure recovery, worktree reconciliation, Unicode client selection, timer races, pi-env, or dependency changes in 1.5.2. Normal-run checker coverage must not be reported as failure-run coverage. Power-loss durability is an accepted limit (**measured documentation**, `D/README.md:869`), not something this walk repaired.
