# Client → protocol requirements

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **File names** in code spans: `visual-language.md`, `grammar.md` and `stack.md` are in [`reference/`](reference/); `layout.md` and `text-mocks.md` are in [`wireframes/`](wireframes/).
> - **Measured, proposed and pending** claims are separated in [`evidence.md`](evidence.md).


What the client's screens need from the host, written against the accepted server spec (`docs/spec.md` on `main` at `768f43c`; `S§… L…` cites it). The spec's wire shapes are "illustrative proposed wire shapes", so shapes below are illustrative too. Names follow the spec: **Kernel** (pure transitions), **Ledger** (accepts commands, serves views), **Engine** (scheduling, packets, Durable tasks).

**Evidence.** A scripted fake host produced every screen state out of wire data, and a second wire dialect changed only files inside the client adapter (measured; [`evidence.md`](evidence.md) §1.1).

## 1. Client architecture and the adapter boundary

```
 wire (unsettled) ──► HostAdapter ──Inbound──► [queue] ──frame boundary──► reduce(state, msg) ──► ClientState ──► layout ──► paint
                         ▲                                                                              │
                         └──── Outbound ◄── envelope(cmd, pin) ◄── keys (immediate, against last painted frame)
                                     local store (device only): drafts, marks, jumplist, read bases, last-seen, outbox
```

- **HostAdapter** is the only code that knows wire shapes. **Measured:** switching dialects touched only `adapter/` (9 files).
- **Host messages are queued and applied at frame boundaries; keys are handled immediately against the last painted frame.** This rule keeps target pinning exact (FC-T15).
- **reduce** is pure: `(ClientState, Inbound | LocalEvent) → ClientState`. **Measured:** in conformance replay (28/28 assertions) and live over the event stream, the client's state equalled a fresh snapshot.
- **layout** is the client's own block renderer on GPUI's text system (`stack.md` §3). It implements the reading rules (`visual-language.md` §4) and exposes line breaks and element boxes; the reading checks run on that output.
- **The local store** holds device-only state that snapshots never overwrite. **Measured:** drafts, marks and an unknown-outcome entry survive a restart and a resnapshot.

### 1.1 Position on the change model

The fake host used a generic path-level `set/remove/insert` vocabulary. It made "snapshot + updates = fresh snapshot" testable, but the client has to apply untyped patches.

**Recommendation: resource-granular typed upserts.**
- Each update frame carries `changes: [{kind, id, revision, value} | {kind, id, removed: true}]`, plus `facts: [{id, summary, refs}]` naming why the change happened (RQ-28).
- The reducer replaces whole resources by kind, so values are typed after decoding and idempotent by revision.
- The vocabulary stays small: one entry per resource kind, not one per Kernel transition.
- Facts carry the narrative.
- Large resources stream separately: conversation deltas by byte offset, artifacts by digest and range.

Rejected alternatives:
- **Per-transition event types** couple every client to Kernel's internal transitions.
- **Path patches** leave the client applying untyped JSON.

### 1.2 Adapter interface (illustrative)

```rust
trait HostAdapter {
    fn connect(&mut self, device: &DeviceCredential, client: &ClientInfo) -> Result<(), ConnectError>; // ClientInfo: version, kinds (RQ-20)
    fn subscribe(&mut self, scope: Scope);          // Attention, Agents, Slices (explorer only), Workflow(id), Conversation(id); one multiplexed stream when the host offers it (RQ-43)
    fn send(&mut self, cmd: Outbound);              // result arrives later as Inbound
    fn query_receipt(&mut self, id: &CommandId);    // never executes (RQ-08, RQ-36)
    fn fetch(&mut self, req: Fetch);                // artifact bytes by digest/range, message pages, facts since seq
    fn poll(&mut self) -> Option<Inbound>;
}

enum Inbound {
    Snapshot { scope: Scope, authority_epoch: Epoch, ledger_seq: u64, scope_seq: u64, host_time: Time,
               host: HostStatus, state: ScopeState },          // HostStatus: hostMode + backup block (RQ-18)
    Update   { scope: Scope, authority_epoch: Epoch, ledger_seq: u64, scope_seq: u64, prev_scope_seq: u64, host_time: Time,
               changes: Vec<Change>, facts: Vec<FactSummary> },
    Delta    { conversation: Id, message: Id, offset: u64, text: String },   // UTF-8 byte offset; outside the scope sequence
    Receipt  { command: CommandId, status: ReceiptStatus, ledger_seq: Option<u64>, result: Value },
    StaleBasis { command: CommandId, sent: Basis, current: Basis, changes: Vec<BasisChange>, actions: Vec<Action> },
    Fetched  { req: Fetch, page: Page },
    Unknown  { command: CommandId },                // adapter-generated on timeout or reset, never from the host
    Revoked  { at: Time },
    CredentialRefused { reason: Revoked | RestoredHost },   // after a restore every backed-up bearer is refused (spec §5.3.1)
    Disconnected { reason: String },
}
```

