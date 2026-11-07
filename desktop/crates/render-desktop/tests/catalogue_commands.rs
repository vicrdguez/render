use render_core::*;
use render_desktop::{AppState, Screen, ServiceRequest, app_spec, view};
use rune::{Env, Runtime, text::TextSystem};
fn runtime() -> Runtime<AppState> {
    let spec = app_spec();
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
        r.text = "one two\nthree".into();
        r.nodes = vec![
            Node {
                id: "a".into(),
                class: None,
                title: None,
                byte_range: Some((0, 4)),
            },
            Node {
                id: "b".into(),
                class: None,
                title: None,
                byte_range: Some((4, 13)),
            },
        ];
    }
    s.open_object(&id);
    Runtime::with_text(
        s,
        view,
        (1200.0, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
        TextSystem::new(spec.fonts, spec.families),
    )
}
fn notes(s: &mut AppState) -> DraftKey {
    let key = DraftKey {
        object: s.selected_id().unwrap(),
        kind: DraftKind::Annotations,
        base: None,
    };
    s.core.edit_draft(
        key.clone(),
        DraftBody::Notes(vec![
            LocalNote {
                local_id: 1,
                anchor: Anchor {
                    node: None,
                    byte_start: 0,
                    byte_end: 3,
                    quote: "one".into(),
                },
                body: "first".into(),
            },
            LocalNote {
                local_id: 2,
                anchor: Anchor {
                    node: None,
                    byte_start: 4,
                    byte_end: 7,
                    quote: "two".into(),
                },
                body: "second".into(),
            },
        ]),
    );
    key
}
#[test]
fn close_refuses_drafts_and_force_close_requires_confirmation() {
    let mut rt = runtime();
    let key = notes(&mut rt.state);
    let n = rt.state.tabs.len();
    rt.update(|s, tx| s.command("view.close", tx));
    assert_eq!(rt.state.tabs.len(), n);
    assert!(rt.state.core.local.drafts.contains_key(&key));
    rt.update(|s, tx| s.command("view.close_discard", tx));
    assert_eq!(rt.state.tabs.len(), n);
    assert!(rt.state.modal.is_some());
    assert!(rt.state.core.local.drafts.contains_key(&key));
}
#[test]
fn discard_and_undo_preserve_sibling_notes() {
    let mut rt = runtime();
    let key = notes(&mut rt.state);
    rt.state.tab_mut().reader.record = Some("draft:1".into());
    rt.update(|s, tx| s.command("draft.edit", tx));
    assert_eq!(rt.state.composer.as_ref().unwrap().editor.text(), "first");
    rt.state.composer = None;
    rt.update(|s, tx| s.command("draft.discard", tx));
    let DraftBody::Notes(n) = &rt.state.core.local.drafts[&key].body else {
        panic!()
    };
    assert_eq!(n.iter().map(|n| n.local_id).collect::<Vec<_>>(), vec![2]);
    rt.update(|s, tx| s.command("draft.undo", tx));
    let DraftBody::Notes(n) = &rt.state.core.local.drafts[&key].body else {
        panic!()
    };
    assert_eq!(n.len(), 2);
}
#[test]
fn semantic_dispatch_uses_binding_and_tab_previous_uses_count() {
    let mut rt = runtime();
    rt.update(|s, tx| {
        s.last_binding = "]N".into();
        s.command("node.next", tx)
    });
    assert_eq!(rt.state.tab().reader.cursor(), 4);
    rt.update(|s, tx| {
        s.last_binding = "[N".into();
        s.command("node.next", tx)
    });
    assert_eq!(rt.state.tab().reader.cursor(), 0);
    rt.state.open(Screen::Slices, None);
    rt.state.open(Screen::Agents, None);
    rt.update(|s, tx| {
        s.count = "2".into();
        s.command("view.tab_prev", tx)
    });
    assert_eq!(rt.state.screen(), Screen::Review);
}
#[test]
fn refresh_requests_current_object_not_reconnect() {
    let mut rt = runtime();
    let id = rt.state.selected_id().unwrap();
    rt.state.requests.clear();
    rt.update(|s, tx| s.command("recover.refresh", tx));
    assert!(
        matches!(&rt.state.requests[..],[ServiceRequest::Snapshot(Scope::Object(x))] if x==&id)
    );
}
#[test]
fn finders_use_actual_record_types_and_recent_visits() {
    let rt = runtime();
    let slices = rt.state.object_matches("slice:");
    assert_eq!(slices.len(), rt.state.core.host.slices.rows.len());
    assert!(
        rt.state
            .recent_matches("")
            .contains(&rt.state.selected_id().unwrap())
    );
}
#[test]
fn marks_restore_exact_byte_and_revision() {
    let mut rt = runtime();
    rt.state.reader_seek(4);
    rt.state.set_mark('A');
    rt.state.reader_seek(0);
    rt.state.jump_to_mark('A', true);
    assert_eq!(rt.state.tab().reader.cursor(), 4);
}
