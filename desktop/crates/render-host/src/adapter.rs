//! Adapter boundary. The demo envelope is private to this local simulator, not a Render protocol.
use render_core::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};
use std::fmt;
use std::time::Duration;

pub const DEMO_FORMAT: &str = "render-desktop-demo/1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AdapterError {
    MissingProtocol,
    NotConnected,
    UnsupportedFormat(String),
    InvalidCommand(String),
    MissingScope(Scope),
}
impl fmt::Display for AdapterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingProtocol => f.write_str("Render host protocol is not configured or accepted; no network or writes are available"),
            Self::NotConnected => f.write_str("demo adapter is not connected"),
            Self::UnsupportedFormat(s) => write!(f, "unsupported adapter format: {s}"),
            Self::InvalidCommand(s) => write!(f, "invalid demo command: {s}"),
            Self::MissingScope(s) => write!(f, "demo scope not found: {s:?}"),
        }
    }
}
impl std::error::Error for AdapterError {}

pub trait HostAdapter {
    fn format(&self) -> &str;
    fn connect(&mut self) -> Result<(), AdapterError>;
    fn poll(&mut self) -> Option<Inbound>;
    fn prepare(&self, intent: &CommandIntent) -> Result<PreparedCommand, AdapterError>;
    fn transmit(&mut self, command: &PreparedCommand) -> Result<(), AdapterError>;
    fn query_receipt(&mut self, id: &str) -> Result<(), AdapterError>;
    fn subscribe(&mut self, scopes: &[Scope]) -> Result<(), AdapterError>;
    fn fetch(&mut self, scope: &Scope) -> Result<(), AdapterError>;
}

