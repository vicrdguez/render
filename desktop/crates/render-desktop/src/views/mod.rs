mod brief;
mod chat;
mod editor;
mod lists;
pub(crate) mod review;
mod work;

use crate::{AppState, Screen, layout::Axis, ui::*};
use render_core::*;
use rune::{El, col, el};

pub fn stage(s: &AppState, width: f32, height: f32) -> El {
    let t = s.theme;
    let notice = s.notice();
    let inset = if notice.is_some() { 44.0 } else { 0.0 };
    let page = match s.screen() {
        Screen::Brief => brief::view(s, width, height - inset),
        Screen::Slices | Screen::Proposals | Screen::Results | Screen::Agents => {
            lists::view(s, width, height - inset)
        }
        _ => work::view(s, width, height - inset),
    };
    let mut result = el().size(width, height).child(page.absolute(0.0, 0.0));
    if let Some(notice) = notice {
        result = result.child(
            el().absolute(0.0, height - 44.0)
                .size(width, 44.0)
                .fill(t.token("surface.side"))
                .child(
                    small(notice, t)
                        .absolute(48.0, 8.0)
                        .w((width - 96.0).max(40.0))
                        .wrap(),
                ),
        );
    }
    result
}

pub fn missing(s: &AppState, width: f32) -> El {
    let axis = Axis::new(width);
    empty(&format!("{} unavailable", s.screen().title()), "The host has not supplied this object. No other revision is substituted. Saving and deciding are off.",s.theme,axis.measure)
        .key("content.main").absolute(axis.text,22.0)
}

pub fn next_label(next: Option<&Next>) -> String {
    match next {
        Some(Next::Nothing) => "nothing for you yet".into(),
        Some(Next::Act(a)) => {
            let verb = match &a.kind {
                ActionKind::Answer => "Answer",
                ActionKind::Review => "Review",
                ActionKind::ConfirmShape => "Confirm",
                ActionKind::Accept => "Accept",
                ActionKind::MergeMain => "Merge",
                ActionKind::Remedy => "On the host",
                ActionKind::Other(s) => s,
            };
            let suffix = if matches!(a.kind, ActionKind::MergeMain) {
                " · on the forge".into()
            } else {
                a.options
                    .map(|n| format!(" · {n} options"))
                    .unwrap_or_default()
            };
            format!(
                "{verb} {}{suffix}",
                a.target_label.as_deref().unwrap_or(&a.target)
            )
        }
        None => "next action unavailable".into(),
    }
}

pub fn track_text(track: Option<&Track>) -> String {
    track_labels(track, false)
}

pub fn compact_track_text(track: Option<&Track>) -> String {
    track_labels(track, true)
}

fn track_labels(track: Option<&Track>, compact: bool) -> String {
    track
        .map(|track| {
            track
                .stages
                .iter()
                .map(|stage| {
                    let mark = match stage.state {
                        StageState::Done => "✓",
                        StageState::NeedsYou => "◆",
                        StageState::Delegated => "◇",
                        StageState::Running => "▸",
                        StageState::Rework => "↺",
                        StageState::Failed => "×",
                        StageState::Unknown => "?",
                        StageState::Pending => "○",
                    };
                    if compact && matches!(stage.state, StageState::Done | StageState::Pending) {
                        mark.to_owned()
                    } else {
                        format!("{mark} {}", stage.label)
                    }
                })
                .collect::<Vec<_>>()
                .join("   ")
        })
        .unwrap_or_else(|| "Track unavailable".into())
}

pub fn handover(s: &AppState, h: &Handover, next: Option<&Next>, width: f32) -> El {
    let t = s.theme;
    let commitment = h
        .commitment
        .as_ref()
        .map(|c| {
            format!(
                "{}{}",
                c.label,
                c.scope
                    .as_ref()
                    .map(|v| format!(" · {v}"))
                    .unwrap_or_default()
            )
        })
        .unwrap_or_else(|| "commitment unavailable".into());
    let owner = h
        .owner
        .as_ref()
        .map(|o| {
            format!(
                "{}{}",
                match &o.who {
                    OwnerKind::You => "you".into(),
                    OwnerKind::Nobody => "no owner".into(),
                    OwnerKind::Assignment {
                        id,
                        generation,
                        role,
                    } => format!(
                        "{} {}{}",
                        role.as_ref()
                            .map(|r| r.label.as_str())
                            .unwrap_or("assignment"),
                        id,
                        generation.map(|g| format!("·g{g}")).unwrap_or_default()
                    ),
                },
                o.state
                    .as_ref()
                    .map(|v| format!(" · {}", v.as_str()))
                    .unwrap_or_default()
            )
        })
        .unwrap_or_else(|| "owner unavailable".into());
    let evidence = h
        .evidence
        .as_ref()
        .map(|e| e.summary.as_str())
        .unwrap_or("evidence unavailable");
    let blocker = blocker_text(h.blocker.as_ref());
    col()
        .gap(16.0)
        .w(width)
        .child(fact("commitment", &commitment, t, width))
        .child(fact("owner", &owner, t, width))
        .child(fact("evidence", evidence, t, width))
        .child(fact("blocker", &blocker, t, width))
        .child(fact("next", &next_label(next), t, width))
}
fn fact(name: &str, value: &str, t: render_content::Theme, width: f32) -> El {
    col()
        .gap(4.0)
        .child(small(name, t).color(t.token("kind.you")))
        .child(label(value, t).w(width).wrap())
}
pub fn blocker_text(blocker: Option<&Blocker>) -> String {
    match blocker {
        Some(Blocker::None { uncertainties, .. }) => {
            if *uncertainties > 0 {
                format!("none · {uncertainties} uncertainties")
            } else {
                "none".into()
            }
        }
        Some(Blocker::Typed(b)) => format!(
            "{} {} {}",
            b.id.as_deref().unwrap_or(""),
            b.severity.as_deref().unwrap_or(""),
            b.text.as_str()
        )
        .trim()
        .into(),
        None => "blocker unavailable".into(),
    }
}

