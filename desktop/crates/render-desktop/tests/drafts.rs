use render_core::{DraftBody, DraftKind};
use render_desktop::{AppState, Screen, app_spec, on_key, poll, view};
use rune::text::TextSystem;
use rune::{Env, Key, Runtime};

#[test]
fn shared_editor_keeps_a_decision_note_locally_and_never_sends_on_escape() {
    let mut state = AppState::default();
    state.open(Screen::Decision, Some("absent-question".into()));
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        state,
        view,
        (1512.0, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.on_key = Some(on_key);
    rt.poll = Some(poll);
    rt.frame(0.0);
    for key in [
        Key::Text("o".into()),
        Key::Text("Keep the evidence".into()),
        Key::Escape,
        Key::Escape,
    ] {
        rt.key(key.into());
        rt.frame(0.0);
    }
    assert!(rt.state.core.local.outbox.is_empty());
    let (key, draft) = rt
        .state
        .core
        .local
        .drafts
        .iter()
        .next()
        .expect("local draft");
    assert_eq!(key.kind, DraftKind::DecisionNote);
    assert_eq!(draft.body, DraftBody::Text("Keep the evidence".into()));
    assert!(rt.state.composer.is_none());
}
