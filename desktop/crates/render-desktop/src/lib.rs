pub mod cache;
mod commands;
mod composer;
mod controller;
mod floats;
pub mod fonts;
mod frame;
mod input;
pub mod layout;
mod persistence;
pub mod picker;
pub mod presence;
pub mod presentation;
pub mod reader;
mod screen;
mod state;
mod ui;
mod views;

pub use frame::view;
pub use input::on_key;
pub use persistence::initialize;
use render_core::*;
use render_keymap::Keymap;
use rune::{AppSpec, Tx};
pub use screen::Screen;
use screen::{Modal, Tab};
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    rc::Rc,
};

#[derive(Clone)]
pub struct DrawRecord {
    pub target: Option<DrawnTarget>,
    pub at: Moment,
    pub readback_generation: Option<u64>,
    pub option: Option<u32>,
    pub subject: Option<String>,
}

pub struct AppState {
    pub core: Client,
    pub lists: presentation::PresentedLists,
    pub presence: presence::PresenceTracker,
    pub last_input: Option<Moment>,
    pub since_expanded: bool,
    pub native_focused: bool,
    pub keymap: Keymap,
    pub tabs: Vec<Tab>,
    pub active: usize,
    pub theme: render_content::Theme,
    pub modal: Option<Modal>,
    pub float_opened_at: Option<f64>,
    pub composer: Option<state::Composer>,
    pub demo: bool,
    pub pending: String,
    pub which_key: bool,
    pub count: String,
    /// Exact resolved binding, retained for directional and first/last command variants.
    pub last_binding: String,
    pub operator: Option<String>,
    pub visual: bool,
    pub hints: Option<Vec<(String, String)>>,
    pub hint_prefix: String,
    pub close_after_save: Option<String>,
    pub close_save_ids: Vec<CommandId>,
    pub authority_save_ids: Vec<CommandId>,
    pub filters: BTreeSet<String>,
    pub saved_filters: BTreeMap<String, BTreeSet<String>>,
    pub expanded: bool,
    pub follow: bool,
    pub numbers: bool,
    pub wide: bool,
    pub mono_prose: bool,
    pub mermaid_source: bool,
    pub now: f64,
    pub last_key: f64,
    pub prefix_at: f64,
    pub messages: Vec<String>,
    pub last_picker: Option<Modal>,
    pub picker_session: Option<picker::PickerSession>,
    pub jump_index: usize,
    pub discarded: Vec<(DraftKey, Draft)>,
    pub dirty: bool,
    pub persistence_error: Option<String>,
    pub store: Option<render_store::DeviceStore>,
    pub inbound: Vec<Inbound>,
    pub outgoing: Vec<CommandIntent>,
    pub requests: Vec<ServiceRequest>,
    pub draw_record: Rc<RefCell<Option<DrawRecord>>>,
    pub input_frame: Option<DrawRecord>,
    pub sequence_pin: Option<DrawnTarget>,
    pub sequence_option: Option<u32>,
    pub sequence_subject: Option<String>,
    pub readback_generation: u64,
    pub origin: rune::time::Instant,
    pub pending_authority: Option<AuthorityVerb>,
    pub saved_filter_name: Option<String>,
    pub(crate) service: Option<Box<dyn render_host::HostAdapter>>,
    pub(crate) documents:
        RefCell<BTreeMap<String, (Vec<render_content::Reference>, render_content::Document)>>,
}

#[derive(Clone, Debug)]
pub enum ServiceRequest {
    Reconnect,
    Query(String),
    Retry(PreparedCommand),
    Snapshot(Scope),
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            core: Client::default(),
            lists: presentation::PresentedLists::default(),
            presence: presence::PresenceTracker::new(None),
            last_input: None,
            since_expanded: false,
            native_focused: false,
            keymap: Keymap::bundled().expect("bundled keymap"),
            tabs: vec![Tab::new(Screen::Brief, None)],
            active: 0,
            theme: render_content::Theme::Ember,
            modal: None,
            float_opened_at: None,
            composer: None,
            demo: false,
            pending: String::new(),
            which_key: false,
            count: String::new(),
            last_binding: String::new(),
            operator: None,
            visual: false,
            hints: None,
            hint_prefix: String::new(),
            close_after_save: None,
            close_save_ids: Vec::new(),
            authority_save_ids: Vec::new(),
            filters: BTreeSet::new(),
            saved_filters: BTreeMap::new(),
            expanded: false,
            follow: true,
            numbers: false,
            wide: false,
            mono_prose: false,
            mermaid_source: false,
            now: 0.0,
            last_key: -10.0,
            prefix_at: 0.0,
            messages: Vec::new(),
            last_picker: None,
            picker_session: None,
            jump_index: 0,
            discarded: Vec::new(),
            dirty: false,
            persistence_error: None,
            store: None,
            inbound: Vec::new(),
            outgoing: Vec::new(),
            requests: Vec::new(),
            draw_record: Rc::default(),
            input_frame: None,
            sequence_pin: None,
            sequence_option: None,
            sequence_subject: None,
            readback_generation: 0,
            origin: rune::time::Instant::now(),
            pending_authority: None,
            saved_filter_name: None,
            service: None,
            documents: RefCell::default(),
        }
    }
}

