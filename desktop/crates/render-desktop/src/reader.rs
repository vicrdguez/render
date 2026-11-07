//! Immutable reader coordinates. Byte positions belong to the shared editor; structured
//! records have a separate identity. Callers must integrate these helpers before dispatch.
use crate::{AppState, Screen};
use render_core::*;
use render_editor::{Editor, Mode};
use std::ops::Range;

#[derive(Clone, Debug, Default)]
pub struct ReaderState {
    editor: Editor,
    /// Semantic record identity, not a line number or a source offset.
    pub record: Option<String>,
}
impl ReaderState {
    pub fn cursor(&self) -> usize {
        self.editor.cursor()
    }
    pub fn mode(&self) -> Mode {
        self.editor.mode()
    }
    fn sync(&mut self, source: &str) {
        if self.editor.text() != source {
            self.editor.set_text(source);
            self.record = None;
        }
    }
    fn seek(&mut self, source: &str, byte: usize) -> bool {
        if byte > source.len() || !source.is_char_boundary(byte) {
            return false;
        }
        self.sync(source);
        // Editor intentionally exposes no mutable cursor. Its counted scalar motion is
        // the positioning boundary too; never count bytes as characters.
        let chars = source[..byte].chars().count();
        let mut e = Editor::new(source);
        if chars > 0 {
            // l is line-bounded; use line and column motions instead.
            let line = source[..byte].bytes().filter(|b| *b == b'\n').count();
            if line > 0 {
                for k in line.to_string().chars() {
                    e.handle_key(&k.to_string());
                }
                e.handle_key("j");
            }
            let col = source[..byte]
                .rsplit('\n')
                .next()
                .unwrap_or("")
                .chars()
                .count();
            if col > 0 {
                for k in col.to_string().chars() {
                    e.handle_key(&k.to_string());
                }
                e.handle_key("l");
            }
        }
        self.editor = e;
        self.editor.cursor() == byte
    }
}

#[derive(Clone)]
struct Record {
    id: String,
    range: Option<Range<usize>>,
    streaming: bool,
}

