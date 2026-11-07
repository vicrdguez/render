mod common;

use common::*;
use render_core::*;

#[test]
fn raw_editor_bytes_survive_restart_and_invalid_source_cannot_save() {
    let mut draft = PolicyDraft::new("p1".into(), fields(&[("limit", "1")]));
    draft.set_editor_source("limit=2\nhalf typed".into());
    let restored: PolicyDraft =
        serde_json::from_slice(&serde_json::to_vec(&draft).unwrap()).unwrap();
    assert_eq!(restored.editor_source(), Some("limit=2\nhalf typed"));
    assert!(restored.safe_edits().is_err());
    draft.set_editor_source("limit=2".into());
    assert_eq!(draft.safe_edits(), Ok(fields(&[("limit", "2")])));
}

#[test]
fn source_sync_does_not_resolve_untouched_conflicts() {
    let mut draft = PolicyDraft::new("p1".into(), fields(&[("a", "1"), ("b", "1")]));
    draft.set_editor_source("a=2\nb=1".into());
    draft.rebase("p2".into(), fields(&[("a", "3"), ("b", "1")]));
    draft.set_editor_source("a=2\nb=2".into());
    assert_eq!(draft.conflicts().len(), 1);
}

fn fields(values: &[(&str, &str)]) -> Vec<(String, String)> {
    values
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn fieldwise_rebase_preserves_local_edits_and_takes_untouched_current_fields_in_source_order() {
    let base = fields(&[("z", "old"), ("a", "old"), ("same", "old")]);
    let mut draft = PolicyDraft::new("pol1".into(), base.clone());
    assert_eq!(draft.base_fields(), base);
    assert_eq!(draft.fields(), base);
    draft.edit_field("z".into(), "mine".into());
    draft.edit_field("same".into(), "equal".into());
    let current = fields(&[
        ("a", "theirs"),
        ("z", "old"),
        ("same", "equal"),
        ("unknown", "new"),
    ]);
    draft.rebase("pol2".into(), current.clone());
    assert_eq!(draft.base_revision(), "pol2");
    assert_eq!(draft.base_fields(), current);
    assert_eq!(
        draft.fields(),
        fields(&[
            ("a", "theirs"),
            ("z", "mine"),
            ("same", "equal"),
            ("unknown", "new")
        ])
    );
    assert_eq!(draft.safe_edits(), Ok(fields(&[("z", "mine")])));
}

#[test]
fn conflicts_keep_both_values_until_an_explicit_edit_even_after_repeated_rebase() {
    let mut draft = PolicyDraft::new("pol1".into(), fields(&[("limit", "1")]));
    draft.edit_field("limit".into(), "2".into());
    draft.rebase("pol2".into(), fields(&[("limit", "3")]));
    assert_eq!(
        draft.conflicts(),
        &[PolicyConflict {
            field: "limit".into(),
            yours: "2".into(),
            current: Some("3".into())
        }]
    );
    assert_eq!(
        draft.safe_edits(),
        Err(PolicyDraftError::UnresolvedConflicts)
    );
    draft.rebase("pol3".into(), fields(&[("limit", "3")]));
    assert_eq!(draft.conflicts().len(), 1);
    draft.edit_field("limit".into(), "2".into());
    assert!(draft.conflicts().is_empty());
    assert_eq!(draft.safe_edits(), Ok(fields(&[("limit", "2")])));
}

#[test]
fn added_and_removed_unknown_fields_do_not_lose_local_work() {
    let mut draft = PolicyDraft::new(
        "pol1".into(),
        fields(&[("removed", "old"), ("edited", "old")]),
    );
    draft.edit_field("edited".into(), "mine".into());
    draft.edit_field("added".into(), "mine".into());
    draft.rebase(
        "pol2".into(),
        fields(&[("host-added", "new"), ("added", "theirs")]),
    );
    assert_eq!(
        draft.fields(),
        fields(&[("host-added", "new"), ("added", "mine"), ("edited", "mine")])
    );
    assert_eq!(
        draft.conflicts(),
        &[
            PolicyConflict {
                field: "added".into(),
                yours: "mine".into(),
                current: Some("theirs".into())
            },
            PolicyConflict {
                field: "edited".into(),
                yours: "mine".into(),
                current: None
            },
        ]
    );
    draft.edit_field("added".into(), "theirs".into());
    draft.edit_field("edited".into(), "keep".into());
    assert_eq!(draft.safe_edits(), Ok(fields(&[("edited", "keep")])));
}

fn settings(revision: &str, value: &str) -> Object {
    object(
        "settings",
        ObjectBody::Settings(SettingsView {
            settings_revision: None,
            changed_by: None,
            changed_at: None,
            routes: vec![],
            pending: vec![],
            policy_default: Some(revision.into()),
            policy_fields: fields(&[("limit", value)]),
            bindings: vec![],
            history: vec![],
        }),
        vec![decidable(
            "settings",
            basis(&[("policy", revision)]),
            vec![action(CommandType::SavePolicyRevision)],
        )],
    )
}

fn draft_key() -> DraftKey {
    DraftKey {
        object: "settings".into(),
        kind: DraftKind::Policy,
        base: Some("pol1".into()),
    }
}

fn request() -> AuthorityRequest {
    AuthorityRequest {
        verb: AuthorityVerb::Policy,
        draft: Some(draft_key()),
        ..approve()
    }
}

#[test]
fn policy_restart_is_exact_and_host_arrival_does_not_rebase() {
    let mut c = client_with(vec![settings("pol1", "1")]);
    let mut draft = PolicyDraft::new("pol1".into(), fields(&[("limit", "1")]));
    draft.edit_field("limit".into(), "2".into());
    draft.rebase("pol2".into(), fields(&[("limit", "3")]));
    c.edit_draft(draft_key(), DraftBody::Policy(draft));
    let bytes = serde_json::to_vec(&c.local).unwrap();
    let mut restored = Client::new(serde_json::from_slice(&bytes).unwrap());
    restored.apply_inbound(
        snapshot(wf(), 11, 11, vec![Resource::Object(settings("pol3", "4"))]),
        at(1),
    );
    assert_eq!(restored.local.drafts, c.local.drafts);
}

#[test]
fn stale_and_conflicted_policy_cannot_open_but_explicit_rebase_and_edit_allow_save() {
    let mut c = client_with(vec![settings("pol2", "3")]);
    c.view_opened("settings");
    let pin = c.drawn_target("settings", Surface::WorkView).unwrap();
    let mut draft = PolicyDraft::new("pol1".into(), fields(&[("limit", "1")]));
    draft.edit_field("limit".into(), "2".into());
    c.edit_draft(draft_key(), DraftBody::Policy(draft.clone()));
    assert_eq!(
        c.open_readback(&pin, request()),
        Err(Refusal::StalePolicyDraft)
    );
    draft.rebase("pol2".into(), fields(&[("limit", "3")]));
    c.edit_draft(draft_key(), DraftBody::Policy(draft.clone()));
    assert_eq!(
        c.open_readback(&pin, request()),
        Err(Refusal::PolicyConflicts)
    );
    draft.edit_field("limit".into(), "2".into());
    c.edit_draft(draft_key(), DraftBody::Policy(draft));
    c.open_readback(&pin, request()).unwrap();
    c.readback_drawn(at(100));
    let intent = c.confirm(&key(101)).unwrap();
    assert!(
        matches!(intent.body, CommandBody::Authority { edits, .. } if edits == fields(&[("limit", "2")]))
    );
}

#[test]
fn confirm_rechecks_policy_and_never_sends_an_obsolete_readback_after_a_draft_edit() {
    let mut c = client_with(vec![settings("pol1", "1")]);
    c.view_opened("settings");
    let pin = c.drawn_target("settings", Surface::WorkView).unwrap();
    let mut draft = PolicyDraft::new("pol1".into(), fields(&[("limit", "1")]));
    draft.edit_field("limit".into(), "2".into());
    c.edit_draft(draft_key(), DraftBody::Policy(draft.clone()));
    c.open_readback(&pin, request()).unwrap();
    c.readback_drawn(at(100));
    draft.rebase("pol1".into(), fields(&[("limit", "3")]));
    c.edit_draft(draft_key(), DraftBody::Policy(draft.clone()));
    assert_eq!(c.confirm(&key(101)), Err(Refusal::PolicyConflicts));
    draft.edit_field("limit".into(), "4".into());
    c.edit_draft(draft_key(), DraftBody::Policy(draft));
    assert_eq!(c.confirm(&key(102)), Err(Refusal::WrongState));
    assert!(c.local.outbox.is_empty());
}

#[test]
fn untyped_policy_edits_cannot_bypass_base_and_conflict_checks() {
    let mut c = client_with(vec![settings("pol1", "1")]);
    let pin = c.drawn_target("settings", Surface::WorkView).unwrap();
    c.edit_draft(draft_key(), DraftBody::Edits(fields(&[("limit", "2")])));
    assert_eq!(c.open_readback(&pin, request()), Err(Refusal::NoDraft));
}

#[test]
fn confirm_checks_stale_policy_even_when_host_basis_has_not_changed() {
    let mut c = client_with(vec![settings("pol1", "1")]);
    c.view_opened("settings");
    let pin = c.drawn_target("settings", Surface::WorkView).unwrap();
    c.edit_draft(
        draft_key(),
        DraftBody::Policy(PolicyDraft::new("pol1".into(), fields(&[("limit", "1")]))),
    );
    c.open_readback(&pin, request()).unwrap();
    c.readback_drawn(at(100));
    let mut changed = settings("pol2", "3");
    changed.decidables = settings("pol1", "1").decidables;
    c.apply_inbound(
        update(
            wf(),
            2,
            1,
            11,
            vec![Change::Upsert(Resource::Object(changed))],
        ),
        at(101),
    );
    assert_eq!(c.confirm(&key(102)), Err(Refusal::StalePolicyDraft));
}