**Authority epochs.** Every frame and every command envelope carries `authorityEpoch`. Within one epoch the client discards repeated or older sequences (FC-W01). A frame with a **new** epoch means the host was restored. The client then:
- discards all cached sequence comparisons, pins, open readbacks and pending mutation authority;
- resnapshots every scope;
- moves every outbox entry to `unknown_after_restore`, with retry disabled (FC-L12);
- shows the host's recovery state.

It never rejects the restored snapshot as numerically older (FC-W12). An ordinary host restart keeps the epoch and changes nothing here.

There is **no resume cursor in v1**. Every connect and reconnect starts from a fresh snapshot, and "what changed while I was away" comes from facts since a ledger sequence (RQ-17). This is the simplest option that E-HOST showed to be sufficient (gaps §3.14).

## 2. Client view model

```rust
struct ClientState {
    conn: Connection,                    // live | connecting | offline{since} | revoked{at} | repair_required{reason}; host name, version, capabilities
    host: HostStatus,                    // authority_epoch, host_mode: active|admission-disabled|recovery-reconciling|blocked,
                                         // backup {target_exposed_s, cutoff_seq, cutoff_at, verified_at, health, restore_status} (RQ-18, spec §5.3.1)
    scopes: Map<Scope, ScopeCursor>,     // keyed within one authority_epoch: ledger_seq (shown), scope_seq (gap detection), host_time, received_at
    attention: AttentionIndex,           // RQ-01 rows + RQ-27 proposal summaries
    agents: AgentIndex,                  // RQ-33
    slices: Option<SliceIndex>,          // RQ-41, only while the explorer is open
    workflows: Map<Id, WorkflowView>,
    conversations: Map<Id, ConversationView>,
    references: Map<Scope, ReferenceIndex>, // RQ-42: {label, kind, target|null, state, reason?} per workflow scope
    artifacts: Cache<Digest, Bytes>,     // immutable, so cacheable forever; diagrams render in the client (stack.md §5)
    outbox: Vec<OutboxEntry>,            // commandId, authority_epoch, envelope bytes, sent_at,
                                         // state: sending|unknown|accepted|refused|stale|conflict|not_found|unknown_after_restore
    unsupported: Vec<UnsupportedNote>,
}

struct WorkflowView {                    // a design workflow, a proposal or a slice
    id, kind, path: Vec<Ref>, title, phase, phases: Vec<Phase>,             // RQ-25, RQ-27
    handover: Handover,                  // RQ-03, with advisory items (RQ-38)
    next: Option<NextAction>,            // RQ-04
    decidables: Vec<Decidable>,          // RQ-05/06: every authority command has one
    decisions: Vec<Decision>,            // RQ-29
    checkpoints: Vec<CheckpointView>,    // RQ-11
    annotations: AnnotationSet,          // RQ-13
    change_requests: Vec<ChangeRequest>, // RQ-34
    experiments: Vec<Experiment>,        // RQ-31
    evidence: EvidenceView,              // RQ-14
    assignments: Vec<AssignmentView>,    // RQ-15
    operations: Vec<OperationView>,      // RQ-16
    blockages: Vec<Blockage>,            // RQ-12, RQ-35
    approvals: Vec<Approval>,            // RQ-47: decidedBy human or delegated machine actor
    settings: CheckpointSettings,        // RQ-47: routing per stage, current revision, history
    policy: PolicyView,                  // RQ-47: revisions, default, this workflow's binding, review count and limit
    passes: Vec<Pass>,                   // RQ-44: per Slice or Record work
    readiness: Readiness,                // RQ-26: per proposal, four separate views
    package: Option<MergePackage>,       // RQ-49: fetched when opened
    local_prompts: Vec<LocalPrompt>,     // RQ-45
}

struct Decidable { target: Ref, basis: Basis, actions: Vec<Action> }
struct Basis { digest: Digest, fields: Vec<BasisField> }
struct BasisField { name, reference: Ref, revision: Option<u32>, digest: Option<Digest>, label, changed_at: SeqTime, changed_by: Option<Principal> }
struct Action { command_type, option: Option<u32>, recommended: bool, available: bool, reason: Option<String>, effect: String, not: Vec<String>, carries: Option<String> }
```

Device-local, never from the host:
- drafts (annotation, prompt, decision note, edit buffer) with their base refs;
- **read bases** per open view (`grammar.md` §13);
- marks, the jumplist, last-seen ledger sequence per object, layout, and the outbox.

## 3. Requirements

Status against the accepted spec: **provided** (the spec names the field or behaviour), **partial** (the concept is there; the shape is the client's ask) or **ask** (the spec doesn't cover it; it leaves such detail to implementation, S§5.2.1 L349). "Fake host" means the scripted host emitted the field and a screen used it.

