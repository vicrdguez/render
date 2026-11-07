use crate::{Block, Document, InlineText, MarkKind, Reference, Theme, safe_text};
use crate::{
    diagram,
    document::word_ranges,
    safety::capped,
    theme::{mono, prose},
};
use rune::{Align, Color, El, PillStyle, Span, col, el, rich, row, text};

/// Per-render presentation choices. These never alter the stored source or targets.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderOptions {
    pub mono_prose: bool,
    /// Prose width cap, relative to the available figure width; None uses all of it.
    pub prose_measure: Option<f32>,
    pub mermaid_source: bool,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            mono_prose: false,
            prose_measure: Some(600.0),
            mermaid_source: false,
        }
    }
}

impl RenderOptions {
    fn font(self, size: f32, line: f32, weight: f32) -> rune::TextStyle {
        let font = prose(size, line, weight);
        if self.mono_prose {
            font.family(rune::Family::Named("Iosevka"))
        } else {
            font
        }
    }

    fn measure(self, width: f32) -> f32 {
        match self.prose_measure {
            Some(cap) if cap.is_finite() => width.min(cap.max(20.0)),
            _ => width,
        }
    }
}

pub fn render_markdown(source: &str, theme: Theme, width: f32) -> El {
    Document::parse(source, &[]).render(theme, width)
}

pub fn render_markdown_with_references(
    source: &str,
    references: &[Reference],
    theme: Theme,
    width: f32,
) -> El {
    Document::parse(source, references).render(theme, width)
}

/// Plain content, with neither Markdown nor reference recognition.
pub fn render_text(source: &str, theme: Theme, width: f32) -> El {
    render_text_with_options(source, theme, width, RenderOptions::default())
}

/// Plain content with the same per-call prose choices as Document rendering.
pub fn render_text_with_options(
    source: &str,
    theme: Theme,
    width: f32,
    options: RenderOptions,
) -> El {
    let (shown, omitted) = capped(source);
    let width = valid_width(width);
    let body = text(safe_text(shown))
        .font(options.font(14.0, 21.0, 400.0))
        .color(theme.token("fg.default"))
        .wrap_anywhere()
        .w(options.measure(width))
        .selectable(true)
        .max_lines(2000);
    with_omitted(col().child(body), omitted, theme, options)
}

/// Code or tool-output bytes on a neutral source frame. This never resolves references.
pub fn render_source(source: &str, language: &str, theme: Theme, width: f32) -> El {
    let (shown, omitted) = capped(source);
    with_omitted(
        code(shown, language, theme, valid_width(width)),
        omitted,
        theme,
        RenderOptions::default(),
    )
}

impl Document {
    /// The caller owns navigation, selection of a block, and disclosure state.
    pub fn render(&self, theme: Theme, width: f32) -> El {
        self.render_with_options(theme, width, RenderOptions::default())
    }

    pub fn render_with_options(&self, theme: Theme, width: f32, options: RenderOptions) -> El {
        let width = valid_width(width);
        with_omitted(
            blocks(&self.blocks, theme, width, 0, options),
            self.truncated_lines,
            theme,
            options,
        )
        .w(width)
        .selection_group(true)
    }
}

fn valid_width(width: f32) -> f32 {
    if width.is_finite() {
        width.max(40.0)
    } else {
        600.0
    }
}

fn with_omitted(body: El, omitted: usize, theme: Theme, options: RenderOptions) -> El {
    if omitted == 0 {
        body
    } else {
        col().gap(8.0).child(body).child(
            text(format!(
                "… {omitted} more lines · open source for full text"
            ))
            .font(options.font(12.0, 16.0, 400.0))
            .color(theme.token("fg.muted")),
        )
    }
}

fn blocks(source: &[Block], theme: Theme, width: f32, depth: usize, options: RenderOptions) -> El {
    col().gap(12.0).w(width).children(
        source
            .iter()
            .enumerate()
            .map(|(i, b)| block(b, theme, width, depth, options).key(format!("block-{i}"))),
    )
}

