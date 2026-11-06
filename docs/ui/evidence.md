# Evidence for the Render UI spec

Every claim here carries one label:
- **measured:** a check ran and wrote an output file. Each result names the check, what it measures and where it ran;
- **looked:** a person judged a rendered image by eye;
- **reasoned:** argued from the above, from source code or from the server spec, not run.

Targets and decisions that nothing has measured are in §6, and everything still owed is in §7. Paths are in the design workbench, `~/dev/render-ui-design/`, unless they start with `docs/`. No estimate is presented as measured, and no check is claimed that wasn't re-run on the Brief.

**Neither prototype is the client.** The Brief prototype (`experiments/e10-modern/proto/`) draws the design in HTML with scripted data; the earlier prototype (`experiments/html-proto/`) implemented the grammar, adapter and reducer against a scripted fake host. Their results show that the *design* holds its rules. They say nothing about rune's text rendering, latency or input handling, which §3 and §7.1 cover.

## 1. The Brief prototype (2026-11-06)

**What it is.** `build.mjs` renders 76 preset states headlessly in Chromium at 1512 × 982 (74 states plus 2 neutral variants; Ember dark, 3 Light, 4 at 800 px, 2 at 1200 px). 69 of them are the images in `docs/ui/mockups/`, byte-identical to this run. The 7 not copied are `brief-spoof` (it exists for the Spoof check), the two neutral variants, `brief-q1`, `brief-waiting`, `decision-option2` and `states-unknown-row`. `checks.js` runs inside every state and writes `png/checks.json`; the final run is 2026-11-06 20:05, after the owner's changes that day and the challenge rulings (dashed disabled segments, `lastActivity` on the content bar, Insert-only footers, muting under every float, no chips in the echo row). `mutants.mjs` seeds faults. Faces are the bundled Iosevka and Iosevka Etoile at Chromium's hinting. Data is static (`data.js`, `data2.js`), not the fake host.

### 1.1 Measured: ten checks on every state

| Check | What it measures | Result |
|---|---|---|
| **Chips** (KL20) | Printed key chips at first sight: the stage holds at most 3 (Track row included), the statusline at most 1, the echo row none; floats and composer footers are exempt | 168 chips over 76 states: 91 in stages, 15 in statuslines, 62 in floats and footers; 0 states over the budget |
| **Resolve** (KL17) | Every visible chip's key resolves in the context active where it is printed: the stage's tab, Insert, the open float, the statusline, writes off. While a readback is open only its own chips are judged | 0 unresolved, strict in Insert: footer chips resolve only against `keymap.toml`'s Insert bindings (`Esc`, `jk`, and `⌘⏎`/`M-⏎` in chat) |
| **Coral mass** | Solid coral areas larger than the caret (8 × 21 px) and wider than a 3 px rule, the `◆` tag excluded: at most 1 per state, none on a calm state | ≤ 1 in all 76 states; 0 in 46 |
| **Contrast** | Every visible text element against the surface it actually sits on (4.5:1, or 3:1 when large), and every mark (icons, slot pips, ticks) at 3:1 | 0 failures over 9,985 text elements and 2,386 marks. The knocked-out text on the coral head is 6.51:1 in Ember and 4.55:1 in Light |
| **Measure** | Characters per full line of 14 px prose in the text column, by word wrap | 41 states with a prose column, all 600 px wide (at 1200 px too): 60–78 characters per full line; 79 by mean advance (7.6 px) |
| **Dim** | While any bottom float is open, every chip and action segment outside it is `fg.muted`; in Insert, the Track row's chips and the statusline's `:w` are muted too | 15 float states and 3 Insert states, 0 failures |
| **Counts** | Every count printed more than once agrees, and a count with a selector equals the number of things it counts | 240 counts, 0 failures |
| **Drift** | How far each margin note sits below its anchor; stubs may drift | 126 notes over 33 states: full notes other than the cursor's ≤ 39 px below their anchor; the cursor's own note, which the rule exempts, reaches 44 px in `review-1200`; 42 stubs |
| **Overlaps** | Margin notes against each other and against wide code blocks (not a general box-overlap test) | 0 |
| **Spoof** | Elements marked as agent content shaped like chrome: no icon, fill or chip, the Etoile face, no text transform, inside the text column, not coral | 26 states pass, including `brief-spoof`: a Running row whose `lastActivity` reads `approved by you · merged main` stays on the content bar in Etoile, with no icon, fill or chip. A regression guard over the prototype's own fixtures; the client's SPOOF fixture is still owed (FC-S23, FC-S25) |

