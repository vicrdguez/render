//! The client: host mirror, device state and session, with the rules that join them.
//!
//! Fields are public for reading. Mutate only through methods, so the rules hold. Every method
//! that returns `Ok` or `true` after changing `local` means the app should save `local` before
//! it transmits anything.

use crate::host::reduce_host;
use crate::model::*;
use std::collections::BTreeMap;
use std::time::Duration;

/// Clicks this soon after a float's first draw are discarded (FC-T22).
pub const POINTER_DISCARD: Duration = Duration::from_millis(400);

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Session {
    pub readback: Option<Readback>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Client {
    pub host: HostSnapshot,
    pub local: DeviceState,
    pub session: Session,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    /// Ask the adapter for a fresh snapshot of this scope.
    Resnapshot(Scope),
    /// `local` changed; save it.
    Persist,
    Notice(Notice),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Notice {
    /// The host epoch changed. Pins and the open readback are void; every scope resnapshots.
    Discontinuity,
    ReadbackVoided,
    /// `already applied at seq N (duplicate)`.
    AlreadyApplied {
        command: CommandId,
        seq: Seq,
    },
    UnknownReceipt {
        command: CommandId,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Surface {
    WorkView,
    ListRow,
}

/// What a drawn frame showed for one target. The app captures it from the same state its view
/// used and keeps the one from the last frame actually presented; keys pin against it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DrawnTarget {
    pub object: ObjectId,
    pub surface: Surface,
    /// `None` for a list row whose object isn't loaded.
    pub kind: Option<ObjectKind>,
    pub revision: Option<Revision>,
    pub decidables: Vec<Decidable>,
    /// The composer header as drawn.
    pub send_mode: Option<SendMode>,
    pub turn: Option<String>,
    pub scope: EnvelopeScope,
    pub ledger_seq: Option<Seq>,
    pub epoch: Option<Epoch>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WriteRequest {
    SaveAnnotations {
        draft: DraftKey,
    },
    SaveEditedBytes {
        draft: DraftKey,
    },
    /// The mode is the drawn one; `follow_up` is the explicit `M-⏎` queue.
    SendMessage {
        draft: DraftKey,
        follow_up: bool,
    },
    InterruptTurn,
    RequestLocalPrompt {
        source: Option<String>,
    },
    CreateDesign {
        draft: DraftKey,
        project: ProjectId,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthorityRequest {
    pub verb: AuthorityVerb,
    pub option: Option<u32>,
    pub subject: Option<String>,
    /// A typed count. Authority rejects it.
    pub count: Option<u32>,
    /// A decision-note or policy draft that rides with the command, pinned at open.
    pub draft: Option<DraftKey>,
}

/// A physical key the app's keymap resolved to readback confirm.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyPress {
    pub repeat: bool,
    pub composing: bool,
    /// The OS event time on a monotonic clock. `None` fails closed.
    pub input_time: Option<Moment>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Readback {
    pub verb: AuthorityVerb,
    pub pin: DrawnTarget,
    /// The decidable as drawn when the readback was pinned.
    pub decidable: Decidable,
    pub action: HostAction,
    pub note: Option<String>,
    pub edits: Vec<(String, String)>,
    pub draft: Option<DraftLink>,
    /// The read basis acknowledged at pin time, by field name.
    pub acknowledged: BTreeMap<String, FieldValue>,
    /// The first presented frame that showed this readback.
    pub drawn_at: Option<Moment>,
    pub timing_unavailable: bool,
    pub sent: Option<CommandId>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ReadbackPhase {
    Fresh,
    /// A shown field was never acknowledged in the view.
    Stale(Vec<FieldChange>),
    /// The host basis moved after the readback was pinned.
    Changed(Vec<FieldChange>),
    Blocked(Block),
    /// Confirmed; the outbox entry has the outcome.
    Sent(CommandId),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Block {
    Offline,
    Revoked,
    NotConnected,
    Paused(Option<Text>),
    EpochChanged,
    UnsupportedKind,
    OutcomeUnknown(CommandId),
    /// The host no longer offers this decidable or action.
    Gone,
    Unavailable(Option<Text>),
    NoConsequenceText,
    NoInputTiming,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Refusal {
    Offline,
    Revoked,
    NotConnected,
    Paused(Option<Text>),
    EpochChanged,
    NoDeviceId,
    NoDraft,
    PolicyConflicts,
    StalePolicyDraft,
    DraftNotForTarget,
    DraftInFlight(CommandId),
    NoSendMode,
    NoTurn,
    CountNotAllowed,
    /// `open it first · ⏎`
    OpenItFirst,
    NoDecidable,
    OptionRequired,
    NoSuchOption,
    UnsavedDrafts(Vec<DraftKey>),
    NoReadback,
    AlreadySent,
    AwaitingDraw,
    Repeat,
    Composing,
    NoInputTiming,
    Typeahead,
    NotFresh(ReadbackPhase),
    /// `press y to confirm`
    PointerNeverConfirms,
    UnknownCommand,
    WrongState,
    NoBytes,
    NotUnknown,
    RetryBlocked(RetryBlock),
    FormatUnsupported,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CountTags {
    pub needs_you: usize,
    pub on_host: usize,
    /// Brief rows the host marks unknown plus this device's unknown outcomes.
    pub unknown: usize,
}

/// The Track row's abnormal-fact slot, highest rung first.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Abnormal {
    UnknownCommand(CommandId),
    UnknownEffect {
        duplicate_risk_since: Option<HostTime>,
    },
    Blocker(Blockage),
    EvidenceNotShown(EvidenceFact),
    Delegated(Option<Text>),
    Calm(Option<Text>),
}

/// A pointer click never confirms authority.
pub fn pointer_confirm() -> Refusal {
    Refusal::PointerNeverConfirms
}

/// Whether a click may act in a float first drawn at `float_drawn`. Without comparable times
/// the click is discarded.
pub fn pointer_click_allowed(float_drawn: Option<Moment>, click: Option<Moment>) -> bool {
    match (float_drawn, click) {
        (Some(f), Some(c)) => f.clock == c.clock && c.at >= f.at + POINTER_DISCARD,
        _ => false,
    }
}

fn read_key(target: &str, subject: Option<&str>) -> String {
    match subject {
        Some(s) => format!("{target}#{s}"),
        None => target.to_string(),
    }
}

fn values(basis: &Basis) -> BTreeMap<String, FieldValue> {
    basis
        .fields
        .iter()
        .map(|f| (f.name.clone(), f.value()))
        .collect()
}

/// Fields of `basis` whose value differs from `seen`, in host order, then fields that vanished.
fn diff(seen: &BTreeMap<String, FieldValue>, basis: &Basis) -> Vec<FieldChange> {
    let mut changes: Vec<FieldChange> = basis
        .fields
        .iter()
        .filter(|f| seen.get(&f.name) != Some(&f.value()))
        .map(|f| FieldChange {
            name: f.name.clone(),
            from: seen.get(&f.name).cloned(),
            to: Some(f.value()),
        })
        .collect();
    for (name, value) in seen {
        if !basis.fields.iter().any(|f| &f.name == name) {
            changes.push(FieldChange {
                name: name.clone(),
                from: Some(value.clone()),
                to: None,
            });
        }
    }
    changes
}

fn matches_action(a: &HostAction, command: CommandType, option: Option<u32>) -> bool {
    a.command == command && a.option == option
}

fn draft_text(draft: Option<&Draft>) -> Option<String> {
    match draft.map(|d| &d.body) {
        Some(DraftBody::Text(t)) if !t.is_empty() => Some(t.clone()),
        _ => None,
    }
}

impl Client {
    /// Starts from a loaded device record. Sent or written commands may have reached the host
    /// before the process stopped, so they become unknown; unprepared intents were never sent
    /// and are dropped. Nothing is sent automatically.
    pub fn new(mut local: DeviceState) -> Client {
        local.outbox.retain(|e| e.state != OutboxState::Preparing);
        for entry in &mut local.outbox {
            if matches!(entry.state, OutboxState::Written | OutboxState::Sent) {
                entry.state = OutboxState::Unknown {
                    since: None,
                    last_query: None,
                    retry_block: None,
                };
            }
        }
        Client {
            host: HostSnapshot::default(),
            local,
            session: Session::default(),
        }
    }

    // --- inbound ---------------------------------------------------------------------------------

    pub fn apply_inbound(&mut self, msg: Inbound, now: Moment) -> Vec<Effect> {
        let mut effects = Vec::new();
        let mut persist = false;
        match msg {
            Inbound::Receipt { command, outcome } => {
                persist |= self.receipt(command, outcome, now, &mut effects)
            }
            Inbound::Lost { command } => {
                let since = self.host.host_now(now);
                if let Some(entry) = self.entry_mut(&command)
                    && matches!(entry.state, OutboxState::Written | OutboxState::Sent)
                {
                    entry.state = OutboxState::Unknown {
                        since,
                        last_query: None,
                        retry_block: None,
                    };
                    persist = true;
                }
            }
            msg => {
                let outcome = reduce_host(&mut self.host, msg, now);
                effects.extend(outcome.resnapshot.into_iter().map(Effect::Resnapshot));
                if outcome.discontinuity {
                    persist |= self.block_old_epoch(now);
                    effects.push(Effect::Notice(Notice::Discontinuity));
                    if self.session.readback.take().is_some() {
                        effects.push(Effect::Notice(Notice::ReadbackVoided));
                    }
                }
                if self.host.connection != Connection::Live {
                    persist |= self.unsettle_in_flight(now);
                }
            }
        }
        persist |= self.reconcile_drafts();
        if persist {
            effects.push(Effect::Persist);
        }
        effects
    }

    fn receipt(
        &mut self,
        command: CommandId,
        outcome: ReceiptOutcome,
        now: Moment,
        effects: &mut Vec<Effect>,
    ) -> bool {
        let since_now = self.host.host_now(now);
        let Some(entry) = self.entry_mut(&command) else {
            effects.push(Effect::Notice(Notice::UnknownReceipt { command }));
            return false;
        };
        if let OutboxState::Settled(_) = entry.state {
            if let ReceiptOutcome::Accepted { seq } | ReceiptOutcome::Duplicate { seq } = outcome {
                effects.push(Effect::Notice(Notice::AlreadyApplied { command, seq }));
            }
            return false;
        }
        entry.state = match outcome {
            ReceiptOutcome::NotFound => match &entry.state {
                OutboxState::Unknown {
                    since, retry_block, ..
                } => OutboxState::Unknown {
                    since: *since,
                    last_query: Some(ReceiptOutcome::NotFound),
                    retry_block: retry_block.clone(),
                },
                _ => OutboxState::Unknown {
                    since: since_now,
                    last_query: Some(ReceiptOutcome::NotFound),
                    retry_block: None,
                },
            },
            ReceiptOutcome::Duplicate { seq } => {
                effects.push(Effect::Notice(Notice::AlreadyApplied { command, seq }));
                OutboxState::Settled(ReceiptOutcome::Duplicate { seq })
            }
            outcome => OutboxState::Settled(outcome),
        };
        true
    }

    fn block_old_epoch(&mut self, now: Moment) -> bool {
        let epoch = self.host.epoch.clone();
        let since = self.host.host_now(now);
        let mut changed = false;
        for entry in self
            .local
            .outbox
            .iter_mut()
            .filter(|e| e.intent.epoch != epoch)
        {
            match &mut entry.state {
                OutboxState::Written | OutboxState::Sent => {
                    entry.state = OutboxState::Unknown {
                        since,
                        last_query: None,
                        retry_block: Some(RetryBlock::EpochChanged),
                    };
                    changed = true;
                }
                OutboxState::Unknown { retry_block, .. } if retry_block.is_none() => {
                    *retry_block = Some(RetryBlock::EpochChanged);
                    changed = true;
                }
                _ => {}
            }
        }
        changed
    }

    fn unsettle_in_flight(&mut self, now: Moment) -> bool {
        let since = self.host.host_now(now);
        let mut changed = false;
        for entry in self
            .local
            .outbox
            .iter_mut()
            .filter(|e| matches!(e.state, OutboxState::Written | OutboxState::Sent))
        {
            entry.state = OutboxState::Unknown {
                since,
                last_query: None,
                retry_block: None,
            };
            changed = true;
        }
        changed
    }

    /// Clears a saved draft once its accepted seq is observed for its object, and only if it
    /// was not edited after it was sent.
    fn reconcile_drafts(&mut self) -> bool {
        let mut changed = false;
        for i in 0..self.local.outbox.len() {
            let entry = &self.local.outbox[i];
            let (
                Some(link),
                OutboxState::Settled(
                    ReceiptOutcome::Accepted { seq } | ReceiptOutcome::Duplicate { seq },
                ),
            ) = (&entry.draft, &entry.state)
            else {
                continue;
            };
            // A list row is not observation of the saved object's contents.
            if entry.intent.epoch.is_none()
                || entry.intent.epoch != self.host.epoch
                || !self.host.objects.contains_key(&entry.intent.target)
            {
                continue;
            }
            let observed = self
                .target_cursor(&entry.intent.target)
                .and_then(|c| c.ledger_seq);
            if observed.is_none_or(|o| o < *seq) {
                continue;
            }
            if self
                .local
                .drafts
                .get(&link.key)
                .is_some_and(|d| d.generation == link.generation)
            {
                self.local.drafts.remove(&link.key);
            }
            self.local.outbox[i].draft = None;
            changed = true;
        }
        changed
    }

    // --- drafts ----------------------------------------------------------------------------------

    /// Replaces a draft's body and returns its new generation.
    pub fn edit_draft(&mut self, key: DraftKey, body: DraftBody) -> u64 {
        let generation = self
            .local
            .drafts
            .get(&key)
            .map(|d| d.generation)
            .into_iter()
            .chain(
                self.local
                    .outbox
                    .iter()
                    .filter_map(|e| e.draft.as_ref())
                    .chain(
                        self.session
                            .readback
                            .iter()
                            .filter_map(|r| r.draft.as_ref()),
                    )
                    .filter(|l| l.key == key)
                    .map(|l| l.generation),
            )
            .max()
            .unwrap_or(0)
            + 1;
        self.local.drafts.insert(key, Draft { body, generation });
        generation
    }

    pub fn discard_draft(&mut self, key: &DraftKey) -> Option<Draft> {
        self.local.drafts.remove(key)
    }

    /// Puts back discarded bytes (`u`) as a new edit, not an old in-flight version.
    pub fn restore_draft(&mut self, key: DraftKey, draft: Draft) {
        self.edit_draft(key, draft.body);
    }

    pub fn drafts_for<'a>(
        &'a self,
        object: &'a str,
    ) -> impl Iterator<Item = (&'a DraftKey, &'a Draft)> + 'a {
        self.local
            .drafts
            .iter()
            .filter(move |(k, _)| k.object == object)
    }

    /// The latest outbox entry that carried this draft and hasn't been reconciled.
    pub fn draft_save(&self, key: &DraftKey) -> Option<&OutboxEntry> {
        self.local
            .outbox
            .iter()
            .rev()
            .find(|e| e.draft.as_ref().is_some_and(|l| &l.key == key))
    }

    // --- pinning and read basis ------------------------------------------------------------------

    fn decidables_of(&self, object: &str) -> Option<(&[Decidable], Option<&Object>)> {
        if let Some(o) = self.host.objects.get(object) {
            return Some((&o.decidables, Some(o)));
        }
        if let Some(row) = self.host.attention.rows.iter().find(|r| r.object == object) {
            return Some((&row.decidables, None));
        }
        self.host
            .agents
            .rows
            .iter()
            .find(|r| r.assignment == object)
            .map(|r| (r.decidables.as_slice(), None))
    }

    // Match decidables_of's source precedence. Scope counters are never compared across scopes.
    fn target_scope(&self, object: &str) -> Option<Scope> {
        if self.host.objects.contains_key(object) {
            return self.host.object_scope.get(object).cloned();
        }
        if self.host.attention.rows.iter().any(|r| r.object == object) {
            return Some(Scope::Attention);
        }
        self.host
            .agents
            .rows
            .iter()
            .any(|r| r.assignment == object)
            .then_some(Scope::Agents)
    }

    /// Only complete observations in a known current epoch may support host effects.
    fn target_cursor(&self, object: &str) -> Option<&Cursor> {
        let scope = self.target_scope(object)?;
        if self.host.epoch.is_none() || self.host.needs_snapshot.contains(&scope) {
            return None;
        }
        self.host
            .cursors
            .get(&scope)
            .filter(|c| c.epoch == self.host.epoch)
    }

    fn target_writable(&self, pin: &DrawnTarget) -> Result<(), Refusal> {
        self.writable()?;
        if pin.epoch.is_none() || pin.epoch != self.host.epoch {
            return Err(Refusal::EpochChanged);
        }
        if self.target_cursor(&pin.object).is_none() {
            return Err(Refusal::Paused(Some(Text::Host(
                "Saving and deciding are paused until this view has caught up".into(),
            ))));
        }
        Ok(())
    }

    /// Captures what the view draws for `object`. Call it while building the frame.
    /// Cached content remains readable; an unverified source has no epoch or ledger sequence.
    pub fn drawn_target(&self, object: &str, surface: Surface) -> Option<DrawnTarget> {
        let (decidables, loaded) = self.decidables_of(object)?;
        let turn = loaded.and_then(|o| match &o.body {
            ObjectBody::Chat(chat) => chat.turn.as_ref(),
            _ => None,
        });
        let scope = match loaded {
            Some(o) if o.kind() == ObjectKind::Settings => EnvelopeScope::Project(
                o.project
                    .as_ref()
                    .map_or_else(|| o.id.clone(), |p| p.id.clone()),
            ),
            Some(o) => EnvelopeScope::Workflow(o.workflow.clone().unwrap_or_else(|| o.id.clone())),
            None => EnvelopeScope::Workflow(
                self.host
                    .agents
                    .rows
                    .iter()
                    .find(|r| r.assignment == object)
                    .and_then(|r| r.workflow.clone())
                    .unwrap_or_else(|| object.to_string()),
            ),
        };
        Some(DrawnTarget {
            object: object.to_string(),
            surface,
            kind: loaded.map(Object::kind),
            revision: loaded.and_then(|o| o.revision.clone()),
            decidables: decidables.to_vec(),
            send_mode: turn.map(TurnState::send_mode),
            turn: turn.and_then(|t| t.turn.clone()),
            scope,
            ledger_seq: self.target_cursor(object).and_then(|c| c.ledger_seq),
            epoch: self.target_cursor(object).and_then(|c| c.epoch.clone()),
        })
    }

    fn acknowledged(&self, key: &str) -> BTreeMap<String, FieldValue> {
        match self.local.read_bases.get(key) {
            Some(rb) if rb.epoch == self.host.epoch => rb.fields.clone(),
            _ => BTreeMap::new(),
        }
    }

    /// Records the basis a view shows when it first opens. A basis already recorded is kept:
    /// only explicit acknowledgement advances it.
    pub fn view_opened(&mut self, object: &str) -> bool {
        if self.target_cursor(object).is_none() {
            return false;
        }
        let Some((decidables, _)) = self.decidables_of(object) else {
            return false;
        };
        let epoch = self.host.epoch.clone();
        let fresh: Vec<(String, ReadBasis)> = decidables
            .iter()
            .map(|d| {
                (
                    read_key(&d.target, d.subject.as_deref()),
                    ReadBasis {
                        epoch: epoch.clone(),
                        fields: values(&d.basis),
                    },
                )
            })
            .filter(|(k, _)| {
                self.local
                    .read_bases
                    .get(k)
                    .is_none_or(|rb| rb.epoch != epoch)
            })
            .collect();
        let changed = !fresh.is_empty();
        self.local.read_bases.extend(fresh);
        changed
    }

    fn current_decidable(&self, object: &str, subject: Option<&str>) -> Option<&Decidable> {
        self.decidables_of(object)?
            .0
            .iter()
            .find(|d| d.subject.as_deref() == subject)
    }

    /// Basis fields that changed since the user last acknowledged them (`[!]`).
    pub fn unacknowledged(&self, object: &str, subject: Option<&str>) -> Vec<FieldChange> {
        match self.current_decidable(object, subject) {
            Some(d) => diff(&self.acknowledged(&read_key(object, subject)), &d.basis),
            None => Vec::new(),
        }
    }

    /// Advances one field to its current value: `]d` landing on it, or opening its diff.
    pub fn acknowledge(&mut self, object: &str, subject: Option<&str>, field: &str) -> bool {
        if self.target_cursor(object).is_none() {
            return false;
        }
        let Some(d) = self.current_decidable(object, subject) else {
            return false;
        };
        let value = d
            .basis
            .fields
            .iter()
            .find(|f| f.name == field)
            .map(BasisField::value);
        let key = read_key(object, subject);
        let mut fields = self.acknowledged(&key);
        let before = fields.get(field).cloned();
        match value.clone() {
            Some(v) => fields.insert(field.to_string(), v),
            None => fields.remove(field),
        };
        self.local.read_bases.insert(
            key,
            ReadBasis {
                epoch: self.host.epoch.clone(),
                fields,
            },
        );
        before != value
    }

    pub fn mark_evidence_shown(&mut self, object: &str) -> bool {
        let Some(seq) = self
            .host
            .object(object)
            .and_then(|o| o.handover.evidence.as_ref())
            .and_then(|e| e.seq)
        else {
            return false;
        };
        self.local.evidence_shown.insert(object.to_string(), seq) != Some(seq)
    }

    // --- writes and outbox -----------------------------------------------------------------------

    fn writable(&self) -> Result<(), Refusal> {
        match &self.host.connection {
            Connection::Live => {}
            Connection::Offline { .. } => return Err(Refusal::Offline),
            Connection::Revoked { .. } => return Err(Refusal::Revoked),
            _ => return Err(Refusal::NotConnected),
        }
        if self.host.epoch.is_none() {
            return Err(Refusal::EpochChanged);
        }
        match &self.host.admission {
            Admission::Open => Ok(()),
            Admission::Paused { reason } => Err(Refusal::Paused(reason.clone())),
        }
    }

    fn connected(&self) -> Result<(), Refusal> {
        match &self.host.connection {
            Connection::Live => Ok(()),
            Connection::Offline { .. } => Err(Refusal::Offline),
            Connection::Revoked { .. } => Err(Refusal::Revoked),
            _ => Err(Refusal::NotConnected),
        }
    }

    fn next_id(&mut self) -> Result<CommandId, Refusal> {
        if self.local.device_id.is_empty() {
            return Err(Refusal::NoDeviceId);
        }
        let id = format!("{}-{}", self.local.device_id, self.local.next_command);
        self.local.next_command += 1;
        Ok(id)
    }

    fn record(&mut self, intent: CommandIntent, draft: Option<DraftLink>) -> CommandIntent {
        let created_at = self.host.host_time.map(|c| c.host);
        self.local.outbox.push(OutboxEntry {
            intent: intent.clone(),
            prepared: None,
            draft,
            created_at,
            state: OutboxState::Preparing,
        });
        intent
    }

    /// Makes a write command from a drawn target and a draft. No offline queue: refused unless live.
    pub fn submit(
        &mut self,
        pin: &DrawnTarget,
        request: WriteRequest,
    ) -> Result<CommandIntent, Refusal> {
        self.target_writable(pin)?;
        let draft_key = match &request {
            WriteRequest::SaveAnnotations { draft }
            | WriteRequest::SaveEditedBytes { draft }
            | WriteRequest::SendMessage { draft, .. }
            | WriteRequest::CreateDesign { draft, .. } => Some(draft.clone()),
            WriteRequest::InterruptTurn | WriteRequest::RequestLocalPrompt { .. } => None,
        };
        let draft = match &draft_key {
            Some(key) => {
                if key.object != pin.object {
                    return Err(Refusal::DraftNotForTarget);
                }
                let draft = self.local.drafts.get(key).ok_or(Refusal::NoDraft)?;
                if let Some(e) = self.local.outbox.iter().find(|e| {
                    e.draft.as_ref().is_some_and(|l| {
                        &l.key == key
                            && (e.unresolved()
                                || (l.generation == draft.generation
                                    && matches!(
                                        e.state,
                                        OutboxState::Settled(
                                            ReceiptOutcome::Accepted { .. }
                                                | ReceiptOutcome::Duplicate { .. }
                                        )
                                    )))
                    })
                }) {
                    return Err(Refusal::DraftInFlight(e.intent.id.clone()));
                }
                Some(draft)
            }
            None => None,
        };
        let text = || draft_text(draft).ok_or(Refusal::NoDraft);
        let (command, body) = match &request {
            WriteRequest::SaveAnnotations { draft: key } => match draft.map(|d| &d.body) {
                Some(DraftBody::Notes(items)) if !items.is_empty() => (
                    CommandType::SaveAnnotations,
                    CommandBody::SaveAnnotations {
                        emission: pin.object.clone(),
                        base_set: key.base.clone(),
                        items: items.clone(),
                    },
                ),
                _ => return Err(Refusal::NoDraft),
            },
            WriteRequest::SaveEditedBytes { draft: key } => (
                CommandType::SaveEditedBytes,
                CommandBody::SaveEditedBytes {
                    emission: pin.object.clone(),
                    base: key.base.clone(),
                    text: text()?,
                },
            ),
            WriteRequest::SendMessage { follow_up, .. } => {
                let mode = if *follow_up {
                    SendMode::FollowUp
                } else {
                    pin.send_mode.ok_or(Refusal::NoSendMode)?
                };
                (
                    CommandType::SendMessage,
                    CommandBody::SendMessage {
                        conversation: pin.object.clone(),
                        mode,
                        turn: pin.turn.clone(),
                        text: text()?,
                    },
                )
            }
            WriteRequest::InterruptTurn => (
                CommandType::InterruptTurn,
                CommandBody::InterruptTurn {
                    conversation: pin.object.clone(),
                    turn: pin.turn.clone().ok_or(Refusal::NoTurn)?,
                },
            ),
            WriteRequest::RequestLocalPrompt { source } => (
                CommandType::RequestLocalVerificationPrompt,
                CommandBody::RequestLocalVerificationPrompt {
                    proposal: pin.object.clone(),
                    source: source.clone(),
                },
            ),
            WriteRequest::CreateDesign { project, .. } => (
                CommandType::CreateDesign,
                CommandBody::CreateDesign {
                    project: project.clone(),
                    prompt: text()?,
                },
            ),
        };
        let link = draft_key.zip(draft).map(|(key, d)| DraftLink {
            key,
            generation: d.generation,
        });
        let id = self.next_id()?;
        let intent = CommandIntent {
            id,
            command,
            target: pin.object.clone(),
            scope: pin.scope.clone(),
            epoch: pin.epoch.clone(),
            expected: None,
            body,
        };
        Ok(self.record(intent, link))
    }

    pub fn entry(&self, id: &str) -> Option<&OutboxEntry> {
        self.local.outbox.iter().find(|e| e.intent.id == id)
    }

    fn entry_mut(&mut self, id: &str) -> Option<&mut OutboxEntry> {
        self.local.outbox.iter_mut().find(|e| e.intent.id == id)
    }

    /// Stores the adapter's bytes. Save `local` next; transmit only if that save succeeded.
    pub fn prepared(&mut self, prepared: PreparedCommand) -> Result<(), Refusal> {
        let entry = self
            .entry_mut(&prepared.id)
            .ok_or(Refusal::UnknownCommand)?;
        if entry.state != OutboxState::Preparing {
            return Err(Refusal::WrongState);
        }
        entry.prepared = Some(prepared);
        entry.state = OutboxState::Written;
        Ok(())
    }

    /// The bytes were handed to the adapter (first send or retry).
    pub fn transmitted(&mut self, id: &str) -> Result<(), Refusal> {
        let entry = self.entry_mut(id).ok_or(Refusal::UnknownCommand)?;
        if entry.prepared.is_none() {
            return Err(Refusal::NoBytes);
        }
        match entry.state {
            OutboxState::Written | OutboxState::Unknown { .. } | OutboxState::Sent => {
                entry.state = OutboxState::Sent;
                Ok(())
            }
            _ => Err(Refusal::WrongState),
        }
    }

    /// Drops a command that was never transmitted, e.g. after its save failed.
    pub fn abandon_unsent(&mut self, id: &str) -> bool {
        let before = self.local.outbox.len();
        self.local.outbox.retain(|e| {
            !(e.intent.id == id && matches!(e.state, OutboxState::Preparing | OutboxState::Written))
        });
        if let Some(r) = self
            .session
            .readback
            .as_mut()
            .filter(|r| r.sent.as_deref() == Some(id))
        {
            r.sent = None;
        }
        self.local.outbox.len() != before
    }

    /// The stored bytes for an exact retry (`␣rt`). Never re-encoded. Call `transmitted` after sending.
    pub fn retry(&self, id: &str, adapter_format: &str) -> Result<PreparedCommand, Refusal> {
        let entry = self.entry(id).ok_or(Refusal::UnknownCommand)?;
        self.writable()?;
        let OutboxState::Unknown { retry_block, .. } = &entry.state else {
            return Err(Refusal::NotUnknown);
        };
        if let Some(block) = retry_block {
            return Err(Refusal::RetryBlocked(block.clone()));
        }
        if entry.intent.epoch != self.host.epoch {
            return Err(Refusal::RetryBlocked(RetryBlock::EpochChanged));
        }
        let prepared = entry.prepared.as_ref().ok_or(Refusal::NoBytes)?;
        if prepared.format != adapter_format {
            return Err(Refusal::FormatUnsupported);
        }
        Ok(prepared.clone())
    }

    /// Whether `␣rq` may ask the host about this command. The query never executes.
    pub fn query_receipt(&self, id: &str) -> Result<(), Refusal> {
        let entry = self.entry(id).ok_or(Refusal::UnknownCommand)?;
        self.connected()?;
        match entry.state {
            OutboxState::Unknown { .. } | OutboxState::Sent => Ok(()),
            _ => Err(Refusal::NotUnknown),
        }
    }

    /// Removes a settled entry from the outbox list.
    pub fn discard_settled(&mut self, id: &str) -> bool {
        let before = self.local.outbox.len();
        self.local.outbox.retain(|e| {
            !(e.intent.id == id && matches!(e.state, OutboxState::Settled(_)) && e.draft.is_none())
        });
        self.local.outbox.len() != before
    }

    /// An unsettled command from this device on `object`; it blocks authority there.
    pub fn blocking(&self, object: &str) -> Option<&OutboxEntry> {
        self.local
            .outbox
            .iter()
            .find(|e| e.intent.target == object && e.unresolved())
    }

    // --- authority -------------------------------------------------------------------------------

    /// Policy authority requires a typed draft based on the current host policy.
    fn policy_edits(&self, object: &str, key: &DraftKey) -> Result<Vec<(String, String)>, Refusal> {
        if key.object != object || key.kind != DraftKind::Policy {
            return Err(Refusal::DraftNotForTarget);
        }
        let draft = self.local.drafts.get(key).ok_or(Refusal::NoDraft)?;
        let DraftBody::Policy(policy) = &draft.body else {
            return Err(Refusal::NoDraft);
        };
        let edits = policy.safe_edits().map_err(|_| Refusal::PolicyConflicts)?;
        let revision = self
            .host
            .object(object)
            .and_then(|object| match &object.body {
                ObjectBody::Settings(settings) => settings.policy_default.as_deref(),
                _ => None,
            });
        if revision != Some(policy.base_revision()) {
            return Err(Refusal::StalePolicyDraft);
        }
        Ok(edits)
    }

    /// Opens a readback against the drawn target. Only a user command calls this.
    pub fn open_readback(
        &mut self,
        pin: &DrawnTarget,
        request: AuthorityRequest,
    ) -> Result<(), Refusal> {
        if request.count.is_some() {
            return Err(Refusal::CountNotAllowed);
        }
        if pin.surface == Surface::ListRow && request.verb.needs_work_view() {
            return Err(Refusal::OpenItFirst);
        }
        let types = request.verb.command_types();
        let decidable = pin
            .decidables
            .iter()
            .filter(|d| request.subject.is_none() || d.subject == request.subject)
            .find(|d| d.actions.iter().any(|a| types.contains(&a.command)))
            .ok_or(Refusal::NoDecidable)?;
        let candidates: Vec<&HostAction> = decidable
            .actions
            .iter()
            .filter(|a| types.contains(&a.command))
            .collect();
        let action = match request.option {
            Some(n) => *candidates
                .iter()
                .find(|a| a.option == Some(n))
                .ok_or(Refusal::NoSuchOption)?,
            None if candidates.len() == 1 || candidates.iter().all(|a| a.option.is_none()) => {
                candidates[0]
            }
            None => return Err(Refusal::OptionRequired),
        };
        if matches!(request.verb, AuthorityVerb::Approve | AuthorityVerb::Rework) {
            let unsaved: Vec<DraftKey> = self
                .drafts_for(&pin.object)
                .filter(|(k, _)| k.kind == DraftKind::Annotations)
                .map(|(k, _)| k.clone())
                .collect();
            if !unsaved.is_empty() {
                return Err(Refusal::UnsavedDrafts(unsaved));
            }
        }
        let draft = request
            .draft
            .as_ref()
            .and_then(|k| self.local.drafts.get(k).map(|d| (k, d)));
        let note = draft.and_then(|(_, d)| draft_text(Some(d)));
        let edits = if action.command == CommandType::SavePolicyRevision {
            self.policy_edits(&pin.object, request.draft.as_ref().ok_or(Refusal::NoDraft)?)?
        } else {
            match draft.map(|(_, d)| &d.body) {
                Some(DraftBody::Edits(edits)) => edits.clone(),
                _ => Vec::new(),
            }
        };
        let readback = Readback {
            verb: request.verb,
            pin: pin.clone(),
            decidable: decidable.clone(),
            action: action.clone(),
            note,
            edits,
            draft: draft.map(|(k, d)| DraftLink {
                key: k.clone(),
                generation: d.generation,
            }),
            acknowledged: self
                .acknowledged(&read_key(&decidable.target, decidable.subject.as_deref())),
            drawn_at: None,
            timing_unavailable: false,
            sent: None,
        };
        self.session.readback = Some(readback);
        Ok(())
    }

    /// Call from the post-present hook with the frame's draw time. Only the first draw counts.
    pub fn readback_drawn(&mut self, at: Moment) {
        if let Some(r) = self
            .session
            .readback
            .as_mut()
            .filter(|r| r.drawn_at.is_none())
        {
            r.drawn_at = Some(at);
        }
    }

    pub fn close_readback(&mut self) {
        self.session.readback = None;
    }

    pub fn readback_phase(&self) -> Option<ReadbackPhase> {
        let r = self.session.readback.as_ref()?;
        if let Some(id) = &r.sent {
            return Some(ReadbackPhase::Sent(id.clone()));
        }
        let blocked = |b| Some(ReadbackPhase::Blocked(b));
        match self.target_writable(&r.pin) {
            Ok(()) => {}
            Err(Refusal::Offline) => return blocked(Block::Offline),
            Err(Refusal::Revoked) => return blocked(Block::Revoked),
            Err(Refusal::Paused(reason)) => return blocked(Block::Paused(reason)),
            Err(Refusal::EpochChanged) => return blocked(Block::EpochChanged),
            Err(_) => return blocked(Block::NotConnected),
        }
        if r.pin.epoch != self.host.epoch {
            return blocked(Block::EpochChanged);
        }
        let current_kind = self.host.object(&r.pin.object).map(Object::kind);
        if r.pin.kind == Some(ObjectKind::Unsupported)
            || current_kind == Some(ObjectKind::Unsupported)
        {
            return blocked(Block::UnsupportedKind);
        }
        if let Some(e) = self.blocking(&r.pin.object) {
            return blocked(Block::OutcomeUnknown(e.intent.id.clone()));
        }
        let Some((current, action)) = self
            .current_decidable(&r.pin.object, r.decidable.subject.as_deref())
            .and_then(|d| {
                d.actions
                    .iter()
                    .find(|a| matches_action(a, r.action.command, r.action.option))
                    .map(|a| (d, a))
            })
        else {
            return blocked(Block::Gone);
        };
        for a in [&r.action, action] {
            if let Availability::Unavailable { reason } = &a.availability {
                return blocked(Block::Unavailable(reason.clone()));
            }
        }
        if r.action.effect.is_none() || r.action.not.is_empty() {
            return blocked(Block::NoConsequenceText);
        }
        if r.timing_unavailable {
            return blocked(Block::NoInputTiming);
        }
        if current.basis != r.decidable.basis {
            return Some(ReadbackPhase::Changed(diff(
                &values(&r.decidable.basis),
                &current.basis,
            )));
        }
        let stale = diff(&r.acknowledged, &r.decidable.basis);
        if !stale.is_empty() {
            return Some(ReadbackPhase::Stale(stale));
        }
        Some(ReadbackPhase::Fresh)
    }

    /// `d` in a STALE readback: acknowledges shown fields and closes it. The user must
    /// issue the command again and present a new readback frame before confirming.
    pub fn acknowledge_readback(&mut self) -> bool {
        if !matches!(self.readback_phase(), Some(ReadbackPhase::Stale(_))) {
            return false;
        }
        let Some(r) = self.session.readback.take() else {
            return false;
        };
        let shown = values(&r.decidable.basis);
        if r.acknowledged == shown {
            return false;
        }
        let key = read_key(&r.decidable.target, r.decidable.subject.as_deref());
        self.local.read_bases.insert(
            key,
            ReadBasis {
                epoch: r.pin.epoch.clone(),
                fields: shown,
            },
        );
        true
    }

    /// `y` in the readback. Confirms only a physical, non-repeat key whose OS time on the draw
    /// clock is strictly after the readback's first draw, in a fresh phase.
    pub fn confirm(&mut self, key: &KeyPress) -> Result<CommandIntent, Refusal> {
        let r = self.session.readback.as_mut().ok_or(Refusal::NoReadback)?;
        if r.sent.is_some() {
            return Err(Refusal::AlreadySent);
        }
        let drawn = r.drawn_at.ok_or(Refusal::AwaitingDraw)?;
        if key.repeat {
            return Err(Refusal::Repeat);
        }
        if key.composing {
            return Err(Refusal::Composing);
        }
        let Some(input) = key.input_time.filter(|t| t.clock == drawn.clock) else {
            r.timing_unavailable = true;
            return Err(Refusal::NoInputTiming);
        };
        if input.at <= drawn.at {
            return Err(Refusal::Typeahead);
        }
        let phase = self.readback_phase().ok_or(Refusal::NoReadback)?;
        if phase != ReadbackPhase::Fresh {
            return Err(Refusal::NotFresh(phase));
        }
        let r = self.session.readback.as_ref().ok_or(Refusal::NoReadback)?;
        if r.action.command == CommandType::SavePolicyRevision {
            let link = r.draft.as_ref().ok_or(Refusal::NoDraft)?;
            self.policy_edits(&r.pin.object, &link.key)?;
            if self
                .local
                .drafts
                .get(&link.key)
                .map(|draft| draft.generation)
                != Some(link.generation)
            {
                // The readback showed an earlier edit; issue and draw a new one.
                return Err(Refusal::WrongState);
            }
        }
        let id = self.next_id()?;
        let r = self.session.readback.as_mut().ok_or(Refusal::NoReadback)?;
        let intent = CommandIntent {
            id: id.clone(),
            command: r.action.command,
            target: r.pin.object.clone(),
            scope: r.pin.scope.clone(),
            epoch: r.pin.epoch.clone(),
            expected: Some(r.decidable.basis.clone()),
            body: CommandBody::Authority {
                subject: r.decidable.subject.clone(),
                option: r.action.option,
                note: r.note.clone(),
                edits: r.edits.clone(),
            },
        };
        r.sent = Some(id);
        let draft = r.draft.clone();
        Ok(self.record(intent, draft))
    }

    // --- projections -----------------------------------------------------------------------------

    pub fn count_tags(&self) -> CountTags {
        let rows = &self.host.attention.rows;
        let count = |g: AttentionGroup| rows.iter().filter(|r| r.group == g).count();
        let local_unknown = self
            .local
            .outbox
            .iter()
            .filter(|e| matches!(e.state, OutboxState::Unknown { .. }))
            .count();
        CountTags {
            needs_you: count(AttentionGroup::NeedsYou),
            on_host: count(AttentionGroup::OnHost),
            unknown: rows
                .iter()
                .filter(|r| r.mark == Some(RowMark::Unknown))
                .count()
                + local_unknown,
        }
    }

    pub fn abnormal(&self, object: &str) -> Abnormal {
        if let Some(e) =
            self.local.outbox.iter().find(|e| {
                e.intent.target == object && matches!(e.state, OutboxState::Unknown { .. })
            })
        {
            return Abnormal::UnknownCommand(e.intent.id.clone());
        }
        let Some(o) = self.host.object(object) else {
            return Abnormal::Calm(None);
        };
        if let ObjectBody::Operation(op) = &o.body
            && (matches!(
                op.state,
                OperationState::Unknown | OperationState::Risk | OperationState::RiskHeld
            ) || op.duplicate_risk_since.is_some())
        {
            return Abnormal::UnknownEffect {
                duplicate_risk_since: op.duplicate_risk_since,
            };
        }
        if let Some(Blocker::Typed(b)) = &o.handover.blocker {
            return Abnormal::Blocker(b.clone());
        }
        if let Some(e) = &o.handover.evidence
            && let Some(seq) = e.seq
            && self
                .local
                .evidence_shown
                .get(object)
                .is_none_or(|shown| *shown < seq)
        {
            return Abnormal::EvidenceNotShown(e.clone());
        }
        let review_delegated = match &o.body {
            ObjectBody::Review(r) => r.delegated.clone(),
            _ => None,
        };
        let track_delegated = o
            .track
            .as_ref()
            .is_some_and(|t| t.stages.iter().any(|s| s.state == StageState::Delegated));
        if review_delegated.is_some() || track_delegated {
            return Abnormal::Delegated(review_delegated);
        }
        Abnormal::Calm(o.track.as_ref().and_then(|t| t.calm.clone()))
    }
}
