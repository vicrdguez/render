//! Typed domain model shared by the host adapter, the core reducer and the app.
//!
//! `None` on a host field always means the host did not provide it. Screens show it as
//! unavailable (`not observed yet`, `none`, `· off`) and never substitute a value.
//!
//! Host-fact serde support is a private device-cache encoding, not a production wire DTO.
//! Loading these facts does not establish live authority; the app cache boundary must
//! invalidate scope freshness before exposing them to the client.

#![allow(
    clippy::large_enum_variant,
    reason = "plain data moved rarely; boxing variants would burden every match"
)]

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

pub type ObjectId = String;
pub type ProjectId = String;
pub type CommandId = String;
pub type Epoch = String;
pub type Revision = String;
pub type Digest = String;
pub type Seq = u64;

/// Host wall time with its UTC offset. Only ever parsed from host fields.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct HostTime {
    pub utc_ms: i64,
    pub offset_min: i16,
}

impl HostTime {
    pub fn plus(self, elapsed: Duration) -> HostTime {
        HostTime {
            utc_ms: self.utc_ms + elapsed.as_millis() as i64,
            offset_min: self.offset_min,
        }
    }
}

/// Identifies one monotonic clock. Two moments compare only when their clocks match.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ClockId(pub u64);

/// A local monotonic instant from the app's frame or input clock.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Moment {
    pub clock: ClockId,
    pub at: Duration,
}

/// Host time at receipt plus the local monotonic instant it was received.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HostClock {
    pub host: HostTime,
    pub received: Moment,
}

impl HostClock {
    /// Host time now: host time at receipt plus local monotonic time elapsed. `None` when
    /// `now` is from another clock or earlier than the receipt.
    pub fn now(&self, now: Moment) -> Option<HostTime> {
        (now.clock == self.received.clock && now.at >= self.received.at)
            .then(|| self.host.plus(now.at - self.received.at))
    }
}

/// Who wrote a free-text field (RQ-50). Unmarked fields are `Content`, the safe failure.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Text {
    /// Host value: may sit in chrome.
    Host(String),
    /// Agent-authored or unmarked: content lanes only.
    Content(String),
}

impl Text {
    pub fn as_str(&self) -> &str {
        match self {
            Text::Host(s) | Text::Content(s) => s,
        }
    }
    pub fn is_content(&self) -> bool {
        matches!(self, Text::Content(_))
    }
}

// ---------------------------------------------------------------------------------------------
// Commands and authority
// ---------------------------------------------------------------------------------------------

/// Every command type the client can send. Wire names live in the adapter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum CommandType {
    CreateDesign,
    SaveAnnotations,
    SaveEditedBytes,
    SendMessage,
    InterruptTurn,
    RequestLocalVerificationPrompt,
    ApproveCheckpoint,
    RequestRework,
    RecordDecision,
    ConfirmShape,
    AcceptIntake,
    AcceptAmendment,
    SupersedeContract,
    CancelWork,
    SetCheckpointSettings,
    SavePolicyRevision,
    AdoptPolicy,
}

impl CommandType {
    pub const ALL: [CommandType; 17] = [
        CommandType::CreateDesign,
        CommandType::SaveAnnotations,
        CommandType::SaveEditedBytes,
        CommandType::SendMessage,
        CommandType::InterruptTurn,
        CommandType::RequestLocalVerificationPrompt,
        CommandType::ApproveCheckpoint,
        CommandType::RequestRework,
        CommandType::RecordDecision,
        CommandType::ConfirmShape,
        CommandType::AcceptIntake,
        CommandType::AcceptAmendment,
        CommandType::SupersedeContract,
        CommandType::CancelWork,
        CommandType::SetCheckpointSettings,
        CommandType::SavePolicyRevision,
        CommandType::AdoptPolicy,
    ];

    /// The keymap's `wire` name for this command type.
    pub fn keymap_wire(self) -> &'static str {
        match self {
            CommandType::CreateDesign => "createDesign",
            CommandType::SaveAnnotations => "saveAnnotations",
            CommandType::SaveEditedBytes => "saveEditedBytes",
            CommandType::SendMessage => "sendMessage",
            CommandType::InterruptTurn => "interruptTurn",
            CommandType::RequestLocalVerificationPrompt => "requestLocalVerificationPrompt",
            CommandType::ApproveCheckpoint => "approveCheckpoint",
            CommandType::RequestRework => "requestRework",
            CommandType::RecordDecision => "recordDecision",
            CommandType::ConfirmShape => "confirmShape",
            CommandType::AcceptIntake => "acceptIntake",
            CommandType::AcceptAmendment => "acceptAmendment",
            CommandType::SupersedeContract => "supersedeContract",
            CommandType::CancelWork => "cancelWork",
            CommandType::SetCheckpointSettings => "setCheckpointSettings",
            CommandType::SavePolicyRevision => "savePolicyRevision",
            CommandType::AdoptPolicy => "adoptPolicy",
        }
    }

    pub fn verb(self) -> Option<AuthorityVerb> {
        AuthorityVerb::ALL
            .into_iter()
            .find(|v| v.command_types().contains(&self))
    }

    pub fn is_authority(self) -> bool {
        self.verb().is_some()
    }
}

