//! Local modal editing shared by prompt and note composers.
//!
//! Positions and selection ranges use UTF-8 byte offsets at Unicode scalar boundaries.
//! Keys are individual printable scalars or named keys (`Esc`, `Enter`, `Backspace`,
//! `C-r`). Unknown keys are unhandled. Sending, saving, and authority belong to callers.
use std::ops::Range;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Normal,
    Insert,
    Visual,
    VLine,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    pub handled: bool,
    pub text_changed: bool,
    pub cursor_changed: bool,
    pub mode_changed: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operator {
    Delete,
    Change,
    Yank,
}

#[derive(Clone, Debug)]
enum Pending {
    Go(usize),
    Find(Option<Operator>, usize, char),
    Operator(Operator, usize),
    Object(Operator, usize, bool),
    OperatorGo(Operator, usize),
    VisualObject(bool),
}

#[derive(Clone, Debug)]
struct Snapshot {
    text: String,
    cursor: usize,
}

#[derive(Clone, Debug)]
enum Input {
    Key(String),
    Text(String),
}

#[derive(Clone, Debug, Default)]
struct History {
    undo: Vec<Snapshot>,
    redo: Vec<Snapshot>,
}

#[derive(Clone, Debug, Default)]
struct Register {
    text: String,
    linewise: bool,
}

#[derive(Clone, Debug)]
pub struct Editor {
    text: String,
    cursor: usize,
    mode: Mode,
    selection: Option<usize>,
    history: History,
    register: Register,
    pending: Option<Pending>,
    count: usize,
    transaction: Option<Snapshot>,
    command: Vec<Input>,
    last_change: Vec<Input>,
    replaying: bool,
    composing: bool,
    last_j: Option<(usize, Instant)>,
    last_find: Option<(char, char)>,
}

impl Default for Editor {
    fn default() -> Self {
        Self::new("")
    }
}

