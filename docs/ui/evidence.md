# Evidence for the Render UI spec

This file separates **measured** results (run, with an output file), **proposed** values (design decisions and targets, not yet measured) and **pending** checks (owed, not yet run).

Paths are in the design workbench, `~/dev/render-ui-design/`. Every measured result names where it was measured, and no estimate is presented as measured.

**The prototype is not the client.** The HTML prototype (`experiments/html-proto/`) implements the grammar, adapter, reducer and rendering rules in a browser, against a scripted fake host (`experiments/fake-host/`). Its results show that the *design* behaves as specified. They say nothing about GPUI's performance or text rendering.

## 1. Measured

### 1.1 Prototype passes (HTML prototype + fake host)

| Pass | What was measured | Result | Evidence |
|---|---|---|---|
| **E-HOST** (phase 1) | A deterministic fake host driving every designed state from wire data | 207 tests; 13 missing requirements and 7 contradictions with the ledger found | `experiments/fake-host/report.md`, `gaps.md` |
| **E-PROTO** (phase 1) | Grammar against the fake host | 125/125 commands reachable; 0 pointer events over 24 task runs; checkpoint review with 3 notes and rework in 35 keys; 0 target-pinning violations in 545 runs (v0) and 245 (v0b), after 4 real violations were found and fixed; 16/16 lint mutants caught; conformance 28/28 | `html-proto` tag `phase1`, `results/` |
| **E-PROTO-2** (phase 2) | Reading rules and the Ember visual pass | READ 0 failures at 1512/1200/1000/800 px (WRAP 0/379, MEASURE 0/917, FIT 0/19,435, TRUNC 0/787, HIER 0/64), against 5 of 6 checks failing on the phase-1 build; 0 stray coral pixels in 75 shots; state marks distinct by silhouette under three CVD simulations; TRAP 554 runs, 0 violations | `git show phase2:report.md` |
| **E-PROTO-3** (phase 3) | Etoile prose, surface split, accent roles, tool tints, Markdown, references (host spans), syntax, explorer | Every new check red on phase 2 and green on phase 3. READ at four widths, 12 fixtures, 0 failures. MD: 70 constructs × 4 widths, 0. SPOOF 43/43. TRAP 582 + 282 runs, 0. COV 25/25 tasks, 115/115 commands | `git show phase3:report.md` |
| **E-PROTO-4** (phase 4) | Etoile chrome, stronger tints, breakout, sibling truncation, multi-scope stream (RQ-43) | Tool tints measured on pixels equal the computed ΔE values (§1.3). READ FACE 0/51,804. RQ-43: one stream for 8 scopes, fake host 263 + 3 tests. Two failures fed the next phase: the SVGFIT note box (stand-in) and `S18-gutter` | `git show phase4:report.md` |
| **E-PROTO-5** (phases 5–6) | Restore model, authority binding, reference index, breakout, structured rows, neutral coordinator, prose 15/24, ON THE HOST, slots, octagon, no message bar, `␣mn` | **The current design.** Fake host 290 + 3 passing, test-first; every new check red on phase 4 first, or shown sensitive by a mutant | `experiments/html-proto/report.md` (branch `phase5`) |

**E-PROTO-5 details**, all from `experiments/html-proto/report.md` (branch `phase5`) and its `results/`:

| Check | Result |
|---|---|
| Restore scenario H10 (live, v0 and v0b) | Credential refused → re-pair → a new epoch with an older sequence (18214 < 18402) accepted; every scope equals a fresh snapshot; old envelopes get `authority_epoch_mismatch`; receipt queries return `outcome_unknown_after_restore`. The same check fails on the phase-4 build |
| CONF | unit 79/79 (10 new, all red on phase 4); replay 29/29; live H1 105 events, 0 gaps |
| LINT | 116 commands, 184 bindings; 15/15 mutants trip their rule |
| READ (4 widths × 3 variants) | WRAP 0/4,713 · MEASURE 0/9,876 · FIT 0/153,732 · FIT-BREAKOUT 0/276 · TRUNC 0/4,878 · HIER 0/3,627 · CHROME 0/8,097 · CAPTION 0/1,686 · FACE 0/58,098 · COPY 0/20,001 · ALIGN 0/108 · REF 0 · SVGFIT 0 over 108 frames; recheck after two fixes: STRUCT 0/54, MD 0 |
| READ SVGFIT node box | **FAIL**: 6 of 990 labels outside their box, all Figure 1's two-line note (8.5 px). The cause is the mermaid.js stand-in; it is deferred to Pele |
| VISUAL (156 shots at 1512, 90 narrower) | coral 0 stray, 0 on calm screens; icons 0; budget 0; code frames 0/102; tool blocks 0/39; octagon vs `help` silhouette distance 0.736; readback target 0/9 |
| SPOOF | 55/55 on both v0 and v0b, including `S18-gutter` (failed in E-PROTO-4) |
| TRAP | 587 + 287 runs, 0 violations, including list-authority, scroll-past-stale, epoch-readback and mode-pin |
| COV | tasks 25/25, commands 116/116, review loop 35/40 keys, 0 pointer events |
| CONTRAST | text 456 pairs, worst 4.55; non-text 536 pairs, 0 failing |

