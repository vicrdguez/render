use render_content::{Document, NavigationKind, Reference};

#[test]
fn repeated_labels_and_links_have_distinct_original_ranges() {
    let refs = [
        Reference::resolved("F16", "finding/16"),
        Reference::dangling("F99", "missing"),
    ];
    let source = "F16 F16 F99 [F16](https://a.test) [F16][site]\n\n[site]: https://a.test\n";
    let doc = Document::parse(source, &refs);
    let targets = doc.targets();
    assert_eq!(targets.len(), 5);
    assert_eq!(targets[0].source, 0..3);
    assert_eq!(targets[1].source, 4..7);
    assert_eq!(targets[2].source, 8..11);
    assert!(matches!(&targets[2].kind, NavigationKind::Reference(r) if r.target.is_none()));
    for target in &targets[3..] {
        assert_eq!(target.kind, NavigationKind::Link("https://a.test".into()));
    }
    assert_eq!(&source[targets[3].source.clone()], "[F16](https://a.test)");
    assert_eq!(&source[targets[4].source.clone()], "[F16][site]");
    for target in targets {
        assert_eq!(doc.target_at(target.source.start), Some(target));
        assert_eq!(doc.target_at(target.source.end - 1), Some(target));
    }
    assert!(doc.target_at(3).is_none());
    assert!(doc.target_at(source.len()).is_none());
    assert!(doc.target_at(usize::MAX).is_none());
}

#[test]
fn code_images_html_unsafe_links_and_spoofed_labels_are_not_references() {
    let source = "`F16 https://a.test` ![F16](https://a.test) [F16](render://run) <i title=\"F16\"></i> F&#49;6 F**16** Ｆ１６ F160 F16/path\n\n```text\nF16 https://a.test\n```\n\n<div>F16 https://a.test</div>\n";
    assert!(
        Document::parse(source, &[Reference::resolved("F16", "f")])
            .targets()
            .is_empty()
    );
}

#[test]
fn urls_use_existing_link_policy_not_arbitrary_literal_matches() {
    let source = "[label](https://a.test) https://a.test, `https://a.test` [bad](javascript:run) <mailto:a@b.test>";
    let doc = Document::parse(source, &[]);
    let slices: Vec<_> = doc
        .targets()
        .iter()
        .map(|t| &source[t.source.clone()])
        .collect();
    assert_eq!(
        slices,
        [
            "[label](https://a.test)",
            "https://a.test",
            "<mailto:a@b.test>"
        ]
    );
}

#[test]
fn utf8_escapes_crlf_and_footnotes_keep_original_byte_coordinates() {
    let source = "é \\* F16\r\n\r\nF16 [^n]\r\n\r\n[^n]: café\r\n";
    let doc = Document::parse(source, &[Reference::resolved("F16", "f")]);
    assert_eq!(doc.source(), source);
    let slices: Vec<_> = doc
        .targets()
        .iter()
        .map(|t| &source[t.source.clone()])
        .collect();
    assert_eq!(slices, ["F16", "F16", "[^n]"]);
    assert_eq!(doc.targets()[0].source, 6..9);
    assert!(matches!(&doc.targets()[2].kind, NavigationKind::Footnote { label } if label == "n"));
}

#[test]
fn mermaid_target_retains_fence_range_and_exact_unsanitized_body() {
    let source = "before\r\n\r\n```mermaid\r\nflowchart LR\r\nA[é\\*\u{202e}] --> B\r\n```\r\n";
    let doc = Document::parse(source, &[]);
    assert_eq!(doc.targets().len(), 1);
    let target = &doc.targets()[0];
    assert_eq!(
        &source[target.source.clone()],
        "```mermaid\r\nflowchart LR\r\nA[é\\*\u{202e}] --> B\r\n```"
    );
    assert_eq!(
        target.kind,
        NavigationKind::Diagram {
            source: "flowchart LR\r\nA[é\\*\u{202e}] --> B\r\n".into()
        }
    );
    let unfinished = Document::parse("```mermaid\nflowchart LR", &[]);
    assert_eq!(
        unfinished.targets()[0].kind,
        NavigationKind::Diagram {
            source: "flowchart LR".into()
        }
    );
}

#[test]
fn literal_depth_fallback_and_omitted_lines_have_no_targets() {
    let source = format!("F16 [link](https://a.test)\n\n{}F16", "> ".repeat(5000));
    let doc = Document::parse(&source, &[Reference::resolved("F16", "f")]);
    assert_eq!(doc.source(), source);
    assert!(doc.targets().is_empty());
    let source = format!("{}F16", "line\n".repeat(2000));
    assert!(
        Document::parse(&source, &[Reference::resolved("F16", "f")])
            .targets()
            .is_empty()
    );
}
