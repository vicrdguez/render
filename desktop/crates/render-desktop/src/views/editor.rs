use super::*;
use crate::screen::ComposeKind;
use rune::row;

pub(super) fn composer(s: &AppState, width: f32) -> El {
    let t = s.theme;
    let mut text = s
        .composer
        .as_ref()
        .map(|c| c.editor.text().to_owned())
        .unwrap_or_else(|| s.draft_text(DraftKind::Prompt));
    let insert = s
        .composer
        .as_ref()
        .is_some_and(|c| c.editor.mode() == render_editor::Mode::Insert);
    let mut cursor = s.composer.as_ref().map_or(0, |c| c.editor.cursor());
    let mut selection = s.composer.as_ref().and_then(|c| c.editor.selection());
    // OS selection offsets are UTF-8 bytes. Clamp malformed offsets down to a
    // boundary before mapping them into the transient, shaped display string.
    let mut marked = None;
    let mut marked_selection = None;
    if let Some((preedit, range)) = s
        .composer
        .as_ref()
        .and_then(|c| c.preedit.as_ref())
        .filter(|(text, _)| !text.is_empty())
    {
        let start = cursor;
        let boundary = |byte: usize| {
            let mut byte = byte.min(preedit.len());
            while !preedit.is_char_boundary(byte) {
                byte -= 1;
            }
            byte
        };
        marked = Some(start..start + preedit.len());
        if let Some(range) = range {
            let a = boundary(range.start);
            let b = boundary(range.end);
            marked_selection = Some(start + a.min(b)..start + a.max(b));
            cursor = start + b;
        } else {
            cursor = start + preedit.len();
        }
        text.insert_str(start, preedit);
        selection = None;
    }
    let inner_width = (width - 24.0).max(40.0);
    let font = style(14.0, 21.0, 400.0);
    // Use the same native shaper, bundled fonts and wrapping policy as the drawn text.
    // Cluster ranges are immutable UTF-8 byte offsets, not scalar counts.
    thread_local! {
        static TEXT: std::cell::RefCell<rune::text::TextSystem> =
            std::cell::RefCell::new(rune::text::TextSystem::new(crate::fonts::FONTS, ("Iosevka Etoile", "Iosevka")));
    }
    let layout = TEXT.with(|ts| {
        ts.borrow_mut().layout_rich_with(
            &text,
            &[],
            font,
            1.0,
            Some(inner_width),
            rune::text::RichLayoutOptions::new().wrap_anywhere(),
        )
    });
    let height = rune::text::layout_height(&layout, font, 1.0).max(21.0);
    let mut canvas = el().size(inner_width, height);
    let mut caret = (0.0, 0.0, 7.0);
    let mut box_index = 0;
    let mut mark_index = 0;
    let mut marked_selection_index = 0;
    for line in layout.lines() {
        let y = line.metrics().block_min_coord;
        for run in line.runs() {
            for cluster in run.visual_clusters() {
                let range = cluster.text_range();
                let x = cluster.visual_offset().unwrap_or(0.0);
                let advance = cluster.advance().max(2.0);
                if range.contains(&cursor) {
                    caret = (if cluster.is_rtl() { x + advance } else { x }, y, advance);
                } else if cursor == text.len() && range.end == cursor {
                    caret = (if cluster.is_rtl() { x } else { x + advance }, y, 7.0);
                }
                if marked_selection
                    .as_ref()
                    .is_some_and(|r| r.start < range.end && r.end > range.start)
                {
                    canvas = canvas.child(
                        el().key(format!("editor.preedit-selection.{marked_selection_index}"))
                            .absolute(x, y)
                            .size(advance, 21.0)
                            .fill(t.token("surface.cursor.read")),
                    );
                    marked_selection_index += 1;
                }
                if marked
                    .as_ref()
                    .is_some_and(|r| r.start < range.end && r.end > range.start)
                {
                    canvas = canvas.child(
                        el().key(format!("editor.preedit.{mark_index}"))
                            .absolute(x, y + 19.0)
                            .size(advance, 1.0)
                            .fill(t.token("fg.default")),
                    );
                    mark_index += 1;
                }
                if selection
                    .as_ref()
                    .is_some_and(|r| r.start < range.end && r.end > range.start)
                {
                    canvas = canvas.child(
                        el().key(format!("editor.selection.{box_index}"))
                            .absolute(x, y)
                            .size(advance, 21.0)
                            .fill(t.token("surface.cursor.read")),
                    );
                    box_index += 1;
                }
            }
        }
        if line.text_range().start == cursor && line.text_range().is_empty() {
            caret = (0.0, y, 7.0);
        }
    }
    let reveal_y = (caret.1 + 21.0 - 168.0).max(0.0);
    if s.composer.is_some() && !insert {
        canvas = canvas.child(
            el().key("editor.caret")
                .absolute(caret.0, caret.1)
                .size(caret.2, 21.0)
                .fill(t.token("surface.cursor.side"))
                .on_layout_tx(move |_: &mut AppState, _, tx| {
                    tx.scroll_to_y("editor.viewport", reveal_y);
                    tx.live_only();
                }),
        );
    }
    canvas = canvas.child(
        rune::text(&text)
            .font(font)
            .color(t.token("fg.default"))
            .w(inner_width)
            .wrap_anywhere()
            .absolute(0.0, 0.0),
    );
    if insert {
        canvas = canvas.child(
            el().key("editor.caret")
                .absolute(caret.0, caret.1)
                .size(2.0, 21.0)
                .fill(t.token("state.attn"))
                .ime_cursor()
                .on_layout_tx(move |_: &mut AppState, _, tx| {
                    tx.scroll_to_y("editor.viewport", reveal_y);
                    tx.live_only();
                }),
        );
    }
    // Keep the active line inside an eight-row local viewport. Native scrolling remains
    // available for inspecting earlier lines; cursor movement reveals the caret again.
    let viewport = el()
        .key("editor.viewport")
        .size(inner_width, height.min(168.0))
        .scroll(rune::ScrollSpec {
            stick_bottom: false,
        })
        .child(canvas);
    let context = s
        .composer
        .as_ref()
        .map(|c| match c.kind {
            ComposeKind::Note => format!(
                "note on {} · local",
                c.note
                    .as_ref()
                    .and_then(|n| n.anchor.node.as_deref())
                    .unwrap_or("paragraph")
            ),
            ComposeKind::Decision => "your answer · local".into(),
            ComposeKind::Chat => "message · local".into(),
            _ => "local".into(),
        })
        .unwrap_or_else(|| "local".into());
    let mut body = col()
        .gap(8.0)
        .w(width)
        .padding(12.0)
        .fill(t.token("surface.side"))
        .border(1.0, t.token("border.strong"))
        .child(small(
            if insert {
                format!("{context} · editing")
            } else {
                format!("{context} draft · press Insert to edit")
            },
            t,
        ))
        .child(viewport);
    if insert {
        body = body.child(
            row()
                .gap(5.0)
                .child(
                    chip(
                        "Esc",
                        t,
                        s.modal.is_none() && !s.which_key && s.hints.is_none(),
                    )
                    .on_press_tx(|s: &mut AppState, tx| {
                        if s.modal.is_none() && !s.which_key && s.hints.is_none() {
                            crate::on_key(s, &rune::Key::Escape.into(), tx);
                        }
                    }),
                )
                .child(
                    small(
                        if s.composer
                            .as_ref()
                            .is_some_and(|c| c.kind == ComposeKind::Decision)
                        {
                            "jk leave Insert · stays on this device until you answer"
                        } else if s
                            .composer
                            .as_ref()
                            .is_some_and(|c| c.kind == ComposeKind::Chat)
                        {
                            "jk leave Insert · stays on this device until you send"
                        } else {
                            "jk leave Insert · stays on this device until you save"
                        },
                        t,
                    )
                    .wrap()
                    .shrink(),
                ),
        );
        if matches!(s.composer.as_ref().map(|c| c.kind), Some(ComposeKind::Chat)) {
            body = body.child(
                row()
                    .gap(5.0)
                    .child(command_chip(s, "⌘⏎", "chat.send"))
                    .child(small("sends", t))
                    .child(command_chip(s, "M-⏎", "chat.followup"))
                    .child(small("follow-up", t)),
            );
        }
    }
    if !insert
        && s.composer
            .as_ref()
            .is_some_and(|c| c.kind == ComposeKind::Note)
    {
        body = body.child(small(":w save set · Space mn another note · Esc reader", t).wrap());
    }
    if s.composer
        .as_ref()
        .is_some_and(|c| c.kind != ComposeKind::Chat)
    {
        body = body.on_layout_tx(|_: &mut AppState, _, tx| {
            tx.scroll_into_view("editor.composer");
            tx.live_only();
        });
    }
    body.key("editor.composer")
}
