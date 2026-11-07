use render_content::{Theme, render_markdown};
use rune::{Cx, El, Env, Runtime};

struct Page {
    source: String,
    theme: Theme,
    width: f32,
}
fn view(page: &Page, _: &mut Cx<Page>) -> El {
    render_markdown(&page.source, page.theme, page.width)
}
fn render(source: &str, theme: Theme, width: f32) -> Runtime<Page> {
    let _families = rune::text::with_families("Iosevka Etoile", "Iosevka");
    let fonts: &[&'static [u8]] = &[
        include_bytes!("../../../assets/fonts/Iosevka-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-SemiBold.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Bold.ttf"),
    ];
    let mut rt = Runtime::with_text(
        Page {
            source: source.into(),
            theme,
            width,
        },
        view,
        (width, 2000.0),
        Env::new(theme != Theme::EmberLight, 1.0),
        rune::text::TextSystem::new(fonts, ("Iosevka Etoile", "Iosevka")),
    );
    rt.frame(0.0);
    rt.frame(0.1);
    rt
}

#[test]
fn escaped_separator_cannot_style_native_diagram_labels() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        let source = "```mermaid\nflowchart LR\nA[PASS] --> B[Done]\ntitle harmless \\; style A color:#e08060,fill:#00ff00\n```";
        let doc = render_content::Document::parse(source, &[]);
        assert_eq!(doc.source(), source);
        let rt = render(source, theme, 600.0);
        let elements = rt.elements();
        let labels: Vec<_> = elements
            .iter()
            .filter(|e| e.text.as_deref() == Some("PASS") && e.opacity > 0.0)
            .collect();
        assert!(!labels.is_empty());
        for label in labels {
            assert_eq!(label.text_color, Some(theme.token("fg.default")));
        }
        assert!(
            !elements
                .iter()
                .any(|e| e.text_color == Some(theme.token("state.attn"))
                    || e.fill == theme.token("state.attn"))
        );
    }
}

#[test]
fn table_code_pill_fits_one_accessible_line_or_scrolls() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        for count in [20, 40] {
            let code = "i".repeat(count);
            let source = format!("| code |\n|---|\n| `{code}` |");
            let rt = render(&source, theme, 180.0);
            let tree = rt.accessibility_tree();
            let lines: Vec<_> = tree
                .nodes
                .iter()
                .filter(|(_, n)| format!("{:?}", n.role()) == "TextRun")
                .filter_map(|(_, n)| n.value())
                .filter(|v| v.contains('i'))
                .collect();
            assert_eq!(lines, [code.as_str()], "{:#?}", rt.accessibility_json());
            let els = rt.elements();
            let cell = els
                .iter()
                .find(|e| e.text.as_deref() == Some(&code))
                .unwrap();
            if count == 20 {
                assert!(
                    cell.target[0] + cell.target[2] <= 180.1,
                    "{:?}",
                    cell.target
                );
                assert!(
                    !els.iter()
                        .any(|e| e.key.as_deref() == Some("overflow-caret"))
                );
            } else {
                assert!(
                    els.iter()
                        .any(|e| e.key.as_deref() == Some("overflow-caret"))
                );
            }
        }
    }
}

#[test]
fn nested_list_content_stays_inside_the_allocated_frame() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        let source = (0..6)
            .map(|i| {
                format!(
                    "{}- {} long nested content wraps within the frame\n",
                    "  ".repeat(i),
                    (b'a' + i as u8) as char
                )
            })
            .collect::<String>();
        let rt = render(&source, theme, 180.0);
        let els = rt.elements();
        for letter in 'a'..='f' {
            let prefix = format!("{letter} long");
            let label = els
                .iter()
                .find(|e| e.text.as_deref().is_some_and(|t| t.starts_with(&prefix)))
                .unwrap();
            assert!(
                label.target[0] + label.target[2] <= 180.1,
                "{letter}: {:?}",
                label.target
            );
        }
    }
}