impl AppState {
    /// Execute a complete reader motion/Visual sequence transactionally. Mutating or
    /// Insert-mode actions are rejected, even if they happen not to alter this source.
    pub fn reader_motion(&mut self, keys: &[String]) -> bool {
        let source = self.source_text();
        self.tab_mut().reader.sync(&source);
        let mut e = self.tab().reader.editor.clone();
        let mut operand = false;
        for key in keys {
            if !operand && !reader_key(key, e.mode()) {
                return false;
            }
            let out = e.handle_key(key);
            if !out.handled
                || out.text_changed
                || e.mode() == Mode::Insert
                || e.pending_operator().is_some()
            {
                return false;
            }
            operand = !operand && matches!(key.as_str(), "f" | "F" | "t" | "T");
        }
        if let Some(range) = e.selection()
            && self.anchor_for(&source, range, None).is_none()
        {
            return false;
        }
        self.visual = matches!(e.mode(), Mode::Visual | Mode::VLine);
        self.tab_mut().reader.editor = e;
        true
    }
    pub fn reader_seek(&mut self, byte: usize) -> bool {
        let source = self.source_text();
        let ok = self.tab_mut().reader.seek(&source, byte);
        self.visual = false;
        ok
    }
    pub fn reader_selection(&self) -> Option<Anchor> {
        let source = self.source_text();
        let e = &self.tab().reader.editor;
        if e.text() != source {
            return None;
        }
        self.anchor_for(&source, e.selection()?, None)
    }
    /// c/gc annotate rather than change. Resolve standard ranges with the shared
    /// editor on disposable clones; immutable host bytes are never edited.
    pub fn reader_operator(&mut self, operator: &str, keys: &[String]) -> Option<Anchor> {
        if !matches!(operator, "c" | "gc" | "y" | "yank" | "yank.clipboard") {
            return None;
        }
        let source = self.source_text();
        self.tab_mut().reader.sync(&source);
        if self.tab().reader.editor.selection().is_some() {
            return self.reader_selection();
        }
        if keys.len() == 2 && matches!(keys[0].as_str(), "i" | "a") {
            let kind = match keys[1].as_str() {
                "n" => Some("node"),
                "h" => Some("hunk"),
                "m" => Some("message"),
                _ => None,
            };
            if let Some(kind) = kind {
                let cursor = self.tab().reader.cursor();
                let record = self
                    .records(kind)
                    .into_iter()
                    .find(|r| r.range.as_ref().is_some_and(|r| r.contains(&cursor)))?;
                if record.streaming {
                    return None;
                }
                let mut range = record.range?;
                // Nodes include their heading in host ranges. Inner node excludes only
                // an actual Markdown heading line, never a guessed occurrence of its title.
                if kind == "node"
                    && keys[0] == "i"
                    && source.get(range.clone())?.starts_with('#')
                    && let Some(newline) = source[range.clone()].find('\n')
                {
                    range.start += newline + 1;
                }
                return self.anchor_for(&source, range, (kind == "node").then_some(record.id));
            }
        }
        let mut yank = self.tab().reader.editor.clone();
        let mut change = yank.clone();
        yank.handle_key("y");
        change.handle_key("c");
        let doubled = keys.len() == 1 && matches!(keys[0].as_str(), "c" | "gc" | "y");
        for key in keys {
            let y = if doubled { "y" } else { key.as_str() };
            let c = if doubled { "c" } else { key.as_str() };
            if !yank.handle_key(y).handled || !change.handle_key(c).handled {
                return None;
            }
        }
        if yank.pending_operator().is_some()
            || change.mode() != Mode::Insert
            || yank.register().is_empty()
        {
            return None;
        }
        let start = change.cursor();
        let end = start.checked_add(yank.register().len())?.min(source.len());
        let quote = source.get(start..end)?;
        // The editor appends a synthetic newline for linewise yanks at EOF.
        if yank.register() != quote && yank.register() != format!("{quote}\n") {
            return None;
        }
        self.anchor_for(&source, start..end, None)
    }
    fn anchor_for(
        &self,
        source: &str,
        range: Range<usize>,
        node: Option<String>,
    ) -> Option<Anchor> {
        let quote = source.get(range.clone())?;
        if quote.is_empty() {
            return None;
        }
        if self.records("message").iter().any(|r| {
            r.streaming
                && r.range
                    .as_ref()
                    .is_some_and(|r| range.start < r.end && r.start < range.end)
        }) {
            return None;
        }
        let node = node.or_else(|| {
            self.records("node")
                .into_iter()
                .find(|r| {
                    r.range
                        .as_ref()
                        .is_some_and(|r| r.start <= range.start && range.end <= r.end)
                })
                .map(|r| r.id)
        });
        Some(Anchor {
            node,
            byte_start: range.start as u64,
            byte_end: range.end as u64,
            quote: quote.into(),
        })
    }
    /// binding preserves ]/[ and uppercase first/last variants sharing a command id.
    pub fn semantic_motion(&mut self, command_id: &str, binding: &str, count: usize) -> bool {
        let kind = command_id.split('.').next().unwrap_or(command_id);
        let mut records = self.records(kind);
        if records.is_empty() {
            self.message("No typed targets available for this motion");
            return false;
        }
        let source = self.source_text();
        self.tab_mut().reader.sync(&source);
        let byte_records = records.iter().all(|r| r.range.is_some());
        if byte_records {
            records.sort_by_key(|r| r.range.as_ref().unwrap().start);
        }
        let prev = binding.starts_with('[')
            || command_id.ends_with(".prev")
            || command_id.ends_with(".first");
        let edge = binding
            .chars()
            .last()
            .is_some_and(|c| c.is_ascii_uppercase())
            || command_id.ends_with(".first")
            || command_id.ends_with(".last");
        let mut index = records
            .iter()
            .position(|r| self.tab().reader.record.as_ref() == Some(&r.id));
        let mut byte = self.tab().reader.cursor();
        let mut target = None;
        for _ in 0..count.max(1).min(records.len().saturating_add(1)) {
            target = if edge {
                Some(if prev { 0 } else { records.len() - 1 })
            } else if byte_records {
                if prev {
                    records
                        .iter()
                        .rposition(|r| r.range.as_ref().unwrap().start < byte)
                } else {
                    records
                        .iter()
                        .position(|r| r.range.as_ref().unwrap().start > byte)
                }
            } else if prev {
                index.and_then(|i| i.checked_sub(1))
            } else {
                Some(index.map_or(0, |i| i + 1)).filter(|i| *i < records.len())
            };
            let Some(i) = target else {
                break;
            };
            index = Some(i);
            if let Some(r) = &records[i].range {
                byte = r.start;
            }
            if edge {
                break;
            }
        }
        let Some(i) = target.or(index) else {
            return false;
        };
        if let Some(range) = &records[i].range
            && !self.reader_seek(range.start)
        {
            return false;
        }
        self.tab_mut().reader.record = Some(records[i].id.clone());
        true
    }
    fn records(&self, kind: &str) -> Vec<Record> {
        let source = self.source_text();
        let ranged = |id: String, start: u64, end: u64| -> Option<Record> {
            let range = usize::try_from(start).ok()?..usize::try_from(end).ok()?;
            source.get(range.clone())?;
            Some(Record {
                id,
                range: Some(range),
                streaming: false,
            })
        };
        let plain = |id: String| Record {
            id,
            range: None,
            streaming: false,
        };
        if kind == "group" {
            let ids = self.visible_ids();
            let mut last = None;
            return ids
                .into_iter()
                .filter_map(|id| {
                    let group = match self.screen() {
                        Screen::Brief => self
                            .core
                            .host
                            .attention
                            .rows
                            .iter()
                            .find(|r| r.object == id)
                            .map(|r| format!("{:?}", r.group)),
                        Screen::Slices => self
                            .core
                            .host
                            .slices
                            .rows
                            .iter()
                            .find(|r| r.id == id)
                            .and_then(|r| r.proposal.clone()),
                        Screen::Agents => self
                            .core
                            .host
                            .agents
                            .rows
                            .iter()
                            .find(|r| r.assignment == id)
                            .map(|r| format!("{:?}", r.group)),
                        _ => None,
                    }?;
                    if last.as_ref() == Some(&group) {
                        return None;
                    }
                    last = Some(group);
                    Some(plain(id))
                })
                .collect();
        }
        let Some(o) = self.current_object() else {
            return vec![];
        };
        match (&o.body, kind) {
            (ObjectBody::Review(r), "node") => r
                .nodes
                .iter()
                .filter_map(|n| {
                    let (s, e) = n.byte_range?;
                    ranged(n.id.clone(), s, e)
                })
                .collect(),
            (ObjectBody::Review(r), "hunk") => r
                .change_ranges
                .iter()
                .enumerate()
                .filter_map(|(i, (s, e))| ranged(format!("hunk:{i}"), *s, *e))
                .collect(),
            (ObjectBody::Review(r), "annotation") => r
                .annotations
                .iter()
                .filter(|a| !r.dispositions.iter().any(|d| d.annotation == a.id))
                .map(|a| (a.id.clone(), a.anchor.clone()))
                .chain(
                    self.local_notes()
                        .into_iter()
                        .map(|n| (format!("draft:{}", n.local_id), n.anchor)),
                )
                .filter_map(|(id, a)| ranged(id, a.byte_start, a.byte_end))
                .collect(),
            (ObjectBody::Evidence(e), "finding") => {
                e.findings.iter().map(|f| plain(f.id.clone())).collect()
            }
            (ObjectBody::Evidence(e), "obligation") => {
                e.obligations.iter().map(|f| plain(f.id.clone())).collect()
            }
            (ObjectBody::Chat(c), "message") => {
                let mut offset = 0;
                let mut first = true;
                c.messages
                    .iter()
                    .filter_map(|m| {
                        if let MessageBody::Text {
                            text, streaming, ..
                        } = &m.body
                        {
                            if !first {
                                offset += 2;
                            }
                            first = false;
                            let start = offset;
                            offset += text.len();
                            Some(Record {
                                id: m.id.clone(),
                                range: Some(start..offset),
                                streaming: *streaming,
                            })
                        } else {
                            None
                        }
                    })
                    .collect()
            }
            (ObjectBody::Chat(c), "toolcall") => c
                .messages
                .iter()
                .filter(|m| matches!(m.body, MessageBody::Tool(_)))
                .map(|m| plain(m.id.clone()))
                .collect(),
            _ => vec![],
        }
    }
    /// Parser-backed source target; code and spoofed labels remain inert.
    /// Retain the complete host reference, including its dangling reason.
    pub fn under_cursor_reference(&self) -> Option<Reference> {
        let render_content::NavigationKind::Reference(reference) = self.navigation_target()?.kind
        else {
            return None;
        };
        let object = self.current_object()?;
        self.core
            .host
            .references
            .get(self.core.host.object_scope.get(&object.id)?)?
            .iter()
            .find(|candidate| candidate.label == reference.label)
            .cloned()
    }
    pub fn under_cursor_link(&self) -> Option<String> {
        match self.navigation_target()?.kind {
            render_content::NavigationKind::Link(url) => Some(url),
            _ => None,
        }
    }
}
fn reader_key(k: &str, mode: Mode) -> bool {
    k.len() == 1 && k.as_bytes()[0].is_ascii_digit()
        || matches!(
            k,
            "h" | "j"
                | "k"
                | "l"
                | "w"
                | "W"
                | "b"
                | "B"
                | "e"
                | "E"
                | "0"
                | "$"
                | "^"
                | "g"
                | "G"
                | "{"
                | "}"
                | "("
                | ")"
                | "f"
                | "F"
                | "t"
                | "T"
                | ";"
                | ","
                | "v"
                | "V"
                | "Esc"
                | "Left"
                | "Right"
                | "Up"
                | "Down"
        )
        || matches!(mode, Mode::Visual | Mode::VLine) && matches!(k, "i" | "a" | "s" | "p")
}
