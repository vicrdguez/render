use render_core::*;
use render_desktop::{AppState, Screen, ServiceRequest, app_spec};
use rune::{Env, Key, KeyEvent, Mods, Runtime};

fn runtime() -> Runtime<AppState> {
    let mut spec = app_spec();
    spec.poll = None;
    let mut rt = rune::App::new(spec).headless_runtime(
        (1200.0, 982.0),
        Env {
            system_dark: true,
            scale: 1.0,
        },
    );
    rt.state.install_demo();
    rt.state.poll_service();
    let template = rt
        .state
        .core
        .host
        .objects
        .values()
        .find(|o| matches!(o.body, ObjectBody::Review(_)))
        .unwrap()
        .clone();
    rt.state.core.host.objects.clear();
    for (id, title, source) in [
        ("a", "Alpha document", "loaded needle\nsecond page"),
        ("b", "Beta document", "other source"),
    ] {
        let mut o = template.clone();
        o.id = id.into();
        o.title = Some(title.into());
        if let ObjectBody::Review(r) = &mut o.body {
            r.text = source.into();
        }
        rt.state.core.host.objects.insert(id.into(), o);
    }
    rt.state.lists = Default::default();
    rt
}
#[test]
fn identical_results_views_keep_distinct_picker_identities() {
    let mut rt = runtime();
    command(&mut rt, "find.object");
    rt.state.export_picker();
    command(&mut rt, "find.object");
    rt.state.export_picker();
    command(&mut rt, "view.switch");
    rt.state.now = 0.5;
    rt.update(|s, tx| s.picker_pointer(2, tx));
    assert_eq!(rt.state.active, 2);
}

#[test]
fn frozen_line_target_refuses_changed_source_instead_of_reusing_its_byte() {
    let mut rt = runtime();
    rt.state.open(Screen::Review, Some("a".into()));
    assert!(rt.state.reader_seek(5));
    command(&mut rt, "search.lines");
    if let ObjectBody::Review(review) = &mut rt.state.core.host.objects.get_mut("a").unwrap().body {
        review.text.insert_str(0, "inserted line\n");
    }
    key(&mut rt, Key::Enter);
    assert!(rt.state.modal.is_some());
    assert_eq!(rt.state.tab().reader.cursor(), 5);
    assert!(rt.state.echo().contains("changed"));
}

fn command(rt: &mut Runtime<AppState>, command: &str) {
    rt.update(|s, tx| s.command(command, tx));
}
fn key(rt: &mut Runtime<AppState>, key: Key) {
    rt.update(|s, tx| {
        render_desktop::on_key(s, &key.into(), tx);
    });
}
fn ctrl(rt: &mut Runtime<AppState>, text: &str) {
    rt.update(|s, tx| {
        render_desktop::on_key(
            s,
            &KeyEvent {
                key: Key::Text(text.into()),
                mods: Mods {
                    ctrl: true,
                    ..Default::default()
                },
            },
            tx,
        );
    });
}

#[test]
fn frozen_target_survives_insertion_and_resume_but_query_edit_resamples() {
    let mut rt = runtime();
    command(&mut rt, "search.global");
    key(&mut rt, Key::Down);
    let mut inserted = rt.state.core.host.objects["a"].clone();
    inserted.id = "0".into();
    rt.state.core.host.objects.insert("0".into(), inserted);
    key(&mut rt, Key::Escape);
    command(&mut rt, "picker.resume");
    key(&mut rt, Key::Enter);
    assert_eq!(rt.state.tab().object.as_deref(), Some("b"));
    command(&mut rt, "picker.resume");
    key(&mut rt, Key::Text("Alpha".into()));
    assert_eq!(rt.state.picker_session.as_ref().unwrap().rows.len(), 2);
    key(&mut rt, Key::Escape);
    command(&mut rt, "picker.resume");
    assert_eq!(rt.state.picker_session.as_ref().unwrap().query, "Alpha");
}
#[test]
fn opening_cached_loaded_content_requests_fresh_object_without_acknowledging_basis() {
    let mut rt = runtime();
    let scope = Scope::Object("a".into());
    rt.state
        .core
        .host
        .object_scope
        .insert("a".into(), scope.clone());
    rt.state.core.host.needs_snapshot.insert(scope);
    let before = rt.state.core.local.read_bases.clone();
    rt.state.open_object("a");
    assert_eq!(rt.state.tab().object.as_deref(), Some("a"));
    assert!(
        rt.state
            .requests
            .iter()
            .any(|r| matches!(r, ServiceRequest::Snapshot(Scope::Object(id)) if id == "a"))
    );
    assert_eq!(rt.state.core.local.read_bases, before);
}

