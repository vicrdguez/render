use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum Mode {
    #[serde(rename = "n")]
    Normal,
    #[serde(rename = "v")]
    Visual,
    #[serde(rename = "i")]
    Insert,
    #[serde(rename = "c")]
    Command,
    #[serde(rename = "h")]
    Hint,
    #[serde(rename = "rb")]
    Readback,
    #[serde(rename = "ho")]
    Handover,
}

impl Mode {
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "n" | "normal" => Some(Self::Normal),
            "v" | "visual" => Some(Self::Visual),
            "i" | "insert" => Some(Self::Insert),
            "c" | "command" => Some(Self::Command),
            "h" | "hint" => Some(Self::Hint),
            "rb" | "readback" => Some(Self::Readback),
            "ho" | "handover" => Some(Self::Handover),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Local,
    Write,
    Decide,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Command,
    Operator,
    Motion,
    Textobject,
    Prefixarg,
    Modal,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub mode: Mode,
    pub ctx: String,
    pub seq: String,
    pub alias_of: Option<String>,
    pub shadows: Option<String>,
    pub tui: Option<String>,
    pub tui_alt: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Command {
    pub id: String,
    pub ex: String,
    pub desc: String,
    pub tier: Tier,
    pub kind: Kind,
    pub ctx: Vec<String>,
    pub keys: Vec<Binding>,
    #[serde(default)]
    pub ex_aliases: Vec<String>,
    #[serde(default)]
    pub wire: Vec<String>,
    #[serde(default)]
    pub countable: bool,
    #[serde(default)]
    pub repeatable: bool,
    #[serde(default)]
    pub confirm_local: bool,
    #[serde(default)]
    pub local_only: bool,
    #[serde(default)]
    pub jump: bool,
    pub effect: Option<String>,
    pub object: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub chars: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Meta {
    pub schema: u32,
    pub leader: String,
    pub whichkey_delay_ms: u64,
    pub layout_unfreeze_ms: u64,
    pub hint_alphabet: String,
    pub jumplist_size: usize,
    pub digest_display: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Table {
    meta: Meta,
    contexts: BTreeMap<String, String>,
    groups: BTreeMap<String, String>,
    builtin: BTreeMap<String, Vec<String>>,
    command: Vec<Command>,
}

#[derive(Debug)]
pub struct Keymap {
    table: Table,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error(pub String);
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Error {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Availability {
    Available,
    Unavailable(String),
}

#[derive(Debug, Clone)]
pub struct Match<'a> {
    pub command: &'a Command,
    pub binding: &'a Binding,
    pub availability: Availability,
}

#[derive(Debug, Clone)]
pub enum Resolution<'a> {
    NoMatch,
    Prefix,
    Exact(Match<'a>),
}

#[derive(Debug, Clone)]
pub struct PaletteEntry<'a> {
    pub command: &'a Command,
    pub availability: Availability,
}

#[derive(Debug, Clone)]
pub struct Child<'a> {
    pub key: String,
    pub sequence: String,
    pub label: String,
    pub command: Option<&'a Command>,
    pub availability: Availability,
}

impl Keymap {
    pub fn bundled() -> Result<Self, Error> {
        Self::parse(include_str!("../../../assets/design/keymap.toml"))
    }

    pub fn parse(source: &str) -> Result<Self, Error> {
        let table = toml::from_str(source).map_err(|e| Error(format!("KL0: {e}")))?;
        let map = Self { table };
        map.lint()?;
        Ok(map)
    }

    pub fn commands(&self) -> &[Command] {
        &self.table.command
    }
    pub fn meta(&self) -> &Meta {
        &self.table.meta
    }
    pub fn contexts(&self) -> &BTreeMap<String, String> {
        &self.table.contexts
    }
    pub fn builtins(&self) -> &BTreeMap<String, Vec<String>> {
        &self.table.builtin
    }

    pub fn by_ex(&self, ex: &str) -> Option<&Command> {
        let ex = ex.strip_prefix(':').unwrap_or(ex);
        self.commands()
            .iter()
            .find(|c| c.kind != Kind::Modal && (c.ex == ex || c.ex_aliases.iter().any(|a| a == ex)))
    }

    pub fn availability(&self, command: &Command, ctx: &str) -> Availability {
        if !self.table.contexts.contains_key(ctx) {
            Availability::Unavailable(format!("unknown context: {ctx}"))
        } else if command.tier == Tier::Decide && self.descends(ctx, "editor") {
            Availability::Unavailable("authority is unavailable in editors".into())
        } else if command.ctx.iter().any(|c| self.descends(ctx, c)) {
            Availability::Available
        } else {
            Availability::Unavailable(format!("{} only", command.ctx.join(" / ")))
        }
    }

    pub fn palette(&self, query: &str, ctx: &str) -> Vec<PaletteEntry<'_>> {
        let sensitive = query.chars().any(char::is_uppercase);
        self.commands()
            .iter()
            .filter(|c| c.kind != Kind::Modal)
            .filter(|c| {
                let haystack = format!("{} {} {} {}", c.id, c.ex, c.desc, c.ex_aliases.join(" "));
                if sensitive {
                    haystack.contains(query)
                } else {
                    haystack.to_lowercase().contains(&query.to_lowercase())
                }
            })
            .map(|command| PaletteEntry {
                command,
                availability: self.availability(command, ctx),
            })
            .collect()
    }

    pub fn resolve(&self, mode: &str, ctx: &str, sequence: &str) -> Resolution<'_> {
        let Some(mode) = Mode::parse(mode) else {
            return Resolution::NoMatch;
        };
        let Ok(sequence) = tokens(sequence, true) else {
            return Resolution::NoMatch;
        };
        if sequence.is_empty() {
            return Resolution::NoMatch;
        }
        let mut prefix = false;
        let mut available_prefix = false;
        let mut exact: Option<Match<'_>> = None;
        for (command, binding) in self.bindings(mode, ctx) {
            let key = tokens(&binding.seq, true).expect("validated key");
            if key == sequence {
                let availability = self.availability(command, ctx);
                if exact.as_ref().is_none_or(|old| {
                    if binding.ctx == old.binding.ctx {
                        availability == Availability::Available
                            || old.availability != Availability::Available
                    } else {
                        self.descends(&binding.ctx, &old.binding.ctx)
                    }
                }) {
                    exact = Some(Match {
                        command,
                        binding,
                        availability,
                    });
                }
            } else if key.starts_with(&sequence) {
                prefix = true;
                available_prefix |= self.availability(command, ctx) == Availability::Available;
            }
        }
        if let Some(found) = exact {
            if found.availability != Availability::Available && available_prefix {
                Resolution::Prefix
            } else {
                Resolution::Exact(found)
            }
        } else if prefix {
            Resolution::Prefix
        } else {
            Resolution::NoMatch
        }
    }