pub fn plain_document(s: &AppState, source: &str, width: f32) -> El {
    render_content::render_text_with_options(
        source,
        s.theme,
        width,
        render_content::RenderOptions {
            mono_prose: s.mono_prose,
            prose_measure: Some(if s.wide { width } else { 600.0 }),
            mermaid_source: s.mermaid_source,
        },
    )
}

/// Apply view-local presentation without changing the immutable source or cache key.
pub fn document(s: &AppState, source: &str, width: f32) -> El {
    let offset = (s.source_text() == source).then_some(0);
    document_at(s, source, width, offset)
}

pub fn document_at(s: &AppState, source: &str, width: f32, offset: Option<usize>) -> El {
    s.with_document(source, |doc| {
        let mut rendered = col().w(width).child(doc.render_with_options(
            s.theme,
            width,
            render_content::RenderOptions {
                mono_prose: s.mono_prose,
                prose_measure: Some(if s.wide { width } else { 600.0 }),
                mermaid_source: s.mermaid_source,
            },
        ));
        if let Some(offset) = offset {
            for target in doc.targets() {
                rendered = rendered.child(navigation_row(s, source, target, offset, width));
            }
        }
        rendered
    })
}

fn navigation_row(
    s: &AppState,
    source: &str,
    target: &render_content::NavigationTarget,
    offset: usize,
    width: f32,
) -> El {
    let start = offset + target.source.start;
    let end = offset + target.source.end;
    let (label, command) = match &target.kind {
        render_content::NavigationKind::Diagram { .. } => (
            "Full diagram · pan horizontally for overflow",
            "diagram.zoom",
        ),
        render_content::NavigationKind::Reference(_) => ("Open reference", "goto.definition"),
        render_content::NavigationKind::Link(_) => ("Open link · confirms URL", "link.external"),
        render_content::NavigationKind::Footnote { .. } => ("Go to footnote", "goto.definition"),
    };
    let expected = source.get(target.source.clone()).unwrap_or("").to_owned();
    rune::row()
        .gap(8.0)
        .w(width)
        .key(format!("target.{start}"))
        .child(hint_overlay(s, &format!("byte:{start}")))
        .child(
            small(label, s.theme).color(s.theme.token(if s.chrome_inert() {
                "fg.muted"
            } else {
                "kind.literal"
            })),
        )
        .child(
            small(expected.lines().next().unwrap_or(""), s.theme)
                .truncate()
                .shrink(),
        )
        .on_press_tx(move |s: &mut AppState, tx| {
            if !s.chrome_inert()
                && s.source_text().get(start..end) == Some(expected.as_str())
                && s.reader_seek(start)
            {
                s.command(command, tx);
                tx.instant();
            }
        })
}

/// A frozen hint is presentation, never a command or authority action.
pub fn hint_overlay(s: &AppState, object: &str) -> El {
    let mut overlay = el();
    if let Some(hints) = &s.hints {
        for (label, target) in hints {
            if target == object && label.starts_with(&s.hint_prefix) {
                overlay = overlay.child(
                    mono(label, s.theme)
                        .key(format!("hint.{label}"))
                        .px(4.0)
                        .radius(2.0)
                        .fill(s.theme.token("surface.bar"))
                        .color(s.theme.token("kind.literal")),
                );
            }
        }
    }
    overlay
}

pub fn typed_text(value: &Text, t: render_content::Theme, width: f32) -> El {
    if value.is_content() {
        content_bar(value.as_str(), t, width, 3)
    } else {
        label(value.as_str(), t).w(width).wrap()
    }
}
