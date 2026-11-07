mod common;

use common::*;
use render_core::*;

fn phase(c: &Client) -> ReadbackPhase {
    c.readback_phase().expect("a readback is open")
}

#[test]
fn a_fresh_readback_confirmed_by_y_after_its_draw_binds_the_basis_exactly_as_shown() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    assert_eq!(phase(&c), ReadbackPhase::Fresh);
    let intent = c.confirm(&key(101)).unwrap();
    assert_eq!(intent.command, CommandType::ApproveCheckpoint);
    assert_eq!(
        intent.expected,
        Some(review("v3").decidables[0].basis.clone())
    );
    assert_eq!(intent.epoch.as_deref(), Some("e1"));
    assert_eq!(intent.target, "em");
    assert!(intent.id.starts_with("dev-"));
    assert_eq!(phase(&c), ReadbackPhase::Sent(intent.id.clone()));
    assert_eq!(c.entry(&intent.id).unwrap().state, OutboxState::Preparing);
    assert_eq!(c.confirm(&key(102)), Err(Refusal::AlreadySent));
}

#[test]
fn without_a_host_decidable_there_is_no_readback() {
    let mut c = client_with(vec![object("em", review_body(), vec![])]);
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(c.open_readback(&pin, approve()), Err(Refusal::NoDecidable));
    assert!(c.readback_phase().is_none());
}

#[test]
fn an_action_without_effect_or_not_text_is_blocked_never_synthesised() {
    let mut o = review("v3");
    o.decidables[0].actions[0].effect = None;
    let mut c = client_with(vec![o]);
    drawn_readback(&mut c, 100);
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::NoConsequenceText));
    assert_eq!(
        c.confirm(&key(200)),
        Err(Refusal::NotFresh(ReadbackPhase::Blocked(
            Block::NoConsequenceText
        )))
    );

    let mut o = review("v3");
    o.decidables[0].actions[0].not.clear();
    let mut c = client_with(vec![o]);
    drawn_readback(&mut c, 100);
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::NoConsequenceText));
}

#[test]
fn an_unavailable_action_carries_the_host_reason() {
    let mut o = review("v3");
    let reason = Text::Host("no saved concern".into());
    o.decidables[0].actions[0].availability = Availability::Unavailable {
        reason: Some(reason.clone()),
    };
    let mut c = client_with(vec![o]);
    drawn_readback(&mut c, 100);
    assert_eq!(
        phase(&c),
        ReadbackPhase::Blocked(Block::Unavailable(Some(reason)))
    );
}

#[test]
fn authority_from_a_list_row_needs_the_object_open_except_cancel() {
    let mut o = review("v3");
    o.decidables[0]
        .actions
        .push(action(CommandType::CancelWork));
    let mut c = client_with(vec![o]);
    let row = c.drawn_target("em", Surface::ListRow).unwrap();
    assert_eq!(c.open_readback(&row, approve()), Err(Refusal::OpenItFirst));
    let cancel = AuthorityRequest {
        verb: AuthorityVerb::Cancel,
        ..approve()
    };
    assert_eq!(c.open_readback(&row, cancel), Ok(()));
}

#[test]
fn counts_are_rejected_for_authority() {
    let mut c = client();
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.open_readback(
            &pin,
            AuthorityRequest {
                count: Some(3),
                ..approve()
            }
        ),
        Err(Refusal::CountNotAllowed)
    );
}

#[test]
fn unsaved_drafts_on_the_target_must_be_saved_before_approve_or_rework() {
    let mut c = client();
    let draft = DraftKey {
        object: "em".into(),
        kind: DraftKind::Annotations,
        base: Some("v3".into()),
    };
    c.edit_draft(draft.clone(), DraftBody::Text("concern".into()));
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.open_readback(&pin, approve()),
        Err(Refusal::UnsavedDrafts(vec![draft]))
    );
}

