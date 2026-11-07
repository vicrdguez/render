# render-core

Pure client core for the Render desktop app. It owns the typed domain model, the host reducer,
read bases, authority readbacks, drafts, the outbox and pinning. It has no rune, no IO, no
clock and no wire types. The app runs every effect; the host adapter turns `CommandIntent` into
bytes and wire frames into `Inbound`.

## Local policy drafts (`src/policy.rs`, re-exported at the crate root)

- `PolicyDraft::new(base_revision, host_fields)` copies the revision and ordered host fields. Use `SettingsView.policy_default` and `policy_fields`; do not substitute the settings routing revision or object revision.
- Read-only accessors: `base_revision()`, `base_fields()`, `fields()`, `conflicts()`. Base fields retain the original host values for the current base revision; editing never changes them.
- `edit_field(name, value)` explicitly chooses a value and clears that field's conflict, even when reaffirming the same local value. Existing positions stay stable; new fields append. Do not replay every untouched composer field through this operation to resolve conflicts implicitly.
- `rebase(revision, host_fields)` is explicit: untouched fields take the host value, local edits survive, and unequal changes on both sides become `PolicyConflict { field, yours, current }`. Identical concurrent changes do not conflict. Outstanding conflicts remain unresolved across further rebases until an explicit edit. Current host order comes first, then local-only fields in their previous order. Unknown names are ordinary fields; host removals drop untouched fields but preserve edited values with `current: None` conflicts. Local field deletion has no wire representation in `Authority.edits`; this API edits/adds string values, not deletion sentinels.
- `safe_edits()` returns only values different from the current base, in field order, or `PolicyDraftError::UnresolvedConflicts`. This helper checks conflicts, not host freshness.
- Persist via `DraftBody::Policy(PolicyDraft)` and `Client::edit_draft`; serde preserves the base, values and unresolved conflicts exactly. Host arrival never rebases or rewrites this state. After explicit rebase/edit, replace the draft through `edit_draft` to advance its generation. The typed draft's base revision is authoritative; its existing `DraftKey.base` may still identify the original draft.
- `SavePolicyRevision` requires a typed policy draft for the target (`NoDraft` for legacy `Edits`). `open_readback` and `confirm` refuse `PolicyConflicts` or `StalePolicyDraft` against the host's current `policy_default`. A draft edited after readback requires a new readback (`WrongState`). Outbound `CommandBody::Authority.edits` remains an ordinary ordered vector, never encoded JSON.
- The app must explicitly coordinate stale acknowledgement and fieldwise rebase before reopening a policy readback; core acknowledgement alone does not rebase a draft. Composer wiring and that UI acknowledgement flow are separate integration work.

## Model (`src/model.rs`, re-exported at the crate root)

- Ids are opaque strings: `ObjectId`, `ProjectId`, `CommandId`, `Epoch`, `Revision`, `Digest`. `Seq` is `u64`.
- Time: `HostTime { utc_ms, offset_min }` is only parsed from host fields. `Moment { clock: ClockId, at: Duration }` is a local monotonic instant. `HostClock::now(Moment)` gives ages that keep advancing offline.
- `Text::{Host, Content}` marks authorship (RQ-50). Unmarked host text must be decoded as `Content`.
- `HostSnapshot` is the host mirror: `host_name`, `server_version`, `connection`, `admission`, `epoch`, `seq`, `host_time`, `cursors`, `needs_snapshot`, `objects`, `object_scope`, `attention { rows, proposals }`, `slots`, `slices { rows }`, `lifecycle_states`, `agents { rows, totals }`, `references`, `unsupported`, `undecodable`, `facts`. `Default` is an empty, connecting mirror.
- `Object { id, revision, title, project, workflow, handover, next, track, decidables, body }`. `object.kind()` derives `ObjectKind` from `body`, so the two can't disagree. `ObjectBody::{Review, Chat, Evidence, Decision, Proposal, Settings, Operation, LocalPrompt, Unsupported}`.
- `Handover { commitment, owner, evidence, blocker, advisory }`, `Next::{Nothing, Act(NextAction)}`, `Track { zoom, stages, calm }`.
- Lists: `AttentionRow` (with `group: AttentionGroup`), `ProposalSummary`, `SliceRow`, `LifecycleState`, `AgentRow` (with `group: AgentGroup`), `Slots`, `AgentTotals`, `Reference`.
- Roles and tools: `Role { class: RoleClass, label }`, `ToolCall { outcome: ToolOutcome, .. }`, `WebAttempt`.
- Authority: `Decidable { target, subject, basis, actions }`, `Basis { digest, fields: Vec<BasisField> }` in host order, `HostAction { command, option, option_kind, recommended, availability, effect, not, carries }`.
- `CommandType` lists all 17 command types with `keymap_wire()`. `AuthorityVerb` lists the eight `␣a` verbs with `keymap_id()` (`auth.approve` … `auth.cancel`), `from_keymap_id`, and `command_types()`.
- Inbound: `Inbound::{Connection(ConnectionEvent), Admission, Snapshot { scope, at: Cursor, resources }, Update { scope, at, prev_scope_seq, changes, facts }, Delta, Receipt { command, outcome }, Lost { command }, Undecodable}`. `Scope::{Attention, Agents, Slices, Object(id)}`. `Resource` and `Change::{Upsert, Remove(ResourceKey)}` are typed whole-resource replacements.
- Outbound: `CommandIntent { id, command, target, scope: EnvelopeScope, epoch, expected, body: CommandBody }`. `PreparedCommand { id, format, bytes, summary }` holds adapter bytes; retries resend them unchanged.
- `ReceiptOutcome::{Accepted{seq}, Duplicate{seq}, CommandConflict, StaleBasis(StaleReply), Refused{..}, Unauthorized, NotFound, TurnStateChanged, TurnEnded}`.
- `DeviceState` is the persisted device record (serde): `device_id`, `next_command`, `drafts`, `outbox`, `read_bases`, `evidence_shown`, `marks`, `jumplist`, `seen_brief`, `ex_history`, `notes_written`.