impl Editor {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            cursor: 0,
            mode: Mode::Normal,
            selection: None,
            history: History::default(),
            register: Register::default(),
            pending: None,
            count: 0,
            transaction: None,
            command: Vec::new(),
            last_change: Vec::new(),
            replaying: false,
            composing: false,
            last_j: None,
            last_find: None,
        }
    }

    /// Creates a composer in Insert mode with its caret at the end.
    pub fn insert(text: impl Into<String>) -> Self {
        let mut editor = Self::new(text);
        editor.cursor = editor.text.len();
        editor.handle_key("i");
        editor
    }

    pub fn text(&self) -> &str {
        &self.text
    }
    pub fn cursor(&self) -> usize {
        self.cursor
    }
    pub fn mode(&self) -> Mode {
        self.mode
    }
    pub fn register(&self) -> &str {
        &self.register.text
    }
    pub fn pending_operator(&self) -> Option<Operator> {
        match self.pending {
            Some(
                Pending::Operator(op, _)
                | Pending::Object(op, _, _)
                | Pending::OperatorGo(op, _)
                | Pending::Find(Some(op), _, _),
            ) => Some(op),
            _ => None,
        }
    }

    /// Replaces the document and resets all editing state, including undo and register.
    pub fn set_text(&mut self, text: impl Into<String>) {
        *self = Self::new(text);
    }

    /// IME preedit belongs to the adapter. While composing, `jk` stays literal and
    /// the first Escape ends composition without leaving Insert.
    pub fn set_composing(&mut self, composing: bool) {
        self.composing = composing;
        self.last_j = None;
    }

    /// Returns an inclusive character selection as a half-open byte range.
    pub fn selection(&self) -> Option<Range<usize>> {
        let anchor = self.selection?;
        let start = anchor.min(self.cursor);
        let end = anchor.max(self.cursor);
        Some(if self.mode == Mode::VLine {
            self.line_start(start)..self.after_line(end)
        } else {
            start..self.next(end)
        })
    }

    /// Inserts committed text literally, without interpreting `jk` or command keys.
    /// In Normal mode this inserts before the cursor as a single undo transaction.
    pub fn insert_text(&mut self, text: &str) -> Outcome {
        let before = self.snapshot();
        let mode = self.mode;
        if text.is_empty() {
            return self.outcome(&before, mode, true);
        }
        self.begin();
        self.command.push(Input::Text(text.to_owned()));
        self.last_j = None;
        if let Some(range) = self.selection() {
            self.cursor = range.start;
            self.text.replace_range(range, "");
            self.selection = None;
            self.mode = Mode::Normal;
        }
        self.text.insert_str(self.cursor, text);
        self.cursor += text.len();
        self.finish();
        self.outcome(&before, mode, true)
    }

    pub fn paste(&mut self, text: &str) -> Outcome {
        self.insert_text(text)
    }

    pub fn handle_key(&mut self, key: &str) -> Outcome {
        let key = canonical(key);
        let before = self.snapshot();
        let mode = self.mode;
        if self.mode == Mode::Normal && self.pending.is_none() && matches!(key, "u" | "C-r" | ".") {
            self.count = 0;
            self.transaction = None;
            self.command.clear();
            match key {
                "u" => {
                    if let Some(old) = self.history.undo.pop() {
                        self.history.redo.push(self.snapshot());
                        self.restore(old);
                    }
                }
                "C-r" => {
                    if let Some(new) = self.history.redo.pop() {
                        self.history.undo.push(self.snapshot());
                        self.restore(new);
                    }
                }
                "." if !self.replaying => {
                    let inputs = self.last_change.clone();
                    self.replaying = true;
                    for input in inputs {
                        match input {
                            Input::Key(k) => {
                                self.handle_key(&k);
                            }
                            Input::Text(t) => {
                                self.insert_text(&t);
                            }
                        }
                    }
                    self.replaying = false;
                }
                _ => {}
            }
            return self.outcome(&before, mode, true);
        }
        self.begin();
        self.command.push(Input::Key(key.to_owned()));
        let handled = if key == "Esc" {
            if self.composing {
                self.composing = false;
                self.last_j = None;
            } else {
                self.leave_insert();
                self.mode = Mode::Normal;
                self.selection = None;
                self.pending = None;
                self.count = 0;
            }
            true
        } else if self.mode == Mode::Insert {
            self.insert_key(key)
        } else {
            self.normal_key(key)
        };
        self.finish();
        self.outcome(&before, mode, handled)
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            text: self.text.clone(),
            cursor: self.cursor,
        }
    }
    fn restore(&mut self, snapshot: Snapshot) {
        self.text = snapshot.text;
        self.cursor = snapshot.cursor;
        self.mode = Mode::Normal;
        self.selection = None;
        self.pending = None;
        self.last_j = None;
        self.normalize();
    }
    fn outcome(&self, before: &Snapshot, mode: Mode, handled: bool) -> Outcome {
        Outcome {
            handled,
            text_changed: before.text != self.text,
            cursor_changed: before.cursor != self.cursor,
            mode_changed: mode != self.mode,
        }
    }
    fn begin(&mut self) {
        if self.transaction.is_none() {
            self.transaction = Some(self.snapshot());
            self.command.clear();
        }
    }
    fn finish(&mut self) {
        self.normalize();
        if self.mode != Mode::Normal || self.pending.is_some() || self.count > 0 {
            return;
        }
        if let Some(before) = self.transaction.take()
            && before.text != self.text
        {
            self.history.undo.push(before);
            self.history.redo.clear();
            if !self.replaying {
                self.last_change = self.command.clone();
            }
        }
        self.command.clear();
    }
    fn normalize(&mut self) {
        self.cursor = self.cursor.min(self.text.len());
        if self.mode != Mode::Insert
            && self.cursor > self.line_start(self.cursor)
            && self.cursor == self.line_end(self.cursor)
        {
            self.cursor = self.prev(self.cursor);
        }
    }
    fn next(&self, pos: usize) -> usize {
        self.text[pos..]
            .chars()
            .next()
            .map_or(pos, |c| pos + c.len_utf8())
    }
    fn prev(&self, pos: usize) -> usize {
        self.text[..pos]
            .char_indices()
            .next_back()
            .map_or(0, |(p, _)| p)
    }
    fn char_at(&self, pos: usize) -> Option<char> {
        self.text[pos..].chars().next()
    }
    fn line_start(&self, pos: usize) -> usize {
        self.text[..pos].rfind('\n').map_or(0, |p| p + 1)
    }
    fn line_end(&self, pos: usize) -> usize {
        self.text[pos..]
            .find('\n')
            .map_or(self.text.len(), |p| p + pos)
    }
    fn after_line(&self, pos: usize) -> usize {
        self.next(self.line_end(pos))
    }
    fn last_on_line(&self, pos: usize) -> usize {
        let end = self.line_end(pos);
        if end > self.line_start(pos) {
            self.prev(end)
        } else {
            end
        }
    }
    fn leave_insert(&mut self) {
        if self.mode == Mode::Insert && self.cursor > self.line_start(self.cursor) {
            self.cursor = self.prev(self.cursor);
        }
        self.last_j = None;
    }
    fn insert_key(&mut self, key: &str) -> bool {
        if key == "jk" && !self.composing {
            self.leave_insert();
            self.mode = Mode::Normal;
            return true;
        }
        if key == "k"
            && !self.composing
            && let Some((pos, time)) = self.last_j.take()
            && self.cursor == pos + 1
            && time.elapsed() <= Duration::from_millis(300)
        {
            // Record the resolved escape, not a timing-sensitive pair of keys.
            self.command.pop();
            self.command.pop();
            self.command.push(Input::Key("Esc".into()));
            self.text.replace_range(pos..self.cursor, "");
            self.cursor = pos;
            self.leave_insert();
            self.mode = Mode::Normal;
            return true;
        }
        self.last_j = None;
        match key {
            "Backspace" => {
                if self.cursor > 0 {
                    let start = self.prev(self.cursor);
                    self.text.replace_range(start..self.cursor, "");
                    self.cursor = start;
                }
            }
            "Delete" => {
                self.text
                    .replace_range(self.cursor..self.next(self.cursor), "");
            }
            "Enter" | "C-Enter" => {
                let prefix = if key == "Enter" {
                    list_continuation(&self.text[self.line_start(self.cursor)..self.cursor])
                } else {
                    String::new()
                };
                let inserted = format!("\n{prefix}");
                self.text.insert_str(self.cursor, &inserted);
                self.cursor += inserted.len();
            }
            "C-t" | "C-d" => {
                let start = self.line_start(self.cursor);
                if key == "C-t" {
                    self.text.insert_str(start, "  ");
                    self.cursor += 2;
                } else {
                    let indent = self.text[start..]
                        .chars()
                        .take_while(|c| *c == ' ')
                        .take(2)
                        .count();
                    let indent = if self.text[start..].starts_with('\t') {
                        1
                    } else {
                        indent
                    };
                    self.text.replace_range(start..start + indent, "");
                    self.cursor = self.cursor.saturating_sub(indent).max(start);
                }
            }
            "Tab" => {
                self.text.insert(self.cursor, '\t');
                self.cursor += 1;
            }
            "Left" => self.cursor = self.prev(self.cursor),
            "Right" => self.cursor = self.next(self.cursor),
            "Up" => self.cursor = self.vertical(self.cursor, false),
            "Down" => self.cursor = self.vertical(self.cursor, true),
            "Home" => self.cursor = self.line_start(self.cursor),
            "End" => self.cursor = self.line_end(self.cursor),
            "C-w" => {
                let start = self
                    .word_backward(self.cursor, false)
                    .max(self.line_start(self.cursor));
                self.text.replace_range(start..self.cursor, "");
                self.cursor = start;
            }
            "C-u" => {
                let start = self.line_start(self.cursor);
                self.text.replace_range(start..self.cursor, "");
                self.cursor = start;
            }
            _ if key.chars().count() == 1 && !key.chars().next().unwrap().is_control() => {
                self.command.pop();
                self.command.push(Input::Text(key.to_owned()));
                let pos = self.cursor;
                self.text.insert_str(pos, key);
                self.cursor += key.len();
                if key == "j" && !self.composing {
                    self.last_j = Some((pos, Instant::now()));
                }
            }
            _ => return false,
        }
        true
    }

    fn normal_key(&mut self, key: &str) -> bool {
        // A find operand is literal, including digits and operator letters.
        if let Some(Pending::Find(op, count, kind)) = self.pending.clone() {
            self.pending = None;
            if key.chars().count() != 1 {
                return false;
            }
            let target = key.chars().next().unwrap();
            self.last_find = Some((kind, target));
            self.find_motion(op, kind, target, count, false);
            return true;
        }
        if key.len() == 1 && key.as_bytes()[0].is_ascii_digit() && (key != "0" || self.count > 0) {
            self.count = self
                .count
                .saturating_mul(10)
                .saturating_add((key.as_bytes()[0] - b'0') as usize)
                .min(10_000);
            return true;
        }
        let explicit_count = std::mem::take(&mut self.count);
        let count = explicit_count.max(1);
        if let Some(pending) = self.pending.take() {
            return match pending {
                Pending::Find(..) => unreachable!(),
                Pending::Go(n) => {
                    if key == "g" {
                        self.cursor = self.line_number(n.max(count));
                        true
                    } else {
                        false
                    }
                }
                Pending::Operator(op, n) => {
                    let counted = n > 0 || explicit_count > 0;
                    let n = n.max(1).saturating_mul(count).min(10_000);
                    if operator(key) == Some(op) {
                        let start = self.line_start(self.cursor);
                        let mut end = start;
                        for _ in 0..n {
                            end = self.after_line(end);
                            if end == self.text.len() {
                                break;
                            }
                        }
                        self.apply(op, start..end, true);
                        true
                    } else if matches!(key, "i" | "a") {
                        self.pending = Some(Pending::Object(op, n, key == "a"));
                        true
                    } else if key == "g" {
                        self.pending = Some(Pending::OperatorGo(op, n));
                        true
                    } else if matches!(key, "f" | "t" | "F" | "T") {
                        self.pending =
                            Some(Pending::Find(Some(op), n, key.chars().next().unwrap()));
                        true
                    } else if matches!(key, ";" | ",") {
                        self.repeat_find(Some(op), key == ",", n);
                        true
                    } else {
                        self.operator_motion(
                            op,
                            key,
                            if key == "G" && !counted {
                                usize::MAX
                            } else {
                                n
                            },
                        )
                    }
                }
                Pending::Object(op, n, around) => {
                    if let Some(range) = self.counted_object(key, around, n.saturating_mul(count)) {
                        self.apply(op, range, key == "p");
                    }
                    true
                }
                Pending::OperatorGo(op, n) => {
                    if key == "g" {
                        self.operator_motion(op, "gg", n)
                    } else {
                        false
                    }
                }
                Pending::VisualObject(around) => {
                    if let Some(range) = self.object(key, around) {
                        self.selection = Some(range.start);
                        self.cursor = if range.is_empty() {
                            range.start
                        } else {
                            self.prev(range.end)
                        };
                    }
                    true
                }
            };
        }
        if let Some(op) = operator(key) {
            if let Some(range) = self.selection() {
                self.apply(op, range, self.mode == Mode::VLine);
            } else {
                self.pending = Some(Pending::Operator(op, explicit_count));
            }
            return true;
        }
        if self.selection.is_some() && matches!(key, "i" | "a") {
            self.pending = Some(Pending::VisualObject(key == "a"));
            return true;
        }
        if matches!(key, "f" | "t" | "F" | "T") {
            self.pending = Some(Pending::Find(None, count, key.chars().next().unwrap()));
            return true;
        }
        if matches!(key, ";" | ",") {
            self.repeat_find(None, key == ",", count);
            return true;
        }
        if let Some(pos) = self.motion(
            key,
            if key == "G" && explicit_count == 0 {
                usize::MAX
            } else {
                count
            },
        ) {
            self.cursor = pos;
            return true;
        }
        match key {
            "g" => self.pending = Some(Pending::Go(count)),
            "v" | "V" => {
                let mode = if key == "v" {
                    Mode::Visual
                } else {
                    Mode::VLine
                };
                if self.mode == mode {
                    self.mode = Mode::Normal;
                    self.selection = None;
                } else {
                    self.selection.get_or_insert(self.cursor);
                    self.mode = mode;
                }
            }
            "i" | "a" | "I" | "A" | "o" | "O" => {
                match key {
                    "a" => self.cursor = self.next(self.cursor).min(self.line_end(self.cursor)),
                    "A" => self.cursor = self.line_end(self.cursor),
                    "I" => {
                        self.cursor = self.line_start(self.cursor);
                        while matches!(self.char_at(self.cursor), Some(' ' | '\t')) {
                            self.cursor = self.next(self.cursor);
                        }
                    }
                    "o" => {
                        self.cursor = self.line_end(self.cursor);
                        self.text.insert(self.cursor, '\n');
                        self.cursor += 1;
                    }
                    "O" => {
                        self.cursor = self.line_start(self.cursor);
                        self.text.insert(self.cursor, '\n');
                    }
                    _ => {}
                }
                self.mode = Mode::Insert;
                self.selection = None;
            }
            "D" | "C" => self.apply(
                if key == "D" {
                    Operator::Delete
                } else {
                    Operator::Change
                },
                self.cursor..self.line_end(self.cursor),
                false,
            ),
            "x" => {
                let range = self.selection().unwrap_or_else(|| {
                    let mut end = self.cursor;
                    for _ in 0..count {
                        end = self.next(end).min(self.line_end(self.cursor));
                    }
                    self.cursor..end
                });
                self.apply(Operator::Delete, range, self.mode == Mode::VLine);
            }
            "p" | "P" => {
                for _ in 0..count {
                    self.put(key == "p");
                }
            }
            "J" => {
                for _ in 0..count {
                    self.join();
                }
            }
            _ => return false,
        }
        true
    }

    fn motion(&self, key: &str, count: usize) -> Option<usize> {
        if key == "gg" || key == "G" {
            return Some(self.line_number(count));
        }
        let mut pos = self.cursor;
        for _ in 0..count {
            pos = match key {
                "h" | "Left" => self.prev(pos).max(self.line_start(pos)),
                "l" | "Right" => self.next(pos).min(self.last_on_line(pos)),
                "j" | "Down" => self.vertical(pos, true),
                "k" | "Up" => self.vertical(pos, false),
                "w" | "W" => self.word_forward(pos, key == "W"),
                "b" | "B" => self.word_backward(pos, key == "B"),
                "e" | "E" => self.word_end(pos, key == "E"),
                "0" | "Home" => self.line_start(pos),
                "^" => {
                    let start = self.line_start(pos);
                    start + self.text[start..self.line_end(pos)].len()
                        - self.text[start..self.line_end(pos)].trim_start().len()
                }
                "$" | "End" => self.last_on_line(pos),
                "gg" => 0,
                "G" => self.line_start(self.text.len()),
                _ => return None,
            };
        }
        Some(pos)
    }
    fn line_number(&self, count: usize) -> usize {
        self.text
            .match_indices('\n')
            .map(|(p, _)| p + 1)
            .take(count.saturating_sub(1))
            .last()
            .unwrap_or(0)
    }

    fn repeat_find(&mut self, op: Option<Operator>, reverse: bool, count: usize) {
        if let Some((kind, target)) = self.last_find {
            let kind = if reverse {
                match kind {
                    'f' => 'F',
                    'F' => 'f',
                    't' => 'T',
                    _ => 't',
                }
            } else {
                kind
            };
            self.find_motion(op, kind, target, count, true);
        }
    }

    fn find_motion(
        &mut self,
        op: Option<Operator>,
        kind: char,
        target: char,
        count: usize,
        repeat: bool,
    ) {
        let forward = matches!(kind, 'f' | 't');
        let till = matches!(kind, 't' | 'T');
        let mut pos = self.cursor;
        if repeat && till {
            pos = if forward {
                self.next(pos)
            } else {
                self.prev(pos)
            };
        }
        for _ in 0..count {
            let found = if forward {
                let start = self.next(pos).min(self.line_end(pos));
                self.text[start..self.line_end(pos)]
                    .find(target)
                    .map(|p| start + p)
            } else {
                let start = self.line_start(pos);
                self.text[start..pos].rfind(target).map(|p| start + p)
            };
            let Some(found) = found else {
                return;
            };
            pos = found;
        }
        if till {
            pos = if forward {
                self.prev(pos)
            } else {
                self.next(pos)
            };
        }
        if let Some(op) = op {
            let range = if forward {
                self.cursor..self.next(pos)
            } else {
                pos..self.cursor
            };
            self.apply(op, range, false);
        } else {
            self.cursor = pos;
        }
    }

    fn vertical(&self, pos: usize, down: bool) -> usize {
        let start = self.line_start(pos);
        let column = self.text[start..pos].chars().count();
        let target = if down {
            let end = self.line_end(pos);
            if end == self.text.len() {
                return pos;
            }
            end + 1
        } else {
            if start == 0 {
                return pos;
            }
            self.line_start(start - 1)
        };
        let end = self.line_end(target);
        let desired = self.text[target..end]
            .char_indices()
            .nth(column)
            .map_or(end, |(p, _)| p + target);
        if self.mode == Mode::Insert {
            desired
        } else {
            desired.min(self.last_on_line(target))
        }
    }
    fn word_forward(&self, mut pos: usize, big: bool) -> usize {
        let class = word_class(self.char_at(pos), big);
        while pos < self.text.len() && word_class(self.char_at(pos), big) == class {
            pos = self.next(pos);
        }
        while pos < self.text.len() && word_class(self.char_at(pos), big) == 0 {
            pos = self.next(pos);
        }
        pos
    }
    fn word_backward(&self, mut pos: usize, big: bool) -> usize {
        pos = self.prev(pos);
        while pos > 0 && word_class(self.char_at(pos), big) == 0 {
            pos = self.prev(pos);
        }
        let class = word_class(self.char_at(pos), big);
        while pos > 0 && word_class(self.char_at(self.prev(pos)), big) == class {
            pos = self.prev(pos);
        }
        pos
    }
    fn word_end(&self, mut pos: usize, big: bool) -> usize {
        pos = self.next(pos);
        while pos < self.text.len() && word_class(self.char_at(pos), big) == 0 {
            pos = self.next(pos);
        }
        let class = word_class(self.char_at(pos), big);
        while self.next(pos) < self.text.len()
            && word_class(self.char_at(self.next(pos)), big) == class
        {
            pos = self.next(pos);
        }
        pos
    }
    fn operator_motion(&mut self, op: Operator, key: &str, count: usize) -> bool {
        let motion_key = if op == Operator::Change
            && matches!(key, "w" | "W")
            && word_class(self.char_at(self.cursor), false) != 0
        {
            if key == "w" { "e" } else { "E" }
        } else {
            key
        };
        // cw includes the current word even when the cursor is already on its final scalar.
        let destination = if op == Operator::Change
            && matches!(key, "w" | "W")
            && count == 1
            && word_class(self.char_at(self.cursor), key == "W") != 0
        {
            let mut end = self.cursor;
            let class = word_class(self.char_at(end), key == "W");
            while self.next(end) < self.text.len()
                && word_class(self.char_at(self.next(end)), key == "W") == class
            {
                end = self.next(end);
            }
            Some(end)
        } else {
            self.motion(motion_key, count)
        };
        let Some(destination) = destination else {
            return false;
        };
        let linewise = matches!(key, "j" | "k" | "G" | "gg");
        let start = self.cursor.min(destination);
        let end = self.cursor.max(destination);
        let range = if linewise {
            self.line_start(start)..self.after_line(end)
        } else if matches!(motion_key, "e" | "E" | "$") {
            start..self.next(end)
        } else {
            start..end
        };
        self.apply(op, range, linewise);
        true
    }

    fn apply(&mut self, op: Operator, mut range: Range<usize>, linewise: bool) {
        let original_cursor = self.cursor;
        self.register = Register {
            text: self.text[range.clone()].to_owned(),
            linewise,
        };
        if linewise && !self.register.text.ends_with('\n') {
            self.register.text.push('\n');
        }
        self.selection = None;
        self.mode = Mode::Normal;
        if op == Operator::Yank {
            self.cursor = original_cursor;
            return;
        }
        if linewise
            && op == Operator::Change
            && range.end > range.start
            && self.text[..range.end].ends_with('\n')
        {
            range.end -= 1;
        } else if linewise
            && op == Operator::Delete
            && range.end == self.text.len()
            && range.start > 0
            && !self.text.ends_with('\n')
        {
            range.start -= 1;
        }
        self.cursor = range.start;
        self.text.replace_range(range, "");
        if op == Operator::Change {
            self.mode = Mode::Insert;
        }
    }
    fn put(&mut self, after: bool) {
        if self.register.text.is_empty() {
            return;
        }
        let mut text = self.register.text.clone();
        if let Some(range) = self.selection() {
            let start = range.start;
            self.text.replace_range(range, &text);
            self.selection = None;
            self.mode = Mode::Normal;
            self.cursor = start;
            return;
        }
        if self.register.linewise {
            let pos = if after {
                self.after_line(self.cursor)
            } else {
                self.line_start(self.cursor)
            };
            if after
                && pos == self.text.len()
                && !self.text.is_empty()
                && !self.text.ends_with('\n')
            {
                text.pop();
                text.insert(0, '\n');
                self.cursor = pos + 1;
            } else {
                self.cursor = pos;
            }
            self.text.insert_str(pos, &text);
        } else {
            let pos = if after {
                self.next(self.cursor).min(self.line_end(self.cursor))
            } else {
                self.cursor
            };
            self.text.insert_str(pos, &text);
            self.cursor = self.prev(pos + text.len());
        }
    }
    fn join(&mut self) {
        let end = self.line_end(self.cursor);
        if end == self.text.len() {
            return;
        }
        let mut next = end + 1;
        while matches!(self.char_at(next), Some(' ' | '\t')) {
            next = self.next(next);
        }
        let separator = if end == self.line_start(self.cursor)
            || self.text[..end].ends_with(char::is_whitespace)
            || next == self.text.len()
        {
            ""
        } else {
            " "
        };
        self.text.replace_range(end..next, separator);
        self.cursor = end;
    }

    fn counted_object(&mut self, key: &str, around: bool, count: usize) -> Option<Range<usize>> {
        if !matches!(key, "w" | "W" | "s" | "p") {
            return self.object_depth(key, around, count);
        }
        let mut range = self.object(key, around)?;
        let cursor = self.cursor;
        if matches!(key, "w" | "W" | "s" | "p") {
            for _ in 1..count.min(10_000) {
                let mut pos = range.end;
                while pos < self.text.len() && self.char_at(pos).is_some_and(char::is_whitespace) {
                    pos = self.next(pos);
                }
                if pos == self.text.len() {
                    break;
                }
                self.cursor = pos;
                if let Some(next) = self.object(key, around) {
                    range.end = next.end;
                } else {
                    break;
                }
            }
        }
        self.cursor = cursor;
        Some(range)
    }

    fn object(&self, key: &str, around: bool) -> Option<Range<usize>> {
        self.object_depth(key, around, 1)
    }

    fn object_depth(&self, key: &str, around: bool, count: usize) -> Option<Range<usize>> {
        if key == "s" {
            let mut start = 0;
            while start < self.text.len() {
                while self.char_at(start).is_some_and(char::is_whitespace) {
                    start = self.next(start);
                }
                let mut end = start;
                while end < self.text.len() {
                    let c = self.char_at(end).unwrap();
                    end = self.next(end);
                    if matches!(c, '.' | '!' | '?') {
                        while matches!(self.char_at(end), Some('"' | '\'' | ')' | ']')) {
                            end = self.next(end);
                        }
                        if self.char_at(end).is_none_or(char::is_whitespace) {
                            break;
                        }
                    }
                    if c == '\n' && self.char_at(end) == Some('\n') {
                        break;
                    }
                }
                let mut after = end;
                while self.char_at(after).is_some_and(char::is_whitespace) {
                    after = self.next(after);
                }
                if self.cursor < after || after == self.text.len() {
                    if around {
                        if after > end {
                            end = after;
                        } else {
                            while start > 0
                                && self
                                    .char_at(self.prev(start))
                                    .is_some_and(char::is_whitespace)
                            {
                                start = self.prev(start);
                            }
                        }
                    }
                    return Some(start..end);
                }
                start = after;
            }
            return None;
        }
        if key == "w" || key == "W" {
            if self.text.is_empty() {
                return None;
            }
            let big = key == "W";
            let class = word_class(self.char_at(self.cursor), big);
            let mut start = self.cursor;
            let mut end = self.next(self.cursor);
            while start > 0 && word_class(self.char_at(self.prev(start)), big) == class {
                start = self.prev(start);
            }
            while end < self.text.len() && word_class(self.char_at(end), big) == class {
                end = self.next(end);
            }
            if around {
                let old_end = end;
                while end < self.text.len() && matches!(self.char_at(end), Some(' ' | '\t')) {
                    end = self.next(end);
                }
                if end == old_end {
                    while start > 0 && matches!(self.char_at(self.prev(start)), Some(' ' | '\t')) {
                        start = self.prev(start);
                    }
                }
            }
            return Some(start..end);
        }
        if key == "p" {
            let mut start = self.line_start(self.cursor);
            let blank = |pos| {
                self.text[self.line_start(pos)..self.line_end(pos)]
                    .trim()
                    .is_empty()
            };
            while start > 0 && !blank(start - 1) {
                start = self.line_start(start - 1);
            }
            let mut end = self.after_line(self.cursor);
            while end < self.text.len() && !blank(end) {
                end = self.after_line(end);
            }
            if around {
                while end < self.text.len() && blank(end) {
                    end = self.after_line(end);
                }
            }
            return Some(start..end);
        }
        let pairs: &[(char, char)] = match key {
            "\"" => &[('"', '"')],
            "'" => &[('\'', '\'')],
            "`" => &[('`', '`')],
            "q" => &[('"', '"'), ('\'', '\''), ('`', '`')],
            "(" | ")" => &[('(', ')')],
            "[" | "]" => &[('[', ']')],
            "{" | "}" => &[('{', '}')],
            "b" => &[('(', ')'), ('[', ']'), ('{', '}')],
            _ => return None,
        };
        let mut candidates = Vec::new();
        for &(open, close) in pairs {
            let mut stack = Vec::new();
            let mut escaped = false;
            for (pos, c) in self.text.char_indices() {
                if escaped {
                    escaped = false;
                    continue;
                }
                if c == '\\' {
                    escaped = true;
                    continue;
                }
                if open == close && c == open {
                    if let Some(start) = stack.pop() {
                        candidates.push(start..pos + c.len_utf8());
                    } else {
                        stack.push(pos);
                    }
                } else if c == open {
                    stack.push(pos);
                } else if c == close
                    && let Some(start) = stack.pop()
                {
                    candidates.push(start..pos + c.len_utf8());
                }
            }
        }
        candidates.retain(|r| r.start <= self.cursor && self.cursor < r.end);
        candidates.sort_by_key(|r| r.end - r.start);
        let range = candidates.into_iter().nth(count.saturating_sub(1))?;
        Some(if around {
            range
        } else {
            self.next(range.start)..self.prev(range.end)
        })
    }
}

