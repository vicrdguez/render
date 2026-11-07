use super::editor::composer;
use super::work::{line_diff, review_count};
use super::*;
use render_content::render_markdown;
use render_content::{Document, RenderOptions};
use rune::row;
pub(super) fn view(s: &AppState, width: f32, height: f32) -> El {
    let Some(o) = s.current_object() else {
        return missing(s, width);
    };
    let ObjectBody::Review(r) = &o.body else {
        return missing(s, width);
    };
    let t = s.theme;
    let a = Axis::reading(width, s.wide);
    let w = a.measure;
    let cursor = s.tab().cursor;
    let mut left = col().w(a.left.map_or(200., |p| p.1)).gap(8.);
    let full = w + a.notes.map_or(0., |(_, width)| 40. + width);
    let mut body = col().w(full).gap(8.).child(hint_overlay(s, &o.id));

    left = left
        .child(label(o.title.as_deref().unwrap_or("Review"), t).font(style(13.0, 18.0, 600.0)))
        .child(mono(r.digest.as_deref().unwrap_or("digest unavailable"), t));
    let mut outline = col().key("review.outline").gap(0.0);
    for (i, n) in r.nodes.iter().enumerate() {
        let n_id = n.id.clone();
        let start = n
            .byte_range
            .and_then(|(a, b)| r.text.get(a as usize..b as usize).map(|_| a as usize));
        outline = outline.child(
            selected(
                row()
                    .gap(8.0)
                    .min_h(26.0)
                    .child(mono(&n.id, t).w(24.0))
                    .child(label(n.title.as_deref().unwrap_or(""), t)),
                t,
                s.tab()
                    .reader
                    .record
                    .as_deref()
                    .map_or(i == cursor, |id| id == n.id),
                false,
            )
            .on_press_tx(move |s: &mut AppState, tx| {
                if !s.chrome_inert() {
                    s.tab_mut().cursor = i;
                    s.tab_mut().reader.record = Some(n_id.clone());
                    if let Some(start) = start {
                        s.reader_seek(start);
                        s.tab_mut().reader.record = Some(n_id.clone());
                        s.reveal_cursor(tx);
                    }
                    tx.instant();
                }
            }),
        );
    }
    if s.tab().outline_visible {
        left = left.child(outline);
    }
    if let Some(round) = &r.round {
        left = left
            .child(small(format!("Previous round {}", round.previous), t))
            .child(
                small(
                    format!(
                        "{} notes · {} acted on\n{} considered · {} dismissed\n{} unanswered",
                        round.notes,
                        round.acted_on,
                        round.considered,
                        round.dismissed,
                        round.unanswered
                    ),
                    t,
                )
                .wrap(),
            );
    }
    if let Some(reviews) = r.reviews {
        left = left.child(small(review_count(reviews), t).wrap());
    }
    if r.attributes_changed {
        body = body.child(
            small(
                "This source changes repository attributes. They remain inert in this client.",
                t,
            )
            .wrap(),
        );
    }
    match s.screen() {
        Screen::Dispositions => {
            body = body.child(heading("Previous-round dispositions", t));
            for (i, d) in r.dispositions.iter().enumerate() {
                let line = col()
                    .gap(6.0)
                    .child(label(format!("{} · {}", d.annotation, d.disposition), t))
                    .child(label(
                        d.resulting
                            .iter()
                            .map(|r| r.0.clone())
                            .collect::<Vec<_>>()
                            .join(" · "),
                        t,
                    ));
                let line = if let Some(reason) = &d.reason {
                    line.child(content_bar(reason.as_str(), t, w, 6))
                } else {
                    line
                };
                body = body.child(selected(line.py(8.0), t, i == cursor, !s.chrome_inert()));
            }
        }
        Screen::Diff => {
            if let Some(previous) = r
                .previous
                .as_ref()
                .and_then(|id| s.core.host.objects.get(id))
            {
                if let ObjectBody::Review(old) = &previous.body {
                    body = body
                        .child(heading(
                            format!(
                                "{} → {}",
                                previous.revision.as_deref().unwrap_or("previous"),
                                o.revision.as_deref().unwrap_or("current")
                            ),
                            t,
                        ))
                        .child(line_diff(&old.text, &r.text, t, w));
                }
            } else {
                body = body
                    .child(
                        label(
                            "Previous source unavailable. No substitute diff is shown.",
                            t,
                        )
                        .wrap(),
                    )
                    .child(render_markdown(&r.text, t, w));
            }
        }
        _ => {
            body = body.child(blocks(s, r, w, a.notes.map(|(_, width)| width)));
        }
    }

    // Diff/disposition rows do not share the source document's block geometry.
    // Keep their notes accessible without claiming a computed-diff anchor mapping.
    if s.screen() != Screen::Review {
        let mut annotations = col()
            .w(w)
            .gap(10.0)
            .child(small("Annotations · source anchors", t));
        for note in &r.annotations {
            annotations = annotations.child(
                col()
                    .gap(4.0)
                    .child(small(
                        format!(
                            "{} · {} · saved {}",
                            note.id,
                            note.anchor.node.as_deref().unwrap_or("paragraph"),
                            note.set_revision
                        ),
                        t,
                    ))
                    .child(content_bar(note.body.as_str(), t, w, 7)),
            );
        }
        for note in s.local_notes() {
            annotations = annotations.child(
                col()
                    .gap(4.0)
                    .child(
                        small(
                            format!(
                                "edit · {} · not saved",
                                note.anchor.node.as_deref().unwrap_or("paragraph")
                            ),
                            t,
                        )
                        .color(t.token("state.local")),
                    )
                    .child(content_bar(&note.body, t, w, 8)),
            );
        }
        if s.composer.is_some() {
            annotations = annotations.child(composer(s, w));
        }
        body = body.child(annotations);
    }

    let mut page = el().size(width, height).child(
        col()
            .key("work.scroll")
            .absolute(a.text - 40., 22.)
            .w(full + 40.)
            .h((height
                - 22.
                - if s.modal.is_some() || s.which_key {
                    320.
                } else {
                    0.
                })
            .max(80.))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(body.key("content.main").pl(40.).w(full + 40.).pb(24.)),
    );
    if let Some((x, _)) = a.left {
        page = page.child(left.absolute(x, 22.));
    }
    page
}

