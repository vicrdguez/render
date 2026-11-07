use crate::{
    Screen,
    screen::{ComposeKind, Modal, Tab},
};
use render_core::*;
use render_editor::Editor;
use rune::Tx;
use std::time::Duration;

pub struct Composer {
    pub kind: ComposeKind,
    pub editor: Editor,
    pub key: DraftKey,
    pub note: Option<LocalNote>,
    pub synced_text: String,
    pub synced_generation: Option<u64>,
    /// Transient native composition, never part of the editor or local draft.
    pub preedit: Option<(String, Option<std::ops::Range<usize>>)>,
}

impl AppState {
    pub fn screen(&self) -> Screen {
        self.tab().screen
    }
    pub fn context(&self) -> &'static str {
        self.screen().context()
    }
    pub fn tab(&self) -> &Tab {
        &self.tabs[self.active]
    }
    pub fn tab_mut(&mut self) -> &mut Tab {
        &mut self.tabs[self.active]
    }
    pub fn chrome_inert(&self) -> bool {
        self.modal.is_some() || self.which_key || self.composer.is_some() || self.hints.is_some()
    }
    pub fn open(&mut self, screen: Screen, object: Option<String>) {
        self.remember_jump();
        self.open_without_jump(screen, object);
        self.remember_jump();
    }
    fn open_without_jump(&mut self, screen: Screen, object: Option<String>) {
        if let Some(i) = self
            .tabs
            .iter()
            .position(|t| t.screen == screen && t.object == object && t.revision.is_none())
        {
            self.active = i;
        } else {
            self.tabs.push(Tab::new(screen, object));
            self.active = self.tabs.len() - 1;
        }
        self.pending.clear();
        self.which_key = false;
        self.open_read_basis();
        // Cached bytes are readable, but do not establish a current scope observation.
        // Ask core whether this loaded target has a verified epoch; do not advance
        // its existing ReadBasis merely because the user reopened the view.
        if let Some(id) = self.tab().object.clone()
            && self.core.host.objects.contains_key(&id)
            && self
                .core
                .drawn_target(&id, Surface::WorkView)
                .is_none_or(|target| target.epoch.is_none())
        {
            self.requests
                .push(crate::ServiceRequest::Snapshot(Scope::Object(id)));
        }
    }
    pub fn open_object(&mut self, id: &str) {
        if self.tombstoned(id) {
            self.message("Target resolved elsewhere · wait for the list to refresh");
            return;
        }
        if let Some(object) = self.core.host.objects.get(id) {
            let screen = screen_for(&object.body);
            self.open(screen, Some(id.into()));
        } else if let Some(slice) = self.slice_rows().iter().find(|r| r.id == id) {
            let target = slice.workflow.clone();
            self.open_object_missing(&target);
        } else if let Some(agent) = self.agent_rows().iter().find(|r| r.assignment == id) {
            let target = agent
                .conversation
                .clone()
                .or_else(|| agent.workflow.clone());
            if let Some(target) = target {
                self.open_object_missing(&target);
            } else {
                self.open_object_missing(id);
            }
        } else {
            self.open_object_missing(id);
        }
    }
    pub(crate) fn open_object_missing(&mut self, id: &str) {
        if self.tombstoned(id) {
            self.message("Target resolved elsewhere · wait for the list to refresh");
            return;
        }
        let screen = self
            .core
            .host
            .objects
            .get(id)
            .map(|o| screen_for(&o.body))
            .unwrap_or(Screen::Review);
        self.open(screen, Some(id.into()));
        if !self.core.host.objects.contains_key(id) {
            self.requests
                .push(crate::ServiceRequest::Snapshot(Scope::Object(id.into())));
            self.message(format!("Object {id} unavailable · requested from host"));
        }
    }
    /// Restore recorded identity without adding another jump. Never display the
    /// current revision while labelling it as a historical one.
    pub fn open_mark(&mut self, mark: &Mark) {
        let screen = self
            .core
            .host
            .objects
            .get(&mark.object)
            .map(|o| screen_for(&o.body))
            .unwrap_or(Screen::Review);
        if let Some(i) = self.tabs.iter().position(|t| {
            t.object.as_ref() == Some(&mark.object) && t.revision.as_ref() == Some(&mark.revision)
        }) {
            self.active = i;
        } else {
            let mut tab = Tab::new(screen, Some(mark.object.clone()));
            tab.revision = Some(mark.revision.clone());
            self.tabs.push(tab);
            self.active = self.tabs.len() - 1;
        }
        self.pending.clear();
        self.which_key = false;
        if self.current_object().is_none() {
            self.message("Requested historical content unavailable until supplied by the host");
        } else if let Some(byte) = mark.byte {
            self.reader_seek(byte as usize);
        }
    }
    pub fn jump_history(&mut self, forward: bool) -> bool {
        let len = self.core.local.jumplist.len();
        if len == 0 {
            return false;
        }
        let index = if forward {
            self.jump_index.saturating_add(1).min(len - 1)
        } else {
            self.jump_index.saturating_sub(1).min(len - 1)
        };
        let mark = self.core.local.jumplist[index].clone();
        self.jump_index = index;
        self.open_mark(&mark);
        true
    }
    pub fn open_selected(&mut self) {
        if self.screen() == Screen::Results {
            if let Some(id) = self.visible_ids().get(self.tab().cursor).cloned() {
                self.open_object_missing(&id);
            }
            return;
        }
        if let Some(object) = self.current_object() {
            match &object.body {
                ObjectBody::Operation(op) => {
                    if let Some(id) = op.recovery_decision.clone() {
                        self.open_object(&id);
                        return;
                    }
                }
                ObjectBody::Proposal(p) if self.screen() == Screen::Proposal => {
                    if let Some(id) = p.slices.get(self.tab().cursor).map(|s| s.id.clone()) {
                        self.open_object(&id);
                        return;
                    }
                }
                _ => {}
            }
        }
        if let Some(id) = self.selected_id() {
            self.open_object(&id);
        } else {
            self.message("No host object under the cursor");
        }
    }
    pub fn open_kind(&mut self, screen: Screen) {
        let selected = self.selected_id();
        let current = self.current_object();
        let slice = self
            .slice_rows()
            .iter()
            .find(|r| Some(&r.id) == selected.as_ref());
        let attention = self
            .attention_rows()
            .iter()
            .find(|r| Some(&r.object) == selected.as_ref());
        let workflow = current
            .and_then(|o| o.workflow.as_ref())
            .or_else(|| slice.map(|r| &r.workflow));
        let project = current
            .and_then(|o| o.project.as_ref())
            .or_else(|| slice.and_then(|r| r.project.as_ref()))
            .or_else(|| attention.and_then(|r| r.project.as_ref()));
        let proposal = slice
            .and_then(|r| r.proposal.as_ref())
            .or_else(|| attention.and_then(|r| r.proposal.as_ref()));
        let candidate = self
            .core
            .host
            .objects
            .values()
            .filter(|o| screen_for(&o.body) == screen)
            .filter(|o| {
                if screen == Screen::Proposal && proposal.is_some() {
                    return Some(&o.id) == proposal;
                }
                if let Some(workflow) = workflow {
                    return o.workflow.as_ref() == Some(workflow) || &o.id == workflow;
                }
                project.is_some_and(|p| o.project.as_ref().is_some_and(|q| p.id == q.id))
            })
            .max_by_key(|o| match &o.body {
                ObjectBody::LocalPrompt(p) => p.version.unwrap_or(0),
                _ => 0,
            })
            .map(|o| o.id.clone());
        if let Some(id) = candidate {
            self.open(screen, Some(id));
            if screen == Screen::Settings {
                self.tab_mut().cursor = 0;
            }
        } else {
            self.message(format!("Related {} unavailable", screen.title()));
        }
    }
    pub fn visible_ids(&self) -> Vec<String> {
        match self.screen() {
            Screen::Brief => self
                .attention_rows()
                .iter()
                .filter(|r| r.group != AttentionGroup::Done || self.expanded)
                .map(|r| r.object.clone())
                .collect(),
            Screen::Slices => self
                .slice_rows()
                .iter()
                .filter(|r| {
                    if self.filters.is_empty() {
                        !matches!(
                            r.lifecycle.as_str(),
                            "merged" | "closed" | "canceled" | "cancelled" | "done"
                        )
                    } else {
                        self.filters.contains(&r.lifecycle)
                    }
                })
                .map(|r| r.id.clone())
                .collect(),
            Screen::Results => self
                .tab()
                .results
                .as_ref()
                .map(|r| r.rows.iter().map(|r| r.object.clone()).collect())
                .unwrap_or_default(),
            Screen::Proposals => self.proposal_rows().iter().map(|r| r.id.clone()).collect(),
            Screen::Agents => self
                .agent_rows()
                .iter()
                .map(|r| r.assignment.clone())
                .collect(),
            _ => self.tab().object.iter().cloned().collect(),
        }
    }
    pub fn selected_id(&self) -> Option<String> {
        self.selected_display_id().filter(|id| !self.tombstoned(id))
    }
    pub fn selected_display_id(&self) -> Option<String> {
        if self.screen().work() {
            self.tab().object.clone()
        } else {
            self.visible_ids().get(self.tab().cursor).cloned()
        }
    }
    pub fn select_id(&mut self, id: &str) {
        if let Some(i) = self.visible_ids().iter().position(|x| x == id) {
            self.tab_mut().cursor = i;
        }
    }
    pub fn current_object(&self) -> Option<&Object> {
        self.selected_id()
            .and_then(|id| self.core.host.objects.get(&id))
            .filter(|o| {
                self.tab()
                    .revision
                    .as_ref()
                    .is_none_or(|revision| &o.revision == revision)
            })
    }
    pub fn cursor_limit(&self) -> usize {
        if !self.screen().work() {
            return self.visible_ids().len();
        }
        self.current_object()
            .map(|o| match &o.body {
                ObjectBody::Decision(d) => d.options.len(),
                ObjectBody::Review(r) => {
                    if self.screen() == Screen::Dispositions {
                        r.dispositions.len()
                    } else {
                        r.nodes.len()
                    }
                }
                ObjectBody::Chat(c) => c.messages.len(),
                ObjectBody::Evidence(e) => e.findings.len() + e.obligations.len() + e.passes.len(),
                ObjectBody::Proposal(p) => p.slices.len(),
                ObjectBody::Settings(s) => {
                    s.routes.len() + s.policy_fields.len() + s.bindings.len()
                }
                _ => 0,
            })
            .unwrap_or(0)
    }
    pub fn move_cursor(&mut self, step: isize, tx: &mut Tx) {
        let limit = self.cursor_limit();
        let next = self
            .tab()
            .cursor
            .saturating_add_signed(step)
            .min(limit.saturating_sub(1));
        self.tab_mut().cursor = next;
        if step < 0 {
            self.follow = false;
        }
        self.reveal_cursor(tx);
    }
    pub fn reveal_cursor(&self, tx: &mut Tx) {
        let unit = if self.screen() == Screen::Brief {
            92.0
        } else if self.screen().work() {
            26.0
        } else {
            32.0
        };
        let y = (self.tab().cursor as f32 * unit - 180.0).max(0.0);
        tx.scroll_to_y(
            if self.screen() == Screen::Brief {
                "brief.scroll"
            } else if self.screen().work() {
                "work.scroll"
            } else {
                "list.scroll"
            },
            y,
        );
    }
    pub fn counts(&self) -> (usize, usize, usize) {
        let c = self.core.count_tags();
        (c.needs_you, c.on_host, c.unknown)
    }
    pub fn tab_title(&self, tab: &Tab) -> String {
        if let Some(results) = &tab.results {
            return format!("picker: {}", results.query);
        }
        tab.object
            .as_ref()
            .and_then(|id| self.core.host.objects.get(id))
            .filter(|o| {
                tab.revision
                    .as_ref()
                    .is_none_or(|revision| &o.revision == revision)
            })
            .map(|o| {
                format!(
                    "{} · {}",
                    o.title.as_deref().unwrap_or(&o.id),
                    tab.screen.title().to_lowercase()
                )
            })
            .unwrap_or_else(|| tab.screen.title().into())
    }
    pub fn breadcrumb(&self) -> String {
        format!("{} › {}", self.tab_title(self.tab()), self.tab().cursor + 1)
    }
    pub fn mode_label(&self) -> &'static str {
        if matches!(self.modal, Some(Modal::Readback)) {
            "READBACK"
        } else if self.hints.is_some() {
            "HINT"
        } else if matches!(self.modal, Some(Modal::Picker { .. } | Modal::Ex(_))) {
            "COMMAND"
        } else if let Some(c) = &self.composer {
            match c.editor.mode() {
                render_editor::Mode::Insert => "INSERT",
                render_editor::Mode::Visual => "VISUAL",
                render_editor::Mode::VLine => "V-LINE",
                _ => "NORMAL",
            }
        } else if self.visual {
            "VISUAL"
        } else {
            "NORMAL"
        }
    }
    pub fn message(&mut self, text: impl Into<String>) {
        let text = text.into();
        if self.messages.last() != Some(&text) {
            self.messages.push(text);
        }
        if self.messages.len() > 200 {
            self.messages.remove(0);
        }
    }
    pub fn echo(&self) -> &str {
        self.messages.last().map(String::as_str).unwrap_or("")
    }
    pub fn host_label(&self) -> String {
        let label = match &self.core.host.connection {
            Connection::Connecting => "not configured · disconnected".into(),
            Connection::Live => self
                .core
                .host
                .host_name
                .clone()
                .unwrap_or_else(|| "host connected".into()),
            Connection::Offline { .. } => "offline · saving and deciding are off".into(),
            Connection::Revoked { .. } => "revoked · frozen view".into(),
            Connection::CredentialRefused { .. } => "credentials refused · pair this device".into(),
            Connection::TooOld { .. } => "unsupported host protocol".into(),
        };
        if self.demo && !label.starts_with("DEMO · ") {
            format!("DEMO · {label}")
        } else {
            label
        }
    }
    pub fn sequence_label(&self) -> String {
        self.core
            .host
            .seq
            .map(|s| {
                format!(
                    "seq {s}{}",
                    if self.core.host.connection == Connection::Live {
                        ""
                    } else {
                        " · frozen"
                    }
                )
            })
            .unwrap_or_else(|| "seq unavailable".into())
    }
    pub fn notice(&self) -> Option<String> {
        if let Some(error) = &self.persistence_error {
            return Some(format!(
                "Local persistence unavailable. Nothing will be sent. {error}"
            ));
        }
        match &self.core.host.connection{Connection::Offline{reason,..}=>Some(format!("Offline · cached view only · local drafts stay on this device · {}",reason.as_deref().unwrap_or("saving and deciding are off"))),Connection::Revoked{..}=>Some("This device's enrollment was revoked. The client will not retry. Local drafts stay on this device.".into()),Connection::TooOld{..}=>Some("This client cannot read the host's protocol. Update the client. Saving and deciding are off.".into()),Connection::CredentialRefused{..}=>Some("The host refused this device's credential. Ask its administrator to pair it. Local drafts stay on this device.".into()),_=>None}
    }
    pub fn track_text(&self) -> String {
        self.current_object()
            .map(|o| crate::views::track_text(o.track.as_ref()))
            .unwrap_or_else(|| format!("{} · unavailable", self.screen().title()))
    }
    pub fn abnormal_fact(&self) -> String {
        self.current_object()
            .map(|o| {
                if let Some(Blocker::Typed(_)) = &o.handover.blocker {
                    return crate::views::blocker_text(o.handover.blocker.as_ref());
                }
                if let ObjectBody::Review(r) = &o.body
                    && let Some(d) = &r.delegated
                {
                    return d.as_str().into();
                }
                o.track
                    .as_ref()
                    .and_then(|t| t.calm.as_ref())
                    .map(Text::as_str)
                    .unwrap_or("handover unavailable")
                    .into()
            })
            .unwrap_or_default()
    }
    pub fn age(&self, time: Option<HostTime>) -> String {
        let Some(time) = time else {
            return "not observed yet".into();
        };
        let Some(now) = self.core.host.host_now(self.moment()) else {
            return "host time unavailable".into();
        };
        let seconds = (now.utc_ms - time.utc_ms).max(0) / 1000;
        if seconds < 60 {
            format!("{seconds} s ago")
        } else if seconds < 3600 {
            format!("{} m", seconds / 60)
        } else if seconds < 86400 {
            format!("{} h", seconds / 3600)
        } else {
            format!("{} d {} h", seconds / 86400, (seconds % 86400) / 3600)
        }
    }
    /// The renderer's parser is also the navigation boundary: code and escaped IDs
    /// cannot become targets merely because their bytes resemble a reference.
    pub fn navigation_targets(&self) -> Vec<render_content::NavigationTarget> {
        let refs = self
            .current_object()
            .and_then(|o| self.core.host.object_scope.get(&o.id))
            .and_then(|scope| self.core.host.references.get(scope))
            .map(|rs| {
                rs.iter()
                    .map(|r| render_content::Reference {
                        label: r.label.clone(),
                        target: r.target.clone(),
                        reason: r.reason.as_ref().map(|t| t.as_str().to_owned()),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        render_content::Document::parse(&self.source_text(), &refs)
            .targets()
            .to_vec()
    }
    pub fn navigation_target(&self) -> Option<render_content::NavigationTarget> {
        self.navigation_targets()
            .into_iter()
            .find(|t| t.source.contains(&self.tab().reader.cursor()))
    }
    /// Hint targets prefixed with byte: are local source positions, never object IDs.
    pub fn select_hint_target(&mut self, target: &str) {
        self.remember_jump();
        if let Some(byte) = target.strip_prefix("byte:").and_then(|b| b.parse().ok()) {
            self.reader_seek(byte);
        } else {
            self.select_id(target);
        }
        self.remember_jump();
        self.hints = None;
        self.hint_prefix.clear();
    }
    pub fn render_document(&self, text: &str, width: f32) -> rune::El {
        let refs = self
            .current_object()
            .and_then(|o| self.core.host.object_scope.get(&o.id))
            .and_then(|scope| self.core.host.references.get(scope))
            .map(|rs| {
                rs.iter()
                    .map(|r| render_content::Reference {
                        label: r.label.clone(),
                        target: r.target.clone(),
                        reason: r.reason.as_ref().map(|t| t.as_str().to_owned()),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let mut documents = self.documents.borrow_mut();
        if documents
            .get(text)
            .is_none_or(|(cached, _)| cached != &refs)
        {
            documents.insert(
                text.to_owned(),
                (refs.clone(), render_content::Document::parse(text, &refs)),
            );
        }
        documents.get(text).unwrap().1.render(self.theme, width)
    }
    pub fn moment(&self) -> Moment {
        Moment {
            clock: ClockId(1),
            at: Duration::from_secs_f64(self.now.max(0.0)),
        }
    }
    pub fn draft_count(&self) -> usize {
        self.core
            .local
            .drafts
            .values()
            .map(|d| match &d.body {
                DraftBody::Notes(n) => n.len(),
                _ => 1,
            })
            .sum()
    }
    pub fn draft_text(&self, kind: DraftKind) -> String {
        self.selected_id()
            .and_then(|id| {
                self.core
                    .local
                    .drafts
                    .iter()
                    .find(|(k, _)| k.object == id && k.kind == kind)
                    .map(|(_, d)| match &d.body {
                        DraftBody::Text(t) => t.clone(),
                        DraftBody::Edits(e) => e
                            .iter()
                            .map(|(k, v)| format!("{k}={v}"))
                            .collect::<Vec<_>>()
                            .join("\n"),
                        _ => String::new(),
                    })
            })
            .unwrap_or_default()
    }
    pub fn local_notes(&self) -> Vec<LocalNote> {
        self.selected_id()
            .and_then(|id| {
                self.core
                    .local
                    .drafts
                    .iter()
                    .find(|(k, _)| k.object == id && k.kind == DraftKind::Annotations)
                    .map(|(_, d)| {
                        if let DraftBody::Notes(n) = &d.body {
                            n.clone()
                        } else {
                            Vec::new()
                        }
                    })
            })
            .unwrap_or_default()
    }
    pub fn set_mark(&mut self, ch: char) {
        if !ch.is_ascii_alphabetic() && !matches!(ch, '\'' | '.' | '^') {
            self.message("Marks use a-z or A-Z");
            return;
        }
        if let Some(object) = self.selected_id() {
            let mark = Mark {
                object,
                revision: self
                    .tab()
                    .revision
                    .clone()
                    .unwrap_or_else(|| self.current_object().and_then(|o| o.revision.clone())),
                byte: Some(self.tab().reader.cursor() as u64),
            };
            self.core.local.marks.insert(ch, mark);
            self.dirty = true;
        }
    }
    pub fn jump_to_mark(&mut self, ch: char, exact: bool) {
        let mark = if ch == '\'' {
            self.core
                .local
                .jumplist
                .get(self.jump_index.saturating_sub(1))
                .cloned()
        } else {
            self.core.local.marks.get(&ch).cloned()
        };
        let Some(mark) = mark else {
            self.message("Mark is not set");
            return;
        };
        if ch.is_ascii_lowercase() && self.selected_id().as_ref() != Some(&mark.object) {
            self.message("Lowercase mark belongs to another object");
            return;
        }
        self.remember_jump();
        self.open_mark(&mark);
        if !exact && self.current_object().is_some() {
            self.reader_motion(&["0".into()]);
        }
        self.remember_jump();
    }
    pub fn remember_jump(&mut self) {
        if let Some(object) = self.selected_id() {
            let mark = Mark {
                object,
                byte: Some(self.tab().reader.cursor() as u64),
                revision: self
                    .tab()
                    .revision
                    .clone()
                    .unwrap_or_else(|| self.current_object().and_then(|o| o.revision.clone())),
            };
            if self.core.local.jumplist.get(self.jump_index) == Some(&mark) {
                return;
            }
            if self.jump_index < self.core.local.jumplist.len() {
                self.core.local.jumplist.truncate(self.jump_index + 1);
            }
            if self.core.local.jumplist.last() != Some(&mark) {
                self.core.local.jumplist.push(mark);
                if self.core.local.jumplist.len() > 100 {
                    self.core.local.jumplist.remove(0);
                }
                self.jump_index = self.core.local.jumplist.len().saturating_sub(1);
                self.dirty = true;
            }
        }
    }
}

pub fn screen_for(body: &ObjectBody) -> Screen {
    match body {
        ObjectBody::Review(_) => Screen::Review,
        ObjectBody::Chat(_) => Screen::Chat,
        ObjectBody::Evidence(_) => Screen::Evidence,
        ObjectBody::Decision(_) => Screen::Decision,
        ObjectBody::Proposal(_) => Screen::Proposal,
        ObjectBody::Settings(_) => Screen::Settings,
        ObjectBody::Operation(_) => Screen::Operation,
        ObjectBody::LocalPrompt(_) => Screen::LocalPrompt,
        ObjectBody::Unsupported { .. } => Screen::Review,
    }
}

use crate::AppState;