### 1.1a The pass against the accepted server spec (copies under `experiments/e8-*`, HTML render, 2026-11-01)

No single build carries all of this; each row names its own copy. Reports: `report*.md` in each copy.

| Area | Measured | Copy |
|---|---|---|
| Pass lineage | 0 of 702 digests or IDs cut across 66 shots; all six lineage answers on screen, unclipped; no staleness word on an Audit line; the drift card reads `reviews 3 · limit 2 reached` | `e8-a-lineage` |
| Web outcome column | `ok · Tavily · Exa failed · 2.4 s` fits the 216 px column; the drop order held over 36 blocks; a forced fixture drops the provider second; `za` rows 18/18 whole, with identical bytes visible as a new observation over the same digest; `]t` reaches tool blocks | `e8-a-lineage` |
| Readiness row | P1–P12 fit, widest non-extreme 574 px at 1512; rows exactly 52 px in 30 states; P12 shows eligibility and promotion together on one line; the card holds four labelled fields on 13 of 13 fixtures. **Before the risk-first rule:** P13, a four-digit worst case, was 641 px at 1512 and cut the sticky risk at 800 (508 against 503 px); see §3 | `e8-b-readiness` |
| Proposal scope | Slices scope 62,623 B against a 64 KB budget; attention index 30,361 B against 37,406 at phase 5 | `e8-b-readiness` |
| Recovery path | `␣ad` refused on the operation view; `⏎` opens SC-09; BINDS includes the observations; each recovery option kind has one fixed NOT set across four states | `e8-b-readiness` |
| Merge package | Two layouts at 1512 and 800. Layout A cuts Slice names at 800 (two Slices read `evaluate-basic…`) and loses advisory rows and readiness below the fold. Layout B shows everything but CHECKS on the first screen at both widths; its row needs 651 px against 744 at 800, without K. `␣n` path works; the three advisory checks carry no mark and no count | `e8-b-readiness`, `report-8p.md` |
| Settings | Keymap lint clean with the settings commands; T27 = 8 keys; policy save and adopt = 16 from the policy row, 21 from the queue; 0 pointer events; readback 21.5 % of the window with three pending; `y` disabled on CHANGED and STALE; both rebase fixtures pass with no draft lost; C1's basis digest unchanged by a dial change | `e8-c-settings` |
| Delegated placement | A delegated request sits in WAITING and leaves ◆ at 3; the card and `K` hold the full approver forms | `e8-c-settings` |
| Simplified frame | Chrome on SC-02 −37.24 %, SC-04 −18.70 % (−16.15 % with the class in the breadcrumb) against phase 5; 13,173 against 15,758 characters over 66 screen-widths; ONE-NUMBER 0/183; no task's key count rose; READ FIT 0/153,741 | `e8-d-simplified` |
| Printed keys | `␣n`: 8/8 targets open, `C-o` returns, and at the target the authority key prints. KL17 on the last full frame: 0 of 2,940 chips over 540 screen-widths, plus the which-key `y` found and removed. The Vim built-in lint trips on its mutant | `e8-d-simplified` |
| Dropped: outline class icons | Measured and rejected: three 12 px icons were distinct in shape (silhouette 0.72–0.81) but a reader couldn't infer their meaning, and no task scans class | `e8-d-simplified`, `report-8e.md` |

### 1.2 Fonts (CoreText on the bundled WOFF2)

Script `design/tools/font_metrics.swift`, output `design/tools/font_metrics.txt`, sample `design/tools/measure-sample.txt`. The challenger reproduced these on the installed TTC.

