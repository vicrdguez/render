mod common;

use common::*;
use render_core::*;

fn row(id: &str, group: AttentionGroup, mark: Option<RowMark>) -> Resource {
    Resource::AttentionRow(AttentionRow {
        id: id.into(),
        object: id.into(),
        group,
        mark,
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
        decidables: vec![],
    })
}

#[test]
fn count_tags_equal_their_brief_groups_and_include_local_unknown_outcomes() {
    let mut c = client();
    c.apply_inbound(
        snapshot(
            Scope::Attention,
            1,
            10,
            vec![
                row("a", AttentionGroup::NeedsYou, Some(RowMark::NeedsYou)),
                row("b", AttentionGroup::NeedsYou, Some(RowMark::NeedsYou)),
                row("c", AttentionGroup::OnHost, Some(RowMark::Failed)),
                row("d", AttentionGroup::Waiting, Some(RowMark::Unknown)),
                row("e", AttentionGroup::Running, None),
            ],
        ),
        at(0),
    );
    assert_eq!(
        c.count_tags(),
        CountTags {
            needs_you: 2,
            on_host: 1,
            unknown: 1
        }
    );

    drawn_readback(&mut c, 100);
    let intent = c.confirm(&key(101)).unwrap();
    prepare(&mut c, &intent);
    c.apply_inbound(Inbound::Lost { command: intent.id }, at(200));
    assert_eq!(c.count_tags().unknown, 2);
}

fn with_handover(handover: Handover, track: Option<Track>) -> Client {
    let mut o = review("v3");
    o.handover = handover;
    o.track = track;
    client_with(vec![o])
}

fn blocker() -> Blocker {
    Blocker::Typed(Blockage {
        wait: WaitClass::Human,
        id: Some("F16".into()),
        severity: Some("HARD".into()),
        text: Text::Host("aliased callee".into()),
        refs: vec![],
        since: None,
        downstream: None,
    })
}

fn evidence(seq: Seq) -> EvidenceFact {
    EvidenceFact {
        summary: Text::Host("pass 2".into()),
        verdict: None,
        source_digest: None,
        current_head: None,
        seq: Some(seq),
    }
}

#[test]
fn the_abnormal_slot_shows_the_highest_rung_that_applies() {
    let calm = Track {
        zoom: TrackZoom::Design,
        stages: vec![],
        calm: Some(Text::Host("your review · captured s2".into())),
    };
    let c = with_handover(Handover::default(), Some(calm.clone()));
    assert_eq!(
        c.abnormal("em"),
        Abnormal::Calm(Some(Text::Host("your review · captured s2".into())))
    );

    let delegated = Track {
        stages: vec![TrackStage {
            label: "Modules".into(),
            state: StageState::Delegated,
            at: None,
            detail: None,
        }],
        ..calm.clone()
    };
    assert!(matches!(
        with_handover(Handover::default(), Some(delegated.clone())).abnormal("em"),
        Abnormal::Delegated(_)
    ));

    let mut c = with_handover(
        Handover {
            evidence: Some(evidence(40)),
            ..Handover::default()
        },
        Some(delegated),
    );
    assert_eq!(c.abnormal("em"), Abnormal::EvidenceNotShown(evidence(40)));
    assert!(c.mark_evidence_shown("em"));
    assert!(matches!(c.abnormal("em"), Abnormal::Delegated(_)));

    let mut c = with_handover(
        Handover {
            evidence: Some(evidence(40)),
            blocker: Some(blocker()),
            ..Handover::default()
        },
        None,
    );
    let Blocker::Typed(b) = blocker() else {
        unreachable!()
    };
    assert_eq!(c.abnormal("em"), Abnormal::Blocker(b));

    drawn_readback(&mut c, 100);
    let intent = c.confirm(&key(101)).unwrap();
    prepare(&mut c, &intent);
    c.apply_inbound(
        Inbound::Lost {
            command: intent.id.clone(),
        },
        at(200),
    );
    assert_eq!(c.abnormal("em"), Abnormal::UnknownCommand(intent.id));
}

#[test]
fn an_operation_with_an_unknown_outcome_is_rung_one() {
    let op = OperationView {
        label: Text::Host("create draft proposal PR".into()),
        state: OperationState::Unknown,
        payload_digest: None,
        attempts: vec![],
        observations: vec![],
        blocks: vec![],
        continues: vec![],
        safe_choices: vec![],
        next_check: None,
        duplicate_risk_since: Some(host_time(5)),
        recovery_decision: None,
    };
    let c = client_with(vec![object("op9", ObjectBody::Operation(op), vec![])]);
    assert_eq!(
        c.abnormal("op9"),
        Abnormal::UnknownEffect {
            duplicate_risk_since: Some(host_time(5))
        }
    );
}
