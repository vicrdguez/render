use render_core::{AttentionGroup, RowMark};
use render_desktop::{AppState, app_spec, on_key, view};
use rune::{Env, Runtime, text::TextSystem};

fn runtime(width: f32, modal: bool) -> Runtime<AppState> {
    let mut state = AppState::default();
    state.install_demo();
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
    if modal {
        rt.key(rune::Key::Text("K".into()).into());
    }
    rt.frame(0.01);
    rt
}

fn contrast(a: rune::Color, b: rune::Color) -> f32 {
    let (a, b) = (a.luminance(), b.luminance());
    (a.max(b) + 0.05) / (a.min(b) + 0.05)
}

#[test]
fn selected_enter_chip_is_readable_and_retains_geometry_under_modal() {
    for theme in [
        render_content::Theme::Ember,
        render_content::Theme::EmberSoft,
        render_content::Theme::EmberLight,
    ] {
        let mut rt = runtime(1512.0, false);
        rt.update(|s, tx| {
            s.theme = theme;
            tx.instant();
        });
        rt.frame(0.02);
        let elements = rt.elements();
        let chip = elements
            .iter()
            .find(|e| e.text.as_deref() == Some("⏎") && e.rect[1] < 200.0)
            .unwrap();
        assert!(
            contrast(chip.text_color.unwrap(), chip.fill) >= 4.5,
            "{theme:?}: chip contrast"
        );
        let rect = chip.rect;
        rt.key(rune::Key::Text("K".into()).into());
        rt.frame(1.0);
        let elements = rt.elements();
        let chip = elements
            .iter()
            .find(|e| e.text.as_deref() == Some("⏎") && e.rect == rect)
            .expect("modal retains chip geometry");
        assert_eq!(chip.text_color, Some(theme.token("fg.muted")));
    }
}

#[test]
fn waiting_has_common_reason_and_age_columns_without_content_bars() {
    for (width, reason_x) in [(1512.0, 522.0), (1200.0, 522.0), (800.0, 378.0)] {
        let rt = runtime(width, false);
        let elements = rt.elements();
        let mut age_right = None;
        for r in rt
            .state
            .core
            .host
            .attention
            .rows
            .iter()
            .filter(|r| r.group == AttentionGroup::Waiting)
        {
            let head = elements
                .iter()
                .find(|e| e.key.as_deref() == Some(&format!("brief.head.{}", r.id)))
                .unwrap();
            let inside = |rect: [f32; 4]| {
                rect[1] >= head.rect[1] && rect[1] + rect[3] <= head.rect[1] + head.rect[3]
            };
            let reason = elements
                .iter()
                .filter(|e| inside(e.rect))
                .find(|e| e.text.as_deref() == r.reason.as_ref().map(|r| r.as_str()))
                .unwrap();
            assert_eq!(reason.rect[0], reason_x, "{} at {width}", r.id);
            let age = elements
                .iter()
                .filter(|e| inside(e.rect))
                .find(|e| e.text.as_deref() == Some(rt.state.age(r.since).as_str()))
                .unwrap();
            let right = age.rect[0] + age.rect[2];
            assert_eq!(*age_right.get_or_insert(right), right);
            assert!(
                !elements
                    .iter()
                    .filter(|e| inside(e.rect))
                    .any(|e| e.rect[2] == 2.0 && e.fill == rt.state.theme.token("border.strong")),
                "waiting has no content bar"
            );
        }
    }
}

#[test]
fn brief_bands_preserve_content_axis_and_fit_all_supported_widths() {
    for (width, x, band_width) in [
        (1512.0, 20.0, 860.0),
        (1200.0, 20.0, 672.0),
        (1000.0, 16.0, 860.0),
        (800.0, 16.0, 764.0),
    ] {
        let rt = runtime(width, false);
        assert_eq!(rt.state.host_label(), "DEMO · local fixtures");
        let elements = rt.elements();
        let title = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("brief.title"))
            .unwrap();
        assert_eq!(&title.rect[..2], &[x + 28.0, 58.0]);
        assert_eq!(title.text.as_deref(), Some("Needs you"));
        assert_eq!(title.text_color, Some(rt.state.theme.token("content.h1")));
        let count = elements
            .iter()
            .find(|e| e.key.as_deref() == Some("brief.count"))
            .unwrap();
        assert_eq!(count.text_color, Some(rt.state.theme.token("state.attn")));
        assert_eq!(count.rect[0], title.rect[0] + title.rect[2] + 9.0);
        for r in &rt.state.core.host.attention.rows {
            let key = format!("brief.head.{}", r.id);
            if matches!(r.group, AttentionGroup::NeedsYou | AttentionGroup::OnHost) {
                let head = elements
                    .iter()
                    .find(|e| e.key.as_deref() == Some(&key))
                    .unwrap();
                assert_eq!(head.rect[0], x);
                assert_eq!(head.rect[2], band_width);
                assert_eq!(head.visible[0], x, "band must not be clipped");
                assert!(head.rect[0] + head.rect[2] <= width - 20.0);
            }
            if r.group == AttentionGroup::Waiting {
                let key = format!("row.{}", r.id);
                let row = elements
                    .iter()
                    .find(|e| e.key.as_deref() == Some(&key))
                    .unwrap();
                assert_eq!(row.rect[3], 28.0);
            }
            if r.group == AttentionGroup::Done
                && matches!(
                    r.mark,
                    Some(RowMark::Failed | RowMark::Unknown | RowMark::Stale)
                )
            {
                assert!(
                    elements
                        .iter()
                        .any(|e| e.key.as_deref() == Some(&format!("row.{}", r.id)))
                );
            }
        }
    }
}

#[test]
fn modal_removes_solid_needs_head_without_removing_count_tag() {
    for modal in [false, true] {
        let rt = runtime(1512.0, modal);
        let selected = rt.state.selected_id().unwrap();
        let row = rt
            .state
            .core
            .host
            .attention
            .rows
            .iter()
            .find(|r| r.object == selected)
            .unwrap();
        let elements = rt.elements();
        let head = elements
            .iter()
            .find(|e| e.key.as_deref() == Some(&format!("brief.head.{}", row.id)))
            .unwrap();
        assert_eq!(head.fill == rt.state.theme.token("state.attn"), !modal);
        assert!(elements.iter().any(|e| e.rect[1] < 36.0
            && e.fill == rt.state.theme.token("state.attn")
            && e.rect[3] == 16.0));
    }
}
