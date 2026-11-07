use super::editor::composer;
use super::*;
use render_content::render_markdown;
use rune::row;

pub fn view(s: &AppState, width: f32, height: f32) -> El {
    let Some(o) = s.current_object() else {
        return el().size(width, height).child(missing(s, width));
    };
    if matches!(o.body, ObjectBody::Chat(_)) {
        return super::chat::view(s, width, height);
    }
    if matches!(o.body, ObjectBody::Review(_)) {
        return super::review::view(s, width, height);
    }
    let t = s.theme;
    let a = Axis::reading(width, s.wide);
    let w = a.measure;
    let cursor = s.tab().cursor;
    let mut left = col().w(a.left.map_or(200.0, |p| p.1)).gap(8.0);
    let notes = col().w(a.notes.map_or(w, |p| p.1)).gap(16.0);
    let mut body = col().w(w).gap(8.0);
    if s.hints
        .as_ref()
        .is_some_and(|hints| hints.iter().any(|(_, id)| id == &o.id))
    {
        body = body.child(hint_overlay(s, &o.id));
    }
    match &o.body {
        ObjectBody::Review(_) => unreachable!(),
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
        ObjectBody::Chat(_) => unreachable!(),
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
    let mut page = el().size(width, height).child(
        col()
            .key("work.scroll")
            .absolute(a.text, 22.0)
            .w(w)
            .h((height - 22.0 - float_clearance).max(80.0))
            .scroll(rune::ScrollSpec {
                stick_bottom: false,
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
pub(super) fn line_diff(old: &str, new: &str, t: render_content::Theme, width: f32) -> El {
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

pub(super) fn review_count(c: ReviewCount) -> String {
    if c.completed >= c.limit {
        format!(
            "reviews {} · limit {} reached · no automatic rework · a passing review still counts",
            c.completed, c.limit
        )
    } else {
        format!("reviews {} of {}", c.completed, c.limit)
    }
}
pub(super) fn role_color(role: RoleClass) -> &'static str {
    match role {
        RoleClass::Human => "kind.you",
        RoleClass::Reviewer => "kind.reviewer",
        RoleClass::Worker => "kind.worker",
        _ => "fg.default",
    }
}
