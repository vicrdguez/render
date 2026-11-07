use render_content::{Block, Document, Reference, RenderOptions, Theme};
use rune::{Cx, El, Env, Runtime, col};
use std::ops::Range;

fn ranges(doc: &Document) -> Vec<Range<usize>> {
    assert_eq!(doc.source_blocks().len(), doc.blocks.len());
    doc.source_blocks()
        .iter()
        .map(|b| b.source.clone())
        .collect()
}

#[test]
fn repeated_paragraphs_keep_original_utf8_crlf_and_escape_ranges() {
    let source = "é \\* &amp;\r\n\r\né \\* &amp;\r\n";
    let doc = Document::parse(source, &[]);
    assert_eq!(ranges(&doc), [0..13, 15..28]);
    assert_eq!(doc.source(), source);
    assert_eq!(doc.plain_text(), "é * &\né * &");
}

#[test]
fn parser_blocks_include_containers_and_syntax_not_reference_definitions() {
    let source = "# H\n\n- a\n- b\n\n```rs\nx\n```\n\n| h |\n|---|\n| v |\n\n> q\n\n---\n\n[x]: https://example.test\n";
    let doc = Document::parse(source, &[]);
    assert_eq!(ranges(&doc), [0..4, 5..14, 14..25, 27..45, 46..50, 51..55]);
    assert!(matches!(doc.blocks[1], Block::List { .. }));
    assert!(matches!(doc.blocks[2], Block::Code { .. }));
    assert!(matches!(doc.blocks[3], Block::Table { .. }));
}

#[test]
fn footnote_ranges_move_with_definitions_in_reference_order() {
    let doc = Document::parse("[^a]: Alpha\n\n[^b]: Beta\n\nB[^b] A[^a].\n", &[]);
    assert_eq!(ranges(&doc), [25..38, 13..25, 0..13]);
    assert!(matches!(&doc.blocks[1], Block::Footnote { label, number: 1, .. } if label == "b"));
    assert!(matches!(&doc.blocks[2], Block::Footnote { label, number: 2, .. } if label == "a"));
}

#[test]
fn omitted_lines_have_no_blocks_and_depth_fallback_covers_only_shown_bytes() {
    let shown = "x\n\n".repeat(1000);
    let doc = Document::parse(&format!("{shown}hidden"), &[]);
    assert_eq!(doc.truncated_lines, 1);
    assert_eq!(doc.source_blocks().len(), 1000);
    assert_eq!(doc.source_blocks().last().unwrap().source, 2997..2999);
    let shown = format!("{}deep\n{}", "> ".repeat(65), "\n".repeat(1999));
    let doc = Document::parse(&format!("{shown}hidden"), &[]);
    assert_eq!(ranges(&doc).len(), 1);
    assert_eq!(doc.source_blocks()[0].source, 0..shown.len());
    assert_eq!(doc.truncated_lines, 1);
    assert!(doc.targets().is_empty());
    assert!(Document::parse("\n\n", &[]).source_blocks().is_empty());
}

struct Page {
    doc: Document,
    separate: bool,
    options: RenderOptions,
    theme: Theme,
}
fn view(p: &Page, _: &mut Cx<Page>) -> El {
    if p.separate {
        col().gap(12.0).w(240.0).selection_group(true).children(
            (0..p.doc.source_blocks().len()).map(|i| {
                p.doc
                    .render_block_with_options(i, p.theme, 240.0, p.options)
            }),
        )
    } else {
        p.doc.render_with_options(p.theme, 240.0, p.options)
    }
}
fn render(separate: bool, options: RenderOptions, theme: Theme) -> Runtime<Page> {
    let fonts: &[&'static [u8]] = &[
        include_bytes!("../../../assets/fonts/Iosevka-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Regular.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-SemiBold.ttf"),
        include_bytes!("../../../assets/fonts/IosevkaEtoile-Bold.ttf"),
    ];
    let mut rt = Runtime::with_text(
        Page {
            doc: Document::parse(
                "# Heading\n\nF16 [link][id] B[^b] A[^a].\n\n- outer\n  - inner\n\n| h |\n|---|\n| `code` |\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n<script>inert</script>\n\n[^a]: Alpha\n\n[^b]: Beta\n\n[id]: https://example.test",
                &[Reference::resolved("F16", "finding/16")],
            ),
            separate,
            options,
            theme,
        },
        view,
        (240.0, 2000.0),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(fonts, ("Iosevka Etoile", "Iosevka")),
    );
    rt.frame(0.0);
    rt.frame(0.1);
    rt
}

#[test]
fn individual_native_blocks_preserve_document_styles_layout_and_global_context() {
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        for mono in [false, true] {
            let options = RenderOptions {
                mono_prose: mono,
                prose_measure: Some(180.0),
                mermaid_source: true,
            };
            let whole = render(false, options, theme);
            let separate = render(true, options, theme);
            let appearance = |rt: &Runtime<Page>| {
                rt.elements()
                    .into_iter()
                    .filter(|e| e.text.is_some())
                    .map(|e| (e.text, e.target, e.text_color, e.fill, e.role, e.level))
                    .collect::<Vec<_>>()
            };
            assert_eq!(appearance(&whole), appearance(&separate));
            assert!(
                separate
                    .elements()
                    .iter()
                    .any(|e| e.key.as_deref() == Some("md.block.0"))
            );
            assert!(
                separate
                    .elements()
                    .iter()
                    .any(|e| e.text.as_deref() == Some("F16 link B¹ A²."))
            );
            assert!(
                !separate
                    .elements()
                    .iter()
                    .any(|e| e.fill == theme.token("state.attn"))
            );
        }
    }
}
