# Render desktop

A native Rust/rune client for the Render UI design in the containing repository's `docs/ui/`. The source, build configuration, bundled assets, tests, scripts, and local audit artifacts live here. No host source is imported.

**The public host protocol is still unfinished.** The default adapter is unconfigured and cannot send commands. The explicit demonstration adapter exercises local client behavior with labelled design fixtures. It does not contact a server, execute work, or merge anything.

**UI acceptance is still in progress.** See [the integration checkpoint](crates/render-desktop/INTEGRATION.md) for implemented behavior, source-specific test evidence, and remaining command/native-interaction gaps. Earlier captures are not final acceptance of the latest source.

## Build and run

From this directory, with [mise](https://mise.jdx.dev/) installed:

```sh
mise install
mise exec -- cargo run -p render-desktop -- --demo
```

Run without `--demo` to inspect the unconfigured/offline client:

```sh
mise exec -- cargo run -p render-desktop
```

The checked-in `mise.toml` pins Rust. `Cargo.lock` pins the dependency graph. Rune, rune-kit, and rune-mermaid use the accepted git revision `781e2b6d87cd5f32d6f4365956fad4baaf24ee50`. Fonts and Carbon SVGs are bundled; the running UI does not fetch them.

Default local state is under `desktop/.state/demo/` or `desktop/.state/live/`, isolated from each other. Use `--store PATH` for a separate local record; overrides must also remain separate by mode. Do not point simultaneous windows at the same store: the exclusive writer lock refuses the second writer rather than risking drafts. Local views and cached host facts can be restored, but cached scopes remain read-only until fresh host snapshots arrive. A failed native-close flush keeps the session in memory; reopen it through the Dock to resolve the error and retry.

## Keyboard entry points

- `Space Space`: open views.
- `Space ;`: command palette.
- `:`: command line. Every catalogue command has an ex name.
- `Space n`: open the host-supplied next target.
- `Enter`: open the selected Brief/list entry.
- `j` / `k`: move through rows; `Ctrl-o`: return.
- `K`: details; `gk`: work-view handover.
- `Space a`: authority command discoverability. Authority requires a host decidable, a current acknowledged basis, a readback, and a fresh physical `y` after that readback was drawn.
- `Esc`: leave the current local mode or float. It never cancels host work.

The bundled `assets/design/keymap.toml` is the command catalogue. Unavailable commands retain a reason; a visible demo receipt is not a real host receipt.

### Reviewing and saving notes

1. Open **Review Modules r2** from the Brief. Use `{` / `}` between paragraphs and `[n` / `]n` between document nodes. The highlighted block shows the reader position.
2. Press **Space → m → n** to note the current paragraph or Visual selection. Alternatively, `c` starts an operator: **`cip`** notes the paragraph, while `c{motion}` selects another exact source range. `c` alone waits for a motion; it does not immediately open an editor.
3. Type the note. **Esc, then Esc** returns to reading and keeps the local draft. Move and repeat to add another note.
4. Use **`:w` + Enter** or **Space → m → s** to save the annotation set. Leaving Insert does not save it. Saving requires a writable connection and a presented target; headless screenshots alone do not establish that presentation boundary.
5. **Space → a → r** requests rework; **Space → a → a** requests approval. These are separate from saving notes. If drafts remain, resolve the save-first prompt; then inspect the fresh readback and explicitly confirm. Saving never automatically approves or requests rework.

## Verification and native captures

```sh
mise exec -- cargo test --workspace
mise exec -- cargo clippy --workspace --all-targets -- -D warnings
mise exec -- cargo fmt --all --check
mise exec -- python3 scripts/check-boundaries.py
mise exec -- cargo build -p render-desktop
scripts/capture-layout.sh
```

The capture script invokes rune's native headless renderer at 1512, 1200, 1000, and 800 logical pixels. It writes PNGs, actual element trees, and frame-geometry results under `.audit/native/`. It uses separate stores for each scene. These checks do not establish physical keyboard timestamps, IME behavior, accessibility usability, or real-host interoperability.

A single capture:

```sh
target/debug/render-desktop --demo --scene review --size 1512x982 \
  --store .audit/example-state --tree .audit/review.json --snap .audit/review.png
```

Scenes include `brief`, `review`, `chat`, `decision`, `evidence`, `slices`, `proposals`, `agents`, `settings`, `proposal`, `operation`, `local-prompt`, `offline`, `revoked`, `unsupported`, and `readback`. A scene selects demonstration content, not production state.

## Local macOS bundle

```sh
mise exec -- scripts/bundle.sh release
open target/bundle/Render.app
```

The script builds an ad-hoc-signed local `.app`. It does not notarize, distribute, install globally, or deploy anything. The normal build launches unconfigured; use the executable with `--demo` for fixtures.

## Boundaries

| Crate | Responsibility |
| --- | --- |
| `render-core` | Typed client domain, scoped host reducer, read bases, pinned readbacks, drafts, outbox |
| `render-host` | Adapter interface, unavailable live connection, explicit local demo encoding and fixtures |
| `render-store` | Private atomic whole-device JSON and exclusive writer lock |
| `render-keymap` | Declarative catalogue validation, context resolution, palette and which-key data |
| `render-editor` | Local modal UTF-8 editing, selections, undo, motion/operator composition |
| `render-content` | Inert native Markdown, safe references, code and Mermaid content |
| `render-desktop` | Native window, presentation/input boundary, navigation, layout, IO orchestration |

Only `render-host` encodes command envelopes. Views consume domain objects, never wire JSON. Host observations never replace local drafts. The app persists the original prepared command bytes before handing them to an adapter. Retry uses those bytes unchanged. An absent receipt is not evidence that an uncertain command failed.

See [host integration](docs/host-integration.md), crate READMEs, and `.audit/` for the decision and verification trail. Disaster-recovery UI is excluded by the accepted host deferral. Ordinary reconnect, revocation, and uncertain outcomes are separate concerns.
