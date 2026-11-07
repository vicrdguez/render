use render_desktop::{AppState, Screen};

#[test]
fn local_views_and_exact_reader_position_survive_restart_without_sending() {
    let path = std::env::temp_dir().join(format!("render-session-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    let mut app = AppState::default();
    app.install_demo();
    app.attach_store(&path);
    app.open(Screen::Review, Some("review".into()));
    assert!(app.reader_seek(35));
    let byte = app.tab().reader.cursor();
    app.tab_mut().scroll = 7;
    app.open(Screen::Chat, Some("chat".into()));
    app.active = 1;
    assert!(app.persist());
    drop(app);

    let mut reopened = AppState::default();
    reopened.attach_store(&path);
    assert_eq!(reopened.tabs.len(), 3);
    assert_eq!(reopened.active, 1);
    assert_eq!(reopened.tab().object.as_deref(), Some("review"));
    assert_eq!(reopened.tab().scroll, 7);
    assert!(reopened.core.host.objects.contains_key("review"));
    assert!(!reopened.core.host.writable());
    assert!(reopened.core.host.host_time.is_none());
    assert_eq!(reopened.tab().reader.cursor(), byte);
    assert!(reopened.outgoing.is_empty());
    reopened.install_demo();
    reopened.restore_view_positions();
    assert_eq!(reopened.tab().reader.cursor(), byte);
    assert!(reopened.outgoing.is_empty());
    drop(reopened);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn exported_results_and_per_view_outline_survive_restart() {
    use render_desktop::picker::{ResultRow, Results};
    let path = std::env::temp_dir().join(format!("render-results-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    let mut app = AppState::default();
    app.install_demo();
    app.attach_store(&path);
    app.open(Screen::Review, Some("review".into()));
    app.tab_mut().outline_visible = false;
    app.open(Screen::Results, None);
    app.tab_mut().results = Some(Results {
        query: "routing".into(),
        rows: vec![ResultRow {
            object: "review".into(),
            title: "Frozen result title".into(),
        }],
    });
    assert!(app.persist());
    drop(app);
    let mut reopened = AppState::default();
    reopened.attach_store(&path);
    assert!(!reopened.tabs[1].outline_visible);
    assert_eq!(reopened.screen(), Screen::Results);
    let result = reopened.tab().results.as_ref().unwrap();
    assert_eq!(result.query, "routing");
    assert_eq!(result.rows[0].object, "review");
    assert_eq!(result.rows[0].title, "Frozen result title");
    drop(reopened);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn explicit_demo_reseeds_its_ephemeral_host_instead_of_retaining_unrefreshable_cache() {
    let mut app = AppState::default();
    app.install_demo();
    let scope = render_core::Scope::Object("review".into());
    app.core.host.cursors.get_mut(&scope).unwrap().scope_seq += 100;
    app.core.host.needs_snapshot.insert(scope.clone());
    app.install_demo();
    assert!(!app.core.host.needs_snapshot.contains(&scope));
    assert!(
        app.core
            .drawn_target("review", render_core::Surface::WorkView)
            .unwrap()
            .epoch
            .is_some()
    );
}
