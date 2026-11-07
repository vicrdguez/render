//! Per-opening discovery snapshots. These identities are navigation, never authority pins.
use crate::{
    AppState, Screen,
    screen::{Modal, PickerKind, Tab},
};
use rune::Tx;

#[derive(Clone, Debug)]
pub enum PickerTarget {
    Object(String),
    Command(String),
    Tab(std::rc::Rc<()>),
    Theme(usize),
    History(String),
    Line {
        object: Option<String>,
        byte: usize,
        source: std::sync::Arc<str>,
    },
}
#[derive(Clone, Debug)]
pub struct PickerRow {
    pub label: String,
    pub target: PickerTarget,
}
#[derive(Clone, Debug)]
pub struct PickerSession {
    pub kind: PickerKind,
    pub query: String,
    pub selected: usize,
    pub rows: Vec<PickerRow>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ResultRow {
    pub object: String,
    pub title: String,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Results {
    pub query: String,
    pub rows: Vec<ResultRow>,
}

/// Smartcase subsequence matching, including whitespace-separated fuzzy terms.
pub fn fuzzy_match(text: &str, query: &str) -> bool {
    let (text, query) = if query.chars().any(char::is_uppercase) {
        (text.to_owned(), query.to_owned())
    } else {
        (text.to_lowercase(), query.to_lowercase())
    };
    query.split_whitespace().all(|term| {
        let mut chars = text.chars();
        term.chars()
            .all(|needle| chars.by_ref().any(|c| c == needle))
    })
}
impl AppState {
    pub fn refresh_picker(&mut self, kind: PickerKind, query: &str) {
        let mut rows = Vec::new();
        match kind {
            PickerKind::Objects | PickerKind::Recent | PickerKind::Search => {
                let ids = match kind {
                    PickerKind::Recent => self.recent_matches(query),
                    PickerKind::Search => self.search_matches(query),
                    _ => self.object_matches(query),
                };
                for id in ids {
                    let (target, label) = if let Some(o) = self.core.host.objects.get(&id) {
                        (
                            id.clone(),
                            format!(
                                "{:?}  {}  {}",
                                o.kind(),
                                id,
                                o.title.as_deref().unwrap_or("")
                            ),
                        )
                    } else if let Some(r) = self.slice_rows().iter().find(|r| r.id == id) {
                        (
                            r.workflow.clone(),
                            format!("slice  {}  {}", id, r.title.as_deref().unwrap_or("")),
                        )
                    } else if let Some(r) = self.agent_rows().iter().find(|r| r.assignment == id) {
                        (
                            r.conversation
                                .clone()
                                .or_else(|| r.workflow.clone())
                                .unwrap_or(id.clone()),
                            format!(
                                "agent  {}  {}",
                                id,
                                r.workflow_title.as_deref().unwrap_or("")
                            ),
                        )
                    } else {
                        (id.clone(), id)
                    };
                    rows.push(PickerRow {
                        label,
                        target: PickerTarget::Object(target),
                    });
                }
            }
            PickerKind::Commands => {
                for entry in self.keymap.palette("", self.context()) {
                    let label = format!(
                        "{} · :{} · {}{}",
                        entry.command.desc,
                        entry.command.ex,
                        entry
                            .command
                            .keys
                            .iter()
                            .map(|k| k.seq.as_str())
                            .collect::<Vec<_>>()
                            .join(" "),
                        self.command_reason(&entry.command.id)
                            .map(|r| format!(" · {r}"))
                            .unwrap_or_default()
                    );
                    if fuzzy_match(&label, query) {
                        rows.push(PickerRow {
                            label,
                            target: PickerTarget::Command(entry.command.id.clone()),
                        });
                    }
                }
            }
            PickerKind::Tabs => {
                for (i, tab) in self.tabs.iter().enumerate() {
                    let label = format!("{}  {}", i + 1, self.tab_title(tab));
                    if fuzzy_match(&label, query) {
                        rows.push(PickerRow {
                            label,
                            target: PickerTarget::Tab(tab.identity.clone()),
                        });
                    }
                }
            }
            PickerKind::Theme => {
                for (i, label) in ["Ember", "Ember Soft", "Ember Light"].iter().enumerate() {
                    if fuzzy_match(label, query) {
                        rows.push(PickerRow {
                            label: (*label).into(),
                            target: PickerTarget::Theme(i),
                        });
                    }
                }
            }
            PickerKind::History => {
                for command in self.core.local.ex_history.iter().rev() {
                    if fuzzy_match(command, query) {
                        rows.push(PickerRow {
                            label: command.clone(),
                            target: PickerTarget::History(command.clone()),
                        });
                    }
                }
            }
            PickerKind::Lines => {
                let mut byte = 0;
                let source: std::sync::Arc<str> = self.source_text().into();
                for (i, line) in source.split_inclusive('\n').enumerate() {
                    if fuzzy_match(line, query) {
                        rows.push(PickerRow {
                            label: format!("{}  {}", i + 1, line.trim_end_matches('\n')),
                            target: PickerTarget::Line {
                                object: self.tab().object.clone(),
                                byte,
                                source: source.clone(),
                            },
                        });
                    }
                    byte += line.len();
                }
            }
        }
        self.picker_session = Some(PickerSession {
            kind,
            query: query.into(),
            selected: 0,
            rows,
        });
    }
    pub fn picker_preview(&self) -> String {
        let Some(session) = &self.picker_session else {
            return "Preview unavailable".into();
        };
        let Some(row) = session.rows.get(session.selected) else {
            return "No matching loaded content".into();
        };
        match &row.target {
            PickerTarget::Object(id) => self
                .core
                .host
                .objects
                .get(id)
                .map(crate::commands::object_source)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| format!("Loaded content unavailable for {id}")),
            _ => "Object preview unavailable for this picker".into(),
        }
    }
    pub fn picker_pointer(&mut self, selected: usize, tx: &mut Tx) {
        if !self.float_pointer_allowed() || !matches!(self.modal, Some(Modal::Picker { .. })) {
            return;
        }
        if let Some(session) = &self.picker_session {
            let (kind, query) = (session.kind, session.query.clone());
            self.pick(kind, &query, selected, tx);
        }
    }
    pub fn export_picker(&mut self) {
        let Some(session) = &self.picker_session else {
            return;
        };
        if !matches!(
            session.kind,
            PickerKind::Objects | PickerKind::Recent | PickerKind::Search
        ) {
            self.message("Only object finder results can be exported");
            return;
        }
        let rows = session
            .rows
            .iter()
            .filter_map(|r| match &r.target {
                PickerTarget::Object(id) => Some(ResultRow {
                    object: id.clone(),
                    title: r.label.clone(),
                }),
                _ => None,
            })
            .collect();
        let mut tab = Tab::new(Screen::Results, None);
        tab.results = Some(Results {
            query: session.query.clone(),
            rows,
        });
        self.tabs.push(tab);
        self.active = self.tabs.len() - 1;
        self.modal = None;
        self.dirty = true;
    }
    pub(crate) fn activate_picker(&mut self, selected: usize, tx: &mut Tx) {
        let Some(session) = &mut self.picker_session else {
            return;
        };
        let Some(row) = session.rows.get(selected).cloned() else {
            return;
        };
        session.selected = selected;
        self.last_picker = Some(Modal::Picker {
            kind: session.kind,
            query: session.query.clone(),
            selected: session.selected,
        });
        match row.target {
            PickerTarget::Object(id) => {
                self.modal = None;
                self.open_object_missing(&id);
            }
            PickerTarget::Command(id) => {
                self.modal = None;
                if let Some(reason) = self.command_reason(&id) {
                    self.message(reason);
                } else {
                    self.command(&id, tx);
                }
            }
            PickerTarget::Tab(identity) => {
                if let Some(i) = self
                    .tabs
                    .iter()
                    .position(|tab| std::rc::Rc::ptr_eq(&tab.identity, &identity))
                {
                    self.active = i;
                    self.modal = None;
                } else {
                    self.message("Selected view is no longer open");
                }
            }
            PickerTarget::Theme(index) => {
                self.theme = match index {
                    0 => render_content::Theme::Ember,
                    1 => render_content::Theme::EmberSoft,
                    _ => render_content::Theme::EmberLight,
                };
                self.modal = None;
                self.dirty = true;
                tx.instant();
            }
            PickerTarget::History(command) => {
                self.modal = None;
                self.ex(&command, tx);
            }
            PickerTarget::Line {
                object,
                byte,
                source,
            } => {
                if self.tab().object != object {
                    self.message("Original source view is no longer active");
                    return;
                }
                if self.source_text() != source.as_ref() {
                    self.message("Source changed. Edit the query to refresh line targets.");
                    return;
                }
                self.remember_jump();
                self.reader_seek(byte);
                self.remember_jump();
                self.modal = None;
                self.reveal_cursor(tx);
            }
        }
    }
}
