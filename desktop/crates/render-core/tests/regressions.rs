mod common;
use common::*;
use render_core::*;

fn prompt() -> DraftKey {
    DraftKey {
        object: "conv".into(),
        kind: DraftKind::Prompt,
        base: None,
    }
}
fn conversation() -> Object {
    object("conv", chat_body(TurnPhase::Idle), vec![])
}
fn send(c: &mut Client) -> Result<CommandIntent, Refusal> {
    let pin = c.drawn_target("conv", Surface::WorkView).unwrap();
    c.submit(
        &pin,
        WriteRequest::SendMessage {
            draft: prompt(),
            follow_up: false,
        },
    )
}
fn pending() -> (Client, CommandIntent) {
    let mut c = client_with(vec![conversation()]);
    c.edit_draft(prompt(), DraftBody::Text("first".into()));
    let intent = send(&mut c).unwrap();
    prepare(&mut c, &intent);
    (c, intent)
}
fn restart(c: Client) -> Client {
    Client::new(serde_json::from_slice(&serde_json::to_vec(&c.local).unwrap()).unwrap())
}

#[test]
fn recreated_and_restored_drafts_survive_old_receipts_even_after_restart() {
    for restore in [false, true] {
        let (mut c, intent) = pending();
        c.discard_draft(&prompt()).unwrap();
        c = restart(c);
        if restore {
            c.restore_draft(
                prompt(),
                Draft {
                    body: DraftBody::Text("new bytes".into()),
                    generation: 1,
                },
            );
        } else {
            c.edit_draft(prompt(), DraftBody::Text("new bytes".into()));
        }
        c.apply_inbound(
            snapshot(wf(), 2, 12, vec![Resource::Object(conversation())]),
            at(5),
        );
        c.apply_inbound(
            receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
            at(6),
        );
        assert_eq!(
            c.local.drafts.get(&prompt()).map(|d| &d.body),
            Some(&DraftBody::Text("new bytes".into()))
        );
    }
}

#[test]
fn accepted_draft_cannot_be_resent_before_observation_but_new_edits_can() {
    for outcome in [
        ReceiptOutcome::Accepted { seq: 12 },
        ReceiptOutcome::Duplicate { seq: 12 },
    ] {
        let (mut c, intent) = pending();
        c.apply_inbound(receipt(&intent.id, outcome), at(5));
        assert_eq!(send(&mut c), Err(Refusal::DraftInFlight(intent.id)));
        c.edit_draft(prompt(), DraftBody::Text("next message".into()));
        assert!(send(&mut c).is_ok());
    }
}

#[test]
fn accepted_draft_waits_for_its_loaded_complete_scope_in_the_command_epoch() {
    let (mut c, intent) = pending();
    c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(5),
    );
    c = restart(c);
    let Resource::AttentionRow(mut row) = cancel_row(&Scope::Attention) else {
        unreachable!()
    };
    row.object = "conv".into();
    c.apply_inbound(
        snapshot(Scope::Attention, 90, 20, vec![Resource::AttentionRow(row)]),
        at(6),
    );
    assert!(c.local.drafts.contains_key(&prompt()));
    c.apply_inbound(
        snapshot(wf(), 1, 10, vec![Resource::Object(conversation())]),
        at(7),
    );
    c.apply_inbound(update(wf(), 3, 2, 12, vec![]), at(8));
    assert!(c.local.drafts.contains_key(&prompt()));
    c.apply_inbound(
        snapshot(wf(), 3, 12, vec![Resource::Object(conversation())]),
        at(9),
    );
    assert!(!c.local.drafts.contains_key(&prompt()));

    let (mut c, intent) = pending();
    c.apply_inbound(
        receipt(&intent.id, ReceiptOutcome::Accepted { seq: 12 }),
        at(5),
    );
    c.apply_inbound(
        Inbound::Snapshot {
            scope: wf(),
            at: cursor(Some("e2"), 1, 50),
            resources: vec![Resource::Object(conversation())],
        },
        at(6),
    );
    assert!(c.local.drafts.contains_key(&prompt()));
}

