use render_desktop::{AppState, app_spec, on_key, poll, view};
use rune::text::TextSystem;
use rune::{Env, Key, Runtime};

fn runtime(width: f32) -> Runtime<AppState> {
    let spec = app_spec();
    let mut runtime = Runtime::with_text(
        AppState::default(),
        view,
        (width, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
        TextSystem::new(spec.fonts, spec.families),
    );
    runtime.on_key = Some(on_key);
    runtime.poll = Some(poll);
    runtime.frame(0.0);
    runtime.frame(0.01);
    runtime
}

#[test]
fn disconnected_native_frame_has_exact_regions_and_no_fictional_counts() {
    for width in [1512.0, 1200.0, 1000.0, 800.0] {
        let runtime = runtime(width);
        let elements = runtime.elements();
        for (key, y, height) in [
            ("frame.tabs", 0.0, 36.0),
            ("frame.stage", 36.0, 894.0),
            ("frame.status", 930.0, 26.0),
            ("frame.echo", 956.0, 26.0),
        ] {
            let e = elements
                .iter()
                .find(|e| e.key.as_deref() == Some(key))
                .expect(key);
            assert_eq!(e.rect, [0.0, y, width, height], "{key} at {width}");
        }
        let shown = elements
            .iter()
            .filter_map(|e| e.text.as_deref())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(shown.contains("Not configured"));
        assert!(!shown.contains("protected to"));
        assert!(!shown.contains("Needs you 4"));
    }
}

#[test]
fn native_keyboard_routes_tabs_and_modal_does_not_leak_commands() {
    let mut rt = runtime(1512.0);
    for k in [" ", "o", "s"] {
        rt.key(Key::Text(k.into()).into());
        rt.frame(0.0);
    }
    assert_eq!(rt.state.context(), "slices");
    rt.key(Key::Text("K".into()).into());
    rt.frame(0.0);
    for k in [" ", "o", "a"] {
        rt.key(Key::Text(k.into()).into());
        rt.frame(0.0);
    }
    assert_eq!(rt.state.context(), "slices");
    rt.key(Key::Escape.into());
    rt.frame(0.0);
    for k in [" ", "o", "a"] {
        rt.key(Key::Text(k.into()).into());
        rt.frame(0.0);
    }
    assert_eq!(rt.state.context(), "explorer");
}

#[test]
fn which_key_waits_three_hundred_milliseconds_and_never_consumes_leaf() {
    let mut rt = runtime(1512.0);
    rt.key(Key::Text(" ".into()).into());
    rt.frame(0.1);
    assert!(
        !rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("frame.float"))
    );
    rt.frame(0.41);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("frame.float"))
    );
    for k in ["o", "s"] {
        rt.key(Key::Text(k.into()).into());
        rt.frame(0.42);
    }
    assert_eq!(rt.state.context(), "slices");
}