| Quantity | Value |
|---|---|
| Iosevka Etoile x-height / cap height | 0.520 / 0.735 em |
| Etoile digits at 13 px | all 7.80 px (tabular) |
| Advance across weights | Etoile `m` 14.40 px regular and bold at 16 px; Iosevka 7.00 px regular and bold at 14 px |
| Iosevka, 100 columns at 14 px | 700.0 px (0.5 em) |
| `measure.prose` at 15 px | mean advance 0.539 em; 68 × 8.090 = 550.1 → **548 px** |
| Widest queue path at Etoile 13 px | 361.4 px |
| Etoile vs Plex Sans at 13 px | 1.16–1.28× wider (measured on 10-29 against E-PROTO-3's vendored Plex, since removed) |

### 1.3 Colour (computed by script, then measured on pixels)

`design/tools/ember_tokens.py` computes every token from Ember's `palette.json` and `palette.lua` with Ember's own `blend`. The table gives tool-tint ΔE2000 for ember / soft / light; each value was **measured identically on pixels** in E-PROTO-4 and E-PROTO-5 (53 samples per variant).

| Pair | Value |
|---|---|
| ok vs reading surface | 10.9 / 10.8 / 10.3 |
| failed vs reading surface | 11.8 / 12.0 / 11.9 |
| ok vs failed | 20.5 / 20.3 / 20.5 |
| unknown vs reading surface | 8.3 / 8.7 / 8.4 |
| unknown vs failed | 6.3 / 6.1 / 6.6 |
| running vs code surface | 3.2 / 3.7 / 4.1 |
| running vs reading surface | 7.8 / 8.0 / 7.7 |

**Contrast** (computed, then measured by CONTRAST in E-PROTO-5):
- worst text 4.55 (Light `fg.muted`);
- syntax worst 4.58 / 4.56 / 4.56;
- references 6.68 / 6.04 / 4.61.

**Colour-vision deficiency:**
- ok vs failed under deuteranopia is 3.8 / 3.7 / 3.1 computed and 3.5 / 3.9 / 3.0 on pixels. The two differ by simulation pipeline. Neither is relied on: the outcome word carries the meaning.

### 1.4 GPUI spike (offscreen and in a real window, phase 1)

Source: `experiments/gpui-spike/report.md`, `results/`.

| Quantity | Value |
|---|---|
| Processing p99 (offscreen) | 1.16–1.63 ms |
| Paint p99 on a real window | 1.21–1.99 ms |
| Incremental Markdown parse p99 (monospace cell layout) | 0.11–0.17 ms; 100/100 seeds equal to a full parse |
| RSS after 10 min with 10k messages and the firehose | 178 MB (offscreen) |
| Cold start to usable queue | median 167 ms, max 1,015 ms |
| GPUI Kit TextView | 35–145× too slow for streaming (why Kit is not used) |
| Waiting for the next drawable | p99 10.3 ms, max 29 ms on a 100 Hz window |

**Not measured:** keystroke → presented (L2) and pacing (L3). The present hook never fired.

### 1.4a Text on GPUI and mygo (E-MYGO-TEXT, offscreen, 2026-11-01)

Workbench `experiments/text-gpui/` and `experiments/text-mygo/report.md`; same samples on both stacks; failure cases written first, each check with a mutant.
- **Break rules:** Render's own breaker over GPUI's single-line shaper: 0 violations on 54 corpus blocks and 640 stress paragraphs. GPUI's native wrapper: 247; it also breaks at U+2060.
- **Line data and copy:** line ranges round-trip 695/695; copy across blocks 44/44, nothing inserted. Measure 550.1003 px → 548.
- **Streaming (L4):** `pulldown-cmark` incremental equals full parse at 15,000 deltas; parse p99 0.027–0.030 ms; with Etoile shaping and layout, warm p99 0.25 ms.
- **10k transcript:** 0 anchor drift over 20 seeds × 1,000 ops; cold layout p99 3.0 ms.
- **Fonts:** raw TTCs resolve 8/12 roles (italic upright); split selected faces 12/12; the installed Iosevka 34.0.0 and Etoile 34.2.1 match the bundled advances, so only glyph ids or tables tell them apart. Iosevka applies contextual alternates by default (20/24 tokens). `— → … ⏎ ▸ ↺` are two cells in Iosevka, one in Iosevka Term.
- **mygo** reached the same results on these checks, about 6× slower at warm streaming layout and 4–5× per cold message.

### 1.4b GPUI trial build on Zed main `ba63a02` (offscreen, 2026-10-31; `gpui-bump/report.md`)

- **Spike code:** 0 compile breaks; only the probe patch needed porting (52 lines).
- **Tests:** editor 16/16, failure cases 18/18, GPUI-level 5/5, pipeline 4/4; glyph-check verdicts identical to the pin.
- **Auto traits:** `WindowTextSystem` is `Send` but not `Sync` on main, `Send` + `Sync` at the pin.
- **Break checks:** Render's wrapper keeps `well-known` whole on both revisions, inserts nothing, and `shape_line` doesn't re-wrap. U+2060 holds on main and not at the pin.
- **Offscreen A/B:** no measurable processing difference, with one firehose outlier that did not reproduce and is unexplained. L5 soak 183.5 MB (pin), 185.1 MB (main).

### 1.5 Mermaid (E-MERMAID)

Source: `experiments/mermaid-native/report.md`.

| Quantity | Value |
|---|---|
| Pele 1.12.0 in QuickJS | 13/13 spec figures with every label, ≤ 7.7 ms each (median 1.59 ms) |
| Malformed input | error with line and column, 5/5 |
| QuickJS output vs Node | SVG byte-identical |
| rusty-mermaid | 9/13, rejected |
| `strip_styles` | needed: 4 figures leak styles without it |
| usvg 0.49 and the root `font:` shorthand | ignored; text falls back to `Options::font_size` (measured in E-PROTO-3) |
| Natural widths (Plex Sans, `fontSize` 17) | median about 1,090 px, maximum 1,340 px |
| Etoile vs Plex widths (mermaid.js stand-in) | 0.99–1.14× |

### 1.6 Human trials (the user, frozen phase-3 build, 10-29/30)

Source: `trial-notes.md`, `experiments/trial-phase3/results/human/*.jsonl`. **Caveat:** these ran on the phase-3 build (Plex chrome, 16 px prose, the old counts and marks), not on the final design.

| Trial | Result | Caveat |
|---|---|---|
| (a) 5-second, 5 runs | 18/25 | 5 of the 7 misses were the screen's own inconsistent counts (since fixed); 2 real misses |
| (b) handover, 2 runs | 3/5 answers within 10 s in both runs; 9/10 correct | Bare-dash fields took 10–15 s (since fixed); the first question's clock includes reading the whole strip |
| (c) checkpoint review | 1 valid run: 310 s, 264 command keys (35 scripted), with outside help to start a note | A discovery failure, since fixed with `␣mn` and hints. **No baseline was logged** |
| (d) reading | 1 of 4 conditions | No comparison possible |
| Style notes | Prose too big (→ 15/24); per-message bar unwanted (→ removed) | Applied in the design |

### 1.7 Ledger shape (read-only counts of `~/skl-ledger`, 10-29)

- **Markdown:** 851 Markdown files: 5,761 table lines, 1,033 task items, 1,320 nested list items and 245 h4 headings; frontmatter in 253 files; no footnotes, alerts or images.
- **Fence labels:** ts 18, sh 11, text 10, odin 3, sql 2, python 1, md 1, and 13 unlabelled.

## 2. Proposed (decisions and targets, not measured)

- **Latency targets:**
  - L1: processing p99 ≤ 4 ms, idle and under a 4 × 2,000 tok/s firehose (met offscreen, not on screen);
  - L2: key → first presented frame p99 ≤ 2 refresh intervals;
  - L3: ≤ 1 % late frames, no hitch > 50 ms;
  - L4: incremental parse p99 ≤ 2 ms;
  - L5: RSS ≤ 500 MB;
  - L6: cold start ≤ 1 s.
- **Type sizes:** prose at 15/24 follows the user's "too big" note, and its comfort is unmeasured. The side-pane step (Q36) is a default.
- **The 12 v1 grammars:** chosen from ledger, Render and user evidence; binary size per grammar (0.3–2 MB) is an estimate.
- **SC-14 diagram widths at 16 px:** estimated from the 17 px measurements; Fig. 10 is about 1,256 px.
- **Every wire requirement** in `protocol-requirements.md`: the fake host implements them, but the real host's shapes are the server spec's to decide.
- **Every open-question default** in `open-questions.md`.

## 3. Pending: everything still owed

**None of this blocks building.** It is listed once, here. A failure in any item becomes an implementation fix, not a redesign, unless it shows a rule can't hold.

### 3.1 Checks for the implementation's suite (unmeasured; they run on the real client)

| Check | What it asserts |
|---|---|
| **Title fit** (FC-Q27) | Outline title cell ≥ 125 px with no note, ≥ 100 px with one note mark. All `modules r2` titles whole; every `seams r3` title shows at least 12 characters before `…` |
| **Class word** | Present on heading rows and sticky bands; the heading text wraps before it; the breadcrumb tail is whole at every width |
| **R-B1 and R-B2, readiness row** (FC-M49, FC-M50, FC-Q26, FC-M59) | At 1512 the longest realistic line is ≤ 640 px and one row (P13's 641 px predates the risk-first rule and fits the 695 px list). At 800 every line is one row, and the sticky risk is wholly visible and never what is cut. Parts drop in the written order. Rows are exactly 52 px. Re-measure on GPUI: P10's and P13's margins are single-digit px |
| **KL17** (FC-K20) | Every printed chip resolves in its active context, on every screen fixture; a view template with no fixture fails; only a modal's surfaces are judged while one is open |
| **KL19** (FC-K25) | The chrome copy table has no key display form outside a chip slot; the flagged pattern gets a human read |
| **KEY-LINE** | Every one-row key line: one visual row, first part visible, dropped parts are a suffix of the written order, no part or chip cut, every chip inside the content box |
| **Strip values** (FC-Q25, FC-M09) | The §2.1 ladders at 1512, 1000 and 800, including `modules r1 · agent` (about 117 of 137 px) and the proposal forms. A mark in EVIDENCE moves it down the ladder |
| **Readback fields** (FC-M38) | BINDS renders `request C2 · captured s2 · human`, not only the digest; missing values read `none`; chips outside the modal dim and do nothing |
| **Merge package** (FC-M58, FC-M60) | CHECKS on the first screen; BLOCKER `none · 1 uncertainty`; Slice row with K fits at 800 (651 px measured without K, against 744); `␣ol` live; the pane scrolls back to its top; every Slice opens a real SC-07; `none yet` and a bare verdict never appear on the path; the URL path with a real host `url` |
| **Delegated request** (FC-M45) | The card's sentence and `␣ax` chip; the same in the review header; `␣ax` resolves in `review`; WAITING reason's drop order |
| **Queue** | Card below the list under a 1180 px pane; counts equal between bufferline and headers |
| **Key budgets** | T27 ≤ 8; T27b ≤ 21; COV reaches a tool block by `]t za`; T28 ≤ 9 |
| **Wording never rendered** | SC-18, SC-10 i, host wording per mode, `pass N` in queue and agent rows, the review count in the readback, `za` outcome vocabulary, delegated DONE and REVISIONS wording, the FC-M11 hint |
| **Suites not re-run on the last builds** | VISUAL, CONTRAST and SPOOF after the last chips; READ and VISUAL on the v0b dialect; `… 37 more lines` from a real host frame (it was injected); recorded host fixtures |
| **Fixtures** | Rebuild from the ledger, not by hand (FC-M24): the fake host disagrees with itself on 28 native-engine Slice marks, and one prototype test's loop never ran |

### 3.2 On-screen GPUI (E-GPUI-2, `experiments/gpui-spike/run_real.sh`)

| Item |
|---|
| **L1 on screen, L2 and L3** with a working present hook; a 120 Hz panel. L2 uses the external screen-capture harness (`stack.md` §6) |
| **L2 additions:** the first key after a `CAMetalDisplayLink` idle pause (≥ 2 s), and a Low Power Mode run with both GPUI caps off |
| **Real IME:** `jk` and `M-⏎` in Insert under a Japanese IME and a Chinese IME in ASCII mode; Google Japanese Input (crash #64687); dead keys. It settles the routing question recorded in `stack.md` §3 and FC-K21 to FC-K23 |
| **Pele and usvg in GPUI:** QuickJS with the Etoile measurer, natural widths at `fontSize` 16, note-box fit (Figure 1), GPUI's `img()` with its pinned resvg |
| tree-sitter highlight p99; binary size of the 12 grammars; Etoile chrome shaping per frame; font registration at cold start |
| **The two-cell mono glyphs** (`— → … ⏎ ▸ ↺`) in chips and mono columns; all fit numbers in §1.1a, which are browser renders |
| **The precompiled-shader path** on the next bump |
| **V4 target:** reattach ≤ 5 s locally (S§13 L1555), with the client's share being L6 plus first-snapshot paint |

### 3.3 Human trial (Q21; `experiments/trial-phase5/`, fake host `experiments/trial-fake-host-phase5/`)

| Item |
|---|
| **V8 target:** the five handover questions in ≤ 2 min without chat (S§13 L1559); the client's own targets are T01 (0 keys, ≤ 10 s) and T02 (1 key) |
| Re-runs of (a) 5-second, (b) handover and (c) review on the final design |
| A **review baseline** in the user's nvim + review TUI, which the ambition requires for "measurably better" |
| The **reading comparison** (mono vs prose, 80 vs 100 columns) |
| **Q36** style check (side-pane step vs weight) on Etoile renders |
| **Comprehension:** whether a pending request is believed to keep its routing (FC-M44); whether `ready: not eligible (29 not integrated)` without the second blocker is understood; whether `␣n` is found; whether the icon alone is enough at the narrow COMMITMENT steps; whether the landing frame's chrome reads easier; whether the package is read before merging |
