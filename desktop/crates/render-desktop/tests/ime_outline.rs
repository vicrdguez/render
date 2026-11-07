use render_core::DraftBody;
use render_desktop::{AppState, Screen, app_spec, on_ime};
use rune::{Env, Ime, Key, Runtime};

fn runtime(screen: Screen, object: &str) -> Runtime<AppState> {
    let mut spec = app_spec();
    spec.poll = None;
    let mut rt = rune::App::new(spec).on_ime(on_ime).headless_runtime(
        (1512.0, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
    );
    rt.state.install_demo();
    rt.state.open(screen, Some(object.into()));
    rt.frame(0.0);
    rt
}
fn has(rt: &Runtime<AppState>, key: &str) -> bool {
    rt.elements().iter().any(|e| e.key.as_deref() == Some(key))
}
fn key(rt: &mut Runtime<AppState>, key: Key) {
    rt.key(key.into());
    rt.frame(0.0);
}
fn ime(rt: &mut Runtime<AppState>, event: Ime) {
    rt.ime(event);
    rt.frame(0.0);
}
fn rect(rt: &Runtime<AppState>, key: &str) -> [f32; 4] {
    rt.elements()
        .iter()
        .find(|e| e.key.as_deref() == Some(key))
        .unwrap()
        .rect
}

#[test]
fn outline_toggle_is_per_tab_and_hides_only_the_node_rail() {
    let mut rt = runtime(Screen::Review, "review");
    assert!(has(&rt, "review.outline"));
    let expanded = rt.state.expanded;
    rt.update(|s, tx| s.command("review.outline", tx));
    rt.frame(0.0);
    assert!(!has(&rt, "review.outline"));
    assert!(has(&rt, "content.main"));
    assert_eq!(rt.state.expanded, expanded);
    rt.state.open(Screen::Diff, Some("review".into()));
    rt.invalidate();
    rt.frame(0.0);
    assert!(has(&rt, "review.outline"));
    rt.state.open(Screen::Review, Some("review".into()));
    rt.invalidate();
    rt.frame(0.0);
    assert!(!has(&rt, "review.outline"));
}

#[test]
fn preedit_is_shaped_at_caret_without_mutating_draft_and_commit_clears_once() {
    let mut rt = runtime(Screen::Decision, "decision");
    key(&mut rt, Key::Text("i".into()));
    key(&mut rt, Key::Text("ab".into()));
    key(&mut rt, Key::Left);
    let before = rect(&rt, "editor.caret");
    let generation = rt
        .state
        .core
        .local
        .drafts
        .values()
        .next()
        .unwrap()
        .generation;
    ime(&mut rt, Ime::Preedit("界é".into(), Some((0, 3))));
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("a界éb"))
    );
    assert_eq!(rt.state.composer.as_ref().unwrap().editor.text(), "ab");
    assert_eq!(
        rt.state.core.local.drafts.values().next().unwrap().body,
        DraftBody::Text("ab".into())
    );
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
    let mark = rect(&rt, "editor.preedit.0");
    assert_eq!(mark[0], before[0]);
    assert!(rect(&rt, "editor.caret")[0] > before[0]);
    assert!(has(&rt, "editor.preedit-selection.0"));
    ime(&mut rt, Ime::Commit("界é".into()));
    assert_eq!(rt.state.composer.as_ref().unwrap().editor.text(), "a界éb");
    assert!(rt.state.composer.as_ref().unwrap().preedit.is_none());
    assert!(!has(&rt, "editor.preedit.0"));
    assert_eq!(
        rt.state
            .core
            .local
            .drafts
            .values()
            .next()
            .unwrap()
            .generation,
        generation + 1
    );
}

#[test]
fn empty_disabled_and_invalid_byte_ranges_leave_no_orphan_marks() {
    let mut rt = runtime(Screen::Decision, "decision");
    key(&mut rt, Key::Text("i".into()));
    for clear in [Ime::Preedit(String::new(), None), Ime::Disabled] {
        ime(&mut rt, Ime::Preedit("界é".into(), Some((1, usize::MAX))));
        assert!(has(&rt, "editor.preedit.0"));
        ime(&mut rt, clear);
        assert!(!has(&rt, "editor.preedit.0"));
        assert!(!has(&rt, "editor.preedit-selection.0"));
        assert_eq!(rt.state.composer.as_ref().unwrap().editor.text(), "");
    }
}