fn rule(theme: Theme, strong: bool) -> El {
    el().h(1.0).w_full().fill(theme.token(if strong {
        "border.strong"
    } else {
        "border.subtle"
    }))
}

fn block(source: &Block, theme: Theme, width: f32, depth: usize, options: RenderOptions) -> El {
    let measure = options.measure(width);
    match source {
        Block::Paragraph(p) => {
            paragraph(p, theme, measure, 14.0, 21.0, 400.0, None, false, options)
        }
        Block::Heading { level, content } => {
            let (size, line, weight) = match level {
                1 => (20.0, 28.0, 700.0),
                2 => (17.0, 24.0, 600.0),
                3 => (15.0, 22.0, 600.0),
                4 => (14.0, 20.0, 600.0),
                _ => (13.0, 19.0, 600.0),
            };
            let color = theme.token(match level {
                1 => "content.h1",
                2 => "content.h2",
                5 | 6 => "fg.alt",
                _ => "fg.default",
            });
            let mut heading = paragraph(
                content,
                theme,
                measure,
                size,
                line,
                weight,
                Some(color),
                *level == 6,
                options,
            )
            .role("heading")
            .level(*level as u32);
            if *level == 5 {
                heading = heading.text_case(rune::TextCase::Uppercase);
            }
            let mut group = col().gap(4.0).w(measure).child(heading);
            if *level == 1 {
                group = group.child(rule(theme, true).key("heading-rule"));
            }
            group
        }
        Block::Code { language, source } if language == "mermaid" && !options.mermaid_source => {
            diagram::render_inline(source, theme, width)
        }
        Block::Code { language, source } => code(source, language, theme, width),
        Block::Quote {
            alert,
            blocks: content,
        } => {
            let inner_width = (measure - 19.0).max(20.0);
            let mut inner = col().gap(8.0).w(inner_width);
            if let Some(kind) = alert {
                inner = inner.child(
                    text(kind)
                        .font(options.font(13.0, 18.0, 700.0))
                        .color(theme.token("fg.alt")),
                );
            }
            inner = inner.children(content.iter().map(|b| match b {
                Block::Paragraph(p) => paragraph(
                    p,
                    theme,
                    inner_width,
                    14.0,
                    21.0,
                    400.0,
                    Some(theme.token("fg.alt")),
                    true,
                    options,
                ),
                _ => block(b, theme, inner_width, depth, options),
            }));
            row()
                .gap(16.0)
                .w(measure)
                .child(
                    el().w(3.0)
                        .self_stretch()
                        .fill(theme.token(if alert.is_some() {
                            "fg.muted"
                        } else {
                            "border.strong"
                        })),
                )
                .child(inner)
        }
        Block::List { start, items } => {
            let marker_width = if start.is_some() { 28.0 } else { 20.0 };
            let stacked = depth >= 4 || width < marker_width + 24.0;
            let indent = if stacked { 0.0 } else { marker_width + 4.0 };
            col()
                .gap(4.0)
                .w(width)
                .children(items.iter().enumerate().map(|(i, item)| {
                    let marker = if let Some(checked) = item.checked {
                        let mut mark = el().size(14.0, 14.0).border(1.5, theme.token("fg.muted"));
                        if checked {
                            mark = mark.fill(theme.token("fg.alt")).child(
                                text("✓")
                                    .font(mono(12.0, 14.0))
                                    .color(theme.token("surface.read")),
                            );
                        }
                        el().w(marker_width).py(3.5).child(mark)
                    } else {
                        let label = start.map_or_else(
                            || ["•", "◦", "▪"][depth % 3].to_string(),
                            |n| format!("{}.", n.saturating_add(i as u64)),
                        );
                        text(label)
                            .w(marker_width)
                            .align(Align::End)
                            .font(mono(14.0, 21.0))
                            .color(theme.token("fg.muted"))
                    };
                    // At the indentation cap, put the marker above the content rather
                    // than adding an unaccounted-for marker column to its left.
                    let layout = if stacked { col() } else { row() };
                    layout.gap(4.0).w(width).child(marker).child(blocks(
                        &item.blocks,
                        theme,
                        (width - indent).max(20.0),
                        depth + 1,
                        options,
                    ))
                }))
        }
        Block::Table { alignments, rows } => table(rows, alignments, theme, width, options),
        Block::Frontmatter { fields, .. } => text(format!(
            "frontmatter · {fields} {}",
            if *fields == 1 { "field" } else { "fields" }
        ))
        .key("frontmatter")
        .w(measure)
        .font(options.font(12.0, 16.0, 400.0))
        .color(theme.token("fg.muted"))
        .expanded(false),
        Block::Footnote {
            label,
            number,
            blocks: content,
        } => col()
            .gap(6.0)
            .w(measure)
            .child(rule(theme, false))
            .child(
                text(format!("{number}. ↩"))
                    .key(format!("footnote-{label}"))
                    .font(mono(11.0, 16.0))
                    .color(theme.token("fg.alt")),
            )
            .child(blocks(content, theme, measure, depth, options)),
        Block::Rule => col().py(24.0).w(measure).child(rule(theme, true)),
    }
}

