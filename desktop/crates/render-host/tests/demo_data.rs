use render_core::*;
use render_host::demo_data;
use std::time::Duration;

fn loaded() -> Client {
    let mut client = Client::default();
    for event in demo_data::snapshots() {
        client.apply_inbound(
            event,
            Moment {
                clock: ClockId(1),
                at: Duration::ZERO,
            },
        );
    }
    client
}

#[test]
fn demo_scopes_and_attention_are_host_facts() {
    let client = loaded();
    let h = &client.host;
    assert_eq!(h.host_name.as_deref(), Some("DEMO · local fixtures"));
    assert!(h.writable());
    for (scope, cursor) in &h.cursors {
        assert_eq!(cursor.epoch.as_deref(), Some("desktop-demo-v1"));
        assert_eq!(cursor.scope_seq, 18342);
        assert_eq!(cursor.ledger_seq, Some(18342));
        assert!(cursor.host_time.is_some());
        if let Scope::Object(id) = scope {
            assert_eq!(h.object_scope[id], *scope);
        }
    }
    for (group, count) in [
        (AttentionGroup::NeedsYou, 4),
        (AttentionGroup::OnHost, 1),
        (AttentionGroup::Waiting, 3),
        (AttentionGroup::Running, 4),
        (AttentionGroup::Done, 1),
    ] {
        assert_eq!(
            h.attention.rows.iter().filter(|r| r.group == group).count(),
            count
        );
    }
    let unknown: Vec<_> = h
        .attention
        .rows
        .iter()
        .filter(|r| r.mark == Some(RowMark::Unknown))
        .collect();
    assert_eq!(unknown.len(), 1);
    assert_eq!(unknown[0].object, "operation");
    assert_eq!(unknown[0].group, AttentionGroup::Waiting);
    assert_eq!(
        h.slots,
        Some(Slots {
            used: 2,
            total: 4,
            held_by_cancelled: 1
        })
    );
    assert!(
        h.agents
            .rows
            .iter()
            .any(|a| a.cancellation == Some(Cancellation::Quarantined))
    );
    assert!(!h.slices.rows.is_empty());
    assert!(!h.lifecycle_states.is_empty());
    assert!(!h.attention.proposals.is_empty());
}

#[test]
fn every_main_scene_and_navigation_target_is_available() {
    let h = loaded().host;
    for (id, kind) in [
        ("review", ObjectKind::Review),
        ("chat", ObjectKind::Chat),
        ("decision", ObjectKind::Decision),
        ("evidence", ObjectKind::Evidence),
        ("proposal", ObjectKind::Proposal),
        ("settings", ObjectKind::Settings),
        ("operation", ObjectKind::Operation),
        ("local-prompt", ObjectKind::LocalPrompt),
        ("unsupported", ObjectKind::Unsupported),
    ] {
        assert_eq!(h.objects[id].kind(), kind);
        assert!(h.objects[id].track.is_some());
    }
    for o in h.objects.values() {
        if let Some(Next::Act(next)) = &o.next {
            assert!(h.objects.contains_key(&next.target));
        }
        for d in &o.decidables {
            assert!(h.objects.contains_key(&d.target));
            for f in &d.basis.fields {
                if let Some(id) = &f.reference {
                    assert!(h.objects.contains_key(id));
                }
            }
        }
    }
    for row in &h.attention.rows {
        assert!(h.objects.contains_key(&row.object));
    }
    for refs in h.references.values() {
        for r in refs {
            assert!(h.objects.contains_key(r.target.as_ref().unwrap()));
        }
    }
    let Some(Next::Act(next)) = &h.objects["proposal"].next else {
        panic!()
    };
    assert_eq!(next.kind, ActionKind::MergeMain);
    assert_eq!(next.target, "proposal");
    assert!(next.commands.is_empty());
    assert_eq!(
        next.url.as_deref(),
        Some("https://github.com/vicrdguez/skills/pull/44")
    );
}

