# Native content API

`render-content` renders untrusted document content as Rune elements. It imports no app, core, host, or wire types.

## Entry points

```rust
use render_content::{Document, Reference, Theme, render_markdown};

let body = render_markdown("# Review\n\nRead `src/main.rs`.", Theme::Ember, 600.0);

let references = [Reference::resolved("F16", "finding/16")];
let document = Document::parse("See F16.", &references);
let body = document.render(Theme::EmberLight, 600.0);
let original_bytes = document.source();
```

- `render_markdown(source, theme, width)` parses and renders one document.
- `render_markdown_with_references(source, references, theme, width)` also resolves exact indexed labels.
- `Document::parse` separates parsing from repeated view builds. Its public blocks and inline marks provide link targets, image URLs, footnote labels, and reference state for reader navigation.
- `Document::render` renders a parsed document with a value-based theme.
- `render_text(source, theme, width)` shows safe plain content without reference recognition.
- `render_source(source, language, theme, width)` shows a neutral, horizontally scrollable source frame.
- `render_mermaid_full(source, theme, width)` produces a natural-size diagram for the app's full-view scroll container.
- `safe_text(source)` converts invisible controls and identifier-shaped Greek, Cyrillic, or fullwidth lookalikes to visible escapes.
- `strip_mermaid_styles(source)` removes author styling before native diagram parsing.

`Theme` has `Ember`, `EmberSoft`, and `EmberLight` variants. `Theme::token` reads colours from `desktop/assets/design/ember-tokens.json`. It accepts names such as `fg.default`, `surface.code`, and `syntax.diff.plus`. Unknown token names are programming errors.

The width is the space available from the text column's left edge to the pane's right content edge. By default prose stops at 600 px; per-render options can change or remove that cap. Code and tables can grow farther right before they scroll.

## Source-position navigation

The additive public API is:

```rust
use std::ops::Range;
use render_content::Reference;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NavigationTarget {
    pub source: Range<usize>,
    pub kind: NavigationKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NavigationKind {
    Reference(Reference),
    Link(String),
    Footnote { label: String },
    Diagram { source: String },
}

// Document methods:
// pub fn targets(&self) -> &[NavigationTarget]
// pub fn target_at(&self, source_byte: usize) -> Option<&NavigationTarget>
```

Both navigation types are exported from `render_content`. Targets are inert values ordered by source position. Ranges are half-open UTF-8 **byte** coordinates into the unchanged `Document::source()`, not display characters or glyphs. `target_at` includes the start and excludes the end; positions outside any target return `None`.

