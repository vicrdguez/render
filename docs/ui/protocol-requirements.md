# Client → protocol requirements

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`reference/`](reference/); `wireframes.md` → [`wireframes/layout.md`](wireframes/layout.md); `screens.md` → [`wireframes/text-mocks.md`](wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`evidence.md`](evidence.md).


Feedback for the server spec, not an edit to it. The spec's §5.3 shapes are "illustrative proposed wire shapes", and the human has said the protocol is unsettled and must make stateless clients easy to build on any stack (A012). This document says what the designed screens need, from which message, and where §5.3 falls short. Names follow A014–A016: **Kernel** (pure transitions), **Ledger** (accepts commands, serves views) and **Engine** (scheduling, packets, Durable tasks). A009 applies: no descriptive issues; only the proposal PR is published.

**Evidence.** The E-HOST fake host produced every screen state from SC-02 to SC-10 out of wire data, with 207 tests passing (`fake-host/report.md`). It found 13 requirements this document lacked (RQ-new-1..13, numbered here RQ-27..RQ-39), 14 missing details and 7 contradictions (`fake-host/gaps.md`). E-PROTO showed that a second wire dialect changed 9 files, all inside the client adapter (`html-proto/report.md` §11). Shapes below are illustrative.

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

E-HOST used a generic path-level `set/remove/insert` vocabulary. It made "snapshot + updates = fresh snapshot" testable, but the client has to apply untyped patches.

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

**Authority epochs (phase 5, challenge 1; spec r2 §5.3).** Every frame and every command envelope carries `authorityEpoch`. Within one epoch the client discards repeated or older sequences (FC-W01). A frame with a **new** epoch means the host was restored. The client then:
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
    approvals: Vec<Approval>,            // RQ-19
    policy: PolicyView,                  // RQ-19: delegation dial (read-only in the client), rework budget
    integration: IntegrationView,        // RQ-26
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

Status against spec §5.3: **present**, **partial** (the concept exists but the shape is insufficient) or **missing**. "Fake host" means E-HOST emitted the field and a screen used it.