/// The eight `␣a` authority commands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum AuthorityVerb {
    Approve,
    Rework,
    Decide,
    ConfirmShape,
    Accept,
    Cancel,
    Routing,
    Policy,
}

impl AuthorityVerb {
    pub const ALL: [AuthorityVerb; 8] = [
        AuthorityVerb::Approve,
        AuthorityVerb::Rework,
        AuthorityVerb::Decide,
        AuthorityVerb::ConfirmShape,
        AuthorityVerb::Accept,
        AuthorityVerb::Cancel,
        AuthorityVerb::Routing,
        AuthorityVerb::Policy,
    ];

    /// The `render-keymap` command id.
    pub fn keymap_id(self) -> &'static str {
        match self {
            AuthorityVerb::Approve => "auth.approve",
            AuthorityVerb::Rework => "auth.rework",
            AuthorityVerb::Decide => "auth.decide",
            AuthorityVerb::ConfirmShape => "auth.shape",
            AuthorityVerb::Accept => "auth.accept",
            AuthorityVerb::Cancel => "auth.cancel",
            AuthorityVerb::Routing => "auth.routing",
            AuthorityVerb::Policy => "auth.policy",
        }
    }

    pub fn from_keymap_id(id: &str) -> Option<AuthorityVerb> {
        AuthorityVerb::ALL.into_iter().find(|v| v.keymap_id() == id)
    }

    /// The host command types this verb may bind. The host's decidable says which applies.
    pub fn command_types(self) -> &'static [CommandType] {
        match self {
            AuthorityVerb::Approve => &[CommandType::ApproveCheckpoint],
            AuthorityVerb::Rework => &[CommandType::RequestRework],
            AuthorityVerb::Decide => &[CommandType::RecordDecision],
            AuthorityVerb::ConfirmShape => &[CommandType::ConfirmShape],
            AuthorityVerb::Accept => &[
                CommandType::AcceptIntake,
                CommandType::AcceptAmendment,
                CommandType::SupersedeContract,
            ],
            AuthorityVerb::Cancel => &[CommandType::CancelWork],
            AuthorityVerb::Routing => &[CommandType::SetCheckpointSettings],
            AuthorityVerb::Policy => &[CommandType::SavePolicyRevision, CommandType::AdoptPolicy],
        }
    }

    /// Verbs that need the basis on screen, so a list row echoes `open it first · ⏎`.
    pub fn needs_work_view(self) -> bool {
        !matches!(self, AuthorityVerb::Cancel)
    }
}

/// A host-computed basis: its digest plus every field in host order, known names or not.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Basis {
    pub digest: Digest,
    pub fields: Vec<BasisField>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BasisField {
    pub name: String,
    pub label: Option<String>,
    pub reference: Option<ObjectId>,
    pub revision: Option<Revision>,
    pub digest: Option<Digest>,
    pub changed_seq: Option<Seq>,
    pub changed_at: Option<HostTime>,
    pub changed_by: Option<String>,
}

impl BasisField {
    pub fn named(name: &str) -> BasisField {
        BasisField {
            name: name.into(),
            label: None,
            reference: None,
            revision: None,
            digest: None,
            changed_seq: None,
            changed_at: None,
            changed_by: None,
        }
    }
    pub fn value(&self) -> FieldValue {
        FieldValue {
            revision: self.revision.clone(),
            digest: self.digest.clone(),
        }
    }
}

/// The comparable part of a basis field.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldValue {
    pub revision: Option<Revision>,
    pub digest: Option<Digest>,
}

/// One basis field whose value differs between two views of the basis.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldChange {
    pub name: String,
    /// `None` when the field was not there before.
    pub from: Option<FieldValue>,
    /// `None` when the field is gone.
    pub to: Option<FieldValue>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Availability {
    Available,
    Unavailable { reason: Option<Text> },
}

/// One permitted (or listed-but-unavailable) action from the host.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostAction {
    pub command: CommandType,
    pub option: Option<u32>,
    pub option_kind: Option<String>,
    pub recommended: bool,
    pub availability: Availability,
    pub effect: Option<Text>,
    pub not: Vec<Text>,
    pub carries: Option<Text>,
}

