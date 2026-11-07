use crate::{
    AppState, Screen,
    screen::{ComposeKind, Modal},
};
use render_keymap::{Availability, Resolution};
use rune::{Key, KeyEvent, Tx};
use std::time::Duration;

pub fn on_key(s: &mut AppState, event: &KeyEvent, tx: &mut Tx) -> bool {
    tx.instant();
    s.last_key = s.now;
    s.last_input = Some(s.moment());
    s.dirty = true;
    // A new user action supersedes a save-first continuation; it must not retarget it.
    if s.modal.is_none() {
        s.pending_authority = None;
    }
    // Editor input must not pass through the reader's leader/keymap grammar.
    if s.composer.is_some() && s.modal.is_none() && s.hints.is_none() {
        let reader_command = s.composer.as_ref().is_some_and(|c| {
            c.kind == ComposeKind::Note
                && c.editor.mode() == render_editor::Mode::Normal
                && c.editor.pending_operator().is_none()
        }) && !event.mods.ctrl
            && !event.mods.cmd
            && !event.mods.alt
            && matches!(&event.key, Key::Text(text) if text == " " || text == ":");
        if reader_command {
            s.finish_composer();
        } else {
            return composer_key(s, event, tx);
        }
    }
    let key = key_name(event);
    if matches!(s.modal, Some(Modal::Readback)) {
        return s.readback_key(&key, event, tx);
    }
    if s.modal.is_some() {
        return modal_key(s, &key, event, tx);
    }
    if s.hints.is_some() {
        if matches!(key.as_str(), "<Esc>" | "<C-c>") {
            s.hints = None;
            s.hint_prefix.clear();
            return true;
        }
        if key == "<BS>" {
            s.hint_prefix.pop();
            return true;
        }
        if key.chars().count() != 1 {
            return true;
        }
        let prefix = format!("{}{key}", s.hint_prefix);
        if let Some(hints) = &s.hints {
            if let Some((_, id)) = hints.iter().find(|(label, _)| label == &prefix) {
                let id = id.clone();
                s.remember_jump();
                if s.screen().work() {
                    if let Some(byte) = id.strip_prefix("byte:").and_then(|b| b.parse().ok()) {
                        s.reader_seek(byte);
                    }
                } else {
                    s.select_id(&id);
                }
                s.remember_jump();
                s.reveal_cursor(tx);
                s.hints = None;
                s.hint_prefix.clear();
            } else if hints.iter().any(|(label, _)| label.starts_with(&prefix)) {
                s.hint_prefix = prefix;
            }
        }
        return true;
    }
    if key == "<Esc>" || key == "<C-c>" {
        s.pending.clear();
        s.count.clear();
        s.which_key = false;
        s.operator = None;
        s.reader_motion(&["Esc".into()]);
        s.visual = false;
        s.sequence_pin = None;
        return true;
    }
    if let Some(op) = s.operator.clone() {
        if key.chars().count() != 1 {
            s.operator = None;
            s.pending.clear();
            s.count.clear();
            return true;
        }
        s.pending.push_str(&key);
        let operand = s.pending.strip_prefix(&op).unwrap_or(&s.pending);
        let tokens = format!("{}{operand}", s.count)
            .chars()
            .map(|c| c.to_string())
            .collect::<Vec<_>>();
        let waiting = key.chars().all(|c| c.is_ascii_digit())
            || matches!(key.as_str(), "i" | "a" | "f" | "F" | "t" | "T" | "g")
                && (tokens.len() == 1
                    || tokens[..tokens.len() - 1]
                        .iter()
                        .all(|t| t.chars().all(|c| c.is_ascii_digit())));
        if waiting {
            return true;
        }
        let anchor = s.reader_operator(&op, &tokens);
        s.operator = None;
        s.pending.clear();
        s.count.clear();
        if let Some(anchor) = anchor {
            if op == "c" || op == "gc" {
                s.start_note_at(anchor);
            } else {
                tx.copy(anchor.quote);
                s.message("Copied exact source range");
            }
        } else {
            s.message("No readable range for that operator");
        }
        return true;
    }
    let reader = matches!(
        s.screen(),
        Screen::Review
            | Screen::Diff
            | Screen::Dispositions
            | Screen::Chat
            | Screen::Proposal
            | Screen::LocalPrompt
    );
    if matches!(s.pending.as_str(), "m" | "'" | "`") && key.chars().count() == 1 {
        let prefix = std::mem::take(&mut s.pending);
        let ch = key.chars().next().unwrap();
        if prefix == "m" {
            s.set_mark(ch);
        } else {
            s.jump_to_mark(ch, prefix == "`");
        }
        return true;
    }
    if reader && s.visual && matches!(s.pending.as_str(), "i" | "a") {
        let prefix = std::mem::take(&mut s.pending);
        s.reader_motion(&[prefix, key]);
        s.reveal_cursor(tx);
        return true;
    }
    if reader && matches!(s.pending.as_str(), "f" | "F" | "t" | "T") {
        let prefix = std::mem::take(&mut s.pending);
        let mut tokens = s.count.chars().map(|c| c.to_string()).collect::<Vec<_>>();
        tokens.extend([prefix, key]);
        s.reader_motion(&tokens);
        s.count.clear();
        s.reveal_cursor(tx);
        return true;
    }
    if s.pending.is_empty() {
        if matches!(key.as_str(), "m" | "'" | "`")
            || reader
                && (matches!(key.as_str(), "f" | "F" | "t" | "T")
                    || s.visual && matches!(key.as_str(), "i" | "a"))
        {
            s.pending = key;
            return true;
        }
        if key.len() == 1
            && key.chars().all(|c| c.is_ascii_digit())
            && (key != "0" || !s.count.is_empty())
        {
            s.count.push_str(&key);
            return true;
        }
        if reader
            && matches!(
                key.as_str(),
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
                    | "G"
                    | "{"
                    | "}"
                    | "("
                    | ")"
                    | ";"
                    | ","
                    | "v"
                    | "V"
                    | "<Left>"
                    | "<Right>"
                    | "<Up>"
                    | "<Down>"
            )
        {
            let mut tokens = s.count.chars().map(|c| c.to_string()).collect::<Vec<_>>();
            tokens.push(key.trim_matches(['<', '>']).to_owned());
            s.reader_motion(&tokens);
            s.count.clear();
            s.reveal_cursor(tx);
            return true;
        }
        let count = s.count.parse::<usize>().unwrap_or(1).min(10000);
        let step = match key.as_str() {
            "j" | "<Down>" => Some(count as isize),
            "k" | "<Up>" => Some(-(count as isize)),
            "<C-d>" | "<PageDown>" => Some(12),
            "<C-u>" | "<PageUp>" => Some(-12),
            _ => None,
        };
        if let Some(step) = step {
            s.move_cursor(step, tx);
            s.count.clear();
            return true;
        }
        if key == "G" {
            s.tab_mut().cursor = s.cursor_limit().saturating_sub(1);
            s.reveal_cursor(tx);
            return true;
        }
        if key == "v" || key == "V" {
            s.visual = !s.visual;
            return true;
        }
        if ["i", "a", "o", "I", "A", "O"].contains(&key.as_str()) {
            match s.screen() {
                Screen::Chat => s.start_composer(ComposeKind::Chat),
                Screen::Decision => s.start_composer(ComposeKind::Decision),
                Screen::Settings => s.start_composer(ComposeKind::Policy),
                Screen::Review => s.start_composer(ComposeKind::Note),
                _ => {
                    s.message("No editable field on this view");
                }
            }
            return true;
        }
        if key == "l" && !s.screen().work() {
            s.open_selected();
            return true;
        }
    }
    if s.pending == "g" && key == "g" {
        s.pending.clear();
        s.which_key = false;
        if reader {
            s.reader_motion(&["g".into(), "g".into()]);
        } else {
            s.tab_mut().cursor = 0;
        }
        s.reveal_cursor(tx);
        return true;
    }
    if s.pending == "z"
        && matches!(
            key.as_str(),
            "z" | "t" | "b" | "l" | "h" | "o" | "c" | "R" | "M"
        )
    {
        s.pending.clear();
        s.which_key = false;
        s.expanded = matches!(key.as_str(), "o" | "R");
        s.reveal_cursor(tx);
        return true;
    }
    if s.pending.is_empty() {
        s.pin_input_target();
    }
    s.pending.push_str(&key);
    let mode = if s.visual { "v" } else { "n" };
    let resolved = s.keymap.resolve(mode, s.context(), &s.pending);
    match resolved {
        Resolution::Prefix => {
            s.prefix_at = s.now;
            s.which_key = false;
            tx.wake_after(Duration::from_millis(300));
        }
        Resolution::Exact(found) => {
            s.last_binding = s.pending.clone();
            let id = found.command.id.clone();
            let kind = found.command.kind;
            let availability = found.availability.clone();
            let countable = found.command.countable;
            s.pending.clear();
            s.which_key = false;
            if !s.count.is_empty() && !countable {
                s.message("Count not allowed for this command");
                s.count.clear();
                return true;
            }
            if let Availability::Unavailable(reason) = availability {
                s.message(reason);
                return true;
            }
            if kind == render_keymap::Kind::Operator {
                s.operator = Some(if id == "annotate" {
                    "c".into()
                } else {
                    "y".into()
                });
                s.pending = s.operator.clone().unwrap();
                if s.visual {
                    let op = s.operator.take().unwrap();
                    if let Some(anchor) = s.reader_operator(&op, &[]) {
                        if op == "c" {
                            s.start_note_at(anchor);
                        } else {
                            tx.copy(anchor.quote);
                        }
                    }
                    s.pending.clear();
                    s.count.clear();
                }
            } else {
                s.command(&id, tx);
                s.count.clear();
            }
        }
        Resolution::NoMatch => {
            if ["g", "z", "[", "]"].contains(&s.pending.as_str()) {
                s.prefix_at = s.now;
                tx.wake_after(Duration::from_millis(300));
            } else {
                s.message(format!(
                    "No binding for {}",
                    s.pending.replace("<leader>", "Space ")
                ));
                s.pending.clear();
                s.which_key = false;
                s.count.clear();
            }
        }
    }
    true
}

