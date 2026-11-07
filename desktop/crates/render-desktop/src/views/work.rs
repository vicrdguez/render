use super::*;
use crate::screen::ComposeKind;
use render_content::render_markdown;
use rune::row;

pub fn view(s: &AppState, width: f32, height: f32) -> El {
    let Some(o) = s.current_object() else {
        return el().size(width, height).child(missing(s, width));
    };
    let t = s.theme;
    let a = Axis::reading(width, s.wide);
    let w = a.measure;
    let cursor = s.tab().cursor;
    let mut left = col().w(a.left.map_or(200.0, |p| p.1)).gap(8.0);
    let mut notes = col().w(a.notes.map_or(w, |p| p.1)).gap(16.0);
    let mut body = col().w(w).gap(8.0);
    if s.hints
        .as_ref()
        .is_some_and(|hints| hints.iter().any(|(_, id)| id == &o.id))
    {
        body = body.child(hint_overlay(s, &o.id));
    }
    match &o.body {
        ObjectBody::Review(r) => {
            left = left
                .child(
                    label(o.title.as_deref().unwrap_or("Review"), t).font(style(13.0, 18.0, 600.0)),
                )
                .child(mono(r.digest.as_deref().unwrap_or("digest unavailable"), t));
            let mut outline = col().key("review.outline").gap(8.0);
            for (i, n) in r.nodes.iter().enumerate() {
                let n_id = n.id.clone();
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
                            tx.scroll_into_view(format!("record.{n_id}"));
                            tx.instant();
                        }
                    }),
                );
            }
            if s.tab().outline_visible {
                left = left.child(outline);
            }
            if let Some(round) = &r.round {
                left=left.child(heading(format!("Previous round {}",round.previous),t)).child(small(format!("{} notes · {} acted on\n{} considered · {} dismissed\n{} unanswered",round.notes,round.acted_on,round.considered,round.dismissed,round.unanswered),t).wrap());
            }
            if let Some(reviews) = r.reviews {
                left = left.child(small(review_count(reviews), t).wrap());
            }
            if r.attributes_changed {
                body=body.child(small("This source changes repository attributes. They remain inert in this client.",t).wrap());
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
                        body =
                            body.child(selected(line.py(8.0), t, i == cursor, !s.chrome_inert()));
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
                    let mut offset = 0;
                    for node in &r.nodes {
                        let Some((start, end)) =
                            node.byte_range.map(|(a, b)| (a as usize, b as usize))
                        else {
                            continue;
                        };
                        if start < offset || start > end || r.text.get(start..end).is_none() {
                            continue;
                        }
                        if start > offset {
                            body =
                                body.child(document_at(s, &r.text[offset..start], w, Some(offset)));
                        }
                        let mut section = col().w(w);
                        if s.numbers {
                            let first = r.text[..start].bytes().filter(|b| *b == b'\n').count() + 1;
                            let last =
                                first + r.text[start..end].bytes().filter(|b| *b == b'\n').count();
                            section = section.child(
                                mono(format!("{} · source lines {first}–{last}", node.id), t)
                                    .key(format!("source.line.{first}")),
                            );
                        }
                        section =
                            section.child(document_at(s, &r.text[start..end], w, Some(start)));
                        body = body.child(record_anchor(
                            s,
                            selected(
                                section,
                                t,
                                s.tab().reader.record.as_deref() == Some(node.id.as_str()),
                                !s.chrome_inert(),
                            ),
                            &node.id,
                            format!("record.{}", node.id),
                        ));
                        offset = end;
                    }
                    if offset < r.text.len() || r.nodes.is_empty() {
                        if s.numbers {
                            let first =
                                r.text[..offset].bytes().filter(|b| *b == b'\n').count() + 1;
                            body = body.child(
                                mono(format!("source line {first}"), t)
                                    .key(format!("source.line.{first}")),
                            );
                        }
                        body = body.child(document_at(s, &r.text[offset..], w, Some(offset)));
                    }
                    if let Some(anchor) = s.reader_selection() {
                        body = body.child(
                            col()
                                .key("reader.source-selection")
                                .gap(4.0)
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
                }
            }
            for note in &r.annotations {
                notes = notes.child(
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
                        .child(content_bar(
                            note.body.as_str(),
                            t,
                            a.notes.map_or(w, |p| p.1),
                            7,
                        )),
                );
            }
            for draft in s.local_notes() {
                notes = notes.child(
                    col()
                        .gap(4.0)
                        .child(
                            small(
                                format!(
                                    "edit · {} · not saved",
                                    draft.anchor.node.as_deref().unwrap_or("paragraph")
                                ),
                                t,
                            )
                            .color(t.token("state.local")),
                        )
                        .child(content_bar(&draft.body, t, a.notes.map_or(w, |p| p.1), 8)),
                );
            }
            if matches!(
                s.composer.as_ref().map(|c| c.kind),
                Some(ComposeKind::Note | ComposeKind::Emission)
            ) {
                notes = notes.child(composer(s, a.notes.map_or(w, |p| p.1)));
            } else if s.core.local.notes_written < 3 {
                notes = notes.child(row().gap(6.0).child(small("+ note", t)).child(command_chip(
                    s,
                    "c",
                    "review.note_here",
                )));
            }
            if a.notes.is_none() {
                body = body.child(notes);
                notes = col();
            }
        }
        ObjectBody::Decision(d) => {
            left = left
                .child(heading("This Slice", t))
                .child(label(o.title.as_deref().unwrap_or(&o.id), t).wrap())
                .child(handover(
                    s,
                    &o.handover,
                    o.next.as_ref(),
                    a.left.map_or(200.0, |r| r.1),
                ));
            body = body.child(render_markdown(&format!("# {}", d.question.as_str()), t, w));
            if let Some(lede) = &d.lede {
                body = body.child(plain_document(s, lede.as_str(), w));
            }
            body = body
                .child(
                    small(
                        format!(
                            "{} decision {} · {}{}",
                            if d.kind == DecisionKind::Recovery {
                                "recovery"
                            } else {
                                "blocking"
                            },
                            d.label,
                            d.source.as_deref().unwrap_or("source unavailable"),
                            d.blocks
                                .map(|b| format!(" · blocks {}", b.transitive))
                                .unwrap_or_default()
                        ),
                        t,
                    )
                    .wrap(),
                )
                .child(heading("Evidence", t));
            for evidence in &d.evidence {
                body = body.child(document(s, evidence.as_str(), w));
            }
            body = body.child(
                row().justify_between().child(heading("Options", t)).child(
                    small(
                        d.recommended_by
                            .as_ref()
                            .map(|v| {
                                format!(
                                    "{v} recommends {}",
                                    d.options
                                        .iter()
                                        .find(|o| o.recommended)
                                        .map_or("none".into(), |o| o.n.to_string())
                                )
                            })
                            .unwrap_or_default(),
                        t,
                    )
                    .mt(22.0),
                ),
            );
            for (i, opt) in d.options.iter().enumerate() {
                let mut option = col().gap(5.0).py(9.0).px(10.0).w(w).child(
                    row().gap(10.0).child(mono(opt.n.to_string(), t)).child(
                        label(opt.title.as_str(), t)
                            .font(style(14.0, 20.0, 600.0))
                            .wrap()
                            .shrink(),
                    ),
                );
                if opt.recommended {
                    option = option.child(
                        small("recommended", t)
                            .border(1.0, t.token("border.strong"))
                            .px(4.0)
                            .self_start(),
                    );
                }
                option = option.child(plain_document(s, opt.body.as_str(), w - 20.0));
                body = body.child(
                    selected(option, t, cursor == i, !s.chrome_inert())
                        .key(format!("option.{}", opt.n))
                        .on_press_tx(move |s: &mut AppState, tx| {
                            if !s.chrome_inert() {
                                s.tab_mut().cursor = i;
                                tx.instant();
                            }
                        }),
                );
            }
            body = body
                .child(heading("Your answer", t))
                .child(small("local draft · sent with your answer", t));
            if s.composer.is_some() {
                body = body.child(composer(s, w));
            } else {
                body = body.child(content_bar(&s.draft_text(DraftKind::DecisionNote), t, w, 5));
            }
        }
        ObjectBody::Chat(chat) => {
            for r in &chat.roster {
                left = left
                    .child(
                        label(
                            format!("{} {}", r.candidate.as_deref().unwrap_or(""), r.role.label),
                            t,
                        )
                        .color(t.token(role_color(r.role.class))),
                    )
                    .child(small(r.state.as_deref().unwrap_or("state unavailable"), t));
            }
            let mut source_offset = 0;
            let mut source_line = 1;
            let mut first_text = true;
            for (i, message) in chat.messages.iter().enumerate() {
                let mut item = col().gap(7.0).w(w).mb(14.0);
                match &message.body {
                    MessageBody::Text {
                        text, streaming, ..
                    } => {
                        if !first_text {
                            source_offset += 2;
                            source_line += 2;
                        }
                        first_text = false;
                        if s.numbers {
                            item = item.child(
                                mono(format!("source line {source_line}"), t)
                                    .key(format!("source.line.{source_line}")),
                            );
                        }
                        item = item
                            .child(
                                row()
                                    .gap(8.0)
                                    .child(symbol(
                                        if message.role.class == RoleClass::Human {
                                            "user"
                                        } else {
                                            "agents"
                                        },
                                        t.token(role_color(message.role.class)),
                                        14.0,
                                    ))
                                    .child(
                                        label(&message.role.label, t)
                                            .color(t.token(role_color(message.role.class))),
                                    )
                                    .child(small(s.age(message.at), t)),
                            )
                            .child(document_at(s, text, w, Some(source_offset)));
                        source_offset += text.len();
                        source_line += text.bytes().filter(|b| *b == b'\n').count();
                        if *streaming {
                            item = item.child(label("▌", t).color(t.token("fg.muted")));
                        }
                        if message.role.class == RoleClass::Human {
                            item = item.fill(t.token("tint.human"));
                        }
                    }
                    MessageBody::Tool(tool) => {
                        let (tint, outcome) = match tool.outcome {
                            ToolOutcome::Running => ("tint.tool_run", "running"),
                            ToolOutcome::Succeeded => ("tint.tool_ok", "ok"),
                            ToolOutcome::Failed => ("tint.tool_fail", "failed"),
                            ToolOutcome::Unknown => ("tint.tool_unknown", "unknown"),
                            ToolOutcome::Cancelled => ("surface.side", "cancelled"),
                        };
                        item = item.child(
                            row()
                                .gap(12.0)
                                .px(12.0)
                                .h(28.0)
                                .center_y()
                                .fill(t.token(tint))
                                .border(1.0, t.token("border.strong"))
                                .child(mono(&tool.name, t).w(130.0))
                                .child(
                                    mono(tool.args.as_deref().unwrap_or(""), t)
                                        .truncate()
                                        .grow(1.0),
                                )
                                .child(
                                    label(
                                        format!(
                                            "{outcome}{}",
                                            tool.duration_ms
                                                .map(|v| format!(" · {:.1} s", v as f32 / 1000.0))
                                                .unwrap_or_default()
                                        ),
                                        t,
                                    )
                                    .w(170.0),
                                ),
                        );
                        if s.expanded && cursor == i {
                            for attempt in &tool.web {
                                item = item.child(
                                    small(
                                        format!(
                                            "{} · {:?}{}",
                                            attempt.provider,
                                            attempt.outcome,
                                            attempt
                                                .failure
                                                .as_ref()
                                                .map(|x| format!(" · {}", x.as_str()))
                                                .unwrap_or_default()
                                        ),
                                        t,
                                    )
                                    .wrap(),
                                );
                            }
                        }
                    }
                }
                body = body.child(record_anchor(
                    s,
                    selected(
                        item,
                        t,
                        s.tab()
                            .reader
                            .record
                            .as_deref()
                            .map_or(cursor == i, |id| id == message.id),
                        !s.chrome_inert(),
                    ),
                    &message.id,
                    format!("message.{}", message.id),
                ));
            }
            for steer in &chat.steers {
                body = body
                    .child(small(
                        format!("steer {} · {:?}", steer.id, steer.delivery),
                        t,
                    ))
                    .child(content_bar(steer.text.as_str(), t, w, 2));
            }
            let mode = chat.turn.as_ref().map(|v| v.send_mode());
            body = body.child(
                small(
                    match mode {
                        Some(SendMode::Steer) => "→ steer · delivers after the current tool call",
                        Some(_) => "→ prompt · sending starts a new turn",
                        None => "send mode unavailable · sending is off",
                    },
                    t,
                )
                .mt(12.0),
            );
            body = body.child(composer(s, w));
            for artifact in &chat.artifacts {
                notes = notes
                    .child(label(&artifact.key, t))
                    .child(small(&artifact.state, t));
            }
        }
        ObjectBody::Evidence(e) => {
            left = left.child(heading("Passes", t));
            for pass in &e.passes {
                left = left.child(label(
                    format!(
                        "pass {}{}",
                        pass.ordinal,
                        if Some(pass.ordinal) == e.current_pass {
                            " · current"
                        } else {
                            " · historical"
                        }
                    ),
                    t,
                ));
            }
            left = left
                .child(heading(format!("Findings {}", e.findings.len()), t))
                .child(heading(format!("Obligations {}", e.obligations.len()), t));
            body = body.child(render_markdown(
                &format!("# {}", o.title.as_deref().unwrap_or("Evidence")),
                t,
                w,
            ));
            for pass in &e.passes {
                if Some(pass.ordinal) != e.current_pass && !s.expanded {
                    continue;
                }
                body = body.child(heading(format!("pass {}", pass.ordinal), t));
                for (name, value) in [
                    ("Audit examined", pass.audit_examined.as_deref()),
                    ("submitted", pass.submitted.as_deref()),
                    ("prepared", pass.prepared.as_deref()),
                ] {
                    body = body.child(field(name, value.unwrap_or("not observed yet"), t, w));
                }
                if pass.watchdog.is_empty() {
                    body = body.child(field(
                        "Watchdog",
                        &format!(
                            "none yet on {}",
                            pass.prepared.as_deref().unwrap_or("unavailable source")
                        ),
                        t,
                        w,
                    ));
                } else {
                    for review in &pass.watchdog {
                        body = body.child(field(
                            "Watchdog",
                            &format!(
                                "r{} {:?} on {}{}",
                                review.round,
                                review.verdict,
                                review.reviewed.as_deref().unwrap_or("source unavailable"),
                                if review.counted { " · counted" } else { "" }
                            ),
                            t,
                            w,
                        ));
                    }
                }
            }
            if let Some(count) = e.reviews {
                body = body.child(small(review_count(count), t));
            }
            body = body.child(heading("Findings", t));
            for (i, f) in e.findings.iter().enumerate() {
                body = body.child(record_anchor(
                    s,
                    selected(
                        col()
                            .gap(4.0)
                            .py(5.0)
                            .child(
                                row()
                                    .gap(12.0)
                                    .child(mono(&f.id, t).w(40.0))
                                    .child(
                                        small(f.severity.as_deref().unwrap_or("unclassified"), t)
                                            .w(70.0),
                                    )
                                    .child(label(
                                        f.disposition
                                            .as_deref()
                                            .unwrap_or("disposition unavailable"),
                                        t,
                                    )),
                            )
                            .child(typed_text(&f.text, t, w)),
                        t,
                        s.tab()
                            .reader
                            .record
                            .as_deref()
                            .map_or(i == cursor, |id| id == f.id),
                        !s.chrome_inert(),
                    ),
                    &f.id,
                    format!("record.{}", f.id),
                ));
            }
            body = body.child(heading("Obligations", t));
            for o in &e.obligations {
                body = body.child(record_anchor(
                    s,
                    selected(
                        label(format!("{} · {}", o.id, o.summary.as_str()), t).wrap(),
                        t,
                        s.tab().reader.record.as_deref() == Some(o.id.as_str()),
                        !s.chrome_inert(),
                    ),
                    &o.id,
                    format!("record.{}", o.id),
                ));
                for (source, value) in &o.matrix {
                    body = body.child(field(
                        source,
                        value.as_ref().map(Text::as_str).unwrap_or("not assessed"),
                        t,
                        w,
                    ));
                }
            }
            if let Some(gate) = &e.gate_receipt {
                body = body
                    .child(heading("Gate receipt", t))
                    .child(typed_text(gate, t, w));
            }
            for passage in &e.web {
                body = body
                    .child(
                        small(
                            format!(
                                "{} · {}",
                                passage
                                    .provider
                                    .as_deref()
                                    .unwrap_or("provider unavailable"),
                                passage.url
                            ),
                            t,
                        )
                        .wrap(),
                    )
                    .child(content_bar(passage.text.as_str(), t, w, 10));
            }
            body = body.child(heading("Native checks · advisory", t));
            for check in &e.native_checks {
                body = body.child(typed_text(check, t, w));
            }
        }
        ObjectBody::Proposal(p) => {
            left = left
                .child(
                    label(
                        "What could stop you\nSource and checks\nReadiness\nAdvisory\nSlices",
                        t,
                    )
                    .wrap(),
                )
                .child(heading("Merging", t))
                .child(
                    label("You merge main on the forge. No machine merges main.", t)
                        .w(200.0)
                        .wrap(),
                );
            body = body.child(render_markdown(
                &format!("# {}", o.title.as_deref().unwrap_or("Proposal")),
                t,
                w,
            ));
            if let Some(intake) = &p.intake {
                body = body.child(typed_text(intake, t, w));
            }
            body = body.child(heading("What could stop you", t)).child(small(
                format!(
                    "findings {} · deviations {} · uncertainties {}",
                    p.findings, p.deviations, p.uncertainties
                ),
                t,
            ));
            for gap in &p.readiness.gaps {
                body = body.child(typed_text(gap, t, w));
            }
            body = body
                .child(heading("Source and checks", t))
                .child(field(
                    "source",
                    p.source
                        .as_ref()
                        .map(Text::as_str)
                        .unwrap_or("not observed yet"),
                    t,
                    w,
                ))
                .child(field(
                    "checks",
                    p.checks
                        .as_ref()
                        .map(Text::as_str)
                        .unwrap_or("not observed yet"),
                    t,
                    w,
                ))
                .child(super::lists::readiness(&p.readiness, t, w));
            if p.readiness.merged_differs {
                body = body.child(
                    label(
                        "Merged source differs from reviewed source. Evidence gap remains.",
                        t,
                    )
                    .wrap(),
                );
            }
            body = body
                .child(heading("Advisory", t))
                .child(small("nothing waits on these", t));
            for a in &p.advisory {
                body = body.child(typed_text(a, t, w));
            }
            body = body.child(heading(format!("Slices {}", p.slices.len()), t));
            for (i, slice) in p.slices.iter().enumerate() {
                let id = slice.id.clone();
                body = body.child(
                    selected(
                        col().gap(3.0).py(4.0).child(label(&slice.name, t)).child(
                            small(
                                format!(
                                    "{} · pass {} · {}",
                                    slice.contract.as_deref().unwrap_or("Contract unavailable"),
                                    slice
                                        .pass
                                        .map(|v| v.to_string())
                                        .unwrap_or_else(|| "unavailable".into()),
                                    slice
                                        .watchdog
                                        .as_ref()
                                        .map(Text::as_str)
                                        .unwrap_or("Watchdog none yet")
                                ),
                                t,
                            )
                            .wrap(),
                        ),
                        t,
                        cursor == i,
                        !s.chrome_inert(),
                    )
                    .on_press_tx(move |s: &mut AppState, tx| {
                        if !s.chrome_inert() {
                            s.open_object(&id);
                            tx.instant();
                        }
                    }),
                );
            }
        }
        ObjectBody::Settings(settings) => {
            left = left.child(label("Checkpoint routing\nReview policy\nHistory", t).wrap());
            body = body
                .child(render_markdown(
                    &format!(
                        "# Settings · {}",
                        o.project
                            .as_ref()
                            .map(|p| p.name.as_str())
                            .unwrap_or("project unavailable")
                    ),
                    t,
                    w,
                ))
                .child(heading("Checkpoint routing", t))
                .child(mono(
                    settings
                        .settings_revision
                        .as_deref()
                        .unwrap_or("revision unavailable"),
                    t,
                ));
            for (i, (name, mode, editable)) in settings.routes.iter().enumerate() {
                body = body.child(selected(
                    field(
                        name,
                        &format!(
                            "{}{}",
                            if *mode == RouteMode::Human {
                                "human"
                            } else {
                                "delegated"
                            },
                            if !editable { " · always" } else { "" }
                        ),
                        t,
                        w,
                    )
                    .min_h(26.0),
                    t,
                    cursor == i,
                    !s.chrome_inert(),
                ));
            }
            body = body.child(
                small(
                    "applies to new checkpoint requests · pending ones keep what they captured",
                    t,
                )
                .wrap(),
            );
            for pending in &settings.pending {
                body = body.child(typed_text(pending, t, w));
            }
            body = body.child(heading("Review policy", t)).child(small(
                format!(
                    "default {} · for new workflows",
                    settings.policy_default.as_deref().unwrap_or("unavailable")
                ),
                t,
            ));
            for (i, (name, value)) in settings.policy_fields.iter().enumerate() {
                body = body.child(selected(
                    field(name, value, t, w).min_h(26.0),
                    t,
                    cursor == i + settings.routes.len(),
                    !s.chrome_inert(),
                ));
            }
            if s.composer.is_some() {
                body = body.child(composer(s, w));
            }
            for (workflow, policy, binding) in &settings.bindings {
                body = body.child(field(
                    "workflow",
                    &format!("{workflow} {policy} ({binding})"),
                    t,
                    w,
                ));
            }
            body = body.child(heading("History", t));
            for item in &settings.history {
                body = body.child(typed_text(item, t, w));
            }
        }
        ObjectBody::Operation(op) => {
            left = left.child(heading("Blocks", t));
            for b in &op.blocks {
                left = left.child(typed_text(b, t, 200.0));
            }
            left = left.child(heading("Continues", t));
            for c in &op.continues {
                left = left.child(typed_text(c, t, 200.0));
            }
            body = body
                .child(render_markdown(&format!("# {}", op.label.as_str()), t, w))
                .child(field("operation", &o.id, t, w))
                .child(field(
                    "state",
                    &format!("{:?}", op.state).to_lowercase(),
                    t,
                    w,
                ))
                .child(field(
                    "payload",
                    op.payload_digest.as_deref().unwrap_or("unavailable"),
                    t,
                    w,
                ));
            for attempt in &op.attempts {
                body = body.child(typed_text(attempt, t, w));
            }
            body = body.child(heading("Observations", t));
            for observation in &op.observations {
                body = body.child(typed_text(observation, t, w));
            }
            if op.duplicate_risk_since.is_some() {
                body = body.child(
                    label(
                        "? duplicate risk · stays until the host records a resolution",
                        t,
                    )
                    .wrap(),
                );
            }
            body = body.child(heading("Safe choices", t));
            for choice in &op.safe_choices {
                body = body.child(typed_text(choice, t, w));
            }
            body = body.child(heading("Decide", t));
            if let Some(id) = &op.recovery_decision {
                let id = id.clone();
                body = body.child(
                    row()
                        .gap(8.0)
                        .child(chip("⏎", t, !s.chrome_inert()))
                        .child(label("Open the host recovery decision", t))
                        .on_press_tx(move |s: &mut AppState, tx| {
                            if !s.chrome_inert() {
                                s.open_object(&id);
                                tx.instant();
                            }
                        }),
                );
            } else {
                body = body.child(label("Recovery decision unavailable", t));
            }
        }
        ObjectBody::LocalPrompt(p) => {
            body = body
                .child(heading(
                    format!(
                        "Local check prompt {} · advisory",
                        p.version
                            .map(|n| n.to_string())
                            .unwrap_or_else(|| "unavailable".into())
                    ),
                    t,
                ))
                .child(small("nothing waits on this", t))
                .child(field(
                    "source",
                    p.source
                        .as_ref()
                        .map(Text::as_str)
                        .unwrap_or("not yet published"),
                    t,
                    w,
                ));
            for gap in &p.gaps {
                body = body.child(field("gaps", gap.as_str(), t, w));
            }
            for missing in &p.missing {
                body = body.child(field("missing", missing.as_str(), t, w));
            }
            body = body.child(document(s, &p.text, w));
        }
        ObjectBody::Unsupported {
            kind,
            reason,
            requires_client,
        } => {
            body = body
                .child(page_title("Unsupported by this client", t))
                .child(label(kind, t))
                .child(
                    label(
                        reason
                            .as_ref()
                            .map(Text::as_str)
                            .unwrap_or("Metadata only · decisions on this object are off"),
                        t,
                    )
                    .wrap(),
                );
            if let Some(version) = requires_client {
                body = body.child(small(format!("Requires client {version}"), t));
            }
        }
    }
    let float_clearance = if s.modal.is_some() || s.which_key {
        320.0
    } else {
        0.0
    };
    let follow = s.follow
        && matches!(&o.body, ObjectBody::Chat(chat)
        if chat.messages.last().is_some_and(|m| s.tab().reader.record.as_deref()
            .map_or(cursor == chat.messages.len().saturating_sub(1), |id| id == m.id)));
    if follow {
        body = body.on_layout_tx(|_: &mut AppState, _, tx| tx.scroll_to_bottom("work.scroll"));
    }
    let mut page = el().size(width, height).child(
        col()
            .key("work.scroll")
            .absolute(a.text, 22.0)
            .w(w)
            .h((height - 22.0 - float_clearance).max(80.0))
            .scroll(rune::ScrollSpec {
                stick_bottom: follow,
            })
            .child(body.key("content.main").pb(24.0)),
    );
    if let Some((x, _)) = a.left {
        page = page.child(left.absolute(x, 22.0));
    }
    if let Some((x, _)) = a.notes {
        page = page.child(notes.absolute(x, 70.0));
    }
    page
}

