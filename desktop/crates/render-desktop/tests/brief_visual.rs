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
