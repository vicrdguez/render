use crate::{
    AppState,
    screen::{Modal, Screen},
    ui::*,
};
use rune::{Cx, El, el, row};

pub fn view(s: &AppState, cx: &mut Cx<AppState>) -> El {
    let [width, height] = cx.layout_size("frame.root").unwrap_or([1512.0, 982.0]);
    let t = s.theme;
    if crate::floats::fullscreen(s) {
        return el()
            .key("frame.root")
            .w_full()
            .h_full()
            .fill(t.token("surface.read"))
            .child(crate::floats::fullscreen_view(s, width, height));
    }
    let top = if s.screen().work() { 76.0 } else { 36.0 };
    let stage_height = (height - top - 52.0).max(1.0);
    let mut root = el()
        .key("frame.root")
        .on_paste(AppState::paste_composer)
        .w_full()
        .h_full()
        .fill(t.token("surface.read"))
        .child(tabs(s, width).absolute(0.0, 0.0))
        .child(
            el().key("frame.stage")
                .absolute(0.0, top)
                .size(width, stage_height)
                .clip_rounded(0.0)
                .child(crate::views::stage(s, width, stage_height)),
        )
        .child(status(s, width).absolute(0.0, height - 52.0))
        .child(
            row()
                .key("frame.echo")
                .absolute(0.0, height - 26.0)
                .size(width, 26.0)
                .fill(t.token("surface.side"))
                .px(16.0)
                .center_y()
                .child(
                    small(
                        if matches!(s.operator.as_deref(), Some("c" | "gc")) {
                            "Note · choose a motion: ip paragraph · Esc cancel"
                        } else {
                            s.echo()
                        },
                        t,
                    )
                    .truncate()
                    .w((width - 32.0).max(1.0)),
                ),
        );
    if s.screen().work() {
        root = root.child(track(s, width).absolute(0.0, 36.0));
    }
    if s.modal.is_some() || s.which_key {
        let fh = crate::floats::height(s, height);
        root = root.child(
            crate::floats::view(s, width, fh)
                .key("frame.float")
                .absolute(0.0, height - 52.0 - fh)
                .size(width, fh),
        );
    }
    root
}

fn tabs(s: &AppState, width: f32) -> El {
    let t = s.theme;
    let inert = s.modal.is_some() || s.which_key;
    let mut nav = row().gap(0.0).pl(80.0).h(36.0).center_y();
    for (name, command) in [
        ("slices", "open.explorer"),
        ("document", "open.proposals"),
        ("agents", "open.agents"),
        ("find", "find.object"),
    ] {
        nav = nav.child(
            el().size(28.0, 28.0)
                .center()
                .child(symbol(name, t.token("fg.muted"), 16.0))
                .key(format!("nav.{name}"))
                .on_press_tx(move |s: &mut AppState, tx| {
                    if !s.chrome_inert() {
                        s.command(command, tx);
                    }
                }),
        );
    }
    let available = (width - 350.0).max(140.0);
    let tab_width = (available / s.tabs.len().max(1) as f32).min(240.0);
    for (i, tab) in s.tabs.iter().enumerate() {
        let active = i == s.active;
        let mut cell = row()
            .gap(7.0)
            .center_y()
            .px(14.0)
            .h(36.0)
            .w(tab_width)
            .child(mono((i + 1).to_string(), t).color(t.token("kind.literal")))
            .child(symbol(
                tab.screen.icon(),
                t.token(if active && !inert {
                    "fg.alt"
                } else {
                    "fg.muted"
                }),
                14.0,
            ));
        if active || tab_width > 120.0 {
            cell = cell.child(
                label(s.tab_title(tab), t)
                    .truncate()
                    .shrink()
                    .color(t.token(if active && !inert {
                        "fg.default"
                    } else {
                        "fg.muted"
                    })),
            );
        }
        let mut wrapper = el()
            .h(36.0)
            .key(format!("tab.{i}"))
            .child(cell)
            .on_press_tx(move |s: &mut AppState, tx| {
                if !s.chrome_inert() {
                    s.active = i;
                    s.pending.clear();
                    tx.instant();
                }
            });
        if active {
            wrapper = wrapper.fill(t.token("surface.read")).child(
                el().absolute(0.0, 0.0)
                    .w_full()
                    .h(2.0)
                    .fill(t.token("state.attn")),
            );
        }
        nav = nav.child(wrapper);
    }
    let (needs, host, unknown) = s.counts();
    let mut tags = row().gap(10.0).center_y();
    for (key, mark, count, color) in [
        ("count.needs", "◆", needs, "state.attn"),
        ("count.host", "×", host, "state.blocked"),
        ("count.unknown", "?", unknown, "state.unknown"),
    ] {
        if count > 0 {
            tags = tags.child(
                mono(format!("{mark} {count}"), t)
                    .key(key)
                    .px(5.0)
                    .h(16.0)
                    .radius(2.0)
                    .color(t.token("surface.read"))
                    .fill(t.token(color)),
            );
        }
    }
    el().key("frame.tabs")
        .size(width, 36.0)
        .fill(t.token("surface.side"))
        .window_drag()
        .child(nav)
        .child(
            tags.absolute(
                (width
                    - (if needs > 0 { 44.0 } else { 0.0 })
                    - (if host > 0 { 44.0 } else { 0.0 })
                    - (if unknown > 0 { 44.0 } else { 0.0 })
                    - 16.0)
                    .max(0.0),
                10.0,
            ),
        )
}