/// Line LCS with a fixed allocation/work budget. Large changes use a common-prefix/
/// suffix hunk, explicitly labelled rather than pretending to be a minimal diff.
fn line_diff(old: &str, new: &str, t: render_content::Theme, width: f32) -> El {
    let a: Vec<_> = old.split_inclusive('\n').collect();
    let b: Vec<_> = new.split_inclusive('\n').collect();
    let mut rows: Vec<(char, Option<usize>, Option<usize>, &str)> = Vec::new();
    let bounded = (a.len() + 1).saturating_mul(b.len() + 1) > 1_000_000;
    if bounded {
        let prefix = a.iter().zip(&b).take_while(|(a, b)| a == b).count();
        let suffix = a[prefix..]
            .iter()
            .rev()
            .zip(b[prefix..].iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        for (i, line) in a.iter().enumerate().take(a.len() - suffix).skip(prefix) {
            rows.push(('-', Some(i + 1), None, *line));
        }
        for (j, line) in b.iter().enumerate().take(b.len() - suffix).skip(prefix) {
            rows.push(('+', None, Some(j + 1), *line));
        }
    } else {
        let columns = b.len() + 1;
        let mut lengths = vec![0u32; (a.len() + 1) * columns];
        for i in (0..a.len()).rev() {
            for j in (0..b.len()).rev() {
                lengths[i * columns + j] = if a[i] == b[j] {
                    1 + lengths[(i + 1) * columns + j + 1]
                } else {
                    lengths[(i + 1) * columns + j].max(lengths[i * columns + j + 1])
                };
            }
        }
        let (mut i, mut j) = (0, 0);
        while i < a.len() || j < b.len() {
            if i < a.len() && j < b.len() && a[i] == b[j] {
                rows.push((' ', Some(i + 1), Some(j + 1), b[j]));
                i += 1;
                j += 1;
            } else if i < a.len()
                && (j == b.len() || lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1])
            {
                rows.push(('-', Some(i + 1), None, a[i]));
                i += 1;
            } else {
                rows.push(('+', None, Some(j + 1), b[j]));
                j += 1;
            }
        }
    }
    let changed: Vec<_> = rows
        .iter()
        .enumerate()
        .filter_map(|(i, r)| (r.0 != ' ').then_some(i))
        .collect();
    let mut result = col().w(width).gap(0.0);
    if bounded {
        result = result.child(
            small(
                "Large comparison · common-prefix/suffix hunk (minimal diff budget exceeded)",
                t,
            )
            .wrap(),
        );
    }
    if changed.is_empty() {
        return result.child(small("No source changes", t));
    }
    let mut visible = vec![bounded; rows.len()];
    for i in changed {
        let end = (i + 4).min(rows.len());
        visible[i.saturating_sub(3)..end].fill(true);
    }
    let visible_count = visible.iter().filter(|v| **v).count();
    if visible_count > 4000 {
        result = result.child(
            small(
                "Comparison preview limited to 4000 rows · source bytes are retained",
                t,
            )
            .wrap(),
        );
    }
    let mut last = None;
    for (i, (kind, old_line, new_line, source)) in rows
        .iter()
        .enumerate()
        .filter(|(i, _)| visible[*i])
        .take(4000)
    {
        if last.is_none_or(|n| i > n + 1) {
            result = result.child(mono(
                format!(
                    "@@ -{} +{} @@",
                    old_line.unwrap_or(0),
                    new_line.unwrap_or(0)
                ),
                t,
            ));
        }
        last = Some(i);
        let key = match kind {
            '+' => "add",
            '-' => "del",
            _ => "context",
        };
        let mut line = row()
            .w(width)
            .gap(8.0)
            .key(format!("diff.{key}.{i}"))
            .child(
                mono(
                    format!(
                        "{} {} {kind}",
                        old_line.map_or(String::new(), |n| n.to_string()),
                        new_line.map_or(String::new(), |n| n.to_string())
                    ),
                    t,
                )
                .w(76.0),
            )
            .child(
                mono(source.trim_end_matches('\n'), t)
                    .w((width - 84.0).max(20.0))
                    .wrap_anywhere(),
            );
        if *kind != ' ' {
            line = line.fill(t.token(if *kind == '+' {
                "tint.diff_add"
            } else {
                "tint.diff_del"
            }));
        }
        result = result.child(line);
    }
    result
}

