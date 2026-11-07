# render-keymap

The desktop command catalogue parses `desktop/assets/design/keymap.toml` at the crate boundary. It has no UI, host adapter, command execution, or authority dispatch.

## API

- `Keymap::bundled() -> Result<Keymap, Error>` parses and lints the embedded design table.
- `Keymap::parse(&str)` applies the same validation to another table.
- `commands() -> &[Command]` returns all entries in table order, including modal entries.
- `by_ex(&str) -> Option<&Command>` looks up an exact ex name or alias. One leading colon is optional. Arguments are not parsed. Modal entries have no ex lookup.
- `resolve(mode, ctx, sequence) -> Resolution` returns `NoMatch`, `Prefix`, or `Exact(Match)`. An exact match contains the command, binding, and context availability.
- `children(prefix, mode, ctx) -> Vec<Child>` returns immediate which-key children in key order. A child contains its key, complete sequence, label, optional leaf command, and availability.
- `palette(query, ctx) -> Vec<PaletteEntry>` searches command IDs, descriptions, ex names, and aliases. Search uses substring matching and smartcase. Results retain table order and include unavailable commands with reasons. Modal entries are excluded.
- `availability(command, ctx)` checks context eligibility only. `Available` is not authorization. The caller must apply host permissions, connection state, read basis, and readback rules.
- `meta()`, `contexts()`, and `builtins()` expose immutable table metadata.

Modes accept the table codes `n`, `v`, `i`, `c`, `h`, `rb`, and `ho`, or the names Normal, Visual, Insert, Command, Hint, Readback, and Handover. Names are case-insensitive.

Sequences use the table notation. Literal spaces and `<Space>` normalize to `<leader>`. Unknown modes, contexts, and malformed sequences produce `NoMatch` or no children. Context inheritance follows the table. The deepest declared binding wins an exact shadow.

Binding scope and command eligibility are distinct. A globally bound command can resolve with an unavailable context reason. This lets which-key retain all eight authority entries in a list view. Authority bindings are excluded entirely in editors. Insert has no leader bindings. The handover root inherits nothing from global.

Builtin editor and reader motions are reserved during lint but are not command matches. The modal controller consumes those keys using `builtins()`. Counts, operator operands, text objects, dynamic hint labels, pending-prefix cancellation, and Insert `jk` timing belong to that controller. `<label>` remains a placeholder, not a wildcard.

## Validation

Parsing rejects unknown fields, unsupported schema or leader values, malformed sequences, missing contexts, and cyclic context inheritance. Lint rejects duplicate command IDs, ex names and aliases, overlapping binding collisions and prefixes, builtin collisions, invalid shadow values, missing leader group labels, and descriptions longer than 32 characters.

Authority checks require the leader authorization group, Normal or Visual mode, non-editor command contexts, non-repeatable and non-countable commands, and nonempty wire metadata. Only cancellation may apply to lists. Routing and policy commands are settings-only. Alias targets must exist with the same tier and overlapping command contexts. Terminal-only alternatives, Insert restrictions, reserved split keys, Vim reserved keys, and local trap keys are checked.

Wire method coverage, host decidable semantics, generated cheat-sheet drift, and rendered chip rules require integration checks outside this crate. The `wire` field is descriptive metadata, not a dispatch API.

## Verification

`mise exec rust@1.99.1 -- cargo test -p render-keymap` runs the bundled-table and adversarial-table tests from the desktop workspace. The tests are written before their implementation and use the real embedded table.