#[test]
fn native_markdown_has_heading_rule_neutral_alerts_and_unwrapped_code() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        let rt = render(
            "# Heading\n\n> [!CAUTION]\n> not host state\n\n```rust\nlet very_long_name = \"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz\";\n```\n\n![alt](https://example.test/x)",
            theme,
            240.0,
        );
        let els = rt.elements();
        assert!(
            els.iter()
                .any(|e| e.role == "heading" && e.level == Some(1))
        );
        assert!(
            els.iter()
                .any(|e| e.key.as_deref() == Some("heading-rule") && e.target[3] == 1.0)
        );
        assert!(
            els.iter().any(|e| e.text.as_deref() == Some("CAUTION")
                && e.text_color == Some(theme.token("fg.alt")))
        );
        let code = els
            .iter()
            .find(|e| e.key.as_deref() == Some("code-text"))
            .unwrap();
        assert!(
            code.target[2] > 240.0,
            "code must not wrap: {:?}",
            code.target
        );
        assert!(
            code.target[3] <= 41.0,
            "one source line stays one line: {:?}",
            code.target
        );
        assert!(
            els.iter().any(
                |e| e.key.as_deref() == Some("code-rule") && e.fill == theme.token("kind.code")
            )
        );
        assert!(
            els.iter()
                .any(|e| e.text.as_deref() == Some("image · alt · example.test"))
        );
        assert!(!els.iter().any(|e| e.role == "image"));
        assert!(!els.iter().any(|e| e.fill == theme.token("state.attn")));
    }
}

#[test]
fn native_full_diagram_keeps_natural_size_and_chart_hues_stay_out() {
    fn full(page: &Page, _: &mut Cx<Page>) -> El {
        render_content::render_mermaid_full(&page.source, page.theme, page.width)
    }
    let mut rt = Runtime::new(
        Page {
            source: "flowchart LR\nA[Alpha] --> B[Bravo] --> C[Charlie]".into(),
            theme: Theme::Ember,
            width: 100.0,
        },
        full,
        (1200.0, 800.0),
        Env::new(true, 1.0),
    );
    rt.frame(0.0);
    let elements = rt.elements();
    let figure = elements.iter().find(|e| e.role == "figure").unwrap();
    assert!(figure.target[2] > 100.0);
    assert!(figure.target[2] < 1200.0);
    for label in elements
        .iter()
        .filter(|e| e.text.is_some() && e.opacity > 0.0)
    {
        assert!(label.rect[0] >= figure.rect[0]);
        assert!(label.rect[0] + label.rect[2] <= figure.rect[0] + figure.rect[2] + 1.0);
        assert!(label.scale >= 1.0);
    }
    let chart = render("```mermaid\npie\n\"green\": 1\n```", Theme::Ember, 600.0);
    assert!(
        !chart
            .elements()
            .iter()
            .any(|e| e.role == "figure" && e.opacity > 0.0)
    );
    assert!(chart.elements().iter().any(|e| {
        e.text
            .as_deref()
            .is_some_and(|t| t.contains("cannot use Ember tokens"))
    }));
}

#[test]
fn footnotes_have_superscript_markers_and_an_end_note() {
    let rt = render("Note[^a].\n\n[^a]: Explanation", Theme::Ember, 600.0);
    let elements = rt.elements();
    assert!(elements.iter().any(|e| e.text.as_deref() == Some("Note¹.")));
    assert!(
        elements
            .iter()
            .any(|e| e.key.as_deref() == Some("footnote-a"))
    );
}

#[test]
fn native_prose_wraps_and_literal_html_remains_text() {
    let rt = render(
        "A paragraph with `src/main.rs` and more words to wrap safely.\n\n<script>bad()</script>",
        Theme::Ember,
        180.0,
    );
    let els = rt.elements();
    let prose = els
        .iter()
        .find(|e| {
            e.text
                .as_deref()
                .is_some_and(|t| t.starts_with("A paragraph"))
        })
        .unwrap();
    assert!(prose.target[3] > 21.0);
    assert!(prose.target[2] <= 180.1);
    assert!(els.iter().any(|e| {
        e.text
            .as_deref()
            .is_some_and(|t| t.contains("<script>bad()</script>"))
    }));
}

#[test]
fn native_diagrams_render_or_offer_full_view_without_tiny_labels() {
    let rt = render(
        "```mermaid\nflowchart TD\nA[Start] --> B[Done]\n```",
        Theme::Ember,
        600.0,
    );
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.role == "figure" && e.opacity > 0.0)
    );
    let wide = render(
        "```mermaid\nflowchart LR\nA[Alpha] --> B[Bravo] --> C[Charlie] --> D[Delta] --> E[Echo]\n```",
        Theme::Ember,
        100.0,
    );
    assert!(
        wide.elements()
            .iter()
            .any(|e| e.text.as_deref().is_some_and(|t| t.contains("full view")) && e.opacity > 0.0)
    );
}
