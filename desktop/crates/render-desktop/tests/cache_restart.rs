use render_core::*;
use render_desktop::{AppState, cache::CachedHost};
use render_host::demo_data;
use std::time::Duration;

fn moment() -> Moment {
    Moment {
        clock: ClockId(7),
        at: Duration::from_secs(90),
    }
}

fn demo() -> Client {
    let mut client = Client::new(DeviceState {
        device_id: "cache-test".into(),
        ..Default::default()
    });
    for event in demo_data::snapshots() {
        client.apply_inbound(event, moment());
    }
    client
}

fn roundtrip(host: &HostSnapshot) -> HostSnapshot {
    let bytes = serde_json::to_vec(&CachedHost::capture(host)).unwrap();
    serde_json::from_slice::<CachedHost>(&bytes)
        .unwrap()
        .restore()
}

#[test]
fn demo_graph_and_structured_scope_maps_survive_without_live_authority() {
    let mut original = demo().host;
    original.references.insert(
        Scope::Object("review".into()),
        vec![Reference {
            label: "source".into(),
            kind: "emission".into(),
            target: Some("review".into()),
            state: ReferenceState::Resolved,
            reason: None,
        }],
    );
    original.facts.push(Fact {
        id: "fact-1".into(),
        summary: Text::Content("exact retained fact\nλ".into()),
        refs: vec!["review".into()],
    });
    let restored = roundtrip(&original);
    assert!(!original.objects.is_empty());
    assert_eq!(restored.objects, original.objects); // Includes exact review and local-prompt source bytes.
    assert_eq!(restored.facts, original.facts);
    assert_eq!(restored.references, original.references);
    assert_eq!(restored.cursors, original.cursors);
    assert_eq!(restored.epoch, original.epoch);
    assert_eq!(restored.seq, original.seq);
    assert_eq!(restored.host_time, None);
    assert_eq!(restored.host_now(moment()), None);
    assert!(
        matches!(&restored.connection, Connection::Offline { since: None, reason: Some(reason) } if reason.contains("cached"))
    );
    for scope in original.cursors.keys() {
        assert!(restored.needs_snapshot.contains(scope));
    }
    let mut expected = original.clone();
    expected.host_time = None;
    expected.connection = restored.connection.clone();
    expected
        .needs_snapshot
        .extend(expected.cursors.keys().cloned());
    assert_eq!(restored, expected);
    // Capture and restore must also be safe without a serialization step.
    assert_eq!(CachedHost::capture(&original).restore(), restored);
    assert_eq!(original.connection, Connection::Live);
    assert!(original.host_time.is_some());
}

#[test]
fn live_connection_and_unrelated_snapshot_do_not_unlock_cached_writes() {
    let original = demo();
    let old_pin = original.drawn_target("review", Surface::WorkView).unwrap();
    let mut client = Client::new(DeviceState {
        device_id: "restart".into(),
        ..Default::default()
    });
    client.host = roundtrip(&original.host);
    let key = DraftKey {
        object: "review".into(),
        kind: DraftKind::EditBuffer,
        base: Some("r2".into()),
    };
    client.edit_draft(key.clone(), DraftBody::Text("retained edit".into()));
    let request = || WriteRequest::SaveEditedBytes { draft: key.clone() };
    assert_eq!(client.submit(&old_pin, request()), Err(Refusal::Offline));
    client.apply_inbound(
        Inbound::Connection(ConnectionEvent::Live {
            host_name: None,
            server_version: None,
        }),
        moment(),
    );
    let pin = client.drawn_target("review", Surface::WorkView).unwrap();
    assert_eq!(pin.epoch, None);
    assert_eq!(pin.ledger_seq, None);
    assert!(client.submit(&pin, request()).is_err());
    assert!(client.submit(&old_pin, request()).is_err());
    assert!(!client.view_opened("review"));
    for event in demo_data::snapshots() {
        if matches!(
            &event,
            Inbound::Snapshot {
                scope: Scope::Attention,
                ..
            }
        ) {
            client.apply_inbound(event, moment());
        }
    }
    assert_eq!(
        client
            .drawn_target("review", Surface::WorkView)
            .unwrap()
            .epoch,
        None
    );
    assert!(client.local.outbox.is_empty());
    for event in demo_data::snapshots() {
        if matches!(&event, Inbound::Snapshot { scope: Scope::Object(id), .. } if id == "review") {
            client.apply_inbound(event, moment());
        }
    }
    let fresh = client.drawn_target("review", Surface::WorkView).unwrap();
    assert_eq!(fresh.epoch, original.host.epoch);
    assert!(client.submit(&fresh, request()).is_ok());
}

#[test]
fn terminal_connection_states_survive_restart() {
    for connection in [
        Connection::Revoked {
            at: Some(HostTime {
                utc_ms: 123,
                offset_min: 0,
            }),
        },
        Connection::TooOld {
            requires: Some("future-client".into()),
        },
    ] {
        let mut host = demo().host;
        host.connection = connection.clone();
        assert_eq!(roundtrip(&host).connection, connection);
    }
}

#[test]
fn restored_cache_never_sends_local_outbox() {
    let mut original = demo();
    let pin = original.drawn_target("review", Surface::WorkView).unwrap();
    let key = DraftKey {
        object: "review".into(),
        kind: DraftKind::EditBuffer,
        base: None,
    };
    original.edit_draft(key.clone(), DraftBody::Text("unsent edit".into()));
    original
        .submit(&pin, WriteRequest::SaveEditedBytes { draft: key })
        .unwrap();
    original.local.outbox[0].state = OutboxState::Sent;
    let mut app = AppState::default();
    app.core = Client::new(original.local);
    app.core.host = roundtrip(&original.host);
    assert!(matches!(
        app.core.local.outbox[0].state,
        OutboxState::Unknown { since: None, .. }
    ));
    assert!(app.outgoing.is_empty());
    assert!(app.requests.is_empty());
    assert!(app.core.session.readback.is_none());
}
