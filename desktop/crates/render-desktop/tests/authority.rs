use render_core::*;
use render_desktop::{AppState, Screen};
use std::time::Duration;

fn state() -> AppState {
    let mut app = AppState::default();
    app.core.local.device_id = "native-test".into();
    app.core.host.connection = Connection::Live;
    app.core.host.epoch = Some("e1".into());
    let d = Decidable {
        target: "review".into(),
        subject: None,
        basis: Basis {
            digest: "host-basis".into(),
            fields: vec![BasisField::named("future-field")],
        },
        actions: vec![HostAction {
            command: CommandType::ApproveCheckpoint,
            option: None,
            option_kind: None,
            recommended: false,
            availability: Availability::Available,
            effect: Some(Text::Host("host consequence".into())),
            not: vec![Text::Host("nothing else".into())],
            carries: None,
        }],
    };
    app.core.host.objects.insert(
        "review".into(),
        Object {
            id: "review".into(),
            revision: Some("r2".into()),
            title: Some("Review".into()),
            project: None,
            workflow: None,
            handover: Handover::default(),
            next: None,
            track: None,
            decidables: vec![d],
            body: ObjectBody::Review(Review {
                emission: "review".into(),
                digest: None,
                emitted_at: None,
                previous: None,
                text: "# Review\nSource bytes".into(),
                nodes: vec![],
                change_ranges: vec![],
                annotation_set: None,
                annotations: vec![],
                dispositions: vec![],
                round: None,
                reviews: None,
                delegated: None,
                attributes_changed: false,
                fidelity: None,
            }),
        },
    );
    let object = app.core.host.objects.remove("review").unwrap();
    app.core.apply_inbound(
        Inbound::Snapshot {
            scope: Scope::Object("review".into()),
            at: Cursor {
                epoch: Some("e1".into()),
                scope_seq: 10,
                ledger_seq: Some(10),
                host_time: None,
            },
            resources: vec![Resource::Object(object)],
        },
        moment(0),
    );
    app.open(Screen::Review, Some("review".into()));
    app
}
fn moment(ms: u64) -> Moment {
    Moment {
        clock: ClockId(91),
        at: Duration::from_millis(ms),
    }
}

#[test]
fn building_a_view_cannot_arm_authority_and_a_real_draw_is_required() {
    let mut app = state();
    app.acknowledge_draw_for_test(moment(1));
    app.consume_draw();
    app.pin_input_target();
    app.authorize(AuthorityVerb::Approve);
    assert!(app.core.session.readback.is_some());
    assert_eq!(
        app.core.confirm(&KeyPress {
            repeat: false,
            composing: false,
            input_time: Some(moment(2))
        }),
        Err(Refusal::AwaitingDraw)
    );
    app.acknowledge_draw_for_test(moment(3));
    app.consume_draw();
    assert_eq!(
        app.core.confirm(&KeyPress {
            repeat: false,
            composing: false,
            input_time: Some(moment(2))
        }),
        Err(Refusal::Typeahead)
    );
    let command = app
        .core
        .confirm(&KeyPress {
            repeat: false,
            composing: false,
            input_time: Some(moment(4)),
        })
        .unwrap();
    assert_eq!(command.expected.unwrap().fields[0].name, "future-field");
}

#[test]
fn pre_poll_drawn_target_survives_a_host_object_revision_change() {
    let mut app = state();
    app.acknowledge_draw_for_test(moment(1));
    app.consume_draw();
    app.core.host.objects.get_mut("review").unwrap().decidables[0]
        .basis
        .digest = "new-host-basis".into();
    app.pin_input_target();
    app.authorize(AuthorityVerb::Approve);
    assert!(matches!(
        app.core.readback_phase(),
        Some(ReadbackPhase::Changed(_))
    ));
    assert_eq!(
        app.core
            .session
            .readback
            .as_ref()
            .unwrap()
            .decidable
            .basis
            .digest,
        "host-basis"
    );
}