fn status(s: &AppState, width: f32) -> El {
    let t = s.theme;
    let readback = matches!(s.modal, Some(Modal::Readback));
    let mode = s.mode_label();
    let edge = match mode {
        "INSERT" => "state.local",
        "VISUAL" | "V-LINE" => "kind.you",
        "COMMAND" | "HINT" => "kind.literal",
        _ => "state.attn",
    };
    let badge = el()
        .h(26.0)
        .fill(t.token(if readback {
            "state.attn"
        } else {
            "surface.cursor.side"
        }))
        .child(
            mono(mode, t)
                .font(
                    rune::TextStyle::new(11.0, 600.0)
                        .mono()
                        .lh(14.0)
                        .tracking(0.88),
                )
                .px(12.0)
                .py(6.0)
                .color(t.token(if readback {
                    "surface.read"
                } else {
                    "fg.default"
                })),
        )
        .child(el().absolute(0.0, 0.0).size(2.0, 26.0).fill(t.token(edge)));
    let mut left = row().center_y().gap(12.0).h(26.0).child(badge);
    if width >= 1000.0 {
        left = left.child(
            small(s.breadcrumb(), t)
                .max_w((width * 0.30).max(100.0))
                .truncate(),
        );
    }
    let drafts = s.draft_count();
    if drafts > 0 {
        left = left
            .child(symbol("edit", t.token("state.local"), 12.0))
            .child(small(format!("{drafts} not saved"), t));
        if !readback && s.writes_available() {
            left = left.child(chip(":w", t, !s.chrome_inert()).on_press_tx(
                |s: &mut AppState, tx| {
                    if !s.chrome_inert() {
                        s.command("review.save", tx);
                    }
                },
            ));
        }
    }
    if !s.pending.is_empty() {
        left =
            left.child(mono(s.pending.replace("<leader>", "␣"), t).color(t.token("kind.literal")));
    }
    let host = s.host_label();
    let mut right = row().center_y().gap(16.0).child(small(host, t));
    right = right.child(mono(s.sequence_label(), t).color(t.token("fg.muted")));
    row()
        .key("frame.status")
        .size(width, 26.0)
        .fill(t.token("surface.bar"))
        .justify_between()
        .pr(14.0)
        .child(left)
        .child(right)
}

fn track(s: &AppState, width: f32) -> El {
    let t = s.theme;
    let axis = crate::layout::Axis::new(width);
    let start = axis.left.map_or(24.0, |r| r.0);
    let end = axis.notes.map_or(width - 16.0, |r| r.0 + r.1);
    let track_text = if width < 1180.0 {
        crate::views::compact_track_text(s.current_object().and_then(|o| o.track.as_ref()))
    } else {
        s.track_text()
    };
    let mut line = row()
        .gap(16.0)
        .center_y()
        .w((end - start).max(1.0))
        .h(40.0)
        .child(small(track_text, t).truncate().shrink())
        .child(small(s.abnormal_fact(), t).truncate().shrink());
    let mut actions = row().gap(8.0).grow(1.0).justify_end().center_y();
    let entries: &[(&str, &str, &str)] = match s.screen() {
        Screen::Review | Screen::Diff => &[
            ("␣ar", "rework", "auth.rework"),
            ("␣aa", "approve", "auth.approve"),
        ],
        Screen::Decision => &[("␣ad", "answer", "auth.decide")],
        Screen::Settings => &[
            ("␣at", "routing", "auth.routing"),
            ("␣ap", "policy", "auth.policy"),
        ],
        Screen::LocalPrompt => &[],
        _ => &[("␣n", "next action", "next.go")],
    };
    for &(key, title, command) in entries {
        let available = s.command_reason(command).is_none();
        let active = available && !s.chrome_inert();
        let primary = command == "auth.decide";
        let title = if primary {
            s.current_object()
                .and_then(|o| match &o.body {
                    render_core::ObjectBody::Decision(d) => Some(format!("Answer {}", d.label)),
                    _ => None,
                })
                .unwrap_or_else(|| title.to_owned())
        } else {
            title.to_owned()
        };
        let mut action = row()
            .gap(6.0)
            .px(8.0)
            .h(26.0)
            .center_y()
            .border(1.0, t.token("border.strong"));
        if primary && active {
            action = action
                .fill(t.token("state.attn"))
                .border(1.0, t.token("state.attn"));
        }
        if available {
            action = action.child(if primary {
                on_solid_chip(key, t, active)
            } else {
                chip(key, t, active)
            });
        }
        action = action.child(
            label(
                if available {
                    title.to_owned()
                } else {
                    format!("{title} · off")
                },
                t,
            )
            .color(t.token(if primary && active {
                "surface.read"
            } else if active {
                "fg.default"
            } else {
                "fg.muted"
            })),
        );
        if !available {
            action = action.border_dash(4.0, 3.0);
        }
        actions = actions.child(action.key(format!("action.{command}")).on_press_tx(
            move |s: &mut AppState, tx| {
                if !s.chrome_inert() {
                    s.pin_input_target();
                    s.command(command, tx);
                }
            },
        ));
    }
    line = line.child(actions);
    el().key("frame.track")
        .size(width, 40.0)
        .fill(t.token("surface.read"))
        .child(line.absolute(start, 0.0))
}
