use render_core::{DraftBody, DraftKind};
use render_desktop::{AppState, Screen, app_spec, on_ime};
use rune::{Env, Key, KeyEvent, Mods, Runtime};

fn runtime(screen: Screen) -> Runtime<AppState> {
    let mut state = AppState::default();
    state.open(screen, Some("local-object".into()));
    let mut spec = app_spec();
    spec.poll = None;
    let mut rt = rune::App::new(spec).on_ime(on_ime).headless_runtime(
        (1000.0, 800.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
    );
    rt.state = state;
    rt.frame(0.0);
    key(&mut rt, Key::Text("i".into()));
    rt
}

fn key(rt: &mut Runtime<AppState>, key: Key) {
    rt.key(key.into());
    rt.frame(0.0);
}

fn text(rt: &mut Runtime<AppState>, text: &str) {
    key(rt, Key::Text(text.into()));
}

fn body(rt: &Runtime<AppState>) -> &str {
    rt.state.composer.as_ref().unwrap().editor.text()
}

#[test]
fn native_scalar_spaces_and_angle_brackets_are_literal_in_insert() {
    let mut rt = runtime(Screen::Decision);
    for scalar in "a b < > é".chars() {
        text(&mut rt, &scalar.to_string());
    }
    assert_eq!(body(&rt), "a b < > é");
    assert_eq!(
        rt.state.core.local.drafts.values().next().unwrap().body,
        DraftBody::Text("a b < > é".into())
    );
    assert!(rt.state.pending.is_empty());
    assert!(rt.state.core.local.outbox.is_empty());
}

#[test]
fn native_control_enter_bypasses_list_continuation_and_control_editing_survives() {
    let mut rt = runtime(Screen::Decision);
    text(&mut rt, "- item");
    rt.key(KeyEvent {
        key: Key::Enter,
        mods: Mods {
            ctrl: true,
            ..Mods::default()
        },
    });
    rt.frame(0.0);
    assert_eq!(body(&rt), "- item\n");
    text(&mut rt, "word");
    rt.key(KeyEvent {
        key: Key::Text("w".into()),
        mods: Mods {
            ctrl: true,
            ..Mods::default()
        },
    });
    rt.frame(0.0);
    assert_eq!(body(&rt), "- item\n");
}

#[test]
fn composer_normal_q_and_escape_leave_locally_without_authority() {
    for leave in [Key::Text("q".into()), Key::Escape] {
        let mut rt = runtime(Screen::Decision);
        text(&mut rt, "local answer");
        key(&mut rt, Key::Escape);
        key(&mut rt, leave);
        assert!(rt.state.composer.is_none());
        assert!(rt.state.core.local.outbox.is_empty());
        assert!(rt.state.outgoing.is_empty());
        assert_eq!(
            rt.state.core.local.drafts.keys().next().unwrap().kind,
            DraftKind::DecisionNote
        );
    }
}

#[test]
fn committed_ime_and_multiscalar_text_never_execute_editor_or_global_commands() {
    let mut rt = runtime(Screen::Decision);
    text(&mut rt, "jk <Esc> :approve");
    assert_eq!(body(&rt), "jk <Esc> :approve");
    assert_eq!(
        rt.state.composer.as_ref().unwrap().editor.mode(),
        render_editor::Mode::Insert
    );
    rt.ime(rune::Ime::Commit(" jk <leader> ".into()));
    rt.frame(0.0);
    assert_eq!(body(&rt), "jk <Esc> :approve jk <leader> ");
    assert!(rt.state.core.local.outbox.is_empty());
}

#[test]
fn native_paste_is_literal_in_insert_and_normal_modes() {
    let mut rt = runtime(Screen::Decision);
    rt.paste("jk <Esc> :approve\n ");
    rt.frame(0.0);
    assert_eq!(body(&rt), "jk <Esc> :approve\n ");
    key(&mut rt, Key::Escape);
    rt.paste("q");
    rt.frame(0.0);
    assert!(rt.state.composer.is_some());
    assert!(body(&rt).contains('q'));
    assert!(rt.state.core.local.outbox.is_empty());
    assert!(rt.state.outgoing.is_empty());
}

#[test]
fn subsequent_edits_after_consumption_are_still_local_drafts() {
    let mut rt = runtime(Screen::Decision);
    text(&mut rt, "accepted bytes");
    rt.state.core.local.drafts.clear();
    text(&mut rt, " plus new work");
    assert_eq!(
        rt.state.core.local.drafts.values().next().unwrap().body,
        DraftBody::Text("accepted bytes plus new work".into())
    );
}

#[test]
fn no_op_sync_keeps_generation_but_real_aba_edits_advance_it() {
    let mut rt = runtime(Screen::Decision);
    text(&mut rt, "a");
    let generation = rt
        .state
        .core
        .local
        .drafts
        .values()
        .next()
        .unwrap()
        .generation;
    rt.state.sync_composer();
    assert_eq!(
        rt.state
            .core
            .local
            .drafts
            .values()
            .next()
            .unwrap()
            .generation,
        generation
    );
    text(&mut rt, "b");
    key(&mut rt, Key::Backspace);
    assert_eq!(body(&rt), "a");
    assert!(
        rt.state
            .core
            .local
            .drafts
            .values()
            .next()
            .unwrap()
            .generation
            > generation
    );
}

#[test]
fn editing_a_specific_note_keeps_identity_anchor_and_siblings() {
    let mut rt = runtime(Screen::Review);
    text(&mut rt, "first note");
    key(&mut rt, Key::Escape);
    key(&mut rt, Key::Escape);
    text(&mut rt, "i");
    text(&mut rt, "second note");
    key(&mut rt, Key::Escape);
    key(&mut rt, Key::Escape);
    let original = rt.state.local_notes();
    assert_eq!(original.len(), 2);
    let draft_key = rt.state.core.local.drafts.keys().next().unwrap().clone();
    assert!(rt.state.edit_note(original[0].local_id));
    assert_eq!(body(&rt), "first note");
    text(&mut rt, " revised");
    key(&mut rt, Key::Escape);
    key(&mut rt, Key::Escape);
    let notes = rt.state.local_notes();
    assert_eq!(notes.len(), 2);
    assert_eq!(notes[0].local_id, original[0].local_id);
    assert_eq!(notes[0].anchor, original[0].anchor);
    assert_eq!(notes[0].body, "first note revised");
    assert_eq!(notes[1], original[1]);
    assert!(rt.state.core.local.drafts.contains_key(&draft_key));
    assert!(!rt.state.edit_note(u64::MAX));
    assert!(rt.state.composer.is_none());
}

#[test]
fn annotations_use_annotation_set_and_reopen_retains_stale_basis() {
    let mut rt = runtime(Screen::Review);
    rt.state.finish_composer();
    rt.state.install_demo();
    rt.state.open(Screen::Review, Some("review".into()));
    text(&mut rt, "i");
    text(&mut rt, "new concern");
    let key = rt.state.composer.as_ref().unwrap().key.clone();
    assert_eq!(key.base.as_deref(), Some("v3"));
    let id = rt
        .state
        .composer
        .as_ref()
        .unwrap()
        .note
        .as_ref()
        .unwrap()
        .local_id;
    rt.state.finish_composer();
    let object = rt.state.core.host.objects.get_mut("review").unwrap();
    let render_core::ObjectBody::Review(review) = &mut object.body else {
        panic!()
    };
    review.annotation_set = Some("v4".into());
    assert!(rt.state.edit_note(id));
    assert_eq!(rt.state.composer.as_ref().unwrap().key, key);
}

#[test]
fn reconciliation_closes_only_consumed_unchanged_composers() {
    let mut rt = runtime(Screen::Decision);
    rt.state.reconcile_composer();
    assert!(rt.state.composer.is_some(), "unsynced editor stays open");
    text(&mut rt, "submitted bytes");
    rt.state.reconcile_composer();
    assert!(rt.state.composer.is_some(), "pending draft stays open");
    rt.state.core.local.drafts.clear();
    rt.state.reconcile_composer();
    assert!(rt.state.composer.is_none());

    text(&mut rt, "i");
    text(&mut rt, "submitted bytes");
    rt.state.core.local.drafts.clear();
    text(&mut rt, " newer edit");
    rt.state.reconcile_composer();
    assert_eq!(body(&rt), "submitted bytes newer edit");
}

#[test]
fn unchanged_composer_does_not_recreate_a_draft_after_it_was_consumed() {
    let mut rt = runtime(Screen::Decision);
    text(&mut rt, "accepted bytes");
    // Model the core receipt boundary: the captured draft has been consumed.
    rt.state.core.local.drafts.clear();
    rt.state.sync_composer();
    assert!(rt.state.core.local.drafts.is_empty());
    key(&mut rt, Key::Escape);
    key(&mut rt, Key::Escape);
    assert!(rt.state.core.local.drafts.is_empty());
}
