use crate::{Theme, render_source, safe_text, theme::prose};
use rune::{El, col, text};
use rune_mermaid::{DiagramStyle, Hover};
use std::hash::{Hash, Hasher};

/// Remove Mermaid author styling before the native parser sees it. Quoted labels remain text.
pub fn strip_mermaid_styles(source: &str) -> String {
    let mut output = String::new();
    let mut frames = Vec::new();
    let mut directive = false;
    let mut frontmatter = false;
    let mut started = false;
    for statement in statements(source) {
        let trim = statement.trim();
        if trim.is_empty() {
            continue;
        }
        if trim.starts_with("%%{") {
            directive = true;
        }
        if directive {
            if trim.contains("}%%") {
                directive = false;
            }
            continue;
        }
        if trim.starts_with("%%") {
            continue;
        }
        if !started && trim == "---" {
            frontmatter = true;
            started = true;
            continue;
        }
        if frontmatter {
            if trim == "---" {
                frontmatter = false;
            }
            continue;
        }
        started = true;
        let keyword = trim.split_whitespace().next().unwrap_or("");
        if matches!(
            keyword,
            "style" | "classDef" | "linkStyle" | "click" | "cssClass"
        ) || (keyword == "class" && !trim.contains('{') && trim.split_whitespace().count() >= 3)
            || keyword.starts_with("Update")
        {
            continue;
        }
        if matches!(keyword, "rect" | "box") {
            frames.push(true);
            continue;
        }
        if matches!(
            keyword,
            "loop" | "alt" | "opt" | "par" | "critical" | "break" | "subgraph"
        ) {
            frames.push(false);
        }
        if keyword == "end" && frames.pop() == Some(true) {
            continue;
        }
        output.push_str(&without_classes(statement));
        output.push('\n');
    }
    output
}

fn statements(source: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut quote = false;
    let mut escaped = false;
    let mut depth = 0usize;
    for (i, c) in source.char_indices() {
        // The native parser splits lines first, then handles escapes only in quotes.
        if c == '\n' {
            result.push(&source[start..i]);
            start = i + 1;
            quote = false;
            escaped = false;
            depth = 0;
            continue;
        }
        if escaped {
            escaped = false;
            continue;
        }
        if quote && c == '\\' {
            escaped = true;
            continue;
        }
        if c == '"' {
            quote = !quote;
        }
        if !quote {
            match c {
                '[' | '(' | '{' => depth += 1,
                ']' | ')' | '}' => depth = depth.saturating_sub(1),
                _ => {}
            }
        }
        if c == ';' && !quote && depth == 0 {
            result.push(&source[start..i]);
            start = i + 1;
        }
    }
    result.push(&source[start..]);
    result
}

fn without_classes(source: &str) -> String {
    let mut out = String::new();
    let mut chars = source.chars().peekable();
    let mut quote = false;
    let mut depth = 0usize;
    while let Some(c) = chars.next() {
        if c == '"' {
            quote = !quote;
        }
        if !quote {
            match c {
                '[' | '(' | '{' => depth += 1,
                ']' | ')' | '}' => depth = depth.saturating_sub(1),
                _ => {}
            }
        }
        if !quote && depth == 0 && c == ':' {
            let mut look = chars.clone();
            if look.next() == Some(':') && look.next() == Some(':') {
                chars.next();
                chars.next();
                while chars
                    .peek()
                    .is_some_and(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ','))
                {
                    chars.next();
                }
                continue;
            }
        }
        out.push(c);
    }
    out
}

fn style(theme: Theme, width: f32) -> DiagramStyle {
    let mut style = DiagramStyle::neutral(theme != Theme::EmberLight).min_scale(1.0);
    style.text = theme.token("fg.default");
    style.muted = theme.token("fg.alt");
    style.surface = theme.token("surface.code");
    style.surface_border = theme.token("border.strong");
    style.node_fill = theme.token("surface.bar");
    style.node_border = theme.token("border.strong");
    style.line = theme.token("fg.muted");
    style.cluster_fill = theme.token("surface.code");
    style.note_fill = theme.token("surface.bar");
    style.note_border = theme.token("border.strong");
    style.font = prose(16.0, 22.0, 400.0);
    style.max_width = width;
    style
}