/// A decidable object: the only source of authority bases and consequence text.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decidable {
    pub target: ObjectId,
    /// The settings field or workflow row this decidable covers, when the host scopes it.
    pub subject: Option<String>,
    pub basis: Basis,
    pub actions: Vec<HostAction>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SendMode {
    Prompt,
    Steer,
    FollowUp,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnvelopeScope {
    Workflow(ObjectId),
    Project(ProjectId),
}

/// A local annotation draft item.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalNote {
    pub local_id: u64,
    pub anchor: Anchor,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Anchor {
    pub node: Option<String>,
    pub byte_start: u64,
    pub byte_end: u64,
    pub quote: String,
}

/// Typed outbound command. The adapter alone turns it into bytes.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandIntent {
    pub id: CommandId,
    pub command: CommandType,
    pub target: ObjectId,
    pub scope: EnvelopeScope,
    /// The epoch pinned when the command was made, not the current one.
    pub epoch: Option<Epoch>,
    /// The host's basis exactly as shown, for authority commands.
    pub expected: Option<Basis>,
    pub body: CommandBody,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommandBody {
    CreateDesign {
        project: ProjectId,
        prompt: String,
    },
    SaveAnnotations {
        emission: ObjectId,
        base_set: Option<Revision>,
        items: Vec<LocalNote>,
    },
    SaveEditedBytes {
        emission: ObjectId,
        base: Option<Revision>,
        text: String,
    },
    SendMessage {
        conversation: ObjectId,
        mode: SendMode,
        turn: Option<String>,
        text: String,
    },
    InterruptTurn {
        conversation: ObjectId,
        turn: String,
    },
    RequestLocalVerificationPrompt {
        proposal: ObjectId,
        source: Option<String>,
    },
    /// Any of the authority command types; `command` on the intent says which.
    Authority {
        subject: Option<String>,
        option: Option<u32>,
        note: Option<String>,
        edits: Vec<(String, String)>,
    },
}

/// Adapter-encoded bytes. Retries resend exactly these bytes; they are never re-encoded.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreparedCommand {
    pub id: CommandId,
    /// Adapter wire-format id. Bytes in a format the current adapter can't send block retry.
    pub format: String,
    pub bytes: Vec<u8>,
    pub summary: String,
}

/// What a receipt (or a receipt query) says happened.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReceiptOutcome {
    Accepted {
        seq: Seq,
    },
    Duplicate {
        seq: Seq,
    },
    CommandConflict,
    StaleBasis(StaleReply),
    Refused {
        code: String,
        reason: Option<Text>,
        repair: Vec<Text>,
    },
    Unauthorized,
    /// The host has no record. Never proof the command was not committed (RQ-36).
    NotFound,
    TurnStateChanged,
    TurnEnded,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StaleReply {
    pub sent: Basis,
    pub current: Basis,
    pub changes: Vec<FieldChange>,
    pub changed_refs: Vec<ObjectId>,
    pub actions: Vec<HostAction>,
    pub note: Option<Text>,
}

// ---------------------------------------------------------------------------------------------
// Host objects
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectRef {
    pub id: ProjectId,
    pub name: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ObjectKind {
    Review,
    Chat,
    Evidence,
    Decision,
    Proposal,
    Settings,
    Operation,
    LocalPrompt,
    Unsupported,
}

/// One host object a work view opens.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Object {
    pub id: ObjectId,
    pub revision: Option<Revision>,
    pub title: Option<String>,
    pub project: Option<ProjectRef>,
    pub workflow: Option<ObjectId>,
    pub handover: Handover,
    pub next: Option<Next>,
    pub track: Option<Track>,
    pub decidables: Vec<Decidable>,
    pub body: ObjectBody,
}