    pub fn children(&self, prefix: &str, mode: &str, ctx: &str) -> Vec<Child<'_>> {
        let Some(parsed_mode) = Mode::parse(mode) else {
            return Vec::new();
        };
        let Ok(prefix) = tokens(prefix, true) else {
            return Vec::new();
        };
        let mut children: BTreeMap<String, Child<'_>> = BTreeMap::new();
        for (command, binding) in self.bindings(parsed_mode, ctx) {
            let keys = tokens(&binding.seq, true).expect("validated key");
            if !keys.starts_with(&prefix) || keys.len() <= prefix.len() {
                continue;
            }
            let key = keys[prefix.len()].clone();
            let sequence = keys[..=prefix.len()].concat();
            let leaf = keys.len() == prefix.len() + 1;
            let child = Child {
                key: key.clone(),
                label: if leaf {
                    command.desc.clone()
                } else {
                    self.table
                        .groups
                        .get(&sequence)
                        .cloned()
                        .unwrap_or_else(|| sequence.clone())
                },
                sequence,
                command: leaf.then_some(command),
                availability: self.availability(command, ctx),
            };
            if let Some(old) = children.get_mut(&key) {
                if leaf || child.availability == Availability::Available {
                    *old = child;
                }
            } else {
                children.insert(key, child);
            }
        }
        children
            .into_values()
            .map(|mut child| {
                if child.command.is_some()
                    && let Resolution::Exact(found) = self.resolve(mode, ctx, &child.sequence)
                {
                    child.command = Some(found.command);
                    child.label = found.command.desc.clone();
                    child.availability = found.availability;
                }
                child
            })
            .collect()
    }

    fn bindings(&self, mode: Mode, ctx: &str) -> impl Iterator<Item = (&Command, &Binding)> {
        let known = self.table.contexts.contains_key(ctx);
        self.commands()
            .iter()
            .filter(move |c| known && !(c.tier == Tier::Decide && self.descends(ctx, "editor")))
            .flat_map(move |c| {
                c.keys
                    .iter()
                    .filter(move |k| k.mode == mode && self.descends(ctx, &k.ctx))
                    .map(move |k| (c, k))
            })
    }

    fn descends(&self, child: &str, ancestor: &str) -> bool {
        let mut cursor = child;
        while !cursor.is_empty() {
            if cursor == ancestor {
                return true;
            }
            let Some(parent) = self.table.contexts.get(cursor) else {
                return false;
            };
            cursor = parent;
        }
        false
    }

    fn overlap(&self, a: &Command, b: &Command) -> bool {
        self.table.contexts.keys().any(|ctx| {
            self.availability(a, ctx) == Availability::Available
                && self.availability(b, ctx) == Availability::Available
        })
    }

    fn lint(&self) -> Result<(), Error> {
        let fail = |rule: &str, detail: &str| Error(format!("{rule}: {detail}"));
        if self.table.meta.schema != 1 || self.table.meta.leader != "<Space>" {
            return Err(fail("KL0", "unsupported schema or leader"));
        }
        for name in self.table.contexts.keys() {
            let mut seen = BTreeSet::new();
            let mut cursor = name.as_str();
            while !cursor.is_empty() {
                if !seen.insert(cursor) {
                    return Err(fail("KL0", "context cycle"));
                }
                cursor = self
                    .table
                    .contexts
                    .get(cursor)
                    .ok_or_else(|| fail("KL0", "unknown context parent"))?;
            }
        }
        for (name, sequences) in &self.table.builtin {
            if ![
                "reader_motions",
                "list_motions",
                "editor_normal",
                "editor_textobjects",
                "editor_insert",
                "hint",
                "pending",
                "timeout_ok",
            ]
            .contains(&name.as_str())
            {
                return Err(fail("KL0", "unknown builtin set"));
            }
            for sequence in sequences {
                tokens(sequence, false)?;
            }
        }
        for sequence in self.table.groups.keys() {
            tokens(sequence, false)?;
        }
        let mut ids = BTreeSet::new();
        let mut exs = BTreeSet::new();
        for c in self.commands() {
            if c.id.is_empty() || c.desc.is_empty() || c.ctx.is_empty() || !ids.insert(&c.id) {
                return Err(fail("KL1", &c.id));
            }
            if c.desc.chars().count() > 32 {
                return Err(fail("KL8", &c.id));
            }
            if c.kind != Kind::Modal {
                for ex in std::iter::once(&c.ex).chain(&c.ex_aliases) {
                    if ex.is_empty() || ex == "-" || !exs.insert(ex) {
                        return Err(fail("KL1", "duplicate or missing ex name"));
                    }
                    if (c.tier != Tier::Local && ["q!", "qa"].contains(&ex.as_str()))
                        || (c.tier == Tier::Decide && ["w", "wq", "x"].contains(&ex.as_str()))
                    {
                        return Err(fail("KL5", "reserved ex name"));
                    }
                }
            } else if c.ex != "-" || c.tier != Tier::Local || !c.ex_aliases.is_empty() {
                return Err(fail("KL1", "invalid modal command"));
            }
            for ctx in c.ctx.iter().chain(c.keys.iter().map(|k| &k.ctx)) {
                if !self.table.contexts.contains_key(ctx) {
                    return Err(fail("KL0", "unknown command context"));
                }
            }
            if c.effect.as_deref().is_some_and(|e| e != "discard")
                || (c.effect.is_some() && !c.local_only)
            {
                return Err(fail("KL5", "discard must be local-only"));
            }
            if c.tier == Tier::Decide {
                if c.countable
                    || c.repeatable
                    || c.wire.is_empty()
                    || c.ctx.iter().any(|ctx| {
                        self.descends("editor", ctx)
                            || self.descends(ctx, "editor")
                            || (c.id != "auth.cancel"
                                && (self.descends(ctx, "list") || self.descends("list", ctx)))
                    })
                {
                    return Err(fail("KL4", &c.id));
                }
                if ["auth.routing", "auth.policy"].contains(&c.id.as_str())
                    && c.ctx.iter().any(|ctx| !self.descends(ctx, "settings"))
                {
                    return Err(fail("KL4", "settings authority context"));
                }
            }
            for k in &c.keys {
                let seq = tokens(&k.seq, c.kind == Kind::Modal)?;
                if seq.is_empty() {
                    return Err(fail("KL0", "empty binding"));
                }
                if k.shadows.as_deref().is_some_and(|s| s != "parent") {
                    return Err(fail("KL0", "invalid shadow declaration"));
                }
                let authority_prefix = seq.starts_with(&["<leader>".into(), "a".into()]);
                if (c.tier == Tier::Decide
                    && (!authority_prefix || !matches!(k.mode, Mode::Normal | Mode::Visual)))
                    || (authority_prefix && c.tier != Tier::Decide)
                {
                    return Err(fail("KL4", &c.id));
                }
                if c.tier != Tier::Local
                    && ([
                        "<Esc>", "<C-c>", "<C-[>", "q", "u", "<C-r>", ".", "dd", "D", "x", "X",
                        "s", "S", "r", "R", "p", "P", "@", "ZQ",
                    ]
                    .contains(&k.seq.as_str())
                        || (k.mode == Mode::Insert && k.seq == "jk"))
                {
                    return Err(fail("KL5", &c.id));
                }
                if c.tier == Tier::Decide && k.seq == "ZZ" {
                    return Err(fail("KL5", &c.id));
                }
                if [
                    "gn", "gN", "gv", "gJ", "gu", "gU", "g~", "g?", "gq", "gw", "g;", "g,",
                ]
                .contains(&k.seq.as_str())
                {
                    return Err(fail("KL18", &c.id));
                }
                if seq.starts_with(&["<leader>".into(), "w".into()])
                    || (matches!(k.mode, Mode::Normal | Mode::Visual)
                        && ["<C-h>", "<C-j>", "<C-k>", "<C-l>", "<C-w>"].contains(&seq[0].as_str()))
                    || (self.descends(&k.ctx, "picker")
                        && ["<C-v>", "<C-s>"].contains(&seq[0].as_str()))
                {
                    return Err(fail("KL5", "reserved split key"));
                }
                if k.mode == Mode::Insert
                    && (seq.contains(&"<leader>".into())
                        || !(self
                            .table
                            .builtin
                            .get("editor_insert")
                            .is_some_and(|keys| keys.contains(&k.seq))
                            || ["<M-CR>", "<D-CR>"].contains(&k.seq.as_str())))
                {
                    return Err(fail("KL14", &c.id));
                }
                if seq[0] == "<leader>" {
                    for n in 1..seq.len() {
                        if !self.table.groups.contains_key(&seq[..n].concat()) {
                            return Err(fail("KL8", "missing leader group"));
                        }
                    }
                }
                if let Some(alias) = &k.alias_of {
                    let target = self
                        .commands()
                        .iter()
                        .find(|c| &c.id == alias)
                        .ok_or_else(|| fail("KL16", "unknown alias"))?;
                    if target.tier != c.tier || !self.overlap(c, target) {
                        return Err(fail("KL16", "alias tier or context mismatch"));
                    }
                }
                if k.tui
                    .as_deref()
                    .is_some_and(|t| !["legacy", "kitty", "none", "legacy-as-tab"].contains(&t))
                {
                    return Err(fail("KL9", "unknown terminal classification"));
                }
                if let Some(alt) = &k.tui_alt {
                    tokens(alt, false)?;
                    if !c
                        .keys
                        .iter()
                        .any(|other| &other.seq == alt && legacy(&other.seq))
                    {
                        return Err(fail("KL9", "missing terminal alternative"));
                    }
                }
                if !legacy(&k.seq)
                    && !(k.seq == "<C-i>" && k.tui.as_deref() == Some("legacy-as-tab"))
                    && !c.keys.iter().any(|other| legacy(&other.seq))
                {
                    return Err(fail("KL9", "no terminal alternative"));
                }
                if self.descends(&k.ctx, "editor")
                    && seq
                        .iter()
                        .any(|t| t.starts_with("<M-") && t.chars().count() == 5)
                {
                    return Err(fail("KL9", "Option printable in editor"));
                }
            }
        }
        let bindings: Vec<_> = self
            .commands()
            .iter()
            .flat_map(|c| c.keys.iter().map(move |k| (c, k)))
            .collect();
        for (i, (a, ka)) in bindings.iter().enumerate() {
            let sa = tokens(&ka.seq, true)?;
            for (b, kb) in &bindings[i + 1..] {
                if ka.mode != kb.mode {
                    continue;
                }
                let sb = tokens(&kb.seq, true)?;
                if !(sa.starts_with(&sb) || sb.starts_with(&sa)) {
                    continue;
                }
                let overlap = self.table.contexts.keys().any(|ctx| {
                    self.descends(ctx, &ka.ctx)
                        && self.descends(ctx, &kb.ctx)
                        && self.availability(a, ctx) == Availability::Available
                        && self.availability(b, ctx) == Availability::Available
                });
                if !overlap {
                    continue;
                }
                let shadow = (ka.ctx != kb.ctx)
                    && ((self.descends(&ka.ctx, &kb.ctx) && ka.shadows.is_some())
                        || (self.descends(&kb.ctx, &ka.ctx) && kb.shadows.is_some()));
                if !shadow {
                    return Err(fail("KL2", &format!("{} conflicts with {}", a.id, b.id)));
                }
            }
            for (set, root, mode) in [
                ("reader_motions", "reader", Mode::Normal),
                ("reader_motions", "reader", Mode::Visual),
                ("list_motions", "list", Mode::Normal),
                ("editor_normal", "editor", Mode::Normal),
                ("editor_insert", "editor", Mode::Insert),
            ] {
                if ka.mode != mode {
                    continue;
                }
                if !self.table.contexts.keys().any(|ctx| {
                    self.descends(ctx, root)
                        && self.descends(ctx, &ka.ctx)
                        && self.availability(a, ctx) == Availability::Available
                }) {
                    continue;
                }
                if let Some(keys) = self.table.builtin.get(set) {
                    for builtin in keys {
                        let sb = tokens(builtin, false)?;
                        if sa.starts_with(&sb) || sb.starts_with(&sa) {
                            return Err(fail(
                                "KL2",
                                &format!("{} conflicts with builtin {builtin}", a.id),
                            ));
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

fn legacy(seq: &str) -> bool {
    ![
        "<D-", "<M-", "<C-h>", "<C-i>", "<C-m>", "<C-[>", "<C-CR>", "<S-CR>", "<C-S-",
    ]
    .iter()
    .any(|s| seq.contains(s))
}

fn tokens(sequence: &str, modal: bool) -> Result<Vec<String>, Error> {
    let mut result = Vec::new();
    let mut chars = sequence.chars();
    while let Some(ch) = chars.next() {
        if ch == '<' {
            let mut token = String::from("<");
            let mut closed = false;
            for ch in chars.by_ref() {
                token.push(ch);
                if ch == '>' {
                    closed = true;
                    break;
                }
            }
            let body = token
                .strip_prefix('<')
                .and_then(|s| s.strip_suffix('>'))
                .unwrap_or("");
            let named = ["leader", "Space", "CR", "Esc", "Tab", "BS"].contains(&body)
                || (modal && body == "label");
            let chord = body.split_once('-').is_some_and(|(modifier, key)| {
                ["C", "M", "S", "D"].contains(&modifier)
                    && (key.chars().count() == 1
                        && key.chars().all(|c| !c.is_control() && !c.is_whitespace())
                        || ["CR", "Tab", "BS", "Esc", "Space"].contains(&key)
                        || key
                            .strip_prefix("S-")
                            .is_some_and(|s| s.chars().count() == 1))
            });
            if !closed || !(named || chord) {
                return Err(Error(format!("KL0: invalid key token {token}")));
            }
            result.push(if token == "<Space>" {
                "<leader>".into()
            } else {
                token
            });
        } else if ch.is_control() {
            return Err(Error("KL0: control character in sequence".into()));
        } else {
            result.push(if ch == ' ' {
                "<leader>".into()
            } else {
                ch.to_string()
            });
        }
    }
    Ok(result)
}