#[allow(clippy::too_many_arguments)]
fn paragraph(
    p: &InlineText,
    theme: Theme,
    width: f32,
    size: f32,
    line: f32,
    weight: f32,
    base: Option<Color>,
    italic: bool,
    options: RenderOptions,
) -> El {
    let paint = inline_paint(p, theme, base);
    let mut font = options.font(size, line, weight);
    if italic {
        font = font.italic();
    }
    let mut result = rich(&p.text, paint.spans)
        .font(font)
        .color(base.unwrap_or_else(|| theme.token("fg.default")))
        .pills(paint.pills)
        .strikes(paint.strikes)
        .wrap_anywhere()
        .w(width)
        .selectable(true)
        .max_lines(2000);
    if p.marks
        .iter()
        .any(|m| matches!(m.kind, MarkKind::Image { .. }))
        && p.text.starts_with("image · ")
    {
        result = result.min_h(32.0).border(1.0, theme.token("border.strong"));
    }
    result
}

struct InlinePaint {
    spans: Vec<Span>,
    pills: Vec<(std::ops::Range<usize>, PillStyle)>,
    strikes: Vec<(usize, usize, Option<Color>)>,
}

fn inline_paint(p: &InlineText, theme: Theme, base: Option<Color>) -> InlinePaint {
    let mut spans = Vec::new();
    let mut pills = Vec::new();
    let mut strikes = Vec::new();
    for mark in &p.marks {
        let span = Span::new(mark.range.start, mark.range.end);
        match &mark.kind {
            MarkKind::Strong => spans.push(
                span.weight(700.0)
                    .color(base.unwrap_or_else(|| theme.token("content.strong"))),
            ),
            MarkKind::Emphasis => spans.push(span.italic()),
            MarkKind::Strike => {
                spans.push(span.color(theme.token("fg.muted")));
                strikes.push((
                    mark.range.start,
                    mark.range.end,
                    Some(theme.token("fg.muted")),
                ));
            }
            _ => {}
        }
    }
    for mark in &p.marks {
        let span = Span::new(mark.range.start, mark.range.end);
        match &mark.kind {
            MarkKind::Code => {
                spans.push(span.mono().size(13.0).color(theme.token("kind.code")));
                let word_start = p.text[..mark.range.start]
                    .rfind(char::is_whitespace)
                    .map_or(0, |i| i + p.text[i..].chars().next().unwrap().len_utf8());
                let word_end = p.text[mark.range.end..]
                    .find(char::is_whitespace)
                    .map_or(p.text.len(), |i| mark.range.end + i);
                if p.text[word_start..word_end].chars().count() <= 40 {
                    pills.push((
                        word_start..word_end,
                        PillStyle::new().bg(theme.token("surface.code")),
                    ));
                } else {
                    spans.push(
                        Span::new(mark.range.start, mark.range.end)
                            .bg(theme.token("surface.code"), 0.0),
                    );
                }
            }
            MarkKind::Reference(reference) => {
                let color = theme.token(if reference.target.is_some() {
                    "kind.link"
                } else {
                    "fg.muted"
                });
                spans.push(
                    span.mono()
                        .size(13.0)
                        .weight(if reference.target.is_some() {
                            500.0
                        } else {
                            400.0
                        })
                        .color(color)
                        .underline(color),
                );
            }
            MarkKind::Link(url) if !url.is_empty() => spans.push(
                span.color(theme.token("kind.link"))
                    .underline(theme.token("kind.link")),
            ),
            MarkKind::Footnote { .. } => {
                spans.push(span.mono().size(11.0).color(theme.token("fg.alt")))
            }
            MarkKind::Image { .. } => spans.push(span.size(13.0).color(theme.token("fg.muted"))),
            _ => {}
        }
    }
    for (start, word) in word_ranges(&p.text) {
        if word.chars().count() <= 40 && atomic(word) {
            pills.push((
                start..start + word.len(),
                PillStyle::new().bg(Color::TRANSPARENT),
            ));
        }
    }
    // Match El::pills: earlier pills win when ranges overlap.
    let mut accepted: Vec<(std::ops::Range<usize>, PillStyle)> = Vec::new();
    for (range, style) in pills {
        if !accepted
            .iter()
            .any(|(r, _)| r.start < range.end && range.start < r.end)
        {
            accepted.push((range, style));
        }
    }
    InlinePaint {
        spans,
        pills: accepted,
        strikes,
    }
}

