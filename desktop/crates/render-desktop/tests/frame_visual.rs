use render_content::Theme;
use render_desktop::{AppState, app_spec, on_key, view};
use rune::{Env, Key, Runtime, text::TextSystem};

fn scene(name: &str, width: f32) -> Runtime<AppState> {
    let spec = app_spec();
    let mut state = AppState::default();
    spec.scenes.iter().find(|(n, _)| *n == name).unwrap().1(&mut state);
    let mut rt = Runtime::with_text(
        state,
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
fn annotate_operator_explains_why_it_is_waiting_for_a_motion() {
    let mut rt = scene("review", 800.0);
    rt.key(Key::Text("c".into()).into());
    rt.frame(0.01);
    assert_eq!(rt.state.operator.as_deref(), Some("c"));
    assert!(
        rt.elements().iter().any(|e| e
            .text
            .as_deref()
            .is_some_and(|t| t.contains("ip paragraph") && t.contains("Esc cancel"))),
        "pending annotate must explain the next key, not look inactive"
    );
    rt.key(Key::Escape.into());
    rt.frame(0.02);
    assert!(rt.state.operator.is_none());
    assert!(!rt.elements().iter().any(|e| {
        e.text
            .as_deref()
            .is_some_and(|t| t.contains("ip paragraph") && t.contains("Esc cancel"))
    }));
}

#[test]
fn narrow_track_drops_inactive_labels_not_the_review_context() {
    let rt = scene("review", 800.0);
    let text = rt
        .elements()
        .iter()
        .filter(|e| e.rect[1] >= 36.0 && e.rect[1] < 76.0)
        .filter_map(|e| e.text.as_deref())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(text.contains("Modules"), "current stage: {text}");
    assert!(
        !text.contains("Ground") && !text.contains("Seams") && !text.contains("Record"),
        "inactive labels should collapse: {text}"
    );
    assert!(
        text.contains("DEMO · design fixture"),
        "review context must survive: {text}"
    );
    assert!(text.contains("rework") && text.contains("approve"));
}

#[test]
fn decision_primary_names_target_and_becomes_inert_under_float() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        let mut rt = scene("decision", 800.0);
        rt.update(|s, tx| {
            s.theme = theme;
            tx.instant();
        });
        rt.frame(0.01);
        let elements = rt.elements();
        let action = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("action.auth.decide"))
            .unwrap();
        assert_eq!(action.fill, theme.token("state.attn"));
        assert!(
            elements
                .iter()
                .any(|e| e.text.as_deref() == Some("Answer Q1"))
        );
        let rect = action.rect;
        rt.key(Key::Text("K".into()).into());
        rt.frame(1.0);
        let elements = rt.elements();
        let action = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("action.auth.decide"))
            .unwrap();
        assert_eq!(action.rect, rect);
        assert_ne!(action.fill, theme.token("state.attn"));
    }
}