76 states × 10 checks: 760 of 760 pass.

**Seeded faults** (`mutants.mjs`): 8 of 8 caught. A chip that refuses on the Brief (`␣aa` on a row) and `:w` while offline trip Resolve; a live segment under a readback, `:w` live under the palette and a Track chip live in Insert trip Dim; a chip in the echo row trips Chips; a tag that disagrees with the title and a CARRIES count that disagrees with the saved notes trip Counts. Coral mass, Contrast, Measure, Drift, Overlaps and Spoof have no seeded fault.

**Frame geometry** (measured from the DOM boxes in the wire renders, `docs/ui/wireframes/wire-*.png`): tab bar 0, 0, 1512, 36; Track row 0, 36, 1512, 40; stage 0, 76, 1512, 854 on work views and 0, 36, 1512, 894 on the Brief and lists; peek 972, 36, 540, 894; the float with the `:` line 0, 678, 1512, 252, with a decision readback 0, 717, 1512, 213; statusline 0, 930, 1512, 26; echo row 0, 956, 1512, 26.

### 1.2 Looked

- **Before the challenge:** 15 of the builders' 16 picks and every state a ruling touched (`design/alt-modern/direction.md` §10).
- **After the challenge,** in full or by crop: `brief-landing`, `brief-merge`, `brief-since-restore`, `brief-800`, `review-readback-stale`, `review-delegated`, `review-spoof`, `review-notes`, `review-800`, `states-fresh`, `states-stale-basis`, `frame-host-offline`, `frame-leader-a`, `frame-cmdline`, `decision-q1`, `decision-q1-neutral`, `proposal-eligible`, `proposal-eligible-neutral`, `proposal-url`, `evidence-matrix`, `list-proposals`, `list-agents`, `list-slices-k`.
- **On the final run (2026-11-06 20:05),** in full: `brief-landing`, `brief-k`, `brief-1200`, `review-1200`, `review-notes`, `chat-steer`, `review-composer`, `decision-insert`, `frame-leader`, `frame-leader-a`, `frame-cmdline`, `list-proposals`, `list-slices-k`, `states-unknown`, `frame-host-offline`, `states-revoked`, `states-stale-basis`, `review-delegated`, `brief-spoof`, `proposal-url`, `states-offline`, `brief-800`, `list-slices-filter`, `states-unknown-row`, `frame-status-visual`, `wire-brief-landing`.
- **On the final run, at half scale** in contact sheets: every other state, including `brief-nothing-changed`, `review-readback-stale`, `proposal-not-eligible`, `states-op9`, `decision-readback`, the `chat-*`, `evidence-*`, `proposal-*` and `review-*` states and the Light states.
- **Not opened on the final run:** the wire renders other than `wire-brief-landing`; their region boxes were checked from the printed geometry only.
- **Where the renders differ from the text:** `docs/ui/mockups/README.md`.

### 1.3 Reasoned, not run on the Brief

- **Since you left.** The since line, the `ui.strong` changed rows and `za`'s list are fixture data. Presence detection (window key and visible, screen awake, input within 5 min, the Brief tab focused), the frozen return base and the restore case are not built (FC-M67, FC-M68, FC-M70).
- **Pointer.** The prototype has no pointer code, so the 400 ms readback discard and click targets are unmeasured (FC-T22).
- **Key paths.** The main paths were driven by real keys; the list `K` toggle is rendered only (`list-slices-k`).
- **Re-entry.** That the Brief answers the five handover questions in ≤ 10 s, cold, is the design's claim, not a result.

## 2. The keymap lint (2026-11-06)