| ID | Requirement | Forced by | §5.3 |
|---|---|---|---|
| RQ-01 | **Attention index** subscription across all projects.<br>• One row per open item: needs-you, waiting, running, plus items done in the last 24 h.<br>• Each row has the host object IDs, wait class, `since`, `downstream`, a handover summary and the workflow's ledger seq.<br>• Proposal summaries come with it (RQ-27).<br>Not every slice detail: that is the workflow scope. *Contradiction 1 resolved: an index of open items plus proposal summaries.*<br>**Phase 6 (trial a):**<br>• Slot occupancy comes as its own field, `slots {used, total}`, separate from the running rows. The client prints both (`RUNNING · 2 · slots 4/4`), because a cancel-requested assignment or an effect can hold a slot (FC-M36).<br>• The client groups `waitClass: operator` rows as ON THE HOST, apart from NEEDS YOU (FC-M35). No wire change. | SC-02, FC-R01, FC-W07 | missing |
| RQ-02 | **Scoped sequence**: each subscription's updates carry `scope_seq` and `prev_scope_seq` for gap detection; coalesced snapshots are marked. The user-facing number is the ledger seq (RQ-37). | SC-10g, FC-W01/02/06 | partial |
| RQ-03 | **Handover facts as structured fields** per workflow and slice:<br>• commitment `{kind, ref, revision, digest, acceptedAt, by, obligations}`<br>• owner `{assignment \| human \| none, waitClass}`<br>• evidence `{kind, verdict, sourceDigest, currentHead}`<br>• blocker, next, advisory (RQ-38) | strip, SC-02, FC-R02, FC-M10 | partial |
| RQ-04 | **Structured next human action**: `{actionKind, target, commandTypes[], basisRef, since, why}`. | NEXT cell, FC-R05 | partial |
| RQ-05 | **Host-computed decision basis** for every decidable object: a digest plus labelled fields. **Every authority command** needs one, including `cancelAssignment` (D13); the client never derives a basis. **Phase 5 (challenge 4, spec r2 §5.3):** the basis for approve includes the checkpoint artifact and manifest, the annotation-set revision, explicit decisions, the intake digest where applicable, and the policy, delegation and workflow-policy-binding revisions. The client renders whatever fields arrive, known or not (FC-M33). | SC-09, FC-M01, FC-W08 | partial |
| RQ-06 | **Permitted actions per object**, unavailable ones included, each with:<br>• a host-authored reason (when unavailable);<br>• EFFECT text, and **NOT text as a fixed set per command type**, host-owned and not varied by state (challenge 20). For example, approve: "edited draft not approved · no Contract accepted"; decide: "does not amend the Contract or spec"; cancel: "admitted effects are not undone";<br>• an `option` discriminator and `recommended` flag (one decision can offer three options; gaps §3.1);<br>• `carries` text, e.g. notes carried as non-binding. | SC-02 ACTIONS, `␣da`, SC-09, FC-M14 | missing |
| RQ-07 | **Structured `stale_basis`**: sent basis, current basis, per-field change (old/new revision, refs, `changedAt {ledgerSeq, at}`, `changedBy`), added or changed annotation IDs, diff artifact refs, permitted next actions. | SC-10b, FC-M01, FC-L08 | partial |
| RQ-08 | **Receipt query that never executes**, **principal-scoped**: another device of the same human may query or retry. Status enum `accepted \| duplicate \| command_conflict \| stale_basis \| refused{reason} \| unauthorized \| not_found` (RQ-36), plus three restore statuses (phase 5, spec r2 §5.3.1):<br>• `authority_epoch_mismatch`: the envelope's epoch is not the host's;<br>• `recovery_required`: the host is not admitting remote commands;<br>• `outcome_unknown_after_restore`: no receipt survives for a pre-restore command, which is not proof it was unsent.<br>Refusal code `turn_state_changed` covers a send whose pinned mode no longer matches the turn (RQ-09). Stale and refused outcomes are recorded under the command ID. The spec's E-CLIENT note (device-fingerprinted) disagrees; the fake host followed principal scope and tested it. | SC-10c, SC-10h, FC-M04, FC-L12 | partial |
| RQ-09 | **Conversation model**:<br>• messages with stable IDs; author role `human \| assistant \| tool \| host`, model and assignment from host metadata;<br>• streaming deltas with UTF-8 byte offsets;<br>• tool-call records: name, argument summary, status, timing, bounded output ref;<br>• turn state;<br>• steering items with delivery state, `deliveredAfter {tool, message}` and receipt ID.<br>Commands `sendMessage{mode: prompt\|steer\|followUp}` and `interruptTurn`, both with command IDs. **Phase 3 details:**<br>• each author carries a **role class** `human \| coordinator \| reviewer \| worker \| host` and a host-written display label, which drive the kind colour (`visual-language.md` §5.3). The fake host sends `human` with the label "you";<br>• each tool call carries an **outcome** `running \| succeeded \| failed \| cancelled \| unknown` (the enum that drives the tint and the outcome word), plus `exitCode`, `ms` and `startedAt`. A separate short `status` text may add detail. The client never infers an outcome from output text (FC-S14). *Implemented in the phase-3 fake host (`fake-host/report-phase3.md`): `roleClass`, `outcome`, `exitCode`, `ms`, `startedAt`; H9 is the forged-outcome fixture.*<br>**Position:** a steer that reaches an ended turn is refused with `turn_ended`; the client keeps the text as a draft and offers `␣cf` (follow-up).<br>**Phase 5:**<br>• `sendMessage.mode` (prompt / steer / followUp) is taken from the **pin**, the header the user saw, and travels in the envelope. The host refuses a mismatch with the current turn state as `turn_state_changed`; the client keeps the draft and redraws the header (challenge 19, FC-T20).<br>• A candidate conversation carries its `candidate` letter as a field (RQ-30). | SC-03, FC-L03/04, FC-S10 | missing |
| RQ-10 | **Pagination and caps**: messages by cursor (before/after an ID, limit, byte cap); facts since a ledger seq; artifacts by digest and byte range. Snapshot message windows cap each message's bytes (e.g. 64 KB) and mark it truncated with a fetch ref. *Contradiction 6: the 50,000-character hostile line arrived inline.* | SC-03, FC-P02/04, FC-W09 | partial |
| RQ-11 | **Emission + manifest view**: revision, digest, prior-emission ref, nodes `{id, class, title, byteRange, headingRange}`, dispositions `{annotationId, disposition, reason, resultingRefs: [{nodeId, byteRange} \| {kind, id}]}`, challenger objections and dispositions, contested items, product questions, completeness. | SC-04/05/06 | missing |
| RQ-12 | **Typed blockages**: `waitClass ∈ {human, operator, model, verify, effect, dependency, slot, cleanup, unsupported}`, reason text, refs, `since`, and `downstream {direct, transitive}`. `downstream` counts slices that depend on this one directly or transitively and are not yet integrated (gaps §3.6). *Contradiction 7 resolved, then corrected by the phase-3 fake host, which computes both numbers from the ledger graph (`scenarios/lib/graph.mjs`): `execute-symbolic-calls` 4 direct / 25 transitive (phase 2's 34 was a hand count), `execute-causal-scan` 3 / 23, `evaluate-exact-sum-with-demand` 3 / 23, `specify-rsps-profile` 2 / 4, `specify-cma-profiles` 8 / 29.* The queue's downstream column shows `transitive`; the card shows both ("downstream 4 direct · 25 in all"). `operator` marks remedies the human performs on the host (a quarantine). | SC-02, SC-08, FC-M13, FC-R06 | partial |
| RQ-13 | **Annotation model**: `{id, setRevision, emission, anchor {byteStart, byteEnd, nodeId, quote}, body, author {principal, device}, savedAt}`. `saveAnnotations{baseSetRevision, items[]}` is atomic. Edited bytes: complete bytes + base emission → retained hunks with IDs. | SC-04, SC-06, FC-L05/06 | partial |
| RQ-14 | **Evidence records** per obligation:<br>• `summary` (≤ 60 characters) and `detail`;<br>• items (runner receipt, review verdict, audit finding) with times;<br>• bound source and target digests, verifier revision, role and independence, rank.<br>Also per slice:<br>• the current head;<br>• `commitsBehind` computed by the host;<br>• findings with severity, disposition and resolving commit, plus **finding→obligation links only where recorded** (the host never infers one);<br>• manual checks marked advisory (A010). | SC-07, FC-M10 | missing |
| RQ-15 | **Assignment view**: id, generation, attempt, role, model, provider, effort, the full state enum (… cancel-requested, quiescing, canceled, quarantined), slot held, workspace bytes, since, last activity (diagnostic), conversation ref. | SC-08, FC-M16 | partial |
| RQ-16 | **Operation view**: kind, payload digest, state (planned, admitted, awaiting, unknown, observed, refused, risk, risk-held), attempts with executor epochs, observations with times, affected dependents, safe choices, next check. | SC-10d, FC-M15 | partial |
| RQ-17 | **Facts since a ledger seq**: typed immutable facts `{id, seq, at, by, type, text, refs}`, pageable. | SC-10a′, FC-R04 | partial |
| RQ-18 | **Connection and host status**: a distinct revocation event; host time on every snapshot and update, **with UTC offset**; server version and capabilities. **Phase 5 (challenge 1, spec r2 §5.3.1):** every snapshot carries `authorityEpoch`, `hostMode` (`active \| admission-disabled \| recovery-reconciling \| blocked`) and the backup block:<br>• `targetExposedWorkSeconds`;<br>• `verifiedOffHostCutoffSequence`;<br>• `cutoffRecordedAt` and `verifiedOffHostAt`;<br>• `health`;<br>• `restoreStatus`;<br>• the count of acknowledged commits after the cutoff.<br>After a restore the host refuses backed-up device credentials with a reason the client shows (`re-pair this device`). | bufferline host segment, SC-10a/e/h, FC-M12, FC-M20, FC-M31, FC-W12 | partial |
| RQ-19 | **Approval provenance and policy**: approvals `{by: principal+device \| policy revision, basis, at}`; the delegation dial per stage (A003, shown read-only; it is changed in host config); rework budget used and limit (A007). | readback, strip, FC-M09, FC-M22 | missing |
| RQ-20 | **Forward compatibility**: the client declares its **version and the resource kinds it understands**; the host marks objects the client cannot render with `unsupported {reason, requiresClient: ">=0.4"}`. | SC-10f, FC-M17, FC-W04 | missing |
| RQ-21 | **Search** across artifacts and conversations, or an explicit decision that search is client-side. | SC-11, T24 | missing (Q15) |
| RQ-22 | **Canvas artifact kind** (future): kind, revision, snapshot ref, shape-ID anchors. | SC-14 | deferred |
| RQ-23 | **Artifact metadata**: content type, size, digest, inertness; byte-range fetch; `nosniff`, sandboxing headers; no remote resources. | SC-04/05, FC-S07/08 | partial |
| RQ-24 | **Command IDs**: client-generated, namespaced by principal and device, stable across retries. The outbox stores the envelope bytes, **including the `authorityEpoch` it was sent under** (phase 5; spec r2 §5.3 envelope). | SC-10c, FC-L03, FC-L12 | present |
| RQ-25 | **Hierarchy, names and IDs**: rows, links and views carry host object IDs (`workflowId` and so on) alongside display paths, so the client never parses paths (D12). | SC-02, SC-11 | partial |
| RQ-26 | **Integration and merge readiness**: canonical vs published head, gates and their state, final-package gaps. | SC-07, T28 | missing |
| RQ-27 | **Proposal summaries and phases** (was RQ-new-1): per proposal `{id, project, name, title, slices: [{id, title, state, glyph}]}` in **host-defined dependency order**; per design workflow `phases: [{name, state: done\|attention\|pending}]`. The host sends a glyph class, so the client does not re-implement Kernel states. | SC-02 small multiples | missing |
| RQ-28 | **Facts on update frames** (was RQ-new-2): every update carries the facts it commits (`{id, summary, refs}`), which drive the arrivals line and "what changed". | SC-02 echo, SC-10a′ | missing |
| RQ-29 | **Structured decision object** (was RQ-new-3): `{id, state, question, evidence[], options: [{n, title, body, recommended}], source {report, commit, round}, related[], history[], answer?}`. Answers are an option plus free text (real ledger decisions are free text). The option field is named `body`, following the phase-3 fake host; `title` renders on its own line above it (evaluation-2 §5). | SC-09, SC-02 card | missing |
| RQ-30 | **Turn artifacts and sibling conversations** (was RQ-new-4): per conversation, the artifacts produced in the current turn. Per workflow, its other conversations, as **structured fields**, not a display string (phase 5, evaluation-4 §1):<br>• `{role, candidate: "a" \| "b" \| "c" \| null, assignment, model, state, since}`;<br>• the `candidate` letter and `assignment` are the distinguishing keys the side pane never cuts (FC-Q18);<br>• a short role `label` per role (`candidate` for `experiment-candidate`). The client shows the label and never derives one; without it, it shows the full role id (E-PROTO-5 defect 8);<br>• turn artifacts as `{key, state, kind?, at?}`. The client shows kind and time only when sent (E-PROTO-5 defect 7). | SC-03 right pane | missing |
| RQ-31 | **Experiments** (was RQ-new-5): `{id, title, state, candidatesDone, candidatesTotal, protocol {artifact}, assignments[], falsifier, result? {favouriteDisproved, summary}}`. | SC-04, SC-03 | missing |
| RQ-32 | **Hunk identity** (was RQ-new-6), **resolved by the design:** the host never cites client-computed hunk IDs. Dispositions cite nodes and byte ranges (RQ-11), and the client maps byte ranges to its own diff hunks. SC-06 now shows node references. | SC-05, SC-06 | resolved |
| RQ-33 | **Agents scope** (was RQ-new-7): a fourth subscription with every assignment across workflows, slot usage (`slots {used, total}`, with the assignments holding each slot, so a slot held through a cancel grace is visible; phase 6), retained-workspace quota, and a per-assignment lifecycle log plus cleanup state (process alive, workspace reuse, admitted effects before the fence, late output, next step). | SC-08 | missing |
| RQ-34 | **Retained change requests** (was RQ-new-8): an object of its own, `{id, state: retained, binding: false, base {checkpoint, revision, digest}, by, savedAt, items[]}`. A save that lands after an approval gets the receipt result `retained_change_request`. | SC-10b ordering 2 | missing |
| RQ-35 | **Typed unsupported tasks** (was RQ-new-9): `{kind: task-definition-missing, definition, assignment, generation, retained {ownership, evidence}, nothingReset: true, recovery: [{choice, text}]}`. | SC-10f | missing |
| RQ-36 | **Receipt status `not_found`** (was RQ-new-10): the host has no record of the command. It is not proof that the command was never committed while the original request may still be in flight, so the only safe next step is the identical retry. | SC-10c | missing |
| RQ-37 | **User-facing sequence = ledger seq** (was RQ-new-11): the statusline and bufferline show the global ledger seq, comparable across views; scope seqs stay internal. | statusline | missing |
| RQ-38 | **Advisory items in the handover** (was RQ-new-12): `advisory: [{kind, ref, text}]` next to `blocker: null` (for example, a running experiment that informs but does not block). | strip BLOCKER cell | missing |
| RQ-39 | **Per-field digests in `expected`** (was RQ-new-13): a command echoes each basis field it relied on (revision and digest), not only the overall digest, so a stale reply can name exactly which field moved. | SC-10b | missing |
| RQ-41 | **Slices scope** (new, phase 3; the explorer, SC-16):<br>• A fifth subscription, `slices`, opened only while the explorer is open.<br>• Every slice of every non-archived proposal: `{id, workflowId, project, proposal, title, lifecycleState, stateClass, reason, since, downstream {direct, transitive}, assignment summary, nextHumanAction kind, lastFact}`, in host-defined dependency order. `id` and `workflowId` are both full paths (`minos/native-engine/execute-symbolic-calls`), because short slice ids repeat across proposals.<br>• Per-proposal and per-project counts per lifecycle state.<br>• The **lifecycle-state vocabulary**: per state `{state, label, markClasses[], open: bool}`, the first mark class being the usual mark (e.g. `awaiting_review → "awaiting review" → [running, waiting], open`). The host, not the client, decides which states count as open, so "all open" and the empty-filter default follow the host (Q32).<br>• Archived proposals by page on request (`GET /slices/archived?limit=&after=`, RQ-10).<br>**Measured on the phase-3 fake host:** 10 states (`ready_for_implementation` split into `ready` and `waiting_on_dependency` using the graph); 102 slices in 7 non-archived proposals; 87 archived slices by page; 60.9 KB, about 611 B per slice (the phase-3 estimate was 300 B). Budget 64 KB. The client filters locally, so no server-side filter API is needed in v1. | SC-16, T32 | implemented in the fake host; missing in the spec (RQ-27 carries only `{id, title, state, glyph}` per slice) |
| RQ-42 | **Reference index per workflow scope** (phase 5, replacing phase 3's byte spans; challenge 6; `visual-language.md` §5.9):<br>• The host publishes the references it already knows in scope as one resource, `references: [{label, kind, target: Ref \| null, state: resolved \| dangling, reason?}]`. It covers obligations, findings, nodes, decisions, report revisions, Contracts, commits, receipts, assignments, operations and spec sections, and updates like any resource.<br>• `label` is the exact display form (`grammar.md` §4.2): ASCII plus `·` and `§` (E-PROTO-5 defect 1).<br>• The client's Markdown pass applies the reference style to an **exact, whole-token match** of an indexed label outside code. It applies the dangling style when the index says `dangling`.<br>• "The host decides what F16 means" still holds: only indexed labels match, so lookalikes and homoglyphs do not (FC-S04, FC-S15).<br>• Gone with the spans: byte offsets, per-block arrival, drift checks and the Etoile→Iosevka reflow. Streaming and completed blocks render identically.<br>• The host parses no Markdown for this. | SC-03, SC-04, SC-09, T23 | missing |
| RQ-43 | **Multi-scope stream** (new, phase 4; E-PROTO-3 defect 7):<br>• The host offers **one** update stream for a list of scopes, e.g. `GET /stream?scopes=attention,slices,workflow:…,conversation:…`, besides or instead of one stream per scope.<br>• Each frame names its scope and carries that scope's `scope_seq` and `prev_scope_seq` (RQ-02). A gap in one scope resnapshots only that scope.<br>• Scopes can be added and removed on the open stream (`subscribe` / `unsubscribe` frames, or re-open with the new list and per-scope resume points).<br>• Snapshot frames per scope come first, then updates. Readiness is per scope, so one slow scope doesn't block the others.<br>**Why** (reworded per challenge 20): one connection per client, readiness per scope, and gap handling per scope. This matches spec r2 §5.2.1's "scoped snapshot/NDJSON observation" with one transport. A web or debug client over HTTP/1.1 needs it most (6 connections per origin; E-PROTO-3 deviation 3), but the requirement stands without one. The adapter hides which form is used (`HostAdapter::subscribe`). E-PROTO-4 implemented and tested it (`/observe?scopes=`; 263 tests). | all screens; FC-W11 | implemented in the fake host; missing in the spec |
| RQ-40 | **Withdrawn (phase 5, challenge 8).** It asked the host to render Mermaid to SVG. Pele had to measure with the client's Iosevka Etoile metrics, which coupled the host to one client's typography. Diagrams render in the client (Pele in QuickJS, the measured path, `stack.md` §5); the host serves Mermaid source bytes only. | — | withdrawn |

## 4. Command catalogue used by the keymap

`keymap.toml` lists these wire types; lint KL7 checks this table. The "Expected basis" column documents the minimum the host is expected to send. Since phase 5 the readback renders the host's `Basis.fields`, so the keymap no longer lists fields (challenge 4). Every envelope carries `authorityEpoch` (spec r2 §5.3). "Union" is the closed command union in spec §4 (Ledger `command`).

| Wire type | Tier | Union | Expected basis | Notes |
|---|---|---|---|---|
| `createDesign` | write | create design | — | prompt text; starts Ground |
| `saveAnnotations` | write | save annotations | annotation-set revision, emission | atomic over all drafts |
| `saveEditedBytes` | write | (save annotations) | base emission | complete bytes + base; spec §8 |
| `sendMessage` | write | **missing** | conversation, turn (for a steer), **pinned mode** | modes prompt/steer/followUp; mismatch → `turn_state_changed` (RQ-09) |
| `interruptTurn` | write | **missing** | conversation, turn | does not cancel the assignment |
| `queryReceipt` | local | **missing** | — | read-only (RQ-08, RQ-36) |
| `resend` | write | (any) | the stored envelope, byte-identical | not a new command; the host deduplicates (D2) |
| `approveCheckpoint` | decide | approve checkpoint | per-field: emission, manifest, annotations, **decisions**, intake, policy, **policyBinding** (RQ-39, spec r2 §5.3) | also covers approve-with-notes (Q17) |
| `requestRework` | decide | rework checkpoint | emission, annotations, policy | needs a saved concern |
| `recordDecision` | decide | decide | question, evidence refs, policy | option + free text (RQ-29) |
| `confirmShape` | decide | **missing** (Figure 1 AUTH) | prompt, proposed shape, policy | Ground |
| `acceptIntake` | decide | accept work | intake, emission, annotations, decisions, policy | creates Contracts |
| `acceptAmendment` | decide | amend work | amendment intake, Contract revision | |
| `cancelAssignment` | decide | cancel | assignment, generation (host decidable, D13) | fences authority (§6.3) |

**Deferred in v1** (not in the keymap; the requirement stands for the server spec): `retractAnnotation`, `withdrawMessage`, `setDelegation` (A003 says by config: a host setting, shown read-only), `authorizeReissue` and `resolveRisk` (until machine publication, spec stage 6), `revokeDevice` from a client (Q16).

## 5. Gaps against §5.3, summarised

1. **No cross-workflow views** (RQ-01, RQ-27, RQ-33, RQ-41).
2. **Sequence scope is undefined** (RQ-02, RQ-37).
3. **The snapshot lacks the five facts as data** (RQ-03, RQ-04, RQ-12, RQ-38).
4. **The basis the client must echo is not in the snapshot**, and `expected` cannot say which field moved (RQ-05, RQ-39).
5. **Legality lives only in refusals** (RQ-06).
6. **Conversations and streaming are absent** (RQ-09, RQ-10, RQ-30), and there is no reference index (RQ-42).
9. **Restore status:** spec r2 §5.3 and §5.3.1 define `authorityEpoch`, `hostMode`, the backup block and three restore receipt statuses. The design now consumes them (RQ-08, RQ-18, RQ-24); the server spec owns their exact shapes.
7. **First-class objects described only in prose**: decisions, experiments, change requests, unsupported tasks and evidence (RQ-29, RQ-31, RQ-34, RQ-35, RQ-14). E-HOST's observation: "snapshots are mostly `x_` extension fields."
8. **Receipt query, `not_found`, approval provenance and forward compatibility are unspecified** (RQ-08, RQ-36, RQ-19, RQ-20).

## 6. Questions for the server spec

1. Is the observation sequence global or per scope? This design shows the ledger seq to the user and detects gaps with a scope seq (RQ-02, RQ-37).
2. Should the host send `actions[]` with EFFECT/NOT text? Recommendation: yes; consequences depend on state (Q14).
3. Are chat sends Ledger commands with receipts, or Engine-level messages? The client needs idempotency either way (RQ-09).
4. Who may revoke a device? Deferred to the host's admin interface in v1 (Q16).
5. Is approve-with-notes `approveCheckpoint` with a non-empty annotation-set revision? This design assumes yes (Q17).
6. Resource-granular typed upserts plus facts as the update model (§1.1)?
7. Is a blocking decision a first-class Ledger object (RQ-29)? Is an experiment (RQ-31)?
8. ~~Will the host render Mermaid to SVG (RQ-40, Q22)?~~ Withdrawn: diagrams render in the client (phase 5, challenge 8).
9. What is Render's slice lifecycle-state vocabulary, and which states are "open"? The explorer filters on it (RQ-41, Q32). The phase-3 fake host proposes 10 states with `open: bool` each.
10. Will the host publish a reference index per scope (RQ-42)? Without it, content references render plain, which is the safe failure.
11. Will the host offer one stream for many scopes (RQ-43)? One connection per client, with readiness and gaps per scope.
12. Does the backup block include the count of acknowledged commits after the verified cutoff? The bufferline wants "unprotected since seq N" (RQ-18, FC-M31).

## 7. Deliberately not required

- No Chord document operations or Durable `watch()` frames on the wire.
- No client-side Kernel rules, digest computation or auto-rebase.
- No offline command queue (FC-L11).
- No resume cursor in v1 (§1.2).
- No browser cookies, Origin or CSRF machinery for this client (A012). Enrollment does not expire and is revocable (A011).
- No descriptive issue mirroring (A009).
