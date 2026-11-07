use render_core::*;
use render_desktop::{AppState, app_spec, on_key, view};
use rune::{Env, Runtime, text::TextSystem};
fn runtime(width: f32) -> Runtime<AppState> {
    let mut s = AppState::default();
    s.install_demo();
    s.poll_service();
    let id = s
        .core
        .host
        .objects
        .values()
        .find(|o| matches!(o.body, ObjectBody::Review(_)))
        .unwrap()
        .id
        .clone();
    if let ObjectBody::Review(r) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        r.text =
            "First repeated paragraph.\n\nSecond repeated paragraph.\n\nLast paragraph.".into();
        r.nodes.clear();
        r.annotations.clear();
    }
    s.open_object(&id);
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        s,
        view,
        (width, 982.),
        Env {
            system_dark: true,
            scale: 1.,
        },
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.on_key = Some(on_key);
    rt.frame(0.);
    rt
}
#[test]
fn first_note_hint_tracks_paragraph_in_shared_flow() {
    for width in [1512., 1200., 800.] {
        let mut rt = runtime(width);
        let before = rt
            .elements()
            .into_iter()
            .find(|e| e.text.as_deref() == Some("+ note"))
            .unwrap()
            .rect;
        rt.key(rune::Key::Text("}".into()).into());
        rt.frame(1.);
        let after = rt
            .elements()
            .into_iter()
            .find(|e| e.text.as_deref() == Some("+ note"))
            .unwrap()
            .rect;
        assert!(
            after[1] > before[1],
            "hint must move with reader at {width}: {before:?} -> {after:?}, cursor {}",
            rt.state.tab().reader.cursor()
        );
    }
}
#[test]
fn normal_composer_exposes_another_note_and_save() {
    let mut rt = runtime(1512.);
    for k in ["c", "i", "p"] {
        rt.key(rune::Key::Text(k.into()).into());
    }
    rt.key(rune::Key::Text("a note".into()).into());
    rt.key(rune::Key::Escape.into());
    rt.frame(1.);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.text.as_deref().is_some_and(|s| s.contains(":w save set")))
    );
    rt.key(rune::Key::Escape.into());
    rt.frame(2.);
    assert!(rt.state.composer.is_none());
    assert_eq!(rt.state.local_notes().len(), 1);
}