| Run | What it checks | Result |
|---|---|---|
| `experiments/html-proto/tools/lint.py` on `docs/ui/keymap.toml`, patched for `<D-x>` (Cmd) keys | KL0 KL1 KL2 KL4 KL5 KL7 KL8 KL9 KL10 KL12 KL14 KL16 | **0 violations** on 115 entries (109 commands, 6 modal key sets) and 176 bindings, after the splits were removed and the `handover` and `slices` contexts added. KL10 compared against a cheat sheet generated in the same run, because the package has no committed one. **KL8 fixed:** its desc-length check ran only over bound commands, so the ex-only `app.quit` (33 characters) passed; the check now covers every command, and `app.quit` was shortened. KL4 also treats the handover overlay's key set (mode `ho`) as a place authority never binds |
| Its unit tests, `tools/test_lint.py` | The rule implementations | 18 of 18 pass |
| Seeded mutants generated from the package keymap (`tools/make_mutants.py`, pointed at it; output in a scratch folder) | Each mutant is the real keymap plus one violation, and must newly trip its own rule | 15 of 15 trip their rule, re-run on the final keymap. The report's "overall FAIL" comes only from its hard-coded size check (116 commands, 184 bindings, the earlier keymap) |
| The later lint, `experiments/e9-colour/d/tools/lint.py`, from a scratch copy with the same `<D-x>` patch | The rules above plus KL18 (Vim built-ins) | **0 violations** |
| KL17 and KL20 | At render | §1.1 |
| KL19 (chrome copy table) | — | **Not implemented** by either lint. Owed with the chrome copy table |

The `<D-x>` patch: the key regex accepts `D`; KL9 treats a `<D-…>` binding as not terminal-representable, so it passes only beside a binding a terminal can send; KL14's Insert whitelist adds `<D-CR>`.

## 3. rune (E-RUNE-1, 2026-11-06)

Full results, evidence files and labels are in `docs/ui/reference/stack.md` §7. All headless, with no GPU present.

| Item | Label | Result |
|---|---|---|
| Fonts | measured | 12/12 roles resolve to the bundled faces once the TTCs are split; raw TTCs give 8/12 |
| Code runs | measured | 0 ligature substitutions in 72 clusters; 100 columns at 14 px = 700.000 px |
| Wrapping with pills | measured | 0 atomic splits over 2,286 lines; copy equals source, 694/694; with pills removed, 55 splits, so the check bites. One unfixed miss: a line can start `-tail` after a code pill |
| Transparent pills | looked | A double-space gap on each side of `Contract K·40cc` |
| Streaming, 4 arriving, 1 visible | measured | Frame CPU p99 3.52 ms |
| Streaming, 4 visible side by side | measured | Frame CPU p99 20.7–28.4 ms, over L1; accepted by the owner |
| Cold message, 10k transcript | measured | First frame p50 5.44 ms; wheel scroll p99 3.31 ms; anchor drift 0 over 38 checks |
| Key timing | measured | Keys act on the drawn state once `poll` pins it (a `Runtime` test). `input_time` is `None` headless |
| SC-03 chat | looked | Close to the mockup in about 600 lines; fought per-side borders, a caret in static text, fixed pill metrics |
| Mermaid | looked | 13/13 spec figures render; labels wrap oddly, four have labels of about 10 px with the Ember style |
| Highlighting | looked | Rust, TS, JSON, sh, Python and diff coloured in Ember; TOML and Elixir plain; the kit's own code blocks wrap |

**Not on screen.** Nothing above ran in a real window: on-screen latency, real IME and NSEvent timestamps are owed (§7.1).

## 4. Carried from the accepted package (`fd270d7`)

Each item says why it still applies. Results that measured the earlier layout, type or colour rules and no longer apply are listed in §4.6.

### 4.1 Grammar, wire and state behaviour (earlier prototype and fake host)

Still applicable, because the grammar, the adapter boundary and the reducer are unchanged; the Brief changed what is drawn, not how keys resolve or how wire data becomes state. Measured on the earlier layout.

| Pass | Result | Evidence |
|---|---|---|
| E-HOST | A deterministic fake host driving every designed state from wire data: 207 tests; 13 missing requirements and 7 contradictions with the ledger found | `experiments/fake-host/report.md`, `gaps.md` |
| TRAP | 587 + 287 runs, 0 target-pinning violations, including list-authority, scroll-past-stale, epoch-readback and mode-pin | `experiments/html-proto/report.md` (branch `phase5`) |
| COV | Tasks 25/25; every command reachable by keys (116/116, then 121/121 on the settings build); the checkpoint review with 3 notes and rework in 35 keys against 40; 0 pointer events | same |
| Restore H10 | Credential refused → re-pair → a new epoch with an older sequence accepted; every scope equals a fresh snapshot; old envelopes refused with `authority_epoch_mismatch`; receipt queries return `outcome_unknown_after_restore` | same |
| CONF | Unit 79/79; replay 29/29; live 105 events, 0 gaps. A second wire dialect changed only files in `adapter/` (9 files) | same |
| Multi-scope stream (RQ-43) | One stream for 8 scopes | `git show phase4:report.md` |
| Server-spec pass (`experiments/e8-*`) | `␣n`: 8/8 targets open and `C-o` returns; the recovery path refuses `␣ad` on the operation view, `⏎` opens SC-09, BINDS includes the observations, and each recovery option kind has one fixed NOT set; settings T27 = 8 keys, policy save and adopt 16 and 21 keys; `y` disabled on CHANGED and STALE; both rebase fixtures pass with no draft lost; a dial change leaves C1's basis digest unchanged | `e8-a-lineage`, `e8-b-readiness`, `e8-c-settings`, `e8-d-simplified` |