fn atomic(word: &str) -> bool {
    word.contains('/')
        || word.contains('.')
        || (word.contains('-')
            && (word.chars().any(|c| c.is_ascii_digit())
                || word.starts_with("C-")
                || word.starts_with("M-")
                || word.starts_with("D-")))
}

fn code(source: &str, language: &str, theme: Theme, width: f32) -> El {
    let shown = safe_text(source);
    let lang = match language {
        "console" => "sh",
        _ => language,
    };
    let found = rune_kit::syntax::highlight((!lang.is_empty()).then_some(lang), &shown);
    let spans = theme.syntax().spans(&found, 0);
    let natural = rune::text::measure(&shown, &[], mono(13.0, 20.0), None).0 + 30.0;
    let frame_width = natural.max(width.min(600.0)).min(width);
    let text = rich(shown, spans)
        .key("code-text")
        .font(mono(13.0, 20.0))
        .color(theme.token("fg.default"))
        .selectable(true);
    let mut body = col().gap(4.0).w((frame_width - 2.0).max(1.0)).py(7.0);
    if !language.is_empty() {
        body = body.child(
            text_label(&safe_text(language), theme)
                .align(Align::End)
                .w_full()
                .px(14.0),
        );
    }
    body = body.child(
        el().w_full()
            .scroll_x()
            .scroll_edge_fade(32.0)
            .child(text.px(14.0)),
    );
    let frame = row()
        .w(frame_width)
        .fill(theme.token("surface.code"))
        .radius(0.0)
        .child(
            el().key("code-rule")
                .w(2.0)
                .self_stretch()
                .fill(theme.token("kind.code")),
        )
        .child(body);
    overflow_cue(frame, natural > frame_width + 0.5, theme)
}

fn text_label(label: &str, theme: Theme) -> El {
    text(label)
        .font(prose(12.0, 16.0, 400.0))
        .color(theme.token("kind.code"))
}

fn overflow_cue(body: El, overflow: bool, theme: Theme) -> El {
    if !overflow {
        return body;
    }
    body.child(
        el().key("overflow-rule")
            .w(2.0)
            .pin(None, Some(0.0), Some(0.0), Some(0.0))
            .fill(theme.token("fg.muted")),
    )
    .child(
        text("▸")
            .key("overflow-caret")
            .font(mono(16.0, 20.0))
            .color(theme.token("fg.muted"))
            .pin(None, Some(6.0), Some(2.0), None),
    )
}

