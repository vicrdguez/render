use render_core::*;
use render_desktop::{AppState, app_spec, view};
use rune::{Env, Runtime, text::TextSystem};
#[test]
fn short_chat_keeps_composer_at_page_foot() {
    let mut s = AppState::default();
    s.install_demo();
    s.poll_service();
    let id = s
        .core
        .host
        .objects
        .values()
        .find(|o| matches!(o.body, ObjectBody::Chat(_)))
        .unwrap()
        .id
        .clone();
    if let ObjectBody::Chat(c) = &mut s.core.host.objects.get_mut(&id).unwrap().body {
        c.messages.clear();
    }
    s.open_object(&id);
    let spec = app_spec();
    let mut rt = Runtime::with_text(
        s,
        view,
        (1512., 982.),
        Env {
            system_dark: true,
            scale: 1.,
        },
        TextSystem::new(spec.fonts, spec.families),
    );
    rt.frame(0.);
    let c = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("editor.composer"))
        .unwrap();
    assert!(c.rect[1] > 650., "composer floats at {:?}", c.rect);
}