### 4.2 Colour, computed and measured on pixels

Still applicable, because the Brief kept every colour token. `design/tools/ember_tokens.py` computes the tokens from Ember's palette with Ember's own `blend`.

| Item | Label | Value |
|---|---|---|
| Tool-tint ΔE2000 (ember / soft / light): ok vs stage 10.9 / 10.8 / 10.3; failed vs stage 11.8 / 12.0 / 11.9; ok vs failed 20.5 / 20.3 / 20.5; unknown vs stage 8.3 / 8.7 / 8.4; unknown vs failed 6.3 / 6.1 / 6.6; running vs code 3.2 / 3.7 / 4.1 | measured on pixels, equal to the computed values (53 samples per variant, E-PROTO-4 and -5) | — |
| Contrast by token: neutral text worst 4.55; coloured chrome text worst 4.50; syntax worst 4.58 / 4.56 / 4.56; links 4.95 / 4.51 / 4.55; marks worst 3.81 / 3.44 / 3.48 | computed (11-02); the Brief's on-screen run (§1.1) now covers the pairs it drew | `docs/ui/reference/visual-language.md` §5.7 |
| Knocked-out text on the tags: coral 6.51 / 6.09 / 4.55, rose 5.09 / 4.76 / 5.00, mauve 5.11 / 4.77 / 4.79 | computed | `experiments/e9-colour/contrast2.py` |
| Colour-vision deficiency: state marks distinct by silhouette under three simulations; octagon vs `help` silhouette distance 0.736; ok vs failed tint under deuteranopia 3.8 / 3.7 / 3.1 computed, 3.5 / 3.9 / 3.0 on pixels, relied on by nothing | measured | E-PROTO-2, E-PROTO-5 |
| Accent share of a pane's text: transcript 4.8 % up to a calm list 49.5 %, accepted by the owner as a reported number | measured on the colour pass | `experiments/e9-colour/data/analysis.json` |

### 4.3 Fonts (CoreText on the bundled WOFF2, 10-29)

Still applicable: same faces and releases. Script `design/tools/font_metrics.swift`.

| Quantity | Value |
|---|---|
| Etoile x-height / cap height | 0.520 / 0.735 em |
| Etoile digits at 13 px | all 7.80 px (tabular) |
| Advance across weights | equal in both families (Etoile `m` 14.40 px at 16 px; Iosevka 7.00 px at 14 px), so bold never reflows |
| Etoile mean advance | 0.539 em. **The Brief's measure is reasoned from it:** 80 × 7.546 px = 603.7 → 600 px at 14 px. The accepted package's 548 px was 68 × 8.090 at 15 px. `stack.md` §4 now states 600 px at 14 px; the re-measure through rune at 14 px is owed (Q49) |

### 4.4 Human trials (the user, a frozen phase-3 build, 10-29/30)

Measured on a build two designs back (Plex chrome, 16 px prose, the old counts and marks). They shaped rules the Brief keeps, so they remain the reason for those rules, not a result for the Brief.

| Trial | Result | What it changed |
|---|---|---|
| (a) 5-second, 5 runs | 18/25; 5 of the 7 misses were the screen's own inconsistent counts | One state, one number (FC-M35); slots named (FC-M36) |
| (b) handover, 2 runs | 3/5 answers within 10 s in both runs; 9/10 correct; bare-dash fields took 10–15 s | No bare dash in a field (FC-R08) |
| (c) checkpoint review | 1 valid run: 310 s and 264 command keys against 35 scripted, with outside help to start a note; no baseline logged | The first-note hint and `␣mn` (FC-K19) |
| Style notes | Prose too big; a per-message bar unwanted | Prose now 14/21; no message bar |

