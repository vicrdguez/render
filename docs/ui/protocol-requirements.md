# Client → protocol requirements

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)), for the Brief design adopted on 2026-11-06.
> - **File names** in code spans: `visual-language.md`, `grammar.md` and `stack.md` are in [`reference/`](reference/); `layout.md` and `text-mocks.md` are in [`wireframes/`](wireframes/).
> - **Measured, looked-at and reasoned** claims, and what is owed, are labelled in [`evidence.md`](evidence.md).

What the client's screens need from the host, checked against the accepted server spec (`docs/spec.md`, R3, accepted at `768f43c`; `S§… L…` cites it).
- The spec's wire shapes are "illustrative proposed wire shapes", so the shapes below are illustrative too.
- Names follow the spec: **Kernel** (pure transitions), **Ledger** (accepts commands, serves views), **Engine** (scheduling, packets, Durable tasks).

**Screen map** used in the "Forced by" column:

| ID | Screen |
|---|---|
| SC-01 | Frame: tab bar, Track row, statusline, echo row, bottom float |
| SC-02 | The Brief |
| SC-03 | Chat |
| SC-04 | Review, which absorbs the old diff (SC-05) and dispositions (SC-06) |
| SC-07 | Evidence |
| SC-08 | Agents list |
| SC-09 | Decision |
| SC-10 | States |
| SC-11 | Palette |
| SC-12 | which-key |
| SC-16 | Slices and Proposals lists |
| SC-17 | Settings |
| SC-18 | Local prompt |
| SC-19 | Proposal page |

**Evidence.** A scripted fake host produced every screen state out of wire data in the accepted package's prototype, and a second wire dialect changed only files inside the client adapter (measured; [`evidence.md`](evidence.md)). The Brief prototype used static fixtures, not the fake host.

## 1. Client architecture and the adapter boundary

```
 wire (unsettled) ──► HostAdapter ──Inbound──► [queue] ──frame boundary──► reduce(state, msg) ──► ClientState ──► view ──► rune layout ──► draw
                         ▲                                                                              │
                         └──── Outbound ◄── envelope(cmd, pin) ◄── keys (resolved against the last drawn frame)
                    local store (device only): drafts, marks, jumplist, read bases, last-seen seqs, seenBrief, outbox
```

- **HostAdapter** is the only code that knows wire shapes. **Measured** on the accepted prototype: switching dialects touched only `adapter/` (9 files).
- **Host messages are queued and applied at frame boundaries; keys resolve against the last drawn frame.** On rune a key runs in the next frame after `poll` has applied host events, so `poll` copies the drawn cursor-target state first and keys resolve against that copy (`stack.md` §3, measured in a `Runtime` test). This rule keeps target pinning exact (FC-T15).
- **reduce** is pure: `(ClientState, Inbound | LocalEvent) → ClientState`. **Measured** on the accepted prototype: in conformance replay (28/28 assertions) and live over the event stream, the client's state equalled a fresh snapshot.
- **The view** is built on rune, with rune-kit's Markdown and rune-mermaid; Render writes its prose paragraphs with pills, its code-block element, margin-note placement and the modal controller (`stack.md` §3). It implements the reading rules (`visual-language.md` §4). The reading checks run on rune's own layout: AccessKit line runs and `--tree` element boxes.
- **The local store** holds device-only state that snapshots never overwrite. **Measured** on the accepted prototype: drafts, marks and an unknown-outcome entry survive a restart and a resnapshot.
  - It also holds `seenBrief = {authorityEpoch, ledgerSeq, hostTime, rows [{id, group, stateClass}]}`, which drives the Brief's "since you left" line (spec SC-02). This needs **no host requirement**: the client diffs two snapshots it already has.

### 1.1 Position on the change model

The accepted prototype's fake host used a generic path-level `set/remove/insert` vocabulary. It made "snapshot + updates = fresh snapshot" testable, but the client has to apply untyped patches.

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
    fn subscribe(&mut self, scope: Scope);          // Attention, Agents, Slices (while the Slices list is open), Workflow(id), Conversation(id); one multiplexed stream when the host offers it (RQ-43)
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
    CredentialRefused { reason: Revoked | RestoredHost },   // after a restore every backed-up bearer is refused (S§5.3.1)
    Disconnected { reason: String },
}
```

**Authority epochs.** Every frame and every command envelope carries `authorityEpoch`. Within one epoch the client discards repeated or older sequences (FC-W01). A frame with a **new** epoch means the host was restored. The client then:
- discards all cached sequence comparisons, pins, open readbacks and pending mutation authority;
- resnapshots every scope;
- moves every outbox entry to `unknown_after_restore`, with retry disabled (FC-L12);
- voids `seenBrief` comparisons, so the Brief's "since you left" line says the host was restored instead of counting changes (FC-M70);
- shows the host's recovery state.

It never rejects the restored snapshot as numerically older (FC-W12). An ordinary host restart keeps the epoch and changes nothing here.

There is **no resume cursor in v1**. Every connect and reconnect starts from a fresh snapshot. This is the simplest option that E-HOST showed to be sufficient (gaps §3.14).
- The Brief's "since you left" line diffs the stored `seenBrief` against the new snapshot, entirely on the client.
- An open object's "what changed" list after a reconnect comes from facts since a ledger sequence (RQ-17).

## 2. Client view model

```rust
struct ClientState {
    conn: Connection,                    // live | connecting | offline{since} | revoked{at} | repair_required{reason}; host name, version, capabilities
    host: HostStatus,                    // authority_epoch, host_mode: active|admission-disabled|recovery-reconciling|blocked,
                                         // backup {target_exposed_s, cutoff_seq, cutoff_at, verified_at, health, restore_status} (RQ-18, S§5.3.1)
    scopes: Map<Scope, ScopeCursor>,     // keyed within one authority_epoch: ledger_seq (shown), scope_seq (gap detection), host_time, received_at
    attention: AttentionIndex,           // RQ-01 rows + RQ-27 proposal summaries; drives the Brief and the count tags
    agents: AgentIndex,                  // RQ-33
    slices: Option<SliceIndex>,          // RQ-41, only while the Slices list is open
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
    assignments: Vec<AssignmentView>,    // RQ-15: includes last_activity {text, at} (diagnostic)
    operations: Vec<OperationView>,      // RQ-16
    blockages: Vec<Blockage>,            // RQ-12, RQ-35
    approvals: Vec<Approval>,            // RQ-47: decidedBy human or delegated machine actor
    settings: CheckpointSettings,        // RQ-47: routing per stage, current revision, history
    policy: PolicyView,                  // RQ-47: revisions, default, this workflow's binding, review count and limit
    passes: Vec<Pass>,                   // RQ-44: per Slice or Record work; drives the Slice and pass zooms of the Track
    readiness: Readiness,                // RQ-26: per proposal, four separate views
    package: Option<MergePackage>,       // RQ-49: fetched when opened
    local_prompts: Vec<LocalPrompt>,     // RQ-45
}

