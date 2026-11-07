use crate::{AppState, screen::ComposeKind, state::Composer};
use render_core::*;
use render_editor::Editor;

impl AppState {
    pub fn start_composer(&mut self, kind: ComposeKind) {
        let Some(id) = self.selected_id() else {
            self.message("No target for a local draft");
            return;
        };
        let object = self.core.host.objects.get(&id);
        let revision = object.and_then(|o| match (&kind, &o.body) {
            (ComposeKind::Note, ObjectBody::Review(review)) => review.annotation_set.clone(),
            (ComposeKind::Note, _) => None,
            (ComposeKind::Policy, ObjectBody::Settings(settings)) => {
                settings.policy_default.clone()
            }
            _ => o.revision.clone(),
        });
        let draft_kind = match kind {
            ComposeKind::Note => DraftKind::Annotations,
            ComposeKind::Chat => DraftKind::Prompt,
            ComposeKind::Decision => DraftKind::DecisionNote,
            ComposeKind::Emission => DraftKind::EditBuffer,
            ComposeKind::Policy => DraftKind::Policy,
        };
        if kind == ComposeKind::Policy && revision.is_none() {
            self.message("Host policy revision unavailable");
            return;
        }
        let key = self
            .core
            .local
            .drafts
            .keys()
            .find(|k| kind == ComposeKind::Policy && k.object == id && k.kind == DraftKind::Policy)
            .cloned()
            .unwrap_or(DraftKey {
                object: id,
                kind: draft_kind,
                base: revision,
            });
        let existing = self.core.local.drafts.get(&key);
        let mut note = None;
        let text = match kind {
            ComposeKind::Note => {
                let nodes = object.and_then(|o| {
                    if let ObjectBody::Review(r) = &o.body {
                        Some(&r.nodes)
                    } else {
                        None
                    }
                });
                let node =
                    nodes.and_then(|ns| ns.get(self.tab().cursor.min(ns.len().saturating_sub(1))));
                let anchor = node.and_then(|n| n.byte_range).unwrap_or((0, 0));
                note = Some(LocalNote {
                    local_id: self
                        .core
                        .local
                        .drafts
                        .values()
                        .filter_map(|draft| match &draft.body {
                            DraftBody::Notes(notes) => notes.iter().map(|n| n.local_id).max(),
                            _ => None,
                        })
                        .max()
                        .unwrap_or(0)
                        .max(u64::from(self.core.local.notes_written))
                        .saturating_add(1),
                    anchor: Anchor {
                        node: node.map(|n| n.id.clone()),
                        byte_start: anchor.0,
                        byte_end: anchor.1,
                        quote: String::new(),
                    },
                    body: String::new(),
                });
                String::new()
            }
            ComposeKind::Emission => existing
                .and_then(|d| {
                    if let DraftBody::Text(t) = &d.body {
                        Some(t.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| self.source_text()),
            ComposeKind::Policy => existing
                .map(|d| match &d.body {
                    DraftBody::Policy(p) => {
                        p.editor_source().map(str::to_owned).unwrap_or_else(|| {
                            p.fields()
                                .iter()
                                .map(|(k, v)| format!("{k}={v}"))
                                .collect::<Vec<_>>()
                                .join("\n")
                        })
                    }
                    DraftBody::Text(t) => t.clone(),
                    DraftBody::Edits(e) => e
                        .iter()
                        .map(|(k, v)| format!("{k}={v}"))
                        .collect::<Vec<_>>()
                        .join("\n"),
                    _ => String::new(),
                })
                .unwrap_or_else(|| {
                    object
                        .and_then(|o| {
                            if let ObjectBody::Settings(s) = &o.body {
                                Some(
                                    s.policy_fields
                                        .iter()
                                        .map(|(k, v)| format!("{k}={v}"))
                                        .collect::<Vec<_>>()
                                        .join("\n"),
                                )
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default()
                }),
            _ => existing
                .and_then(|d| {
                    if let DraftBody::Text(t) = &d.body {
                        Some(t.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_default(),
        };
        self.composer = Some(Composer {
            kind,
            editor: Editor::insert(text.clone()),
            preedit: None,
            synced_text: text,
            synced_generation: if note.is_some() {
                None
            } else {
                existing.map(|d| d.generation)
            },
            key,
            note,
        });
        if kind == ComposeKind::Policy {
            let key = self.composer.as_ref().unwrap().key.clone();
            if !self.core.local.drafts.contains_key(&key) {
                let fields = self
                    .core
                    .host
                    .objects
                    .get(&key.object)
                    .and_then(|o| {
                        if let ObjectBody::Settings(s) = &o.body {
                            Some(s.policy_fields.clone())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();
                let generation = self.core.edit_draft(
                    key.clone(),
                    DraftBody::Policy(PolicyDraft::new(key.base.clone().unwrap(), fields)),
                );
                self.composer.as_mut().unwrap().synced_generation = Some(generation);
                self.dirty = true;
            }
        }
        self.modal = None;
        self.pending.clear();
        self.which_key = false;
    }
    /// Reopen a local note by identity, keeping its original (possibly stale) basis.
    /// Callers must resolve the selected note rather than treating a reader row as an index.
    pub fn edit_note(&mut self, local_id: u64) -> bool {
        let Some(object) = self.selected_id() else {
            return false;
        };
        let found = self.core.local.drafts.iter().find_map(|(key, draft)| {
            if key.object != object || key.kind != DraftKind::Annotations {
                return None;
            }
            let DraftBody::Notes(notes) = &draft.body else {
                return None;
            };
            notes
                .iter()
                .find(|n| n.local_id == local_id)
                .map(|note| (key.clone(), draft.generation, note.clone()))
        });
        let Some((key, generation, note)) = found else {
            self.message("Local note is no longer available");
            return false;
        };
        self.composer = Some(Composer {
            kind: ComposeKind::Note,
            editor: Editor::insert(note.body.clone()),
            preedit: None,
            synced_text: note.body.clone(),
            synced_generation: Some(generation),
            key,
            note: Some(note),
        });
        self.modal = None;
        self.pending.clear();
        self.which_key = false;
        true
    }

    /// Rune delivers paste through the view root's `El::on_paste` callback.
    pub fn paste_composer(&mut self, text: &str, tx: &mut rune::Tx) {
        if self.modal.is_some() || self.hints.is_some() {
            return;
        }
        let Some(composer) = self.composer.as_mut() else {
            return;
        };
        if composer.editor.paste(text).text_changed {
            self.last_key = self.now;
            self.sync_composer();
        }
        tx.instant();
    }

    /// Called after inbound processing. Core consumes only the submitted generation;
    /// an accepted receipt alone must not clear an editor awaiting its object update.
    pub fn reconcile_composer(&mut self) {
        let consumed = self.composer.as_ref().is_some_and(|composer| {
            composer.synced_generation.is_some()
                && composer.editor.text() == composer.synced_text
                && !self.core.local.drafts.contains_key(&composer.key)
        });
        if consumed {
            self.composer = None;
        }
    }

    pub fn sync_composer(&mut self) {
        let Some(composer) = &self.composer else {
            return;
        };
        let text = composer.editor.text().to_owned();
        if text == composer.synced_text {
            return;
        }
        let new_note = composer.note.is_some() && composer.synced_generation.is_none();
        let key = composer.key.clone();
        let body = if let Some(note) = &composer.note {
            let mut note = note.clone();
            note.body = text;
            let mut notes = self
                .core
                .local
                .drafts
                .get(&key)
                .and_then(|d| {
                    if let DraftBody::Notes(notes) = &d.body {
                        Some(notes.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_default();
            if let Some(previous) = notes.iter_mut().find(|n| n.local_id == note.local_id) {
                *previous = note;
            } else {
                notes.push(note);
            }
            DraftBody::Notes(notes)
        } else if composer.kind == ComposeKind::Policy {
            let mut policy = self
                .core
                .local
                .drafts
                .get(&key)
                .and_then(|draft| {
                    if let DraftBody::Policy(p) = &draft.body {
                        Some(p.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| {
                    let fields = self
                        .core
                        .host
                        .objects
                        .get(&key.object)
                        .and_then(|o| {
                            if let ObjectBody::Settings(s) = &o.body {
                                Some(s.policy_fields.clone())
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default();
                    PolicyDraft::new(key.base.clone().unwrap_or_default(), fields)
                });
            policy.set_editor_source(text);
            DraftBody::Policy(policy)
        } else {
            DraftBody::Text(text)
        };
        let generation = self.core.edit_draft(key, body);
        let composer = self.composer.as_mut().unwrap();
        composer.synced_text = composer.editor.text().to_owned();
        composer.synced_generation = Some(generation);
        if new_note {
            self.core.local.notes_written = self.core.local.notes_written.saturating_add(1);
        }
        self.dirty = true;
    }
    pub fn start_note_at(&mut self, anchor: Anchor) {
        self.start_composer(ComposeKind::Note);
        if let Some(note) = self.composer.as_mut().and_then(|c| c.note.as_mut()) {
            note.anchor = anchor;
        }
    }

    /// Explicit user acknowledgement only; inbound synchronization must not call this.
    pub fn rebase_policy(&mut self, object: &str) {
        let Some((revision, fields)) = self.core.host.objects.get(object).and_then(|o| {
            if let ObjectBody::Settings(s) = &o.body {
                Some((s.policy_default.clone()?, s.policy_fields.clone()))
            } else {
                None
            }
        }) else {
            self.message("Current host policy unavailable");
            return;
        };
        let keys = self
            .core
            .local
            .drafts
            .keys()
            .filter(|k| k.object == object && k.kind == DraftKind::Policy)
            .cloned()
            .collect::<Vec<_>>();
        for key in keys {
            let Some(DraftBody::Policy(mut policy)) =
                self.core.local.drafts.get(&key).map(|d| d.body.clone())
            else {
                continue;
            };
            policy.rebase(revision.clone(), fields.clone());
            self.core.edit_draft(key, DraftBody::Policy(policy));
        }
        for change in self.core.unacknowledged(object, None) {
            self.core.acknowledge(object, None, &change.name);
        }
        self.dirty = true;
        self.message("Policy rebased locally. Resolve conflicts in the editor; issue authority again separately.");
    }

    pub fn finish_composer(&mut self) {
        self.sync_composer();
        self.composer = None;
        self.dirty = true;
        self.persist();
    }
}
