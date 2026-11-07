mod common;

use common::*;
use render_core::*;

fn row(id: &str, group: AttentionGroup) -> AttentionRow {
    AttentionRow {
        id: id.into(),
        object: id.into(),
        group,
        mark: None,
        title: Some(id.into()),
        project: None,
        proposal: None,
        wait: None,
        since: None,
        next: None,
        ask: None,
        reason: None,
        track: None,
        downstream: None,
        handover: Handover::default(),
        role: None,
        pass: None,
        last_activity: None,
        seq: None,
        decidables: vec![],
    }
}

fn mirror() -> HostSnapshot {
    let mut h = HostSnapshot::default();
    reduce_host(
        &mut h,
        snapshot(
            Scope::Attention,
            5,
            100,
            vec![
                Resource::AttentionRow(row("a", AttentionGroup::NeedsYou)),
                Resource::AttentionRow(row("b", AttentionGroup::Waiting)),
            ],
        ),
        at(0),
    );
    h
}

fn without_receipt_times(mut h: HostSnapshot) -> HostSnapshot {
    h.host_time = None;
    h.facts.clear();
    h
}

#[test]
fn replaying_snapshot_and_updates_equals_a_fresh_snapshot() {
    let mut replayed = mirror();
    reduce_host(
        &mut replayed,
        update(
            Scope::Attention,
            6,
            5,
            101,
            vec![Change::Upsert(Resource::AttentionRow(row(
                "a",
                AttentionGroup::Done,
            )))],
        ),
        at(1),
    );
    reduce_host(
        &mut replayed,
        update(
            Scope::Attention,
            7,
            6,
            102,
            vec![
                Change::Remove(ResourceKey::AttentionRow("b".into())),
                Change::Upsert(Resource::AttentionRow(row("c", AttentionGroup::Running))),
            ],
        ),
        at(2),
    );

    let mut fresh = HostSnapshot::default();
    reduce_host(
        &mut fresh,
        snapshot(
            Scope::Attention,
            7,
            102,
            vec![
                Resource::AttentionRow(row("a", AttentionGroup::Done)),
                Resource::AttentionRow(row("c", AttentionGroup::Running)),
            ],
        ),
        at(2),
    );

    assert_eq!(
        without_receipt_times(replayed),
        without_receipt_times(fresh)
    );
}

#[test]
fn a_repeated_or_older_update_is_discarded() {
    let mut h = mirror();
    let before = h.clone();
    let out = reduce_host(
        &mut h,
        update(
            Scope::Attention,
            5,
            4,
            100,
            vec![Change::Upsert(Resource::AttentionRow(row(
                "a",
                AttentionGroup::Done,
            )))],
        ),
        at(1),
    );
    assert!(!out.applied);
    assert!(out.resnapshot.is_empty());
    assert_eq!(h, before);
}

#[test]
fn a_gap_resnapshots_only_its_scope_and_applies_nothing_until_then() {
    let mut h = mirror();
    reduce_host(&mut h, snapshot(Scope::Agents, 1, 100, vec![]), at(0));
    let out = reduce_host(
        &mut h,
        update(
            Scope::Attention,
            9,
            8,
            105,
            vec![Change::Upsert(Resource::AttentionRow(row(
                "x",
                AttentionGroup::NeedsYou,
            )))],
        ),
        at(1),
    );
    assert!(!out.applied);
    assert_eq!(out.resnapshot, vec![Scope::Attention]);
    assert!(h.needs_snapshot.contains(&Scope::Attention));
    assert!(!h.needs_snapshot.contains(&Scope::Agents));
    assert!(h.attention.rows.iter().all(|r| r.id != "x"));

    let out = reduce_host(
        &mut h,
        update(
            Scope::Attention,
            6,
            5,
            101,
            vec![Change::Upsert(Resource::AttentionRow(row(
                "y",
                AttentionGroup::NeedsYou,
            )))],
        ),
        at(2),
    );
    assert!(!out.applied, "an incomplete scope waits for its snapshot");

    reduce_host(
        &mut h,
        snapshot(
            Scope::Attention,
            9,
            105,
            vec![Resource::AttentionRow(row("x", AttentionGroup::NeedsYou))],
        ),
        at(3),
    );
    assert!(h.needs_snapshot.is_empty());
    assert_eq!(h.attention.rows.len(), 1);
    assert_eq!(h.seq, Some(105));
}

