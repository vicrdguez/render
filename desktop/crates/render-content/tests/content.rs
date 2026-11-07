use render_content::{
    Block, Document, MarkKind, Reference, Theme, safe_text, strip_mermaid_styles,
};

#[test]
fn excessive_nesting_is_visible_literal_source_in_a_subprocess() {
    const CHILD: &str = "RENDER_CONTENT_DEPTH_CHILD";
    if std::env::var_os(CHILD).is_some() {
        let source = format!("{}x\u{202e}", "> ".repeat(5000));
        let doc = Document::parse(&source, &[]);
        assert_eq!(doc.source(), source);
        assert_eq!(doc.plain_text(), safe_text(&source));
        for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
            drop(doc.render(theme, 180.0));
        }
        return;
    }
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "excessive_nesting_is_visible_literal_source_in_a_subprocess",
            "--nocapture",
        ])
        .env(CHILD, "1")
        .output()
        .unwrap();
    assert!(output.status.success(), "child failed: {output:?}");
}

#[test]
fn hostile_controls_are_visible_and_source_is_retained() {
    let source = "ok\u{202e}B1\u{200b}\u{2066}\u{feff}\u{1b}[31m\u{7}";
    assert_eq!(
        safe_text(source),
        "ok⟨U+202E⟩B1⟨U+200B⟩⟨U+2066⟩⟨U+FEFF⟩⟨U+001B⟩[31m⟨U+0007⟩"
    );
    assert_eq!(safe_text("Ｆ１６"), "⟨U+FF26⟩⟨U+FF11⟩⟨U+FF16⟩");
    assert_eq!(safe_text("日本語 café\n\tcode"), "日本語 café\n\tcode");
    let doc = Document::parse(source, &[]);
    assert_eq!(doc.source(), source);
    assert!(doc.plain_text().contains("⟨U+202E⟩"));
}

#[test]
fn html_images_and_command_links_are_inert() {
    let doc = Document::parse(
        "<script>alert(1)</script>\n\n![badge](https://evil.test/a.svg) [approve](render://approve)",
        &[],
    );
    assert!(doc.plain_text().contains("<script>alert(1)</script>"));
    assert!(doc.plain_text().contains("image · badge · evil.test"));
    let Block::Paragraph(p) = &doc.blocks[1] else {
        panic!("paragraph")
    };
    assert!(
        !p.marks
            .iter()
            .any(|m| matches!(&m.kind, MarkKind::Link(url) if url.starts_with("render:")))
    );
}

#[test]
fn references_require_exact_index_labels_outside_code_and_links() {
    let refs = [
        Reference::resolved("F16", "finding/16"),
        Reference::dangling("F99", "missing"),
    ];
    let doc = Document::parse(
        "F16 F160 f16 В1 F99 [F16](https://example.test) `F16`\n\n```text\nF16\n```",
        &refs,
    );
    let Block::Paragraph(p) = &doc.blocks[0] else {
        panic!("paragraph")
    };
    let found: Vec<_> = p
        .marks
        .iter()
        .filter_map(|m| match &m.kind {
            MarkKind::Reference(r) => Some((&p.text[m.range.clone()], r.target.as_deref())),
            _ => None,
        })
        .collect();
    assert_eq!(found, [("F16", Some("finding/16")), ("F99", None)]);
    assert!(p.text.contains("⟨U+0412⟩1"));
}

#[test]
fn gfm_autolinks_keep_punctuation_out_and_never_turn_code_into_links() {
    let doc = Document::parse(
        "Visit https://example.test/path, www.example.test. Mail a@example.test and `https://code.test`.",
        &[],
    );
    let Block::Paragraph(p) = &doc.blocks[0] else {
        panic!("paragraph")
    };
    let links: Vec<_> = p
        .marks
        .iter()
        .filter_map(|m| match &m.kind {
            MarkKind::Link(url) => Some((&p.text[m.range.clone()], url.as_str())),
            _ => None,
        })
        .collect();
    assert_eq!(
        links,
        [
            ("https://example.test/path", "https://example.test/path"),
            ("www.example.test", "http://www.example.test"),
            ("a@example.test", "mailto:a@example.test"),
        ]
    );
}