fn composer_key(s: &mut AppState, event: &KeyEvent, tx: &mut Tx) -> bool {
    let composer = s.composer.as_ref().unwrap();
    let normal = composer.editor.mode() == render_editor::Mode::Normal;
    let unmodified = !event.mods.ctrl && !event.mods.cmd && !event.mods.alt;
    if normal
        && unmodified
        && (matches!(event.key, Key::Escape)
            || matches!(&event.key, Key::Text(t) if t == "q")
                && composer.editor.pending_operator().is_none())
    {
        s.finish_composer();
        return true;
    }
    if composer.kind == ComposeKind::Chat
        && matches!(event.key, Key::Enter)
        && !event.mods.ctrl
        && (normal || event.mods.cmd || event.mods.alt)
    {
        s.pin_input_target();
        s.send_chat(event.mods.alt && !event.mods.cmd, tx);
        return true;
    }
    let composer = s.composer.as_mut().unwrap();
    let outcome = if let Key::Text(text) = &event.key
        && !event.mods.ctrl
        && !event.mods.cmd
    {
        if text.chars().count() == 1 {
            composer.editor.handle_key(text)
        } else {
            composer.editor.insert_text(text)
        }
    } else {
        let raw = match &event.key {
            Key::Text(text) => text.clone(),
            Key::Command(c) => c.to_string(),
            Key::Enter => "Enter".into(),
            Key::Escape => "Esc".into(),
            Key::Backspace => "Backspace".into(),
            Key::Delete => "Delete".into(),
            Key::Left => "Left".into(),
            Key::Right => "Right".into(),
            Key::Up => "Up".into(),
            Key::Down => "Down".into(),
            Key::Home => "Home".into(),
            Key::End => "End".into(),
            Key::Tab => "Tab".into(),
            _ => return true,
        };
        let modifier = if event.mods.cmd || matches!(event.key, Key::Command(_)) {
            "D-"
        } else if event.mods.ctrl {
            "C-"
        } else if event.mods.alt {
            "M-"
        } else {
            ""
        };
        composer.editor.handle_key(&format!("{modifier}{raw}"))
    };
    if outcome.text_changed {
        s.sync_composer();
    }
    true
}