// Markdown continuation keeps indentation, increments ordered markers, and resets tasks.
fn list_continuation(line: &str) -> String {
    let body = line.trim_start_matches([' ', '\t']);
    let indent = &line[..line.len() - body.len()];
    let (marker, rest) =
        if body.starts_with(['-', '*', '+']) && body.as_bytes().get(1) == Some(&b' ') {
            (body[..2].to_owned(), &body[2..])
        } else {
            let digits = body.bytes().take_while(u8::is_ascii_digit).count();
            if digits == 0
                || !matches!(body.as_bytes().get(digits), Some(b'.' | b')'))
                || body.as_bytes().get(digits + 1) != Some(&b' ')
            {
                return String::new();
            }
            let Ok(number) = body[..digits].parse::<u64>() else {
                return String::new();
            };
            (
                format!("{}{} ", number.saturating_add(1), &body[digits..digits + 1]),
                &body[digits + 2..],
            )
        };
    let task = if rest.starts_with("[ ] ") || rest.starts_with("[x] ") || rest.starts_with("[X] ") {
        "[ ] "
    } else {
        ""
    };
    format!("{indent}{marker}{task}")
}

fn word_class(c: Option<char>, big: bool) -> u8 {
    match c {
        None => 0,
        Some(c) if c.is_whitespace() => 0,
        Some(c) if big || c.is_alphanumeric() || c == '_' => 1,
        Some(_) => 2,
    }
}
fn operator(key: &str) -> Option<Operator> {
    match key {
        "d" => Some(Operator::Delete),
        "c" => Some(Operator::Change),
        "y" => Some(Operator::Yank),
        _ => None,
    }
}
fn canonical(key: &str) -> &str {
    match key {
        "<Esc>" | "Escape" | "C-[" | "Ctrl-[" => "Esc",
        "<CR>" | "Return" => "Enter",
        "<BS>" | "BS" => "Backspace",
        "Ctrl-r" | "<C-r>" => "C-r",
        "Ctrl-w" | "<C-w>" => "C-w",
        "Ctrl-u" | "<C-u>" => "C-u",
        "<Tab>" => "Tab",
        _ => key,
    }
}
