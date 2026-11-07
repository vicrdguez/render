use render_core::ObjectBody;
use render_desktop::{AppState, app_spec, on_key, view};
use rune::{Env, Runtime, text::TextSystem};

fn runtime(kind: &str, width: f32) -> Runtime<AppState> {
    let mut state = AppState::default();
    state.install_demo();
    let id = state
        .core
        .host
        .objects
        .values()
        .find(|o| {
            matches!(
                (&o.body, kind),
                (ObjectBody::Review(_), "review") | (ObjectBody::Chat(_), "chat")
            )
        })
        .unwrap()
        .id
        .clone();
    state.open_object(&id);
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        state,
        view,
        (width, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.on_key = Some(on_key);
    rt.frame(0.0);
    rt
}
fn rect(rt: &Runtime<AppState>, key: &str) -> [f32; 4] {
    rt.elements()
        .iter()
        .find(|e| e.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("missing {key}"))
        .rect
}
#[test]
fn opening_annotation_on_a_long_narrow_review_reveals_the_actual_editor() {
    let mut rt = runtime("review", 800.0);
    rt.key(rune::Key::Text("c".into()).into());
    rt.frame(0.05);
    rt.key(rune::Key::Text("c".into()).into());
    rt.frame(0.10);
    rt.frame(0.2);
    assert!(rt.state.composer.is_some());
    let editor = rect(&rt, "editor.composer");
    assert!(
        editor[1] >= 76.0 && editor[1] + editor[3] <= 930.0,
        "editor must be visible, got {editor:?}"
    );
}

#[test]
fn composer_caret_tracks_utf8_cursor_wrap_and_eight_row_viewport() {
    let mut rt = runtime("chat", 800.0);
    rt.key(rune::Key::Text("i".into()).into());
    rt.frame(0.0);
    rt.state
        .composer
        .as_mut()
        .unwrap()
        .editor
        .set_text("écho words");
    rt.state.composer.as_mut().unwrap().editor.handle_key("i");
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    let start = rect(&rt, "editor.caret");
    rt.state
        .composer
        .as_mut()
        .unwrap()
        .editor
        .handle_key("Right");
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    let next = rect(&rt, "editor.caret");
    assert!(next[0] > start[0]);
    assert_eq!(next[1], start[1]);
    rt.state
        .composer
        .as_mut()
        .unwrap()
        .editor
        .set_text("long wrapped words ".repeat(100));
    for k in ["G", "$", "a"] {
        rt.state.composer.as_mut().unwrap().editor.handle_key(k);
    }
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    rt.frame(0.01);
    assert_eq!(rect(&rt, "editor.viewport")[3], 168.0);
    let caret = rect(&rt, "editor.caret");
    let viewport = rect(&rt, "editor.viewport");
    assert!(
        caret[1] >= viewport[1] && caret[1] < viewport[1] + viewport[3],
        "caret {caret:?}, viewport {viewport:?}"
    );
    let e = &mut rt.state.composer.as_mut().unwrap().editor;
    for k in ["Esc", "g", "g", "0", "i"] {
        e.handle_key(k);
    }
    rt.update(|_, tx| tx.instant());
    rt.frame(0.02);
    rt.frame(0.03);
    assert_eq!(
        rect(&rt, "editor.caret")[1],
        rect(&rt, "editor.viewport")[1]
    );
}
#[test]
fn visual_composer_selection_is_a_native_range_not_a_detached_marker() {
    let mut rt = runtime("chat", 800.0);
    rt.key(rune::Key::Text("i".into()).into());
    rt.frame(0.0);
    let e = &mut rt.state.composer.as_mut().unwrap().editor;
    e.set_text("écho words");
    for k in ["v", "l", "l"] {
        e.handle_key(k);
    }
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    assert!(rect(&rt, "editor.selection.0")[2] > 0.0);
    assert!(rect(&rt, "editor.caret")[2] > 2.0);
}
#[test]
fn wide_measure_and_source_numbers_change_native_content() {
    for width in [1512.0, 800.0] {
        let mut rt = runtime("review", width);
        let original = rect(&rt, "content.main")[2];
        rt.state.wide = true;
        rt.state.numbers = true;
        rt.update(|_, tx| tx.instant());
        rt.frame(0.0);
        assert!(rect(&rt, "content.main")[2] > original);
        assert!(rt.elements().iter().any(|e| {
            e.key
                .as_deref()
                .is_some_and(|k| k.starts_with("source.line."))
        }));
    }
}
#[test]
fn frozen_hint_label_is_visible_at_work_target() {
    let mut rt = runtime("review", 1512.0);
    let id = rt.state.current_object().unwrap().id.clone();
    rt.state.hints = Some(vec![("as".into(), id)]);
    rt.state.hint_prefix = "a".into();
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("hint.as") && e.text.as_deref() == Some("as"))
    );
    assert!(rt.state.outgoing.is_empty());
}
#[test]
fn document_options_change_native_font_metrics_and_diagram_mode() {
    let mut rt = runtime("review", 800.0);
    let id = rt.state.current_object().unwrap().id.clone();
    let prose = "iiiiiiiiii ".repeat(200);
    let diagram = "flowchart LR\nA[Start] --> B[Done]\n";
    let source = format!("{prose}\n\n```mermaid\n{diagram}```\n");
    if let ObjectBody::Review(r) = &mut rt.state.core.host.objects.get_mut(&id).unwrap().body {
        r.nodes.clear();
        r.text = source.clone();
    }
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    let before = rt
        .elements()
        .iter()
        .find(|e| {
            e.text
                .as_deref()
                .is_some_and(|s| s.starts_with("iiiiiiiiii"))
        })
        .unwrap()
        .rect[3];
    assert!(rt.elements().iter().any(|e| e.role == "figure"));
    rt.state.mono_prose = true;
    rt.state.mermaid_source = true;
    rt.update(|_, tx| tx.instant());
    rt.frame(0.01);
    let after = rt
        .elements()
        .iter()
        .find(|e| {
            e.text
                .as_deref()
                .is_some_and(|s| s.starts_with("iiiiiiiiii"))
        })
        .unwrap()
        .rect[3];
    assert_ne!(
        before, after,
        "bundled font advances must affect native wrapping"
    );
    assert!(!rt.elements().iter().any(|e| e.role == "figure"));
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.key.as_deref() == Some("code-text") && e.text.as_deref() == Some(diagram))
    );
    assert_eq!(rt.state.source_text(), source);
}
#[test]
fn follow_scrolls_only_when_enabled_at_last_message() {
    use render_core::MessageBody;
    for (follow, at_last) in [(true, true), (false, true), (true, false)] {
        let mut rt = runtime("chat", 800.0);
        let id = rt.state.current_object().unwrap().id.clone();
        let (last_id, count) = if let ObjectBody::Chat(chat) =
            &mut rt.state.core.host.objects.get_mut(&id).unwrap().body
        {
            let template = chat.messages[0].clone();
            chat.messages = (0..30)
                .map(|i| {
                    let mut m = template.clone();
                    m.id = format!("m{i}");
                    m.body = MessageBody::Text {
                        text: "message line\n\n".repeat(4),
                        streaming: false,
                        truncated: false,
                    };
                    m
                })
                .collect();
            (
                chat.messages.last().unwrap().id.clone(),
                chat.messages.len(),
            )
        } else {
            unreachable!()
        };
        rt.state.follow = follow;
        rt.state.tab_mut().cursor = if at_last { count - 1 } else { 0 };
        // No new semantic jump: this checks output following, not the independent
        // one-shot reveal of an explicitly selected record.
        rt.state.tab_mut().reader.record = None;
        rt.update(|_, tx| {
            tx.scroll_to_y("work.scroll", 0.0);
            tx.instant();
        });
        rt.frame(0.0);
        rt.frame(0.01);
        let tail = rt
            .elements()
            .iter()
            .find(|e| e.key.as_deref() == Some(&format!("message.{last_id}")))
            .unwrap()
            .clone();
        assert_eq!(tail.scrolled[1] > 0.0, follow && at_last);
    }
}
#[test]
fn compare_renders_changed_lines_not_full_revision_fills() {
    let mut rt = runtime("review", 1512.0);
    let current = rt.state.current_object().unwrap().id.clone();
    let mut old = rt.state.current_object().unwrap().clone();
    old.id = "previous-test".into();
    if let ObjectBody::Review(r) = &mut old.body {
        r.text = "same\nremoved\ntail\n".into();
    }
    rt.state.core.host.objects.insert(old.id.clone(), old);
    if let ObjectBody::Review(r) = &mut rt.state.core.host.objects.get_mut(&current).unwrap().body {
        r.text = "same\nadded\ntail\n".into();
        r.previous = Some("previous-test".into());
    }
    rt.state.tab_mut().screen = render_desktop::Screen::Diff;
    rt.update(|_, tx| tx.instant());
    rt.frame(0.0);
    let elements = rt.elements();
    assert_eq!(
        elements
            .iter()
            .filter(|e| e.key.as_deref().is_some_and(|k| k.starts_with("diff.add.")))
            .count(),
        1
    );
    assert_eq!(
        elements
            .iter()
            .filter(|e| e.key.as_deref().is_some_and(|k| k.starts_with("diff.del.")))
            .count(),
        1
    );
}
