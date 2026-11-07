use render_core::*;
use render_host::*;

fn object() -> Object {
    Object {
        id: "chat".into(),
        revision: Some("r1".into()),
        title: None,
        project: None,
        workflow: Some("wf".into()),
        handover: Handover::default(),
        next: None,
        track: None,
        decidables: vec![],
        body: ObjectBody::Chat(Chat {
            roster: vec![],
            messages: vec![],
            turn: Some(TurnState {
                turn: Some("t1".into()),
                phase: TurnPhase::Running,
                since: None,
                tools: None,
            }),
            steers: vec![],
            artifacts: vec![],
            complete: true,
        }),
    }
}
fn initial(o: Object) -> Vec<Inbound> {
    vec![Inbound::Snapshot {
        scope: Scope::Object(o.id.clone()),
        at: Cursor {
            epoch: Some("demo".into()),
            scope_seq: 1,
            ledger_seq: Some(10),
            host_time: None,
        },
        resources: vec![Resource::Object(o)],
    }]
}
fn intent() -> CommandIntent {
    CommandIntent {
        id: "c1".into(),
        command: CommandType::SendMessage,
        target: "chat".into(),
        scope: EnvelopeScope::Workflow("wf".into()),
        epoch: Some("demo".into()),
        expected: None,
        body: CommandBody::SendMessage {
            conversation: "chat".into(),
            mode: SendMode::Steer,
            turn: Some("t1".into()),
            text: "hello".into(),
        },
    }
}
fn drain(a: &mut impl HostAdapter) -> Vec<Inbound> {
    std::iter::from_fn(|| a.poll()).collect()
}
fn connected() -> DemoAdapter {
    let mut a = DemoAdapter::new(initial(object()));
    a.connect().unwrap();
    drain(&mut a);
    a
}
fn outcome(a: &mut impl HostAdapter) -> ReceiptOutcome {
    drain(a)
        .into_iter()
        .find_map(|m| match m {
            Inbound::Receipt { outcome, .. } => Some(outcome),
            _ => None,
        })
        .unwrap()
}

fn fetch_review(a: &mut DemoAdapter) -> Object {
    a.fetch(&Scope::Object(demo_data::REVIEW.into())).unwrap();
    drain(a)
        .into_iter()
        .find_map(|frame| match frame {
            Inbound::Snapshot { resources, .. } => resources.into_iter().find_map(|r| match r {
                Resource::Object(o) if o.id == demo_data::REVIEW => Some(o),
                _ => None,
            }),
            _ => None,
        })
        .unwrap()
}
fn review(o: &Object) -> &Review {
    let ObjectBody::Review(r) = &o.body else {
        panic!("expected review")
    };
    r
}
fn review_adapter() -> (DemoAdapter, CommandIntent) {
    let frames = demo_data::snapshots();
    let epoch = frames.iter().find_map(|f| match f {
        Inbound::Snapshot { at, .. } => at.epoch.clone(),
        _ => None,
    });
    let mut a = DemoAdapter::new(frames);
    a.connect().unwrap();
    drain(&mut a);
    let o = fetch_review(&mut a);
    let r = review(&o);
    let i = CommandIntent {
        id: "save-1".into(),
        command: CommandType::SaveAnnotations,
        target: o.id.clone(),
        scope: EnvelopeScope::Workflow(o.workflow.clone().unwrap()),
        epoch,
        expected: None,
        body: CommandBody::SaveAnnotations {
            emission: r.emission.clone(),
            base_set: r.annotation_set.clone(),
            items: vec![LocalNote {
                local_id: 1,
                anchor: r.annotations[0].anchor.clone(),
                body: "  exact note: café\r\nsecond line\n".into(),
            }],
        },
    };
    (a, i)
}

#[test]
fn saving_local_notes_appends_exact_bytes_and_allows_the_next_save() {
    let (mut a, mut i) = review_adapter();
    let original = fetch_review(&mut a);
    let mut previous = original.clone();
    for n in 1..=2 {
        i.id = format!("save-{n}");
        let CommandBody::SaveAnnotations {
            base_set, items, ..
        } = &mut i.body
        else {
            panic!()
        };
        *base_set = review(&previous).annotation_set.clone();
        items[0].local_id = n;
        let note = items[0].clone();
        a.transmit(&a.prepare(&i).unwrap()).unwrap();
        assert!(matches!(outcome(&mut a), ReceiptOutcome::Accepted { .. }));
        let saved = fetch_review(&mut a);
        let r = review(&saved);
        let old = review(&previous);
        assert_eq!(r.annotations.len(), old.annotations.len() + 1);
        assert_eq!(
            &r.annotations[..old.annotations.len()],
            old.annotations.as_slice()
        );
        let added = r.annotations.last().unwrap();
        assert_eq!(added.body, Text::Content(note.body));
        assert_eq!(added.anchor, note.anchor);
        assert_eq!(Some(&added.set_revision), r.annotation_set.as_ref());
        assert_ne!(r.annotation_set, old.annotation_set);
        assert_eq!(r.text.as_bytes(), review(&original).text.as_bytes());
        assert_eq!(r.digest, review(&original).digest);
        previous = saved;
    }
}