#[test]
fn a_key_before_the_readback_is_drawn_never_confirms() {
    let mut c = client();
    c.view_opened("em");
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    c.open_readback(&pin, approve()).unwrap();
    assert_eq!(c.confirm(&key(500)), Err(Refusal::AwaitingDraw));
}

#[test]
fn typeahead_at_or_before_the_draw_time_is_discarded() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    assert_eq!(c.confirm(&key(99)), Err(Refusal::Typeahead));
    assert_eq!(c.confirm(&key(100)), Err(Refusal::Typeahead));
    assert!(c.confirm(&key(101)).is_ok());
}

#[test]
fn a_redraw_does_not_move_the_first_draw_time() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    c.readback_drawn(at(300));
    assert!(c.confirm(&key(150)).is_ok());
}

#[test]
fn missing_or_foreign_input_timing_fails_closed() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    assert_eq!(
        c.confirm(&KeyPress {
            input_time: None,
            ..key(0)
        }),
        Err(Refusal::NoInputTiming)
    );
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::NoInputTiming));

    let mut c = client();
    drawn_readback(&mut c, 100);
    let other = Moment {
        clock: ClockId(9),
        at: std::time::Duration::from_secs(10),
    };
    assert_eq!(
        c.confirm(&KeyPress {
            input_time: Some(other),
            ..key(0)
        }),
        Err(Refusal::NoInputTiming)
    );
}

#[test]
fn repeat_and_ime_composition_never_confirm() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    assert_eq!(
        c.confirm(&KeyPress {
            repeat: true,
            ..key(200)
        }),
        Err(Refusal::Repeat)
    );
    assert_eq!(
        c.confirm(&KeyPress {
            composing: true,
            ..key(200)
        }),
        Err(Refusal::Composing)
    );
    assert!(c.confirm(&key(200)).is_ok());
}

#[test]
fn a_pointer_never_confirms_and_clicks_right_after_a_float_opens_are_discarded() {
    assert_eq!(pointer_confirm(), Refusal::PointerNeverConfirms);
    assert!(!pointer_click_allowed(Some(at(1_000)), Some(at(1_399))));
    assert!(pointer_click_allowed(Some(at(1_000)), Some(at(1_400))));
    assert!(!pointer_click_allowed(Some(at(1_000)), None));
    assert!(!pointer_click_allowed(None, Some(at(5_000))));
    assert!(!pointer_click_allowed(
        Some(at(1_000)),
        Some(Moment {
            clock: ClockId(7),
            at: std::time::Duration::from_secs(9)
        })
    ));
}

#[test]
fn a_basis_change_while_open_disables_confirm() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(review("v4")))],
        ),
        at(150),
    );
    let ReadbackPhase::Changed(changes) = phase(&c) else {
        panic!("expected CHANGED")
    };
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].name, "annotations");
    assert!(matches!(
        c.confirm(&key(200)),
        Err(Refusal::NotFresh(ReadbackPhase::Changed(_)))
    ));
}

#[test]
fn the_readback_binds_the_drawn_target_not_a_later_host_update() {
    let mut c = client();
    c.view_opened("em");
    let drawn = c.drawn_target("em", Surface::WorkView).unwrap();
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(review("v4")))],
        ),
        at(50),
    );
    c.open_readback(&drawn, approve()).unwrap();
    c.readback_drawn(at(100));
    assert!(matches!(phase(&c), ReadbackPhase::Changed(_)));
    assert_eq!(
        c.session.readback.as_ref().unwrap().decidable.basis,
        review("v3").decidables[0].basis
    );
}