#[test]
fn display_labels_and_basis_use_human_vocabulary() {
    let h = loaded().host;
    for (id, label) in [
        ("decision", "Q1"),
        ("decision-shape", "shape"),
        ("review", "Modules r2"),
        ("proposal", "main"),
    ] {
        let Some(Next::Act(next)) = &h.objects[id].next else {
            panic!()
        };
        assert_eq!(next.target_label.as_deref(), Some(label));
    }
    for o in h.objects.values() {
        assert!(!o.title.as_ref().unwrap().contains("DEMO"));
        assert_eq!(o.project.as_ref().unwrap().name, "Render");
    }
    for row in &h.attention.rows {
        assert!(!row.title.as_ref().unwrap().contains("DEMO"));
        assert!(!row.reason.as_ref().unwrap().as_str().contains("DEMO"));
    }
    let fields = &h.objects["review"].decidables[0].basis.fields;
    for (name, revision) in [
        ("request", "C2 · captured s2 · human"),
        ("emission", "r2"),
        ("annotations", "v3"),
        ("policy", "pol3"),
        ("binding", "bind1"),
    ] {
        let field = fields.iter().find(|f| f.name == name).unwrap();
        assert_eq!(field.revision.as_deref(), Some(revision));
        assert!(field.digest.as_ref().unwrap().starts_with("DEMO-"));
    }
}

#[test]
fn representative_work_has_ages_and_slots_are_not_running_count() {
    let h = loaded().host;
    let now = h.cursors[&Scope::Attention].host_time.unwrap().utc_ms;
    let mut ages = std::collections::BTreeSet::new();
    for row in &h.attention.rows {
        let since = row.since.unwrap().utc_ms;
        assert!(since < now);
        ages.insert(since);
        let activity = row.last_activity.as_ref().unwrap().at.unwrap().utc_ms;
        assert!(activity >= since && activity < now);
    }
    assert_eq!(ages.len(), h.attention.rows.len());
    for (id, group, wait) in [
        (
            "route-prompt",
            AttentionGroup::Waiting,
            Some(WaitClass::Dependency),
        ),
        (
            "evaluate-exact-sum",
            AttentionGroup::Waiting,
            Some(WaitClass::Slot),
        ),
        ("execute-causal-scan", AttentionGroup::Running, None),
        ("auto-tag-bookmarks", AttentionGroup::Running, None),
        ("specify-cma", AttentionGroup::Running, None),
    ] {
        let row = h.attention.rows.iter().find(|r| r.object == id).unwrap();
        assert_eq!((row.group, row.wait), (group, wait));
        assert_eq!(h.objects[id].kind(), ObjectKind::Chat);
    }
    assert_eq!(
        h.attention
            .rows
            .iter()
            .filter(|r| r.group == AttentionGroup::Running)
            .count(),
        4
    );
    assert_eq!(h.slots.unwrap().used, 2);
}

#[test]
fn source_bytes_anchors_and_authority_are_explicit() {
    let h = loaded().host;
    let ObjectBody::LocalPrompt(prompt) = &h.objects["local-prompt"].body else {
        panic!()
    };
    assert_eq!(
        prompt.text.as_bytes(),
        include_bytes!("../../../fixtures/local-prompt-3.md")
    );
    let ObjectBody::Review(review) = &h.objects["review"].body else {
        panic!()
    };
    assert_eq!(review.text, include_str!("../../../fixtures/modules-r2.md"));
    for n in &review.nodes {
        let (start, end) = n.byte_range.unwrap();
        assert!(
            !review
                .text
                .get(start as usize..end as usize)
                .unwrap()
                .is_empty()
        );
    }
    for a in &review.annotations {
        assert_eq!(
            &review.text[a.anchor.byte_start as usize..a.anchor.byte_end as usize],
            a.anchor.quote
        );
    }
    let d = &h.objects["review"].decidables[0];
    assert_eq!(
        d.basis
            .fields
            .iter()
            .map(|f| f.name.as_str())
            .collect::<Vec<_>>(),
        [
            "request",
            "emission",
            "manifest",
            "annotations",
            "decisions",
            "intake",
            "policy",
            "binding"
        ]
    );
    assert_eq!(
        d.actions.iter().map(|a| a.command).collect::<Vec<_>>(),
        [CommandType::ApproveCheckpoint, CommandType::RequestRework]
    );
    for o in h.objects.values() {
        for d in &o.decidables {
            for a in &d.actions {
                assert!(!a.effect.as_ref().unwrap().as_str().is_empty());
                assert!(!a.not.is_empty());
            }
        }
    }
    let ObjectBody::Decision(d) = &h.objects["decision"].body else {
        panic!()
    };
    assert_eq!(d.options.len(), 3);
    assert!(d.options[0].recommended);
    let ObjectBody::Operation(op) = &h.objects["operation"].body else {
        panic!()
    };
    assert_eq!(op.state, OperationState::Unknown);
    assert!(!op.safe_choices.is_empty());
    let display = format!("{h:?}").to_lowercase();
    for forbidden in [
        "protected to seq",
        "backup verified",
        "restore verified",
        "catching up after a restore",
    ] {
        assert!(!display.contains(forbidden));
    }
}
