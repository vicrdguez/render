use crate::safe_text;
use crate::safety::{capped, external_url, image_host};
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag};
use std::{collections::HashMap, ops::Range};

pub use pulldown_cmark::Alignment;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub label: String,
    pub target: Option<String>,
    pub reason: Option<String>,
}

impl Reference {
    pub fn resolved(label: impl Into<String>, target: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            target: Some(target.into()),
            reason: None,
        }
    }
    pub fn dangling(label: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            target: None,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MarkKind {
    Strong,
    Emphasis,
    Strike,
    Code,
    Link(String),
    Reference(Reference),
    Footnote { label: String, number: usize },
    Image { url: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mark {
    pub range: Range<usize>,
    pub kind: MarkKind,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InlineText {
    pub text: String,
    pub marks: Vec<Mark>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ListItem {
    pub checked: Option<bool>,
    pub blocks: Vec<Block>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Paragraph(InlineText),
    Heading {
        level: u8,
        content: InlineText,
    },
    Code {
        language: String,
        source: String,
    },
    Quote {
        alert: Option<String>,
        blocks: Vec<Block>,
    },
    List {
        start: Option<u64>,
        items: Vec<ListItem>,
    },
    Table {
        alignments: Vec<Alignment>,
        rows: Vec<Vec<InlineText>>,
    },
    Frontmatter {
        source: String,
        fields: usize,
    },
    Footnote {
        label: String,
        number: usize,
        blocks: Vec<Block>,
    },
    Rule,
}

/// An inert navigation candidate in original UTF-8 source byte coordinates.
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

/// Parsed content with no authority or transport types. Source bytes remain available for yank.
#[derive(Clone, Debug)]
pub struct Document {
    source: String,
    targets: Vec<NavigationTarget>,
    pub blocks: Vec<Block>,
    pub truncated_lines: usize,
}

impl Document {
    pub fn parse(source: &str, references: &[Reference]) -> Self {
        let (shown, truncated_lines) = capped(source);
        let options = Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_FOOTNOTES
            | Options::ENABLE_GFM
            | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
        // Bound parser events before constructing any recursive tree. A single 10 KB
        // line of 5,000 block quotes otherwise aborts even before rendering.
        const MAX_NESTING: usize = 64;
        let mut depth = 0usize;
        let mut events = Vec::new();
        for (event, range) in Parser::new_ext(shown, options).into_offset_iter() {
            match &event {
                Event::Start(_) => {
                    depth += 1;
                    if depth > MAX_NESTING {
                        return Self {
                            source: source.into(),
                            targets: Vec::new(),
                            blocks: vec![Block::Code {
                                language: String::new(),
                                source: shown.into(),
                            }],
                            truncated_lines,
                        };
                    }
                }
                Event::End(_) => depth = depth.saturating_sub(1),
                _ => {}
            }
            events.push((event.into_static(), range));
        }
        let targets = navigation_targets(shown, references, &events);
        let tree = nodes(&mut events.into_iter());
        let mut notes = HashMap::new();
        number_notes(&tree, &mut notes);
        let parser = Content {
            references,
            notes,
            source: shown,
        };
        let mut blocks = parser.blocks(&tree);
        let mut footnotes = Vec::new();
        blocks.retain(|block| {
            if matches!(block, Block::Footnote { .. }) {
                footnotes.push(block.clone());
                false
            } else {
                true
            }
        });
        footnotes.sort_by_key(|b| match b {
            Block::Footnote { number, .. } => *number,
            _ => 0,
        });
        blocks.extend(footnotes);
        Self {
            source: source.into(),
            targets,
            blocks,
            truncated_lines,
        }
    }

    pub fn source(&self) -> &str {
        &self.source
    }

    /// Inert candidates ordered by original source position, with half-open byte ranges.
    pub fn targets(&self) -> &[NavigationTarget] {
        &self.targets
    }

    /// Returns the candidate containing this original source byte (not a glyph offset).
    pub fn target_at(&self, source_byte: usize) -> Option<&NavigationTarget> {
        self.targets
            .iter()
            .find(|target| target.source.contains(&source_byte))
    }

    /// Visible text in reading order, useful for search and accessibility.
    pub fn plain_text(&self) -> String {
        fn walk(blocks: &[Block], out: &mut Vec<String>) {
            for block in blocks {
                match block {
                    Block::Paragraph(p) | Block::Heading { content: p, .. } => {
                        out.push(p.text.clone())
                    }
                    Block::Code { source, .. } => out.push(safe_text(source)),
                    Block::Quote { blocks, .. } | Block::Footnote { blocks, .. } => {
                        walk(blocks, out)
                    }
                    Block::List { items, .. } => {
                        for item in items {
                            walk(&item.blocks, out);
                        }
                    }
                    Block::Table { rows, .. } => {
                        for row in rows {
                            out.push(
                                row.iter()
                                    .map(|p| p.text.as_str())
                                    .collect::<Vec<_>>()
                                    .join(" | "),
                            );
                        }
                    }
                    Block::Frontmatter { fields, .. } => {
                        out.push(format!("frontmatter · {fields} fields"))
                    }
                    Block::Rule => {}
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.blocks, &mut out);
        out.join("\n")
    }
}

// Read only the already bounded parser stream. Suppressed groups cannot leak
// candidates from their children, even when their destination is unsafe.
fn navigation_targets(
    source: &str,
    references: &[Reference],
    events: &[(Event<'static>, Range<usize>)],
) -> Vec<NavigationTarget> {
    let content = Content {
        source,
        references,
        notes: HashMap::new(),
    };
    let mut targets = Vec::new();
    let mut suppressed = 0usize;
    let mut diagram: Option<(Range<usize>, String)> = None;
    for (event, range) in events {
        if suppressed > 0 {
            match event {
                Event::Start(_) => suppressed += 1,
                Event::End(_) => {
                    suppressed -= 1;
                    if suppressed == 0
                        && let Some((source, body)) = diagram.take()
                    {
                        targets.push(NavigationTarget {
                            source,
                            kind: NavigationKind::Diagram { source: body },
                        });
                    }
                }
                Event::Text(_) => {
                    if let Some((_, body)) = &mut diagram {
                        // Pulldown emits a separate LF event for CRLF and omits
                        // the CR from its range. Restore that original delimiter,
                        // without restoring blockquote/list container prefixes.
                        if source[range.clone()].starts_with('\n')
                            && range.start > 0
                            && source.as_bytes()[range.start - 1] == b'\r'
                        {
                            body.push('\r');
                        }
                        body.push_str(&source[range.clone()]);
                    }
                }
                _ => {}
            }
            continue;
        }
        match event {
            Event::Start(Tag::Link { dest_url, .. }) => {
                if external_url(dest_url) {
                    targets.push(NavigationTarget {
                        source: range.clone(),
                        kind: NavigationKind::Link(dest_url.to_string()),
                    });
                }
                suppressed = 1;
            }
            Event::Start(Tag::CodeBlock(kind)) => {
                if matches!(kind, CodeBlockKind::Fenced(info) if info.split_whitespace().next() == Some("mermaid"))
                {
                    diagram = Some((range.clone(), String::new()));
                }
                suppressed = 1;
            }
            Event::Start(Tag::Image { .. } | Tag::HtmlBlock | Tag::MetadataBlock(_)) => {
                suppressed = 1;
            }
            Event::FootnoteReference(label) => targets.push(NavigationTarget {
                source: range.clone(),
                kind: NavigationKind::Footnote {
                    label: label.to_string(),
                },
            }),
            Event::Text(text) if source.get(range.clone()) == Some(text.as_ref()) => {
                // Reuse rendering's recognition and URL policy only where the
                // parser and safe display retain the exact original bytes.
                let mut offset = range.start;
                for piece in text.split_inclusive(char::is_whitespace) {
                    if safe_text(piece) == piece {
                        let node = Node::Leaf(
                            Event::Text(piece.to_owned().into()),
                            offset..offset + piece.len(),
                        );
                        for mark in content.inline(&[node]).marks {
                            let kind = match mark.kind {
                                MarkKind::Reference(r) => NavigationKind::Reference(r),
                                MarkKind::Link(url) => NavigationKind::Link(url),
                                _ => continue,
                            };
                            targets.push(NavigationTarget {
                                source: offset + mark.range.start..offset + mark.range.end,
                                kind,
                            });
                        }
                    }
                    offset += piece.len();
                }
            }
            _ => {}
        }
    }
    targets.sort_by_key(|target| target.source.start);
    targets
}

#[derive(Debug)]
enum Node {
    Group(Tag<'static>, Vec<Node>),
    Leaf(Event<'static>, Range<usize>),
}

fn nodes(events: &mut impl Iterator<Item = (Event<'static>, Range<usize>)>) -> Vec<Node> {
    let mut result = Vec::new();
    while let Some((event, range)) = events.next() {
        match event {
            Event::Start(tag) => result.push(Node::Group(tag, nodes(events))),
            Event::End(_) => break,
            leaf => result.push(Node::Leaf(leaf, range)),
        }
    }
    result
}

fn number_notes(nodes: &[Node], notes: &mut HashMap<String, usize>) {
    for node in nodes {
        match node {
            Node::Leaf(Event::FootnoteReference(label), _) => {
                let n = notes.len() + 1;
                notes.entry(label.to_string()).or_insert(n);
            }
            Node::Group(_, children) => number_notes(children, notes),
            _ => {}
        }
    }
}

fn raw(nodes: &[Node]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            Node::Leaf(
                Event::Text(t) | Event::Code(t) | Event::Html(t) | Event::InlineHtml(t),
                _,
            ) => out.push_str(t),
            Node::Leaf(Event::SoftBreak | Event::HardBreak, _) => out.push('\n'),
            Node::Group(_, children) => out.push_str(&raw(children)),
            _ => {}
        }
    }
    out
}

struct Content<'a> {
    source: &'a str,
    references: &'a [Reference],
    notes: HashMap<String, usize>,
}

impl Content<'_> {
    fn blocks(&self, nodes: &[Node]) -> Vec<Block> {
        let mut result = Vec::new();
        let mut loose = Vec::new();
        for node in nodes {
            let block = match node {
                Node::Group(Tag::Paragraph, children) => {
                    Some(Block::Paragraph(self.inline(children)))
                }
                Node::Group(Tag::Heading { level, .. }, children) => Some(Block::Heading {
                    level: *level as u8,
                    content: self.inline(children),
                }),
                Node::Group(Tag::CodeBlock(kind), children) => {
                    let language = match kind {
                        CodeBlockKind::Fenced(info) => info.split_whitespace().next().unwrap_or(""),
                        _ => "",
                    };
                    Some(Block::Code {
                        language: safe_text(language),
                        source: raw(children),
                    })
                }
                Node::Group(Tag::BlockQuote(kind), children) => Some(Block::Quote {
                    alert: kind.map(|k| format!("{k:?}").to_uppercase()),
                    blocks: self.blocks(children),
                }),
                Node::Group(Tag::List(start), children) => Some(Block::List {
                    start: *start,
                    items: children
                        .iter()
                        .filter_map(|node| match node {
                            Node::Group(Tag::Item, children) => Some(ListItem {
                                checked: task(children),
                                blocks: self.blocks(children),
                            }),
                            _ => None,
                        })
                        .collect(),
                }),
                Node::Group(Tag::Table(alignments), children) => Some(Block::Table {
                    alignments: alignments.clone(),
                    rows: children
                        .iter()
                        .filter_map(|node| match node {
                            Node::Group(Tag::TableHead | Tag::TableRow, cells) => Some(
                                cells
                                    .iter()
                                    .filter_map(|cell| match cell {
                                        Node::Group(Tag::TableCell, text) => {
                                            Some(self.inline(text))
                                        }
                                        _ => None,
                                    })
                                    .collect(),
                            ),
                            _ => None,
                        })
                        .collect(),
                }),
                Node::Group(Tag::MetadataBlock(_), children) => {
                    let source = raw(children);
                    let fields = source
                        .lines()
                        .filter(|line| {
                            !line.starts_with(char::is_whitespace)
                                && !line.trim_start().starts_with('#')
                                && line.contains(':')
                        })
                        .count();
                    Some(Block::Frontmatter { source, fields })
                }
                Node::Group(Tag::FootnoteDefinition(label), children) => Some(Block::Footnote {
                    label: label.to_string(),
                    number: self.notes.get(label.as_ref()).copied().unwrap_or(0),
                    blocks: self.blocks(children),
                }),
                Node::Group(Tag::HtmlBlock, children) => Some(Block::Paragraph(InlineText {
                    text: safe_text(&raw(children)),
                    marks: Vec::new(),
                })),
                Node::Leaf(Event::Rule, _) => Some(Block::Rule),
                Node::Leaf(Event::TaskListMarker(_), _) => None,
                _ => {
                    loose.push(node);
                    continue;
                }
            };
            if !loose.is_empty() {
                result.push(Block::Paragraph(self.inline_refs(&loose)));
                loose.clear();
            }
            if let Some(block) = block {
                result.push(block);
            }
        }
        if !loose.is_empty() {
            result.push(Block::Paragraph(self.inline_refs(&loose)));
        }
        result
    }

    fn inline(&self, nodes: &[Node]) -> InlineText {
        self.inline_refs(&nodes.iter().collect::<Vec<_>>())
    }

    fn inline_refs(&self, nodes: &[&Node]) -> InlineText {
        let mut text = InlineText::default();
        let mut eligible = Vec::new();
        for node in nodes {
            self.append(node, &mut text, &mut eligible);
        }
        self.references(&mut text, &eligible);
        text
    }

    fn append(&self, node: &Node, out: &mut InlineText, eligible: &mut Vec<Range<usize>>) {
        let start = out.text.len();
        let kind = match node {
            Node::Leaf(Event::Text(t), range) => {
                if self.source.get(range.clone()) == Some(t.as_ref()) {
                    let mut run_start = start;
                    for piece in t.split_inclusive(char::is_whitespace) {
                        let shown = safe_text(piece);
                        if shown != piece {
                            if run_start < out.text.len() {
                                eligible.push(run_start..out.text.len());
                            }
                            out.text.push_str(&shown);
                            run_start = out.text.len();
                        } else {
                            out.text.push_str(piece);
                        }
                    }
                    if run_start < out.text.len() {
                        eligible.push(run_start..out.text.len());
                    }
                } else {
                    out.text.push_str(&safe_text(t));
                }
                None
            }
            Node::Leaf(Event::Html(t) | Event::InlineHtml(t), _) => {
                out.text.push_str(&safe_text(t));
                None
            }
            Node::Leaf(Event::Code(t), _) => {
                out.text.push_str(&safe_text(t));
                Some(MarkKind::Code)
            }
            Node::Leaf(Event::SoftBreak, _) => {
                out.text.push(' ');
                None
            }
            Node::Leaf(Event::HardBreak, _) => {
                out.text.push('\n');
                None
            }
            Node::Leaf(Event::FootnoteReference(label), _) => {
                let number = self.notes.get(label.as_ref()).copied().unwrap_or(0);
                const SUPERSCRIPT: [char; 10] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
                out.text.extend(
                    number
                        .to_string()
                        .bytes()
                        .map(|digit| SUPERSCRIPT[(digit - b'0') as usize]),
                );
                Some(MarkKind::Footnote {
                    label: label.to_string(),
                    number,
                })
            }
            Node::Group(Tag::Image { dest_url, .. }, children) => {
                out.text.push_str(&format!(
                    "image · {} · {}",
                    safe_text(&raw(children)),
                    image_host(dest_url)
                ));
                Some(MarkKind::Image {
                    url: dest_url.to_string(),
                })
            }
            Node::Group(tag, children) => {
                for child in children {
                    self.append(child, out, eligible);
                }
                match tag {
                    Tag::Strong => Some(MarkKind::Strong),
                    Tag::Emphasis => Some(MarkKind::Emphasis),
                    Tag::Strikethrough => Some(MarkKind::Strike),
                    Tag::Link { dest_url, .. } => Some(MarkKind::Link(if external_url(dest_url) {
                        dest_url.to_string()
                    } else {
                        String::new()
                    })),
                    _ => None,
                }
            }
            _ => None,
        };
        if let Some(kind) = kind {
            out.marks.push(Mark {
                range: start..out.text.len(),
                kind,
            });
        }
    }

    fn references(&self, text: &mut InlineText, eligible: &[Range<usize>]) {
        for reference in self.references {
            if reference.label.is_empty()
                || !reference
                    .label
                    .chars()
                    .all(|c| c.is_ascii() || c == '·' || c == '§')
            {
                continue;
            }
            for (start, _) in text.text.match_indices(&reference.label) {
                let end = start + reference.label.len();
                if !eligible
                    .iter()
                    .any(|range| range.start <= start && end <= range.end)
                {
                    continue;
                }
                if text.text[..start]
                    .chars()
                    .next_back()
                    .is_some_and(token_char)
                    || text.text[end..].chars().next().is_some_and(token_char)
                {
                    continue;
                }
                if text.marks.iter().any(|m| {
                    m.range.start < end
                        && start < m.range.end
                        && matches!(
                            m.kind,
                            MarkKind::Code
                                | MarkKind::Link(_)
                                | MarkKind::Reference(_)
                                | MarkKind::Image { .. }
                                | MarkKind::Footnote { .. }
                        )
                }) {
                    continue;
                }
                text.marks.push(Mark {
                    range: start..end,
                    kind: MarkKind::Reference(reference.clone()),
                });
            }
        }
        let existing = text.marks.clone();
        for (offset, word) in word_ranges(&text.text) {
            let left = word.trim_start_matches(['(', '[', '<']);
            let start = offset + word.len() - left.len();
            let mut label =
                left.trim_end_matches(['.', ',', '!', '?', ':', ';', '"', '\'', ']', '>']);
            while label.ends_with(')') && label.matches(')').count() > label.matches('(').count() {
                label = &label[..label.len() - 1];
            }
            let Some(url) = autolink(label) else { continue };
            if !existing.iter().any(|m| {
                m.range.start < start + label.len()
                    && start < m.range.end
                    && !matches!(
                        m.kind,
                        MarkKind::Strong | MarkKind::Emphasis | MarkKind::Strike
                    )
            }) {
                text.marks.push(Mark {
                    range: start..start + label.len(),
                    kind: MarkKind::Link(url),
                });
            }
        }
    }
}

fn autolink(label: &str) -> Option<String> {
    if external_url(label) {
        return Some(label.into());
    }
    let domain = |s: &str| {
        s.contains('.')
            && s.split('.').all(|part| {
                !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            })
    };
    if let Some(rest) = label.strip_prefix("www.")
        && domain(rest.split('/').next().unwrap_or(rest))
    {
        return Some(format!("http://{label}"));
    }
    if let Some((local, host)) = label.split_once('@')
        && !local.is_empty()
        && local
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-'))
        && domain(host)
    {
        return Some(format!("mailto:{label}"));
    }
    None
}

fn token_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '/' | '-' | '·' | '§')
}

pub(crate) fn word_ranges(text: &str) -> Vec<(usize, &str)> {
    let mut offset = 0;
    text.split_inclusive(char::is_whitespace)
        .filter_map(|piece| {
            let start = offset;
            offset += piece.len();
            let word = piece.trim_end_matches(char::is_whitespace);
            (!word.is_empty()).then_some((start, word))
        })
        .collect()
}

fn task(nodes: &[Node]) -> Option<bool> {
    nodes.iter().find_map(|node| match node {
        Node::Leaf(Event::TaskListMarker(value), _) => Some(*value),
        Node::Group(Tag::Paragraph, children) => task(children),
        _ => None,
    })
}
