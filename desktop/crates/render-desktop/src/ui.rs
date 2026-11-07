use render_content::{Theme, safe_text};
use rune::{Color, El, TextStyle, col, el, icon, row, text};

pub fn label(value: impl AsRef<str>, theme: Theme) -> El {
    text(safe_text(value.as_ref()))
        .font(style(13.0, 18.0, 400.0))
        .color(theme.token("fg.default"))
}
pub fn small(value: impl AsRef<str>, theme: Theme) -> El {
    label(value, theme)
        .font(style(12.0, 16.0, 400.0))
        .color(theme.token("fg.alt"))
}
pub fn mono(value: impl AsRef<str>, theme: Theme) -> El {
    label(value, theme).font(
        TextStyle::new(12.0, 400.0)
            .mono()
            .lh(16.0)
            .features("'liga' 0, 'calt' 0"),
    )
}
pub fn style(size: f32, height: f32, weight: f32) -> TextStyle {
    TextStyle::new(size, weight)
        .lh(height)
        .features("'liga' 0, 'calt' 0")
}
pub fn heading(value: impl AsRef<str>, theme: Theme) -> El {
    label(value, theme)
        .font(style(17.0, 24.0, 600.0))
        .color(theme.token("kind.literal"))
        .mt(18.0)
        .mb(6.0)
}
pub fn page_title(value: impl AsRef<str>, theme: Theme) -> El {
    label(value, theme)
        .font(style(22.0, 28.0, 700.0))
        .color(theme.token("content.h1"))
}
pub fn rule(theme: Theme) -> El {
    el().w_full().h(1.0).fill(theme.token("border.subtle"))
}
pub fn content_bar(value: &str, theme: Theme, width: f32, lines: usize) -> El {
    row()
        .gap(10.0)
        .w(width)
        .child(
            el().w(2.0)
                .self_stretch()
                .fill(theme.token("border.strong")),
        )
        .child(
            label(value, theme)
                .font(style(13.0, 19.0, 400.0))
                .w((width - 12.0).max(20.0))
                .wrap()
                .max_lines(lines),
        )
}
pub fn chip(value: &str, theme: Theme, active: bool) -> El {
    mono(value, theme)
        .font(TextStyle::new(11.5, 500.0).mono().lh(16.0))
        .px(4.0)
        .radius(2.0)
        .color(theme.token(if active { "kind.literal" } else { "fg.muted" }))
        .fill(theme.token("surface.bar"))
}
pub fn command_chip(s: &crate::AppState, label: &str, command: &'static str) -> El {
    let allowed = move |s: &crate::AppState| {
        !s.chrome_inert()
            || (matches!(command, "chat.send" | "chat.followup")
                && s.composer.is_some()
                && s.modal.is_none()
                && !s.which_key
                && s.hints.is_none())
    };
    chip(label, s.theme, allowed(s)).on_press_tx(move |s: &mut crate::AppState, tx| {
        if allowed(s) {
            s.command(command, tx);
            tx.instant();
        }
    })
}
pub fn field(name: &str, value: &str, theme: Theme, width: f32) -> El {
    row()
        .gap(12.0)
        .w(width)
        .child(small(name, theme).w(104.0).color(theme.token("kind.you")))
        .child(label(value, theme).w((width - 116.0).max(20.0)).wrap())
}
pub fn selected(body: El, theme: Theme, selected: bool, focused: bool) -> El {
    if !selected {
        return body;
    }
    el().fill(theme.token("surface.cursor.read"))
        .child(body)
        .child(el().absolute(0.0, 0.0).w(2.0).h_full().fill(if focused {
            theme.token("state.attn")
        } else {
            Color::TRANSPARENT
        }))
}
/// Reveal a semantic record by native bounds, never an index-derived pixel guess.
pub fn record_anchor(s: &crate::AppState, body: El, id: &str, key: String) -> El {
    let body = body.key(key.clone());
    if s.tab().reader.record.as_deref() == Some(id) {
        body.on_layout_tx(move |_: &mut crate::AppState, _, tx| tx.scroll_into_view(&key))
    } else {
        body
    }
}
pub fn symbol(name: &str, color: Color, size: f32) -> El {
    macro_rules! carbon {
        ($name:literal, $path:literal) => {{
            static ICON: rune::Icon = rune::Icon {
                name: $name,
                view: 32.0,
                body: include_str!($path),
            };
            &ICON
        }};
    }
    let svg = match name {
        "slices" => carbon!("tree-view", "../../../assets/icons/tree-view.svg"),
        "chat" => carbon!("chat", "../../../assets/icons/chat.svg"),
        "agents" => carbon!("bot", "../../../assets/icons/bot.svg"),
        "find" => carbon!("search", "../../../assets/icons/search.svg"),
        "settings" => carbon!("settings", "../../../assets/icons/settings.svg"),
        "brief" => carbon!("list", "../../../assets/icons/list.svg"),
        "unknown" => carbon!("help", "../../../assets/icons/help.svg"),
        "failed" => carbon!(
            "stop-sign--filled",
            "../../../assets/icons/stop-sign--filled.svg"
        ),
        "edit" => carbon!("edit", "../../../assets/icons/edit.svg"),
        "user" => carbon!("user", "../../../assets/icons/user.svg"),
        "ok" => carbon!("checkmark", "../../../assets/icons/checkmark.svg"),
        _ => carbon!("document", "../../../assets/icons/document.svg"),
    };
    icon(svg, size).color(color)
}
pub fn empty(title: &str, detail: &str, theme: Theme, width: f32) -> El {
    col()
        .gap(12.0)
        .w(width)
        .child(page_title(title, theme))
        .child(label(detail, theme).w(width).wrap())
}
