use render_content::Theme;
use render_core::WaitClass;
use render_desktop::{AppState, Screen, app_spec, on_key, view};
use rune::{Env, Runtime, text::TextSystem};

#[test]
fn human_wait_list_cursor_has_readable_enter_chip_muted_under_float() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        let mut state = AppState::default();
        state.install_demo();
        state.theme = theme;
        state.open(Screen::Slices, None);
        let id = state
            .core
            .host
            .slices
            .rows
            .iter()
            .find(|r| r.wait == Some(WaitClass::Human))
            .unwrap()
            .id
            .clone();
        state.select_id(&id);
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
        rt.on_key = Some(on_key);
        rt.frame(0.0);
        let elements = rt.elements();
        let row = elements
            .iter()
            .find(|e| e.key.as_deref() == Some(&format!("row.{id}")))
            .unwrap();
        let chip = elements
            .iter()
            .find(|e| {
                e.text.as_deref() == Some("⏎")
                    && e.rect[1] >= row.rect[1]
                    && e.rect[1] < row.rect[1] + row.rect[3]
            })
            .expect("human cursor prints Enter");
        let (a, b) = (chip.text_color.unwrap().luminance(), chip.fill.luminance());
        assert!((a.max(b) + 0.05) / (a.min(b) + 0.05) >= 4.5);
        rt.key(rune::Key::Text("K".into()).into());
        rt.frame(1.0);
        let elements = rt.elements();
        let row = elements
            .iter()
            .find(|e| e.key.as_deref() == Some(&format!("row.{id}")))
            .unwrap();
        assert_ne!(row.fill, theme.token("state.attn"));
        let chip = elements
            .iter()
            .find(|e| {
                e.text.as_deref() == Some("⏎")
                    && e.rect[1] >= row.rect[1]
                    && e.rect[1] < row.rect[1] + row.rect[3]
            })
            .expect("modal retains Enter");
        assert_eq!(chip.text_color, Some(theme.token("fg.muted")));
    }
}