#[test]
fn an_unacknowledged_change_makes_the_readback_stale_until_explicitly_acknowledged() {
    let mut c = client();
    c.view_opened("em");
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(review("v4")))],
        ),
        at(10),
    );
    c.view_opened("em");
    assert_eq!(
        c.unacknowledged("em", None).len(),
        1,
        "opening again or scrolling never acknowledges"
    );

    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    c.open_readback(&pin, approve()).unwrap();
    c.readback_drawn(at(100));
    let ReadbackPhase::Stale(changes) = phase(&c) else {
        panic!("expected STALE")
    };
    assert_eq!(changes[0].name, "annotations");
    assert!(c.confirm(&key(200)).is_err());

    assert!(c.acknowledge_readback());
    assert_eq!(c.readback_phase(), None);
    assert!(c.unacknowledged("em", None).is_empty());
    assert_eq!(c.confirm(&key(201)), Err(Refusal::NoReadback));
    assert!(c.local.outbox.is_empty(), "queued d y must not send");
    c.open_readback(&pin, approve()).unwrap();
    assert_eq!(c.confirm(&key(202)), Err(Refusal::AwaitingDraw));
    c.readback_drawn(at(300));
    assert_eq!(c.confirm(&key(201)), Err(Refusal::Typeahead));
    assert_eq!(phase(&c), ReadbackPhase::Fresh);
    assert!(c.confirm(&key(301)).is_ok());
}

#[test]
fn acknowledging_one_field_leaves_the_others_marked() {
    let mut c = client();
    c.view_opened("em");
    let moved = object(
        "em",
        review_body(),
        vec![decidable(
            "em",
            basis(&[
                ("emission", "r3"),
                ("annotations", "v4"),
                ("policy", "pol3"),
            ]),
            vec![action(CommandType::ApproveCheckpoint)],
        )],
    );
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(moved))],
        ),
        at(10),
    );
    assert_eq!(c.unacknowledged("em", None).len(), 2);
    assert!(c.acknowledge("em", None, "annotations"));
    let left = c.unacknowledged("em", None);
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].name, "emission");
}

#[test]
fn an_unknown_basis_field_name_never_disables_a_command() {
    let o = object(
        "em",
        review_body(),
        vec![decidable(
            "em",
            basis(&[("frobnication", "x9")]),
            vec![action(CommandType::ApproveCheckpoint)],
        )],
    );
    let mut c = client_with(vec![o]);
    drawn_readback(&mut c, 100);
    assert_eq!(phase(&c), ReadbackPhase::Fresh);
}

#[test]
fn an_unknown_outcome_blocks_authority_on_the_same_object_only() {
    let other = object(
        "o2",
        review_body(),
        vec![decidable(
            "o2",
            basis(&[("emission", "r1")]),
            vec![action(CommandType::ApproveCheckpoint)],
        )],
    );
    let mut c = client_with(vec![review("v3"), other]);
    drawn_readback(&mut c, 100);
    let intent = c.confirm(&key(101)).unwrap();
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        at(200),
    );
    c.close_readback();

    drawn_readback(&mut c, 300);
    assert_eq!(
        phase(&c),
        ReadbackPhase::Blocked(Block::OutcomeUnknown(intent.id.clone()))
    );
    c.close_readback();

    c.view_opened("o2");
    let pin = c.drawn_target("o2", Surface::WorkView).unwrap();
    c.open_readback(&pin, approve()).unwrap();
    assert_eq!(phase(&c), ReadbackPhase::Fresh);
}

#[test]
fn offline_paused_and_revoked_block_the_readback() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    c.apply_inbound(
        Inbound::Admission(Admission::Paused { reason: None }),
        at(110),
    );
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::Paused(None)));
    c.apply_inbound(
        Inbound::Connection(ConnectionEvent::Offline { reason: None }),
        at(120),
    );
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::Offline));
    c.apply_inbound(
        Inbound::Connection(ConnectionEvent::Revoked { at: None }),
        at(130),
    );
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::Revoked));
}

#[test]
fn an_unsupported_object_has_its_decisions_off() {
    let body = ObjectBody::Unsupported {
        kind: "canvas".into(),
        reason: None,
        requires_client: Some(">=0.4".into()),
    };
    let o = object("em", body, review("v3").decidables);
    let mut c = client_with(vec![o]);
    drawn_readback(&mut c, 100);
    assert_eq!(phase(&c), ReadbackPhase::Blocked(Block::UnsupportedKind));
}

