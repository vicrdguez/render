use crate::{AppState, DrawRecord, ServiceRequest, screen::Modal};
use render_core::*;
use rune::{KeyEvent, Tx};

impl AppState {
    pub fn record_draw(&self, at: Moment) {
        let target = self.selected_id().and_then(|id| {
            self.core.drawn_target(
                &id,
                if self.screen().work() {
                    Surface::WorkView
                } else {
                    Surface::ListRow
                },
            )
        });
        *self.draw_record.borrow_mut() = Some(DrawRecord {
            target,
            option: self.current_object().and_then(|o| match &o.body {
                ObjectBody::Decision(d) => d.options.get(self.tab().cursor).map(|o| o.n),
                _ => None,
            }),
            subject: self
                .authority_subject(AuthorityVerb::Routing)
                .or_else(|| self.authority_subject(AuthorityVerb::Policy)),
            at,
            readback_generation: matches!(self.modal, Some(Modal::Readback))
                .then_some(self.readback_generation),
        });
    }
    pub fn acknowledge_draw_for_test(&self, at: Moment) {
        self.record_draw(at);
    }
    pub fn consume_draw(&mut self) {
        let record = self.draw_record.borrow().clone();
        if let Some(record) = record {
            if record.readback_generation == Some(self.readback_generation)
                && matches!(self.modal, Some(Modal::Readback))
            {
                self.core.readback_drawn(record.at);
            }
            let new_draw = self.input_frame.as_ref().is_none_or(|f| f.at != record.at);
            self.input_frame = Some(record);
            if new_draw {
                self.resume_saved_authority();
            }
        }
    }
    /// Core clears a draft link only after accepted/duplicate receipt and scoped
    /// observation. Keep continuation command IDs separately from that live link.
    pub(crate) fn saves_observed(&self, ids: &[CommandId]) -> bool {
        !ids.is_empty()
            && ids.iter().all(|id| {
                self.core.entry(id).is_some_and(|entry| {
                    entry.draft.is_none()
                        && matches!(
                            entry.state,
                            OutboxState::Settled(
                                ReceiptOutcome::Accepted { .. } | ReceiptOutcome::Duplicate { .. }
                            )
                        )
                })
            })
    }
    /// Called only when consuming a new presented frame, never merely on receipt.
    /// Retains the intended verb and opens a fresh readback; it never confirms.
    pub fn resume_saved_authority(&mut self) {
        let Some(verb) = self.pending_authority else {
            return;
        };
        if self.modal.is_some() || self.composer.is_some() {
            return;
        }
        let Some(original) = self.sequence_pin.as_ref() else {
            return;
        };
        let object = original.object.clone();
        if self.core.local.drafts.keys().any(|k| k.object == object) {
            return;
        }
        if !self.saves_observed(&self.authority_save_ids) {
            return;
        }
        let Some(frame) = self.input_frame.as_ref() else {
            return;
        };
        let Some(pin) = frame.target.as_ref() else {
            return;
        };
        if pin.object != object
            || self.core.drawn_target(&object, pin.surface).as_ref() != Some(pin)
        {
            return;
        }
        self.sequence_pin = Some(pin.clone());
        self.pending_authority = None;
        self.authority_save_ids.clear();
        self.authorize(verb);
    }
    pub fn pin_input_target(&mut self) {
        if !self.pending.is_empty() {
            return;
        }
        self.sequence_pin = self.input_frame.as_ref().and_then(|f| f.target.clone());
        self.sequence_option = self.input_frame.as_ref().and_then(|f| f.option);
        self.sequence_subject = self.input_frame.as_ref().and_then(|f| f.subject.clone());
    }
    pub fn open_read_basis(&mut self) {
        if let Some(id) = self.selected_id() {
            self.dirty |= self.core.view_opened(&id);
        }
    }
    pub fn writes_available(&self) -> bool {
        self.core.host.writable() && self.persistence_error.is_none()
    }
    pub fn authority_reason(&self, verb: AuthorityVerb) -> Option<String> {
        if !self.screen().work() && verb.needs_work_view() {
            return Some("Open the object first".into());
        }
        let Some(o) = self.current_object() else {
            return Some("Host decidable unavailable".into());
        };
        if matches!(o.body, ObjectBody::Unsupported { .. }) {
            return Some("Unsupported resource · decisions are off".into());
        }
        let subject = self.authority_subject(verb);
        if verb == AuthorityVerb::Policy && subject.is_some() {
            return Some("Policy adoption requires an explicit selected revision; this host request model does not expose that argument".into());
        }
        let Some(d) = o.decidable_for(verb, subject.as_deref()) else {
            return Some("Host decidable unavailable for this field".into());
        };
        let action = d
            .actions
            .iter()
            .find(|a| verb.command_types().contains(&a.command));
        match action {
            Some(a) => {
                if let Availability::Unavailable { reason } = &a.availability {
                    return Some(
                        reason
                            .as_ref()
                            .map(Text::as_str)
                            .unwrap_or("Host action unavailable")
                            .into(),
                    );
                }
                if a.effect.is_none() || a.not.is_empty() {
                    return Some("Host consequence text unavailable".into());
                }
                None
            }
            None => Some("Host action unavailable".into()),
        }
    }
    fn authority_subject(&self, verb: AuthorityVerb) -> Option<String> {
        if verb == AuthorityVerb::Routing {
            self.current_object().and_then(|o| {
                if let ObjectBody::Settings(s) = &o.body {
                    s.routes
                        .get(self.tab().cursor)
                        .map(|(name, _, _)| name.clone())
                } else {
                    None
                }
            })
        } else if verb == AuthorityVerb::Policy {
            self.current_object().and_then(|o| {
                if let ObjectBody::Settings(s) = &o.body {
                    if self.tab().cursor >= s.routes.len() + s.policy_fields.len() {
                        s.bindings
                            .get(self.tab().cursor - s.routes.len() - s.policy_fields.len())
                            .map(|b| b.0.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
        } else {
            None
        }
    }
    pub fn authorize(&mut self, verb: AuthorityVerb) {
        if self.composer.is_some() {
            self.message("Authority is unavailable in editors");
            return;
        }
        if !self.writes_available() {
            self.message("Saving and deciding are off");
            return;
        }
        let Some(pin) = self.sequence_pin.clone() else {
            self.message("No presented target. Wait for the frame to draw before deciding.");
            return;
        };
        let adoption = pin
            .decidables
            .iter()
            .filter(|d| self.sequence_subject.is_none() || d.subject == self.sequence_subject)
            .flat_map(|d| &d.actions)
            .find(|a| verb.command_types().contains(&a.command))
            .is_some_and(|a| a.command == CommandType::AdoptPolicy);
        if verb == AuthorityVerb::Policy && adoption {
            self.message("Policy adoption requires an explicit selected revision; this host request model does not expose that argument");
            return;
        }
        let option = self.sequence_option;
        let draft_kind = if verb == AuthorityVerb::Decide {
            Some(DraftKind::DecisionNote)
        } else if verb == AuthorityVerb::Policy {
            Some(DraftKind::Policy)
        } else {
            None
        };
        let draft = draft_kind.and_then(|kind| {
            self.core
                .local
                .drafts
                .keys()
                .find(|k| k.object == pin.object && k.kind == kind)
                .cloned()
        });
        let request = AuthorityRequest {
            verb,
            option,
            subject: self.sequence_subject.clone(),
            count: self.count.parse().ok(),
            draft,
        };
        match self.core.open_readback(&pin, request) {
            Ok(()) => {
                self.readback_generation += 1;
                self.show_modal(Modal::Readback);
                self.which_key = false;
                self.pending.clear();
            }
            Err(Refusal::UnsavedDrafts(keys)) => {
                self.pending_authority = Some(verb);
                self.authority_save_ids.clear();
                self.show_modal(Modal::SaveDrafts { count: keys.len() });
            }
            Err(Refusal::StalePolicyDraft | Refusal::PolicyConflicts) => {
                self.show_modal(Modal::PolicyChanges { object: pin.object });
            }
            Err(Refusal::NoDraft) if verb == AuthorityVerb::Policy => {
                self.message("No policy draft or supported adoption arguments. Edit policy explicitly to save a revision.");
            }
            Err(error) => self.refusal(error),
        }
    }
    pub fn readback_key(&mut self, key: &str, event: &KeyEvent, tx: &mut Tx) -> bool {
        if crate::input::float_scroll(key, tx) {
            return true;
        }
        match key {
            "n" | "q" | "<Esc>" | "<C-c>" => {
                self.core.close_readback();
                self.modal = None;
            }
            "y" => {
                if tx.physical_key().is_none() {
                    self.message("A physical key with native timing is required to confirm");
                    return true;
                }
                if event.mods.ctrl || event.mods.alt || event.mods.cmd {
                    return true;
                }
                let input_time = tx.input_time().map(|at| Moment {
                    clock: ClockId(2),
                    at: at.saturating_duration_since(self.origin),
                });
                let key = KeyPress {
                    repeat: tx.key_repeat(),
                    composing: false,
                    input_time,
                };
                match self.core.confirm(&key) {
                    Ok(intent) => {
                        self.outgoing.push(intent);
                        self.dirty = true;
                    }
                    Err(error) => self.refusal(error),
                }
            }
            "d" => {
                let target = self
                    .core
                    .session
                    .readback
                    .as_ref()
                    .map(|r| (r.pin.object.clone(), r.decidable.subject.clone()));
                if let Some((id, subject)) = target {
                    if self
                        .core
                        .local
                        .drafts
                        .keys()
                        .any(|k| k.object == id && k.kind == DraftKind::Policy)
                    {
                        self.core.close_readback();
                        self.show_modal(Modal::PolicyChanges { object: id });
                        return true;
                    }
                    let changes = self.core.unacknowledged(&id, subject.as_deref());
                    let lines = changes
                        .iter()
                        .map(|c| format!("{}  {:?} → {:?}", c.name, c.from, c.to))
                        .collect();
                    for change in changes {
                        self.dirty |= self.core.acknowledge(&id, subject.as_deref(), &change.name);
                    }
                    self.core.close_readback();
                    self.show_modal(Modal::Info {
                        title: "Basis changes acknowledged · issue the command again after reading"
                            .into(),
                        lines,
                    });
                }
            }
            "K" => self.message(
                "Every host basis field is shown in the readback. Scroll the float for more.",
            ),
            _ => {}
        }
        true
    }
    pub fn acknowledge_changes(&mut self) {
        let Some(id) = self.selected_id() else { return };
        if self
            .core
            .local
            .drafts
            .keys()
            .any(|k| k.object == id && k.kind == DraftKind::Policy)
        {
            self.show_modal(Modal::PolicyChanges { object: id });
            return;
        }
        let changes = self.core.unacknowledged(&id, None);
        let lines = changes
            .iter()
            .map(|c| format!("{}  {:?} → {:?}", c.name, c.from, c.to))
            .collect();
        for change in changes {
            self.dirty |= self.core.acknowledge(&id, None, &change.name);
        }
        self.dirty |= self.core.mark_evidence_shown(&id);
        self.show_modal(Modal::Info {
            title: "What changed · acknowledged on this device".into(),
            lines,
        });
    }
    fn submit(&mut self, request: WriteRequest) {
        if !self.writes_available() {
            self.message(
                "Not sent. The host or local persistence is unavailable. Your draft is kept.",
            );
            return;
        }
        let Some(pin) = self
            .sequence_pin
            .clone()
            .or_else(|| self.input_frame.as_ref().and_then(|f| f.target.clone()))
        else {
            self.message("Not sent. No presented target is available.");
            return;
        };
        match self.core.submit(&pin, request) {
            Ok(intent) => {
                self.outgoing.push(intent);
                self.dirty = true;
            }
            Err(error) => self.refusal(error),
        }
    }
    pub fn save_drafts(&mut self, _tx: &mut Tx) {
        if self.screen() == crate::Screen::Decision {
            self.message("Local draft · sent with your answer");
            return;
        }
        self.sync_composer();
        let Some(id) = self.selected_id() else { return };
        let keys = self
            .core
            .local
            .drafts
            .keys()
            .filter(|k| k.object == id)
            .cloned()
            .collect::<Vec<_>>();
        if keys.is_empty() {
            self.message("No local drafts to save");
        }
        for key in keys {
            match key.kind {
                DraftKind::Annotations => self.submit(WriteRequest::SaveAnnotations { draft: key }),
                DraftKind::EditBuffer => self.submit(WriteRequest::SaveEditedBytes { draft: key }),
                _ => self.message("This draft is sent with its own action"),
            }
        }
    }
    pub fn send_chat(&mut self, follow_up: bool, _tx: &mut Tx) {
        self.sync_composer();
        let key = self.composer.as_ref().map(|c| c.key.clone()).or_else(|| {
            self.selected_id().and_then(|id| {
                self.core
                    .local
                    .drafts
                    .keys()
                    .find(|k| k.object == id && k.kind == DraftKind::Prompt)
                    .cloned()
            })
        });
        if let Some(draft) = key {
            self.submit(WriteRequest::SendMessage { draft, follow_up });
        } else {
            self.message("No prompt draft to send");
        }
    }
    pub fn interrupt(&mut self) {
        self.submit(WriteRequest::InterruptTurn);
    }
    pub fn request_prompt(&mut self) {
        let source = self.current_object().and_then(|o| {
            if let ObjectBody::LocalPrompt(p) = &o.body {
                p.current_source.clone()
            } else {
                o.revision.clone()
            }
        });
        self.submit(WriteRequest::RequestLocalPrompt { source });
    }
    pub fn recover(&mut self, retry: bool, index: usize) {
        let Some(id) = self
            .core
            .local
            .outbox
            .get(index)
            .map(|e| e.intent.id.clone())
        else {
            self.message("Nothing in the outbox");
            return;
        };
        if retry {
            let format = self.adapter_format();
            match self.core.retry(&id, &format) {
                Ok(bytes) => self.requests.push(ServiceRequest::Retry(bytes)),
                Err(error) => self.refusal(error),
            }
        } else {
            match self.core.query_receipt(&id) {
                Ok(()) => self.requests.push(ServiceRequest::Query(id)),
                Err(error) => self.refusal(error),
            }
        }
    }
    pub fn reconnect(&mut self) {
        if matches!(self.core.host.connection, Connection::Revoked { .. }) {
            self.message("This device was revoked. Automatic retry is stopped.");
            return;
        }
        self.requests.push(ServiceRequest::Reconnect);
    }
    pub fn refusal(&mut self, error: Refusal) {
        let text = match error {
            Refusal::NoDecidable => "Host decidable unavailable".into(),
            Refusal::OpenItFirst => "Open the object first".into(),
            Refusal::NoInputTiming => {
                "Native input timing unavailable. Confirmation is disabled.".into()
            }
            Refusal::Typeahead => "Key predates the shown readback and was discarded".into(),
            Refusal::AwaitingDraw => "Readback has not been drawn. Nothing was sent.".into(),
            Refusal::Repeat => "Repeated key ignored. Nothing was sent.".into(),
            Refusal::Offline => "Offline. Nothing was sent; your draft is kept.".into(),
            other => format!("Action refused · {other:?}"),
        };
        self.message(text);
    }
}