fn modal_key(s: &mut AppState, key: &str, event: &KeyEvent, tx: &mut Tx) -> bool {
    if matches!(key, "<Esc>" | "<C-c>") {
        if matches!(s.modal, Some(Modal::SaveDrafts { .. })) {
            s.pending_authority = None;
        }
        s.modal = None;
        s.pending.clear();
        return true;
    }
    let modal = s.modal.clone().unwrap();
    if matches!(modal, Modal::Info { .. } | Modal::PolicyChanges { .. }) && float_scroll(key, tx) {
        return true;
    }
    match modal {
        Modal::Handover => match key {
            "j" => s.move_cursor(1, tx),
            "k" => s.move_cursor(-1, tx),
            "K" | "q" => s.modal = None,
            "<CR>" => {
                s.modal = None;
                s.open_selected();
            }
            "<leader>" => s.pending = "<leader>".into(),
            "n" if s.pending == "<leader>" => {
                s.modal = None;
                s.pending.clear();
                s.command("next.go", tx);
            }
            _ => {
                s.pending.clear();
            }
        },
        Modal::Ex(mut query) => {
            if key == "<CR>" {
                s.modal = None;
                s.ex(&query, tx);
            } else if key == "<BS>" {
                query.pop();
                s.modal = Some(Modal::Ex(query));
            } else if let Key::Text(text) = &event.key
                && !event.mods.ctrl
                && !event.mods.cmd
            {
                query.push_str(text);
                s.modal = Some(Modal::Ex(query));
            }
        }
        Modal::Picker {
            kind,
            mut query,
            mut selected,
        } => {
            let old_query = query.clone();
            match key {
                "<C-n>" | "<C-p>" => {
                    tx.scroll_page("picker.preview", if key == "<C-n>" { 1 } else { -1 });
                }
                "<C-l>" => {
                    s.export_picker();
                    return true;
                }
                "<C-j>" | "<Down>" => {
                    selected = selected.saturating_add(1).min(
                        crate::floats::picker_rows(s, kind, &query)
                            .len()
                            .saturating_sub(1),
                    )
                }
                "<C-k>" | "<Up>" => selected = selected.saturating_sub(1),
                "<CR>" => {
                    s.pick(kind, &query, selected, tx);
                    return true;
                }
                "<BS>" => {
                    query.pop();
                    selected = 0;
                }
                _ => {
                    if let Key::Text(text) = &event.key
                        && !event.mods.ctrl
                        && !event.mods.cmd
                    {
                        query.push_str(text);
                        selected = 0;
                    }
                }
            }
            if query != old_query {
                s.refresh_picker(kind, &query);
                tx.scroll_to_y("picker.preview", 0.0);
            }
            if let Some(session) = &mut s.picker_session {
                session.selected = selected.min(session.rows.len().saturating_sub(1));
                selected = session.selected;
            }
            s.modal = Some(Modal::Picker {
                kind,
                query,
                selected,
            });
            s.last_picker = s.modal.clone();
        }
        Modal::Filter { mut selected } => {
            let states = s.core.host.lifecycle_states.clone();
            match key {
                "q" => {
                    s.modal = None;
                    return true;
                }
                "j" => selected = (selected + 1).min(states.len().saturating_sub(1)),
                "k" => selected = selected.saturating_sub(1),
                "x" | "X" => {
                    if let Some(state) = states.get(selected) {
                        if key == "X" {
                            s.filters.clear();
                            s.filters.insert(state.state.clone());
                        } else if !s.filters.remove(&state.state) {
                            s.filters.insert(state.state.clone());
                        }
                        s.tab_mut().cursor = 0;
                    }
                }
                _ => {}
            }
            s.modal = Some(Modal::Filter { selected });
        }
        Modal::Url(url) => {
            if key == "y" && !tx.key_repeat() {
                s.open_url(&url, tx);
                s.modal = None;
            } else if key == "n" || key == "q" {
                s.modal = None;
            }
        }
        Modal::Outbox { mut selected } => {
            match key {
                "j" => selected = (selected + 1).min(s.core.local.outbox.len().saturating_sub(1)),
                "k" => selected = selected.saturating_sub(1),
                "q" => {
                    s.modal = None;
                    return true;
                }
                _ => {
                    s.pending.push_str(key);
                    if s.pending == "<leader>rq" {
                        s.recover(false, selected);
                        s.pending.clear();
                    } else if s.pending == "<leader>rt" {
                        s.recover(true, selected);
                        s.pending.clear();
                    } else if !["<leader>", "<leader>r"].contains(&s.pending.as_str()) {
                        s.pending.clear();
                    }
                }
            }
            s.modal = Some(Modal::Outbox { selected });
        }
        Modal::Info { .. } => {
            if key == "q" {
                s.modal = None;
            }
        }
        Modal::SaveDrafts { .. } => {
            if key == "y" && !tx.key_repeat() {
                s.modal = None;
                s.save_drafts(tx);
            } else if key == "n" || key == "q" {
                s.modal = None;
                s.pending_authority = None;
            }
        }
        Modal::ConfirmDiscard { object } => match key {
            "y" if !tx.key_repeat() => {
                let keys = s
                    .core
                    .local
                    .drafts
                    .keys()
                    .filter(|k| k.object == object)
                    .cloned()
                    .collect::<Vec<_>>();
                for key in keys {
                    if let Some(draft) = s.core.local.drafts.remove(&key) {
                        s.discarded.push((key, draft));
                    }
                }
                s.composer = s.composer.take().filter(|c| c.key.object != object);
                if let Some(index) = s
                    .tabs
                    .iter()
                    .position(|t| t.object.as_ref() == Some(&object))
                    && index > 0
                {
                    s.tabs.remove(index);
                    if s.active >= index {
                        s.active = s.active.saturating_sub(1);
                    }
                }
                s.modal = None;
                s.dirty = true;
                s.close_after_save = None;
                s.pending_authority = None;
            }
            "n" | "q" => s.modal = None,
            _ => {}
        },
        Modal::PolicyChanges { object } => match key {
            "d" if !tx.key_repeat() => {
                s.rebase_policy(&object);
            }
            "i" | "<CR>" => {
                s.modal = None;
                s.start_composer(ComposeKind::Policy);
            }
            "q" => s.modal = None,
            _ => {}
        },
        Modal::Diagram {
            source,
            mut zoom,
            mut pan,
        } => {
            match key {
                "q" | "<CR>" => {
                    s.modal = None;
                    return true;
                }
                "+" | "=" => zoom = (zoom * 1.2).min(2.0),
                "-" => zoom = (zoom / 1.2).max(0.2),
                "0" => {
                    zoom = 1.0;
                    pan = [0.0, 0.0];
                }
                "h" | "<Left>" => pan[0] -= 40.0,
                "l" | "<Right>" => pan[0] += 40.0,
                "k" | "<Up>" => pan[1] -= 40.0,
                "j" | "<Down>" => pan[1] += 40.0,
                _ => {}
            }
            s.modal = Some(Modal::Diagram { source, zoom, pan });
        }
        Modal::Readback => {}
    }
    true
}

