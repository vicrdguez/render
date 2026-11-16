# Stack decisions

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)).
> - **File names** in code spans: `visual-language.md`, `grammar.md` and `stack.md` are in [`reference/`](../reference/); `layout.md` and `text-mocks.md` are in [`wireframes/`](../wireframes/).
> - **Paths** under `stack-3/` and `experiments/` name where a measurement was made, in the design workbench (`~/dev/render-ui-design/`). A builder doesn't need them.
> - **Measured, proposed and pending** claims are separated in [`../evidence.md`](../evidence.md).

Decisions for the rune client. The owner switched the client from GPUI to rune on 2026-11-06 ("so yes, let's switch to rune"), after stack round 3 and the E-RUNE-1 spike. Every claim carries one of these labels:
- **measured:** a headless run on this Mac, with its evidence file;
- **looked at:** judged by eye from a rendered PNG;
- **source:** code at the pin, cited as `path:line` under `crates/rune/src/` unless another crate is named;
- **claimed:** rune's README or `research/` notes only;
- **reasoned:** follows from the above, not run.

Evidence: `stack-3/conclusion.md` (§6 holds the decision), `stack-3/rune/report.md` (research R1–R15), `stack-3/rune/spike-report.md` with `stack-3/rune/spike/{out,logs}/` (E-RUNE-1; file names below are relative to `spike/`), and `stack-3/baseline/report.md` (GPUI and mygo edit loops).

## 1. rune, consumed as one pinned revision

- **Decision.** Depend on rune (github.com/anomalyco/rune) at `dev` @ `781e2b6d` (`781e2b6d87cd5f32d6f4365956fad4baaf24ee50`, 2026-11-06) as a git `rev`. `rune`, `rune-kit` and `rune-mermaid` all come from that revision. Bump deliberately, never automatically.
- **Why rune.** Of the four stacks compared it has the best agent loop, a fast edit loop and the most built-ins (`conclusion.md`). The owner doesn't count its youth against it: Anomaly build opencode and hex on rune.
- **What the pin means.** rune has no releases or tags; its README says to pin a `dev` revision, and `dev` is never rewritten. Breaking changes land without migrations. Adding a public field to `AppSpec`, `TextStyle`, `Span` or `ScrollSpec` breaks code that builds them as struct literals (source, `AGENTS.md`), so Render builds them through constructors. The project takes no pull requests, so fixes Render needs live in Render's code.
- **Each bump:** re-run the spike's font, wrapping and key-pinning tests and the streaming bench (§7), and read the changelog fragments since the pin.
- **Toolchain.** Rust 1.99.1 through a local `mise.toml`, and Command Line Tools only, because rune ships precompiled metallibs (measured). Underneath: wgpu 30 with rune's own Metal backend on macOS, winit 0.30.13, Taffy 0.15, Parley 0.12 and AccessKit 0.25 (source).
- **Crate layout.** Keep view code in a small UI crate. Warm rebuilds scale with the edited crate, and rune itself isn't rebuilt (measured: edit to headless PNG 1.6 s on a 40-line app, 4.4 s on a 650-line one).

## 2. Spec changes accepted with the switch

The owner accepted these with rune. They replace the earlier rules wherever `visual-language.md` or `../spec.md` still state them.

1. **No Render-owned line breaker.** Prose uses rune's native wrap (Parley, UAX #14), and so does chrome text that wraps. IDs, key names, paths and inline code up to 40 characters stay whole as pills (§3). Breaks after hyphens in words are fine.
2. **Solid underlines only.** There are no dotted or dashed underlines. rune draws a solid 1 pt underline at baseline + 2 pt (`text/decorations.rs:123-126`), and colour tells a link from a missing reference. This is about underlines only: element borders can be dashed (`border_dash`), and elements take `shadow`, `box_shadow` and `gradient` (`el/visuals.rs:56, 77, 86, 91`); Render uses the dash for disabled segments and `box_shadow` for the bottom float.
3. **Pill metrics are rune's.** Each side of a pill takes about 7 px at 15 px: 5.4 px of padding inside the chip plus a 1.8 px margin outside it (`max(0.36 × size, 3)` and `max(0.12 × size, 1.5)`, `text/span.rs:95-97`). The radius is 5 pt, capped at half the chip's height (`text/pill_chips.rs:73`). `PillStyle` sets only the chip colour, text colour and icon (`el.rs:355-368`), so the metrics can't be styled at the pin, and changing them means patching rune. The spec asked for 0 × 3 padding and `radius.1`; whether the design takes rune's metrics or records a deviation is settled in `visual-language.md`. Transparent pills, used to keep plain-text IDs and paths whole, take the same room, so `Contract K·40cc` showed a double-space gap on each side (looked at, `out/side-by-side/corpus-pills-2x.png`).
4. **Render keeps its own code-block element**, with no wrap and the 2 px gold rule. rune-kit's code block wraps long lines (`rune-kit/src/markdown/render.rs:329`), has a radius of about 6 and no gold rule (looked at, `out/fences.png`).
5. **tree-sitter is optional.** rune-kit's 13 scanners colour code through an Ember map (§5a). TOML and Elixir render plain for now.

