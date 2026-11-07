use render_core::ObjectBody;
use render_desktop::{AppState, app_spec, on_key, view};
use rune::{Env, Key, Runtime, text::TextSystem};

fn runtime(width: f32, long: bool) -> Runtime<AppState> {
    let mut s = AppState::default();
    s.install_demo();
    s.poll_service();
    if long && let ObjectBody::Review(r) = &mut s.core.host.objects.get_mut("review").unwrap().body
    {
        r.text = (0..60)
            .map(|i| format!("Paragraph {i} with readable text.\n\n"))
            .collect();
        r.nodes.clear();
        r.annotations.clear();
    }
    s.open_object("review");
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        s,
        view,
        (width, 982.0),
        Env::default(),
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.on_key = Some(on_key);
    rt.frame(0.0);
    rt
}

#[test]
fn moving_to_last_paragraph_reveals_it_in_the_native_viewport() {
    let mut rt = runtime(800.0, true);
    rt.key(Key::Text("G".into()).into());
    rt.frame(1.0);
    rt.frame(2.0);
    let elements = rt.elements();
    let focus = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("review.focus"))
        .unwrap();
    assert!(
        focus.rect[1] >= 98.0 && focus.rect[1] + focus.rect[3] <= 930.0,
        "focus offscreen: {:?}",
        focus.rect
    );
}

#[test]
fn diagram_navigation_preview_does_not_expand_into_raw_multiline_source() {
    let rt = runtime(1200.0, false);
    let elements = rt.elements();
    let target = elements
        .iter()
        .find(|e| e.key.as_deref().is_some_and(|k| k.starts_with("target.")))
        .unwrap();
    assert!(
        target.rect[3] <= 24.0,
        "navigation row contains multiline source: {:?}",
        target.rect
    );
}

#[test]
fn comparison_lens_keeps_notes_and_an_open_editor_visible() {
    let mut rt = runtime(1200.0, false);
    rt.update(|s, tx| {
        s.open(render_desktop::Screen::Diff, Some("review".into()));
        tx.instant();
    });
    for key in ["c", "i", "p"] {
        rt.key(Key::Text(key.into()).into());
    }
    rt.frame(1.0);
    rt.frame(2.0);
    assert!(rt.state.composer.is_some());
    let elements = rt.elements();
    let editor = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("editor.composer"))
        .expect("comparison retains active editor");
    assert!(editor.rect[1] >= 76.0 && editor.rect[1] + editor.rect[3] <= 930.0);
    assert!(
        elements
            .iter()
            .any(|e| e.text.as_deref().is_some_and(|t| t.contains("saved v3")))
    );
}

#[test]
fn intermediate_width_uses_the_actual_shrunken_note_margin() {
    let mut rt = runtime(1200.0, false);
    for key in ["c", "i", "p"] {
        rt.key(Key::Text(key.into()).into());
    }
    rt.frame(1.0);
    let elements = rt.elements();
    let composer = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("editor.composer"))
        .unwrap();
    assert_eq!(composer.rect[0], 928.0);
    assert_eq!(composer.rect[2], 256.0);
    assert!(composer.rect[0] + composer.rect[2] <= 1184.0);
}
