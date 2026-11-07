use rune::{Color, Family, TextStyle};
use rune_kit::syntax::{Syntax, SyntaxTheme};
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum Theme {
    #[default]
    Ember,
    EmberSoft,
    EmberLight,
}

impl Theme {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Ember => "ember",
            Self::EmberSoft => "ember-soft",
            Self::EmberLight => "ember-light",
        }
    }

    /// A colour from the bundled design file, such as `surface.cursor.read`.
    /// Unknown names are programming errors, not content input.
    pub fn token(self, name: &str) -> Color {
        static TOKENS: OnceLock<serde_json::Value> = OnceLock::new();
        let tokens = TOKENS.get_or_init(|| {
            serde_json::from_str(include_str!("../../../assets/design/ember-tokens.json"))
                .expect("bundled Ember tokens")
        });
        let (group, key) = name.split_once('.').expect("group.token");
        let value = &tokens["variants"][self.name()][group][key];
        let value = if group == "syntax" {
            &value["color"]
        } else {
            value
        };
        rune::color::hex(value.as_str().expect("known colour token")).expect("hex colour token")
    }

    pub(crate) fn syntax(self) -> SyntaxTheme {
        let mut theme = SyntaxTheme::neutral(self != Self::EmberLight);
        for (kind, token) in [
            (Syntax::Keyword, "keyword"),
            (Syntax::String, "string"),
            (Syntax::Number, "constant"),
            (Syntax::Comment, "comment"),
            (Syntax::Type, "type"),
            (Syntax::Function, "function"),
            (Syntax::Property, "variable"),
            (Syntax::Punctuation, "punct"),
            (Syntax::Inserted, "diff.plus"),
            (Syntax::Deleted, "diff.minus"),
        ] {
            theme = theme.with(kind, self.token(&format!("syntax.{token}")));
        }
        theme
    }
}

pub(crate) fn prose(size: f32, line: f32, weight: f32) -> TextStyle {
    TextStyle::new(size, weight)
        .family(Family::Named("Iosevka Etoile"))
        .lh(line)
}

pub(crate) fn mono(size: f32, line: f32) -> TextStyle {
    TextStyle::new(size, 400.0).mono().lh(line)
}
