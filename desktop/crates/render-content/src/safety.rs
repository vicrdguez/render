use std::fmt::Write;

pub const LINE_LIMIT: usize = 2000;

/// Display untrusted text literally. Newlines and tabs remain structural whitespace.
/// This is a display conversion only. Keep the original source for source-copy actions.
pub fn safe_text(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    for word in source.split_inclusive(char::is_whitespace) {
        let id_like = word.chars().any(char::is_numeric);
        for c in word.chars() {
            let confusable_id = id_like && matches!(c as u32, 0x370..=0x52f | 0xff10..=0xff5a);
            if invisible(c) || confusable_id {
                let _ = write!(out, "⟨U+{:04X}⟩", c as u32);
            } else {
                out.push(c);
            }
        }
    }
    out
}

fn invisible(c: char) -> bool {
    (c.is_control() && c != '\n' && c != '\t')
        || matches!(c as u32,
        0xad | 0x34f | 0x61c | 0x115f..=0x1160 | 0x17b4..=0x17b5 |
        0x180b..=0x180f | 0x200b..=0x200f | 0x2028..=0x202e | 0x2060..=0x206f |
        0x3164 | 0xfe00..=0xfe0f | 0xfeff | 0xffa0 | 0xfff9..=0xfffb | 0x1bca0..=0x1bca3 |
        0x1d173..=0x1d17a | 0xe0000..=0xe007f | 0xe0100..=0xe01ef)
}

pub(crate) fn capped(source: &str) -> (&str, usize) {
    let mut count = 0;
    let mut end = source.len();
    for (i, _) in source.match_indices('\n') {
        count += 1;
        if count == LINE_LIMIT {
            end = i + 1;
        }
    }
    let total = count + usize::from(!source.is_empty() && !source.ends_with('\n'));
    (&source[..end], total.saturating_sub(LINE_LIMIT))
}

pub(crate) fn external_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    ["https://", "http://", "mailto:"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        && !url.chars().any(|c| c.is_control() || invisible(c))
}

pub(crate) fn image_host(url: &str) -> String {
    let Some((_, rest)) = url.split_once("://") else {
        return "local image".into();
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    safe_text(authority.rsplit('@').next().unwrap_or(authority))
}
