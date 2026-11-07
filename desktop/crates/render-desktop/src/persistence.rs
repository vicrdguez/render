use crate::{AppState, ServiceRequest};
use render_core::*;
use render_host::{DemoAdapter, DisconnectedAdapter, HostAdapter};
use render_store::DeviceStore;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

#[derive(Serialize, Deserialize)]
struct LocalRecord {
    device: DeviceState,
    theme: String,
    filters: BTreeSet<String>,
    saved_filters: BTreeMap<String, BTreeSet<String>>,
    #[serde(default)]
    views: Vec<SavedView>,
    #[serde(default)]
    active_view: usize,
    #[serde(default)]
    preferences: Option<ViewPreferences>,
    #[serde(default)]
    cached_host: Option<crate::cache::CachedHost>,
}

#[derive(Serialize, Deserialize)]
struct SavedView {
    screen: crate::Screen,
    object: Option<String>,
    revision: Option<Option<String>>,
    cursor: usize,
    scroll: usize,
    reader_byte: usize,
    #[serde(default)]
    results: Option<crate::picker::Results>,
    #[serde(default = "outline_default")]
    outline_visible: bool,
}

fn outline_default() -> bool {
    true
}

#[derive(Serialize, Deserialize)]
struct ViewPreferences {
    numbers: bool,
    wide: bool,
    mono_prose: bool,
    mermaid_source: bool,
    follow: bool,
}