| ID | Requirement | Forced by | Status |
|---|---|---|---|
| RQ-01 | **Attention index** subscription across all projects.<br>• One row per open item: needs-you, waiting, running, plus items done in the last 24 h.<br>• Each row has the host object IDs, wait class, `since`, `downstream`, a handover summary and the workflow's ledger seq.<br>• Proposal summaries come with it (RQ-27, RQ-26).<br>Not every slice detail: that is the workflow scope.<br>• Slot occupancy comes as its own field, `slots {used, total}`, separate from the running rows. The client prints both (`RUNNING · 2 · slots 4/4`), because a cancel-requested assignment or an effect can hold a slot (FC-M36).<br>• The client groups `waitClass: operator` rows as ON THE HOST, apart from NEEDS YOU (FC-M35). No wire change. | SC-02, FC-R01, FC-W07 | ask |
| RQ-02 | **Scoped sequence**: each subscription's updates carry `scope_seq` and `prev_scope_seq` for gap detection; coalesced snapshots are marked. The user-facing number is the ledger seq (RQ-37). | SC-10g, FC-W01/02/06 | provided (S§5.2.1 L351) |
| RQ-03 | **Handover facts as structured fields** per workflow and slice:<br>• commitment `{kind, ref, revision, digest, acceptedAt, by, obligations}`<br>• owner `{assignment \| human \| none, waitClass}`<br>• evidence `{kind, verdict, sourceDigest, currentHead}`<br>• blocker, next, advisory (RQ-38) | strip, SC-02, FC-R02, FC-M10 | provided (S§5.2 L323; shape partial) |
| RQ-04 | **Structured next human action**: `{actionKind, target, commandTypes[], basisRef, since, why}`. `actionKind: mergeMain` carries the package as `target` and the PR's `url`; it has no authority command, because the merge happens on the forge. | NEXT cell, SC-19, FC-R05, FC-M51, FC-M58 | provided (`nextHumanAction`, S§5.3 L467); `mergeMain` is an ask |
| RQ-05 | **Host-computed decision basis** for every decidable object: a digest plus labelled fields. **Every authority command** needs one, including `cancelWork`; the client never derives a basis. The basis for approve includes the checkpoint request with its captured settings revision and mode, the artifact and manifest, the annotation-set revision, explicit decisions, the intake digest where applicable, and the policy and workflow-policy-binding revisions. **It never includes the current dial:** changing checkpoint settings alone stales nothing (S§5.3 L473). The client renders whatever fields arrive, known or not (FC-M33). | SC-09, FC-M01, FC-M38, FC-W08 | provided (S§5.2.1 L351, S§5.3 L400) |
| RQ-06 | **Permitted actions per object**, unavailable ones included, each with:<br>• a host-authored reason (when unavailable);<br>• EFFECT text, and **NOT text fixed per (command type, option kind)**, host-owned and not varied by state. Approve: "edited draft not approved · no Contract accepted"; decide: "does not amend the Contract or spec"; cancel: "admitted effects are not undone"; recovery has one fixed NOT per option kind (recheck, associate, reissue, accept-risk);<br>• an `option` discriminator and `recommended` flag;<br>• `carries` text, e.g. notes carried as non-binding.<br>Host text never names a client key. | SC-02 ACTIONS, `␣da`, SC-09, FC-M14 | partial (exact available actions, S§5.2.1 L351; EFFECT and NOT text are the ask) |
| RQ-07 | **Structured `stale_basis`**: sent basis, current basis, per-field change (old/new revision, refs, `changedAt {ledgerSeq, at}`, `changedBy`), added or changed annotation IDs, diff artifact refs, permitted next actions. | SC-10b, FC-M01, FC-L08 | provided (S§5.3 L429) |
| RQ-08 | **Receipt query that never executes**, **principal-scoped**: another device of the same human may query or retry. Status enum `accepted \| duplicate \| command_conflict \| stale_basis \| refused{reason} \| unauthorized \| not_found` (RQ-36), plus three restore statuses:<br>• `authority_epoch_mismatch`: the envelope's epoch is not the host's;<br>• `recovery_required`: the host is not admitting remote commands;<br>• `outcome_unknown_after_restore`: no receipt survives for a pre-restore command, which is not proof it was unsent.<br>Refusal code `turn_state_changed` covers a send whose pinned mode no longer matches the turn (RQ-09). Stale and refused outcomes are recorded under the command ID. **Refusals** are `{code, refs, reason, repair[]}` (S§5.2.1 L353). **Reads** return exact bytes or a named `missing_content`, `unsupported_schema` or `unauthorized` (S§5.3.1 L497). | SC-10c, SC-10h, SC-10i, FC-M04, FC-L12 | provided (S§5.2.1 L349–353, S§5.3 L429, S§5.3.1 L509); `not_found` and `turn_state_changed` are asks |
| RQ-09 | **Conversation model**:<br>• messages with stable IDs; author role `human \| assistant \| tool \| host`, model and assignment from host metadata;<br>• streaming deltas with UTF-8 byte offsets;<br>• tool-call records: name, argument summary, status, timing, bounded output ref;<br>• turn state;<br>• steering items with delivery state, `deliveredAfter {tool, message}` and receipt ID.<br>Commands `sendMessage{mode: prompt\|steer\|followUp}` and `interruptTurn`, both with command IDs. • each author carries a **role class** `human \| coordinator \| reviewer \| worker \| host` and a host-written display label, which drive the kind colour (`visual-language.md` §5.3). The fake host sends `human` with the label "you";<br>• each tool call carries an **outcome** `running \| succeeded \| failed \| cancelled \| unknown` (the enum that drives the tint and the outcome word), plus `exitCode`, `ms` and `startedAt`. A separate short `status` text may add detail. The client never infers an outcome from output text (FC-S14).<br>**Position:** a steer that reaches an ended turn is refused with `turn_ended`; the client keeps the text as a draft and offers `␣cf` (follow-up).<br>• `sendMessage.mode` (prompt / steer / followUp) is taken from the **pin**, the header the user saw, and travels in the envelope. The host refuses a mismatch with the current turn state as `turn_state_changed`; the client keeps the draft and redraws the header.<br>• A candidate conversation carries its `candidate` letter as a field (RQ-30). | SC-03, FC-L03/04, FC-S10 | partial (S§5.2.1 L349) |
| RQ-10 | **Pagination and caps**: messages by cursor (before/after an ID, limit, byte cap); facts since a ledger seq; artifacts by digest and byte range. Snapshot message windows cap each message's bytes (e.g. 64 KB) and mark it truncated with a fetch ref. | SC-03, FC-P02/04, FC-W09 | provided (S§5.2.1 L349, S§5.3.1 L501) |
| RQ-11 | **Emission + manifest view**: revision, digest, prior-emission ref, nodes `{id, class, title, byteRange, headingRange}`, dispositions `{annotationId, disposition, reason, resultingRefs: [{nodeId, byteRange} \| {kind, id}]}`, challenger objections and dispositions, contested items, product questions, completeness. | SC-04/05/06 | partial (S§8 L957, L961) |
| RQ-12 | **Typed blockages**: `waitClass ∈ {human, operator, model, verify, effect, dependency, slot, cleanup, unsupported}`, reason text, refs, `since`, and `downstream {direct, transitive}`. `downstream` counts slices that depend on this one directly or transitively and are not yet integrated (gaps §3.6). The queue's downstream column shows `transitive`; the card shows both ("downstream 4 direct · 25 in all"). `operator` marks remedies the human performs on the host (a quarantine). | SC-02, SC-08, FC-M13, FC-R06 | partial (S§9.2 L1079; `downstream` is an ask) |
| RQ-13 | **Annotation model**: `{id, setRevision, emission, anchor {byteStart, byteEnd, nodeId, quote}, body, author {principal, device}, savedAt}`. `saveAnnotations{baseSetRevision, items[]}` is atomic. Edited bytes: complete bytes + base emission → retained hunks with IDs. | SC-04, SC-06, FC-L05/06 | partial (S§8 L957–963) |
| RQ-14 | **Evidence records** per obligation:<br>• `summary` (≤ 60 characters) and `detail`;<br>• items (runner receipt, review verdict, audit finding) with times;<br>• bound source and target digests, verifier revision, role and independence, rank.<br>Also per slice:<br>• the current head;<br>• `commitsBehind` computed by the host;<br>• findings with severity, disposition and resolving commit, plus **finding→obligation links only where recorded** (the host never infers one);<br>• manual checks marked advisory;<br>• each item's catalog row kind (`generated`, `executed`, `journey`, `human`) and a maintenance status (`clean`, `changed`, `blocked`);<br>• a flag when the source changes `.gitattributes` or `.gitmodules`;<br>• the fidelity review's verdict on an intake;<br>• native checks unrun on Linux.<br>Pass lineage is RQ-44; web passages are RQ-46. | SC-07, SC-05, FC-M10, FC-S20 | partial (S§5.2 L323, S§8.2) |
| RQ-15 | **Assignment view**: id, generation, attempt, role, model, provider, effort, execution fact (`planned`, `starting`, `running`, `submitted`, `blocked`, `recovering`), cancellation state (`cancel-requested`, `quiescing`, `canceled`, `quarantined`), runtime `orphaned`, slot held, workspace bytes, since, last activity (diagnostic), conversation ref. | SC-08, FC-M16, FC-M55 | partial (S§6.1 L590, S§6.3 L640) |
| RQ-16 | **Operation view**: kind with a host display label (`create draft proposal PR`, `update PR summary`, `publish source`, `mark proposal ready`), payload digest, state (planned, admitted, awaiting, unknown, observed, refused, risk, risk-held), attempts with executor epochs, observations with times, what it blocks, affected dependents, safe choices, next check, and a reference to its recovery decision (RQ-29). | SC-10d, FC-M15, FC-M50 | provided (Fig. 10; S§9.2 L1079) |
| RQ-17 | **Facts since a ledger seq**: typed immutable facts `{id, seq, at, by, type, text, refs}`, pageable. | SC-10a′, FC-R04 | partial (S§5.3.1 L501; `history.completeThroughSequence`, S§5.3 L451) |
| RQ-18 | **Connection and host status**: a distinct revocation event; host time on every snapshot and update, **with UTC offset**; server version and capabilities. every snapshot carries `authorityEpoch`, `hostMode` (`active \| admission-disabled \| recovery-reconciling \| blocked`) and the backup block:<br>• `targetExposedWorkSeconds`;<br>• `verifiedOffHostCutoffSequence`;<br>• `cutoffRecordedAt` and `verifiedOffHostAt`;<br>• `health`;<br>• `restoreStatus`;<br>• the count of acknowledged commits after the cutoff.<br>After a restore the host refuses backed-up device credentials with a reason the client shows (`re-pair this device`). The target is displayed as a target, and `restoreStatus` tells "configured", "copy observed" and "restore verified" apart (S§5.3.1 L503). | bufferline host segment, SC-10a/e/h, FC-M12, FC-M20, FC-M31, FC-W12 | provided (S§5.3 L441–450, S§5.3.1 L503) |
| RQ-20 | **Forward compatibility**: the client declares its **version and the resource kinds it understands**; the host marks objects the client cannot render with `unsupported {reason, requiresClient: ">=0.4"}`. An unknown frame version refuses with an upgrade instruction. | SC-10f, FC-M17, FC-W04, FC-W13 | partial (S§5.2.1 L351, S§5.3.1 L497) |
| RQ-21 | **Search** across artifacts and conversations, or an explicit decision that search is client-side. | SC-11, T24 | ask (Q15) |
| RQ-22 | **Canvas artifact kind** (future): kind, revision, snapshot ref, shape-ID anchors. | SC-14 | deferred |
| RQ-23 | **Artifact metadata**: content type, size, digest, inertness; byte-range fetch; `nosniff`, sandboxing headers; no remote resources. | SC-04/05, FC-S07/08 | provided (S§5.2 L327, S§5.3.1 L481–494) |
| RQ-24 | **Command IDs**: client-generated, namespaced by principal and device, stable across retries. The outbox stores the envelope bytes, **including the `authorityEpoch` it was sent under**. | SC-10c, FC-L03, FC-L12 | provided (S§5.3 L398–411) |
| RQ-25 | **Hierarchy, names and IDs**: rows, links and views carry host object IDs (`workflowId` and so on) alongside display paths, so the client never parses paths. | SC-02, SC-11 | ask |
| RQ-26 | **Proposal readiness, four separate views** (S§9.3 L1134), on the proposal summary:<br>• `eligibility {state, gaps[{kind, short, full}]}`, gaps ordered integration → divergence → publication → association → evidence, `short` at most 18 characters;<br>• `mapping {canonical, published?, behindSince?, divergence?}`, plus `integration {integrated, required, lastQualifying}`;<br>• `promotion {state: not-eligible \| pending \| admitted \| unknown \| observed \| unsupported, basis, reason?}`;<br>• `forge {state: not-created \| draft \| ready \| open \| closed \| merged, pr?, observedAt?, completeness, text?}`;<br>• `risk {duplicate: none \| sticky, since?}`;<br>• `mainMerge? {observedAt, mergedSource, matchesReviewed}`. | SC-16, SC-19, FC-M48, FC-M49, FC-M59 | partial (`proposalProgress`, S§5.3 L459) |
| RQ-27 | **Proposal summaries on the attention index**: `{id, project, name, title, shape, readiness}` (readiness is RQ-26). `shape {kind: investigation \| experiment \| bug \| performance \| change \| design \| verify-create \| verify-maintain, supplied: human \| classifier, confirmed, path[{phase, state}]}`. The client draws phases only from `path`. Slice marks come from the slices scope (RQ-41), not here. | SC-16, SC-02 card, FC-M54 | partial (task shape path, S§5.2.1 L351) |
| RQ-28 | **Facts on update frames**: every update carries the facts it commits (`{id, summary, refs}`), which drive the arrivals line and "what changed". | SC-02 echo, SC-10a′ | ask |
| RQ-29 | **Structured decision object**: `{id, kind: product \| recovery, state, question, evidence[], options: [{n, title, body, recommended}], source {report, commit, round}, related[], history[], answer?}`. Answers are an option plus free text (real ledger decisions are free text). The option field is named `body`, following the fake host; `title` renders on its own line above it. | SC-09, SC-02 card, SC-10d | partial (S§8 L939; recovery decisions, S§5.3.1 L509) |
| RQ-30 | **Turn artifacts and sibling conversations**: per conversation, the artifacts produced in the current turn. Per workflow, its other conversations, as **structured fields**, not a display string:<br>• `{role, candidate: "a" \| "b" \| "c" \| null, assignment, model, state, since}`;<br>• the `candidate` letter and `assignment` are the distinguishing keys the side pane never cuts (FC-Q18);<br>• a short role `label` per role (`candidate` for `experiment-candidate`). The client shows the label and never derives one; without it, it shows the full role id (E-PROTO-5 defect 8);<br>• turn artifacts as `{key, state, kind?, at?}`. The client shows kind and time only when sent (E-PROTO-5 defect 7). | SC-03 right pane | ask |
| RQ-31 | **Experiments**: `{id, title, state, candidatesDone, candidatesTotal, protocol {artifact}, assignments[], falsifier, result? {favouriteDisproved, summary}}`. | SC-04, SC-03 | partial (S§8 L993) |
| RQ-32 | **Hunk identity**, **resolved by the design:** the host never cites client-computed hunk IDs. Dispositions cite nodes and byte ranges (RQ-11), and the client maps byte ranges to its own diff hunks. SC-06 now shows node references. | SC-05, SC-06 | resolved |
| RQ-33 | **Agents scope**: a fourth subscription with every assignment across workflows, slot usage, retained-workspace quota, and a per-assignment lifecycle log plus cleanup state (process alive, workspace reuse, admitted effects before the fence, late output, next step). | SC-08 | partial (S§6.1 L592) |
| RQ-34 | **Retained change requests**: an object of its own, `{id, state: retained, binding: false, base {checkpoint, revision, digest}, by, savedAt, items[]}`. A save that lands after an approval gets the receipt result `retained_change_request`. | SC-10b ordering 2 | provided (S§8 L963; shape partial) |
| RQ-35 | **Typed unsupported tasks**: `{kind: task-definition-missing, definition, assignment, generation, retained {ownership, evidence}, nothingReset: true, recovery: [{choice, text}]}`. | SC-10f | provided (S§10 L1274, S§11 L1341; shape partial) |
| RQ-36 | **Receipt status `not_found`**: the host has no record of the command. It is not proof that the command was never committed while the original request may still be in flight, so the only safe next step is the identical retry. | SC-10c | ask |
| RQ-37 | **User-facing sequence = ledger seq**: the statusline and bufferline show the global ledger seq, comparable across views; scope seqs stay internal. | statusline | provided (S§5.3 L471) |
| RQ-38 | **Advisory items in the handover**: `advisory: [{kind, ref, text}]` next to `blocker: null` (for example, a running experiment that informs but does not block). | strip BLOCKER cell | missing |
| RQ-39 | **Per-field digests in `expected`**: a command echoes each basis field it relied on (revision and digest), not only the overall digest, so a stale reply can name exactly which field moved. | SC-10b | provided for revisions (S§5.3 L400); per-field digests are an ask |
| RQ-41 | **Slices scope**:<br>• A fifth subscription, `slices`, opened only while the explorer is open.<br>• Every slice of every non-archived proposal: `{id, workflowId, project, proposal, title, lifecycleState, stateClass, reason, since, downstream {direct, transitive}, assignment summary, nextHumanAction kind, lastFact}`, in host-defined dependency order. `id` and `workflowId` are both full paths (`minos/native-engine/execute-symbolic-calls`), because short slice ids repeat across proposals.<br>• Per-proposal and per-project counts per lifecycle state.<br>• The **lifecycle-state vocabulary**: per state `{state, label, markClasses[], open: bool}`, the first mark class being the usual mark (e.g. `awaiting_review → "awaiting review" → [running, waiting], open`). The host, not the client, decides which states count as open, so "all open" and the empty-filter default follow the host (Q32).<br>• Archived proposals by page on request (`GET /slices/archived?limit=&after=`, RQ-10).<br>**Measured on the fake host:** 10 states (`ready_for_implementation` split into `ready` and `waiting_on_dependency` using the graph); 102 slices in 7 non-archived proposals; 87 archived slices by page; 60.9 KB, about 611 B per slice. Budget 64 KB (measured 62,623 B with proposal fields kept on RQ-27, where they belong). The client filters locally, so no server-side filter API is needed in v1. | SC-16, T32 | ask |
| RQ-42 | **Reference index per workflow scope**:<br>• The host publishes the references it already knows in scope as one resource, `references: [{label, kind, target: Ref \| null, state: resolved \| dangling, reason?}]`. It covers obligations, findings, nodes, decisions, report revisions, Contracts, commits, receipts, assignments, operations and spec sections, and updates like any resource.<br>• `label` is the exact display form (`grammar.md` §4.2): ASCII plus `·` and `§` (E-PROTO-5 defect 1).<br>• The client's Markdown pass applies the reference style to an **exact, whole-token match** of an indexed label outside code. It applies the dangling style when the index says `dangling`.<br>• "The host decides what F16 means" still holds: only indexed labels match, so lookalikes and homoglyphs do not (FC-S04, FC-S15).<br>• Gone with the spans: byte offsets, per-block arrival, drift checks and the Etoile→Iosevka reflow. Streaming and completed blocks render identically.<br>• The host parses no Markdown for this. | SC-03, SC-04, SC-09, T23 | ask |
| RQ-43 | **Multi-scope stream**:<br>• The host offers **one** update stream for a list of scopes, e.g. `GET /stream?scopes=attention,slices,workflow:…,conversation:…`, besides or instead of one stream per scope.<br>• Each frame names its scope and carries that scope's `scope_seq` and `prev_scope_seq` (RQ-02). A gap in one scope resnapshots only that scope.<br>• Scopes can be added and removed on the open stream (`subscribe` / `unsubscribe` frames, or re-open with the new list and per-scope resume points).<br>• Snapshot frames per scope come first, then updates. Readiness is per scope, so one slow scope doesn't block the others.<br>**Why**: one connection per client, readiness per scope, and gap handling per scope. This matches S§5.2.1's "scoped snapshot/NDJSON observation" with one transport. A web or debug client over HTTP/1.1 needs it most (6 connections per origin; E-PROTO-3 deviation 3), but the requirement stands without one. The adapter hides which form is used (`HostAdapter::subscribe`). E-PROTO-4 implemented and tested it (`/observe?scopes=`; 263 tests). | all screens; FC-W11 | partial (S§5.2.1 L349) |
| RQ-44 | **Pass view** per Slice or Record work (S§6.2.1, S§9.4, S§5.2 L323): `passes[]`, each with `ordinal`; `openedBy {cause: first \| watchdog-rework \| preparation-conflict \| verifier-repair, ref}`; `audit {state: not-started \| running \| done, examined {digest}, reports[{context: standards \| contracts, ref, state}], dispositions[{finding, disposition: fixed \| considered \| dismissed \| needs-human, reason, refs}]}`; `handoff? {submitted {digest}, receipt}`; `preparations[{attempt, target {digest}, outcome: clean \| conflict \| error \| superseded, prepared? {digest}, at}]`; `watchdog[{round, reviewed {digest}, target {digest}, verdict, counted, drift}]`. Also `current`, `completedReviews`, `completedReviewLimit`. | SC-07, strip, card, FC-M40–M43 | partial (S§5.2 L323) |
| RQ-45 | **Local-verification prompt** (S§5.2.2, S§5.3 L460): snapshot `localVerification {promptAvailable, source, missing[], advisory}`; artifacts `{ref, kind: local-verification-prompt, version, basis {proposal, source, contracts}, published: yes \| no \| unknown, verificationAsset, linuxEvidence[], gaps[], missing[], advisory: true, createdAt, supersedes?}`; command `requestLocalVerificationPrompt {proposal, source, basis}`, whose receipt carries the new artifact ref. | SC-18, SC-07, FC-M46, FC-M47 | provided (S§5.2.2) |
| RQ-46 | **Web attempts and retained web evidence** (S§6.6 L767–786): web tool-call records gain `attempts[{provider (short label ≤ 8 characters), extractor, version, observationId, observationLabel, request, finalUrl?, outcome: ok \| partial \| failed \| timeout-uncertain \| canceled \| interrupted \| not-attempted, failure? {class, text}, completeness, digest?, at}]` and `resultHandle {state: available \| expired \| unavailable}`. Evidence items gain kind `web-passage {passageRef, url, finalUrl, query, provider, extractor, version, observationId, observationLabel, observedAt, digest, completeness, claimRef}`. | SC-03, SC-07, FC-M52, FC-M53, FC-M56, FC-S19 | partial (S§6.6) |
| RQ-47 | **Checkpoint routing and review policy** (S§4 L267, S§5.3 L457–463, S§6.4): `checkpointSettings {currentRevision, modes {seams, modules, proposal}, changedBy, changedAt, history[]}`. Every checkpoint request and pending decision carries `{requestId, stage, capturedSettingsRevision, mode, agreedScopeRef}`. Decisions carry `decidedBy`, either `{kind: human, principal, device}` or `{kind: delegated, machineActor {assignment}, capturedSettingsRevision, scopeRef}`. `policy {revisions[{revision, completedReviewLimit, minimumEvidenceRank, reviewerDiversity, createdBy, at}], default, bindings[{workflow, revision, bindingRevision}]}`. Commands `setCheckpointSettings {expectedRevision, modes}`, `savePolicyRevision {baseRevision, fields}`, `adoptPolicy {workflow, revision, expectedBindingRevision}`, each with a host decidable whose EFFECT and NOT name the pending requests that keep their capture, or the decisions that go stale. A delegated request's EFFECT says notes must be answered before it advances. | SC-17, SC-04, strip, FC-M09, FC-M38, FC-M44, FC-M45 | provided for behaviour (S§6.4); shape partial |
| RQ-48 | **Project-scoped commands and scopes.** The envelope's scope is a tagged union, `{workflow: id} \| {project: id}`. `setCheckpointSettings`, `savePolicyRevision` and `adoptPolicy` are project-scoped; `adoptPolicy` names its workflow. Observation offers `project-settings:<project>` as a scope (RQ-43). `expected` (S§5.3 L400) binds as before. | SC-17 | ask |
| RQ-49 | **Merge package view**, per proposal, fetched when opened: `intake {ref, digest, sliceCount, acceptedBy, at}`; `source {canonical {rev, commit}, published? {rev, commit}, pr {id, state}}`; `checks {passed, required, weakestRank, minimumRank}`; `readiness` (RQ-26); `findings[{id, severity, slice, text}]`; `deviations[{id, slice, text, pass}]`; `uncertainties[{id, text, refs}]`; `advisory[{name, state}]`; `localVerification` (RQ-45); `slices[{id, name, contract, pass, auditExamined, integrated {rev, commit}, watchdog {round, verdict, reviewed}, fixed}]` in dependency order (S§9.3 L1136). | SC-19, FC-M58 | partial (S§9.3 L1136) |