#[test]
fn incomplete_or_unverified_scope_blocks_authority_and_writes_without_erasing_content() {
    let failures = [
        update(wf(), 3, 2, 12, vec![]),
        Inbound::Update {
            scope: wf(),
            at: cursor(Some("e2"), 2, 12),
            prev_scope_seq: 1,
            changes: vec![],
            facts: vec![],
        },
        Inbound::Snapshot {
            scope: Scope::Attention,
            at: cursor(Some("e2"), 1, 20),
            resources: vec![],
        },
        Inbound::Snapshot {
            scope: wf(),
            at: cursor(None, 2, 12),
            resources: vec![
                Resource::Object(review("v3")),
                Resource::Object(conversation()),
            ],
        },
    ];
    for failure in failures {
        let mut c = client_with(vec![review("v3"), conversation()]);
        drawn_readback(&mut c, 100);
        c.apply_inbound(failure, at(150));
        assert!(c.confirm(&key(200)).is_err());
        assert_eq!(c.host.object("em"), Some(&review("v3")));
        drawn_readback(&mut c, 300);
        assert!(
            c.confirm(&key(301)).is_err(),
            "reopening cached content cannot verify its epoch"
        );
        c.edit_draft(prompt(), DraftBody::Text("message".into()));
        assert!(send(&mut c).is_err());
        c.apply_inbound(
            Inbound::Snapshot {
                scope: wf(),
                at: cursor(c.host.epoch.as_deref().or(Some("e1")), 4, 21),
                resources: vec![
                    Resource::Object(review("v3")),
                    Resource::Object(conversation()),
                ],
            },
            at(400),
        );
        drawn_readback(&mut c, 500);
        assert!(c.confirm(&key(501)).is_ok());
        assert!(send(&mut c).is_ok());
    }
}

fn cancel_row(scope: &Scope) -> Resource {
    let decidables = vec![decidable(
        "job",
        basis(&[("assignment", "g1")]),
        vec![action(CommandType::CancelWork)],
    )];
    match scope {
        Scope::Attention => Resource::AttentionRow(AttentionRow {
            id: "job".into(),
            object: "job".into(),
            group: AttentionGroup::Running,
            mark: None,
            title: None,
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
            decidables,
        }),
        Scope::Agents => Resource::AgentRow(AgentRow {
            assignment: "job".into(),
            generation: None,
            group: AgentGroup::Executing,
            slot: None,
            workflow: None,
            workflow_title: None,
            role: None,
            model: None,
            execution: None,
            cancellation: None,
            orphaned: false,
            since: None,
            last_activity: None,
            lifecycle: vec![],
            remedy: None,
            waits_on_you: false,
            conversation: None,
            decidables,
        }),
        _ => unreachable!(),
    }
}

#[test]
fn list_cancel_uses_its_actual_source_scope_not_object_or_other_scope_counters() {
    for scope in [Scope::Attention, Scope::Agents] {
        let mut c = client();
        c.apply_inbound(
            snapshot(scope.clone(), 99, 10, vec![cancel_row(&scope)]),
            at(0),
        );
        c.view_opened("job");
        let pin = c.drawn_target("job", Surface::ListRow).unwrap();
        let cancel = AuthorityRequest {
            verb: AuthorityVerb::Cancel,
            ..approve()
        };
        c.open_readback(&pin, cancel.clone()).unwrap();
        c.readback_drawn(at(100));
        c.apply_inbound(update(wf(), 3, 2, 12, vec![]), at(101));
        assert_eq!(c.readback_phase(), Some(ReadbackPhase::Fresh));
        c.apply_inbound(update(scope.clone(), 101, 100, 12, vec![]), at(102));
        assert!(c.confirm(&key(103)).is_err());
        c.apply_inbound(
            snapshot(scope.clone(), 101, 12, vec![cancel_row(&scope)]),
            at(104),
        );
        c.open_readback(&pin, cancel).unwrap();
        c.readback_drawn(at(105));
        assert!(c.confirm(&key(106)).is_ok());
    }
}