impl Object {
    pub fn kind(&self) -> ObjectKind {
        self.body.kind()
    }
    /// The decidable an authority verb would bind here.
    pub fn decidable_for(&self, verb: AuthorityVerb, subject: Option<&str>) -> Option<&Decidable> {
        self.decidables
            .iter()
            .filter(|d| subject.is_none() || d.subject.as_deref() == subject)
            .find(|d| {
                d.actions
                    .iter()
                    .any(|a| verb.command_types().contains(&a.command))
            })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ObjectBody {
    Review(Review),
    Chat(Chat),
    Evidence(EvidenceView),
    Decision(DecisionView),
    Proposal(ProposalView),
    Settings(SettingsView),
    Operation(OperationView),
    LocalPrompt(LocalPrompt),
    /// A kind this client cannot render. Decisions on it are off.
    Unsupported {
        kind: String,
        reason: Option<Text>,
        requires_client: Option<String>,
    },
}

impl ObjectBody {
    pub fn kind(&self) -> ObjectKind {
        match self {
            ObjectBody::Review(_) => ObjectKind::Review,
            ObjectBody::Chat(_) => ObjectKind::Chat,
            ObjectBody::Evidence(_) => ObjectKind::Evidence,
            ObjectBody::Decision(_) => ObjectKind::Decision,
            ObjectBody::Proposal(_) => ObjectKind::Proposal,
            ObjectBody::Settings(_) => ObjectKind::Settings,
            ObjectBody::Operation(_) => ObjectKind::Operation,
            ObjectBody::LocalPrompt(_) => ObjectKind::LocalPrompt,
            ObjectBody::Unsupported { .. } => ObjectKind::Unsupported,
        }
    }
}

// --- handover, next, track ---------------------------------------------------------------------

/// The five handover facts. `None` means the host did not send that fact.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Handover {
    pub commitment: Option<Commitment>,
    pub owner: Option<Owner>,
    pub evidence: Option<EvidenceFact>,
    pub blocker: Option<Blocker>,
    pub advisory: Vec<Advisory>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommitmentKind {
    Contract,
    Checkpoint,
    Proposal,
    Other(String),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Commitment {
    pub kind: CommitmentKind,
    /// Display label as the host names it: `K·40cc`, `seams r3`.
    pub label: String,
    pub revision: Option<Revision>,
    pub digest: Option<Digest>,
    /// `B1–B5 A1–A6`, `43 Slices`.
    pub scope: Option<String>,
    pub decided_by: Option<Decider>,
    pub at: Option<HostTime>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Decider {
    Human {
        principal: String,
        is_you: bool,
    },
    Delegated {
        settings_revision: Option<Revision>,
        assignment: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OwnerKind {
    You,
    Assignment {
        id: String,
        generation: Option<u32>,
        role: Option<Role>,
    },
    Nobody,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Owner {
    pub who: OwnerKind,
    pub state: Option<Text>,
    pub wait: Option<WaitClass>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceFact {
    /// `pass 2 · no Watchdog on 3be1f0c`, `R4 published #44 · 7/7 Watchdog pass`.
    pub summary: Text,
    pub verdict: Option<Verdict>,
    pub source_digest: Option<Digest>,
    pub current_head: Option<Digest>,
    /// The ledger seq of the latest evidence. The device compares it with what it has shown.
    pub seq: Option<Seq>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Verdict {
    Pass,
    Fail,
    None,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Blocker {
    /// The host says there is none. `uncertainties` counts reported uncertainties, never blockers.
    None {
        uncertainties: u32,
        advisory_running: Option<Text>,
    },
    Typed(Blockage),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum WaitClass {
    Human,
    Operator,
    Model,
    Verify,
    Effect,
    Dependency,
    Slot,
    Cleanup,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Downstream {
    pub direct: u32,
    pub transitive: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Blockage {
    pub wait: WaitClass,
    /// `F16`
    pub id: Option<String>,
    /// `HARD`
    pub severity: Option<String>,
    pub text: Text,
    pub refs: Vec<ObjectId>,
    pub since: Option<HostTime>,
    pub downstream: Option<Downstream>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Advisory {
    pub kind: String,
    pub reference: Option<ObjectId>,
    pub text: Text,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Next {
    /// `nothing for you yet`
    Nothing,
    Act(NextAction),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionKind {
    Answer,
    Review,
    ConfirmShape,
    Accept,
    MergeMain,
    Remedy,
    Other(String),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct NextAction {
    pub kind: ActionKind,
    pub target: ObjectId,
    /// `Q1`, `Modules r2`, `main`.
    pub target_label: Option<String>,
    pub commands: Vec<CommandType>,
    pub basis_digest: Option<Digest>,
    pub since: Option<HostTime>,
    pub why: Option<Text>,
    pub options: Option<u32>,
    /// For `MergeMain`: the forge PR.
    pub url: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum StageState {
    Done,
    NeedsYou,
    Delegated,
    Running,
    Pending,
    Rework,
    Failed,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackStage {
    pub label: String,
    pub state: StageState,
    pub at: Option<HostTime>,
    pub detail: Option<Text>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrackZoom {
    Design,
    Slice,
    Pass,
    Proposal,
    Operation,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Track {
    pub zoom: TrackZoom,
    pub stages: Vec<TrackStage>,
    /// `your review · captured s2`, `turn t42 running · 11 m · 5 tools`.
    pub calm: Option<Text>,
}

// --- roles, conversations, tools ------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RoleClass {
    Human,
    Coordinator,
    Reviewer,
    Worker,
    Host,
}

/// A role class drives the hue; `label` is the host's word and is never derived.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Role {
    pub class: RoleClass,
    pub label: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TurnPhase {
    Idle,
    Running,
    Ended,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnState {
    pub turn: Option<String>,
    pub phase: TurnPhase,
    pub since: Option<HostTime>,
    pub tools: Option<u32>,
}

impl TurnState {
    /// The mode the composer header announces before you send.
    pub fn send_mode(&self) -> SendMode {
        match self.phase {
            TurnPhase::Running => SendMode::Steer,
            TurnPhase::Idle | TurnPhase::Ended => SendMode::Prompt,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Chat {
    pub roster: Vec<RosterEntry>,
    pub messages: Vec<Message>,
    pub turn: Option<TurnState>,
    pub steers: Vec<Steer>,
    pub artifacts: Vec<TurnArtifact>,
    /// Whether the window holds the conversation's start and end.
    pub complete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RosterEntry {
    pub conversation: ObjectId,
    pub role: Role,
    pub candidate: Option<String>,
    pub assignment: Option<String>,
    pub model: Option<String>,
    pub state: Option<String>,
    pub since: Option<HostTime>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Message {
    pub id: ObjectId,
    pub role: Role,
    pub at: Option<HostTime>,
    pub model: Option<String>,
    pub assignment: Option<String>,
    pub turn: Option<String>,
    pub receipt: Option<CommandId>,
    pub body: MessageBody,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageBody {
    /// Markdown content; may still be streaming.
    Text {
        text: String,
        streaming: bool,
        truncated: bool,
    },
    Tool(ToolCall),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolOutcome {
    Running,
    Succeeded,
    Failed,
    Cancelled,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: Option<String>,
    /// From the host record, never inferred from output text.
    pub outcome: ToolOutcome,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub started_at: Option<HostTime>,
    pub status: Option<Text>,
    pub output: Option<ObjectId>,
    pub web: Vec<WebAttempt>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WebOutcome {
    Ok,
    Partial,
    Failed,
    TimeoutUncertain,
    Canceled,
    Interrupted,
    NotAttempted,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebAttempt {
    pub provider: String,
    pub primary: bool,
    pub outcome: WebOutcome,
    pub failure: Option<Text>,
    pub observation: Option<String>,
    pub at: Option<HostTime>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Delivery {
    Pending,
    Delivered,
    Refused,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Steer {
    pub id: ObjectId,
    pub text: Text,
    pub delivery: Delivery,
    pub delivered_after: Option<String>,
    pub receipt: Option<CommandId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnArtifact {
    pub key: String,
    pub state: String,
    pub kind: Option<String>,
    pub at: Option<HostTime>,
    pub message: Option<ObjectId>,
}

// --- review --------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Review {
    pub emission: ObjectId,
    pub digest: Option<Digest>,
    pub emitted_at: Option<HostTime>,
    pub previous: Option<ObjectId>,
    /// Emission bytes as Markdown content.
    pub text: String,
    pub nodes: Vec<Node>,
    pub change_ranges: Vec<(u64, u64)>,
    pub annotation_set: Option<Revision>,
    pub annotations: Vec<Annotation>,
    pub dispositions: Vec<Disposition>,
    pub round: Option<RoundSummary>,
    pub reviews: Option<ReviewCount>,
    pub delegated: Option<Text>,
    pub attributes_changed: bool,
    pub fidelity: Option<Text>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub class: Option<String>,
    pub title: Option<String>,
    pub byte_range: Option<(u64, u64)>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub set_revision: Revision,
    pub anchor: Anchor,
    pub body: Text,
    pub author: Option<String>,
    pub saved_at: Option<HostTime>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Disposition {
    pub annotation: String,
    pub disposition: String,
    pub reason: Option<Text>,
    pub resulting: Vec<(String, Option<(u64, u64)>)>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoundSummary {
    pub previous: Revision,
    pub notes: u32,
    pub acted_on: u32,
    pub considered: u32,
    pub dismissed: u32,
    pub unanswered: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewCount {
    pub completed: u32,
    pub limit: u32,
}

// --- evidence ------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceView {
    pub passes: Vec<Pass>,
    pub current_pass: Option<u32>,
    pub findings: Vec<Finding>,
    pub obligations: Vec<Obligation>,
    pub reviews: Option<ReviewCount>,
    pub web: Vec<WebPassage>,
    pub native_checks: Vec<Text>,
    pub gate_receipt: Option<Text>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pass {
    pub ordinal: u32,
    pub opened_by: Option<String>,
    pub audit_examined: Option<Digest>,
    pub submitted: Option<Digest>,
    pub prepared: Option<Digest>,
    pub watchdog: Vec<WatchdogRound>,
    pub chain: Vec<TrackStage>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WatchdogRound {
    pub round: u32,
    pub reviewed: Option<Digest>,
    pub verdict: Verdict,
    pub counted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    pub id: String,
    pub severity: Option<String>,
    pub disposition: Option<String>,
    pub text: Text,
    pub obligations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Obligation {
    pub id: String,
    pub summary: Text,
    /// Source column label → cell text (`none yet` included as sent).
    pub matrix: Vec<(String, Option<Text>)>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebPassage {
    pub url: String,
    pub provider: Option<String>,
    pub observed_at: Option<HostTime>,
    pub text: Text,
}

// --- decision ------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecisionKind {
    Product,
    Recovery,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionView {
    pub label: String,
    pub kind: DecisionKind,
    pub question: Text,
    pub lede: Option<Text>,
    pub source: Option<String>,
    pub asked_at: Option<HostTime>,
    pub blocks: Option<Downstream>,
    pub evidence: Vec<Text>,
    pub options: Vec<DecisionOption>,
    /// `coordinator`
    pub recommended_by: Option<String>,
    pub observations: Vec<Text>,
    pub answer: Option<Text>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DecisionOption {
    pub n: u32,
    pub kind: Option<String>,
    pub title: Text,
    pub body: Text,
    pub recommended: bool,
}

// --- proposal ------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Readiness {
    pub eligibility: Option<Text>,
    pub gaps: Vec<Text>,
    pub published: Option<Text>,
    pub promotion: Option<Text>,
    pub forge: Option<Text>,
    pub duplicate_risk_since: Option<HostTime>,
    pub merged_differs: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProposalView {
    pub intake: Option<Text>,
    pub source: Option<Text>,
    pub checks: Option<Text>,
    pub readiness: Readiness,
    pub findings: u32,
    pub deviations: u32,
    pub uncertainties: u32,
    pub advisory: Vec<Text>,
    pub local_prompt: Option<ObjectId>,
    pub slices: Vec<ProposalSlice>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProposalSlice {
    pub id: ObjectId,
    pub name: String,
    pub contract: Option<String>,
    pub pass: Option<u32>,
    pub watchdog: Option<Text>,
    pub fixed: Option<u32>,
}

// --- settings ------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RouteMode {
    Human,
    Delegated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingsView {
    pub settings_revision: Option<Revision>,
    pub changed_by: Option<Decider>,
    pub changed_at: Option<HostTime>,
    pub routes: Vec<(String, RouteMode, bool)>,
    pub pending: Vec<Text>,
    pub policy_default: Option<Revision>,
    pub policy_fields: Vec<(String, String)>,
    pub bindings: Vec<(ObjectId, Revision, Revision)>,
    pub history: Vec<Text>,
}

// --- operation and local prompt ------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OperationState {
    Planned,
    Admitted,
    Awaiting,
    Unknown,
    Observed,
    Refused,
    Risk,
    RiskHeld,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationView {
    pub label: Text,
    pub state: OperationState,
    pub payload_digest: Option<Digest>,
    pub attempts: Vec<Text>,
    pub observations: Vec<Text>,
    pub blocks: Vec<Text>,
    pub continues: Vec<Text>,
    pub safe_choices: Vec<Text>,
    pub next_check: Option<HostTime>,
    pub duplicate_risk_since: Option<HostTime>,
    pub recovery_decision: Option<ObjectId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalPrompt {
    pub version: Option<u32>,
    pub source: Option<Text>,
    pub current_source: Option<String>,
    pub gaps: Vec<Text>,
    pub missing: Vec<Text>,
    pub created_at: Option<HostTime>,
    pub text: String,
}

// ---------------------------------------------------------------------------------------------
// Indexes: attention, slices, agents, references
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AttentionGroup {
    NeedsYou,
    OnHost,
    Waiting,
    Running,
    Done,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RowMark {
    NeedsYou,
    Failed,
    Unknown,
    Stale,
    Running,
    Waiting,
    Done,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Activity {
    pub text: Text,
    pub at: Option<HostTime>,
}

/// One Brief row. The group comes only from the host's mode and next action.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttentionRow {
    pub id: ObjectId,
    pub object: ObjectId,
    pub group: AttentionGroup,
    pub mark: Option<RowMark>,
    pub title: Option<String>,
    pub project: Option<ProjectRef>,
    pub proposal: Option<String>,
    pub wait: Option<WaitClass>,
    pub since: Option<HostTime>,
    pub next: Option<Next>,
    pub ask: Option<Text>,
    /// Host reason or remedy for On the host and Waiting rows.
    pub reason: Option<Text>,
    pub track: Option<Track>,
    pub downstream: Option<Downstream>,
    pub handover: Handover,
    pub role: Option<Role>,
    pub pass: Option<u32>,
    pub last_activity: Option<Activity>,
    pub seq: Option<Seq>,
    /// Decidables reachable from the row itself (`␣ax` works from lists).
    pub decidables: Vec<Decidable>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Slots {
    pub used: u32,
    pub total: u32,
    pub held_by_cancelled: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProposalSummary {
    pub id: ObjectId,
    pub project: Option<ProjectRef>,
    pub name: String,
    pub title: Option<String>,
    pub shape: Option<String>,
    pub path: Vec<TrackStage>,
    pub readiness: Readiness,
    pub status: Option<Text>,
    pub needs_you: bool,
    pub superseded: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LifecycleState {
    pub state: String,
    pub label: String,
    pub mark_classes: Vec<String>,
    pub open: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SliceRow {
    pub id: ObjectId,
    pub workflow: ObjectId,
    pub project: Option<ProjectRef>,
    pub proposal: Option<String>,
    pub title: Option<String>,
    pub lifecycle: String,
    pub wait: Option<WaitClass>,
    pub reason: Option<Text>,
    pub since: Option<HostTime>,
    pub downstream: Option<Downstream>,
    pub assignment: Option<String>,
    pub next: Option<ActionKind>,
    pub last_fact: Option<Text>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum AgentGroup {
    Executing,
    OnHost,
    Held,
    Queued,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Execution {
    Planned,
    Starting,
    Running,
    Submitted,
    Blocked,
    Recovering,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Cancellation {
    CancelRequested,
    Quiescing,
    Canceled,
    Quarantined,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentRow {
    pub assignment: String,
    pub generation: Option<u32>,
    pub group: AgentGroup,
    pub slot: Option<u32>,
    pub workflow: Option<ObjectId>,
    pub workflow_title: Option<String>,
    pub role: Option<Role>,
    pub model: Option<String>,
    pub execution: Option<Execution>,
    pub cancellation: Option<Cancellation>,
    pub orphaned: bool,
    pub since: Option<HostTime>,
    pub last_activity: Option<Activity>,
    pub lifecycle: Vec<Text>,
    pub remedy: Option<Text>,
    pub waits_on_you: bool,
    pub conversation: Option<ObjectId>,
    pub decidables: Vec<Decidable>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentTotals {
    pub retained_workspaces: u32,
    pub workspace_bytes: u64,
    pub quota_bytes: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReferenceState {
    Resolved,
    Dangling,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reference {
    pub label: String,
    pub kind: String,
    pub target: Option<ObjectId>,
    pub state: ReferenceState,
    pub reason: Option<Text>,
}

// ---------------------------------------------------------------------------------------------
// Inbound vocabulary (domain terms; the adapter normalises any wire into this)
// ---------------------------------------------------------------------------------------------

/// A subscription scope with its own sequence.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Scope {
    Attention,
    Agents,
    Slices,
    /// A workflow, conversation or project-settings scope, by host id.
    Object(ObjectId),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cursor {
    pub epoch: Option<Epoch>,
    pub scope_seq: Seq,
    /// The user-facing ledger seq.
    pub ledger_seq: Option<Seq>,
    pub host_time: Option<HostTime>,
}

/// One typed resource. Upserts replace a resource whole.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resource {
    Object(Object),
    AttentionRow(AttentionRow),
    Slots(Slots),
    Proposal(ProposalSummary),
    SliceRow(SliceRow),
    LifecycleStates(Vec<LifecycleState>),
    AgentRow(AgentRow),
    AgentTotals(AgentTotals),
    References(Vec<Reference>),
    Unsupported {
        kind: String,
        id: ObjectId,
        reason: Option<Text>,
    },
}

/// Identifies a resource for removal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResourceKey {
    Object(ObjectId),
    AttentionRow(ObjectId),
    Proposal(ObjectId),
    SliceRow(ObjectId),
    AgentRow(String),
    Unsupported(ObjectId),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Change {
    Upsert(Resource),
    Remove(ResourceKey),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fact {
    pub id: String,
    pub summary: Text,
    pub refs: Vec<ObjectId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Admission {
    Open,
    /// An ordinary pause. Writes and decisions are off; drafts keep working.
    Paused {
        reason: Option<Text>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionEvent {
    Connecting,
    Live {
        host_name: Option<String>,
        server_version: Option<String>,
    },
    Offline {
        reason: Option<String>,
    },
    Revoked {
        at: Option<HostTime>,
    },
    CredentialRefused {
        reason: Option<Text>,
    },
    /// The host speaks a protocol version this client can't read.
    TooOld {
        requires: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Inbound {
    Connection(ConnectionEvent),
    Admission(Admission),
    Snapshot {
        scope: Scope,
        at: Cursor,
        resources: Vec<Resource>,
    },
    Update {
        scope: Scope,
        at: Cursor,
        prev_scope_seq: Seq,
        changes: Vec<Change>,
        facts: Vec<Fact>,
    },
    /// Streaming text appended at a UTF-8 byte offset, outside the scope sequence.
    Delta {
        conversation: ObjectId,
        message: ObjectId,
        offset: u64,
        text: String,
    },
    Receipt {
        command: CommandId,
        outcome: ReceiptOutcome,
    },
    /// Adapter-generated on timeout or reset; never a host statement.
    Lost {
        command: CommandId,
    },
    /// A frame the adapter could not decode. Counted and shown, never dropped silently.
    Undecodable {
        scope: Option<Scope>,
        what: String,
    },
}

// ---------------------------------------------------------------------------------------------
// Host mirror
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Connection {
    #[default]
    Connecting,
    Live,
    Offline {
        since: Option<HostTime>,
        reason: Option<String>,
    },
    Revoked {
        at: Option<HostTime>,
    },
    CredentialRefused {
        reason: Option<Text>,
    },
    TooOld {
        requires: Option<String>,
    },
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attention {
    pub rows: Vec<AttentionRow>,
    pub proposals: Vec<ProposalSummary>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Slices {
    pub rows: Vec<SliceRow>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Agents {
    pub rows: Vec<AgentRow>,
    pub totals: Option<AgentTotals>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct UnsupportedNote {
    pub scope: Scope,
    pub kind: String,
    pub id: ObjectId,
    pub reason: Option<Text>,
}

/// Everything the client knows from the host. Written only by `reduce_host`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostSnapshot {
    pub host_name: Option<String>,
    pub server_version: Option<String>,
    pub connection: Connection,
    pub admission: Admission,
    pub epoch: Option<Epoch>,
    /// Highest ledger seq observed in the current epoch.
    pub seq: Option<Seq>,
    /// Process-local monotonic receipt time is never persisted in a device cache.
    #[serde(skip)]
    pub host_time: Option<HostClock>,
    #[serde(with = "entries")]
    pub cursors: BTreeMap<Scope, Cursor>,
    /// Scopes whose state is known incomplete and wait for a fresh snapshot.
    pub needs_snapshot: BTreeSet<Scope>,
    pub objects: BTreeMap<ObjectId, Object>,
    pub object_scope: BTreeMap<ObjectId, Scope>,
    pub attention: Attention,
    pub slots: Option<Slots>,
    pub slices: Slices,
    pub lifecycle_states: Vec<LifecycleState>,
    pub agents: Agents,
    #[serde(with = "entries")]
    pub references: BTreeMap<Scope, Vec<Reference>>,
    pub unsupported: Vec<UnsupportedNote>,
    pub undecodable: u64,
    pub facts: Vec<Fact>,
}

impl Default for HostSnapshot {
    fn default() -> Self {
        HostSnapshot {
            host_name: None,
            server_version: None,
            connection: Connection::Connecting,
            admission: Admission::Open,
            epoch: None,
            seq: None,
            host_time: None,
            cursors: BTreeMap::new(),
            needs_snapshot: BTreeSet::new(),
            objects: BTreeMap::new(),
            object_scope: BTreeMap::new(),
            attention: Attention::default(),
            slots: None,
            slices: Slices::default(),
            lifecycle_states: Vec::new(),
            agents: Agents::default(),
            references: BTreeMap::new(),
            unsupported: Vec::new(),
            undecodable: 0,
            facts: Vec::new(),
        }
    }
}

impl HostSnapshot {
    pub fn object(&self, id: &str) -> Option<&Object> {
        self.objects.get(id)
    }
    /// The ledger seq of the scope that holds `object`, if it is loaded.
    pub fn object_seq(&self, object: &str) -> Option<Seq> {
        self.object_scope
            .get(object)
            .and_then(|s| self.cursors.get(s))
            .and_then(|c| c.ledger_seq)
    }
    /// Host time now, from the last host time plus local monotonic time elapsed.
    pub fn host_now(&self, now: Moment) -> Option<HostTime> {
        self.host_time.and_then(|c| c.now(now))
    }
    pub fn writable(&self) -> bool {
        self.connection == Connection::Live && self.admission == Admission::Open
    }
}

// ---------------------------------------------------------------------------------------------
// Device-local state (persisted whole through render-store)
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum DraftKind {
    Annotations,
    Prompt,
    DecisionNote,
    EditBuffer,
    Policy,
    Design,
}

/// A draft is keyed by its object, its kind and the revision it was drafted on.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct DraftKey {
    pub object: ObjectId,
    pub kind: DraftKind,
    pub base: Option<Revision>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DraftBody {
    Text(String),
    Notes(Vec<LocalNote>),
    Edits(Vec<(String, String)>),
    Policy(crate::policy::PolicyDraft),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Draft {
    pub body: DraftBody,
    /// Bumped on every edit. A save clears the draft only when this is unchanged.
    pub generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DraftLink {
    pub key: DraftKey,
    pub generation: u64,
}

/// Per target: the value of each basis field the user has acknowledged seeing.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadBasis {
    pub epoch: Option<Epoch>,
    pub fields: BTreeMap<String, FieldValue>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RetryBlock {
    EpochChanged,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutboxState {
    /// Intent made; the adapter has not prepared bytes yet. Never transmitted.
    Preparing,
    /// Bytes stored. Persist before transmitting.
    Written,
    /// Handed to the adapter.
    Sent,
    /// No reply. The host may have accepted it.
    Unknown {
        since: Option<HostTime>,
        last_query: Option<ReceiptOutcome>,
        retry_block: Option<RetryBlock>,
    },
    Settled(ReceiptOutcome),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutboxEntry {
    pub intent: CommandIntent,
    pub prepared: Option<PreparedCommand>,
    pub draft: Option<DraftLink>,
    pub created_at: Option<HostTime>,
    pub state: OutboxState,
}

impl OutboxEntry {
    /// Unsettled: blocks other authority on the same object.
    pub fn unresolved(&self) -> bool {
        !matches!(self.state, OutboxState::Settled(_))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeenRow {
    pub id: ObjectId,
    pub group: String,
}

/// What the Brief showed while the user was present (SC-02 "since you left").
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeenBrief {
    pub epoch: Option<Epoch>,
    pub seq: Option<Seq>,
    pub host_time: Option<HostTime>,
    pub rows: Vec<SeenRow>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Mark {
    pub object: ObjectId,
    pub revision: Option<Revision>,
    #[serde(default)]
    pub byte: Option<u64>,
}

/// Device-only state. Snapshots never touch it.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceState {
    /// Namespaces command ids. The app sets it once, from a random source, before the first command.
    pub device_id: String,
    pub next_command: u64,
    #[serde(with = "entries")]
    pub drafts: BTreeMap<DraftKey, Draft>,
    pub outbox: Vec<OutboxEntry>,
    pub read_bases: BTreeMap<ObjectId, ReadBasis>,
    /// Latest evidence seq shown to the user, per object.
    pub evidence_shown: BTreeMap<ObjectId, Seq>,
    pub marks: BTreeMap<char, Mark>,
    pub jumplist: Vec<Mark>,
    pub seen_brief: Option<SeenBrief>,
    pub ex_history: Vec<String>,
    pub notes_written: u32,
}

/// Stores a map with structured keys as a list of pairs, so it round-trips through JSON.
mod entries {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::collections::BTreeMap;

    pub fn serialize<K: Serialize, V: Serialize, S: Serializer>(
        map: &BTreeMap<K, V>,
        s: S,
    ) -> Result<S::Ok, S::Error> {
        s.collect_seq(map.iter())
    }

    pub fn deserialize<
        'de,
        K: Deserialize<'de> + Ord,
        V: Deserialize<'de>,
        D: Deserializer<'de>,
    >(
        d: D,
    ) -> Result<BTreeMap<K, V>, D::Error> {
        Ok(Vec::<(K, V)>::deserialize(d)?.into_iter().collect())
    }
}
