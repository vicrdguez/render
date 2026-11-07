use render_core::*;
use render_desktop::{AppState, Screen, app_spec};
use rune::{Env, Key, Runtime};
use std::time::Duration;

fn demo(screen: Screen) -> AppState {
    let mut s = AppState::default();
    s.install_demo();
    s.poll_service();
    let id = s
        .core
        .host
        .objects
        .values()
        .find(|o| match screen {
            Screen::Decision => matches!(o.body, ObjectBody::Decision(_)),
            Screen::Settings => matches!(o.body, ObjectBody::Settings(_)),
            _ => matches!(o.body, ObjectBody::Review(_)),
        })
        .unwrap()
        .id
        .clone();
    s.open(screen, Some(id));
    s
}
fn runtime(s: AppState) -> Runtime<AppState> {
    let mut spec = app_spec();
    spec.poll = None;
    let mut rt = rune::App::new(spec).headless_runtime(
        (1000.0, 800.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
    );
    rt.state = s;
    rt.frame(0.0);
    rt
}
fn keys(rt: &mut Runtime<AppState>, text: &str) {
    for ch in text.chars() {
        rt.key(Key::Text(ch.to_string()).into());
        rt.frame(0.0);
    }
}
fn at(n: u64) -> Moment {
    Moment {
        clock: ClockId(91),
        at: Duration::from_millis(n),
    }
}

#[test]
fn authority_uses_drawn_option_identity_after_host_reorders_rows() {
    let mut s = demo(Screen::Decision);
    let id = s.selected_id().unwrap();
    let expected = match &s.core.host.objects[&id].body {
        ObjectBody::Decision(d) => d.options[0].n,
        _ => unreachable!(),
    };
    s.acknowledge_draw_for_test(at(1));
    s.consume_draw();
    s.pin_input_target();
    if let ObjectBody::Decision(d) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        d.options.reverse();
    }
    s.authorize(AuthorityVerb::Decide);
    assert_eq!(
        s.core.session.readback.as_ref().unwrap().action.option,
        Some(expected)
    );
}
#[test]
fn authority_uses_drawn_settings_subject_after_reorder() {
    let mut s = demo(Screen::Settings);
    let id = s.selected_id().unwrap();
    let expected = match &s.core.host.objects[&id].body {
        ObjectBody::Settings(d) => d.routes[0].0.clone(),
        _ => unreachable!(),
    };
    s.acknowledge_draw_for_test(at(1));
    s.consume_draw();
    s.pin_input_target();
    if let ObjectBody::Settings(d) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        d.routes.reverse();
    }
    s.authorize(AuthorityVerb::Routing);
    assert_eq!(
        s.core
            .session
            .readback
            .as_ref()
            .unwrap()
            .decidable
            .subject
            .as_ref(),
        Some(&expected)
    );
}
#[test]
fn native_annotation_operator_uses_exact_range_not_entire_source() {
    let mut s = demo(Screen::Review);
    let id = s.selected_id().unwrap();
    if let ObjectBody::Review(r) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        r.text = "first second third".into();
        r.nodes.clear();
    }
    let mut rt = runtime(s);
    keys(&mut rt, "wciw");
    let note = rt.state.composer.as_ref().unwrap().note.as_ref().unwrap();
    assert_eq!(
        (
            note.anchor.byte_start,
            note.anchor.byte_end,
            note.anchor.quote.as_str()
        ),
        (6, 12, "second")
    );
    assert_eq!(rt.state.source_text(), "first second third");
}
#[test]
fn hint_prefix_backspace_and_escape_never_open_or_authorize() {
    let mut s = demo(Screen::Review);
    s.hints = Some(vec![("aa".into(), "a".into()), ("ab".into(), "b".into())]);
    let mut rt = runtime(s);
    keys(&mut rt, "a");
    assert_eq!(rt.state.hint_prefix, "a");
    rt.key(Key::Backspace.into());
    rt.frame(0.0);
    assert!(rt.state.hint_prefix.is_empty());
    rt.key(Key::Escape.into());
    rt.frame(0.0);
    assert!(rt.state.hints.is_none());
    assert!(rt.state.outgoing.is_empty());
}
#[test]
fn policy_editor_preserves_invalid_bytes_and_uses_policy_basis() {
    let s = demo(Screen::Settings);
    let revision = match &s.current_object().unwrap().body {
        ObjectBody::Settings(d) => d.policy_default.clone(),
        _ => unreachable!(),
    };
    let mut rt = runtime(s);
    keys(&mut rt, "i");
    assert_eq!(rt.state.composer.as_ref().unwrap().key.base, revision);
    rt.state.composer.as_mut().unwrap().editor = render_editor::Editor::insert("half-typed");
    rt.state.sync_composer();
    let DraftBody::Policy(p) = &rt.state.core.local.drafts.values().next().unwrap().body else {
        panic!("typed policy required")
    };
    assert!(p.safe_edits().is_err());
    rt.state.finish_composer();
    keys(&mut rt, "i");
    assert_eq!(
        rt.state.composer.as_ref().unwrap().editor.text(),
        "half-typed"
    );
}
#[test]
fn discard_confirmation_is_local_and_target_scoped() {
    let mut s = demo(Screen::Review);
    let target = s.selected_id().unwrap();
    for object in [&target, "other"] {
        s.core.edit_draft(
            DraftKey {
                object: object.into(),
                kind: DraftKind::EditBuffer,
                base: None,
            },
            DraftBody::Text("kept".into()),
        );
    }
    let mut rt = runtime(s);
    keys(&mut rt, ":q!");
    rt.key(Key::Enter.into());
    rt.frame(0.0);
    keys(&mut rt, "y");
    assert!(
        rt.state
            .core
            .local
            .drafts
            .keys()
            .all(|k| k.object != target)
    );
    assert!(
        rt.state
            .core
            .local
            .drafts
            .keys()
            .any(|k| k.object == "other")
    );
    assert!(rt.state.outgoing.is_empty());
}
