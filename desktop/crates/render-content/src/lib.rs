mod diagram;
mod document;
mod render;
mod safety;
mod theme;

pub use diagram::{render_mermaid_full, strip_mermaid_styles};
pub use document::{
    Alignment, Block, Document, InlineText, ListItem, Mark, MarkKind, NavigationKind,
    NavigationTarget, Reference, SourceBlock,
};
pub use render::{
    RenderOptions, render_markdown, render_markdown_with_references, render_source, render_text,
    render_text_with_options,
};
pub use safety::safe_text;
pub use theme::Theme;
