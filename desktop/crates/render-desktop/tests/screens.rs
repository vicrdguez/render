use render_desktop::{AppState, Screen, app_spec, view};
use rune::text::TextSystem;
use rune::{Env, Runtime};

#[test]
fn every_work_view_uses_native_axis_and_an_honest_unavailable_state() {
    for screen in [
        Screen::Review,
        Screen::Chat,
        Screen::Decision,
        Screen::Evidence,
        Screen::Settings,
        Screen::Proposal,
        Screen::Operation,
        Screen::LocalPrompt,
    ] {
        let mut state = AppState::default();
        state.open(screen, None);
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
        rt.frame(0.0);
        let elements = rt.elements();
        let content = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("content.main"))
            .unwrap();
        assert_eq!(content.rect[0], 436.0, "{screen:?}");
        assert_eq!(content.rect[2], 600.0, "{screen:?}");
        assert!(
            elements
                .iter()
                .any(|e| e.text.as_deref().is_some_and(|t| t.contains("unavailable")))
        );
        assert_eq!(
            elements
                .iter()
                .find(|e| e.key.as_deref() == Some("frame.track"))
                .unwrap()
                .rect,
            [0.0, 36.0, 1512.0, 40.0]
        );
    }
}

#[test]
fn named_demo_scenes_select_their_explicit_fixture_not_a_related_navigation_fallback() {
    let spec = app_spec();
    for (name, expected, object) in [
        ("review", Screen::Review, Some("review")),
        ("chat", Screen::Chat, Some("chat")),
        ("decision", Screen::Decision, Some("decision")),
        ("settings", Screen::Settings, Some("settings")),
        ("slices", Screen::Slices, None),
        ("agents", Screen::Agents, None),
        ("readback", Screen::Review, Some("review")),
    ] {
        let mut app = AppState::default();
        spec.scenes.iter().find(|(n, _)| *n == name).unwrap().1(&mut app);
        assert_eq!(app.screen(), expected, "{name}");
        assert_eq!(app.tab().object.as_deref(), object, "{name}");
        if name == "readback" {
            assert!(app.core.session.readback.is_some());
        }
    }
}
