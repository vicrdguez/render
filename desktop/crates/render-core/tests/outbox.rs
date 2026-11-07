mod common;

use common::*;
use render_core::*;

fn notes_key() -> DraftKey {
    DraftKey {
        object: "em".into(),
        kind: DraftKind::Annotations,
        base: Some("v3".into()),
    }
}

fn note(body: &str) -> LocalNote {
    LocalNote {
        local_id: 1,
        anchor: Anchor {
            node: Some("M2".into()),
            byte_start: 0,
            byte_end: 4,
            quote: "# Mo".into(),
        },
        body: body.into(),
    }
}

fn save(c: &mut Client) -> CommandIntent {
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() })
        .unwrap()
}

fn with_draft() -> Client {
    let mut c = client();
    c.edit_draft(notes_key(), DraftBody::Notes(vec![note("concern")]));
    c
}

fn restart(c: &Client) -> Client {
    let bytes = serde_json::to_vec(&c.local).unwrap();
    Client::new(serde_json::from_slice(&bytes).unwrap())
}

#[test]
fn a_save_carries_the_draft_on_its_base_revision() {
    let mut c = with_draft();
    let intent = save(&mut c);
    assert_eq!(intent.command, CommandType::SaveAnnotations);
    assert_eq!(
        intent.body,
        CommandBody::SaveAnnotations {
            emission: "em".into(),
            base_set: Some("v3".into()),
            items: vec![note("concern")]
        }
    );
    assert_eq!(intent.scope, EnvelopeScope::Workflow("wf".into()));
    assert_eq!(intent.expected, None);
}

#[test]
fn offline_there_is_no_queue() {
    let mut c = with_draft();
    c.apply_inbound(
        Inbound::Connection(ConnectionEvent::Offline { reason: None }),
        at(1),
    );
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::Offline)
    );
    assert!(c.local.outbox.is_empty());
    assert!(c.local.drafts.contains_key(&notes_key()));
}

#[test]
fn a_paused_host_refuses_writes_but_drafts_keep_working() {
    let mut c = with_draft();
    c.apply_inbound(
        Inbound::Admission(Admission::Paused {
            reason: Some(Text::Host("catching up".into())),
        }),
        at(1),
    );
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::Paused(Some(Text::Host("catching up".into()))))
    );
    assert_eq!(
        c.edit_draft(notes_key(), DraftBody::Notes(vec![note("more")])),
        2
    );
}

#[test]
fn command_ids_are_device_namespaced_and_never_reused_across_restarts() {
    let mut c = with_draft();
    let first = save(&mut c);
    c.abandon_unsent(&first.id);
    let mut again = restart(&c);
    again.apply_inbound(live(), at(0));
    again.apply_inbound(
        snapshot(wf(), 1, 10, vec![Resource::Object(review("v3"))]),
        at(0),
    );
    let second = save(&mut again);
    assert_ne!(first.id, second.id);
    assert!(second.id.starts_with("dev-"));

    let mut anonymous = Client::new(DeviceState::default());
    anonymous.apply_inbound(live(), at(0));
    anonymous.apply_inbound(
        snapshot(wf(), 1, 10, vec![Resource::Object(review("v3"))]),
        at(0),
    );
    anonymous.edit_draft(notes_key(), DraftBody::Notes(vec![note("x")]));
    let pin = anonymous.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        anonymous.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::NoDeviceId)
    );
}

#[test]
fn the_same_draft_is_not_sent_twice_under_a_new_id_while_unresolved() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        at(5),
    );
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::DraftInFlight(intent.id))
    );
}

#[test]
fn a_lost_command_is_unknown_and_retries_the_identical_bytes() {
    let mut c = with_draft();
    let intent = save(&mut c);
    assert!(matches!(
        c.retry(&intent.id, "demo/1"),
        Err(Refusal::NotUnknown)
    ));
    let bytes = prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        at(5),
    );
    assert!(matches!(
        c.entry(&intent.id).unwrap().state,
        OutboxState::Unknown { .. }
    ));
    assert_eq!(c.retry(&intent.id, "demo/1"), Ok(bytes.clone()));
    assert_eq!(
        c.retry(&intent.id, "wire/2"),
        Err(Refusal::FormatUnsupported)
    );

    let restarted = restart(&c);
    assert_eq!(restarted.entry(&intent.id).unwrap().prepared, Some(bytes));
}

