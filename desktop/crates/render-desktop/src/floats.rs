use crate::{
    AppState,
    screen::{Modal, PickerKind},
    ui::*,
};
use render_core::*;
use rune::{El, col, el, row};

pub fn fullscreen(s: &AppState) -> bool {
    matches!(s.modal, Some(Modal::Diagram { .. }))
}

/// Parent frame may use this in place of the bottom float for full-view diagrams.
pub fn fullscreen_view(s: &AppState, width: f32, height: f32) -> El {
    let Some(Modal::Diagram { source, zoom, pan }) = &s.modal else {
        return el();
    };
    el().size(width, height)
        .fill(s.theme.token("surface.readback"))
        .clip_rounded(0.0)
        .child(
            render_content::render_mermaid_full(source, s.theme, width)
                .scale(*zoom)
                .absolute(pan[0], pan[1] + 40.0),
        )
        .child(
            label(
                "Diagram · hjkl pan · +/- zoom · 0 reset · Esc q close",
                s.theme,
            )
            .absolute(24.0, 12.0),
        )
}

pub fn height(s: &AppState, window: f32) -> f32 {
    let desired: f32 = if matches!(s.modal, Some(Modal::Handover)) {
        300.0
    } else if s.modal.is_none() {
        210.0
    } else {
        360.0
    };
    desired.min(window * 0.40)
}
pub fn view(s: &AppState, width: f32, height: f32) -> El {
    if fullscreen(s) {
        return fullscreen_view(s, width, height);
    }
    let t = s.theme;
    let inner = (width - 96.0).max(40.0);
    let mut body = col().gap(10.0).w(inner);
    match &s.modal {
        None => {
            body = body.child(label(
                if s.pending == "<leader>a" {
                    "authorize · every command reads back its exact basis before it binds"
                } else {
                    "display only · decides nothing"
                },
                t,
            ));
            let columns = if width < 1180.0 {
                2
            } else if s.pending == "<leader>a" {
                3
            } else {
                5
            };
            let children = s.keymap.children(&s.pending, "n", s.context());
            let mut grid = col().equal_columns(columns).gap(12.0).w(inner);
            for child in children {
                let reason = child.command.and_then(|c| s.command_reason(&c.id));
                let available = reason.is_none();
                grid = grid.child(
                    row()
                        .gap(8.0)
                        .min_h(23.0)
                        .child(chip(&child.key.replace("<leader>", "␣"), t, available))
                        .child(
                            small(
                                format!(
                                    "{}{}",
                                    child.label,
                                    reason.map(|r| format!(" · {r}")).unwrap_or_default()
                                ),
                                t,
                            )
                            .wrap()
                            .shrink(),
                        ),
                );
            }
            body = body.child(grid);
        }
        Some(Modal::Handover) => {
            if let Some(o) = s.current_object() {
                body = body
                    .child(
                        label(o.title.as_deref().unwrap_or(&o.id), t)
                            .font(style(14.0, 20.0, 600.0)),
                    )
                    .child(crate::views::handover(
                        s,
                        &o.handover,
                        o.next.as_ref(),
                        inner,
                    ));
            } else if let Some(row) = s
                .selected_id()
                .and_then(|id| s.core.host.attention.rows.iter().find(|r| r.object == id))
            {
                body = body
                    .child(label(row.title.as_deref().unwrap_or(&row.id), t))
                    .child(crate::views::handover(
                        s,
                        &row.handover,
                        row.next.as_ref(),
                        inner,
                    ));
            } else {
                body = body.child(label(
                    "Handover unavailable · the host has not supplied this record",
                    t,
                ));
            }
            body = body.child(keys(
                &[
                    ("j k", "move"),
                    ("⏎", "opens"),
                    ("␣n", "opens next"),
                    ("K", "closes"),
                ],
                s,
            ));
        }
        Some(Modal::Readback) => {
            if let Some(r) = &s.core.session.readback {
                let phase = s.core.readback_phase();
                let state = match &phase {
                    Some(ReadbackPhase::Fresh) => {
                        if r.drawn_at.is_some() {
                            "fresh · every basis field acknowledged".into()
                        } else {
                            "fresh · awaiting native draw".into()
                        }
                    }
                    Some(ReadbackPhase::Stale(changes)) => format!(
                        "STALE · {} not yet acknowledged",
                        changes
                            .iter()
                            .map(|c| c.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    Some(ReadbackPhase::Changed(changes)) => format!(
                        "CHANGED · {} moved while this was open",
                        changes
                            .iter()
                            .map(|c| c.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    Some(ReadbackPhase::Blocked(reason)) => {
                        format!("confirm disabled · {reason:?}")
                    }
                    Some(ReadbackPhase::Sent(id)) => format!(
                        "sent · {}",
                        s.core
                            .entry(id)
                            .map(|e| format!("{:?}", e.state))
                            .unwrap_or_else(|| "awaiting receipt".into())
                    ),
                    None => "unavailable".into(),
                };
                body = body.child(
                    row()
                        .gap(14.0)
                        .child(
                            mono(
                                format!(
                                    "◆ {}",
                                    match r.action.command {
                                        CommandType::ApproveCheckpoint => "APPROVE",
                                        CommandType::RequestRework => "REWORK",
                                        CommandType::RecordDecision => "ANSWER",
                                        CommandType::ConfirmShape => "CONFIRM",
                                        CommandType::AcceptIntake
                                        | CommandType::AcceptAmendment => "ACCEPT",
                                        CommandType::SupersedeContract => "SUPERSEDE",
                                        CommandType::CancelWork => "CANCEL",
                                        CommandType::SetCheckpointSettings => "ROUTE",
                                        CommandType::SavePolicyRevision => "SAVE",
                                        CommandType::AdoptPolicy => "ADOPT",
                                        _ => "UNAVAILABLE",
                                    }
                                ),
                                t,
                            )
                            .px(8.0)
                            .py(4.0)
                            .fill(t.token("state.attn"))
                            .color(t.token("surface.read")),
                        )
                        .child(label(&r.pin.object, t))
                        .child(small(state, t).shrink()),
                );
                let left_width = if width >= 1180.0 { 400.0 } else { inner * 0.44 };
                let right_width = (inner - left_width - 40.0).max(100.0);
                let mut binds = col()
                    .gap(2.0)
                    .w(left_width)
                    .child(small("binds", t).color(t.token("kind.you")));
                for field in &r.decidable.basis.fields {
                    let value = match (&field.revision, &field.digest) {
                        (Some(rev), Some(digest)) => format!("{rev} {digest}"),
                        (Some(rev), None) => rev.clone(),
                        (None, Some(digest)) => digest.clone(),
                        (None, None) => field.label.clone().unwrap_or_else(|| "none".into()),
                    };
                    let value = format!(
                        "{value}{}{}{}{}{}",
                        field
                            .reference
                            .as_ref()
                            .map(|v| format!(" · ref {v}"))
                            .unwrap_or_default(),
                        field
                            .label
                            .as_ref()
                            .map(|v| format!(" · {v}"))
                            .unwrap_or_default(),
                        field
                            .changed_seq
                            .map(|v| format!(" · seq {v}"))
                            .unwrap_or_default(),
                        field
                            .changed_at
                            .as_ref()
                            .map(|v| format!(" · at {}ms UTC (offset {}m)", v.utc_ms, v.offset_min))
                            .unwrap_or_default(),
                        field
                            .changed_by
                            .as_ref()
                            .map(|v| format!(" · by {v}"))
                            .unwrap_or_default()
                    );
                    binds = binds.child(
                        row()
                            .gap(8.0)
                            .child(small(&field.name, t).w(96.0))
                            .child(mono(value, t).w((left_width - 104.0).max(30.0)).wrap()),
                    );
                }
                let mut consequence = col().gap(10.0).w(right_width);
                if let Some(option) = r.action.option {
                    let text = s
                        .core
                        .host
                        .objects
                        .get(&r.pin.object)
                        .and_then(|o| match &o.body {
                            ObjectBody::Decision(d) => {
                                d.options.iter().find(|o| o.n == option).map(|o| {
                                    format!(
                                        "option {option} · {}\n{}",
                                        o.title.as_str(),
                                        o.body.as_str()
                                    )
                                })
                            }
                            _ => None,
                        })
                        .unwrap_or_else(|| format!("option {option} · option text unavailable"));
                    consequence = consequence.child(field("answer", &text, t, right_width));
                }
                if let Some(note) = &r.note {
                    consequence = consequence.child(content_bar(note, t, right_width, 4));
                }
                if !r.edits.is_empty() {
                    consequence = consequence.child(field(
                        "changes",
                        &r.edits
                            .iter()
                            .map(|(k, v)| {
                                let old = s
                                    .core
                                    .host
                                    .objects
                                    .get(&r.pin.object)
                                    .and_then(|o| match &o.body {
                                        ObjectBody::Settings(settings) => settings
                                            .policy_fields
                                            .iter()
                                            .find(|(name, _)| name == k)
                                            .map(|(_, v)| v.as_str()),
                                        _ => None,
                                    })
                                    .unwrap_or("absent");
                                format!("{k}: {old} → {v}")
                            })
                            .collect::<Vec<_>>()
                            .join(" · "),
                        t,
                        right_width,
                    ));
                }
                if r.action.command == CommandType::SetCheckpointSettings
                    && let Some(Object {
                        body: ObjectBody::Settings(settings),
                        ..
                    }) = s.core.host.objects.get(&r.pin.object)
                {
                    for pending in &settings.pending {
                        consequence =
                            consequence.child(field("pending", pending.as_str(), t, right_width));
                    }
                }
                if let Some(carries) = &r.action.carries {
                    consequence =
                        consequence.child(field("carries", carries.as_str(), t, right_width));
                }
                consequence = consequence.child(field(
                    "effect",
                    r.action
                        .effect
                        .as_ref()
                        .map(Text::as_str)
                        .unwrap_or("unavailable"),
                    t,
                    right_width,
                ));
                for not in &r.action.not {
                    consequence = consequence.child(field("not", not.as_str(), t, right_width));
                }
                if matches!(phase, Some(ReadbackPhase::Fresh)) && r.sent.is_none() {
                    consequence =
                        consequence.child(
                            row()
                                .gap(6.0)
                                .child(chip("y", t, true).key("readback.confirm").on_press_tx(
                                    |s: &mut AppState, _| s.message("press y to confirm"),
                                ))
                                .child(label("confirm", t)),
                        );
                } else {
                    consequence = consequence.child(label("confirm disabled", t));
                }
                consequence =
                    consequence.child(keys(&[("n Esc q", "cancel"), ("K", "full basis")], s));
                if matches!(
                    phase,
                    Some(ReadbackPhase::Stale(_) | ReadbackPhase::Changed(_))
                ) {
                    consequence = consequence.child(keys(&[("d", "show changes")], s));
                }
                body = body.child(row().gap(40.0).child(binds).child(consequence));
            }
        }
        Some(Modal::SaveDrafts { count }) => {
            body=body.child(heading(format!("Save {count} local drafts first?"),t)).child(label("The authority readback can open only after the host receipt and observed saved basis. Nothing is approved by this save.",t).w(inner).wrap()).child(keys(&[("y","save drafts"),("n Esc","cancel")],s));
        }
        Some(Modal::Ex(query)) => {
            body = body.child(small(
                "Command line · commands resolve in the current view",
                t,
            ));
            for entry in s.keymap.palette(query, s.context()).into_iter().take(8) {
                body = body.child(
                    row()
                        .gap(12.0)
                        .child(mono(&entry.command.ex, t).w(150.0))
                        .child(label(&entry.command.desc, t))
                        .child(
                            small(s.command_reason(&entry.command.id).unwrap_or_default(), t)
                                .truncate(),
                        ),
                );
            }
            body = body.child(mono(format!(":{query}▌"), t).key("command.input").mt(8.0));
        }
        Some(Modal::Picker {
            kind,
            query,
            selected: cursor,
        }) => {
            let rows = picker_rows(s, *kind, query);
            body = body.child(small(
                format!(
                    "{} results · {}",
                    rows.len(),
                    match kind {
                        PickerKind::Commands => "all commands, including unavailable",
                        PickerKind::Objects => "host objects · kind prefixes supported",
                        PickerKind::Recent => "recent objects",
                        PickerKind::Search => "loaded content only · no remote search",
                        PickerKind::Tabs => "open views",
                        PickerKind::Theme => "live theme",
                        PickerKind::History => "command history",
                        PickerKind::Lines => "current source lines",
                    }
                ),
                t,
            ));
            let start = cursor.saturating_sub(6);
            let pane_width = (inner - 24.0) / 2.0;
            let mut candidates = col().w(pane_width);
            for (i, line) in rows.iter().enumerate().skip(start).take(8) {
                candidates = candidates.child(
                    selected(
                        label(line, t).min_h(26.0).px(10.0).w(pane_width).wrap(),
                        t,
                        i == *cursor,
                        true,
                    )
                    .key(format!("picker.row.{i}"))
                    .on_press_tx(move |s: &mut AppState, tx| s.picker_pointer(i, tx)),
                );
            }
            let preview = col()
                .key("picker.preview")
                .size(pane_width, (height - 120.0).max(40.0))
                .scroll(rune::ScrollSpec {
                    stick_bottom: false,
                })
                .child(render_content::render_markdown(&s.picker_preview(), t, pane_width).inert());
            body = body.child(row().gap(24.0).child(candidates).child(preview));
            body = body
                .child(mono(format!("> {query}▌"), t).key("picker.input"))
                .child(keys(
                    &[
                        ("C-j C-k", "move"),
                        ("C-n C-p", "preview page"),
                        ("C-l", "export objects"),
                        ("⏎", "select"),
                        ("Esc", "cancel"),
                    ],
                    s,
                ));
        }
        Some(Modal::Filter { selected: cursor }) => {
            body = body.child(heading("Filter · host lifecycle states", t));
            for (i, state) in s.core.host.lifecycle_states.iter().enumerate() {
                let count = s
                    .core
                    .host
                    .slices
                    .rows
                    .iter()
                    .filter(|r| r.lifecycle == state.state)
                    .count();
                body = body.child(selected(
                    label(
                        format!(
                            "{} {}  {count}",
                            if s.filters.contains(&state.state) {
                                "[x]"
                            } else {
                                "[ ]"
                            },
                            state.label
                        ),
                        t,
                    )
                    .h(23.0),
                    t,
                    i == *cursor,
                    true,
                ));
            }
            if s.core.host.lifecycle_states.is_empty() {
                body = body.child(label("Lifecycle vocabulary unavailable", t));
            }
            body = body.child(keys(
                &[
                    ("j k", "move"),
                    ("x", "toggle"),
                    ("X", "only"),
                    ("Esc", "close"),
                ],
                s,
            ));
        }
        Some(Modal::Outbox { selected: cursor }) => {
            body = body.child(heading("Outbox · commands from this device", t));
            if s.core.local.outbox.is_empty() {
                body = body.child(label("No commands in the outbox", t));
            }
            for (i, entry) in s.core.local.outbox.iter().enumerate() {
                let mut item = col()
                    .gap(4.0)
                    .py(6.0)
                    .child(mono(
                        format!(
                            "{}  {}  {}",
                            entry.intent.id,
                            entry.intent.command.keymap_wire(),
                            entry.intent.target
                        ),
                        t,
                    ))
                    .child(small(format!("{:?}", entry.state), t).wrap());
                if matches!(entry.state, OutboxState::Unknown { .. }) {
                    item=item.child(label("No reply · the host may have accepted it · not_found is not proof it was not accepted",t).wrap());
                }
                body = body.child(selected(item, t, i == *cursor, true));
            }
            body = body.child(keys(
                &[
                    ("␣rq", "query receipt, never executes"),
                    ("␣rt", "retry original ID and bytes"),
                    ("Esc", "close"),
                ],
                s,
            ));
        }
        Some(Modal::Url(url)) => {
            body = body
                .child(heading("Open external URL", t))
                .child(mono(url, t).w(inner).wrap())
                .child(label(
                    "Opening the browser does not perform a merge or approve anything.",
                    t,
                ))
                .child(keys(&[("y", "open in browser"), ("n Esc", "cancel")], s));
        }
        Some(Modal::ConfirmDiscard { object }) => {
            body = body.child(heading("Discard local drafts and close?", t))
                .child(label(format!("Only local drafts for {object} are discarded. Host content is unchanged."),t).wrap())
                .child(keys(&[("y", "discard and close"),("n Esc", "keep drafts")],s));
        }
        Some(Modal::PolicyChanges { object }) => {
            body = body.child(heading("Policy changes · explicit local rebase", t));
            for (key, draft) in &s.core.local.drafts {
                if key.object != *object {
                    continue;
                }
                if let DraftBody::Policy(p) = &draft.body {
                    body = body.child(label(format!("Draft base: {}", p.base_revision()), t));
                    for conflict in p.conflicts() {
                        body = body.child(
                            label(
                                format!(
                                    "{} · yours: {} · current: {}",
                                    conflict.field,
                                    conflict.yours,
                                    conflict.current.as_deref().unwrap_or("removed")
                                ),
                                t,
                            )
                            .wrap(),
                        );
                    }
                    if p.safe_edits().is_err() {
                        body = body.child(label("Unresolved conflicts or incomplete key=value text. Confirmation is blocked.",t).wrap());
                    }
                }
            }
            body = body.child(keys(
                &[
                    ("d", "rebase against current host policy"),
                    ("i Enter", "return to editor"),
                    ("q Esc", "close"),
                ],
                s,
            ));
        }
        Some(Modal::Diagram { .. }) => unreachable!("handled fullscreen above"),
        Some(Modal::Info { title, lines }) => {
            body = body.child(heading(title, t));
            for line in lines {
                body = body.child(label(line, t).w(inner).wrap());
            }
            body = body.child(keys(&[("Esc q", "close")], s));
        }
    }
    el().size(width, height)
        .fill(t.token("surface.readback"))
        .child(
            el().absolute(0.0, 0.0)
                .size(width, 2.0)
                .fill(t.token("state.attn")),
        )
        .child(
            col()
                .key("float.scroll")
                .absolute(48.0, 12.0)
                .size(inner, (height - 24.0).max(20.0))
                .scroll(rune::ScrollSpec {
                    stick_bottom: false,
                })
                .child(body),
        )
}
fn keys(entries: &[(&str, &str)], s: &AppState) -> El {
    row()
        .gap(12.0)
        .flex_wrap()
        .children(entries.iter().map(|(key, desc)| {
            row()
                .gap(5.0)
                .child(chip(key, s.theme, true))
                .child(small(desc, s.theme))
        }))
}
pub(crate) fn picker_rows(s: &AppState, _kind: PickerKind, _query: &str) -> Vec<String> {
    s.picker_session
        .as_ref()
        .map(|session| session.rows.iter().map(|r| r.label.clone()).collect())
        .unwrap_or_default()
}
