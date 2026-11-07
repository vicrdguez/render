use render_desktop::{AppState, app_spec, on_close, view};
use rune::{Env, Runtime, text::TextSystem};

#[test]
fn native_close_retains_state_after_write_failure_and_can_retry() {
    let dir = std::env::temp_dir().join(format!("render-close-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let mut app = AppState::default();
    app.attach_store(&dir);
    app.numbers = true;
    std::fs::create_dir(dir.join("device.json.next")).unwrap();
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        app,
        view,
        (800.0, 982.0),
        Env::default(),
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.update(on_close);
    assert!(!matches!(rt.shell_request, Some(rune::Shell::Quit)));
    assert!(rt.state.persistence_error.is_some());
    assert!(rt.state.numbers);
    std::fs::remove_dir(dir.join("device.json.next")).unwrap();
    rt.update(on_close);
    assert!(matches!(rt.shell_request, Some(rune::Shell::Quit)));
    assert!(rt.state.persistence_error.is_none());
    drop(rt);
    let mut reopened = AppState::default();
    reopened.attach_store(&dir);
    assert!(reopened.numbers);
    drop(reopened);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn unreadable_device_record_is_never_overwritten_by_retry() {
    let dir = std::env::temp_dir().join(format!("render-corrupt-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("device.json"), b"unreadable record").unwrap();
    let mut app = AppState::default();
    app.attach_store(&dir);
    assert!(app.persistence_error.is_some());
    assert!(!app.persist());
    assert_eq!(
        std::fs::read(dir.join("device.json")).unwrap(),
        b"unreadable record"
    );
    drop(app);
    std::fs::remove_dir_all(dir).unwrap();
}