pub(crate) fn block_at(doc: &Document, byte: usize) -> Option<usize> {
    let blocks = doc.source_blocks();
    blocks
        .iter()
        .position(|b| b.source.contains(&byte))
        .or_else(|| {
            blocks
                .iter()
                .enumerate()
                .filter(|(_, b)| b.source.start >= byte)
                .min_by_key(|(_, b)| b.source.start)
                .map(|(i, _)| i)
        })
        .or_else(|| {
            blocks
                .iter()
                .enumerate()
                .max_by_key(|(_, b)| b.source.end)
                .map(|(i, _)| i)
        })
}

fn blocks(s: &AppState, r: &Review, w: f32, note_width: Option<f32>) -> El {
    let t = s.theme;
    s.with_document(&r.text, |doc| {
        let active = block_at(doc, s.tab().reader.cursor());
        let anchor_block = |a: &Anchor| {
            let byte = usize::try_from(a.byte_start)
                .ok()
                .filter(|&b| b <= r.text.len() && r.text.is_char_boundary(b))
                .or_else(|| {
                    a.node
                        .as_ref()
                        .and_then(|id| r.nodes.iter().find(|n| &n.id == id))
                        .and_then(|n| n.byte_range)
                        .and_then(|(b, e)| r.text.get(b as usize..e as usize).map(|_| b as usize))
                });
            byte.and_then(|b| block_at(doc, b))
        };
        let nw = note_width.unwrap_or(w);
        let mut all = col().w(w + note_width.map_or(0., |nw| 40. + nw)).gap(10.);
        for (i, b) in doc.source_blocks().iter().enumerate() {
            let start = b.source.start;
            let current = active == Some(i);
            let mut content = col().w(w);
            for node in &r.nodes {
                if node.byte_range.is_some_and(|(a, z)| {
                    r.text.get(a as usize..z as usize).is_some()
                        && block_at(doc, a as usize) == Some(i)
                }) {
                    content = content.child(
                        row()
                            .absolute(0., 0.)
                            .w(w)
                            .justify_end()
                            .child(mono(&node.id, t).absolute(-40., 0.))
                            .child(small(node.class.as_deref().unwrap_or(""), t)),
                    );
                }
            }
            if s.numbers {
                let line = r.text[..start].bytes().filter(|b| *b == b'\n').count() + 1;
                content = content.child(
                    mono(format!("source line {line}"), t).key(format!("source.line.{line}")),
                );
            }
            content = content.child(doc.render_block_with_options(
                i,
                t,
                w,
                RenderOptions {
                    mono_prose: s.mono_prose,
                    prose_measure: Some(if s.wide { w } else { 600. }),
                    mermaid_source: s.mermaid_source,
                },
            ));
            for target in doc.targets().iter().filter(|target| {
                b.source.start <= target.source.start && target.source.start < b.source.end
            }) {
                content = content.child(navigation_row(s, &r.text, target, 0, w));
            }
            let mut focused = selected(content, t, current, !s.chrome_inert())
                .key(format!("review.block.{i}"))
                .on_press_tx(move |s: &mut AppState, tx| {
                    if !s.chrome_inert() {
                        s.reader_seek(start);
                        tx.instant();
                    }
                });
            if current {
                focused = focused.child(
                    el().key("review.focus")
                        .absolute(-10., 0.)
                        .w(2.)
                        .h(21.)
                        .fill(t.token("state.attn")),
                );
            }
            let mut notes = col().w(nw).gap(10.);
            for n in &r.annotations {
                if anchor_block(&n.anchor) == Some(i) {
                    notes = notes.child(
                        col()
                            .gap(4.)
                            .child(small(
                                format!(
                                    "{} · {} · saved {}",
                                    n.id,
                                    n.anchor.node.as_deref().unwrap_or("paragraph"),
                                    n.set_revision
                                ),
                                t,
                            ))
                            .child(content_bar(n.body.as_str(), t, nw, 7)),
                    );
                }
            }
            for n in s.local_notes() {
                if anchor_block(&n.anchor) == Some(i)
                    && !s
                        .composer
                        .as_ref()
                        .and_then(|c| c.note.as_ref())
                        .is_some_and(|editing| editing.local_id == n.local_id)
                {
                    notes = notes.child(
                        col()
                            .gap(4.)
                            .child(
                                small(
                                    format!(
                                        "edit · {} · not saved",
                                        n.anchor.node.as_deref().unwrap_or("paragraph")
                                    ),
                                    t,
                                )
                                .color(t.token("state.local")),
                            )
                            .child(content_bar(&n.body, t, nw, 8)),
                    );
                }
            }
            if s.composer.as_ref().is_some_and(|c| {
                c.note
                    .as_ref()
                    .map_or(current, |n| anchor_block(&n.anchor) == Some(i))
            }) {
                notes = notes.child(composer(s, nw));
            }
            if current && s.core.local.notes_written < 3 {
                notes = notes.child(
                    row()
                        .gap(6.)
                        .child(small("+ note", t))
                        .child(command_chip(s, "c", "annotate"))
                        .child(command_chip(s, "Space mn", "review.note_here")),
                );
            }
            all = all.child(if note_width.is_some() {
                row().gap(40.).child(focused).child(notes)
            } else {
                col().gap(10.).child(focused).child(notes)
            });
        }
        if doc.truncated_lines > 0 {
            all = all.child(small(
                format!(
                    "{} source lines omitted from this bounded preview",
                    doc.truncated_lines
                ),
                t,
            ));
        }
        if let Some(anchor) = s.reader_selection() {
            all = all.child(
                col()
                    .key("reader.source-selection")
                    .gap(4.)
                    .child(small(
                        format!(
                            "Selected source bytes {}–{} · source preview",
                            anchor.byte_start, anchor.byte_end
                        ),
                        t,
                    ))
                    .child(
                        mono(&anchor.quote, t)
                            .w(w)
                            .wrap_anywhere()
                            .fill(t.token("surface.cursor.read")),
                    ),
            );
        }
        all
    })
}