#[test]
fn an_older_snapshot_in_the_same_epoch_is_discarded() {
    let mut h = mirror();
    let before = h.clone();
    let out = reduce_host(&mut h, snapshot(Scope::Attention, 3, 90, vec![]), at(1));
    assert!(!out.applied);
    assert_eq!(h, before);
}

#[test]
fn a_new_epoch_is_never_compared_numerically_and_resnapshots_every_other_scope() {
    let mut h = mirror();
    reduce_host(&mut h, snapshot(Scope::Agents, 4, 100, vec![]), at(0));
    let restored = Inbound::Snapshot {
        scope: Scope::Attention,
        at: cursor(Some("e2"), 1, 40),
        resources: vec![],
    };
    let out = reduce_host(&mut h, restored, at(1));
    assert!(out.applied);
    assert!(out.discontinuity);
    assert_eq!(h.epoch.as_deref(), Some("e2"));
    assert_eq!(h.seq, Some(40));
    assert_eq!(out.resnapshot, vec![Scope::Agents]);
    assert!(h.needs_snapshot.contains(&Scope::Agents));
}

#[test]
fn an_update_from_another_epoch_is_discarded_and_resnapshots_its_scope() {
    let mut h = mirror();
    let before = h.clone();
    let foreign = Inbound::Update {
        scope: Scope::Attention,
        at: cursor(Some("e2"), 6, 2),
        prev_scope_seq: 5,
        changes: vec![Change::Remove(ResourceKey::AttentionRow("a".into()))],
        facts: vec![],
    };
    let out = reduce_host(&mut h, foreign, at(1));
    assert!(!out.applied);
    assert_eq!(out.resnapshot, vec![Scope::Attention]);
    assert_eq!(h.attention, before.attention);
}

#[test]
fn a_host_that_stops_sending_its_epoch_is_a_discontinuity() {
    let mut h = mirror();
    let out = reduce_host(
        &mut h,
        Inbound::Snapshot {
            scope: Scope::Attention,
            at: cursor(None, 1, 1),
            resources: vec![],
        },
        at(1),
    );
    assert!(out.discontinuity);
}

#[test]
fn a_resnapshot_replaces_only_resources_of_its_own_scope() {
    let mut h = HostSnapshot::default();
    reduce_host(
        &mut h,
        snapshot(
            wf(),
            1,
            10,
            vec![Resource::Object(review("v3")), Resource::References(vec![])],
        ),
        at(0),
    );
    reduce_host(
        &mut h,
        snapshot(
            Scope::Object("other".into()),
            1,
            10,
            vec![Resource::Object(object("o2", review_body(), vec![]))],
        ),
        at(0),
    );
    reduce_host(&mut h, snapshot(wf(), 2, 11, vec![]), at(1));
    assert!(h.object("em").is_none());
    assert!(h.object("o2").is_some());
    assert!(!h.references.contains_key(&wf()));
}

#[test]
fn streaming_deltas_append_once_and_a_gap_resnapshots_the_conversation() {
    let mut h = HostSnapshot::default();
    let conv = Scope::Object("conv".into());
    reduce_host(
        &mut h,
        snapshot(
            conv.clone(),
            1,
            10,
            vec![Resource::Object(object(
                "conv",
                chat_body(TurnPhase::Running),
                vec![],
            ))],
        ),
        at(0),
    );
    let delta = |offset: u64, text: &str| Inbound::Delta {
        conversation: "conv".into(),
        message: "m1".into(),
        offset,
        text: text.into(),
    };
    let text = |h: &HostSnapshot| match &h.object("conv").unwrap().body {
        ObjectBody::Chat(c) => match &c.messages[0].body {
            MessageBody::Text { text, .. } => text.clone(),
            _ => unreachable!(),
        },
        _ => unreachable!(),
    };
    let len = "héllo".len() as u64;
    reduce_host(&mut h, delta(len, " wor"), at(1));
    reduce_host(&mut h, delta(len, " wor"), at(2));
    reduce_host(&mut h, delta(len + 2, "orld"), at(3));
    assert_eq!(text(&h), "héllo world");
    let out = reduce_host(&mut h, delta(100, "x"), at(4));
    assert_eq!(out.resnapshot, vec![conv]);
    assert_eq!(text(&h), "héllo world");
}