impl AppState {
    pub fn attach_store(&mut self, path: impl AsRef<Path>) {
        match DeviceStore::open(path) {
            Ok(store) => {
                match store.load::<LocalRecord>() {
                    Ok(Some(record)) => {
                        self.presence =
                            crate::presence::PresenceTracker::new(record.device.seen_brief.clone());
                        self.core = Client::new(record.device);
                        if let Some(cache) = record.cached_host {
                            self.core.host = cache.restore();
                        }
                        if !record.views.is_empty() {
                            self.tabs = record
                                .views
                                .into_iter()
                                .map(|view| {
                                    let mut tab = crate::screen::Tab::new(view.screen, view.object);
                                    tab.revision = view.revision;
                                    tab.cursor = view.cursor;
                                    tab.scroll = view.scroll;
                                    tab.restored_reader_byte = Some(view.reader_byte);
                                    tab.results = view.results;
                                    tab.outline_visible = view.outline_visible;
                                    tab
                                })
                                .collect();
                            if self.tabs[0].screen != crate::Screen::Brief {
                                self.tabs
                                    .insert(0, crate::screen::Tab::new(crate::Screen::Brief, None));
                            }
                            self.active = record.active_view.min(self.tabs.len() - 1);
                        }
                        if let Some(prefs) = record.preferences {
                            self.numbers = prefs.numbers;
                            self.wide = prefs.wide;
                            self.mono_prose = prefs.mono_prose;
                            self.mermaid_source = prefs.mermaid_source;
                            self.follow = prefs.follow;
                        }
                        self.filters = record.filters;
                        self.saved_filters = record.saved_filters;
                        self.theme = match record.theme.as_str() {
                            "ember-soft" => render_content::Theme::EmberSoft,
                            "ember-light" => render_content::Theme::EmberLight,
                            _ => render_content::Theme::Ember,
                        };
                    }
                    Ok(None) => {}
                    Err(error) => {
                        self.persistence_error = Some(error.to_string());
                        return;
                    }
                }
                self.store = Some(store);
                if self.core.local.device_id.is_empty() {
                    use std::io::Read;
                    let mut bytes = [0_u8; 16];
                    match std::fs::File::open("/dev/urandom")
                        .and_then(|mut f| f.read_exact(&mut bytes))
                    {
                        Ok(()) => {
                            self.core.local.device_id =
                                bytes.iter().map(|b| format!("{b:02x}")).collect()
                        }
                        Err(error) => {
                            self.persistence_error =
                                Some(format!("Cannot generate device identity: {error}"));
                            return;
                        }
                    }
                }
                self.restore_view_positions();
                self.dirty = true;
                self.persist();
            }
            Err(error) => self.persistence_error = Some(error.to_string()),
        }
    }
    pub fn persist(&mut self) -> bool {
        // A failed load never installs a store. A failed write can be retried
        // without ever overwriting an unreadable device record.
        let Some(store) = &self.store else {
            return false;
        };
        let record = LocalRecord {
            device: self.core.local.clone(),
            cached_host: Some(crate::cache::CachedHost::capture(&self.core.host)),
            theme: self.theme.name().into(),
            filters: self.filters.clone(),
            saved_filters: self.saved_filters.clone(),
            views: self
                .tabs
                .iter()
                .map(|tab| SavedView {
                    screen: tab.screen,
                    object: tab.object.clone(),
                    revision: tab.revision.clone(),
                    cursor: tab.cursor,
                    scroll: tab.scroll,
                    reader_byte: tab
                        .restored_reader_byte
                        .unwrap_or_else(|| tab.reader.cursor()),
                    results: tab.results.clone(),
                    outline_visible: tab.outline_visible,
                })
                .collect(),
            active_view: self.active,
            preferences: Some(ViewPreferences {
                numbers: self.numbers,
                wide: self.wide,
                mono_prose: self.mono_prose,
                mermaid_source: self.mermaid_source,
                follow: self.follow,
            }),
        };
        match store.save(&record) {
            Ok(()) => {
                self.persistence_error = None;
                self.dirty = false;
                true
            }
            Err(error) => {
                self.persistence_error = Some(error.to_string());
                false
            }
        }
    }
    /// Restore byte positions only once the exact object revision is available.
    pub fn restore_view_positions(&mut self) {
        let active = self.active;
        for index in 0..self.tabs.len() {
            let Some(byte) = self.tabs[index].restored_reader_byte else {
                continue;
            };
            self.active = index;
            if self.current_object().is_some() && (byte == 0 || self.reader_seek(byte)) {
                self.tabs[index].restored_reader_byte = None;
            }
        }
        self.active = active;
    }
    pub fn set_adapter(&mut self, adapter: Box<dyn HostAdapter>) {
        self.service = Some(adapter);
        self.requests.push(ServiceRequest::Reconnect);
    }
    pub fn install_demo(&mut self) {
        self.demo = true;
        // This explicit simulator starts from its labelled fixtures each run.
        // Never mistake a previous simulator's cached sequence for a live host.
        self.core.host = HostSnapshot::default();
        self.lists = crate::presentation::PresentedLists::default();
        self.documents.borrow_mut().clear();
        self.service = Some(Box::new(DemoAdapter::new(
            render_host::demo_data::snapshots(),
        )));
        if let Some(service) = self.service.as_mut()
            && let Err(error) = service.connect()
        {
            self.message(format!("Demo adapter unavailable: {error}"));
        }
        self.poll_service();
        for event in std::mem::take(&mut self.inbound) {
            self.core.apply_inbound(event, self.moment());
        }
    }
    pub fn adapter_format(&self) -> String {
        self.service
            .as_ref()
            .map(|s| s.format().to_owned())
            .unwrap_or_default()
    }
    pub fn poll_service(&mut self) {
        if let Some(service) = self.service.as_mut() {
            while let Some(event) = service.poll() {
                self.inbound.push(event);
            }
        }
    }
    pub fn flush_service(&mut self) {
        for intent in std::mem::take(&mut self.outgoing) {
            // Input authorization can precede a poll that disconnects or revokes the device.
            // Recheck at the transport boundary without rebasing the prepared intent.
            let current = self.core.drawn_target(&intent.target, Surface::WorkView);
            if !self.core.host.writable()
                || intent.epoch.is_none()
                || intent.epoch != self.core.host.epoch
                || current.as_ref().and_then(|pin| pin.epoch.as_ref()) != intent.epoch.as_ref()
            {
                self.core.abandon_unsent(&intent.id);
                self.dirty = true;
                self.persist();
                self.message("Not sent. Connection or target freshness changed; review it again.");
                continue;
            }
            let result = self
                .service
                .as_mut()
                .map(|service| service.prepare(&intent));
            let prepared = match result {
                Some(Ok(prepared)) => prepared,
                Some(Err(error)) => {
                    self.core.abandon_unsent(&intent.id);
                    self.message(format!("Not sent. {error}"));
                    continue;
                }
                None => {
                    self.core.abandon_unsent(&intent.id);
                    self.message("No host adapter. Nothing was sent.");
                    continue;
                }
            };
            if let Err(error) = self.core.prepared(prepared.clone()) {
                self.refusal(error);
                continue;
            }
            if let Some(object) = self
                .core
                .entry(&intent.id)
                .and_then(|entry| entry.draft.as_ref())
                .map(|link| link.key.object.clone())
            {
                if self.close_after_save.as_ref() == Some(&object) {
                    self.close_save_ids.push(intent.id.clone());
                }
                if self.pending_authority.is_some()
                    && self
                        .sequence_pin
                        .as_ref()
                        .is_some_and(|pin| pin.object == object)
                {
                    self.authority_save_ids.push(intent.id.clone());
                }
            }
            self.dirty = true;
            if !self.persist() {
                self.core.abandon_unsent(&intent.id);
                self.message("Not sent. The local command record could not be persisted.");
                continue;
            }
            let result = self.service.as_mut().unwrap().transmit(&prepared);
            let _ = self.core.transmitted(&intent.id);
            match result {
                Ok(()) => self.message(format!(
                    "{} sent · awaiting receipt",
                    intent.command.keymap_wire()
                )),
                Err(error) => {
                    self.core.apply_inbound(
                        Inbound::Lost {
                            command: intent.id.clone(),
                        },
                        self.moment(),
                    );
                    self.message(format!(
                        "Outcome unknown. The host may have accepted it. {error}"
                    ));
                }
            }
            self.dirty = true;
            self.persist();
        }
        for request in std::mem::take(&mut self.requests) {
            if matches!(self.core.host.connection, Connection::Revoked { .. }) {
                continue;
            }
            if let ServiceRequest::Retry(queued) = &request {
                let bytes = match self.core.retry(&queued.id, &self.adapter_format()) {
                    Ok(bytes) => bytes,
                    Err(reason) => {
                        self.refusal(reason);
                        continue;
                    }
                };
                if !self.persist() {
                    self.message("Retry blocked. Local persistence unavailable.");
                    continue;
                }
                let Some(service) = self.service.as_mut() else {
                    continue;
                };
                let result = service.transmit(&bytes);
                let _ = self.core.transmitted(&bytes.id);
                if result.is_err() {
                    self.core.apply_inbound(
                        Inbound::Lost {
                            command: bytes.id.clone(),
                        },
                        self.moment(),
                    );
                }
                self.dirty = true;
                self.persist();
                continue;
            }
            let Some(service) = self.service.as_mut() else {
                self.message("Host adapter unavailable");
                continue;
            };
            let result = match request {
                ServiceRequest::Reconnect => service.connect().and_then(|_| {
                    let mut scopes =
                        BTreeSet::from([Scope::Attention, Scope::Agents, Scope::Slices]);
                    scopes.extend(
                        self.tabs
                            .iter()
                            .filter_map(|tab| tab.object.as_ref())
                            .map(|id| Scope::Object(id.clone())),
                    );
                    service.subscribe(&scopes.into_iter().collect::<Vec<_>>())
                }),
                ServiceRequest::Query(id) => service.query_receipt(&id),
                ServiceRequest::Snapshot(scope) => service.fetch(&scope),
                ServiceRequest::Retry(_) => unreachable!(),
            };
            if let Err(error) = result {
                self.message(format!("Host operation unavailable. {error}"));
            }
        }
    }
    pub fn open_url(&mut self, url: &str, tx: &mut rune::Tx) {
        if !(url.starts_with("https://") || url.starts_with("http://"))
            || url.chars().any(char::is_control)
        {
            self.message("This URL scheme is not allowed");
            return;
        }
        match tx.open_url(url) {
            Ok(()) => self.message("External URL handed to your browser. No merge was performed."),
            Err(error) => self.message(format!("Could not open browser: {error}")),
        }
    }
}

pub fn initialize() -> AppState {
    let args = std::env::args().collect::<Vec<_>>();
    let demo = args
        .iter()
        .any(|a| a == "--demo" || a == "--scene" || a.starts_with("--scene="));
    let mut state = AppState {
        demo,
        ..AppState::default()
    };
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.state")
        .join(if demo { "demo" } else { "live" });
    let root = args
        .iter()
        .position(|a| a == "--store")
        .and_then(|i| args.get(i + 1))
        .map(std::path::PathBuf::from)
        .unwrap_or(root);
    state.attach_store(root);
    if demo {
        state.install_demo();
    } else {
        state.set_adapter(Box::new(DisconnectedAdapter::default()));
    }
    state
}