#[test]
fn saved_annotations_refresh_basis_and_reject_old_approval() {
    let (mut a, save) = review_adapter();
    let original = fetch_review(&mut a);
    let old_basis = original.decidables[0].basis.clone();
    let mut approval = CommandIntent {
        id: "old-approval".into(),
        command: CommandType::ApproveCheckpoint,
        expected: Some(old_basis.clone()),
        body: CommandBody::Authority {
            subject: None,
            option: None,
            note: None,
            edits: vec![],
        },
        ..save.clone()
    };
    let pinned = a.prepare(&approval).unwrap();
    a.transmit(&a.prepare(&save).unwrap()).unwrap();
    let ReceiptOutcome::Accepted { seq } = outcome(&mut a) else {
        panic!("save rejected")
    };
    let saved = fetch_review(&mut a);
    let basis = &saved.decidables[0].basis;
    assert_ne!(basis.digest, old_basis.digest);
    for (old, current) in old_basis.fields.iter().zip(&basis.fields) {
        if old.name == "annotations" {
            assert_eq!(current.revision, review(&saved).annotation_set);
            assert_ne!(current.digest, old.digest);
            assert_eq!(current.changed_seq, Some(seq));
            assert_eq!(current.changed_at, None);
            assert_eq!(current.changed_by, None);
        } else {
            assert_eq!(current, old);
        }
    }
    a.transmit(&pinned).unwrap();
    let ReceiptOutcome::StaleBasis(stale) = outcome(&mut a) else {
        panic!("old approval was not stale")
    };
    assert_eq!(stale.sent, old_basis);
    assert_eq!(&stale.current, basis);
    assert_eq!(fetch_review(&mut a), saved);
    approval.id = "fresh-approval".into();
    approval.expected = Some(basis.clone());
    a.transmit(&a.prepare(&approval).unwrap()).unwrap();
    assert!(matches!(outcome(&mut a), ReceiptOutcome::Accepted { .. }));
    let approved = fetch_review(&mut a);
    assert!(approved.decidables.is_empty());
    assert_eq!(approved.next, Some(Next::Nothing));
    assert_eq!(
        review(&approved).text.as_bytes(),
        review(&original).text.as_bytes()
    );
}