#[test]
fn removed_target_requests_exact_identity_not_neighbor() {
    let mut rt = runtime();
    command(&mut rt, "search.global");
    rt.state.core.host.objects.remove("a");
    key(&mut rt, Key::Enter);
    assert_eq!(rt.state.tab().object.as_deref(), Some("a"));
    assert!(
        rt.state
            .requests
            .iter()
            .any(|r| matches!(r, ServiceRequest::Snapshot(Scope::Object(id)) if id == "a"))
    );
}
#[test]
fn tabs_filter_fuzzily_and_cursor_clamps() {
    let mut rt = runtime();
    rt.state.open(Screen::Agents, None);
    rt.state.open(Screen::Settings, None);
    command(&mut rt, "view.switch");
    key(&mut rt, Key::Text("Agts".into()));
    for _ in 0..8 {
        key(&mut rt, Key::Down);
    }
    key(&mut rt, Key::Enter);
    assert_eq!(rt.state.screen(), Screen::Agents);
}
#[test]
fn loaded_only_preview_pages_and_export_are_local_and_frozen() {
    let mut rt = runtime();
    command(&mut rt, "search.global");
    key(&mut rt, Key::Text("ldndle".into()));
    assert_eq!(rt.state.picker_session.as_ref().unwrap().rows.len(), 1);
    assert_eq!(rt.state.picker_preview(), "loaded needle\nsecond page");
    if let ObjectBody::Review(review) = &mut rt.state.core.host.objects.get_mut("a").unwrap().body {
        review.text = "loaded preview paragraph\n\n".repeat(20);
    }
    rt.frame(1.0);
    assert_eq!(rt.scroll_at_bottom("picker.preview"), Some(false));
    for _ in 0..10 {
        ctrl(&mut rt, "n");
        rt.frame(1.0);
    }
    assert_eq!(rt.scroll_at_bottom("picker.preview"), Some(true));
    ctrl(&mut rt, "p");
    rt.frame(1.0);
    assert_eq!(rt.scroll_at_bottom("picker.preview"), Some(false));
    ctrl(&mut rt, "l");
    assert_eq!(rt.state.screen(), Screen::Results);
    assert_eq!(rt.state.visible_ids(), vec!["a"]);
    rt.state.core.host.objects.remove("a");
    assert_eq!(rt.state.visible_ids(), vec!["a"]);
    command(&mut rt, "list.open");
    assert_eq!(rt.state.tab().object.as_deref(), Some("a"));
    command(&mut rt, "picker.resume");
    assert!(rt.state.picker_preview().contains("unavailable"));
    assert!(rt.state.outgoing.is_empty());
}
#[test]
fn palette_cannot_export_objects_and_picker_pointer_obeys_delay() {
    let mut rt = runtime();
    command(&mut rt, "palette");
    let count = rt.state.tabs.len();
    ctrl(&mut rt, "l");
    assert_eq!(rt.state.tabs.len(), count);
    command(&mut rt, "search.global");
    rt.state.now = 0.2;
    rt.update(|s, tx| s.picker_pointer(1, tx));
    assert!(rt.state.tab().object.is_none());
    rt.state.now = 0.5;
    rt.update(|s, tx| s.picker_pointer(1, tx));
    assert_eq!(rt.state.tab().object.as_deref(), Some("b"));
}
