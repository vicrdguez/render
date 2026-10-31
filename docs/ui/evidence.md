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

## 3. Pending (owed, not yet run)

| Item | Where it runs |
|---|---|
| Human re-runs of (a) 5-second, (b) handover and (c) review on the final design | `experiments/trial-phase5/` (`human-trial.md` there), fake host `experiments/trial-fake-host-phase5/` |
| A **review baseline** in the user's nvim + review TUI, which the ambition requires for "measurably better" | same trial session |
| The **reading comparison** (mono vs prose, 80 vs 100 columns) | trial (d) |
| **Q36** style check (side-pane step vs weight) on Etoile renders | human |
| **GPUI on-screen latency** L1 on screen, L2 and L3 with a working present hook; a 120 Hz panel | `experiments/gpui-spike/run_real.sh` (E-GPUI-2) |
| **Real IME** (Japanese input method, dead keys) in the modal editor | E-GPUI-2 |
| **Pele and usvg in GPUI**: QuickJS with the Etoile measurer, natural widths at `fontSize` 16, note-box fit (Figure 1), GPUI's `img()` with its pinned resvg | E-GPUI-2 |
| `pulldown-cmark` + Etoile shaping per frame under the firehose (L4 re-measure); tree-sitter highlight p99; binary size of the 12 grammars | E-GPUI-2 |
| READ and VISUAL on the v0b wire dialect (run on v0 only) | prototype |
| Copy-only re-checks after the final copy rules (SC-10h text, BINDS `none`, host-segment separator) | prototype (READ COPY / MEASURE / FIT, VISUAL bufferline) |