### 4.5 Ledger shape (read-only counts of `~/skl-ledger`, 10-29)

- 851 Markdown files: 5,761 table lines, 1,033 task items, 1,320 nested list items, 245 h4 headings, frontmatter in 253 files; no footnotes, alerts or images.
- Fence labels: ts 18, sh 11, text 10, odin 3, sql 2, python 1, md 1, and 13 unlabelled. With rune-kit's scanners, ts, sh, sql and python are coloured; text, odin, md and the unlabelled ones render plain.

### 4.6 No longer applicable

- **READ** at four widths (WRAP 0/4,713, MEASURE 0/9,876, FIT 0/153,732, TRUNC 0/4,878 and the rest): measured the earlier layout at 15/24 prose and a 548 px measure.
- **VISUAL** coral and **SPOOF** 55/55: measured the earlier flag rules and side-pane lanes.
- **Readiness row, merge package and simplified-frame widths** (`e8-b-readiness`, `e8-d-simplified`): measured the earlier queue, card and strip.
- **Greyscale ranking** (E9): measured the earlier queue; the FC-M62 grey test on the Brief is owed.

## 5. The fallback stack: GPUI and mygo

GPUI is the first fallback and mygo the second (`docs/ui/reference/stack.md` §9). These results were measured for the earlier GPUI plan; they are now evidence about the fallback only.

| Item | Result | Evidence |
|---|---|---|
| GPUI spike, offscreen and in a real window | Processing p99 1.16–1.63 ms offscreen; paint p99 on a real window 1.21–1.99 ms; RSS after 10 min with 10k messages and the firehose 178 MB; cold start to a usable queue median 167 ms, max 1,015 ms; waiting for the next drawable p99 10.3 ms, max 29 ms at 100 Hz. Key → presented and pacing not measured: the present hook never fired | `experiments/gpui-spike/report.md` |
| GPUI Kit TextView | 35–145× too slow for streaming | same |
| Text on GPUI and mygo (E-MYGO-TEXT) | Render's own breaker over GPUI's single-line shaper: 0 violations on 54 corpus blocks and 640 stress paragraphs; GPUI's native wrapper 247, and it breaks at U+2060. Line ranges round-trip 695/695. `pulldown-cmark` incremental equals full parse at 15,000 deltas, p99 0.027–0.030 ms. mygo matched on these checks, slower at warm streaming layout | `experiments/text-gpui/`, `experiments/text-mygo/report.md` |
| GPUI trial bump to Zed main `ba63a02` | 0 compile breaks in the spike code; tests 16/16, 18/18, 5/5, 4/4 | `gpui-bump/report.md` |
| Mermaid through Pele in QuickJS (E-MERMAID) | 13/13 spec figures, ≤ 7.7 ms each; malformed input gives line and column, 5/5; usvg ignores the root `font:` shorthand | `experiments/mermaid-native/report.md` |
| Edit loop | Rebuild to headless PNG median 8.1–12.8 s; hot reload 0.68 s median with state kept | `stack-3/baseline/report.md` |

`pulldown-cmark`'s parse cost is a property of the crate, so it also holds on rune (L4 in `stack.md` §6).

## 6. Proposed: decisions and targets, not measured

- **Latency targets L1–L6** (`docs/ui/reference/stack.md` §6), including L2 ≤ 2 refresh intervals key → presented.
- **Type:** prose 14/21 at 600 px and `prose.small` 13/19 were chosen by the owner on renders (looked); reading comfort is unmeasured. `h3`–`h6` sizes were never drawn and follow the two-cues rule (reasoned).
- **Rune choices** (reasoned): the float's upward shadow with `box_shadow` at a negative y and disabled segments with `border_dash`, both present at the pin (`crates/rune/src/el/visuals.rs`); transparent pills only on tokens with an internal break opportunity, the stated default until Q45 is verified; the caret as an element, since rune has no caret in static text.
- **Widths between 1180 and 1512 px** (`docs/ui/wireframes/layout.md` §0.1): formulas and worked values, never rendered at 1200 or 1000 px.
- **Every wire requirement** in `docs/ui/protocol-requirements.md`, and the open requests in its §5: the server spec decides the real shapes.
- **Every default** in `docs/ui/open-questions.md`.

## 7. Owed: everything unmeasured

A failure in any item becomes an implementation fix, not a redesign, unless it shows a rule can't hold.