struct Decidable { target: Ref, basis: Basis, actions: Vec<Action> }
struct Basis { digest: Digest, fields: Vec<BasisField> }
struct BasisField { name, reference: Ref, revision: Option<u32>, digest: Option<Digest>, label, changed_at: SeqTime, changed_by: Option<Principal> }
struct Action { command_type, option: Option<u32>, recommended: bool, available: bool, reason: Option<String>, effect: String, not: Vec<String>, carries: Option<String> }
struct Text { text: String, authored_by: Content | Host }   // RQ-50: how a text field is drawn on the Brief and in chrome
```

Device-local, never from the host:
- drafts (annotation, prompt, decision note, edit buffer) with their base refs;
- **read bases** per open view (`grammar.md` §13);
- marks, the jumplist, last-seen ledger sequence per object, `seenBrief`, layout, and the outbox.

## 3. Requirements

**The "Server spec (R3)" column** says what the accepted server spec provides, checked against its text (not carried over from earlier status notes):

| Value | Meaning |
|---|---|
| **provided** | The spec names the field or behaviour |
| **partial** | The concept is there; the shape or part of it is the client's ask |
| **open request** | The spec doesn't cover it. The spec leaves route and shape detail to implementation (S§5.2.1 L349); these are listed again in §5 |
| **resolved** / **deferred** | Settled by the design, or out of v1 |

"Fake host" means the accepted prototype's scripted host emitted the field and a screen used it.

| ID | Requirement | Forced by | Server spec (R3) |
|---|---|---|---|
| RQ-01 | **Attention index** subscription across all projects. It drives the Brief and the count tags.<br>• One row per open item: needs-you, on the host, waiting, running, plus items done in the last 24 h.<br>• Each row has the host object IDs, `title` (RQ-25), wait class, `since`, `downstream`, the structured next action (RQ-04), the Track inputs (RQ-27, RQ-44), a handover summary and the workflow's ledger seq.<br>• Running rows carry the assignment's role label, pass ordinal and `lastActivity {text, at}` (RQ-15).<br>• Proposal summaries come with it (RQ-27, RQ-26).<br>Not every slice detail: that is the workflow scope.<br>• Slot occupancy comes as its own field, `slots {used, total}`, separate from the running rows. The client prints both (`Running 2 · slots 4/4`), because a cancel-requested assignment or an effect can hold a slot (FC-M36).<br>• The client groups `waitClass: operator` rows as **On the host**, apart from **Needs you** (FC-M35). No wire change. | SC-01 count tags, SC-02, FC-R01, FC-W07 | **open request**. S§5.2 L323 requires per-workflow views of the five facts; no cross-project index. The four-executing-attempt slot policy is S§6.1 L592; no `slots` field |
| RQ-02 | **Scoped sequence**: each subscription's updates carry `scope_seq` and `prev_scope_seq` for gap detection; coalesced snapshots are marked. The user-facing number is the ledger seq (RQ-37). | SC-10, FC-W01/02/06 | **provided** (S§5.2.1 L351: scope, epoch, sequence, change with its base sequence; S§5.3 L471 coalesced snapshots) |
| RQ-03 | **Handover facts as structured fields** per workflow and slice:<br>• commitment `{kind, ref, revision, digest, acceptedAt, by, obligations}`<br>• owner `{assignment \| human \| none, waitClass}`<br>• evidence `{kind, verdict, sourceDigest, currentHead}`<br>• blocker, next, advisory (RQ-38) | Handover float and list peek (`K`, `gk`), Track-row abnormal slot, SC-02, FC-R02, FC-M10 | **provided** for the facts (S§5.2 L323); shapes partial |
| RQ-04 | **Structured next human action**: `{actionKind, target, commandTypes[], basisRef, since, why, options?}`.<br>• `options` is the option count for a decision.<br>• The Brief builds each entry's move from these typed fields (`Answer Q1 · 3 options`). `why` is shown only as RQ-50 marks it.<br>• `actionKind: mergeMain` carries the proposal as `target` and the PR's `url`. It has no authority command, because the merge happens on the forge. | SC-02 entry heads, Track-row action segment, SC-19, FC-R05, FC-M51, FC-M58 | **partial**. `nextHumanAction {type, request, basis}` is provided (S§5.3 L467). `mergeMain` with its `url`, `why` and `options` are **open requests**. The human main merge itself is S§9.3 L1136 |
| RQ-05 | **Host-computed decision basis** for every decidable object: a digest plus labelled fields.<br>• **Every authority command** needs one, including `cancelWork`; the client never derives a basis.<br>• The basis for approve includes the checkpoint request with its captured settings revision and mode, the artifact and manifest, the annotation-set revision, explicit decisions, the intake digest where applicable, and the policy and workflow-policy-binding revisions.<br>• **It never includes the current dial:** changing checkpoint settings alone stales nothing (S§5.3 L473).<br>• The client renders whatever fields arrive, known or not (FC-M33). | SC-09, SC-04 readback, FC-M01, FC-M38, FC-W08 | **provided** (S§5.2.1 L351 decision bases in snapshots; S§5.3 L400 `expected`; S§5.3 L473 basis contents) |
| RQ-06 | **Permitted actions per object**, unavailable ones included, each with:<br>• a host-authored reason when unavailable. It appears on `K` over a disabled (`· off`) action segment, beside a greyed `␣a` which-key entry, and in the palette;<br>• EFFECT text, and **NOT text fixed per (command type, option kind)**, host-owned and not varied by state. This covers **every** authority command, including `requestRework` (the prototype had to invent its carries, effect and not), and **every** option kind of a decision. Approve: "edited draft not approved · no Contract accepted"; decide: "does not amend the Contract or spec"; cancel: "admitted effects are not undone"; recovery has one fixed NOT per option kind (recheck, associate, reissue, accept-risk);<br>• an `option` discriminator and `recommended` flag;<br>• `carries` text, e.g. notes carried as non-binding.<br>Host text never names a client key. | Track-row action segments, readbacks (SC-04, SC-09, SC-17), SC-12, SC-11, FC-M14, FC-M71 | **partial**. Exact available actions are provided (S§5.2.1 L351), and refusals carry a reason and repair (S§5.2.1 L353). Reasons for *unavailable* actions, EFFECT, NOT and carries text are **open requests** |
| RQ-07 | **Structured `stale_basis`**: sent basis, current basis, per-field change (old/new revision, refs, `changedAt {ledgerSeq, at}`, `changedBy`), added or changed annotation IDs, diff artifact refs, permitted next actions. | SC-10 stale reply, FC-M01, FC-L08 | **provided** (S§5.3 L429: current references, a readable difference, permitted next actions). Per-field `changedAt`/`changedBy` is partial (RQ-39) |
| RQ-08 | **Receipt query that never executes**, **principal-scoped**: another device of the same human may query or retry.<br>• Status enum `accepted \| duplicate \| command_conflict \| stale_basis \| refused{reason} \| unauthorized \| not_found` (RQ-36).<br>• Three restore statuses: `authority_epoch_mismatch` (the envelope's epoch is not the host's); `recovery_required` (the host is not admitting remote commands); `outcome_unknown_after_restore` (no receipt survives for a pre-restore command, which is not proof it was unsent).<br>• Refusal code `turn_state_changed` covers a send whose pinned mode no longer matches the turn (RQ-09).<br>• Stale and refused outcomes are recorded under the command ID.<br>• **Refusals** are `{code, refs, reason, repair[]}` (S§5.2.1 L353).<br>• **Reads** return exact bytes or a named `missing_content`, `unsupported_schema` or `unauthorized` (S§5.3.1 L497). | SC-10, FC-M04, FC-L12 | **provided** (S§5.2.1 L349–353; S§5.3 L429; S§5.3.1 L497, L509). `not_found`, `turn_state_changed` and `turn_ended` are **open requests** |
| RQ-09 | **Conversation model**:<br>• messages with stable IDs; author role `human \| assistant \| tool \| host`, model and assignment from host metadata;<br>• streaming deltas with UTF-8 byte offsets;<br>• tool-call records: name, argument summary, status, timing, bounded output ref;<br>• turn state;<br>• steering items with delivery state, `deliveredAfter {tool, message}` and receipt ID.<br>• Commands `sendMessage{mode: prompt\|steer\|followUp}` and `interruptTurn`, both with command IDs.<br>• Each author carries a **role class** `human \| coordinator \| reviewer \| worker \| host` and a host-written display label, which drive the role hue (`visual-language.md` §5.3). The fake host sends `human` with the label "you".<br>• Each tool call carries an **outcome** `running \| succeeded \| failed \| cancelled \| unknown` (the enum that drives the tint and the outcome word), plus `exitCode`, `ms` and `startedAt`. A separate short `status` text may add detail. The client never infers an outcome from output text (FC-S14).<br>• A steer that reaches an ended turn is refused with `turn_ended`; the client keeps the text as a draft and offers `␣cf` (follow-up).<br>• `sendMessage.mode` is taken from the **pin**, the composer header the user saw, and travels in the envelope. The host refuses a mismatch with the current turn state as `turn_state_changed`; the client keeps the draft and redraws the header.<br>• A candidate conversation carries its `candidate` letter as a field (RQ-30). | SC-03, FC-L03/04, FC-S10 | **partial**. Coordinator messages are commands (S§5.2 L323) and scoped coordinator-message views exist (S§5.2.1 L349). Steering, follow-ups, `interruptTurn`, turn state, the tool-call `outcome` enum, role classes and display labels are **open requests** |
| RQ-10 | **Pagination and caps**: messages by cursor (before/after an ID, limit, byte cap); facts since a ledger seq; artifacts by digest and byte range. Snapshot message windows cap each message's bytes (e.g. 64 KB) and mark it truncated with a fetch ref. | SC-03, FC-P02/04, FC-W09 | **partial**. Paginated history with stable cursors and explicit completeness is provided (S§5.2.1 L349, L351; S§5.3.1 L501), and artifacts are read by immutable ref (S§5.3.1 L497). Byte-range reads and per-message byte caps are **open requests** |
| RQ-11 | **Emission + manifest view**: revision, digest, prior-emission ref, nodes `{id, class, title, byteRange, headingRange}`, dispositions `{annotationId, disposition, reason, resultingRefs: [{nodeId, byteRange} \| {kind, id}]}`, challenger objections and dispositions, contested items, product questions, completeness. Review places previous-round dispositions in the margin by `resultingRefs`, and draws change bars from host byte ranges. | SC-04 | **partial** (stable node IDs and classes, S§8 L935; emission and manifest, S§8 L957; dispositions with a resulting reference, S§8 L961). Byte ranges in `resultingRefs` are the client's ask |
| RQ-12 | **Typed blockages**:<br>• `waitClass ∈ {human, operator, model, verify, effect, dependency, slot, cleanup, unsupported}`, reason text, refs, `since`, and `downstream {direct, transitive}`.<br>• `downstream` counts slices that depend on this one directly or transitively and are not yet integrated.<br>• A Brief entry and a Slices row show `blocks N` (transitive); the handover float shows both (`blocks 4 direct, 25 in all`).<br>• `operator` marks remedies the human performs on the host (a quarantine). | SC-02, SC-08, SC-16, FC-M13, FC-R06 | **partial**. Blockers are one of the five facts (S§5.2 L323), and an operation's blockage names its operation, attempts, affected dependents and safe choices (S§9.2 L1079). The `waitClass` vocabulary and `downstream` counts are **open requests** |
| RQ-13 | **Annotation model**: `{id, setRevision, emission, anchor {byteStart, byteEnd, nodeId, quote}, body, author {principal, device}, savedAt}`. `saveAnnotations{baseSetRevision, items[]}` is atomic. Edited bytes: complete bytes + base emission → retained hunks with IDs. | SC-04, FC-L05/06 | **partial** (S§8 L957–963: complete-byte saves, retained diff, hunk IDs, set revisions, conflicts). The anchor shape is the client's ask |
| RQ-14 | **Evidence records** per obligation:<br>• `summary` (≤ 60 characters) and `detail`;<br>• items (runner receipt, review verdict, audit finding) with times;<br>• bound source and target digests, verifier revision, role and independence, rank.<br>Also per slice:<br>• the current head;<br>• `commitsBehind` computed by the host;<br>• findings with severity, disposition and resolving commit, plus **finding→obligation links only where recorded** (the host never infers one);<br>• manual checks marked advisory;<br>• each item's catalog row kind (`generated`, `executed`, `journey`, `human`) and a maintenance status (`clean`, `changed`, `blocked`);<br>• a flag when the source changes `.gitattributes` or `.gitmodules`;<br>• the fidelity review's verdict on an intake;<br>• native checks unrun on Linux.<br>Pass lineage is RQ-44; web passages are RQ-46. | SC-07, SC-04, FC-M10, FC-S20 | **partial** (evidence views, S§5.2 L323; verification ranks and catalog rows, S§8.2; fidelity review, S§8 L945). Summary length, `commitsBehind` and the attribute flag are the client's asks |
| RQ-15 | **Assignment view**: id, generation, attempt, role and its short label, model, provider, effort, execution fact (`planned`, `starting`, `running`, `submitted`, `blocked`, `recovering`), cancellation state (`cancel-requested`, `quiescing`, `canceled`, `quarantined`), runtime `orphaned`, slot held, workspace bytes, since, conversation ref.<br>**`lastActivity {text, at}`**: a short diagnostic text with **its own host timestamp**, separate from the assignment's `since`.<br>• The Brief's Running rows print the text as content on the content bar and that time in chrome at the right (`editing evaluate.go` … `1 m ago`), so a stalled agent's line ages visibly (FC-M69).<br>• It is diagnostic, never evidence or state, and its text is agent-reported (RQ-50). | SC-02 Running rows, SC-08 Agents list and peek, FC-M16, FC-M55, FC-M69 | **partial**. Execution facts and the cancellation progression are provided (S§6.1 L590; S§6.3 L638–640), as are `orphaned` and quarantine (S§6.3 L640). **`lastActivity` is an open request:** the spec has no last-activity field. Telemetry is diagnostic only (S§6.2 L602), and heartbeat expiry is diagnostic only (S§6.3 L640) |
| RQ-16 | **Operation view**: kind with a host display label (`create draft proposal PR`, `update PR summary`, `publish source`, `mark proposal ready`), payload digest, state (planned, admitted, awaiting, unknown, observed, refused, risk, risk-held), attempts with executor epochs, observations with times, what it blocks, affected dependents, safe choices, next check, and a reference to its recovery decision (RQ-29). | SC-10 operation view, FC-M15, FC-M50 | **provided** (S§9.2 L1067–1079, Fig. 10; sticky duplicate risk S§9.2 L1077) |
| RQ-17 | **Facts since a ledger seq**: typed immutable facts `{id, seq, at, by, type, text, refs}`, pageable. Used for an open object's "what changed" list after a reconnect. **Not used by the Brief's "since you left" line**, which diffs two snapshots locally (§1). | SC-10 fresh snapshot, FC-R04 | **partial**. History pages per workflow, proposal or assignment with a fixed cutoff and explicit completeness are provided (S§5.3.1 L501), as is `history.completeThroughSequence` (S§5.3 L451). A cross-scope "facts since seq" read is an **open request** |
| RQ-18 | **Connection and host status**:<br>• a distinct revocation event;<br>• host time on every snapshot and update, **with UTC offset**;<br>• server version and capabilities.<br>• Every snapshot carries `authorityEpoch`, `hostMode` (`active \| admission-disabled \| recovery-reconciling \| blocked`) and the backup block: `targetExposedWorkSeconds`; `verifiedOffHostCutoffSequence`; `cutoffRecordedAt` and `verifiedOffHostAt`; `health`; `restoreStatus`; the count of acknowledged commits after the cutoff.<br>• After a restore the host refuses backed-up device credentials with a reason the client shows (`re-pair this device`).<br>• The target is displayed as a target, and `restoreStatus` tells "configured", "copy observed" and "restore verified" apart (S§5.3.1 L503).<br>Host time also drives every age the client prints and the "since you left" times; the client never uses its local clock for them (FC-M12). | SC-01 statusline host segment, SC-02 since line, SC-10, FC-M12, FC-M20, FC-M31, FC-W12 | **partial**. `hostMode`, `authorityEpoch` and the backup block are provided (S§5.3 L441–450; S§5.3.1 L503), as are revocation metadata (S§5.1 L315) and the invalidation of backed-up credentials on restore (S§5.3.1 L507). **Host time on every snapshot and update** and **the count of acknowledged commits after the cutoff** are open requests: the illustrative snapshot has neither, though S§5.3.1 L503 requires the unprotected work to be shown |
| RQ-20 | **Forward compatibility**: the client declares its **version and the resource kinds it understands**; the host marks objects the client cannot render with `unsupported {reason, requiresClient: ">=0.4"}`. An unknown frame version refuses with an upgrade instruction. | SC-10, FC-M17, FC-W04, FC-W13 | **partial**. Unknown frame versions refuse with an upgrade instruction (S§5.2.1 L351), and reads name `unsupported_schema` (S§5.3.1 L497). Declared client kinds and per-object `unsupported` marks are **open requests** |
| RQ-21 | **Search** across artifacts and conversations, or an explicit decision that search is client-side. | SC-11, T24 | **open request** (Q15); the spec offers paginated history, not search |
| RQ-22 | **Canvas artifact kind** (future): kind, revision, snapshot ref, shape-ID anchors. | SC-14 | **deferred** |
| RQ-23 | **Artifact metadata**: content type, size, digest, inertness; byte-range fetch; `nosniff`, sandboxing headers; no remote resources. | SC-04, FC-S07/08 | **partial**. Media type, digest, length and provenance are provided, and attachment reads cannot execute or grant (S§5.2 L327; S§5.3.1 L481–497). Byte-range fetch and response headers are **open requests** |
| RQ-24 | **Command IDs**: client-generated, namespaced by principal and device, stable across retries. The outbox stores the envelope bytes, **including the `authorityEpoch` it was sent under**. | SC-10, FC-L03, FC-L12 | **provided** (S§5.3 L397: epoch in the envelope; L411: IDs namespaced by authority epoch and principal, and a second device of the same human may retry the original command. The spec notes cross-device retry is unverified) |
| RQ-25 | **Hierarchy, names and IDs**: rows, links and views carry host object IDs (`workflowId` and so on) alongside display paths and a human **`title`**, so the client never parses paths. The Brief's bylines and the Slices list print the title. | SC-02, SC-11, SC-16 | **open request**. The spec identifies objects by refs (S§5.3.1 L481–494) but names no client-facing `title` or `workflowId`/display-path pairing |
| RQ-26 | **Proposal readiness, four separate views** (S§9.3 L1134), on the proposal summary:<br>• `eligibility {state, gaps[{kind, short, full}]}`, gaps ordered integration → divergence → publication → association → evidence, `short` at most 18 characters;<br>• `mapping {canonical, published?, behindSince?, divergence?}`, plus `integration {integrated, required, lastQualifying}`;<br>• `promotion {state: not-eligible \| pending \| admitted \| unknown \| observed \| unsupported, basis, reason?}`;<br>• `forge {state: not-created \| draft \| ready \| open \| closed \| merged, pr?, observedAt?, completeness, text?}`;<br>• `risk {duplicate: none \| sticky, since?}`;<br>• `mainMerge? {observedAt, mergedSource, matchesReviewed}`. | SC-16 Proposals list and peek, SC-19, FC-M48, FC-M49, FC-M59 | **partial**. The four views are required to stay separate (S§9.3 L1134); `proposalProgress` is illustrated (S§5.3 L459); sticky duplicate risk is S§9.2 L1077; the merge observation and its evidence gap are S§9.3 L1136. Ordered gaps with short forms are the client's ask |
| RQ-27 | **Proposal summaries on the attention index**: `{id, project, name, title, shape, readiness}` (readiness is RQ-26). `shape {kind: investigation \| experiment \| bug \| performance \| change \| design \| verify-create \| verify-maintain, supplied: human \| classifier, confirmed, path[{phase, state}]}`.<br>• The Track's design zoom draws phases only from `path`, so a shortened path shows no Seams or Modules (FC-M54).<br>• Slice marks come from the slices scope (RQ-41), not here. | SC-02 Track, SC-16, FC-M54 | **partial**. The task shape path is in the snapshot (S§5.2.1 L351); shape supply and confirmation are S§8 L931. Summaries on a cross-project index are an **open request** (RQ-01) |
| RQ-28 | **Facts on update frames**: every update carries the facts it commits (`{id, summary, refs}`), which drive the echo row's arrivals message and "what changed". | SC-01 echo row, SC-10 fresh snapshot | **partial**. A receipt lists the facts it committed (S§5.3 L416–426), and facts are separately retrievable (S§5.3 L471). Facts on update frames are an **open request** |
| RQ-29 | **Structured decision object**: `{id, kind: product \| recovery, state, question, evidence[], options: [{n, title, body, recommended}], source {report, commit, round}, related[], history[], answer?}`.<br>• Answers are an option plus free text (real ledger decisions are free text).<br>• The option field is named `body`, following the fake host; `title` renders on its own line above it.<br>• `question`, `evidence`, option `title` and `body` are **agent-authored content** and say so (RQ-50). The Brief shows the question on the content bar, never as chrome. | SC-09, SC-02 ask line, SC-10 operation view, FC-S25 | **partial**. Product questions stop with options and a recommendation (S§8 L939), and recovery decisions exist (S§5.3.1 L509). The structured object and its authorship marking are **open requests** |
| RQ-30 | **Turn artifacts and sibling conversations**: per conversation, the artifacts produced in the current turn. Per workflow, its other conversations, as **structured fields**, not a display string:<br>• `{role, candidate: "a" \| "b" \| "c" \| null, assignment, model, state, since}`;<br>• the `candidate` letter and `assignment` are the distinguishing keys the roster never cuts (FC-Q18);<br>• a short role `label` per role (`candidate` for `experiment-candidate`). The client shows the label and never derives one; without it, it shows the full role id;<br>• turn artifacts as `{key, state, kind?, at?, message}`; `message` anchors it in Chat's right margin. The client shows kind and time only when sent.<br>Text fields here are host values; any agent-written summary must be marked as content (RQ-50). | SC-03 roster (left margin) and artifacts (right margin) | **open request**. Candidates belong to checkpoint revisions (S§6.1 L590); no structured sibling or turn-artifact fields |
| RQ-31 | **Experiments**: `{id, title, state, candidatesDone, candidatesTotal, protocol {artifact}, assignments[], falsifier, result? {favouriteDisproved, summary}}`. | SC-04 left margin, SC-03 | **partial** (protocols and retained results, S§8 L939, L993) |
| RQ-32 | **Hunk identity**, **resolved by the design:** the host never cites client-computed hunk IDs. Dispositions cite nodes and byte ranges (RQ-11), and the client maps byte ranges to its own change bars and diff hunks. | SC-04 change bars and compare lens | **resolved** |
| RQ-33 | **Agents scope**: a subscription with every assignment across workflows, slot usage, retained-workspace quota, and a per-assignment lifecycle log plus cleanup state (process alive, workspace reuse, admitted effects before the fence, late output, next step). Each assignment carries `lastActivity {text, at}` (RQ-15). The Agents peek prints the lifecycle log and the host's remedy. | SC-08 Agents list and peek, SC-02 Running rows | **partial**. Slot and workspace policy is S§6.1 L592; the cancellation lifecycle and quarantine are S§6.3 L638–640. A cross-workflow scope and `lastActivity` with its own timestamp are **open requests** |
| RQ-34 | **Retained change requests**: an object of its own, `{id, state: retained, binding: false, base {checkpoint, revision, digest}, by, savedAt, items[]}`. A save that lands after an approval gets the receipt result `retained_change_request`. | SC-10 stale reply ordering 2 | **provided** (S§8 L963); shape partial |
| RQ-35 | **Typed unsupported tasks**: `{kind: task-definition-missing, definition, assignment, generation, retained {ownership, evidence}, nothingReset: true, recovery: [{choice, text}]}`. | SC-10 | **provided** (S§10 L1274; S§11 L1341); shape partial |
| RQ-36 | **Receipt status `not_found`**: the host has no record of the command. It is not proof that the command was never committed while the original request may still be in flight, so the only safe next step is the identical retry. | SC-10 outbox | **open request** (the spec names no such status; its unknown-outcome rule is S§5.3 L429) |
| RQ-37 | **User-facing sequence = ledger seq**: the statusline shows the global ledger seq (`seq 18342`, or `seq N · as of T` when not live), comparable across views; scope seqs stay internal. The host segment's `protected to seq N` uses the same sequence. | SC-01 statusline | **provided** (S§5.3 L471: Render sequence; S§5.3.1 L503: protected cutoff) |
| RQ-38 | **Advisory items in the handover**: `advisory: [{kind, ref, text}]` next to `blocker: null` (for example, a running experiment that informs but does not block). | Handover float blocker column, Track-row abnormal slot | **partial**. Advisory human checks are in the snapshot (S§5.2.1 L351); advisory running work beside the blocker is an **open request** |
| RQ-39 | **Per-field digests in `expected`**: a command echoes each basis field it relied on (revision and digest), not only the overall digest, so a stale reply can name exactly which field moved. | SC-10 stale reply, SC-04 readback | **partial**. Per-field revisions in `expected` are provided (S§5.3 L400); per-field digests are an **open request** |
| RQ-41 | **Slices scope**:<br>• A subscription, `slices`, opened only while the Slices list is open.<br>• Every slice of every non-archived proposal: `{id, workflowId, project, proposal, title, lifecycleState, stateClass, reason, since, downstream {direct, transitive}, assignment summary, nextHumanAction kind, lastFact}`, in host-defined dependency order. `id` and `workflowId` are both full paths (`minos/native-engine/execute-symbolic-calls`), because short slice ids repeat across proposals.<br>• Per-proposal and per-project counts per lifecycle state. They drive the filter float and the Proposals peek.<br>• The **lifecycle-state vocabulary**: per state `{state, label, markClasses[], open: bool}`, the first mark class being the usual mark (e.g. `awaiting_review → "awaiting review" → [running, waiting], open`). The host, not the client, decides which states count as open, so "all open" and the empty-filter default follow the host (Q32).<br>• Archived proposals by page on request (RQ-10).<br>**Measured on the accepted fake host:** 10 states; 102 slices in 7 non-archived proposals; 87 archived slices by page; 60.9 KB, about 611 B per slice, against a 64 KB budget. The client filters locally, so no server-side filter API is needed in v1. | SC-16, T32 | **open request**. Proposal and Slice status views are required (S§5.2 L323), and Slice lifecycle states exist apart from assignment facts (S§6.1 L590). A cross-proposal index and a lifecycle vocabulary with `open` flags are not specified |
| RQ-42 | **Reference index per workflow scope**:<br>• The host publishes the references it already knows in scope as one resource, `references: [{label, kind, target: Ref \| null, state: resolved \| dangling, reason?}]`. It covers obligations, findings, nodes, decisions, report revisions, Contracts, commits, receipts, assignments, operations and spec sections, and updates like any resource.<br>• `label` is the exact display form (`grammar.md` §4.2): ASCII plus `·` and `§`.<br>• The client applies the reference style to an **exact, whole-token match** of an indexed label outside code, and the dangling style when the index says `dangling`.<br>• Only indexed labels match, so lookalikes and homoglyphs do not (FC-S04, FC-S15).<br>• The host parses no Markdown for this. | SC-03, SC-04, SC-09, T23 | **open request** |
| RQ-43 | **Multi-scope stream**:<br>• The host offers **one** update stream for a list of scopes, e.g. `GET /stream?scopes=attention,slices,workflow:…,conversation:…`, besides or instead of one stream per scope.<br>• Each frame names its scope and carries that scope's `scope_seq` and `prev_scope_seq` (RQ-02). A gap in one scope resnapshots only that scope.<br>• Scopes can be added and removed on the open stream (`subscribe` / `unsubscribe` frames, or re-open with the new list and per-scope resume points).<br>• Snapshot frames per scope come first, then updates. Readiness is per scope, so one slow scope doesn't block the others.<br>**Why**: the Brief, the count tags and an open work view need attention, workflow and conversation scopes at once; one connection gives readiness and gap handling per scope. A web or debug client over HTTP/1.1 needs it most (6 connections per origin; E-PROTO-3 deviation 3), but the requirement stands without one. The adapter hides which form is used (`HostAdapter::subscribe`). E-PROTO-4 implemented and tested it in the accepted package's prototype (`/observe?scopes=`; 263 tests). | All screens; FC-W11 | **partial**. Scoped snapshot/NDJSON observation is provided (S§5.2.1 L349); one stream over several scopes is an **open request** |
| RQ-44 | **Pass view** per Slice or Record work (S§6.2.1, S§9.4, S§5.2 L323):<br>• `passes[]`, each with `ordinal`;<br>• `openedBy {cause: first \| watchdog-rework \| preparation-conflict \| verifier-repair, ref}`;<br>• `audit {state: not-started \| running \| done, examined {digest}, reports[{context: standards \| contracts, ref, state}], dispositions[{finding, disposition: fixed \| considered \| dismissed \| needs-human, reason, refs}]}`;<br>• `handoff? {submitted {digest}, receipt}`;<br>• `preparations[{attempt, target {digest}, outcome: clean \| conflict \| error \| superseded, prepared? {digest}, at}]`;<br>• `watchdog[{round, reviewed {digest}, target {digest}, verdict, counted, drift}]`;<br>• also `current`, `completedReviews`, `completedReviewLimit`.<br>**Track forms:** a Slice's Track (`✓ Contract — ↺ Pass 1 — ◆ Pass 2 — ◌ Integrated`) is drawn from the accepted Contract, `passes[]` and recorded integration; the pass zoom (the Evidence proof chain) from one pass's `audit`, `handoff`, `preparations` and `watchdog`. The client draws only what these fields give. | SC-07, Track row, handover float, SC-19 Slice rows, FC-M40–M43 | **partial**. Pass lineage, opening causes, one Audit per pass and review counting are specified (S§6.2.1 L620–634; S§6.4 L708), and delivery views must expose current pass/Audit status and lineage (S§5.2 L323). The field shapes are the client's ask |
| RQ-45 | **Local-verification prompt** (S§5.2.2, S§5.3 L460): snapshot `localVerification {promptAvailable, source, missing[], advisory}`; artifacts `{ref, kind: local-verification-prompt, version, basis {proposal, source, contracts}, published: yes \| no \| unknown, verificationAsset, linuxEvidence[], gaps[], missing[], advisory: true, createdAt, supersedes?}`; command `requestLocalVerificationPrompt {proposal, source, basis}`, whose receipt carries the new artifact ref. | SC-18, SC-07, SC-19, FC-M46, FC-M47 | **provided** (S§5.2.2 L357–386; S§5.3 L460; S§4 L267) |
| RQ-46 | **Web attempts and retained web evidence** (S§6.6 L767–786):<br>• web tool-call records gain `attempts[{provider (short label ≤ 8 characters), extractor, version, observationId, observationLabel, request, finalUrl?, outcome: ok \| partial \| failed \| timeout-uncertain \| canceled \| interrupted \| not-attempted, failure? {class, text}, completeness, digest?, at}]` and `resultHandle {state: available \| expired \| unavailable}`;<br>• evidence items gain kind `web-passage {passageRef, url, finalUrl, query, provider, extractor, version, observationId, observationLabel, observedAt, digest, completeness, claimRef}`. | SC-03, SC-07, FC-M52, FC-M53, FC-M56, FC-S19 | **provided** for behaviour (S§6.6 L767–786: classified fallback, uncertain timeouts, distinct observation identities, expired handles); shapes partial |
| RQ-47 | **Checkpoint routing and review policy** (S§4 L267, S§5.3 L457–463, S§6.4):<br>• `checkpointSettings {currentRevision, modes {seams, modules, proposal}, changedBy, changedAt, history[]}`.<br>• Every checkpoint request and pending decision carries `{requestId, stage, capturedSettingsRevision, mode, agreedScopeRef}`.<br>• Decisions carry `decidedBy`, either `{kind: human, principal, device}` or `{kind: delegated, machineActor {assignment}, capturedSettingsRevision, scopeRef}`.<br>• `policy {revisions[{revision, completedReviewLimit, minimumEvidenceRank, reviewerDiversity, createdBy, at}], default, bindings[{workflow, revision, bindingRevision}]}`.<br>• Commands `setCheckpointSettings {expectedRevision, modes}`, `savePolicyRevision {baseRevision, fields}`, `adoptPolicy {workflow, revision, expectedBindingRevision}`, each with a host decidable whose EFFECT and NOT name the pending requests that keep their capture, or the decisions that go stale.<br>• A delegated request's EFFECT says notes must be answered before it advances.<br>The captured mode also decides the Track: a delegated stage draws the `bot` mark, never the coral ◆ (FC-M09). | SC-17, SC-04 Track row and header, FC-M09, FC-M38, FC-M44, FC-M45 | **provided** for behaviour (S§6.4 L686–708); shapes partial; EFFECT and NOT text as in RQ-06 |
| RQ-48 | **Project-scoped commands and scopes.** The envelope's scope is a tagged union, `{workflow: id} \| {project: id}`. `setCheckpointSettings`, `savePolicyRevision` and `adoptPolicy` are project-scoped; `adoptPolicy` names its workflow. Observation offers `project-settings:<project>` as a scope (RQ-43). `expected` (S§5.3 L400) binds as before. | SC-17 | **partial**. Settings are one record per project (S§6.4 L690); a project-scoped envelope and observation scope are **open requests** |
| RQ-49 | **Merge package view**, per proposal, fetched when the Proposal page opens:<br>• `intake {ref, digest, sliceCount, acceptedBy, at}`;<br>• `source {canonical {rev, commit}, published? {rev, commit}, pr {id, state}}`;<br>• `checks {passed, required, weakestRank, minimumRank}`;<br>• `readiness` (RQ-26);<br>• `findings[{id, severity, slice, text}]`, `deviations[{id, slice, text, pass}]`, `uncertainties[{id, text, refs}]`. The page counts each kind separately and never pools them;<br>• `advisory[{name, state}]`;<br>• `localVerification` (RQ-45);<br>• `slices[{id, name, contract, pass, auditExamined, integrated {rev, commit}, watchdog {round, verdict, reviewed}, fixed}]` in dependency order. | SC-19, FC-M58 | **partial**. The package's content is required (S§9.3 L1136); the view shape is the client's ask |
| RQ-50 | **Authorship of text fields shown in chrome.** Every free-text field the client may draw outside a document or transcript says whether it is **host-authored** (a wait class, a host remedy, a state word) or **agent-authored content** (a decision's question, a blocker's free text written by an agent, `lastActivity`, a coordinator's `why`, turn-artifact summaries).<br>• The Brief draws content-typed fields only as content: `prose.small` on the 2 px content bar, at most two lines.<br>• Host values keep their label (`blocker none · 1 uncertainty`).<br>• A field without a mark is drawn as content, the safe failure. | SC-02 ask lines and Running rows, SC-08 peek, FC-S25, FC-M63 | **partial**. Agent-authored bytes are untrusted (S§5.2 L327), artifacts carry provenance (`createdBy`, S§5.3.1 L481–494), and roles distinguish model assertions from captured results (S§6.2 L600). **Per-field authorship on snapshot text fields** is an open request |

## 4. Command catalogue used by the keymap

`keymap.toml` lists these wire types; lint KL7 checks this table.
- The "Expected basis" column documents the minimum the host is expected to send. The readback renders the host's `Basis.fields`, so the keymap lists no fields.
- Every envelope carries `authorityEpoch` (S§5.3).
- "Union" is the closed command union in S§4 L267.

| Wire type | Tier | Union | Expected basis | Notes |
|---|---|---|---|---|
| `createDesign` | write | create design | — | prompt text; starts Ground |
| `saveAnnotations` | write | save annotations | annotation-set revision, emission | atomic over all drafts |
| `saveEditedBytes` | write | (save annotations) | base emission | complete bytes + base; S§8 L957 |
| `sendMessage` | write | **not in the union** (coordinator messages, S§5.2 L323) | conversation, turn (for a steer), **pinned mode** | modes prompt/steer/followUp; mismatch → `turn_state_changed` (RQ-09) |
| `interruptTurn` | write | **not in the union** | conversation, turn | does not cancel the assignment |
| `queryReceipt` | local | (receipt lookup, S§5.2.1 L349) | — | read-only (RQ-08, RQ-36) |
| `resend` | write | (any) | the stored envelope, byte-identical | not a new command; the host deduplicates |
| `approveCheckpoint` | decide | approve checkpoint | per-field: **checkpoint request (captured settings, mode)**, emission, manifest, annotations, decisions, intake, policy, policyBinding (RQ-05, RQ-39) | also covers approve-with-notes: it approves the original bytes (S§8 L959) |
| `requestRework` | decide | rework (S§5.2 L323; not named among the S§4 L267 examples) | emission, annotations, policy | needs a saved concern; EFFECT, NOT and carries are an open request (RQ-06) |
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

## 5. Open requests to the server spec

The accepted spec leaves route and shape detail to implementation (S§5.2.1 L349). The Brief needs these from it, none of which the spec text provides today. Each is checked against the spec text; none is assumed.

**New with the Brief:**
- **`lastActivity {text, at}` per assignment, with its own host timestamp** (RQ-15, RQ-33). The spec has no last-activity field; telemetry and heartbeats are diagnostic only (S§6.2 L602, S§6.3 L640).
- **Authorship of free-text fields** shown in chrome: content vs host value (RQ-50, RQ-29, RQ-30). Only artifact provenance exists (S§5.3.1 L481–494).
- **EFFECT, NOT and carries text for every authority command and option kind**, including `requestRework` (RQ-06), plus host-authored reasons for unavailable actions. The spec provides available actions (S§5.2.1 L351) and refusal reasons (L353) only.
- **Host time on every snapshot and update**, with UTC offset (RQ-18). The Brief's ages, the "since you left" times and `as of T` depend on it. Not in the illustrative snapshot (S§5.3 L436–468).
- **`title` and host object IDs** on every row and view (RQ-25). The Brief's bylines need the title.
- **`options` count and `why`** on the next human action (RQ-04), which build the Brief's move text.

**Carried over from the accepted package, still open:**
- **Cross-workflow views:** the attention index (RQ-01), the slices scope with its lifecycle vocabulary (RQ-41), the agents scope (RQ-33), one multiplexed stream (RQ-43), cross-scope facts since a seq (RQ-17).
- **Conversations and streaming detail:** RQ-09, RQ-10 byte caps, RQ-30, including `turn_state_changed`, `turn_ended`, `interruptTurn` and the tool-call `outcome` enum.
- **The reference index** (RQ-42). Without it, content references render plain, which is the safe failure.
- **`not_found`** on the receipt query (RQ-36), **`waitClass` and `downstream`** on blockages (RQ-12), **facts on update frames** (RQ-28).
- **Project scope** on the envelope (RQ-48), **`mergeMain`** with its `url` on the next action (RQ-04), the **package view** shape (RQ-49), **per-field digests** in `expected` (RQ-39), **advisory running work** beside the blocker (RQ-38).
- **The count of acknowledged commits after the protected cutoff** (RQ-18), needed for `+2 unprotected`.
- **Declared client kinds** and per-object `unsupported` marks (RQ-20); **byte-range artifact reads** and response headers (RQ-23); **search** or an explicit client-side decision (RQ-21).

## 6. Questions for the implementation

1. Is the observation sequence global or per scope? This design shows the ledger seq to the user and detects gaps with a scope seq (RQ-02, RQ-37).
2. Are chat sends Ledger commands with receipts, or Engine-level messages? The client needs idempotency either way (RQ-09).
3. Who may revoke a device? Deferred to the host's admin interface in v1 (Q16).
4. Resource-granular typed upserts plus facts as the update model (§1.1)?
5. What is Render's slice lifecycle-state vocabulary, and which states are "open"? The Slices list filters on it (RQ-41, Q32).
6. Does the backup block include the count of acknowledged commits after the verified cutoff? The statusline host segment wants `+2 unprotected` and "unprotected since seq N" (RQ-18, FC-M31).
7. Which snapshot text fields are agent-authored? The Brief must draw those only as content (RQ-50).

## 7. Deliberately not required

- No Chord document operations or Durable `watch()` frames on the wire.
- No client-side Kernel rules, digest computation or auto-rebase.
- No offline command queue (FC-L11).
- No resume cursor in v1 (§1).
- No host support for "since you left": the client diffs its own stored `seenBrief` (§1).
- No browser cookies, Origin or CSRF machinery for this client. Enrollment does not expire and is revocable.
- No descriptive issue mirroring.
