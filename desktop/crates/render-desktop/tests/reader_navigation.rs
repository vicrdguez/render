use render_core::*;
use render_desktop::{AppState, Screen, ServiceRequest};
fn keys(s: &str) -> Vec<String> {
    s.chars().map(|c| c.to_string()).collect()
}
fn review() -> AppState {
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
    let o = s.core.host.objects.get_mut(&id).unwrap();
    if let ObjectBody::Review(r) = &mut o.body {
        r.text = "écho écho\nlast".into();
        r.nodes = vec![
            Node {
                id: "first".into(),
                class: None,
                title: None,
                byte_range: Some((0, 6)),
            },
            Node {
                id: "second".into(),
                class: None,
                title: None,
                byte_range: Some((6, 11)),
            },
        ];
        r.change_ranges = vec![(6, 11)];
    }
    s.open_object(&id);
    s
}
#[test]
fn repeated_utf8_ranges_are_exact_and_source_is_immutable() {
    let mut s = review();
    assert!(s.reader_motion(&keys("w")));
    assert_eq!(s.tab().reader.cursor(), 6);
    let a = s.reader_operator("c", &keys("iw")).unwrap();
    assert_eq!(
        (a.byte_start, a.byte_end, a.quote.as_str()),
        (6, 11, "écho")
    );
    assert!(s.reader_motion(&keys("ve")));
    assert_eq!(s.reader_selection().unwrap().quote, "écho");
    assert!(!s.reader_motion(&keys("x")));
    assert_eq!(s.source_text(), "écho écho\nlast");
    assert_eq!(s.tab().cursor, 0);
}
#[test]
fn semantic_direction_and_structural_ranges_use_host_offsets() {
    let mut s = review();
    assert!(s.semantic_motion("node.next", "]n", 1));
    assert_eq!(s.tab().reader.cursor(), 6);
    assert_eq!(
        s.reader_operator("y", &keys("in")).unwrap().node.as_deref(),
        Some("second")
    );
    assert!(s.semantic_motion("node.next", "[N", 1));
    assert_eq!(s.tab().reader.cursor(), 0);
    assert!(s.semantic_motion("node.next", "]N", 1));
    assert_eq!(s.tab().reader.cursor(), 6);
}
#[test]
fn unrelated_kind_is_unavailable_and_missing_object_is_requested() {
    let mut s = review();
    let id = s.selected_id().unwrap();
    s.core.host.objects.get_mut(&id).unwrap().workflow = Some("isolated".into());
    s.open_kind(Screen::Chat);
    assert_eq!(s.selected_id().as_deref(), Some(id.as_str()));
    assert!(s.echo().contains("unavailable"));
    s.open_object("missing-id");
    assert_eq!(s.selected_id().as_deref(), Some("missing-id"));
    assert!(
        s.requests.iter().any(
            |r| matches!(r, ServiceRequest::Snapshot(Scope::Object(id)) if id == "missing-id")
        )
    );
}
#[test]
fn jumps_restore_both_directions_without_growing_history() {
    let mut s = review();
    let first = s.selected_id().unwrap();
    let second = s
        .core
        .host
        .objects
        .values()
        .find(|o| matches!(o.body, ObjectBody::Chat(_)))
        .unwrap()
        .id
        .clone();
    s.open_object(&second);
    let history = s.core.local.jumplist.clone();
    assert!(s.jump_history(false));
    assert_eq!(s.selected_id().as_deref(), Some(first.as_str()));
    assert!(s.jump_history(true));
    assert_eq!(s.selected_id().as_deref(), Some(second.as_str()));
    assert_eq!(s.core.local.jumplist, history);
}
#[test]
fn linewise_and_backward_ranges_do_not_search_repeated_quotes() {
    let mut s = review();
    assert!(s.reader_motion(&keys("w")));
    let a = s.reader_operator("y", &keys("b")).unwrap();
    assert_eq!(
        (a.byte_start, a.byte_end, a.quote.as_str()),
        (0, 6, "écho ")
    );
    assert!(s.reader_motion(&keys("G")));
    let a = s.reader_operator("y", &keys("y")).unwrap();
    assert_eq!(
        (a.byte_start, a.byte_end, a.quote.as_str()),
        (12, 16, "last")
    );
}
#[test]
fn streaming_message_refuses_selection_and_structural_operators() {
    let mut s = review();
    let id = s
        .core
        .host
        .objects
        .values()
        .find(|o| matches!(&o.body, ObjectBody::Chat(c) if !c.messages.is_empty()))
        .unwrap()
        .id
        .clone();
    if let ObjectBody::Chat(c) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        c.messages.truncate(1);
        c.messages[0].body = MessageBody::Text {
            text: "écho écho".into(),
            streaming: true,
            truncated: false,
        };
    }
    s.open_object(&id);
    assert!(s.reader_operator("y", &keys("im")).is_none());
    assert!(s.reader_operator("c", &keys("iw")).is_none());
    assert!(!s.reader_motion(&keys("ve")));
    assert_eq!(s.source_text(), "écho écho");
    if let ObjectBody::Chat(c) = &mut s.core.host.objects.get_mut(&id).unwrap().body
        && let MessageBody::Text { streaming, .. } = &mut c.messages[0].body
    {
        *streaming = false;
    }
    assert_eq!(
        s.reader_operator("y", &keys("am")).unwrap().quote,
        "écho écho"
    );
}
#[test]
fn indexed_reference_uses_exact_occurrence_and_keeps_dangling_reason() {
    let mut s = review();
    let id = s.selected_id().unwrap();
    if let ObjectBody::Review(r) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        r.text = "XM2 M2 M2".into();
    }
    let scope = Scope::Object(id.clone());
    s.core.host.object_scope.insert(id, scope.clone());
    s.core.host.references.insert(
        scope,
        vec![Reference {
            label: "M2".into(),
            kind: "node".into(),
            target: None,
            state: ReferenceState::Dangling,
            reason: Some(Text::Host("removed node".into())),
        }],
    );
    assert!(s.reader_seek(1));
    assert!(s.under_cursor_reference().is_none());
    assert!(s.reader_seek(7));
    let r = s.under_cursor_reference().unwrap();
    assert_eq!(r.state, ReferenceState::Dangling);
    assert_eq!(r.reason.unwrap().as_str(), "removed node");
    let id = s.selected_id().unwrap();
    if let ObjectBody::Review(r) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        r.text = "`M2` `https://example.test` [safe](https://example.test)".into();
    }
    assert!(s.reader_seek(1));
    assert!(
        s.under_cursor_reference().is_none(),
        "inline code has no reference action"
    );
    assert!(s.reader_seek(8));
    assert!(
        s.under_cursor_link().is_none(),
        "inline code has no URL action"
    );
    assert!(s.reader_seek(29));
    assert_eq!(
        s.under_cursor_link().as_deref(),
        Some("https://example.test")
    );
}
#[test]
fn historical_jump_does_not_show_latest_or_append_history() {
    let mut s = review();
    let mark = Mark {
        object: s.selected_id().unwrap(),
        revision: Some("absent-old-revision".into()),
        byte: None,
    };
    let before = s.core.local.jumplist.clone();
    s.open_mark(&mark);
    assert!(s.current_object().is_none());
    assert_eq!(s.core.local.jumplist, before);
    assert!(s.echo().contains("historical"));
}
