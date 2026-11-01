# Stack decisions

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`../reference/`](../reference/); `wireframes.md` → [`../wireframes/layout.md`](../wireframes/layout.md); `screens.md` → [`../wireframes/text-mocks.md`](../wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`../evidence.md`](../evidence.md).


Decisions for the GPUI client, taken from E-GPUI and E-MERMAID. Every figure is labelled **measured** (with its evidence file), **derived** (reasoned from measurements, not measured) or **pending** (owed by a named follow-up). Proposed targets are marked as such.

Evidence: `experiments/gpui-spike/{report.md,claims.md,env.md,results/}`, `experiments/mermaid-native/{report.md,results/summary.md,results/matrix.csv}`.

## 1. GPUI, consumed as one pinned snapshot

- **Decision.** Depend on `gpui-pre` (weekly snapshots of Zed's `gpui`), pinned with `=` to one version (spike: `=0.3.10`, Zed@08cbb88, 2026-10-25). Bump deliberately, not automatically; each bump re-runs the spike's failure cases 1–9 and the glyph check before merging. Exactly one GPUI in the dependency tree.
- **Why.** `gpui 0.2.2` on crates.io is a year stale; snapshots change API weekly and a caret requirement breaks builds (C10, measured: Kit's own history). A second GPUI version does not compile alongside (C7: `rusty-mermaid-gpui` pins `gpui 0.2`).
- **Toolchain.** Rust ≥ 1.92 via a local `mise.toml`. No Xcode: `runtime_shaders` compiles Metal at first window (C10, measured on a Command-Line-Tools-only Mac).
- **Next bump (2026-10-31 refresh; source, Zed main after 08cbb88, not yet in a snapshot; `stack-2/alternatives-report.md` §A).** No `gpui-pre` has shipped since 0.3.10.
  - **Frame caps:** Low Power Mode (#63477) and thermal (#66281) frame intervals now default on and apply to keystroke redraws (#66237). Set `low_power_frame_interval` and `thermal_frame_interval` to `None`, or L2 fails on battery.
  - **Wrapping:** GPUI's wrapper moves to UAX #14 (#64624). Render does not use it for prose (§3), but add a hyphen case to the bump checks.
  - **Text system:** `WindowTextSystem` is no longer `Send` (#66147) and a layout cache is removed (#66152). Shaping stays on the UI thread; Render keeps its own line and word memos.
  - **API:** `SubscriberSet` and `app.rs`/`context.rs` rework (#66156); expect compile breaks. Take the arena fix (#66293) and modifier-sequence flushing (#55800).
  - **Profiler:** the `profiler` feature records input-to-frame, present intervals and dirty-to-present (#53822, #61871, #63221, #64958). Its present time is the handover to the system, not the frame on screen, so it can serve L1 and L3 but not L2.

## 2. No GPUI Kit in v1

| Kit part | Use it? | Reason |
|---|---|---|
| TextView (Markdown) | **No** | Streaming cost 8.7 ms parse + 1.8 ms draw per tick at 4 KB per stream, superlinear, 35–145× the spike's own renderer (measured, `results/kit-textview-stream.json`); its own fonts and block spacing, not Render's reading layout or break rules (measured, screenshot). |
| Editor, Textarea | **No** | No modal layer (C8); our modal controller drives our own editor element. |
| Dock | **No** | v1 needs fixed splits (`␣wv`, `␣ws`), not drag-and-drop dock layouts. |
| DataTable, lists, MessageScroller | **No** | Kit-styled; the spike's own virtual list already meets the targets (no cursor drift, measured). `MessageScroller` was not measured. |
| WebView (`gpui-webview`) | **Not in v1** | Only the future canvas needs it, and overlays need the `gpui-fast` fork (C5). Revisit when canvas editing is scheduled. |

Kit also pins its own `gpui-pre`, so depending on it would tie our bump cadence to theirs. Using none of it keeps one pin.

## 3. Components Render owns

| Component | Shape | Evidence |
|---|---|---|
| **Block renderer** | Our own Markdown block layout on GPUI's text system. **Render's own greedy breaker** decides every break opportunity (`visual-language.md` §4) and shapes each line with GPUI's single-line rich shaper; it never inserts characters into text. GPUI's native wrapper is not used for prose: it breaks the rules, and it treats U+2060 as a break candidate, so the earlier "no-break joiner" plan does not work. It exposes every line's source offsets and every element's box, so the reading checks (FC-Q*) run on real layout output in GPUI tests (`VisualTestAppContext`, real text system) and in the HTML prototype (DOM ranges). Render code also covers chip padding and radius, dotted underlines and mixed font sizes in one line (one size per `ShapedLine`). Since the phase-2 visual direction, it is no longer a pure cell-grid function; a TUI implements the same rules on cells. | Design decision after the E-PROTO wrapping failures (`evaluation-1.md`). **Measured** (E-MYGO-TEXT, `experiments/text-gpui/`, 2026-11-01, offscreen Metal): native wrap 247 violations on 54 corpus blocks + 640 stress paragraphs; Render breaker 0; line ranges round-trip 695/695; measure 550.1003 px → 548; copy across blocks 44/44 with nothing inserted |
| **Markdown parsing: `pulldown-cmark`** (phase 5, challenge 7; replaces a hand-written CommonMark parser) | `pulldown-cmark` **0.13.5** (MIT, crates.io, 2026-10-21), a pull parser. Options:<br>• tables, footnotes, strikethrough and task lists;<br>• YAML-style metadata blocks for frontmatter;<br>• its GFM option for `> [!NOTE]`-style alert kinds (verify at pin; else a 30-line alert pre-pass).<br>Render keeps its **incremental scheme and its own block renderer**: completed blocks frozen, only the trailing block re-parsed (on its source slice) and re-shaped. Documents that don't stream are parsed whole once, so link reference definitions later in a file still resolve. Raw HTML events render as literal text (`visual-language.md` §10.6). `comrak` is the alternative if alert coverage needs it. | **Measured** with `pulldown-cmark` and Etoile shaping (E-MYGO-TEXT, `experiments/text-gpui/`, 4 × 2,000 tok/s, 3,750 frames, load ≈ 2): incremental equals full parse at all 15,000 deltas and 12,404 random cuts; parse p99 0.027–0.030 ms; parse + shape + layout warm p99 0.25 ms, max 1.19 ms; with every Render memo and the text system cold, p99 12.8 ms. Earlier: the spike's own parser p99 0.109 ms headless, 0.166 ms in-app. Kit TextView's cost was layout, not parsing |
| **Virtual list** | Keyed by message ID, prefix sums of row heights, cursor anchored to an ID. | Measured: no drift, 100 seeds × 200 edits, and live at message 5000 with 71 appends |
| **Modal controller** | About 1,000 lines, no GPUI dependency (spike `core/src/editor.rs`, 16 tests); reused by prompt, composers, decision note and edit buffer. | Measured: all commands pass via real `NSEvent` input |
| **Text input / IME** | `EntityInputHandler`; while a composition is marked, keys go to the input method first. **That guard is Render's:** GPUI's macOS `dispatch_keystroke` does not consult marked text, so Escape, `j` and `k` reach the view mid-composition (source, `gpui-pre-macos-0.3.10/src/window.rs:2673-2716`). Open upstream macOS issues to track: #64687 (Google Japanese Input crash), #62764 (IME intercepts multi-key bindings), #65868 (Option bindings under a Chinese IME), #64389 (composition selection in `examples/input.rs`; our `mark_text` doesn't copy it). | Verified at the GPUI test boundary (5 spike tests; E-MYGO-TEXT T12 with a guard-off mutant); **real IME pending** |

## 4. Fonts and icons

- **Bundled faces (decision; the user's choice; phase 4 drops Plex Sans):**

  | Role | Face | Release | Licence |
  |---|---|---|---|
  | mono (code, IDs, keys, fixed numeric columns) | Iosevka | v34.9.1, 2026-10-24 (`PkgTTC-Iosevka-34.9.1`) | SIL OFL 1.1, no Reserved Font Name (checked against `be5invis/Iosevka` `LICENSE.md`) |
  | chrome and prose | Iosevka Etoile | v34.9.1 (`PkgTTC-IosevkaEtoile-34.9.1`) | same |

  - Two families, one licence. They load from the app bundle, never from the system.
  - IBM Plex Sans and Iosevka Aile are no longer bundled.
  - `ui.font.ui` is removed (Q28: the user asked for Etoile everywhere, so nothing needs a second proportional face). `ui.font.mono` stays.
  - E-PROTO-3 used the WOFF2 packages (`PkgWebFont-*`) because browsers can't load TTC; the GPUI client uses the TTC packages.
- **Loading the TTCs (measured, E-MYGO-TEXT T1, 2026-11-01):**
  - GPUI's `add_fonts` loads only face 0 of a collection, so with the raw TTCs 4 of 12 roles (every italic) silently resolve to the upright face. Registering all 84 faces still gets italic wrong (it resolves to Oblique).
  - **Decision:** split the TTCs at build time and register only the faces Render uses. Measured 12/12 roles.
  - This Mac has Iosevka 34.0.0 and Iosevka Etoile 34.2.1 installed. Their advances and glyph bounds equal the bundled 34.9.1 faces, so a check by family name or width passes even when nothing was registered (measured: the no-registration mutant resolves every role to the system copies).
- **Startup check (decision):**
  - Each role must resolve to its bundled face, **checked by glyph ids or font-table data of the resolved font** (GPUI exposes glyph ids), never by family name or advance.
  - The mono role must be monospace: the advance of `i` equals the advance of `W`. Iosevka's advance is 0.5 em (**measured** 10-29 with CoreText on the bundled WOFF2: 100 columns = 700.0 px at 14 px). The check still measures it at startup.
  - Both families keep one advance width across weights (**measured**: regular, medium and bold equal), so bold syntax tokens and bold outcome words never reflow (FC-P08).
  - `measure.prose` is computed from the bundled reference paragraph (`visual-language.md` §4.1).
  - On failure: mono → Menlo, the measured fallback (9.0308 px at 15 px; all 36 phase-1 glyphs at one cell); Etoile (chrome and prose) → the system UI font. The echo area says so, and `measure.prose` is recomputed for the fallback.
  - Why: unknown names resolve **silently** to Helvetica (measured, C12).
- **Contextual alternates are on by default (measured):** Iosevka's default build substitutes alternates in 20 of 24 code tokens (glyph count stays 1:1). Render calls `disable_ligatures()` on every mono run. The earlier "no ligatures in the default build" was wrong.
- **Glyph widths (measured, T3):** in Iosevka (default spacing), `— → … ⏎ ▸ ↺` are two cells wide (14 px at 14 px) and `· ⟨ ⟩ ␣ • ◦` one cell. In Iosevka Term and Iosevka Fixed all 12 are one cell. Monospace lines snap fallback and wide glyphs to cells (Render code; 0 off-grid clusters after snapping). Which variant the mono role uses is Q37.
- **Measured since (E-MYGO-TEXT, offscreen):** registering the 32 selected split faces took 659 ms on GPUI (raw TTCs 400 ms, face 0 only), which is most of L6's 1 s cold-start budget if it runs before the first frame; Etoile parse + shape cost under the firehose (§3).
- **Pending (E-GPUI-2):** Etoile chrome shaping cost per frame; font registration in a release app bundle at cold start (L6), including registering only the faces the first frame needs before it.
- **Width facts for layout** (measured 10-29 on the bundled WOFF2): Etoile at 13 px is 1.16–1.28× Plex Sans on sample chrome strings, with the same x-height (0.520 vs 0.516 em). `measure.prose` is **548 px at 15 px** since phase 6 (584 at 16; `tools/font_metrics.txt`, `visual-language.md` §3.1, §4.1).
- **The user's own font settings:** they named Iosevka, so the mono role is configurable (`ui.font.mono`) but the default now matches their preference (Q01 answered).
- **Icons:** IBM Carbon (`@carbon/icons` 11.90.0, Apache-2.0; every phase-2 name verified by E-PROTO-2, the phase-3 names checked in the package). Bundled as SVG paths, drawn with GPUI's single-colour `svg()` element.
- **Out-of-coverage glyphs and emoji** in content fall back to system fonts inside content containers. In monospace contexts each is placed at its own cell origin.
- **Variant switching:** `ui.theme` in `~/.config/render/client.toml`, switched live with `␣ht` (`visual-language.md` §5.1). Tokens swap within one frame; type and layout do not change. Challenge 16 proposed dropping live switching; **the user rejected it**, so it stays.
- **Evidence for the font figures** (challenge 22): `tools/font_metrics.swift` (CoreText on the bundled WOFF2) writes `tools/font_metrics.txt`, and the measure sample is pinned as `tools/measure-sample.txt`. The Plex Sans comparison (1.16–1.28×) was measured on 10-29 against E-PROTO-3's vendored Plex, which has since been removed.

## 5. Mermaid

**Pipeline (decision):** `fenced source → strip_styles (classDef, style, linkStyle, rect colours) → Pele, exact pinned version → substitute --pele-* CSS variables with palette tokens → resvg → image in the content lane`. SVG is cached by source digest and renderer version; a theme change re-substitutes and re-rasterises only.

| Fact | Status |
|---|---|
| Pele 1.12.0 in QuickJS renders 13/13 of the spec's figures with every label, ≤ 7.7 ms each (median 1.59 ms); malformed input → error with line and column, 5/5 | measured |
| QuickJS SVG is byte-identical to Pele under Node for all 13 figures | measured |
| `strip_styles` removes the spoofing colours (4 figures leak without it) | measured |
| One off-token `color-mix()` halo (Fig. 7) that resvg cannot parse | measured; substitute or drop it in the token pass |
| rusty-mermaid: 9/13, panics on Fig. 10, GPUI backend unpublished and on the wrong GPUI | measured; rejected |
| Rendering through GPUI's own `img()` path (resvg 0.45 vs 0.49 in the probe) | **pending** |
| Monospace text measurement inside nodes; text overflow | **pending** |

**Where Pele runs (decision, phase 5; challenge 8).** **In the client**, through `rquickjs`, the measured path: about 230 lines plus a 730 KB bundle. It needs a C compiler at build time, which tree-sitter needs anyway.
- The client owns its fonts, its Etoile `measurer` and its tokens, and the host serves Mermaid source bytes only.
- Phase 2 recommended host rendering (RQ-40, P8, Q22). That would lay out the host's SVG for one client's typography: a TUI or a `ui.font.mono` client would get boxes sized for a face it doesn't use, and a font change would need a host release. RQ-40 is withdrawn and Q22 superseded.
- A future TUI that wants pictures embeds the same crate.

**Wide and small diagrams (decision):**
- Pele runs with `fontSize: 16` in **Iosevka Etoile**: node text 16 px, edge labels 14 px, sequence fragment labels 13 px. Phase 6 lowered it from 17 with prose (16 → 15 px), so node text stays one step above prose.
- **Text measurement (decision, phase 4):** Pele takes an `opts.measurer`; its default is its own metrics for `fontFamily`. The pipeline passes a measurer built from Etoile's advance-width table, exported at build time from the bundled font. Etoile is about 20 % wider than Plex Sans at the same size (measured), so the default metrics would lay out nodes too small for the text resvg draws (FC-Q22). **Pending:** re-measure natural widths with Etoile; the numbers below were taken with Plex Sans.
- **usvg settings (decision, measured):** usvg ignores Pele's root `font:` shorthand. E-PROTO-3 measured this on all 13 figures with usvg 0.49.0: text without an explicit size resolves to `Options::font_size`, 12 px by default. Set `Options::font_size` to Pele's size (16.0 since phase 6) and `Options::font_family = "Iosevka Etoile"`, and load the bundled faces into its `fontdb` (`html-proto/results/svgfit-usvg.txt`).
- At Plex Sans and 17 px (the E-MERMAID measurement, before phases 4 and 6 changed the face and size) the measured natural widths were about 1,090 px (median) and 1,340 px (maximum), so every one of the 13 figures fits a maximised 1512 px full view at natural size (measured, `summary.md`, `pele-quickjs-fs17+strip`).
- **Inline:** natural size if it fits the figure width: the pane's content width since phase 4, which drops the 960 px cap. Otherwise scaled to fit while every text stays ≥ 12 px, else "wider than view". The 12 px minimum E-MERMAID measured was usvg's default size (now measured; see usvg settings above). Otherwise a "wider than view" state with `⏎ full view`; never a clipped picture. **Rendered by default** (F10). See `visual-language.md` §11. Phase 2 clipped labels mid-word in mermaid.js; the SVGFIT check now guards this.
- `⏎` on a diagram opens it full-window (all panes hidden). `h j k l` pan when it is still wider than the window; `+`/`-`/`=` zoom from fit-to-window up to 200 %. Labels are never shown below 12 px.
- **On a variant switch**, cached SVGs (with CSS variables intact) are re-substituted and re-rasterised: visible ones immediately, off-screen ones lazily, with no host request.
- Tall diagrams scroll with the document. There is no height cap.

**Risks.** Pele is about three weeks old and releases almost daily: pin the exact version and re-run the probe's cases and matrix on every upgrade. Its npm package says MIT while GitHub's licence detector reports NOASSERTION, so the LICENSE file must be read before shipping. `color-mix()` and other CSS the rasteriser cannot parse must fail closed to a token colour.

## 5a. Syntax highlighting (decision, after the tldraw review)

**Highlighter: tree-sitter**, via `tree-sitter-highlight` 0.27.1 (MIT, released 2026-10-08, crates.io) with its matching `tree-sitter` core, consumed as one pinned snapshot like GPUI. Grammar crates are pinned per language and checked for ABI compatibility with that core.

**Why tree-sitter over syntect:**
- **Ember maps by tree-sitter capture name.** The user's own nvim theme (`highlights/treesitter.lua`) assigns colours to `@keyword`, `@function.method`, `@string.escape`, …, so Render's token map (`visual-language.md` §5.10) is one table from capture to token. syntect uses Sublime/TextMate scopes, so it would need a second mapping that drifts from the user's editor.
- **Incremental.** Streaming fences and, later, the emission editor (`␣me`) re-highlight by tree-sitter edits rather than from the top.
- **Accuracy** comes from a real parse rather than regular expressions, and Zed, GPUI's home, uses the same approach. That is precedent, not a dependency: Render takes neither Zed's crates nor its GPL/AGPL queries.

**Costs, accepted:**
- Each grammar is C code compiled into the client, so a C compiler is needed even if Pele moves to the host (Q22). syntect with `fancy-regex` would be pure Rust.
- Binary size grows with the language set: about 0.3–2 MB per grammar (estimate, to measure in E-GPUI-2).
- Highlight queries come from each grammar's own `queries/highlights.scm` (MIT, shipped with the crate), not from nvim-treesitter, whose queries rely on nvim-only predicates. A capture the query does not emit falls back to the next shorter name (`@keyword.return` → `@keyword`), then to plain.

**Language sets (phase 5, challenge 21, accepted by the user).**
- **v1 ships 12 languages** (14 grammar crates): rust, typescript + tsx, javascript, json, toml, yaml, bash, sql, python, markdown + markdown-inline, diff and elixir.
- **The target set** is the 23 below. Each further grammar is "one crate and one alias row" when a fence in it appears; unknown fences already render plain.
- The odin and fish grammars are therefore not in v1; odin's community grammar would also lag core ABI bumps.

The target set is the union of three sources, plus Elixir by the user's answer to Q35:
- **Your nvim parser list** (`~/.config/nvim/lua/plugins/treesitter.lua`): bash, css, dockerfile, fish, go, html, javascript, json, nix, python, rust, sql, toml, typescript, yaml, plus nvim's built-in c, diff, lua and markdown. Its own comment states the same need: without them "every fenced code block in another language renders as flat uncolored text".
- **Fence labels in `~/skl-ledger`** (read-only count, 10-29): ts 18, sh 11, text 10, odin 3, sql 2, python 1, md 1, and 13 unlabelled.
- **Render's `docs/`**: mermaid 13, sh 7, json 4; plus Render's own Rust and TOML.

| Grammar | Fence labels (aliases) | Evidence |
|---|---|---|
| rust | `rust`, `rs` | nvim, Render |
| typescript, tsx | `ts`, `typescript`, `tsx` | nvim, ledger (18) |
| javascript | `js`, `javascript`, `jsx`, `mjs` | nvim |
| json | `json`, `jsonc` | nvim, Render docs (4) |
| toml | `toml` | nvim, Render |
| yaml | `yaml`, `yml` (also the expanded frontmatter) | nvim, ledger frontmatter |
| bash | `sh`, `bash`, `shell`, `zsh`, `console` | nvim, ledger (11), Render docs (7) |
| fish | `fish` | nvim |
| sql | `sql` | nvim, ledger (2) |
| python | `python`, `py` | nvim, ledger (1) |
| go | `go` | nvim |
| nix | `nix` | nvim |
| lua | `lua` | nvim built-in |
| c | `c`, `h` | nvim built-in |
| css · html | `css` · `html` (fenced only; raw HTML in Markdown stays literal) | nvim |
| dockerfile | `dockerfile`, `docker` | nvim |
| odin | `odin` (community grammar; pin and verify its licence at implementation) | ledger (3) |
| markdown, markdown-inline | `md`, `markdown` | nvim built-in, ledger (1) |
| diff | `diff`, `patch` | nvim built-in |
| elixir | `elixir`, `ex`, `exs`, `heex` (heex highlights as elixir until a heex grammar is asked for) | **user answer, Q35** (phase 4); your config has an Elixir LSP |

That is the **target set of 23 grammars** (typescript and tsx, markdown and markdown-inline count separately). Q35 was answered with all 22 plus Elixir; challenge 21 staged it, with the user's agreement: the 12 v1 languages above, the rest on demand.
- **Elixir pin:** `tree-sitter-elixir` **0.3.5** (crates.io, released 2026-03-02), from `elixir-lang/tree-sitter-elixir`.
- **Licence: Apache-2.0**, unlike the MIT grammars. Its licence and NOTICE text ship in the app's third-party notices.
- Like every grammar, its ABI is checked against the pinned `tree-sitter` 0.27 core at implementation.

- `text`, `txt`, `plain`, unlabelled fences and any other label: plain `fg`, no guessing (FC-Q17).
- `mermaid`: a diagram (§5).
- A new language is one grammar crate and one alias row; no design change.

**Where it runs:** on the parse worker, never the UI thread. A block first paints plain; spans then change colour and weight only (FC-P08). Completed blocks are highlighted once and cached by content digest; the open fence of a streaming message is re-highlighted incrementally on each append.
- **Pending (E-GPUI-2):** highlight p99 per block, a 2,000-line block arriving under the firehose without breaking L1, and binary size for the 12-language v1 set.

**HTML prototype stand-in (E-PROTO-3 and after):** highlight.js 11.11.1 (BSD-3-Clause), pinned, with only the **12 v1 languages** registered (phase 5); every other fence renders plain, as in v1.
- **Stand-in aliases:** toml uses highlight.js `ini`, html uses `xml`, and elixir uses its core `elixir` grammar.
- **fish and odin have no highlight.js grammar,** so the prototype renders them plain (E-PROTO-3 deviation 2). The GPUI client highlights them with tree-sitter; the prototype doesn't test them.

It uses a fixed class-to-token map:
- `hljs-keyword` → `syntax.keyword`;
- `hljs-title.function_` → `syntax.function`;
- `hljs-string` → `syntax.string`;
- `hljs-number` and `hljs-literal` → `syntax.constant`;
- `hljs-comment` → `syntax.comment`;
- `hljs-built_in` → `syntax.builtin`;
- `hljs-attr` → `syntax.attribute`;
- `hljs-addition` and `hljs-deletion` → the diff tokens, as text colour only;
- `hljs-meta` → `syntax.builtin`;
- **Markdown fences** (phase 4, E-PROTO-3 defect 6; same tokens as `visual-language.md` §5.10):
  - `hljs-section` → `syntax.md.heading` (`fg` bold);
  - `hljs-code` → `syntax.md.raw` (orange);
  - `hljs-bullet` → `syntax.md.list` (`fg.muted`);
  - `hljs-link` and `hljs-string` inside a link → `syntax.attribute` (steel);
  - `hljs-strong` → `fg` bold;
  - `hljs-emphasis` → `fg` italic;
  - `hljs-quote` → `syntax.doc` (`fg.alt` italic);
- anything else → plain.

`ignoreUnescapedHTML` stays on, and auto-detection is off. It tests the colours, the budget, the contrast and the spoofing rules, not tree-sitter's accuracy.

**Markdown dialect** of Render's own incremental parser (§3): CommonMark plus GFM tables, task lists, strikethrough, autolinks and footnotes; GFM alerts; YAML frontmatter; `mermaid` fences (`visual-language.md` §4.8). HTML, math and wiki links stay literal.

## 6. Latency and pacing targets

The ambition's "keystroke→frame p99 ≤ 8 ms" counts presentation, and with vsync that is very likely unattainable: up to one frame of waiting before drawing and one before scan-out (**derived**, `gpui-spike/report.md`). The displays measured were 100 Hz and 60 Hz, not 120 Hz. Replacement targets (**proposed**):

| ID | Target | Measured so far | Status |
|---|---|---|---|
| L1 | Processing: OS key-event timestamp → frame committed for presentation, p99 ≤ 4 ms, idle and under a 4 × 2,000 tok/s firehose | Offscreen processing p99 1.16–1.63 ms; paint p99 on a real window 1.21–1.99 ms | offscreen pass; **on-screen pending** |
| L2 | Presentation: key event → first presented frame showing its effect, p99 ≤ 2 refresh intervals (20 ms at 100 Hz, 16.7 ms at 120 Hz) | not measured (the patched present hook never fired) | **pending** |
| L3 | Pacing under the firehose: ≤ 1 % of frames late by more than one refresh interval; no hitch > 50 ms; held-key scroll with no hitch > 33 ms | not measured; waiting for the next drawable p99 10.3 ms, max 29 ms on a 100 Hz window | **pending** |
| L4 | Incremental Markdown parse p99 ≤ 2 ms per frame at 4 × 2,000 tok/s | 0.11–0.17 ms (own parser); 0.027–0.030 ms with `pulldown-cmark`, 0.25 ms with Etoile shaping and layout (E-MYGO-TEXT) | **pass** |
| L5 | RSS ≤ 500 MB after 10 min with 10k messages loaded and the firehose running | 178 MB (offscreen) | pass (offscreen) |
| L6 | Cold start to a usable queue ≤ 1 s | median 167 ms, max 1,015 ms (cold page cache) | pass warm, marginal cold |

Design rules that follow:
- **Host events are applied at frame boundaries; keys are handled immediately against the last painted state.** This is what makes target pinning exact (E-PROTO found the frame race and fixed it this way).
- Render at most once per display refresh. Coalesce host updates and stream deltas between frames.
- Never block key handling on drawable acquisition. Under the firehose, most frame time was spent waiting for a drawable, which is display back-pressure rather than app work.

**Pending gates** (E-GPUI-2 in `experiment-briefs.md`): L1 on screen, L2, L3 with a fixed present hook; a 120 Hz panel; a real input method (Japanese and dead keys); held-key backlog in a live window; the Mermaid `img()` path; **phase 5 adds:** Pele in QuickJS with the Etoile measurer, including note sizing (Figure 1); the reference-index match cost per block. L4 with `pulldown-cmark` is now measured (above). Screen Recording permission is now granted, so screenshot-based checks of the real window are possible.

**Measuring L2.** No stack reports when a frame reaches the screen on macOS: GPUI's present timing is the handover, and Chromium documents its presentation stage as inaccurate on Mac. L2 therefore needs an external screen-capture harness, calibrated on Terminal.app, with the app launched by `open` (a native app run that way measured about one frame slower than running its executable directly; Apple forum thread 841189). Native apps at 100 Hz already measure p99 23–34 ms there, above L2's 20 ms, so the target may need revisiting once measured.

## 7. Alternatives re-evaluated (2026-10-31 to 11-01)

With the spec final, the stack was re-checked against mygo (Go), nanoui (Zig), a TypeScript web client (Electron or Tauri), other Rust toolkits, Swift + AppKit, Flutter and Qt. Workbench: `stack-2/` (`requirements.md`, `alternatives-report.md`, `shortlist.md`), `experiments/stack-2/frameworks-report.md`, `experiments/text-mygo/report.md`.

- **Decision (user): GPUI stays.** No candidate failed a hard requirement.
- **mygo** was spiked on text only (E-MYGO-TEXT). The renderings looked the same and both stacks passed the checks with Render's own breaker. mygo was about 6× slower at warm streaming layout (p99 1.5 vs 0.25 ms) and 4–5× per cold message. Its public API cannot show which font file a role resolved to, and fallback glyphs shift the prose baseline 1.125 px. Render-owned code was about equal (≈1,030 vs ≈1,180 lines). It stays the first fallback if GPUI's on-screen checks fail.
- **TypeScript web client:** the best language fit with the TS host and a future TUI, and it reuses the prototype and its checks. Not measured for latency; WKWebView probably caps at 60 fps on macOS 15. Second fallback.
- **Dropped:** nanoui (a 13-day-old Zig port of mygo; fonts, key-up and colour emoji would need a fork), the other Rust toolkits (none beats GPUI on R1, R4, R5 and R13 together), Flutter and Qt. Swift + AppKit is the fallback only if real IME fails everywhere.
