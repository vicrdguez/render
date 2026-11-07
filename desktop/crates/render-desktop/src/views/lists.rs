use super::*;
use rune::row;

pub fn view(s: &AppState, width: f32, height: f32) -> El {
    let t = s.theme;
    let peek = width >= 1180.0 && !matches!(s.modal, Some(crate::screen::Modal::Handover));
    let peek_width = (0.357 * width).round().max(440.0);
    let list_width = if peek {
        width - peek_width - 92.0
    } else {
        width - 96.0
    };
    let ids = s.visible_ids();
    let mut body = col()
        .w(list_width)
        .gap(0.0)
        .child(page_title(format!("{} {}", s.screen().title(), ids.len()), t).mb(14.0));
    if s.screen() == Screen::Slices {
        body = body.child(
            small(
                if s.filters.is_empty() {
                    "all open · dependency order".into()
                } else {
                    format!(
                        "{} · dependency order",
                        s.filters.iter().cloned().collect::<Vec<_>>().join(" × · ")
                    )
                },
                t,
            )
            .mb(16.0),
        );
    }
    if s.lists.pending {
        body = body.child(small("List layout update pending", t));
    }
    if ids.is_empty() {
        body = body
            .child(label("No matching host records in this scope.", t))
            .child(small("Unavailable records are never substituted.", t).mt(8.0));
    }
    let mut previous = String::new();
    for id in &ids {
        let focused = s.selected_display_id().as_ref() == Some(id);
        if s.tombstoned(id) {
            body = body.child(
                selected(
                    row()
                        .w(list_width)
                        .h(28.0)
                        .px(8.0)
                        .child(label("resolved elsewhere", t).color(t.token("fg.muted"))),
                    t,
                    focused,
                    !s.chrome_inert(),
                )
                .key(format!("row.{id}")),
            );
            continue;
        }
        let needs;
        let (group, first, second) = match s.screen() {
            Screen::Slices => {
                let Some(r) = s.slice_rows().iter().find(|r| &r.id == id) else {
                    continue;
                };
                needs = r.wait == Some(WaitClass::Human);
                (
                    format!(
                        "{} / {}",
                        r.project
                            .as_ref()
                            .map(|p| p.name.as_str())
                            .unwrap_or("project unavailable"),
                        r.proposal.as_deref().unwrap_or("proposal unavailable")
                    ),
                    r.title.clone().unwrap_or_else(|| r.id.clone()),
                    format!(
                        "{} · {}",
                        r.lifecycle,
                        r.reason
                            .as_ref()
                            .map(Text::as_str)
                            .unwrap_or("waiting state unavailable")
                    ),
                )
            }
            Screen::Results => {
                let Some(r) = s
                    .tab()
                    .results
                    .as_ref()
                    .and_then(|r| r.rows.iter().find(|r| &r.object == id))
                else {
                    continue;
                };
                needs = false;
                (String::new(), r.title.clone(), r.object.clone())
            }
            Screen::Proposals => {
                let Some(r) = s.proposal_rows().iter().find(|r| &r.id == id) else {
                    continue;
                };
                needs = r.needs_you;
                (
                    String::new(),
                    format!(
                        "{} / {}",
                        r.project
                            .as_ref()
                            .map(|p| p.name.as_str())
                            .unwrap_or("project unavailable"),
                        r.name
                    ),
                    format!(
                        "{}ready: {} · forge: {}",
                        if r.readiness.duplicate_risk_since.is_some() {
                            "? duplicate risk · "
                        } else {
                            ""
                        },
                        r.readiness
                            .eligibility
                            .as_ref()
                            .map(Text::as_str)
                            .unwrap_or("unavailable"),
                        r.readiness
                            .forge
                            .as_ref()
                            .map(Text::as_str)
                            .unwrap_or("not observed yet")
                    ),
                )
            }
            Screen::Agents => {
                let Some(r) = s.agent_rows().iter().find(|r| &r.assignment == id) else {
                    continue;
                };
                needs = r.waits_on_you;
                (
                    match r.group {
                        AgentGroup::Executing => "Executing",
                        AgentGroup::OnHost => "On the host",
                        AgentGroup::Held => "Held",
                        AgentGroup::Queued => "Queued",
                    }
                    .into(),
                    format!(
                        "{}  {}{}  {}",
                        r.slot
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "none".into()),
                        r.assignment,
                        r.generation.map(|g| format!("·g{g}")).unwrap_or_default(),
                        r.workflow_title
                            .as_deref()
                            .unwrap_or("workflow unavailable")
                    ),
                    format!(
                        "{} · {}{}",
                        r.role
                            .as_ref()
                            .map(|r| r.label.as_str())
                            .unwrap_or("role unavailable"),
                        r.execution
                            .map(|e| format!("{e:?}").to_lowercase())
                            .unwrap_or_else(|| "execution unavailable".into()),
                        r.cancellation
                            .map(|c| format!(" · {c:?}").to_lowercase())
                            .unwrap_or_default()
                    ),
                )
            }
            _ => continue,
        };
        if group != previous && !group.is_empty() {
            body = body.child(label(&group, t).color(t.token("kind.you")).mt(14.0).mb(6.0));
            previous = group;
        }
        let solid = focused && needs && !s.chrome_inert();
        let mut entry = col()
            .w(list_width)
            .min_h(if s.screen() == Screen::Proposals {
                52.0
            } else {
                28.0
            })
            .py(4.0)
            .px(8.0)
            .child(
                row()
                    .gap(10.0)
                    .w(list_width - 16.0)
                    .center_y()
                    .child(
                        mono(if needs { "◆" } else { "·" }, t).color(t.token(if solid {
                            "surface.read"
                        } else if needs {
                            "state.attn"
                        } else {
                            "fg.muted"
                        })),
                    )
                    .child(
                        label(first, t)
                            .color(t.token(if solid { "surface.read" } else { "fg.default" }))
                            .truncate()
                            .grow(1.0),
                    )
                    .children((focused && needs).then(|| on_solid_chip("⏎", t, !s.chrome_inert()))),
            );
        entry = entry.child(
            small(second, t)
                .color(t.token(if solid { "surface.read" } else { "fg.alt" }))
                .truncate(),
        );
        if solid {
            entry = entry.fill(t.token("state.attn"));
        } else {
            entry = selected(entry, t, focused, !s.chrome_inert());
        }
        let target = id.clone();
        body = body
            .child(
                entry
                    .child(hint_overlay(s, id).absolute(0.0, 0.0))
                    .key(format!("row.{id}"))
                    .on_press_tx(move |s: &mut AppState, tx| {
                        if !s.chrome_inert() {
                            if s.screen() == Screen::Results {
                                s.open_object_missing(&target);
                            } else {
                                s.open_object(&target);
                            }
                            tx.instant();
                        }
                    }),
            )
            .child(rule(t));
    }
    if s.screen() == Screen::Slices && !s.filters.is_empty() {
        body = body.child(
            row()
                .gap(8.0)
                .mt(16.0)
                .child(chip(":filter clear", t, !s.chrome_inert()).on_press_tx(
                    |s: &mut AppState, tx| {
                        if !s.chrome_inert() {
                            s.filters.clear();
                            tx.instant();
                        }
                    },
                ))
                .child(small("shows all states", t)),
        );
    }
    let mut page = el().size(width, height).child(
        col()
            .key("list.scroll")
            .absolute(48.0, 22.0)
            .size(list_width, (height - 22.0).max(1.0))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(body.key("content.main")),
    );
    if peek && let Some(o) = s.current_object() {
        let pw = peek_width - 40.0;
        let mut details = col()
            .gap(12.0)
            .w(pw)
            .child(label(o.title.as_deref().unwrap_or(&o.id), t).font(style(14.0, 20.0, 600.0)));
        if let ObjectBody::Proposal(p) = &o.body {
            details = details.child(readiness(&p.readiness, t, pw));
        } else {
            details = details.child(handover(s, &o.handover, o.next.as_ref(), pw));
        }
        page = page.child(details.key("list.peek").absolute(width - peek_width, 22.0));
    }
    page
}

pub fn readiness(r: &Readiness, t: render_content::Theme, width: f32) -> El {
    col().gap(10.0).child(heading("Readiness", t)).children(
        [
            ("eligible", r.eligibility.as_ref()),
            ("published", r.published.as_ref()),
            ("promotion", r.promotion.as_ref()),
            ("on the forge", r.forge.as_ref()),
        ]
        .into_iter()
        .enumerate()
        .map(|(i, (name, value))| {
            field(
                name,
                value.map(Text::as_str).unwrap_or("not observed yet"),
                t,
                width,
            )
            .key(format!("readiness.{i}"))
        }),
    )
}
