//! Device-local, fieldwise policy editing. Rebasing is an explicit user operation.

use crate::Revision;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyConflict {
    pub field: String,
    pub yours: String,
    /// `None` means the host removed the field.
    pub current: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyDraftError {
    UnresolvedConflicts,
}

/// Names are opaque; fields retain source order, with local-only fields appended.
/// The base fields are the original host values at `base_revision`, never local edits.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyDraft {
    base_revision: Revision,
    base_fields: Vec<(String, String)>,
    fields: Vec<(String, String)>,
    conflicts: Vec<PolicyConflict>,
    /// Exact in-progress editor bytes, including temporarily invalid input.
    #[serde(default)]
    editor_source: Option<String>,
}

fn value<'a>(fields: &'a [(String, String)], name: &str) -> Option<&'a String> {
    fields
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value)
}

impl PolicyDraft {
    pub fn new(base_revision: Revision, fields: Vec<(String, String)>) -> Self {
        Self {
            base_revision,
            base_fields: fields.clone(),
            fields,
            conflicts: Vec::new(),
            editor_source: None,
        }
    }

    pub fn editor_source(&self) -> Option<&str> {
        self.editor_source.as_deref()
    }

    fn parse_source(source: &str) -> Option<Vec<(String, String)>> {
        let mut fields = Vec::new();
        for line in source.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let (name, value) = line.split_once('=')?;
            let name = name.trim();
            if name.is_empty() || fields.iter().any(|(key, _)| key == name) {
                return None;
            }
            fields.push((name.to_owned(), value.trim().to_owned()));
        }
        Some(fields)
    }

    /// Preserve every byte. Only changed, explicitly supplied values edit fields;
    /// merely syncing an untouched conflict never resolves it.
    pub fn set_editor_source(&mut self, source: String) {
        if let Some(fields) = Self::parse_source(&source) {
            for (name, new) in fields {
                if value(&self.fields, &name) != Some(&new) {
                    self.edit_field(name, new);
                }
            }
        }
        self.editor_source = Some(source);
    }

    fn source_valid(&self) -> bool {
        self.editor_source.as_deref().is_none_or(|source| {
            Self::parse_source(source).is_some_and(|parsed| {
                self.fields
                    .iter()
                    .all(|(name, v)| value(&parsed, name) == Some(v))
            })
        })
    }

    pub fn base_revision(&self) -> &str {
        &self.base_revision
    }
    pub fn base_fields(&self) -> &[(String, String)] {
        &self.base_fields
    }
    pub fn fields(&self) -> &[(String, String)] {
        &self.fields
    }
    pub fn conflicts(&self) -> &[PolicyConflict] {
        &self.conflicts
    }

    /// Explicitly choose a value, including reaffirming yours, and resolve this field.
    /// New names append; existing names keep their position.
    pub fn edit_field(&mut self, name: String, value: String) {
        if let Some((_, old)) = self.fields.iter_mut().find(|(key, _)| key == &name) {
            *old = value;
        } else {
            self.fields.push((name.clone(), value));
        }
        self.conflicts.retain(|conflict| conflict.field != name);
    }

    /// Three-way comparison against the original host fields. Never called on host arrival.
    /// Unresolved conflicts survive further rebases until an explicit field edit.
    pub fn rebase(&mut self, revision: Revision, current: Vec<(String, String)>) {
        let valid_source = self.source_valid();
        let mut names: Vec<&String> = current.iter().map(|(name, _)| name).collect();
        for (name, _) in &self.fields {
            if !names.contains(&name) {
                names.push(name);
            }
        }
        let mut fields = Vec::new();
        let mut conflicts = Vec::new();
        for name in names {
            let base = value(&self.base_fields, name);
            let yours = value(&self.fields, name);
            let theirs = value(&current, name);
            let unresolved = self
                .conflicts
                .iter()
                .any(|conflict| &conflict.field == name);
            let edited = yours != base || unresolved;
            if let Some(chosen) = if edited { yours } else { theirs } {
                fields.push((name.clone(), chosen.clone()));
            }
            if let Some(yours) = yours
                && (unresolved || (edited && theirs != base && Some(yours) != theirs))
            {
                conflicts.push(PolicyConflict {
                    field: name.clone(),
                    yours: yours.clone(),
                    current: theirs.cloned(),
                });
            }
        }
        self.base_revision = revision;
        self.base_fields = current;
        self.fields = fields;
        self.conflicts = conflicts;
        if valid_source && self.editor_source.is_some() {
            self.editor_source = Some(
                self.fields
                    .iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join("\n"),
            );
        }
    }

    /// Only changed fields, in source order. The caller must also check the base revision;
    /// `Client` does so at both readback opening and confirmation.
    pub fn safe_edits(&self) -> Result<Vec<(String, String)>, PolicyDraftError> {
        if !self.conflicts.is_empty() || !self.source_valid() {
            return Err(PolicyDraftError::UnresolvedConflicts);
        }
        Ok(self
            .fields
            .iter()
            .filter(|(name, local)| value(&self.base_fields, name) != Some(local))
            .cloned()
            .collect())
    }
}
