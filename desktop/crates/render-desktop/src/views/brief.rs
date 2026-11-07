use super::*;
use rune::row;

pub fn view(s: &AppState, width: f32, height: f32) -> El {
    let t = s.theme;
    let host = &s.core.host;
    let stacked = width < 1180.0;
    let left_width = if stacked {
        (width - 76.0).min(820.0)
    } else {
        width - 152.0 - (0.397 * (width - 152.0)).round()
    };
    let right_width = if stacked {
        left_width
    } else {
        (0.397 * (width - 152.0)).round()
    };
    let x = if stacked { 44.0 } else { 48.0 };
    let (needs, _, _) = s.counts();
    let title: String =
        if !matches!(host.connection, Connection::Live) && host.attention.rows.is_empty() {
            "Not configured".into()
        } else if needs == 0 {
            "Nothing needs you".into()
        } else {
            "Needs you".into()
        };
    let mut title_row = row()
        .gap(9.0)
        .center_y()
        .child(page_title(title, t).key("brief.title"));
    if needs > 0 {
        title_row = title_row.child(
            page_title(needs.to_string(), t)
                .key("brief.count")
                .color(t.token("state.attn")),
        );
    }
    let mut left = col().w(left_width).gap(0.0).child(title_row.mb(16.0));
    if let Some(summary) = s.presence.summary() {
        let (needs, host, started) = summary.counts();
        let elapsed = summary
            .away
            .map(|age| format!(" ({}m ago)", age.as_secs() / 60))
            .unwrap_or_default();
        let since = summary
            .since
            .map(|time| {
                let minutes = time.utc_ms.div_euclid(60_000).rem_euclid(24 * 60);
                format!("since {:02}:{:02} UTC{elapsed}", minutes / 60, minutes % 60)
            })
            .unwrap_or_else(|| "since your last visit".into());
        let details = summary.explanation().map(str::to_owned).unwrap_or_else(|| {
            format!("{needs} new for you · {host} on the host · {started} started")
        });
        left = left.child(
            small(format!("{since} · {details}"), t)
                .key("brief.since")
                .wrap()
                .w(left_width)
                .mb(12.0),
        );
        if s.since_expanded {
            for changed in &summary.rows {
                let id = changed.id.clone();
                let title = s
                    .attention_rows()
                    .iter()
                    .find(|row| row.object == id)
                    .and_then(|row| row.title.as_deref())
                    .unwrap_or(&id);
                left = left.child(
                    small(
                        format!("{} · {title}", crate::presence::seen_group(changed.group)),
                        t,
                    )
                    .key(format!("brief.since.row.{id}"))
                    .wrap()
                    .w(left_width)
                    .mb(4.0)
                    .on_press(move |s: &mut AppState| {
                        if !s.chrome_inert() {
                            s.select_id(&id);
                        }
                    }),
                );
            }
        }
    }
    if s.lists.pending {
        left = left.child(small("List layout update pending", t));
    }
    if host.attention.rows.is_empty() {
        left = left
            .child(
                label(
                    "Connect a host to see your shift handover. Local drafts stay on this device.",
                    t,
                )
                .w(left_width)
                .wrap(),
            )
            .child(
                small(
                    "Use the command palette to discover navigation and recovery commands.",
                    t,
                )
                .mt(12.0),
            );
    }
    for group in [
        AttentionGroup::NeedsYou,
        AttentionGroup::OnHost,
        AttentionGroup::Waiting,
    ] {
        let rows = s
            .attention_rows()
            .iter()
            .filter(|r| r.group == group)
            .collect::<Vec<_>>();
        if rows.is_empty() {
            continue;
        }
        if group != AttentionGroup::NeedsYou {
            left = left.child(
                label(
                    format!(
                        "{} {}",
                        if group == AttentionGroup::OnHost {
                            "On the host"
                        } else {
                            "Waiting, not on you"
                        },
                        rows.len()
                    ),
                    t,
                )
                .color(t.token("kind.you"))
                .mt(20.0)
                .mb(8.0),
            );
        }
        for (index, r) in rows.into_iter().enumerate() {
            left = left.child(entry(s, r, left_width, index > 0, stacked).ml(-28.0));
        }
    }
    let running = s
        .attention_rows()
        .iter()
        .filter(|r| r.group == AttentionGroup::Running)
        .collect::<Vec<_>>();
    let mut right = col().w(right_width).gap(0.0);
    if !running.is_empty() {
        let slots = host
            .slots
            .map(|v| {
                format!(
                    "slots {}/{}{}",
                    v.used,
                    v.total,
                    if v.held_by_cancelled > 0 {
                        format!(" · {} held by a cancelled run", v.held_by_cancelled)
                    } else {
                        String::new()
                    }
                )
            })
            .unwrap_or_else(|| "slots unavailable".into());
        let mut pips = row().gap(3.0).center_y();
        if let Some(slots) = host.slots {
            for slot in 0..slots.total {
                let hue = running
                    .get(slot as usize)
                    .and_then(|r| r.role.as_ref())
                    .map(|role| {
                        if role.class == RoleClass::Reviewer {
                            "kind.reviewer"
                        } else {
                            "kind.worker"
                        }
                    })
                    .unwrap_or("fg.muted");
                let held =
                    slot < slots.used && slot >= slots.used.saturating_sub(slots.held_by_cancelled);
                let mut pip = el().size(12.0, 5.0).fill(t.token(if slot < slots.used {
                    hue
                } else {
                    "border.subtle"
                }));
                if held {
                    pip = pip.child(
                        el().absolute(1.0, 1.0)
                            .size(10.0, 3.0)
                            .fill(t.token("surface.read")),
                    );
                }
                pips = pips.child(pip);
            }
        }
        right = right.child(
            row()
                .w(right_width)
                .gap(10.0)
                .center_y()
                .mb(10.0)
                .child(label(format!("Running {}", running.len()), t).color(t.token("kind.you")))
                .child(pips)
                .child(el().grow(1.0))
                .child(small(slots, t)),
        );
        for (index, r) in running.into_iter().enumerate() {
            right = right.child(entry(s, r, right_width, index > 0, stacked));
        }
    }
    let done = s
        .attention_rows()
        .iter()
        .filter(|r| r.group == AttentionGroup::Done)
        .collect::<Vec<_>>();
    if !done.is_empty() {
        right = right.child(
            label(
                format!(
                    "{} Done, last 24 h {}",
                    if s.expanded { "⌄" } else { "›" },
                    done.len()
                ),
                t,
            )
            .color(t.token("kind.you"))
            .mt(16.0),
        );
        for r in done {
            if s.expanded
                || matches!(
                    r.mark,
                    Some(RowMark::Failed | RowMark::Unknown | RowMark::Stale)
                )
            {
                right = right.child(entry(s, r, right_width, true, stacked));
            }
        }
    }
    let body = if stacked {
        col().gap(24.0).child(left).child(right)
    } else {
        row().gap(56.0).child(left).child(right)
    };
    el().size(width, height).child(
        col()
            .key("brief.scroll")
            .absolute(x - 28.0, 22.0)
            .w(width - x - 4.0)
            .h((height - 22.0).max(1.0))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
            })
            .child(body.key("content.main").ml(28.0)),
    )
}