- References cover only the exact host-indexed label bytes. Dangling entries retain their `target: None` and reason. Code, images, HTML events, metadata, and Markdown link children are excluded. Decoded entities and labels assembled across syntax do not become references.
- Markdown links cover their entire parser-reported syntax, including labelled reference-style links. The destination is the parser-resolved URL, admitted only by the existing HTTP/HTTPS/mail policy. Plain URL autolinks use the existing renderer recognizer on unchanged text events. Neither form executes anything.
- Footnote references cover the original `[^label]` invocation; their payload identifies the definition. Definitions themselves are not navigation targets.
- Mermaid targets cover the parser-reported fenced block (opening/closing fences included; the closing fence's trailing newline is excluded). Their payload retains original body bytes, including CRLF, source escapes and controls, without display sanitization or style stripping. Markdown container prefixes are not part of the diagram body. Unterminated fences retain their available body.

Candidates come from the same bounded offset-event stream used for rendering, before recursive tree construction. The 64-tag depth-limit literal fallback has **no targets**, and omitted lines beyond the display cap have none. Original source is always retained in full. No top-level block-range or exact glyph mapping API is provided: rendered footnotes are reordered and display text can expand or contract. The host owns hit testing, destination confirmation, reference resolution actions, and footnote/diagram navigation.

## Per-render presentation

`RenderOptions` is exported with public fields `mono_prose: bool`,
`prose_measure: Option<f32>`, and `mermaid_source: bool`. Its default is
`false / Some(600.0) / false`.

```rust
use render_content::{Document, RenderOptions, Theme, render_text_with_options};

let options = RenderOptions {
    mono_prose: true,
    prose_measure: None,
    mermaid_source: true,
};
let document = Document::parse("# Heading\n\nRead this.", &[]);
let body = document.render_with_options(Theme::Ember, 900.0, options);
let plain = render_text_with_options("Plain content", Theme::Ember, 900.0, options);
```

Mono prose selects Iosevka instead of Iosevka Etoile, preserving prose sizes,
weights, and colours. Inline code and references retain their existing mono
styles. Nested blocks and table measurement use the selected family; tables
retain the same spans and pill metrics as their rendered cells.
The prose cap is limited by available width; `None` uses all available width.
Finite caps below 20 px are clamped to 20 px; nonfinite caps use available width.
Figures, code, and tables still receive the supplied available width.
Mermaid source mode uses the neutral code frame instead of rendering a graph.
Options are per call, with no mutable global settings, and do not change source
bytes, navigation targets, display safety, or depth limits.
`Document::render` and `render_text` delegate to these APIs with defaults.

## Rendering boundary

Pulldown-cmark provides CommonMark parsing, tables, tasks, strikethrough, footnotes, alerts, and YAML frontmatter. The content crate supplies native blocks because rune-kit's Markdown API cannot replace its paragraph and code-block renderers. Rune owns text layout and pills. Rune-kit's cached scanners own syntax highlighting. No toolkit code is forked.

HTML stays text. Images never load. Links have no callbacks and cannot execute commands. Only HTTP, HTTPS, and mail links receive external-link styling. `Reference` values belong to the document's host-provided index. Code and links never acquire reference styling. Entity-decoded labels and labels assembled across Markdown syntax do not match original source labels.

Display text escapes controls before reaching Rune. `Document::source()` retains the original bytes for source-yank commands. Selection copies displayed text, including visible escapes. The display caps source at 2,000 lines and reports the omitted count. Markdown is limited to 64 simultaneously open parser tags (including inline tags and list/item tags). If a 65th tag opens, the displayed document becomes a neutral, horizontally scrollable literal source frame; original source bytes and the line-omission count are preserved. The check runs on the flat event stream before any recursive content tree is built, preventing the reproduced stack abort from 5,000 nested block quotes in one approximately 10 KB line.

The app owns font registration, external-link confirmation, reader commands, frontmatter expansion, footnote jumps, reference navigation, and full-view pan and zoom. The library installs no app-state handlers. The default frontmatter view is collapsed. An app can render its `Block::Frontmatter::source` through `render_source` when expanded.

## Mermaid limits at the pin

Flowcharts, sequence, state, class, entity-relationship, block, and requirement diagrams use Ember tokens. The native layout is measured through Rune's layout-read API. Inline diagrams fit only when the smallest label remains at least 12 px. Wider diagrams show an open-full-view indication. Measurement elements are invisible, inert, and excluded from accessibility.

Chart types, mindmaps, timelines, journeys, Git graphs, and C4 diagrams currently show source. The pinned toolkit gives those renderers colours outside `DiagramStyle`, so passing Ember tokens cannot enforce the content-colour boundary.

The toolkit's lenient parser supplies no diagnostic line or column. Unsupported or unparseable diagrams retain their source and explain that limitation. It can also ignore unsupported statements inside an otherwise supported diagram.

## Verification and remaining layout work

The tests cover safety, exact references, Markdown structure, all three token variants, and native Rune layout. Regression coverage includes a subprocess exercising 5,000 nested quotes, native Mermaid label colours after escaped separators, bundled-font AccessKit table lines, and six-level list content bounds. List indentation stops after four levels (or earlier when less than 20 px would remain); further markers sit above their content instead of consuming more horizontal space. Table sizing shares the rendered spans and pill ranges, including the pinned Rune iconless-pill padding/margins, and scrolls when a minimum cell width cannot fit. Native checks include heading rules, alert colours, image placeholders, unwrapped code, prose wrapping, superscript footnotes, and diagram fit or full view.

```sh
cd desktop
mise exec rust@1.99.1 -- cargo test -p render-content
mise exec rust@1.99.1 -- cargo clippy -p render-content --all-targets -- -D warnings
mise exec rust@1.99.1 -- cargo fmt -p render-content --check
```

These are headless Runtime checks, not screenshot parity or a full application acceptance run. Pixel-level table layout, atomic-pill line boundaries, and every diagram label box still need the SC-04 reading checks. Overflow has Rune's dynamic fade and a right-edge rule and caret. A corresponding left-edge rule and caret after horizontal scrolling remain app integration work.

Parsing currently starts from the beginning of the document. Block keys remain stable for appended trailing content, but this crate does not implement the kit's incremental streaming cache.