#[test]
fn retry_and_receipt_query_need_a_connection() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Connection(ConnectionEvent::Offline { reason: None }),
        at(5),
    );
    assert!(
        matches!(
            c.entry(&intent.id).unwrap().state,
            OutboxState::Unknown { .. }
        ),
        "dropping the connection makes a sent command unknown"
    );
    assert_eq!(c.retry(&intent.id, "demo/1"), Err(Refusal::Offline));
    assert_eq!(c.query_receipt(&intent.id), Err(Refusal::Offline));
    c.apply_inbound(
        Inbound::Connection(ConnectionEvent::Revoked { at: None }),
        at(6),
    );
    assert_eq!(c.retry(&intent.id, "demo/1"), Err(Refusal::Revoked));
    assert!(c.local.drafts.contains_key(&notes_key()));
}

#[test]
fn not_found_never_proves_the_command_was_unsent() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        at(5),
    );
    assert_eq!(c.query_receipt(&intent.id), Ok(()));
    c.apply_inbound(receipt(&intent.id, ReceiptOutcome::NotFound), at(6));
    let OutboxState::Unknown { last_query, .. } = &c.entry(&intent.id).unwrap().state else {
        panic!("still unknown")
    };
    assert_eq!(last_query, &Some(ReceiptOutcome::NotFound));
    assert!(c.retry(&intent.id, "demo/1").is_ok());
}

#[test]
fn after_an_epoch_change_old_entries_cannot_be_retried_but_can_be_queried() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Snapshot {
            scope: wf(),
            at: cursor(Some("e2"), 1, 3),
            resources: vec![Resource::Object(review("v3"))],
        },
        at(5),
    );
    assert_eq!(
        c.retry(&intent.id, "demo/1"),
        Err(Refusal::RetryBlocked(RetryBlock::EpochChanged))
    );
    assert_eq!(c.query_receipt(&intent.id), Ok(()));
}

#[test]
fn a_restart_turns_written_and_sent_into_unknown_and_sends_nothing() {
    let mut c = with_draft();
    let sent = save(&mut c);
    prepare(&mut c, &sent);
    c.edit_draft(
        DraftKey {
            object: "conv".into(),
            kind: DraftKind::Prompt,
            base: None,
        },
        DraftBody::Text("hi".into()),
    );
    let mut fresh = Client::new(c.local.clone());
    fresh.local.outbox.push(OutboxEntry {
        intent: sent.clone(),
        prepared: None,
        draft: None,
        created_at: None,
        state: OutboxState::Preparing,
    });
    fresh.local.outbox.last_mut().unwrap().intent.id = "dev-never-prepared".into();

    let once = restart(&fresh);
    let twice = restart(&once);
    assert_eq!(once.local, twice.local, "loading is idempotent");
    assert!(matches!(
        once.entry(&sent.id).unwrap().state,
        OutboxState::Unknown { .. }
    ));
    assert!(
        once.entry("dev-never-prepared").is_none(),
        "nothing was transmitted for an unprepared intent"
    );
    assert_eq!(once.local.drafts.len(), 2);
}

#[test]
fn an_accepted_save_clears_its_draft_only_once_the_host_seq_is_observed() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(5),
    );
    assert!(
        c.local.drafts.contains_key(&notes_key()),
        "the receipt arrived before the update that carries it"
    );
    c.apply_inbound(update(wf(), 2, 1, 11, vec![]), at(6));
    assert!(c.local.drafts.contains_key(&notes_key()));
    c.apply_inbound(update(wf(), 3, 2, 12, vec![]), at(7));
    assert!(!c.local.drafts.contains_key(&notes_key()));
}

#[test]
fn an_accepted_save_after_the_update_clears_at_once() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(update(wf(), 2, 1, 12, vec![]), at(6));
    let effects = c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(7),
    );
    assert!(!c.local.drafts.contains_key(&notes_key()));
    assert!(effects.contains(&Effect::Persist));
}

#[test]
fn edits_made_after_the_save_was_sent_survive_its_acceptance() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.edit_draft(
        notes_key(),
        DraftBody::Notes(vec![note("concern"), note("second thought")]),
    );
    c.apply_inbound(update(wf(), 2, 1, 12, vec![]), at(6));
    c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(7),
    );
    assert_eq!(
        c.local.drafts[&notes_key()].body,
        DraftBody::Notes(vec![note("concern"), note("second thought")])
    );
}

