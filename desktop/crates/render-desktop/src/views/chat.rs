use super::editor::composer;
use super::work::role_color;
use super::*;
use rune::row;
pub(super) fn view(s: &AppState, width: f32, height: f32) -> El {
    let Some(o) = s.current_object() else {
        return missing(s, width);
    };
    let ObjectBody::Chat(chat) = &o.body else {
        return missing(s, width);
    };
    let t = s.theme;
    let a = Axis::reading(width, s.wide);
    let w = a.measure;
    let cursor = s.tab().cursor;
    let mut left = col().w(200.);
    let mut notes = col().w(320.);
    let mut body = col().w(w).gap(8.);

    for r in &chat.roster {
        left = left.child(
            row()
                .h(28.)
                .gap(8.)
                .child(
                    label(
                        format!("{} {}", r.candidate.as_deref().unwrap_or(""), r.role.label),
                        t,
                    )
                    .color(t.token(role_color(r.role.class)))
                    .shrink(),
                )
                .child(small(r.state.as_deref().unwrap_or("state unavailable"), t)),
        );
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
                            .child(
                                symbol(
                                    if message.role.class == RoleClass::Human {
                                        "user"
                                    } else {
                                        "agents"
                                    },
                                    t.token(role_color(message.role.class)),
                                    14.0,
                                )
                                .absolute(-24.0, 2.0),
                            )
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
    for artifact in &chat.artifacts {
        notes = notes
            .child(label(&artifact.key, t))
            .child(small(&artifact.state, t));
    }

    let mut footer = col().w(w).gap(8.);
    let mode = chat.turn.as_ref().map(|v| v.send_mode());
    footer = footer.child(
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
    footer = footer.child(composer(s, w));

    let follow = s.follow
        && chat.messages.last().is_some_and(|m| {
            s.tab()
                .reader
                .record
                .as_deref()
                .map_or(cursor == chat.messages.len().saturating_sub(1), |id| {
                    id == m.id
                })
        });
    if follow {
        body = body.on_layout_tx(|_: &mut AppState, _, tx| {
            tx.scroll_to_bottom("work.scroll");
            tx.live_only();
        });
    }
    let mut page = el().size(width, height).child(
        col()
            .absolute(a.text - 24., 22.)
            .w(w + 24.)
            .h((height - 36.).max(80.))
            .min_h(0.)
            .child(
                col()
                    .key("work.scroll")
                    .w(w + 24.)
                    .grow(1.)
                    .min_h(0.)
                    .scroll(rune::ScrollSpec {
                        stick_bottom: follow,
                    })
                    .child(body.key("content.main").pl(24.).w(w + 24.).pb(24.)),
            )
            .child(footer.ml(24.)),
    );
    if let Some((x, _)) = a.left {
        page = page.child(left.absolute(x, 22.));
    }
    if let Some((x, _)) = a.notes {
        page = page.child(notes.absolute(x, 70.));
    }
    page
}