### 7.1 First implementation tests on rune (`docs/ui/reference/stack.md` §8)

| Test | Settles |
|---|---|
| **On-screen key latency** in a real window: L1 on screen and L2, with the wait for the next display tick while streaming and `nextDrawable` on the main thread | FC-P01, FC-P09 |
| **Real IME:** `jk` and `M-⏎` in Insert under a Japanese IME and a Chinese IME in ASCII mode, Google Japanese Input, and dead keys | FC-K14, FC-K21–FC-K23; the IME routing that the 11-02 skip left unsettled |
| **NSEvent `input_time`** in a real window (it is `None` headless) | FC-T06's timestamp discard |
| **The SC-04 Markdown screen** | How Render's prose paragraphs with pills and its own code blocks combine with rune-kit's Markdown, which has no hook to swap its code block; margin-note placement from anchor boxes after layout; the MD check |

Also unchecked on rune: hot patch on a real-sized crate; Mermaid labels against the 12 px rule and a malformed diagram's error; a jump scroll across the 10k transcript; L3, L5 and L6 in a release bundle; the font fallback path (Menlo and the system UI font registered from their files, since rune's system fonts are off); the transparent-pill gap; the `-tail` wrap miss; whether rune draws a box shadow; highlighting cost under the firehose (FC-P08).

### 7.2 Human trials

- **Re-entry:** the five handover questions in ≤ 10 s, cold (T01), and the server spec's V8 target of ≤ 2 min without chat.
- **The first-note trial** (FC-K19) and **discovery** through which-key with few printed keys.
- **The alarming-title trial:** a rose `h1` or page title beside a failure ("Build failed") (FC-S22, FC-S23).
- **FC-M62's grey test** on the Brief: does the needs-you flag still win at a glance without hue.
- **Mode and focus** (FC-K27, FC-T23) and the coral head read as "only this one" (FC-M66).
- **A review baseline** in the user's nvim and review TUI, which the ambition needs for "measurably better"; the reading comparison.

### 7.3 Behaviour the Brief prototype doesn't have

- Presence detection and the since-you-left record, with CONF fixtures for FC-M67, FC-M68 and FC-M70.
- Pointer behaviour: a click on the confirm chip doing nothing, the 400 ms discard after a float opens, and click targets (FC-T22, Q50).
- SPOOF fixtures on the Brief (FC-S25): agent text shaped like host words in an ask, and a `lastActivity` reading `approved by you · merged main` on a Running row; and evidence for FC-S23.
- The handover float's key set and the scroll that keeps the cursor row above every float (FC-T19).
- RQ-50's authorship marks from a host.

### 7.4 Checks for the implementation's suite

| Check | What it asserts |
|---|---|
| **READ on rune** (`visual-language.md` §4.7) | WRAP, MEASURE, FIT, DRIFT, TRUNC, CAPTION, HIER, CHROME, DIAGFIT, COPY, ALIGN, MD and REF at 1512, 1200, 1000 and 800 px, in all three variants, on AccessKit line runs and `--tree` boxes |
| **CORAL pixel test** | Mask within ΔE2000 5 of `state.attn`, erode 5 × 5: survivors only on the four solid places, at most one mass besides the tag, none when calm, none in agent content |
| **RENDER** | KL17 strict in Insert (no footer whitelist), KL20 with the echo row at 0 chips, DIM under every bottom float (not only readbacks), and COUNTS, on rune's own layout |
| **KL19** | The chrome copy table has no key display form outside a chip slot |
| **KEY-LINE** | Every one-row key line: first part visible, dropped parts a suffix of the written order, no chip cut |
| **Title fit** (FC-Q27), **class word**, **Proposals line 2** (FC-M49, FC-M50, FC-Q26) | Re-measured on the Brief's widths |
| **Readback fields** (FC-M38) | BINDS renders `request C2 · captured s2 · human`; missing values read `none` |
| **Key budgets** | T27 ≤ 8; T27b ≤ 21; known misses T32 (10 against 8) and T14 (5 against 4), both Q42 |
| **Colour not yet seen** | `kind.link_active` on the real client; selected text; diffs in Soft and Light; the current-match outline; in Light, a link and a rose `h1` are ΔE 0.8 apart |
| **Fixtures** | Rebuilt from the ledger, not by hand (FC-M24); the text mocks' one fixture (`docs/ui/wireframes/text-mocks.md`), which the prototype's data predates in places |