## 4. Command catalogue used by the keymap

`keymap.toml` lists these wire types; lint KL7 checks this table. The "Expected basis" column documents the minimum the host is expected to send. The readback renders the host's `Basis.fields`, so the keymap no longer lists fields. Every envelope carries `authorityEpoch` (S§5.3). "Union" is the closed command union in S§4 L267.

| Wire type | Tier | Union | Expected basis | Notes |
|---|---|---|---|---|
| `createDesign` | write | create design | — | prompt text; starts Ground |
| `saveAnnotations` | write | save annotations | annotation-set revision, emission | atomic over all drafts |
| `saveEditedBytes` | write | (save annotations) | base emission | complete bytes + base; spec §8 |
| `sendMessage` | write | **missing** | conversation, turn (for a steer), **pinned mode** | modes prompt/steer/followUp; mismatch → `turn_state_changed` (RQ-09) |
| `interruptTurn` | write | **missing** | conversation, turn | does not cancel the assignment |
| `queryReceipt` | local | **missing** | — | read-only (RQ-08, RQ-36) |
| `resend` | write | (any) | the stored envelope, byte-identical | not a new command; the host deduplicates |
| `approveCheckpoint` | decide | approve checkpoint | per-field: **checkpoint request (captured settings, mode)**, emission, manifest, annotations, decisions, intake, policy, policyBinding (RQ-05, RQ-39) | also covers approve-with-notes: it approves the original bytes (S§8 L959) |
| `requestRework` | decide | rework checkpoint | emission, annotations, policy | needs a saved concern |
| `recordDecision` | decide | product/recovery decisions | question, evidence refs, policy; for recovery, the observations | option + free text (RQ-29) |
| `confirmShape` | decide | Ground (S§8 L931) | prompt, proposed shape, policy | Ground |
| `acceptIntake` | decide | accept work | intake, emission, annotations, decisions, policy | creates Contracts |
| `acceptAmendment` | decide | amend work | amendment intake, Contract revision | |
| `cancelWork` | decide | cancel work | the work (assignment and generation, or a pending checkpoint request) | fences authority (S§6.3); a new request then captures current settings (S§6.4 L692) |
| `supersedeContract` | decide | supersede work | superseded Contract revision, new intake | once `everAssigned` (S§8 L949); assigned work keeps its frozen Contract |
| `setCheckpointSettings` | decide | persistent checkpoint settings | settings revision, field | RQ-47 |
| `savePolicyRevision` | decide | policy/default changes | base policy revision | RQ-47 |
| `adoptPolicy` | decide | adoption | workflow, revision, binding revision | RQ-47 |
| `requestLocalVerificationPrompt` | write | advisory artifact request | proposal, source, contracts | RQ-45; binds no authority, so no readback |

