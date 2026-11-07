use render_content::{Document, Reference, RenderOptions, Theme, render_text_with_options};
use rune::{Cx, El, Env, Runtime};

struct Page {
    doc: Document,
    options: RenderOptions,
    width: f32,
    plain: bool,
}
fn view(page: &Page, _: &mut Cx<Page>) -> El {
    if page.plain {
        render_text_with_options(page.doc.source(), Theme::Ember, page.width, page.options)
    } else {
        page.doc
            .render_with_options(Theme::Ember, page.width, page.options)
    }
}
fn render(source: &str, width: f32, options: RenderOptions, plain: bool) -> Runtime<Page> {
    let fonts: &[&'static [u8]] = &[
        include_bytes!("../../../assets/fonts/Iosevka-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-SemiBold.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Bold.ttf"),
    ];
    let mut rt = Runtime::with_text(
        Page {
            doc: Document::parse(source, &[Reference::resolved("F16", "finding/16")]),
            options,
            width,
            plain,
        },
        view,
        (width, 2000.0),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(fonts, ("Iosevka Etoile", "Iosevka")),
    );
    rt.frame(0.0);
    rt.frame(0.1);
    rt
}
fn bounds(rt: &Runtime<Page>, label: &str) -> [f32; 4] {
    rt.elements()
        .iter()
        .find(|e| e.text.as_deref() == Some(label))
        .unwrap()
        .target
}

#[test]
fn prose_measure_caps_available_width_in_markdown_and_plain_content() {
    for plain in [false, true] {
        for (available, measure, expected) in [
            (900.0, Some(600.0), 600.0),
            (900.0, None, 900.0),
            (300.0, Some(600.0), 300.0),
            (900.0, Some(420.0), 420.0),
        ] {
            let rt = render(
                "Prose",
                available,
                RenderOptions {
                    prose_measure: measure,
                    ..Default::default()
                },
                plain,
            );
            assert!((bounds(&rt, "Prose")[2] - expected).abs() < 0.1);
        }
    }
}

#[test]
fn table_uses_actual_selected_family_and_keeps_code_and_reference_metrics() {
    // Equal-length narrow and wide glyph runs distinguish the bundled proportional
    // Etoile from Iosevka through native layout, not the option value.
    for mono in [false, true] {
        let options = RenderOptions {
            mono_prose: mono,
            ..Default::default()
        };
        let narrow = render(
            "| iiiiiiiiii |\n|---|\n| iiiiiiiiii |",
            900.0,
            options,
            false,
        );
        let wide = render(
            "| WWWWWWWWWW |\n|---|\n| WWWWWWWWWW |",
            900.0,
            options,
            false,
        );
        let difference = (bounds(&narrow, "iiiiiiiiii")[2] - bounds(&wide, "WWWWWWWWWW")[2]).abs();
        if mono {
            assert!(difference < 0.1, "{difference}");
        } else {
            assert!(difference > 10.0, "{difference}");
        }
    }
    for cell in ["`iiiiiiiiii`", "F16"] {
        let source = format!("| {cell} |\n|---|\n| {cell} |");
        let normal = render(&source, 180.0, RenderOptions::default(), false);
        let mono = render(
            &source,
            180.0,
            RenderOptions {
                mono_prose: true,
                ..Default::default()
            },
            false,
        );
        let label = cell.trim_matches('`');
        assert_eq!(bounds(&normal, label), bounds(&mono, label));
        assert_eq!(normal.accessibility_json(), mono.accessibility_json());
    }
}

#[test]
fn options_reach_nested_prose_and_do_not_leak_between_calls() {
    let source = "> iiiiiiiiii iiiiiiiiii iiiiiiiiii iiiiiiiiii\n\n- iiiiiiiiii iiiiiiiiii iiiiiiiiii iiiiiiiiii";
    let label = "iiiiiiiiii iiiiiiiiii iiiiiiiiii iiiiiiiiii";
    let normal = render(source, 150.0, RenderOptions::default(), false);
    let mono = render(
        source,
        150.0,
        RenderOptions {
            mono_prose: true,
            ..Default::default()
        },
        false,
    );
    assert!(
        bounds(&mono, label)[3] > bounds(&normal, label)[3],
        "normal {:?}, mono {:?}",
        bounds(&normal, label),
        bounds(&mono, label)
    );
    let again = render(source, 150.0, RenderOptions::default(), false);
    assert_eq!(bounds(&normal, label), bounds(&again, label));
}

#[test]
fn mermaid_source_mode_replaces_graph_without_changing_original_bytes() {
    let body = "flowchart LR\nA[Start] --> B[Done]\n";
    let source = format!("```mermaid\n{body}```\n");
    let doc = Document::parse(&source, &[]);
    let graph = render(&source, 600.0, RenderOptions::default(), false);
    assert!(
        graph
            .elements()
            .iter()
            .any(|e| e.role == "figure" && e.opacity > 0.0)
    );
    let source_view = render(
        &source,
        600.0,
        RenderOptions {
            mermaid_source: true,
            ..Default::default()
        },
        false,
    );
    let elements = source_view.elements();
    assert!(!elements.iter().any(|e| e.role == "figure"));
    assert!(
        elements
            .iter()
            .any(|e| e.key.as_deref() == Some("code-text") && e.text.as_deref() == Some(body))
    );
    assert!(elements.iter().any(
        |e| e.key.as_deref() == Some("code-rule") && e.fill == Theme::Ember.token("kind.code")
    ));
    assert!(
        !elements
            .iter()
            .any(|e| e.fill == Theme::Ember.token("state.attn"))
    );
    assert_eq!(doc.source(), source);
}