fn token_palette_supported(source: &str) -> bool {
    matches!(
        source.split_whitespace().next(),
        Some(
            "graph"
                | "flowchart"
                | "sequenceDiagram"
                | "stateDiagram"
                | "stateDiagram-v2"
                | "classDiagram"
                | "erDiagram"
                | "block-beta"
                | "requirementDiagram"
        )
    )
}

/// Natural-size native content for the app's full-view pan/zoom container.
/// Types with toolkit-owned chart hues stay source-only instead of borrowing authority colours.
pub fn render_mermaid_full(source: &str, theme: Theme, width: f32) -> El {
    render(source, theme, width, DiagramView::Full)
}

pub(crate) fn render_inline(source: &str, theme: Theme, width: f32) -> El {
    render(source, theme, width, DiagramView::Inline)
}

#[derive(Clone, Copy, PartialEq)]
enum DiagramView {
    Inline,
    Full,
}

fn render(source: &str, theme: Theme, width: f32, view: DiagramView) -> El {
    let width = if width.is_finite() {
        width.max(40.0)
    } else {
        600.0
    };
    let clean = safe_text(&strip_mermaid_styles(source));
    if !token_palette_supported(&clean) {
        return fallback(
            source,
            theme,
            width,
            "Diagram source · this type cannot use Ember tokens at the pinned toolkit revision",
        );
    }
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    clean.hash(&mut hash);
    theme.hash(&mut hash);
    let probe_key = format!("diagram-measure-{:x}", hash.finish());
    let natural = rune::memo::layout_size(&format!("{probe_key}/diagram"));
    let Some(probe) = rune_mermaid::render_with_hover(
        &clean,
        &style(theme, 100_000.0),
        Hover::Off,
        theme.token("fg.default"),
    ) else {
        return fallback(
            source,
            theme,
            width,
            "Diagram could not be parsed · the toolkit supplies no line or column",
        );
    };
    let frame_width = match (view, natural) {
        (DiagramView::Full, Some([natural_width, _])) => natural_width + 34.0,
        _ => width,
    };
    let body = if let Some([natural_width, _]) = natural {
        let scale = ((frame_width - 34.0) / natural_width).clamp(0.0, 1.0);
        // Class stereotypes use font.size - 2, the smallest label at this pin.
        if scale * 14.0 >= 12.0 {
            let paint = style(theme, frame_width).min_scale(0.0);
            rune_mermaid::render_with_hover(&clean, &paint, Hover::Off, theme.token("fg.default"))
                .expect("same supported source")
                .w(frame_width)
                .radius(0.0)
                .clip_rounded(0.0)
                .role("figure")
                .label("Mermaid diagram")
                .description(safe_text(source))
        } else {
            panel(
                &format!(
                    "Diagram wider than view · {:.0} px natural width · labels would be {:.1} px · open full view",
                    natural_width + 34.0,
                    14.0 * scale
                ),
                theme,
                width,
            )
        }
    } else {
        panel("Diagram · open full view", theme, width)
    };
    col().w(frame_width).child(body).child(
        probe
            .key(probe_key)
            .size(1.0, 1.0)
            .clip_rounded(0.0)
            .absolute(0.0, 0.0)
            .opacity(0.0)
            .inert()
            .a11y_hidden(),
    )
}

fn panel(label: &str, theme: Theme, width: f32) -> El {
    text(label)
        .font(prose(13.0, 19.0, 400.0))
        .color(theme.token("fg.muted"))
        .wrap()
        .w(width)
        .padding(12.0)
        .fill(theme.token("surface.code"))
        .border(1.0, theme.token("border.strong"))
}

fn fallback(source: &str, theme: Theme, width: f32, reason: &str) -> El {
    col()
        .gap(8.0)
        .w(width)
        .child(panel(reason, theme, width))
        .child(render_source(source, "mermaid", theme, width))
}