impl AppState {
    pub fn observe_presence(&mut self, signals: Option<presence::PresenceSignals>) -> bool {
        let present = signals.is_some_and(|signals| {
            signals.present(
                self.screen() == Screen::Brief && !self.chrome_inert(),
                presence::input_is_recent(self.last_input, self.moment()),
            )
        });
        let previous = self.presence.summary().cloned();
        let current = SeenBrief {
            epoch: self.core.host.epoch.clone(),
            seq: self.core.host.seq,
            host_time: self.core.host.host_now(self.moment()),
            rows: self
                .attention_rows()
                .iter()
                .map(|row| SeenRow {
                    id: row.object.clone(),
                    group: presence::seen_group(row.group).into(),
                })
                .collect(),
        };
        if let Some(baseline) = self.presence.update(present, current).baseline {
            self.core.local.seen_brief = Some(baseline);
            self.dirty = true;
        }
        previous.as_ref() != self.presence.summary()
    }
    pub fn attention_rows(&self) -> &[AttentionRow] {
        if self.lists.initialized {
            &self.lists.attention
        } else {
            &self.core.host.attention.rows
        }
    }
    pub fn proposal_rows(&self) -> &[ProposalSummary] {
        if self.lists.initialized {
            &self.lists.proposals
        } else {
            &self.core.host.attention.proposals
        }
    }
    pub fn slice_rows(&self) -> &[SliceRow] {
        if self.lists.initialized {
            &self.lists.slices
        } else {
            &self.core.host.slices.rows
        }
    }
    pub fn agent_rows(&self) -> &[AgentRow] {
        if self.lists.initialized {
            &self.lists.agents
        } else {
            &self.core.host.agents.rows
        }
    }
    pub fn tombstoned(&self, id: &str) -> bool {
        self.lists.tombstones.contains(id)
    }
    pub fn show_modal(&mut self, modal: Modal) {
        self.float_opened_at = Some(self.now);
        self.modal = Some(modal);
    }
    pub fn float_pointer_allowed(&self) -> bool {
        self.float_opened_at.is_none_or(|at| self.now - at >= 0.4)
    }
}

pub fn on_focus(s: &mut AppState, focused: bool, tx: &mut Tx) {
    s.native_focused = focused;
    if !focused {
        s.observe_presence(None);
    }
    tx.instant();
}

/// With App::keep_running, a failed flush preserves the in-memory session.
/// Reopening through the Dock restores the window and its error message.
pub fn on_close(s: &mut AppState, tx: &mut Tx) {
    s.observe_presence(None);
    s.dirty = true;
    s.command("app.quit", tx);
}

pub fn app_spec() -> AppSpec<AppState> {
    AppSpec {
        fonts: fonts::FONTS,
        families: ("Iosevka Etoile", "Iosevka"),
        min_size: Some((600.0, 480.0)),
        poll: Some(poll),
        on_key: Some(on_key),
        scenes: SCENES,
        ..AppSpec::new("Render", (1512.0, 982.0), AppState::default, view)
    }
}

pub fn poll(s: &mut AppState, now: f64, tx: &mut Tx) -> bool {
    tx.wake_after(std::time::Duration::from_secs(1));
    s.consume_draw();
    let before = s.now;
    s.now = now;
    let mut changed = false;
    s.poll_service();
    let selected = s.selected_display_id();
    for event in std::mem::take(&mut s.inbound) {
        for effect in s.core.apply_inbound(event, s.moment()) {
            match effect {
                Effect::Persist => s.dirty = true,
                Effect::Resnapshot(scope) => s.requests.push(ServiceRequest::Snapshot(scope)),
                Effect::Notice(Notice::Discontinuity | Notice::ReadbackVoided) => {
                    s.modal = None;
                    s.sequence_pin = None;
                    s.message("Host continuity changed. Open the object again before deciding.");
                }
                Effect::Notice(notice) => s.message(format!("{notice:?}")),
            }
        }
        changed = true;
    }
    if changed || s.lists.pending || !s.lists.initialized {
        changed |= s.lists.update(&s.core.host, s.now - s.last_key < 1.5);
    }
    if s.lists.pending {
        tx.wake_after(std::time::Duration::from_secs_f64(
            (1.5 - (s.now - s.last_key)).max(0.001),
        ));
    }
    if changed {
        s.reconcile_composer();
        s.documents.borrow_mut().clear();
        s.restore_view_positions();
        if let Some(id) = selected {
            s.select_id(&id);
        }
        s.complete_save_close();
    }
    if !s.pending.is_empty() && s.operator.is_none() && !s.which_key && s.now - s.prefix_at >= 0.3 {
        s.which_key = true;
        changed = true;
    }
    if !s.pending.is_empty() && !s.which_key {
        tx.wake_after(std::time::Duration::from_millis(300));
    }
    let signals = presence::native_presence().map(|mut signals| {
        signals.key &= s.native_focused;
        signals
    });
    changed |= s.observe_presence(signals);
    if s.dirty {
        if s.now - s.last_key >= 0.25 || s.composer.is_none() {
            s.persist();
        } else {
            tx.wake_after(std::time::Duration::from_millis(250));
        }
    }
    let follow_up = !s.outgoing.is_empty() || !s.requests.is_empty();
    s.flush_service();
    if follow_up {
        tx.wake_after(std::time::Duration::from_millis(1));
    }
    if now - before >= 1.0 {
        changed = true;
    }
    if changed {
        tx.instant();
    }
    changed
}

