use render_core::*;
use render_desktop::presentation::PresentedLists;

fn host() -> HostSnapshot {
    let mut h = HostSnapshot::default();
    h.attention.rows = ["a", "b"]
        .map(|id| AttentionRow {
            id: format!("row-{id}"),
            object: id.into(),
            group: AttentionGroup::NeedsYou,
            mark: Some(RowMark::NeedsYou),
            title: Some("original source\nbytes".into()),
            project: None,
            proposal: None,
            wait: None,
            since: None,
            next: Some(Next::Nothing),
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
        .to_vec();
    h.attention.proposals.push(ProposalSummary {
        id: "p".into(),
        project: None,
        name: "proposal".into(),
        title: None,
        shape: None,
        path: vec![],
        readiness: Readiness {
            eligibility: None,
            gaps: vec![],
            published: None,
            promotion: None,
            forge: None,
            duplicate_risk_since: None,
            merged_differs: false,
        },
        status: None,
        needs_you: true,
        superseded: false,
    });
    h.slices.rows.push(SliceRow {
        id: "s".into(),
        workflow: "w".into(),
        project: None,
        proposal: None,
        title: None,
        lifecycle: "running".into(),
        wait: None,
        reason: None,
        since: None,
        downstream: None,
        assignment: None,
        next: Some(ActionKind::Review),
        last_fact: None,
    });
    h.agents.rows.push(AgentRow {
        assignment: "agent".into(),
        generation: None,
        group: AgentGroup::Executing,
        slot: None,
        workflow: None,
        workflow_title: None,
        role: None,
        model: None,
        execution: Some(Execution::Running),
        cancellation: None,
        orphaned: false,
        since: None,
        last_activity: None,
        lifecycle: vec![],
        remedy: None,
        waits_on_you: true,
        conversation: None,
        decidables: vec![],
    });
    h
}

#[test]
fn first_frame_initializes_even_during_typing_and_identical_updates_are_noops() {
    let h = host();
    let mut p = PresentedLists::default();
    assert!(p.update(&h, true));
    assert!(p.initialized);
    assert_eq!(p.attention, h.attention.rows);
    assert_eq!(p.proposals, h.attention.proposals);
    assert_eq!(p.slices, h.slices.rows);
    assert_eq!(p.agents, h.agents.rows);
    assert!(!p.pending);
    assert!(!p.update(&h, true));
    assert!(!p.update(&h, false));
}

#[test]
fn insertions_between_keys_and_reorders_wait_for_idle() {
    let mut h = host();
    let mut p = PresentedLists::default();
    p.update(&h, false);
    let original = p.attention.clone();
    let mut inserted = h.attention.rows[0].clone();
    inserted.object = "new".into();
    h.attention.rows.insert(0, inserted);
    assert!(p.update(&h, true));
    assert_eq!(p.attention, original);
    assert!(p.pending);
    h.attention.rows.reverse();
    p.update(&h, true);
    assert_eq!(p.attention, original);
    // The caller supplies false after 1.5 seconds, even with a prefix pending.
    assert!(p.update(&h, false));
    assert_eq!(p.attention, h.attention.rows);
    assert!(!p.pending);
    assert!(p.tombstones.is_empty());
}

#[test]
fn reorder_without_membership_changes_is_pending() {
    let mut h = host();
    let mut p = PresentedLists::default();
    p.update(&h, false);
    h.attention.rows.reverse();
    assert!(p.update(&h, true));
    assert!(p.pending);
    assert_eq!(p.attention[0].object, "a");
    assert!(p.tombstones.is_empty());
}

#[test]
fn removal_retains_selected_identity_not_neighbor_and_disables_all_row_actions() {
    let mut h = host();
    let mut p = PresentedLists::default();
    p.update(&h, false);
    h.attention.rows.remove(0);
    h.attention.proposals.clear();
    h.slices.rows.clear();
    h.agents.rows.clear();
    let authoritative = h.clone();
    assert!(p.update(&h, true));
    assert_eq!(p.attention[0].object, "a");
    assert_eq!(p.attention[1].object, "b");
    assert_eq!(
        p.attention[0].title.as_deref(),
        Some("original source\nbytes")
    );
    assert_eq!(
        p.tombstones.iter().map(String::as_str).collect::<Vec<_>>(),
        ["a", "agent", "p", "s"]
    );
    assert_eq!(
        p.attention[0].reason.as_ref().unwrap().as_str(),
        "resolved elsewhere"
    );
    assert!(p.attention[0].next.is_none());
    assert!(p.attention[0].mark.is_none());
    assert!(p.attention[0].decidables.is_empty());
    assert_eq!(
        p.proposals[0].status.as_ref().unwrap().as_str(),
        "resolved elsewhere"
    );
    assert!(!p.proposals[0].needs_you);
    assert!(p.slices[0].next.is_none());
    assert_eq!(
        p.slices[0].reason.as_ref().unwrap().as_str(),
        "resolved elsewhere"
    );
    assert!(!p.agents[0].waits_on_you);
    assert!(p.agents[0].decidables.is_empty());
    assert_eq!(
        p.agents[0].remedy.as_ref().unwrap().as_str(),
        "resolved elsewhere"
    );
    assert_eq!(h, authoritative);
    assert!(!p.update(&h, true));
    p.update(&h, false);
    assert_eq!(p.attention[0].object, "b");
    assert!(p.proposals.is_empty() && p.slices.is_empty() && p.agents.is_empty());
    assert!(p.tombstones.is_empty());
}

#[test]
fn group_transitions_leave_inert_rows_in_their_drawn_groups() {
    let mut h = host();
    let mut p = PresentedLists::default();
    p.update(&h, false);
    h.attention.rows[0].group = AttentionGroup::Done;
    h.agents.rows[0].group = AgentGroup::Held;
    h.slices.rows[0].lifecycle = "done".into();
    assert!(p.update(&h, true));
    assert!(p.pending);
    assert_eq!(p.attention[0].group, AttentionGroup::NeedsYou);
    assert_eq!(p.agents[0].group, AgentGroup::Executing);
    assert_eq!(p.slices[0].lifecycle, "running");
    assert_eq!(p.tombstones.len(), 3);
    assert!(p.attention[0].next.is_none());
    assert!(!p.agents[0].waits_on_you);
    assert!(p.slices[0].next.is_none());
    p.update(&h, false);
    assert_eq!(p.attention, h.attention.rows);
    assert_eq!(p.agents, h.agents.rows);
    assert_eq!(p.slices, h.slices.rows);
}

#[test]
fn nonstructural_facts_refresh_without_deferring_or_mutating_host() {
    let mut h = host();
    let mut p = PresentedLists::default();
    p.update(&h, false);
    let activity = Activity {
        text: Text::Content("exact host activity\n".into()),
        at: None,
    };
    h.attention.rows[0].last_activity = Some(activity.clone());
    h.agents.rows[0].last_activity = Some(activity);
    h.attention.proposals[0].status = Some(Text::Host("updated".into()));
    h.slices.rows[0].last_fact = Some(Text::Content("original bytes".into()));
    let authoritative = h.clone();
    assert!(p.update(&h, true));
    assert!(!p.pending);
    assert_eq!(p.attention, h.attention.rows);
    assert_eq!(p.agents, h.agents.rows);
    assert_eq!(p.proposals, h.attention.proposals);
    assert_eq!(p.slices, h.slices.rows);
    assert_eq!(h, authoritative);
}