#[test]
fn a_decision_readback_pins_its_option_and_note() {
    let mut first = action(CommandType::RecordDecision);
    first.option = Some(1);
    let mut second = action(CommandType::RecordDecision);
    second.option = Some(2);
    let o = object(
        "q1",
        review_body(),
        vec![decidable(
            "q1",
            basis(&[("question", "Q1")]),
            vec![first, second],
        )],
    );
    let mut c = client_with(vec![o]);
    let note = DraftKey {
        object: "q1".into(),
        kind: DraftKind::DecisionNote,
        base: Some("r2".into()),
    };
    c.edit_draft(note.clone(), DraftBody::Text("accept as is".into()));
    c.view_opened("q1");
    let pin = c.drawn_target("q1", Surface::WorkView).unwrap();

    let without_option = AuthorityRequest {
        verb: AuthorityVerb::Decide,
        option: None,
        subject: None,
        count: None,
        draft: Some(note.clone()),
    };
    assert_eq!(
        c.open_readback(&pin, without_option.clone()),
        Err(Refusal::OptionRequired)
    );

    c.open_readback(
        &pin,
        AuthorityRequest {
            option: Some(2),
            ..without_option
        },
    )
    .unwrap();
    c.readback_drawn(at(100));
    c.edit_draft(
        note.clone(),
        DraftBody::Text("changed after the readback opened".into()),
    );
    let intent = c.confirm(&key(150)).unwrap();
    assert_eq!(
        intent.body,
        CommandBody::Authority {
            subject: None,
            option: Some(2),
            note: Some("accept as is".into()),
            edits: vec![]
        }
    );
    assert_eq!(
        c.entry(&intent.id).unwrap().draft,
        Some(DraftLink {
            key: note,
            generation: 1
        })
    );
}

#[test]
fn a_new_epoch_voids_the_open_readback() {
    let mut c = client();
    drawn_readback(&mut c, 100);
    let effects = c.apply_inbound(
        Inbound::Snapshot {
            scope: wf(),
            at: cursor(Some("e2"), 1, 3),
            resources: vec![Resource::Object(review("v3"))],
        },
        at(150),
    );
    assert!(c.readback_phase().is_none());
    assert!(effects.contains(&Effect::Notice(Notice::ReadbackVoided)));
}

#[test]
fn every_authority_verb_maps_to_its_keymap_id_and_command_types() {
    let ids: Vec<_> = AuthorityVerb::ALL.iter().map(|v| v.keymap_id()).collect();
    assert_eq!(
        ids,
        [
            "auth.approve",
            "auth.rework",
            "auth.decide",
            "auth.shape",
            "auth.accept",
            "auth.cancel",
            "auth.routing",
            "auth.policy"
        ]
    );
    for verb in AuthorityVerb::ALL {
        assert_eq!(AuthorityVerb::from_keymap_id(verb.keymap_id()), Some(verb));
        for command in verb.command_types() {
            assert_eq!(command.verb(), Some(verb));
        }
    }
    let authority = CommandType::ALL.iter().filter(|c| c.is_authority()).count();
    assert_eq!(authority, 11);
}

#[test]
fn every_keymap_wire_type_is_a_command_type() {
    let keymap = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../assets/design/keymap.toml"
    ))
    .unwrap();
    let known: Vec<_> = CommandType::ALL.iter().map(|c| c.keymap_wire()).collect();
    for line in keymap.lines().filter(|l| l.starts_with("wire = ")) {
        for wire in line.split('"').skip(1).step_by(2) {
            assert!(
                known.contains(&wire) || wire == "queryReceipt" || wire == "resend",
                "{wire} has no CommandType"
            );
        }
    }
}
