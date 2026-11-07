use crate::{
    AppState, Screen,
    screen::{ComposeKind, Modal, PickerKind},
};
use render_core::*;
use render_keymap::{Availability as KeyAvailability, Kind};
use rune::Tx;

impl AppState {
    pub fn command(&mut self, id: &str, tx: &mut Tx) {
        if let Some(verb) = AuthorityVerb::from_keymap_id(id) {
            self.authorize(verb);
            return;
        }
        match id {
            "queue.open" => self.open(Screen::Brief, None),
            "open.explorer" => self.open(Screen::Slices, None),
            "open.proposals" => self.open(Screen::Proposals, None),
            "open.agents" => self.open(Screen::Agents, None),
            "open.settings" => self.open_kind(Screen::Settings),
            "open.localprompt" => self.open_kind(Screen::LocalPrompt),
            "open.overview" => self.open_kind(Screen::Proposal),
            "open.chat" => self.open_kind(Screen::Chat),
            "open.evidence" | "goto.evidence" => self.open_kind(Screen::Evidence),
            "open.dispositions" => {
                self.open_kind(Screen::Review);
                if self.screen() == Screen::Review {
                    self.tab_mut().screen = Screen::Dispositions;
                    self.tab_mut().cursor = 0;
                }
            }
            "review.diff_prev" => {
                self.tab_mut().screen = if self.screen() == Screen::Diff {
                    Screen::Review
                } else {
                    Screen::Diff
                };
            }
            "view.tab_next" => {
                self.active = if self.count.is_empty() {
                    (self.active + 1) % self.tabs.len()
                } else {
                    self.count
                        .parse::<usize>()
                        .unwrap_or(1)
                        .saturating_sub(1)
                        .min(self.tabs.len() - 1)
                };
            }
            "view.tab_prev" => {
                let count = self.count.parse::<usize>().unwrap_or(1) % self.tabs.len();
                self.active = (self.active + self.tabs.len() - count) % self.tabs.len();
            }
            "view.close" | "view.close_discard" => {
                self.sync_composer();
                if self.active == 0 {
                    self.message("The Brief stays open");
                } else if let Some(object) = self.tab().object.clone()
                    && self.core.local.drafts.keys().any(|k| k.object == object)
                {
                    if id == "view.close_discard" {
                        self.show_modal(Modal::ConfirmDiscard { object });
                    } else {
                        self.message("Local drafts remain · save them or confirm discard");
                    }
                } else {
                    self.tabs.remove(self.active);
                    self.active = self.active.saturating_sub(1);
                }
            }
            "app.quit" => {
                self.sync_composer();
                if self.dirty && !self.persist() {
                    self.message(
                        "Cannot quit: local changes could not be saved. Your draft is still open.",
                    );
                } else {
                    tx.quit();
                }
            }
            "list.open" => match self.navigation_target().map(|t| t.kind) {
                Some(render_content::NavigationKind::Reference(_)) => {
                    self.command("goto.definition", tx)
                }
                Some(render_content::NavigationKind::Link(_)) => self.command("link.external", tx),
                Some(render_content::NavigationKind::Diagram { .. }) => {
                    self.command("diagram.zoom", tx)
                }
                _ if self.selected_local_note().is_some() => {
                    self.edit_note(self.selected_local_note().unwrap());
                }
                _ => self.open_selected(),
            },
            "parent" | "list.up" => {
                let parent = self
                    .current_object()
                    .and_then(|o| o.workflow.clone())
                    .filter(|parent| Some(parent) != self.tab().object.as_ref());
                if let Some(parent) = parent {
                    self.open_object(&parent);
                } else {
                    self.message("No logical parent supplied by the host");
                }
            }
            "next.go" => {
                let next = self
                    .current_object()
                    .and_then(|o| o.next.clone())
                    .or_else(|| {
                        self.selected_id().and_then(|id| {
                            self.attention_rows()
                                .iter()
                                .find(|r| r.object == id)
                                .and_then(|r| r.next.clone())
                        })
                    });
                match next {
                    Some(Next::Act(a)) => {
                        if let Some(url) = a.url {
                            self.show_modal(Modal::Url(url));
                        } else {
                            self.open_object(&a.target);
                        }
                    }
                    _ => self.message("Next action unavailable"),
                }
            }
            "blocker.float" => self.show_modal(Modal::Handover),
            "peek" => {
                if let Some(render_content::NavigationTarget {
                    kind: render_content::NavigationKind::Reference(reference),
                    ..
                }) = self.navigation_target()
                {
                    let lines = reference
                        .target
                        .as_ref()
                        .and_then(|id| self.core.host.objects.get(id))
                        .map(|o| {
                            vec![
                                o.title.clone().unwrap_or_else(|| o.id.clone()),
                                object_source(o),
                            ]
                        })
                        .unwrap_or_else(|| {
                            vec![
                                reference
                                    .reason
                                    .unwrap_or_else(|| "Target content not loaded".into()),
                            ]
                        });
                    self.show_modal(Modal::Info {
                        title: reference.label,
                        lines,
                    });
                } else {
                    self.show_modal(Modal::Handover);
                }
            }
            "diagram.zoom" => {
                if let Some(render_content::NavigationTarget {
                    kind: render_content::NavigationKind::Diagram { source },
                    ..
                }) = self.navigation_target()
                {
                    self.show_modal(Modal::Diagram {
                        source,
                        zoom: 1.0,
                        pan: [0.0, 0.0],
                    });
                } else {
                    self.message("No diagram under the cursor");
                }
            }
            "filter.cmd" => self.show_modal(Modal::Filter { selected: 0 }),
            "filter.toggle" | "filter.solo" => {
                if let Some(Modal::Filter { selected }) = self.modal {
                    let states = self
                        .slice_rows()
                        .iter()
                        .map(|r| r.lifecycle.clone())
                        .collect::<std::collections::BTreeSet<_>>()
                        .into_iter()
                        .collect::<Vec<_>>();
                    if let Some(state) = states.get(selected) {
                        let selected_id = self.selected_id();
                        if id == "filter.solo" {
                            self.filters.clear();
                            self.filters.insert(state.clone());
                        } else if !self.filters.remove(state) {
                            self.filters.insert(state.clone());
                        }
                        self.tab_mut().cursor = 0;
                        if let Some(id) = selected_id {
                            self.select_id(&id);
                        }
                        self.dirty = true;
                    }
                }
            }
            "review.outline" => self.tab_mut().outline_visible = !self.tab().outline_visible,
            "fold.toggle" if self.screen() == Screen::Brief => {
                self.since_expanded = !self.since_expanded;
            }
            "list.expand" | "fold.toggle" => self.expanded = !self.expanded,
            "palette" => self.picker(PickerKind::Commands),
            "find.object" => self.picker(PickerKind::Objects),
            "find.recent" => self.picker(PickerKind::Recent),
            "search.global" => {
                self.message("Search loaded content only · no remote corpus search capability");
                self.picker(PickerKind::Search);
            }
            "view.switch" => self.picker(PickerKind::Tabs),
            "help.theme" => self.picker(PickerKind::Theme),
            "cmdline.history" => self.picker(PickerKind::History),
            "search.lines" => self.picker(PickerKind::Lines),
            "picker.resume" => {
                if let Some(modal) = self.last_picker.clone() {
                    self.show_modal(modal);
                }
            }
            "cmdline.open" => self.show_modal(Modal::Ex(String::new())),
            "float.close" => self.modal = None,
            "help.keys" | "help.topics" => {
                let lines = self
                    .keymap
                    .commands()
                    .iter()
                    .map(|c| format!("{}  :{} {}  {} [{}]",
                        c.keys.iter().map(|b| b.seq.replace("<leader>", "Space ")).collect::<Vec<_>>().join(" / "),
                        c.ex, c.ex_aliases.iter().map(|a| format!(":{a}")).collect::<Vec<_>>().join(" "),
                        c.desc, c.ctx.join(", ")))
                    .chain(self.keymap.builtins().iter().map(|(topic, keys)| format!("{topic}: {}", keys.join(" "))))
                    .chain([
                        "Reader: c/gc + motion or object annotates immutable bytes; y yanks exactly that range.",
                        "Objects: iw/aw word, is/as sentence, ip/ap paragraph, in/an node, ih/ah hunk, im/am message.",
                        "Motions: ] next, [ previous; uppercase first/last; counts repeat. v/V select bytes/lines.",
                        "Drafts: Esc Esc leaves a local draft; :w submits; :q refuses drafts; :q! confirms local discard; :wq awaits accepted and observed saves.",
                        "Marks: ma local, mA cross-object; apostrophe jumps to line, backtick to exact byte; C-o/C-i traverse jumps.",
                        "Pickers: smartcase; recent uses local visits; search is loaded content only; resume retains query and selection.",
                        "Authority: only explicit authorize + readback + physical y sends; links, hints, repeats and motions never authorize.",
                        "Filters: empty states means open states; review-queue selects needs-human and awaiting-review. save/forget names are device-local.",
                        "Recovery: refresh requests the current scope snapshot; reconnect reconnects; retry uses stored command bytes.",
                    ].into_iter().map(str::to_owned))
                    .collect();
                self.show_modal(Modal::Info {
                    title: "Render command catalogue".into(),
                    lines,
                });
            }
            "diag.actions" => {
                let lines = self
                    .keymap
                    .commands()
                    .iter()
                    .filter(|c| c.kind != Kind::Modal)
                    .map(|c| {
                        format!(
                            "{} · {}",
                            c.desc,
                            self.command_reason(&c.id)
                                .unwrap_or_else(|| "available".into())
                        )
                    })
                    .collect();
                self.show_modal(Modal::Info {
                    title: "Available actions".into(),
                    lines,
                });
            }
            "open.messages" => self.show_modal(Modal::Info {
                title: "Messages".into(),
                lines: self.messages.clone(),
            }),
            "open.jumps" => self.show_modal(Modal::Info {
                title: "Jumplist".into(),
                lines: self
                    .core
                    .local
                    .jumplist
                    .iter()
                    .map(|m| format!("{} {}", m.object, m.revision.as_deref().unwrap_or("")))
                    .collect(),
            }),
            "open.marks" => self.show_modal(Modal::Info {
                title: "Marks".into(),
                lines: self
                    .core
                    .local
                    .marks
                    .iter()
                    .map(|(k, m)| format!("{k} {}", m.object))
                    .collect(),
            }),
            "object.history" => {
                let lines = self
                    .current_object()
                    .map(|o| {
                        let mut lines = vec![format!("{} {} · current", o.id, o.revision.as_deref().unwrap_or("revision unavailable"))];
                        if let ObjectBody::Review(review) = &o.body && let Some(previous) = &review.previous {
                            lines.push(format!("{} · previous emission{}", previous,
                                if self.core.host.objects.contains_key(previous) { " · loaded" } else { " · not loaded" }));
                        }
                        for mark in self.core.local.jumplist.iter().filter(|m| m.object == o.id) {
                            let line = format!("{} {} · visited byte {}", mark.object, mark.revision.as_deref().unwrap_or("revision unavailable"), mark.byte.unwrap_or(0));
                            if !lines.contains(&line) { lines.push(line); }
                        }
                        lines.push("Only supplied revisions and local visits are listed; use :history <object-id> to open a supplied previous emission.".into());
                        lines
                    })
                    .unwrap_or_default();
                self.show_modal(Modal::Info {
                    title: "Revision history".into(),
                    lines,
                });
            }
            "hint.pane" => {
                self.hint_prefix.clear();
                let alphabet = self.keymap.meta().hint_alphabet.chars().collect::<Vec<_>>();
                let ids = if self.screen().work() {
                    self.navigation_targets()
                        .iter()
                        .map(|t| format!("byte:{}", t.source.start))
                        .collect()
                } else {
                    self.visible_ids()
                };
                let two = ids.len() > alphabet.len();
                self.hints = Some(
                    ids.into_iter()
                        .take(alphabet.len() * alphabet.len())
                        .enumerate()
                        .map(|(i, id)| {
                            (
                                if two {
                                    format!(
                                        "{}{}",
                                        alphabet[i / alphabet.len()],
                                        alphabet[i % alphabet.len()]
                                    )
                                } else {
                                    alphabet[i].to_string()
                                },
                                id,
                            )
                        })
                        .collect(),
                );
            }
            "chat.focus_prompt" => self.start_composer(ComposeKind::Chat),
            "review.note_here" => {
                if self.screen() == Screen::Decision {
                    self.start_composer(ComposeKind::Decision);
                } else if let Some(anchor) = self.reader_operator("c", &["i".into(), "p".into()]) {
                    self.start_composer(ComposeKind::Note);
                    if let Some(note) = self.composer.as_mut().and_then(|c| c.note.as_mut()) {
                        note.anchor = anchor;
                    }
                } else {
                    self.message("No immutable paragraph or selection under the cursor");
                }
            }
            "annotate" => {
                self.operator = Some("c".into());
            }
            "textobject.render" => {
                self.message("Choose inner/around and w, s, p, n, h or m after an operator");
            }
            "review.edit_bytes" => self.start_composer(ComposeKind::Emission),
            "review.save" => self.save_drafts(tx),
            "review.save_close" => {
                self.sync_composer();
                if !self
                    .core
                    .local
                    .drafts
                    .keys()
                    .any(|k| Some(&k.object) == self.tab().object.as_ref())
                {
                    self.command("view.close", tx);
                    return;
                }
                self.close_after_save = self.selected_id();
                self.close_save_ids.clear();
                self.save_drafts(tx);
                self.complete_save_close();
            }
            "draft.edit" => {
                if let Some(note) = self.selected_local_note() {
                    self.edit_note(note);
                } else {
                    self.message("No local draft under the cursor");
                }
            }
            "chat.send" => self.send_chat(false, tx),
            "chat.followup" => self.send_chat(true, tx),
            "chat.interrupt" => self.interrupt(),
            "localprompt.request" => self.request_prompt(),
            "chat.queue" => {
                let lines = self
                    .current_object()
                    .and_then(|o| {
                        if let ObjectBody::Chat(c) = &o.body {
                            Some(
                                c.steers
                                    .iter()
                                    .map(|x| {
                                        format!("{} · {:?} · {}", x.id, x.delivery, x.text.as_str())
                                    })
                                    .collect(),
                            )
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();
                self.show_modal(Modal::Info {
                    title: "Steering queue".into(),
                    lines,
                });
            }
            "recover.outbox" => self.show_modal(Modal::Outbox { selected: 0 }),
            "recover.query" => self.recover(false, 0),
            "recover.retry" => self.recover(true, 0),
            "recover.reconnect" => self.reconnect(),
            "recover.refresh" => {
                let scope = match self.screen() {
                    Screen::Brief | Screen::Proposals => Scope::Attention,
                    Screen::Slices => Scope::Slices,
                    Screen::Agents => Scope::Agents,
                    _ => match self.selected_id() {
                        Some(id) => self
                            .core
                            .host
                            .object_scope
                            .get(&id)
                            .cloned()
                            .unwrap_or(Scope::Object(id)),
                        None => {
                            self.message("No scope to refresh");
                            return;
                        }
                    },
                };
                self.requests.push(crate::ServiceRequest::Snapshot(scope));
            }
            "toggle.follow" => self.follow = !self.follow,
            "chat.follow_resume" => {
                self.follow = true;
                tx.scroll_to_bottom("work.scroll");
            }
            "toggle.numbers" => self.numbers = !self.numbers,
            "toggle.measure" => self.wide = !self.wide,
            "toggle.prosefont" => self.mono_prose = !self.mono_prose,
            "toggle.mermaid" => self.mermaid_source = !self.mermaid_source,
            "yank.ref" => {
                if let Some(o) = self.current_object() {
                    let anchor = self.reader_selection();
                    let range = anchor
                        .as_ref()
                        .map(|a| format!("#bytes={}-{}", a.byte_start, a.byte_end))
                        .unwrap_or_else(|| format!("#byte={}", self.tab().reader.cursor()));
                    tx.copy(format!(
                        "{}{}{}",
                        o.id,
                        o.revision
                            .as_ref()
                            .map(|r| format!("@{r}"))
                            .unwrap_or_default(),
                        range
                    ));
                    self.message("Stable reference copied");
                }
            }
            "yank" | "yank.clipboard" => {
                if let Some(anchor) = self.reader_selection() {
                    tx.copy(anchor.quote);
                } else {
                    self.operator = Some("y".into());
                }
            }
            "goto.definition" | "goto.basis" => {
                let reference = self.navigation_target().and_then(|t| match t.kind {
                    render_content::NavigationKind::Reference(r) => Some(r),
                    _ => None,
                });
                if let Some(reference) = reference {
                    if let Some(target) = reference.target {
                        self.open_object(&target);
                    } else {
                        self.message(
                            reference
                                .reason
                                .as_deref()
                                .unwrap_or("Reference is dangling"),
                        );
                    }
                } else {
                    self.message("No host-resolved reference under the cursor");
                }
            }
            "link.external" => {
                if let Some(render_content::NavigationTarget {
                    kind: render_content::NavigationKind::Link(url),
                    ..
                }) = self.navigation_target()
                {
                    self.show_modal(Modal::Url(url));
                    return;
                }
                self.message("No host URL on this target");
            }
            "queue.next" | "queue.prev" => {
                let rows = self
                    .attention_rows()
                    .iter()
                    .filter(|r| r.group == AttentionGroup::NeedsYou)
                    .map(|r| r.object.clone())
                    .collect::<Vec<_>>();
                if !rows.is_empty() {
                    let current = self
                        .selected_id()
                        .and_then(|id| rows.iter().position(|r| r == &id));
                    let count = self.count.parse::<usize>().unwrap_or(1).max(1);
                    let index = if id == "queue.prev" {
                        (current.unwrap_or(0) + rows.len() - count % rows.len()) % rows.len()
                    } else {
                        current.map_or((count - 1) % rows.len(), |i| (i + count) % rows.len())
                    };
                    self.open_object(&rows[index]);
                }
            }
            "node.next" | "annotation.next" | "hunk.next" | "finding.next" | "obligation.next"
            | "message.next" | "toolcall.next" | "group.next" | "problem.next" | "problem.prev" => {
                let binding = self.last_binding.clone();
                let count = self.count.parse().unwrap_or(1);
                self.semantic_motion(id, &binding, count);
                self.reveal_cursor(tx);
            }
            "jump.back" | "jump.forward" => {
                for _ in 0..self.count.parse::<usize>().unwrap_or(1).max(1) {
                    self.jump_history(id == "jump.forward");
                }
            }
            "draft.discard" => self.discard_selected_draft(),
            "draft.undo" | "draft.redo" => self.undo_local_discard(),
            "repeat" => {
                if !self.discarded.is_empty() {
                    self.discard_selected_draft();
                } else {
                    self.message("No local operation to repeat");
                }
            }
            _ => {
                self.message(self.command_reason(id).unwrap_or_else(|| {
                    "This operation is unavailable on the current target".into()
                }))
            }
        }
        tx.instant();
    }
    /// Close only after core has consumed the saved generation on accepted receipt
    /// AND its observed object update. Refused/unknown requests keep their drafts.
    pub fn complete_save_close(&mut self) {
        let Some(object) = self.close_after_save.clone() else {
            return;
        };
        if self.core.local.drafts.keys().any(|k| k.object == object) {
            return;
        }
        if !self.saves_observed(&self.close_save_ids) {
            return;
        }
        self.composer = self.composer.take().filter(|c| c.key.object != object);
        if let Some(index) = self
            .tabs
            .iter()
            .position(|t| t.object.as_ref() == Some(&object))
            && index > 0
        {
            self.tabs.remove(index);
            if self.active >= index {
                self.active = self.active.saturating_sub(1);
            }
        }
        self.close_after_save = None;
        self.close_save_ids.clear();
    }
    pub fn selected_local_note(&self) -> Option<u64> {
        self.composer
            .as_ref()
            .and_then(|c| c.note.as_ref().map(|n| n.local_id))
            .or_else(|| {
                self.tab()
                    .reader
                    .record
                    .as_deref()?
                    .strip_prefix("draft:")?
                    .parse()
                    .ok()
            })
    }
    pub fn discard_selected_draft(&mut self) {
        self.sync_composer();
        let Some(object) = self.selected_id() else {
            return;
        };
        let note_id = self.selected_local_note();
        let key = self.composer.as_ref().map(|c| c.key.clone()).or_else(|| {
            note_id.and_then(|id| self.core.local.drafts.iter().find(|(k,d)| k.object == object &&
                matches!(&d.body, DraftBody::Notes(notes) if notes.iter().any(|n| n.local_id == id))).map(|(k,_)| k.clone()))
        });
        let Some(key) = key else {
            self.message("No local draft under the cursor");
            return;
        };
        let Some(mut draft) = self.core.local.drafts.get(&key).cloned() else {
            return;
        };
        if let DraftBody::Notes(notes) = &mut draft.body {
            let Some(id) = note_id else { return };
            let removed = notes.iter().find(|n| n.local_id == id).cloned();
            let Some(note) = removed else { return };
            notes.retain(|n| n.local_id != id);
            if notes.is_empty() {
                self.core.local.drafts.remove(&key);
            } else {
                self.core.edit_draft(key.clone(), draft.body.clone());
            }
            draft.body = DraftBody::Notes(vec![note]);
        } else {
            self.core.local.drafts.remove(&key);
        }
        self.discarded = vec![(key, draft)];
        self.composer = None;
        self.dirty = true;
        self.message("Selected local draft discarded · undo is available");
    }
    pub fn undo_local_discard(&mut self) {
        for (key, draft) in self.discarded.clone() {
            if let DraftBody::Notes(saved) = &draft.body {
                let mut notes = self
                    .core
                    .local
                    .drafts
                    .get(&key)
                    .and_then(|d| match &d.body {
                        DraftBody::Notes(n) => Some(n.clone()),
                        _ => None,
                    })
                    .unwrap_or_default();
                for note in saved {
                    if let Some(i) = notes.iter().position(|n| n.local_id == note.local_id) {
                        notes.remove(i);
                    } else {
                        notes.push(note.clone());
                    }
                }
                if notes.is_empty() {
                    self.core.local.drafts.remove(&key);
                } else {
                    self.core.edit_draft(key.clone(), DraftBody::Notes(notes));
                }
            } else if self.core.local.drafts.contains_key(&key) {
                self.core.local.drafts.remove(&key);
            } else {
                self.core.restore_draft(key, draft);
            }
        }
        self.dirty = true;
    }
    pub fn picker(&mut self, kind: PickerKind) {
        self.refresh_picker(kind, "");
        self.show_modal(Modal::Picker {
            kind,
            query: String::new(),
            selected: 0,
        });
        self.last_picker = self.modal.clone();
    }
    pub fn pick(&mut self, kind: PickerKind, query: &str, selected: usize, tx: &mut Tx) {
        let _ = (kind, query);
        self.activate_picker(selected, tx);
    }
    pub fn ex(&mut self, line: &str, tx: &mut Tx) {
        self.core.local.ex_history.push(line.into());
        self.dirty = true;
        let (name, args) = line.trim().split_once(' ').unwrap_or((line.trim(), ""));
        if name == "filter" && self.screen() == Screen::Slices {
            let selected = self.selected_id();
            if args.is_empty() {
                self.show_modal(Modal::Filter { selected: 0 });
            } else if args == "clear" {
                self.filters.clear();
            } else if let Some(name) = args.strip_prefix("save ") {
                self.saved_filters.insert(name.into(), self.filters.clone());
            } else if let Some(name) = args.strip_prefix("forget ") {
                self.saved_filters.remove(name);
            } else if args == "review-queue" {
                self.filters = ["needs-human".into(), "awaiting-review".into()].into();
            } else if let Some(saved) = self
                .saved_filters
                .get(args.strip_prefix("apply ").unwrap_or(args))
            {
                self.filters = saved.clone();
            } else if let Some(name) = args.strip_prefix('+') {
                self.filters.insert(name.into());
            } else if let Some(name) = args.strip_prefix('-') {
                self.filters.remove(name);
            } else {
                self.filters = args.split(',').map(|v| v.trim().into()).collect();
            }
            self.tab_mut().cursor = 0;
            if let Some(id) = selected {
                self.select_id(&id);
            }
            tx.instant();
            return;
        }
        if name == "history" && !args.is_empty() {
            let supplied_previous = self.current_object().is_some_and(
                |o| matches!(&o.body, ObjectBody::Review(r) if r.previous.as_deref() == Some(args)),
            );
            if supplied_previous {
                self.open_object(args);
            } else if let Some(mark) = self
                .core
                .local
                .jumplist
                .iter()
                .rev()
                .find(|m| m.object == args)
                .cloned()
            {
                self.remember_jump();
                self.open_mark(&mark);
                self.remember_jump();
            } else {
                self.message("That revision is neither supplied nor locally visited");
            }
            return;
        }
        if name == "set" {
            match args {
                "theme=ember" => self.theme = render_content::Theme::Ember,
                "theme=ember-soft" => self.theme = render_content::Theme::EmberSoft,
                "theme=ember-light" => self.theme = render_content::Theme::EmberLight,
                "numbers" | "number" => self.numbers = true,
                "nonumbers" | "nonumber" => self.numbers = false,
                "measure=80" => self.wide = false,
                "measure=wide" | "measure=100" => self.wide = true,
                "follow" => self.follow = true,
                "nofollow" => self.follow = false,
                "prosefont=mono" => self.mono_prose = true,
                "prosefont=prose" => self.mono_prose = false,
                "mermaid=source" => self.mermaid_source = true,
                "mermaid=render" => self.mermaid_source = false,
                _ => self.message("Unknown setting; supported: theme, numbers, measure=80/wide, follow, prosefont=mono/prose, mermaid=source/render"),
            };
            tx.instant();
            return;
        }
        if let Some(command) = self.keymap.by_ex(name) {
            let id = command.id.clone();
            if let Some(reason) = self.command_reason(&id) {
                self.message(reason);
            } else {
                self.command(&id, tx);
            }
        } else {
            self.message(format!("Unknown command {name}"));
        }
    }
    pub fn object_matches(&self, query: &str) -> Vec<String> {
        let (kind, query) = query
            .split_once(':')
            .map_or((None, query), |(k, q)| (Some(k), q));
        let mut records = Vec::new();
        if kind.is_none() || kind == Some("slice") {
            records.extend(self.slice_rows().iter().map(|r| {
                (
                    r.id.clone(),
                    format!("{} {}", r.id, r.title.as_deref().unwrap_or("")),
                )
            }));
        }
        if kind.is_none() || kind == Some("agent") {
            records.extend(self.agent_rows().iter().map(|r| {
                (
                    r.assignment.clone(),
                    format!(
                        "{} {}",
                        r.assignment,
                        r.workflow_title.as_deref().unwrap_or("")
                    ),
                )
            }));
        }
        if !matches!(kind, Some("slice" | "agent")) {
            records.extend(
                self.core
                    .host
                    .objects
                    .values()
                    .filter(|o| match kind {
                        Some("doc") => {
                            matches!(o.body, ObjectBody::Review(_) | ObjectBody::LocalPrompt(_))
                        }
                        Some("proposal") => matches!(o.body, ObjectBody::Proposal(_)),
                        None => true,
                        _ => false,
                    })
                    .map(|o| {
                        (
                            o.id.clone(),
                            format!("{} {}", o.id, o.title.as_deref().unwrap_or("")),
                        )
                    }),
            );
        }
        let mut seen = std::collections::BTreeSet::new();
        records
            .into_iter()
            .filter(|(_, text)| smart_match(text, query))
            .map(|(id, _)| id)
            .filter(|id| seen.insert(id.clone()))
            .collect()
    }
    pub fn recent_matches(&self, query: &str) -> Vec<String> {
        let matches = self.object_matches(query);
        let mut seen = std::collections::BTreeSet::new();
        self.core
            .local
            .jumplist
            .iter()
            .rev()
            .map(|m| m.object.clone())
            .filter(|id| matches.contains(id) && seen.insert(id.clone()))
            .collect()
    }
    pub fn search_matches(&self, query: &str) -> Vec<String> {
        self.core
            .host
            .objects
            .values()
            .filter(|o| {
                let text = format!(
                    "{} {} {}",
                    o.id,
                    o.title.as_deref().unwrap_or(""),
                    object_source(o)
                );
                smart_match(&text, query)
            })
            .map(|o| o.id.clone())
            .collect()
    }
    pub fn command_reason(&self, id: &str) -> Option<String> {
        let command = self.keymap.commands().iter().find(|c| c.id == id)?;
        if let KeyAvailability::Unavailable(reason) =
            self.keymap.availability(command, self.context())
        {
            return Some(reason);
        }
        if command.tier != render_keymap::Tier::Local && !self.writes_available() {
            return Some(
                "saving and deciding are off · host or local persistence unavailable".into(),
            );
        }
        if let Some(verb) = AuthorityVerb::from_keymap_id(id) {
            return self.authority_reason(verb);
        }
        match id {
            "work.new" => Some("Host workflow creation capability unavailable".into()),
            "mark.set" | "mark.jump.line" | "mark.jump.exact" => {
                Some("Mark operand not selected".into())
            }
            "draft.undo" | "draft.redo" if self.discarded.is_empty() => {
                Some("No local discard to undo or redo".into())
            }

            "filter.toggle" | "filter.solo"
                if !matches!(self.modal, Some(Modal::Filter { .. })) =>
            {
                Some("Filter float only".into())
            }
            _ => None,
        }
    }
    pub fn source_text(&self) -> String {
        self.current_object().map(object_source).unwrap_or_default()
    }
    pub fn copy_source(&mut self, tx: &mut Tx) {
        let text = self.source_text();
        if text.is_empty() {
            self.message("No source bytes to copy");
        } else {
            tx.copy(text);
            self.message("Source bytes copied");
        }
    }
}
fn smart_match(text: &str, query: &str) -> bool {
    crate::picker::fuzzy_match(text, query)
}
pub(crate) fn object_source(o: &Object) -> String {
    match &o.body {
        ObjectBody::Review(r) => r.text.clone(),
        ObjectBody::LocalPrompt(p) => p.text.clone(),
        ObjectBody::Chat(c) => c
            .messages
            .iter()
            .filter_map(|m| {
                if let MessageBody::Text { text, .. } = &m.body {
                    Some(text.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        ObjectBody::Decision(d) => std::iter::once(d.question.as_str().to_owned())
            .chain(
                d.options
                    .iter()
                    .map(|o| format!("{}\n{}", o.title.as_str(), o.body.as_str())),
            )
            .chain(d.evidence.iter().map(|t| t.as_str().to_owned()))
            .collect::<Vec<_>>()
            .join("\n\n"),
        ObjectBody::Evidence(e) => e
            .findings
            .iter()
            .map(|f| format!("{} {}", f.id, f.text.as_str()))
            .chain(
                e.obligations
                    .iter()
                    .map(|o| format!("{} {}", o.id, o.summary.as_str())),
            )
            .chain(
                e.web
                    .iter()
                    .map(|w| format!("{}\n{}", w.url, w.text.as_str())),
            )
            .chain(e.native_checks.iter().map(|t| t.as_str().to_owned()))
            .collect::<Vec<_>>()
            .join("\n\n"),
        ObjectBody::Proposal(p) => p
            .intake
            .iter()
            .chain(p.source.iter())
            .chain(p.checks.iter())
            .chain(p.advisory.iter())
            .map(|t| t.as_str().to_owned())
            .chain(p.slices.iter().map(|s| format!("{} {}", s.id, s.name)))
            .collect::<Vec<_>>()
            .join("\n\n"),
        ObjectBody::Settings(s) => s
            .policy_fields
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .chain(s.history.iter().map(|t| t.as_str().to_owned()))
            .collect::<Vec<_>>()
            .join("\n"),
        ObjectBody::Operation(o) => std::iter::once(o.label.as_str().to_owned())
            .chain(
                o.observations
                    .iter()
                    .chain(o.attempts.iter())
                    .chain(o.blocks.iter())
                    .map(|t| t.as_str().to_owned()),
            )
            .collect::<Vec<_>>()
            .join("\n\n"),
        ObjectBody::Unsupported { .. } => String::new(),
    }
}