fn table(
    rows: &[Vec<InlineText>],
    alignments: &[crate::Alignment],
    theme: Theme,
    width: f32,
    options: RenderOptions,
) -> El {
    let count = rows.iter().map(Vec::len).max().unwrap_or(0);
    if count == 0 {
        return col();
    }
    let mut sizes = vec![24.0_f32; count];
    let mut minima = vec![24.0_f32; count];
    for (index, row) in rows.iter().enumerate() {
        for (i, cell) in row.iter().enumerate() {
            let paint = inline_paint(cell, theme, None);
            let font = options.font(13.0, 19.0, if index == 0 { 600.0 } else { 400.0 });
            // Rune's pinned PillMetrics has no public measurement API. Iconless
            // pills reserve margin + padding on each side, based on the base font.
            let pill_space = 2.0 * ((13.0_f32 * 0.12).max(1.5) + (13.0_f32 * 0.36).max(3.0));
            let natural = rune::text::measure(&cell.text, &paint.spans, font, None).0
                + paint.pills.len() as f32 * pill_space
                + 24.0;
            let mut ranges: Vec<_> = word_ranges(&cell.text)
                .into_iter()
                .map(|(start, word)| start..start + word.len())
                .collect();
            // A code pill may contain spaces: retain the whole chip as a minimum.
            ranges.extend(paint.pills.iter().map(|(range, _)| range.clone()));
            let longest = ranges
                .into_iter()
                .map(|range| {
                    let spans: Vec<_> = paint
                        .spans
                        .iter()
                        .filter_map(|span| {
                            let start = (span.start as usize).max(range.start);
                            let end = (span.end as usize).min(range.end);
                            if start >= end {
                                return None;
                            }
                            let mut span = span.clone();
                            span.start = (start - range.start) as u32;
                            span.end = (end - range.start) as u32;
                            Some(span)
                        })
                        .collect();
                    let chips = paint
                        .pills
                        .iter()
                        .filter(|(r, _)| r.start < range.end && range.start < r.end)
                        .count();
                    rune::text::measure(&cell.text[range], &spans, font, None).0
                        + chips as f32 * pill_space
                })
                .fold(0.0_f32, f32::max)
                + 24.0;
            minima[i] = minima[i].max(longest);
            sizes[i] = sizes[i].max(natural.min(480.0).max(longest));
        }
    }
    let total: f32 = sizes.iter().sum();
    let minimum: f32 = minima.iter().sum();
    if total > width && minimum < width {
        let ratio = (width - minimum) / (total - minimum);
        for (size, min) in sizes.iter_mut().zip(minima) {
            *size = min + (*size - min) * ratio;
        }
    }
    let total: f32 = sizes.iter().sum();
    let grid = col()
        .w(total)
        .children(rows.iter().enumerate().map(|(index, cells)| {
            col()
                .w(total)
                .child(row().children(cells.iter().enumerate().map(|(i, cell)| {
                    let align = match alignments.get(i) {
                        Some(crate::Alignment::Center) => Align::Center,
                        Some(crate::Alignment::Right) => Align::End,
                        _ => Align::Start,
                    };
                    let color = (index == 0).then(|| theme.token("fg.alt"));
                    el().w(sizes[i]).px(12.0).py(6.0).child(
                        paragraph(
                            cell,
                            theme,
                            sizes[i] - 24.0,
                            13.0,
                            19.0,
                            if index == 0 { 600.0 } else { 400.0 },
                            color,
                            false,
                            options,
                        )
                        .align(align),
                    )
                })))
                .child(rule(theme, index == 0))
        }));
    overflow_cue(
        el().w(total.min(width))
            .scroll_x()
            .scroll_edge_fade(32.0)
            .child(grid),
        total > width + 0.5,
        theme,
    )
}