fn entry(s: &AppState, r: &AttentionRow, width: f32, separator: bool, stacked: bool) -> El {
    let t = s.theme;
    let band = matches!(
        r.group,
        AttentionGroup::NeedsYou | AttentionGroup::OnHost | AttentionGroup::Waiting
    );
    let inset = if band { 28.0 } else { 0.0 };
    let width = width + if band { 40.0 } else { 0.0 };
    let selected = s.selected_display_id().as_deref() == Some(r.object.as_str());
    if s.tombstoned(&r.object) {
        return crate::ui::selected(
            row()
                .w(width)
                .h(28.0)
                .px(inset)
                .child(label("resolved elsewhere", t).color(t.token("fg.muted"))),
            t,
            selected,
            !s.chrome_inert(),
        )
        .key(format!("row.{}", r.id));
    }
    let needs = r.group == AttentionGroup::NeedsYou;
    let active = !s.chrome_inert();
    let solid = selected && needs && active;
    let waiting = r.group == AttentionGroup::Waiting;
    let fg = if solid {
        "surface.read"
    } else if waiting && r.mark != Some(RowMark::Unknown) {
        "fg.alt"
    } else {
        "fg.default"
    };
    // SC-02 has a dense reason lane, not the content bars used by asks/activity.
    // Keep its start stable across provenance and text length, including missing reasons.
    let title_width = if stacked { 300.0 } else { 440.0 };
    let mark = match r.mark {
        Some(RowMark::NeedsYou) => "◆",
        Some(RowMark::Failed) => "×",
        Some(RowMark::Unknown) => "?",
        Some(RowMark::Running) => "▸",
        Some(RowMark::Waiting) => "◷",
        Some(RowMark::Done) => "✓",
        _ => "○",
    };
    let title = if needs {
        next_label(r.next.as_ref())
    } else {
        r.title.clone().unwrap_or_else(|| r.id.clone())
    };
    let title = label(title, t)
        .font(style(
            if waiting { 13.0 } else { 14.0 },
            20.0,
            if needs { 600.0 } else { 400.0 },
        ))
        .color(t.token(fg))
        .truncate();
    let title = if waiting {
        title.w(title_width).min_w(title_width)
    } else {
        title.grow(1.0)
    };
    let mut head = row()
        .key(format!("brief.head.{}", r.id))
        .gap(10.0)
        .center_y()
        .w(width)
        .min_h(if r.group == AttentionGroup::Waiting {
            27.0
        } else {
            26.0
        })
        .pl(inset)
        .pr(12.0)
        .child(mono(mark, t).w(14.0).color(t.token(if solid {
            "surface.read"
        } else if needs {
            "state.attn"
        } else if r.mark == Some(RowMark::Failed) {
            "state.blocked"
        } else if r.mark == Some(RowMark::Unknown) {
            "state.unknown"
        } else {
            "fg.muted"
        })))
        .child(title);
    if r.group == AttentionGroup::Waiting {
        let reason_width = (width - title_width - 138.0).max(0.0);
        let reason = r.reason.as_ref();
        head = head.child(
            small(reason.map(Text::as_str).unwrap_or(""), t)
                .font(if reason.is_some_and(Text::is_content) {
                    style(13.0, 19.0, 400.0)
                } else {
                    style(12.0, 16.0, 400.0)
                })
                .color(t.token("fg.muted"))
                .w(reason_width)
                .min_w(reason_width)
                .truncate(),
        );
    } else if r.group == AttentionGroup::Running
        && let Some(project) = &r.project
    {
        head = head.child(small(&project.name, t).color(t.token("kind.worker")));
    }
    let age =
        mono(s.age(r.since), t).color(t.token(if solid { "surface.read" } else { "fg.muted" }));
    head = head.child(if waiting {
        row().w(54.0).min_w(54.0).justify_end().child(age)
    } else {
        age
    });
    if solid {
        head = head.fill(t.token("state.attn"));
    }
    if selected && needs {
        head = head.child(on_solid_chip("⏎", t, active));
    }
    let mut body = col().w(width).gap(4.0).child(head);
    if matches!(r.group, AttentionGroup::NeedsYou | AttentionGroup::OnHost) {
        let byline = format!(
            "{}  {}{}",
            if needs {
                r.title.as_deref().unwrap_or("")
            } else {
                ""
            },
            r.project.as_ref().map(|p| p.name.as_str()).unwrap_or(""),
            r.proposal
                .as_ref()
                .map(|p| format!(" / {p}"))
                .unwrap_or_default()
        );
        if !byline.trim().is_empty() {
            body = body.child(
                small(byline, t)
                    .color(t.token("kind.worker"))
                    .pl(inset + 24.0),
            );
        }
    }
    if let Some(role) = &r.role
        && r.group == AttentionGroup::Running
    {
        body = body.child(
            small(
                format!(
                    "{}{}",
                    role.label,
                    r.pass.map(|p| format!(" · pass {p}")).unwrap_or_default()
                ),
                t,
            )
            .color(t.token(match role.class {
                RoleClass::Reviewer => "kind.reviewer",
                RoleClass::Worker => "kind.worker",
                _ => "fg.alt",
            }))
            .pl(24.0),
        );
    }
    if let Some(ask) = &r.ask
        && needs
    {
        body = body.child(typed_text(ask, t, width - inset - 36.0).ml(inset + 24.0));
    }
    if let Some(reason) = &r.reason
        && matches!(r.group, AttentionGroup::OnHost | AttentionGroup::Done)
    {
        body = body.child(typed_text(reason, t, width - inset - 36.0).ml(inset + 24.0));
    }
    if let Some(activity) = &r.last_activity
        && r.group == AttentionGroup::Running
    {
        body = body.child(
            row()
                .gap(8.0)
                .pl(24.0)
                .child(content_bar(
                    activity.text.as_str(),
                    t,
                    (width - 102.0).max(80.0),
                    1,
                ))
                .child(small(s.age(activity.at), t)),
        );
    }
    if let Some(track) = &r.track
        && needs
    {
        body = body.child(small(track_text(Some(track)), t).pl(inset + 24.0));
    }
    if let Some(blocks) = r.downstream {
        body = body.child(small(format!("blocks {}", blocks.transitive), t).pl(inset + 24.0));
    }
    let id = r.object.clone();
    let body = if r.group == AttentionGroup::Waiting {
        body
    } else {
        body.pt(6.0).pb(8.0)
    };
    let mut band = col().w(width).gap(0.0);
    if separator || r.group == AttentionGroup::Waiting {
        band = band.child(rule(t));
    }
    band = band.child(body);
    let band = if needs {
        if selected {
            band.fill(t.token("surface.cursor.read"))
        } else {
            band
        }
    } else {
        crate::ui::selected(band, t, selected, active)
    };
    band.child(hint_overlay(s, &r.object).absolute(0.0, 0.0))
        .key(format!("row.{}", r.id))
        .on_press_tx(move |s: &mut AppState, tx| {
            if !s.chrome_inert() {
                s.open_object(&id);
                tx.instant();
            }
        })
}