#[test]
fn refusals_keep_the_draft() {
    for outcome in [
        ReceiptOutcome::StaleBasis(StaleReply {
            sent: Basis::default(),
            current: Basis::default(),
            changes: vec![],
            changed_refs: vec![],
            actions: vec![],
            note: None,
        }),
        ReceiptOutcome::Refused {
            code: "x".into(),
            reason: None,
            repair: vec![],
        },
        ReceiptOutcome::CommandConflict,
        ReceiptOutcome::TurnStateChanged,
    ] {
        let mut c = with_draft();
        let intent = save(&mut c);
        prepare(&mut c, &intent);
        c.apply_inbound(receipt(&intent.id, outcome.clone()), at(5));
        c.apply_inbound(update(wf(), 2, 1, 50, vec![]), at(6));
        assert!(
            c.local.drafts.contains_key(&notes_key()),
            "{outcome:?} lost the draft"
        );
        assert_eq!(
            c.entry(&intent.id).unwrap().state,
            OutboxState::Settled(outcome)
        );
    }
}

#[test]
fn a_duplicate_receipt_settles_once_and_says_so() {
    let mut c = with_draft();
    let intent = save(&mut c);
    prepare(&mut c, &intent);
    c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(5),
    );
    let effects = c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Duplicate { seq: 12 }),
        at(6),
    );
    assert_eq!(
        c.entry(&intent.id).unwrap().state,
        OutboxState::Settled(ReceiptOutcome::Accepted { seq: 12 })
    );
    assert!(effects.contains(&Effect::Notice(Notice::AlreadyApplied {
        command: intent.id.clone(),
        seq: 12
    })));
}

#[test]
fn bytes_must_be_stored_before_transmit_and_a_failed_persist_can_abandon() {
    let mut c = with_draft();
    let intent = save(&mut c);
    assert_eq!(c.transmitted(&intent.id), Err(Refusal::NoBytes));
    let wrong = PreparedCommand {
        id: "other".into(),
        format: "demo/1".into(),
        bytes: vec![1],
        summary: String::new(),
    };
    assert_eq!(c.prepared(wrong), Err(Refusal::UnknownCommand));
    c.prepared(PreparedCommand {
        id: intent.id.clone(),
        format: "demo/1".into(),
        bytes: vec![1],
        summary: String::new(),
    })
    .unwrap();
    assert!(c.abandon_unsent(&intent.id));
    assert!(c.entry(&intent.id).is_none());
    assert!(c.local.drafts.contains_key(&notes_key()));
}

#[test]
fn a_message_travels_with_the_send_mode_that_was_drawn() {
    let conv = object("conv", chat_body(TurnPhase::Ended), vec![]);
    let mut c = client_with(vec![conv]);
    let prompt = DraftKey {
        object: "conv".into(),
        kind: DraftKind::Prompt,
        base: None,
    };
    c.edit_draft(prompt.clone(), DraftBody::Text("next step".into()));
    let drawn = c.drawn_target("conv", Surface::WorkView).unwrap();
    assert_eq!(drawn.send_mode, Some(SendMode::Prompt));
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(object(
                "conv",
                chat_body(TurnPhase::Running),
                vec![],
            )))],
        ),
        at(5),
    );
    let intent = c
        .submit(
            &drawn,
            WriteRequest::SendMessage {
                draft: prompt.clone(),
                follow_up: false,
            },
        )
        .unwrap();
    assert_eq!(
        intent.body,
        CommandBody::SendMessage {
            conversation: "conv".into(),
            mode: SendMode::Prompt,
            turn: Some("t42".into()),
            text: "next step".into()
        }
    );
    prepare(&mut c, &intent);
    c.apply_inbound(receipt(&intent.id, ReceiptOutcome::TurnStateChanged), at(6));
    assert!(c.local.drafts.contains_key(&prompt));
}

#[test]
fn an_empty_or_missing_draft_is_not_sent() {
    let mut c = client();
    let pin = c.drawn_target("em", Surface::WorkView).unwrap();
    assert_eq!(
        c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::NoDraft)
    );
    c.edit_draft(notes_key(), DraftBody::Notes(vec![]));
    assert_eq!(
        c.submit(&pin, WriteRequest::SaveAnnotations { draft: notes_key() }),
        Err(Refusal::NoDraft)
    );
}

#[test]
fn a_discarded_draft_can_be_restored() {
    let mut c = with_draft();
    let draft = c.discard_draft(&notes_key()).unwrap();
    assert!(c.local.drafts.is_empty());
    c.restore_draft(notes_key(), draft.clone());
    assert_eq!(c.local.drafts[&notes_key()], draft);
}