pub(crate) fn float_scroll(key: &str, tx: &mut Tx) -> bool {
    match key {
        "j" | "<Down>" | "<C-d>" | "<PageDown>" => tx.scroll_page("float.scroll", 1),
        "k" | "<Up>" | "<C-u>" | "<PageUp>" => tx.scroll_page("float.scroll", -1),
        "G" => tx.scroll_to_bottom("float.scroll"),
        "g" => tx.scroll_to_y("float.scroll", 0.0),
        _ => return false,
    }
    true
}

pub fn key_name(event: &KeyEvent) -> String {
    let raw = match &event.key {
        Key::Text(t) => t.clone(),
        Key::Command(c) => c.to_string(),
        Key::Enter => "CR".into(),
        Key::Escape => "Esc".into(),
        Key::Backspace => "BS".into(),
        Key::Delete => "Delete".into(),
        Key::Up => "Up".into(),
        Key::Down => "Down".into(),
        Key::Left => "Left".into(),
        Key::Right => "Right".into(),
        Key::Tab => "Tab".into(),
        Key::PageUp => "PageUp".into(),
        Key::PageDown => "PageDown".into(),
        _ => "Unknown".into(),
    };
    let modifier = if event.mods.cmd || matches!(event.key, Key::Command(_)) {
        "D-"
    } else if event.mods.ctrl {
        "C-"
    } else if event.mods.alt && raw == "CR" {
        "M-"
    } else {
        ""
    };
    if raw == " " && modifier.is_empty() {
        "<leader>".into()
    } else if modifier.is_empty() && matches!(event.key, Key::Text(_)) {
        raw
    } else {
        format!("<{modifier}{raw}>")
    }
}