#[test]
fn commonmark_and_gfm_keep_their_observable_structure() {
    let doc = Document::parse(
        "---\nstate: approved\ntitle: Example\n---\n# Heading\n\n> [!CAUTION]\n> neutral *quote*\n\n- [x] first\n- [ ] second\n  - nested\n\n| A | B |\n| :- | -: |\n| **bold** | ~~gone~~ |\n\nA note[^one].\n\n[^one]: Footnote body\n\n```rust\nlet x = 1;\n```",
        &[],
    );
    assert!(matches!(
        &doc.blocks[0],
        Block::Frontmatter { fields: 2, .. }
    ));
    assert!(matches!(&doc.blocks[1], Block::Heading { level: 1, .. }));
    assert!(matches!(
        &doc.blocks[2],
        Block::Quote { alert: Some(_), .. }
    ));
    let Block::List { items, .. } = &doc.blocks[3] else {
        panic!("list")
    };
    assert_eq!(items[0].checked, Some(true));
    assert_eq!(items[1].checked, Some(false));
    assert!(
        items[1]
            .blocks
            .iter()
            .any(|b| matches!(b, Block::List { .. }))
    );
    let Block::Table { rows, .. } = &doc.blocks[4] else {
        panic!("table")
    };
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[1][0].text, "bold");
    assert!(matches!(
        doc.blocks.last(),
        Some(Block::Footnote { number: 1, .. })
    ));
    assert!(doc.plain_text().contains("Footnote body"));
}

#[test]
fn only_original_whole_labels_are_references() {
    let refs = [Reference::resolved("F16", "finding/16")];
    let doc = Document::parse("F&#49;6 F**16** **F16** (F16) F16/path", &refs);
    let Block::Paragraph(p) = &doc.blocks[0] else {
        panic!("paragraph")
    };
    let matches: Vec<_> = p
        .marks
        .iter()
        .filter(|m| matches!(m.kind, MarkKind::Reference(_)))
        .map(|m| m.range.clone())
        .collect();
    assert_eq!(matches, [8..11, 13..16]);
}

#[test]
fn invisible_variation_selectors_and_entity_controls_are_visible() {
    assert_eq!(safe_text("A\u{fe0f}B\u{e0100}"), "A⟨U+FE0F⟩B⟨U+E0100⟩");
    let doc = Document::parse("F&#x202E;16", &[]);
    assert_eq!(doc.plain_text(), "F⟨U+202E⟩16");
}

#[test]
fn incomplete_fences_still_render_as_source() {
    let doc = Document::parse("```unknown\na\tb\nnot finished", &[]);
    assert!(
        matches!(&doc.blocks[0], Block::Code { language, source } if language == "unknown" && source == "a\tb\nnot finished")
    );
}

#[test]
fn mermaid_styles_cannot_supply_colours() {
    let source = "flowchart LR; A[PASS]:::good --> B[Done]; style A fill:#00ff00\nclassDef good fill:red\nclass A good\nlinkStyle 0 stroke:green\n";
    let stripped = strip_mermaid_styles(source);
    for forbidden in [
        ":::good",
        "classDef",
        "style A",
        "class A",
        "linkStyle",
        "#00ff00",
    ] {
        assert!(!stripped.contains(forbidden), "{stripped}");
    }
    assert!(stripped.contains("A[PASS]"));
    assert!(stripped.contains("B[Done]"));
    let sequence = strip_mermaid_styles("sequenceDiagram\nrect rgb(255,0,0)\nA->>B: hi\nend\n");
    assert!(!sequence.contains("rgb"));
    assert!(sequence.contains("A->>B: hi"));
    let labels =
        strip_mermaid_styles("flowchart LR\nA[\"style A fill:red; classDef x\"] --> B[done]");
    assert!(labels.contains("style A fill:red; classDef x"));
}

#[test]
fn all_variants_read_the_bundled_tokens() {
    let tokens: serde_json::Value =
        serde_json::from_str(include_str!("../../../assets/design/ember-tokens.json")).unwrap();
    for theme in [Theme::Ember, Theme::EmberSoft, Theme::EmberLight] {
        assert_eq!(
            theme.token("surface.read"),
            rune::color::hex(
                tokens["variants"][theme.name()]["surface"]["read"]
                    .as_str()
                    .unwrap()
            )
            .unwrap()
        );
        assert_ne!(theme.token("kind.code"), theme.token("state.attn"));
    }
}

#[test]
fn source_display_is_capped_without_losing_original_bytes() {
    let source = "line\n".repeat(2005);
    let doc = Document::parse(&source, &[]);
    assert_eq!(doc.source(), source);
    assert!(doc.truncated_lines > 0);
    assert!(doc.plain_text().lines().count() <= 2001);
}