#[test]
fn undecodable_frames_are_counted_and_resnapshot_their_scope() {
    let mut h = mirror();
    let out = reduce_host(
        &mut h,
        Inbound::Undecodable {
            scope: Some(Scope::Attention),
            what: "frame v9".into(),
        },
        at(1),
    );
    assert_eq!(h.undecodable, 1);
    assert_eq!(out.resnapshot, vec![Scope::Attention]);
}

#[test]
fn unknown_resource_kinds_are_kept_as_unsupported_notes() {
    let mut h = HostSnapshot::default();
    reduce_host(
        &mut h,
        snapshot(
            wf(),
            1,
            10,
            vec![Resource::Unsupported {
                kind: "canvas".into(),
                id: "cv1".into(),
                reason: None,
            }],
        ),
        at(0),
    );
    assert_eq!(h.unsupported.len(), 1);
    assert_eq!(h.unsupported[0].kind, "canvas");
    reduce_host(&mut h, snapshot(wf(), 2, 11, vec![]), at(0));
    assert!(h.unsupported.is_empty());
}

#[test]
fn ages_come_from_host_time_plus_monotonic_elapsed_never_a_wall_clock() {
    let h = mirror();
    let base = h.host_time.unwrap().host;
    assert_eq!(
        h.host_now(at(90_000)),
        Some(base.plus(std::time::Duration::from_secs(90)))
    );
    assert_eq!(
        h.host_now(Moment {
            clock: ClockId(2),
            at: std::time::Duration::from_secs(5)
        }),
        None
    );
    assert_eq!(
        HostSnapshot::default().host_now(at(5)),
        None,
        "no host time is `not observed yet`"
    );
}

#[test]
fn connection_events_are_distinct_states() {
    let mut h = mirror();
    reduce_host(
        &mut h,
        Inbound::Connection(ConnectionEvent::Revoked {
            at: Some(host_time(5)),
        }),
        at(1),
    );
    assert_eq!(
        h.connection,
        Connection::Revoked {
            at: Some(host_time(5))
        }
    );
    reduce_host(
        &mut h,
        Inbound::Connection(ConnectionEvent::Offline { reason: None }),
        at(1),
    );
    assert!(matches!(h.connection, Connection::Offline { .. }));
    assert!(!h.writable());
}

#[test]
fn snapshots_never_touch_device_state() {
    let mut c = client();
    let key = DraftKey {
        object: "em".into(),
        kind: DraftKind::Annotations,
        base: Some("v3".into()),
    };
    c.edit_draft(key.clone(), DraftBody::Text("concern".into()));
    c.view_opened("em");
    let local = c.local.clone();
    c.apply_inbound(snapshot(wf(), 2, 11, vec![]), at(1));
    c.apply_inbound(
        Inbound::Snapshot {
            scope: wf(),
            at: cursor(Some("e2"), 1, 3),
            resources: vec![],
        },
        at(2),
    );
    assert_eq!(c.local.drafts, local.drafts);
    assert_eq!(c.local.read_bases, local.read_bases);
}

#[test]
fn core_never_reads_the_wall_clock() {
    for file in ["model.rs", "host.rs", "client.rs", "lib.rs"] {
        let src =
            std::fs::read_to_string(format!("{}/src/{file}", env!("CARGO_MANIFEST_DIR"))).unwrap();
        assert!(
            !src.contains("SystemTime") && !src.contains("Instant::now"),
            "{file} reads a clock"
        );
    }
}