## 3. Components: what rune gives and what Render writes

| Need | rune at the pin | Render writes | Evidence |
|---|---|---|---|
| **Prose wrapping** | Native wrap at the measure. `El::pills` keeps a byte range whole, and its chip takes room in the line (`el/pills.rs:8-24`). `.wrap_anywhere()` keeps a token longer than the measure inside it | Pills for inline code, references, and plain-text IDs and paths up to 40 characters. A pill covers the whole space-delimited word, because a pill's edges are break points and punctuation would otherwise be orphaned | measured: 0 atomic splits (§7) |
| **Line data for tests** | AccessKit `TextRun` nodes give each line of `selectable` text its byte range and box (`a11y/text.rs`). Text over 64 KiB gets no per-character runs (`a11y/text.rs:11`) | Prose blocks are `selectable(true)`; without it they have no runs | measured: the wrap check reads its 2,286 lines this way |
| **Selection and copy** | `selectable`, `selection_group` (one selection across blocks), `uncopied(range)` and `selection_copy` (README:1355-1430) | The streaming caret, a drawn `▏` marked `uncopied` | measured: copy equals the source bytes, 694/694 |
| **Markdown** | rune-kit `Markdown`: pulldown-cmark 0.13 with tables, strikethrough and task lists; a streaming tail that closes open spans; blocks keyed so an append never remounts earlier ones; link and highlight hooks; `mermaid` fences | Footnotes, GFM alerts and YAML frontmatter, which the kit lacks. An Ember `MarkdownStyle` (about 20 lines). Prose paragraphs with pills, because the kit draws inline code as a span background, which can split and doesn't take room (`rune-kit/src/markdown/render.rs:161-170`). Code blocks (§2). The dialect stays CommonMark plus GFM tables, task lists, strikethrough, autolinks and footnotes, GFM alerts, YAML frontmatter and `mermaid` fences; HTML, math and wiki links stay literal | measured: the streaming and cold costs ran on the kit (§7). The kit has no hook to swap its code block, so how Render's blocks combine with the kit's is settled with SC-04 (§8) |
| **Virtual list** | `El::virtual_rows(count, est, key, build)` mounts only visible rows, keyed. Measured height corrections keep the visible key in place, and `virtual_rows_version` makes commits O(1) for 10k+ rows (`el/virtual_rows.rs:76-94`) | Rows keyed by message ID, with the cursor on an ID (`../spec.md`, "Pinning and the frame boundary") | measured: 10k scroll (§7) |
| **Keys** | `on_physical_input` (down, up and repeat), `on_key_up`, `tx.key_repeat()`, `tx.physical_key()` and `tx.input_time()`, the NSEvent timestamp (claimed). Keys queue and run in the next frame, after `poll` has applied host events (`runtime/frame.rs:420-455`) | Key pinning: `poll` copies the cursor-target state before it applies host events, and keys resolve against that copy (about 3 lines plus a field) | measured in a `Runtime` test (§7) |
| **Text input and IME** | `App::on_ime` with `.ime_cursor()` gives preedit and commit to an app-drawn editor. winit sends no key events during preedit, and rune also drops Return and Escape while composing (`runtime/input/keys.rs:19`). With no `ime_cursor` drawn, Normal mode gets plain letters | Nothing for the basic guard. The real-IME run settles `jk` and `M-⏎` (§8) | source; real IME pending |
| **Modal controller** | — | About 1,000 lines with no GPUI dependency (`experiments/gpui-spike` `core/src/editor.rs`, 16 tests). It carries over unchanged and drives the prompt, composers, decision note and edit buffer | reasoned |
| **Headless rendering and tests** | Any app binary takes `--snap x.png` (headless Metal) and `--tree x.json` (every element's box and text). `Runtime` runs in `cargo test` with scripted keys, key-up, IME, pointer and paste on a fixed clock, plus `elements()`, `find()`, `presented()` and `accessibility_json`. `rune-ref` is a CPU reference renderer for goldens | The reading checks run on rune's own layout through these | measured: every spike check used them |
| **Layout gaps** | No baseline alignment across a row's children (`el.rs:306-311`), no per-side borders, no caret in static text | Mixed sizes inside one text share a line through spans; separate texts in a row are placed from Render's own metrics; a per-side border is a 1 px element | looked at: SC-03 |
| **Webview** | None; `NativeSurface` is for video | Only the future canvas needs one. Revisit then | source |

## 4. Fonts and icons

- **Bundled faces (the owner's choice):**

  | Role | Face | Release | Licence |
  |---|---|---|---|
  | mono (code, IDs, keys, fixed numeric columns) | Iosevka | v34.9.1, 2026-10-24 (`PkgTTC-Iosevka-34.9.1`) | SIL OFL 1.1, no Reserved Font Name |
  | chrome and prose | Iosevka Etoile | v34.9.1 (`PkgTTC-IosevkaEtoile-34.9.1`) | same |

- **Registration.** Faces go in through `AppSpec::fonts` as `&'static [u8]`. rune builds its font collection with system fonts off (`text.rs:254`), so the bundled faces win by construction and the Iosevka copies installed on this Mac never take part. System files load only by file-name fragment, for symbols, CJK and other script fallback (`text/system_fonts.rs:12-16`). Colour emoji draw as RGBA (`text.rs:116-129`).
- **Split the TTCs.** Registered raw, each TTC's Oblique face wins over its Italic: both carry the italic flag, and the Oblique comes first. So the 4 italic roles resolve to Oblique (measured: 8/12). Render splits out the 16 faces it uses, upright and Italic at 400, 500, 600 and 700 in each family, in about 45 lines: 12/12 (measured). The spike split at startup; Render splits at build time and ships the split faces, because reading and splitting 348 MB of TTCs dominates a debug snap (measured) and would weigh on cold start (reasoned). GPUI needed the same splitter.
- **Startup check.** Each role must resolve to its bundled face. The proof is the glyph run's font blob in the Parley layout plus the face's name, weight and synthesis flags, never the family name or an advance. Measured: the check fails with registration removed (0/12) and with the installed Etoile registered instead (5/12). An unknown family silently falls back to the sans slot (`text.rs:308-311`), and the check catches it (measured). The mono role must be monospace: 100 columns at 14 px measure 700.000 px at weights 400 and 700 (measured). Both families keep one advance across weights (measured 10-29), so bold never reflows a line.
- **When the check fails:** mono falls back to Menlo and Etoile to the system UI font, with a notice in the echo area and `measure.prose` recomputed. On rune those faces aren't reachable by name, because system fonts are off, so Render reads their files and registers them itself (reasoned; not tried).
- **Ligatures.** rune turns off `liga`, `clig`, `calt` and `dlig` on mono-slot runs (`text.rs:629-675`): 0 of 72 code clusters were substituted (measured). A run that names the family "Iosevka" instead of using the mono slot keeps Iosevka's contextual alternates (40 substituted), so code always uses the mono slot.
- **Smoothing.** Render sets `FontSmoothing::Off`. With rune's default smoothing, text drew heavier than the mockups; with it off, it matched (looked at, `out/side-by-side/SC-03-crop-mockup-smoothOn-smoothOff.png`).
- **Measure.** `measure.prose` is 600 px at 14 px (`visual-language.md`, "Measure"). The spike computed the earlier design's value through rune from the bundled reference paragraph: 548 px at 15 px (measured: 550.10 → 548). Re-running that check at 14 px is owed (Q49).
- **Glyph widths (measured, E-MYGO-TEXT T3).** In Iosevka's default spacing `— → … ⏎ ▸ ↺` are two cells wide and `· ⟨ ⟩ ␣ • ◦` one. Monospace lines snap fallback and wide glyphs to cells, which is Render code (rune's `El::advance_in(Run, at)` places a run at a column, `el.rs:1234-1238`). Column widths and truncation count those six glyphs as two cells.
- **Settings.** `ui.font.mono` stays configurable, and `ui.font.ui` is gone. `ui.theme` in `~/.config/render/client.toml` switches the variant live with `␣ht`. rune springs colour changes in OKLab by default, so Render switches with `Tx::instant()` to change tokens within one frame (source, README:47-50).
- **Icons.** IBM Carbon (`@carbon/icons` 11.90.0, Apache-2.0), bundled as SVG paths and drawn with rune's `icon(&Icon, size)`, tinted with `.color()`. rune reads an SVG subset: path, rect, circle, ellipse and line (`text/icon.rs:1-12`). The spike converted 56 Carbon icons with a generator, and they drew correctly in SC-03 (looked at).

## 5. Mermaid

- **Decision: `rune-mermaid`** from the rune pin, in the client. It parses and lays out Mermaid in Rust and draws it with rune shapes in the app's fonts, with no JavaScript, web view or network (`rune-mermaid/src/lib.rs:1-5`). It replaces the Pele, QuickJS and usvg/resvg pipeline, so Render needs no JS engine, no Etoile measurer for Pele and no SVG cache. rune-kit's `Markdown` draws `mermaid` fences with it (feature `mermaid`), also while a fence is still streaming, and offers `diagram_font`, `diagram_max_width` and `diagram_frame` (source).
- **Strip styles first.** rune-mermaid honours `style`, `classDef`, `class`, `:::class` and `linkStyle` tints and sequence `rect` bands. Render strips them before layout, so content can't paint chrome colours.
- **Theming.** Diagrams are shapes in token colours, so a variant switch recolours them like any other element, and nothing is re-rasterised (reasoned).
- **Label fit.** Layout and drawing use the same text system, so the measurer mismatch Pele had can't arise (reasoned).
- **Spike result** (looked at, `out/mermaid*/contact.png`, `out/side-by-side/SC-14-*.png`): all 13 spec figures render. Polish is owed:
  - labels wrap oddly;
  - with the Ember style, fig02, fig07, fig09 and fig12 have labels of about 10 px, below the 12 px rule;
  - fig05 keeps a blue `rect` tint, which the strip removes;
  - fig03 and fig07 are wider than 1,512 px.
- **Not checked:** label sizes against the 12 px rule in detail, and what a malformed diagram shows. The kit shows source as a code block for what rune-mermaid doesn't cover; the spec wants the error's line and column.
- The host serves Mermaid source only. Fit, full view and tokens are in `visual-language.md`, "Diagrams and the canvas boundary".

## 5a. Syntax highlighting

- **Highlighter: rune-kit's scanners** (`rune-kit/src/syntax.rs`), hand-written and linear-time, for Rust, JavaScript/JSX, TypeScript/TSX, JSON, Python, Go, Swift, shell, SQL, HTML/XML, CSS, YAML and diff. Their token kinds map to Ember through `SyntaxTheme` (looked at: Ember colours map cleanly, `out/fences.png`). Ember's syntax tokens are in `visual-language.md`, "Syntax highlighting".
- **v1 coverage.** Of the 12 v1 languages, the kit colours rust, ts/tsx, js, json, yaml, bash, sql, python and diff. **TOML and Elixir render plain for now.** Markdown fences have no scanner either and render plain. Unlabelled fences and every other language render plain, with no guessing.
- **Aliases** are the kit's (`rune-kit/src/syntax/scan.rs:54-72`): for example `sh`, `bash`, `shell` and `zsh` for shell, `yml`, `patch` and `jsonc`. Render adds its own rows, such as `console` for shell, in a `Highlighter` that falls back to the kit.
- **Limits (source):** colour only, with no bold or italic per token kind. Only the first 32 KiB and 8,192 ranges of a block are coloured, and the rest draws plain. Results are cached per language and code. The kit highlights while building the view, not on a worker; it claims 0.01–0.5 ms per thousand lines.
- **tree-sitter later.** `Markdown::highlight` and `Highlighter::new` take an app highlighter that falls back to the built-in scanners, so tree-sitter grammars can be added per language without a design change. The earlier tree-sitter plan, with its 23-language target set and the HTML prototype's highlight.js stand-in, is in this file at commit `fd270d7`.

## 6. Latency and pacing targets

The ambition's "keystroke→frame p99 ≤ 8 ms" counts presentation, and with vsync it is very likely unattainable: up to one frame of waiting before drawing and one before scan-out (**reasoned**, `experiments/gpui-spike/report.md`). Replacement targets (**proposed**):

| ID | Target | On rune so far | Status |
|---|---|---|---|
| L1 | Processing: OS key-event timestamp → frame committed for presentation, p99 ≤ 4 ms, idle and under a 4 × 2,000 tok/s firehose | Headless frame CPU p99 3.52 ms with 4 streams arriving and 1 visible; key latency not measured | headless frame pass; **on screen pending** |
| L2 | Presentation: key event → first presented frame showing its effect, p99 ≤ 2 refresh intervals (20 ms at 100 Hz, 16.7 ms at 120 Hz) | not measured | **pending** |
| L3 | Pacing under the firehose: ≤ 1 % of frames late by more than one refresh interval; no hitch > 50 ms; held-key scroll with no hitch > 33 ms | Headless 10k wheel scroll p99 3.31 ms, max 6.62 ms; nothing on screen | **pending** |
| L4 | Incremental Markdown parse p99 ≤ 2 ms per frame at 4 × 2,000 tok/s | `pulldown-cmark` 0.027–0.030 ms (E-MYGO-TEXT; a property of the crate). The kit re-parses from the start of the last top-level block | **pass** |
| L5 | RSS ≤ 500 MB after 10 min with 10k messages loaded and the firehose running | not measured | **pending** |
| L6 | Cold start to a usable queue ≤ 1 s | Claimed: about 300 ms to the first window. Measured headless: the 10k transcript's first frame 70 ms; building the text system with the split faces, TTC reading included, 144 ms in a debug test | **pending** in a release bundle |

**Four live streams side by side** cost 20–28 ms frame CPU p99, over L1 (§7). The owner accepted it: they "are unlikely to be an issue, not a common layout for now, and is still acceptable anyway".

Design rules:
- **Host events apply at frame boundaries; keys resolve against the last drawn frame.** On rune a key runs in the next frame, after `poll` has applied host events, so `poll` pins the drawn state first (§3). After a rest, the frame a key wakes draws at once (`platform/display_link.rs:1-3`). While frames are already running, as under a stream, a key waits for the next display tick, and that wait counts against L1 (reasoned).
- **Render at most once per display refresh.** rune submits one drawable per CVDisplayLink tick and paces at the Low Power Mode cap (source, `platform/display_link.rs`). Host updates and stream deltas coalesce between frames.
- **Never block key handling on drawable acquisition.** rune calls `nextDrawable` on the main thread (`gpu/metal/surface.rs:132`), so a key can wait behind it. The on-screen test measures this.

**Measuring L2.** rune's `--native --trace` reports `present_ms` from Metal's `presentedTime`, which read 0 on this Mac in round 2. L2 therefore needs an external screen-capture harness, calibrated on Terminal.app, with the app launched by `open`. Native apps at 100 Hz already measure p99 23–34 ms there, above L2's 20 ms, so the target may need revisiting once measured.

## 7. E-RUNE-1 results

Timed runs used the perf profile, headless, with no GPU present; load was mostly 3–8 and is recorded in each JSON.

| Check | Result | Evidence |
|---|---|---|
| Fonts | 12/12 roles resolve to bundled faces once the TTCs are split (about 45 lines). Raw TTCs give 8/12: italic resolves to Oblique | measured, `out/R1-fonts.json` |
| Code runs | 0 ligature substitutions in 72 clusters; 100 columns at 14 px = 700.000 px | measured, `out/R1-fonts.json` |
| Wrapping | 0 atomic splits over 2,286 lines (54 corpus and 640 stress blocks, 694 in all); copy equals the source bytes, 694/694; no line wider than the measure. With pills removed, 55 stress splits, so the check bites. 100 breaks after hyphens, for information. One unfixed case: a line can start `-tail` after a code pill | measured, `out/R2-wrap.json` |
| SC-03 chat | Close to the mockup in about 600 lines of Render code plus 58 generated icon lines, with `FontSmoothing::Off`. Easy: tokens, 1 px rules, tinted icons, chips, solid underlines, tool tints, the scroll pinned to the bottom, the side pane. Fought: per-side borders, a caret in static text, fixed pill metrics. Approximate: scroll offset and bufferline spacing | looked at, `out/side-by-side/SC-03-mockup-vs-rune.png` |
| Streaming, 4 arriving, 1 visible | Frame CPU p50 1.43, p99 3.52, max 4.13 ms: pass | measured, `out/R5-firehose-fed4-vis1.json` |
| Streaming, 1 stream | p99 3.67, max 8.86 ms | measured, `out/R5-firehose-fed1-vis1.json` |
| Streaming, 4 visible side by side | p50 9.50, p99 28.4, max 37.3 ms in the saved run; the spike report gives p99 20.7–28.4 ms. Miss: commit dominates, with 22k elements mounted. Accepted by the owner (§6) | measured, `out/R5-firehose-fed4-vis4.json` |
| Cold message (about 11.5 KB) | First frame p50 5.44, max 6.88 ms: pass | measured, `out/R5-cold.json` |
| 10k transcript | Wheel scroll p99 3.31 ms; anchor drift 0 over 38 checks; first frame on open 70 ms | measured, `out/R5-scroll.json` |
| Key timing | Keys wait for the next frame and act on the state after `poll`. With `poll` pinning the drawn state (about 3 lines plus a field), the key acts on what was drawn. `input_time` is `None` headless | measured, `out/R6-keys.json` |
| Hot patch | 5/5 patched, median 0.65 s (the first 2.36 s), state and PID kept, on the 33-line `hot-hello`. An empty `libdeps-*.a` link failure recurred after a killed session; deleting the file fixed it | measured, `logs/hot.jsonl` |
| Edit → headless PNG | Median 4.44 s (build 2.65 + snap 2.04) over 11 cycles on a crate of about 650 lines, max 8.1 s; 18.3 s once, when rune-kit rebuilt after a feature change | measured, `logs/loop.jsonl` |
| Mermaid | 13/13 render; polish owed (§5) | looked at |
| Highlighting | Rust, TS, JSON, sh, Python and diff coloured in Ember; TOML and Elixir plain; the kit's code blocks wrap long lines | looked at, `out/fences.png` |

## 8. First implementation tests (not yet verified)

1. **On-screen key latency** in a real window: L1 on screen and L2, including the wait for the next frame and `nextDrawable` on the main thread (§6).
2. **Real IME:** `jk` and `M-⏎` in Insert under a Japanese IME and a Chinese IME in ASCII mode, Google Japanese Input, and dead keys.
3. **NSEvent `input_time`** in a real window; it is `None` headless.
4. **The SC-04 Markdown screen,** which also settles how Render's code blocks and pill paragraphs combine with rune-kit's Markdown (§3).

Also unchecked: hot patch on a real-sized crate; Mermaid labels against the 12 px rule; a jump scroll across the full 10k transcript; L3, L5 and L6 in a release bundle; the font fallback path (§4).

## 9. Fallbacks

The fallbacks matter only if a test in §8 fails with no Render-side fix.

- **GPUI first.** The round-2 plan: `gpui-pre` pinned `=0.3.10` (Zed@08cbb88). Its next bump is the first snapshot at or after Zed `0373366f43`, which needs macOS 12 and Rust ≥ 1.98.1 and must set `low_power_frame_interval` and `thermal_frame_interval` to `None`. On GPUI, Render writes its own greedy line breaker (native wrap broke the rules 247 times on the round-2 corpus and stress set, Render's breaker 0), the same TTC splitter, its own IME guard and its own virtual list, and runs Mermaid through Pele in QuickJS with usvg/resvg and highlighting through tree-sitter. No GPUI Kit: its TextView streamed 35–145× slower. Edit loop: rebuild to headless PNG, dev profile, median 8.1–12.8 s; hot reload 0.68 s median with state kept (measured, `stack-3/baseline/report.md`). The full plan is this file at commit `fd270d7`.
- **mygo second.** Go. Its text spike matched GPUI in quality, with warm streaming layout p99 1.5 ms; rebuild to PNG 0.8 s; CPU raster tests; hot reload restarts the process, so state is lost.
- **nsh dropped.** Its backend owns line breaking and `calt` can't be turned off, and it has no key-up, key codes or timestamps (`stack-3/nsh/report.md`).