**Deferred in v1** (not in the keymap; the requirement stands): `retractAnnotation`, `withdrawMessage`, `revokeDevice` from a client (Q16).

## 5. Asks the accepted spec doesn't cover

The spec leaves route and shape detail to implementation, and these are what this client asks of it:
- **Cross-workflow views:** the attention index (RQ-01), the slices scope (RQ-41), the agents scope (RQ-33), one multiplexed stream (RQ-43).
- **Conversations and streaming detail:** RQ-09, RQ-10, RQ-30, including `turn_state_changed`, `turn_ended` and `interruptTurn`.
- **EFFECT and NOT text** on permitted actions (RQ-06).
- **The reference index** (RQ-42). Without it, content references render plain, which is the safe failure.
- **`not_found`** on the receipt query (RQ-36), **`downstream`** on blockages (RQ-12), **facts on update frames** (RQ-28).
- **Project scope** on the envelope (RQ-48), **`mergeMain`** on the next action (RQ-04), the **package view** (RQ-49).

## 6. Questions for the implementation

1. Is the observation sequence global or per scope? This design shows the ledger seq to the user and detects gaps with a scope seq (RQ-02, RQ-37).
2. Are chat sends Ledger commands with receipts, or Engine-level messages? The client needs idempotency either way (RQ-09).
3. Who may revoke a device? Deferred to the host's admin interface in v1 (Q16).
4. Resource-granular typed upserts plus facts as the update model (§1.1)?
5. What is Render's slice lifecycle-state vocabulary, and which states are "open"? The explorer filters on it (RQ-41, Q32).
6. Does the backup block include the count of acknowledged commits after the verified cutoff? The bufferline wants "unprotected since seq N" (RQ-18, FC-M31).

## 7. Deliberately not required

- No Chord document operations or Durable `watch()` frames on the wire.
- No client-side Kernel rules, digest computation or auto-rebase.
- No offline command queue (FC-L11).
- No resume cursor in v1 (§1.2).
- No browser cookies, Origin or CSRF machinery for this client. Enrollment does not expire and is revocable.
- No descriptive issue mirroring.