#[test]
fn disconnected_never_claims_live_or_accepts_work() {
    let mut a = DisconnectedAdapter::default();
    assert!(a.connect().is_err());
    assert!(a.prepare(&intent()).is_err());
    assert!(a.query_receipt("c1").is_err());
    assert!(a.fetch(&Scope::Attention).is_err());
    assert!(a.subscribe(&[Scope::Attention]).is_err());
    let prepared = connected().prepare(&intent()).unwrap();
    assert!(a.transmit(&prepared).is_err());
    assert!(drain(&mut a).iter().all(|m| !matches!(
        m,
        Inbound::Connection(ConnectionEvent::Live { .. }) | Inbound::Receipt { .. }
    )));
}
#[test]
fn connect_preserves_supplied_domain_and_never_sends_commands() {
    let frames = initial(object());
    let mut a = DemoAdapter::new(frames.clone());
    assert!(a.poll().is_none());
    a.connect().unwrap();
    let messages = drain(&mut a);
    assert!(matches!(
        messages.first(),
        Some(Inbound::Connection(ConnectionEvent::Connecting))
    ));
    assert!(
        matches!(&messages[1], Inbound::Connection(ConnectionEvent::Live { host_name: Some(n), .. }) if n.contains("demo"))
    );
    assert_eq!(&messages[2..], frames.as_slice());
    assert!(a.poll().is_none());
}
#[test]
fn encoding_is_versioned_and_preserves_id_and_exact_retry_bytes() {
    let mut a = connected();
    let p = a.prepare(&intent()).unwrap();
    assert_eq!(p.format, "render-desktop-demo/1");
    assert_eq!(p.id, "c1");
    let json: serde_json::Value = serde_json::from_slice(&p.bytes).unwrap();
    assert_eq!(json["version"], 1);
    assert_eq!(json["intent"]["id"], "c1");
    a.transmit(&p).unwrap();
    assert_eq!(outcome(&mut a), ReceiptOutcome::Accepted { seq: 11 });
    a.transmit(&p).unwrap();
    assert_eq!(outcome(&mut a), ReceiptOutcome::Duplicate { seq: 11 });
    let mut changed = p.clone();
    changed.bytes.push(b' ');
    a.transmit(&changed).unwrap();
    assert_eq!(outcome(&mut a), ReceiptOutcome::CommandConflict);
    a.query_receipt("c1").unwrap();
    assert_eq!(outcome(&mut a), ReceiptOutcome::Accepted { seq: 11 });
}
#[test]
fn malformed_envelopes_do_not_produce_receipts() {
    let mut a = connected();
    let p = a.prepare(&intent()).unwrap();
    let mut bad = p.clone();
    bad.format = "render-public/1".into();
    assert!(a.transmit(&bad).is_err());
    let mut bad = p.clone();
    bad.id = "other".into();
    assert!(a.transmit(&bad).is_err());
    for field in ["version", "format"] {
        let mut bad = p.clone();
        let mut v: serde_json::Value = serde_json::from_slice(&p.bytes).unwrap();
        v[field] = serde_json::json!(999);
        bad.bytes = serde_json::to_vec(&v).unwrap();
        assert!(a.transmit(&bad).is_err());
    }
    let mut bad_intent = intent();
    bad_intent.command = CommandType::ApproveCheckpoint;
    assert!(a.prepare(&bad_intent).is_err());
    assert!(a.poll().is_none());
}
#[test]
fn querying_missing_receipt_never_executes_prepared_command() {
    let mut a = connected();
    let _p = a.prepare(&intent()).unwrap();
    a.query_receipt("c1").unwrap();
    assert_eq!(
        drain(&mut a),
        vec![Inbound::Receipt {
            command: "c1".into(),
            outcome: ReceiptOutcome::NotFound
        }]
    );
    a.fetch(&Scope::Object("chat".into())).unwrap();
    assert_eq!(drain(&mut a), initial(object()));
    assert!(a.fetch(&Scope::Object("missing".into())).is_err());
}
#[test]
fn accepted_write_precedes_receipt_and_fetch_and_subscribe_are_current() {
    let mut a = connected();
    a.transmit(&a.prepare(&intent()).unwrap()).unwrap();
    let frames = drain(&mut a);
    assert!(matches!(&frames[0], Inbound::Update { at, .. } if at.ledger_seq == Some(11)));
    assert_eq!(
        frames.last(),
        Some(&Inbound::Receipt {
            command: "c1".into(),
            outcome: ReceiptOutcome::Accepted { seq: 11 }
        })
    );
    a.fetch(&Scope::Object("chat".into())).unwrap();
    let fetched = drain(&mut a);
    let Inbound::Snapshot { at, resources, .. } = &fetched[0] else {
        panic!()
    };
    assert_eq!(at.ledger_seq, Some(11));
    let Resource::Object(o) = &resources[0] else {
        panic!()
    };
    let ObjectBody::Chat(chat) = &o.body else {
        panic!()
    };
    assert_eq!(chat.steers[0].text, Text::Content("hello".into()));
    a.subscribe(&[Scope::Object("chat".into())]).unwrap();
    assert_eq!(drain(&mut a), fetched);
}
#[test]
fn stale_epoch_target_and_chat_turn_refuse_without_changing_snapshot() {
    for (turn, expected) in [
        (Some("other".into()), ReceiptOutcome::TurnStateChanged),
        (None, ReceiptOutcome::TurnStateChanged),
    ] {
        let mut a = connected();
        let mut i = intent();
        if let CommandBody::SendMessage { turn: t, .. } = &mut i.body {
            *t = turn;
        }
        a.transmit(&a.prepare(&i).unwrap()).unwrap();
        assert_eq!(outcome(&mut a), expected);
        a.fetch(&Scope::Object("chat".into())).unwrap();
        assert_eq!(drain(&mut a), initial(object()));
    }
    let mut o = object();
    if let ObjectBody::Chat(c) = &mut o.body {
        c.turn.as_mut().unwrap().phase = TurnPhase::Ended;
    }
    let mut a = DemoAdapter::new(initial(o));
    a.connect().unwrap();
    drain(&mut a);
    a.transmit(&a.prepare(&intent()).unwrap()).unwrap();
    assert_eq!(outcome(&mut a), ReceiptOutcome::TurnEnded);
    let mut a = connected();
    let mut i = intent();
    i.epoch = Some("old".into());
    a.transmit(&a.prepare(&i).unwrap()).unwrap();
    assert!(
        matches!(outcome(&mut a), ReceiptOutcome::Refused { code, .. } if code == "epoch_changed")
    );
}
#[test]
fn authority_checks_exact_basis_and_unavailable_actions() {
    let mut o = object();
    o.decidables.push(Decidable {
        target: "chat".into(),
        subject: None,
        basis: Basis {
            digest: "current".into(),
            fields: vec![],
        },
        actions: vec![HostAction {
            command: CommandType::ApproveCheckpoint,
            option: None,
            option_kind: None,
            recommended: false,
            availability: Availability::Available,
            effect: None,
            not: vec![],
            carries: None,
        }],
    });
    let mut a = DemoAdapter::new(initial(o.clone()));
    a.connect().unwrap();
    drain(&mut a);
    let mut i = intent();
    i.command = CommandType::ApproveCheckpoint;
    i.expected = Some(Basis::default());
    i.body = CommandBody::Authority {
        subject: None,
        option: None,
        note: None,
        edits: vec![],
    };
    a.transmit(&a.prepare(&i).unwrap()).unwrap();
    assert!(matches!(outcome(&mut a), ReceiptOutcome::StaleBasis(_)));
    a.fetch(&Scope::Object("chat".into())).unwrap();
    assert_eq!(drain(&mut a), initial(o));
}