pub fn on_frame_drawn(runtime: &rune::Runtime<AppState>) {
    let s = &runtime.state;
    let at = Moment {
        clock: ClockId(2),
        at: rune::time::Instant::now().saturating_duration_since(s.origin),
    };
    s.record_draw(at);
}

pub fn on_ime(s: &mut AppState, event: &rune::Ime, tx: &mut Tx) -> bool {
    let Some(composer) = s.composer.as_mut() else {
        return false;
    };
    match event {
        rune::Ime::Commit(text) => {
            composer.preedit = None;
            composer.editor.set_composing(false);
            composer.editor.insert_text(text);
            s.sync_composer();
        }
        rune::Ime::Preedit(text, cursor) => {
            composer.preedit = (!text.is_empty()).then(|| {
                (
                    text.clone(),
                    cursor.and_then(|(start, end)| {
                        (start <= end
                            && end <= text.len()
                            && text.is_char_boundary(start)
                            && text.is_char_boundary(end))
                        .then_some(start..end)
                    }),
                )
            });
            composer.editor.set_composing(!text.is_empty());
        }
        rune::Ime::Disabled => {
            composer.preedit = None;
            composer.editor.set_composing(false);
        }
        rune::Ime::Enabled => {}
    }
    tx.instant();
    true
}

fn scene(s: &mut AppState, screen: Screen) {
    s.demo = true;
    s.install_demo();
    let object = match screen {
        Screen::Review => Some("review"),
        Screen::Chat => Some("chat"),
        Screen::Decision => Some("decision"),
        Screen::Evidence => Some("evidence"),
        Screen::Settings => Some("settings"),
        Screen::Proposal => Some("proposal"),
        Screen::Operation => Some("operation"),
        Screen::LocalPrompt => Some("local-prompt"),
        _ => None,
    };
    s.open(screen, object.map(str::to_owned));
}
type Scene = (&'static str, fn(&mut AppState));
static SCENES: &[Scene] = &[
    ("brief", |s| scene(s, Screen::Brief)),
    ("review", |s| scene(s, Screen::Review)),
    ("chat", |s| scene(s, Screen::Chat)),
    ("decision", |s| scene(s, Screen::Decision)),
    ("evidence", |s| scene(s, Screen::Evidence)),
    ("slices", |s| scene(s, Screen::Slices)),
    ("proposals", |s| scene(s, Screen::Proposals)),
    ("agents", |s| scene(s, Screen::Agents)),
    ("settings", |s| scene(s, Screen::Settings)),
    ("proposal", |s| scene(s, Screen::Proposal)),
    ("operation", |s| scene(s, Screen::Operation)),
    ("local-prompt", |s| scene(s, Screen::LocalPrompt)),
    ("offline", |s| {
        scene(s, Screen::Review);
        s.core.apply_inbound(
            Inbound::Connection(ConnectionEvent::Offline { reason: None }),
            s.moment(),
        );
    }),
    ("revoked", |s| {
        scene(s, Screen::Review);
        s.core.apply_inbound(
            Inbound::Connection(ConnectionEvent::Revoked { at: None }),
            s.moment(),
        );
    }),
    ("unsupported", |s| {
        scene(s, Screen::Brief);
        s.core.apply_inbound(
            Inbound::Connection(ConnectionEvent::TooOld { requires: None }),
            s.moment(),
        );
    }),
    ("readback", |s| {
        scene(s, Screen::Review);
        s.sequence_pin = s
            .selected_id()
            .and_then(|id| s.core.drawn_target(&id, Surface::WorkView));
        s.authorize(AuthorityVerb::Approve);
    }),
];