fn review_count(c: ReviewCount) -> String {
    if c.completed >= c.limit {
        format!(
            "reviews {} · limit {} reached · no automatic rework · a passing review still counts",
            c.completed, c.limit
        )
    } else {
        format!("reviews {} of {}", c.completed, c.limit)
    }
}
fn role_color(role: RoleClass) -> &'static str {
    match role {
        RoleClass::Human => "kind.you",
        RoleClass::Reviewer => "kind.reviewer",
        RoleClass::Worker => "kind.worker",
        _ => "fg.default",
    }
}
pub fn composer(s: &AppState, width: f32) -> El {
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
                    tx.scroll_to_y("editor.viewport", reveal_y)
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
                    tx.scroll_to_y("editor.viewport", reveal_y)
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
    let mut body = col()
        .gap(8.0)
        .w(width)
        .padding(12.0)
        .fill(t.token("surface.side"))
        .border(1.0, t.token("border.strong"))
        .child(small(
            if insert {
                "local · editing"
            } else {
                "local draft · press Insert to edit"
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
                .child(small("leave Insert · stays on this device", t)),
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
    if s.composer.is_some() {
        body = body.on_layout_tx(|_: &mut AppState, _, tx| {
            tx.scroll_into_view("editor.composer");
        });
    }
    body.key("editor.composer")
}