#[derive(Default)]
pub struct DisconnectedAdapter {
    _private: (),
}
impl HostAdapter for DisconnectedAdapter {
    fn format(&self) -> &str {
        "unconfigured"
    }
    fn connect(&mut self) -> Result<(), AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
    fn poll(&mut self) -> Option<Inbound> {
        None
    }
    fn prepare(&self, _: &CommandIntent) -> Result<PreparedCommand, AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
    fn transmit(&mut self, _: &PreparedCommand) -> Result<(), AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
    fn query_receipt(&mut self, _: &str) -> Result<(), AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
    fn subscribe(&mut self, _: &[Scope]) -> Result<(), AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
    fn fetch(&mut self, _: &Scope) -> Result<(), AdapterError> {
        Err(AdapterError::MissingProtocol)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u32,
    intent: CommandIntent,
}

pub struct DemoAdapter {
    initial: Option<Vec<Inbound>>,
    host: HostSnapshot,
    events: VecDeque<Inbound>,
    receipts: BTreeMap<String, (Vec<u8>, ReceiptOutcome)>,
    connected: bool,
}
impl DemoAdapter {
    pub fn new(initial: Vec<Inbound>) -> Self {
        Self {
            initial: Some(initial),
            host: HostSnapshot::default(),
            events: VecDeque::new(),
            receipts: BTreeMap::new(),
            connected: false,
        }
    }
    fn emit(&mut self, event: Inbound) {
        reduce_host(
            &mut self.host,
            event.clone(),
            Moment {
                clock: ClockId(0),
                at: Duration::ZERO,
            },
        );
        self.events.push_back(event);
    }
    fn require_connected(&self) -> Result<(), AdapterError> {
        if self.connected {
            Ok(())
        } else {
            Err(AdapterError::NotConnected)
        }
    }
    fn snapshot(&self, scope: &Scope) -> Result<Inbound, AdapterError> {
        let at = self
            .host
            .cursors
            .get(scope)
            .cloned()
            .ok_or_else(|| AdapterError::MissingScope(scope.clone()))?;
        let mut resources: Vec<Resource> = self
            .host
            .objects
            .values()
            .filter(|o| self.host.object_scope.get(&o.id) == Some(scope))
            .cloned()
            .map(Resource::Object)
            .collect();
        match scope {
            Scope::Attention => {
                resources.extend(
                    self.host
                        .attention
                        .rows
                        .iter()
                        .cloned()
                        .map(Resource::AttentionRow),
                );
                resources.extend(
                    self.host
                        .attention
                        .proposals
                        .iter()
                        .cloned()
                        .map(Resource::Proposal),
                );
                resources.extend(self.host.slots.map(Resource::Slots));
            }
            Scope::Agents => {
                resources.extend(
                    self.host
                        .agents
                        .rows
                        .iter()
                        .cloned()
                        .map(Resource::AgentRow),
                );
                resources.extend(self.host.agents.totals.map(Resource::AgentTotals));
            }
            Scope::Slices => {
                resources.extend(
                    self.host
                        .slices
                        .rows
                        .iter()
                        .cloned()
                        .map(Resource::SliceRow),
                );
                resources.push(Resource::LifecycleStates(
                    self.host.lifecycle_states.clone(),
                ));
            }
            Scope::Object(_) => {}
        }
        if let Some(refs) = self.host.references.get(scope) {
            resources.push(Resource::References(refs.clone()));
        }
        resources.extend(
            self.host
                .unsupported
                .iter()
                .filter(|n| &n.scope == scope)
                .map(|n| Resource::Unsupported {
                    kind: n.kind.clone(),
                    id: n.id.clone(),
                    reason: n.reason.clone(),
                }),
        );
        Ok(Inbound::Snapshot {
            scope: scope.clone(),
            at,
            resources,
        })
    }
    fn apply(&mut self, i: &CommandIntent) -> ReceiptOutcome {
        if !self.host.writable() {
            return refused("writes_unavailable");
        }
        if i.epoch != self.host.epoch {
            return refused("epoch_changed");
        }
        let Some(mut object) = self.host.objects.get(&i.target).cloned() else {
            return refused("target_not_found");
        };
        let scope_matches = match &i.scope {
            EnvelopeScope::Workflow(id) => object.workflow.as_ref() == Some(id) || &object.id == id,
            EnvelopeScope::Project(id) => object.project.as_ref().is_some_and(|p| &p.id == id),
        };
        if !scope_matches {
            return refused("scope_mismatch");
        }
        let Some(scope) = self.host.object_scope.get(&i.target).cloned() else {
            return refused("scope_unavailable");
        };
        if self.host.needs_snapshot.contains(&scope) {
            return refused("scope_incomplete");
        }
        let seq = self.host.seq.unwrap_or(0) + 1;
        let revision = format!("demo-{seq}");
        let mut consumed = None;
        if let CommandBody::Authority {
            subject, option, ..
        } = &i.body
        {
            let Some(d) = object
                .decidables
                .iter()
                .find(|d| {
                    d.target == i.target
                        && &d.subject == subject
                        && d.actions
                            .iter()
                            .any(|a| a.command == i.command && &a.option == option)
                })
                .cloned()
            else {
                return refused("action_unavailable");
            };
            if i.expected.as_ref() != Some(&d.basis) {
                return match &i.expected {
                    Some(sent) => ReceiptOutcome::StaleBasis(StaleReply {
                        sent: sent.clone(),
                        current: d.basis,
                        changes: vec![],
                        changed_refs: vec![],
                        actions: d.actions,
                        note: Some(Text::Content("demo basis changed".into())),
                    }),
                    None => refused("expected_basis_required"),
                };
            }
            if !d.actions.iter().any(|a| {
                a.command == i.command
                    && &a.option == option
                    && a.availability == Availability::Available
            }) {
                return refused("action_unavailable");
            }
            consumed = Some(d);
        } else if i.expected.is_some() {
            return refused("unexpected_basis");
        }
        match (&mut object.body, &i.body) {
            (
                ObjectBody::Review(r),
                CommandBody::SaveAnnotations {
                    emission,
                    base_set,
                    items,
                },
            ) => {
                if emission != &r.emission || base_set != &r.annotation_set {
                    return refused("stale_annotation_basis");
                }
                r.annotation_set = Some(revision.clone());
                // SaveAnnotations carries only local draft notes, not the acknowledged set.
                r.annotations.extend(items.iter().map(|n| Annotation {
                    id: format!("demo-{}-{}", i.id, n.local_id),
                    set_revision: revision.clone(),
                    anchor: n.anchor.clone(),
                    body: Text::Content(n.body.clone()),
                    author: None,
                    saved_at: None,
                }));
                // These are opaque simulator tokens, not production content hashes.
                // Saving notes changes the review authority basis, never its emitted bytes.
                for d in &mut object.decidables {
                    d.basis.digest = format!("demo-basis-{seq}");
                    for field in &mut d.basis.fields {
                        if field.name == "annotations" {
                            field.revision = Some(revision.clone());
                            field.digest = Some(format!("demo-annotations-{seq}"));
                            field.changed_seq = Some(seq);
                            field.changed_at = None;
                            field.changed_by = None;
                        }
                    }
                }
            }
            // Review.text is immutable emission content, not an edited-concern field.
            (_, CommandBody::SaveEditedBytes { .. }) => {
                return refused("demo_edited_concern_not_modeled");
            }
            (
                ObjectBody::Chat(chat),
                CommandBody::SendMessage {
                    conversation,
                    mode,
                    turn,
                    text,
                },
            ) => {
                if conversation != &i.target {
                    return refused("conversation_mismatch");
                }
                let Some(current) = &chat.turn else {
                    return refused("turn_unavailable");
                };
                if matches!(mode, SendMode::Steer | SendMode::FollowUp)
                    && current.phase == TurnPhase::Ended
                {
                    return ReceiptOutcome::TurnEnded;
                }
                if turn != &current.turn
                    || (*mode == SendMode::Prompt && current.phase == TurnPhase::Running)
                    || (*mode != SendMode::Prompt && current.phase != TurnPhase::Running)
                {
                    return ReceiptOutcome::TurnStateChanged;
                }
                if *mode == SendMode::Steer {
                    chat.steers.push(Steer {
                        id: format!("demo-{}", i.id),
                        text: Text::Content(text.clone()),
                        delivery: Delivery::Pending,
                        delivered_after: None,
                        receipt: Some(i.id.clone()),
                    });
                } else {
                    chat.messages.push(Message {
                        id: format!("demo-{}", i.id),
                        role: Role {
                            class: RoleClass::Human,
                            label: "demo user".into(),
                        },
                        at: None,
                        model: None,
                        assignment: None,
                        turn: turn.clone(),
                        receipt: Some(i.id.clone()),
                        body: MessageBody::Text {
                            text: text.clone(),
                            streaming: false,
                            truncated: false,
                        },
                    });
                }
            }
            (ObjectBody::Chat(chat), CommandBody::InterruptTurn { conversation, turn }) => {
                if conversation != &i.target {
                    return refused("conversation_mismatch");
                }
                let Some(current) = &mut chat.turn else {
                    return refused("turn_unavailable");
                };
                if current.phase == TurnPhase::Ended {
                    return ReceiptOutcome::TurnEnded;
                }
                if current.turn.as_ref() != Some(turn) || current.phase != TurnPhase::Running {
                    return ReceiptOutcome::TurnStateChanged;
                }
                current.phase = TurnPhase::Ended;
            }
            (ObjectBody::Review(r), CommandBody::Authority { .. })
                if matches!(
                    i.command,
                    CommandType::ApproveCheckpoint | CommandType::RequestRework
                ) =>
            {
                r.fidelity = Some(Text::Content(
                    if i.command == CommandType::ApproveCheckpoint {
                        "demo only: checkpoint approved"
                    } else {
                        "demo only: rework requested"
                    }
                    .into(),
                ));
                object.next = Some(Next::Nothing);
            }
            (ObjectBody::Decision(d), CommandBody::Authority { option, .. })
                if i.command == CommandType::RecordDecision =>
            {
                let Some(choice) = d.options.iter().find(|o| Some(o.n) == *option) else {
                    return refused("option_not_found");
                };
                d.answer = Some(Text::Content(format!(
                    "demo only: {}",
                    choice.title.as_str()
                )));
                object.next = Some(Next::Nothing);
            }
            (ObjectBody::Settings(s), CommandBody::Authority { edits, .. })
                if i.command == CommandType::SetCheckpointSettings =>
            {
                if edits.is_empty() {
                    return refused("edits_required");
                }
                for (key, value) in edits {
                    let Some(route) = s.routes.iter_mut().find(|r| &r.0 == key) else {
                        return refused("route_not_found");
                    };
                    if !route.2 {
                        return refused("route_not_editable");
                    }
                    route.1 = match value.as_str() {
                        "human" => RouteMode::Human,
                        "delegated" => RouteMode::Delegated,
                        _ => return refused("route_not_supported"),
                    };
                }
                s.settings_revision = Some(revision.clone());
                s.changed_by = None;
                s.changed_at = None;
                s.history
                    .push(Text::Content("demo only: routing changed".into()));
            }
            (ObjectBody::Settings(s), CommandBody::Authority { edits, .. })
                if i.command == CommandType::SavePolicyRevision =>
            {
                if edits.is_empty() {
                    return refused("edits_required");
                }
                for (key, value) in edits {
                    let Some(field) = s.policy_fields.iter_mut().find(|f| &f.0 == key) else {
                        return refused("policy_field_not_found");
                    };
                    field.1 = value.clone();
                }
                s.policy_default = Some(revision.clone());
                s.history.push(Text::Content(
                    "demo only: policy revision saved; no workflows adopted".into(),
                ));
            }
            _ => return refused("demo_command_not_modeled"),
        }
        object.revision = Some(revision);
        if let Some(d) = &consumed {
            object.decidables.retain(|candidate| candidate != d);
        }
        self.update(scope, seq, vec![Change::Upsert(Resource::Object(object))]);
        if consumed.is_some() && self.host.cursors.contains_key(&Scope::Attention) {
            let changes = self
                .host
                .attention
                .rows
                .iter()
                .filter(|r| r.object == i.target && r.group == AttentionGroup::NeedsYou)
                .map(|r| Change::Remove(ResourceKey::AttentionRow(r.id.clone())))
                .collect::<Vec<_>>();
            if !changes.is_empty() {
                self.update(Scope::Attention, seq, changes);
            }
        }
        ReceiptOutcome::Accepted { seq }
    }
    fn update(&mut self, scope: Scope, seq: Seq, changes: Vec<Change>) {
        let mut at = self.host.cursors[&scope].clone();
        let prev_scope_seq = at.scope_seq;
        at.scope_seq += 1;
        at.ledger_seq = Some(seq);
        self.emit(Inbound::Update {
            scope,
            at,
            prev_scope_seq,
            changes,
            facts: vec![],
        });
    }
}
fn refused(code: &str) -> ReceiptOutcome {
    ReceiptOutcome::Refused {
        code: code.into(),
        reason: Some(Text::Content(format!("demo only: {code}"))),
        repair: vec![],
    }
}
fn validate(i: &CommandIntent) -> Result<(), AdapterError> {
    let correct = match &i.body {
        CommandBody::CreateDesign { .. } => i.command == CommandType::CreateDesign,
        CommandBody::SaveAnnotations { .. } => i.command == CommandType::SaveAnnotations,
        CommandBody::SaveEditedBytes { .. } => i.command == CommandType::SaveEditedBytes,
        CommandBody::SendMessage { .. } => i.command == CommandType::SendMessage,
        CommandBody::InterruptTurn { .. } => i.command == CommandType::InterruptTurn,
        CommandBody::RequestLocalVerificationPrompt { .. } => {
            i.command == CommandType::RequestLocalVerificationPrompt
        }
        CommandBody::Authority { .. } => i.command.is_authority(),
    };
    if i.id.is_empty() || i.target.is_empty() || !correct {
        Err(AdapterError::InvalidCommand(
            "id, target or command/body type mismatch".into(),
        ))
    } else {
        Ok(())
    }
}
impl HostAdapter for DemoAdapter {
    fn format(&self) -> &str {
        DEMO_FORMAT
    }
    fn connect(&mut self) -> Result<(), AdapterError> {
        if self.connected {
            return Ok(());
        }
        self.connected = true;
        self.emit(Inbound::Connection(ConnectionEvent::Connecting));
        self.emit(Inbound::Connection(ConnectionEvent::Live {
            host_name: Some("local demo (not a Render host)".into()),
            server_version: Some(DEMO_FORMAT.into()),
        }));
        for frame in self.initial.take().unwrap_or_default() {
            self.emit(frame);
        }
        Ok(())
    }
    fn poll(&mut self) -> Option<Inbound> {
        self.events.pop_front()
    }
    fn prepare(&self, intent: &CommandIntent) -> Result<PreparedCommand, AdapterError> {
        validate(intent)?;
        let envelope = Envelope {
            format: DEMO_FORMAT.into(),
            version: 1,
            intent: intent.clone(),
        };
        let bytes = serde_json::to_vec(&envelope)
            .map_err(|e| AdapterError::InvalidCommand(e.to_string()))?;
        Ok(PreparedCommand {
            id: intent.id.clone(),
            format: DEMO_FORMAT.into(),
            bytes,
            summary: format!(
                "demo only: {} {}",
                intent.command.keymap_wire(),
                intent.target
            ),
        })
    }
    fn transmit(&mut self, command: &PreparedCommand) -> Result<(), AdapterError> {
        self.require_connected()?;
        if command.format != DEMO_FORMAT {
            return Err(AdapterError::UnsupportedFormat(command.format.clone()));
        }
        let envelope: Envelope = serde_json::from_slice(&command.bytes)
            .map_err(|e| AdapterError::InvalidCommand(e.to_string()))?;
        if envelope.format != DEMO_FORMAT {
            return Err(AdapterError::UnsupportedFormat(envelope.format));
        }
        if envelope.version != 1 || envelope.intent.id != command.id {
            return Err(AdapterError::InvalidCommand(
                "version or id mismatch".into(),
            ));
        }
        validate(&envelope.intent)?;
        let outcome = if let Some((bytes, original)) = self.receipts.get(&command.id) {
            if bytes != &command.bytes {
                ReceiptOutcome::CommandConflict
            } else {
                match original {
                    ReceiptOutcome::Accepted { seq } | ReceiptOutcome::Duplicate { seq } => {
                        ReceiptOutcome::Duplicate { seq: *seq }
                    }
                    other => other.clone(),
                }
            }
        } else {
            let result = self.apply(&envelope.intent);
            self.receipts
                .insert(command.id.clone(), (command.bytes.clone(), result.clone()));
            result
        };
        self.events.push_back(Inbound::Receipt {
            command: command.id.clone(),
            outcome,
        });
        Ok(())
    }
    fn query_receipt(&mut self, id: &str) -> Result<(), AdapterError> {
        self.require_connected()?;
        let outcome = self
            .receipts
            .get(id)
            .map(|(_, r)| r.clone())
            .unwrap_or(ReceiptOutcome::NotFound);
        self.events.push_back(Inbound::Receipt {
            command: id.into(),
            outcome,
        });
        Ok(())
    }
    fn subscribe(&mut self, scopes: &[Scope]) -> Result<(), AdapterError> {
        self.require_connected()?;
        let frames = scopes
            .iter()
            .map(|s| self.snapshot(s))
            .collect::<Result<Vec<_>, _>>()?;
        self.events.extend(frames);
        Ok(())
    }
    fn fetch(&mut self, scope: &Scope) -> Result<(), AdapterError> {
        self.require_connected()?;
        self.events.push_back(self.snapshot(scope)?);
        Ok(())
    }
}
