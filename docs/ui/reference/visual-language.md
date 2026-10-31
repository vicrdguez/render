# Visual language

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`../reference/`](../reference/); `wireframes.md` → [`../wireframes/layout.md`](../wireframes/layout.md); `screens.md` → [`../wireframes/text-mocks.md`](../wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`../evidence.md`](../evidence.md).


**Identity: Ember.** Warm graphite, ivory text and one coral spark that means *you are needed here*. Ember's quieter accents name things, so the eye can tell a human turn from an agent turn, code from prose and a passed tool call from a failed one, without the screen turning into a rainbow. The interface is keyboard-native and dense, with sharp lines and a calm surface: modern, but neither macOS-default nor generic SaaS.

This is the render spec. Pixel layouts per screen are in `wireframes.md`. Text grids in `screens.md` are structural wireframes only.

**Direction (user):**
- 10-27: *"modern UI, with some icons… not like a typical apple UI or AI slop… we don't need to inherit the limitations of text-only, terminal UI"*; and *"take the ember theme as the signature theme"*.
- 10-29, after the style check (Q26): *"Iosevka for monospace and Iosevka Etoile for long prose… the darker background on the main reading area and the lighter one for sidebars… choose between the 3 variants by config… we are not using much of ember's colors… inline code, message author, code blocks… coloured background to agent actions like pi does… more color to help tell different things apart, without the UI becoming a rainbow show."*

- After the tldraw wireframe review: *"tool calls do not need an icon, the background color is enough"*; the Decide pane "looked great with the top border coral and the icon coral, but the background can still be grey"; *"we can easily tell apart items in the content such as references to reports, contracts, etc."*; *"code needs to be syntax highlighted… render markdown as any other markdown reader"*. The layouts were approved (§4.8, §5.4, §5.5, §5.9, §5.10).

Keyboard behaviour is in `grammar.md`.

**Evidence:**
- **Measured** by E-PROTO-2 on the phase-2 spec (`experiments/html-proto/report.md`): reading checks 0 failures at four widths; 0 stray coral pixels; contrast worst 4.62 / 3.20; CVD silhouettes distinct.
- **Computed** for phase 3 by `tools/ember_tokens.py`.
- **Measured** by E-PROTO-3 on the phase-3 spec: every new check failed on phase 2 and passed on phase 3 (READ incl. MD, REF, CAPTION, SVGFIT at four widths; VISUAL; CONTRAST; SPOOF; TRAP; COV).
- **Phase 4** (this revision): Etoile chrome, stronger tool tints, block breakout, sibling-aware truncation. It is computed (`tools/ember_tokens.py`; widths measured with CoreText on the bundled WOFF2), but **not rendered yet**. `changelog.md` phase 4 lists the E-PROTO-3 results it invalidates.

## 1. Character and references

| Reference | Taken | Left |
|---|---|---|
| **Ember** (`inputs/ember-theme`, MIT, © 2026 Hossam Saraya) | Palette (`palette.json`), three variants, "nearly monochrome, one hero", warm graphite, ivory text, Ember's own `blend` | Coral on cursor, keywords, links, modeline: Render spends coral only on human attention (§5.4) |
| **pi's TUI** (`badlogic/pi-mono`, theme `dark.json`) | Tool executions as blocks with an outcome background (neutral pending, green success, red error), title in text colour, output muted; user messages on a tinted band | pi's saturated blue/green/violet values; its thinking-level colour scale |
| **Neovim + mini.nvim + fzf-lua** (the user's config) | Modes and mode badge, bottom-docked borderless pickers, 300 ms which-key, `[+]`-style marks | Single-size monospace everything |
| **Doom Emacs** | which-key panel, leader tree, `SPC m`; variable-pitch prose beside monospace code (the Iosevka Etoile pairing is a Doom habit) | Fringe bitmaps, box-drawing |
| **Zed** | Proportional chrome around monospace content, 1 px separators, small radii, docked panels | Blue accent, tab-bar weight |
| **iA Writer** | A fixed measure, generous line height, quiet chrome around text | Its typeface (replaced by Iosevka Etoile at the user's request) |
| **Magit / Sublime Merge** | Sectioned review, hunk navigation, dense readable diffs | Staging metaphors |
| **Glass cockpits** | Dark cockpit: normal is silent, abnormal is coloured and boxed, alerts name the action | Saturated symbology |
| **Carbon icons** | A flat, square-ish icon set (16 / 12 / 20 px) | Carbon's component styling, and IBM Plex: dropped in phase 4, since the user wants Iosevka Etoile for chrome too |

**Refused:** SF-style pills, sheets and vibrancy; translucency and blur; gradient blobs; oversized cards; everything-in-a-rounded-box; emoji in chrome; Lucide-in-cards; big buttons; spinners; radii above 4 px; colour on body text; a hue per project.

## 2. Layout system

Layout is in logical pixels on a 4 px base; there is no global character grid. Monospace alignment remains only where it carries meaning: code, diffs, IDs, digests, key chips and numeric columns.

### 2.1 Spacing scale

| Token | px | Typical use |
|---|---|---|
| `space.1` | 2 | icon-to-badge gaps, chip vertical padding |
| `space.2` | 4 | icon-to-label gap, chip horizontal padding |
| `space.3` | 8 | row horizontal padding, gutter inner margin, reserved gap before separators |
| `space.4` | 12 | pane top padding, label-to-value gap, tool-block padding |
| `space.5` | 16 | pane horizontal padding, panel padding |
| `space.6` | 24 | group spacing, gap between messages, H2/H3 top margin |
| `space.7` | 32 | H1 top margin |

### 2.2 Fixed regions

| Region | Height (px) | Surface | Contents |
|---|---|---|---|
| Bufferline | 30 | `surface.bar` + bottom `border.subtle` | view tabs (16 px icon + `ui` label); right: attention counts, the **host segment**, ledger seq, host time |
| Handover strip | 48 (workflow views only) | `surface.bar` + bottom `border.subtle` | five equal columns, label `ui.label`, value `ui` |
| Panes | rest | **reading area `surface.read`, side areas `surface.side`** (§5.1) | content |
| Statusline | 24 | `surface.bar` + top `border.subtle` | mode badge, breadcrumb, SAVE/DECISION, ledger seq, position |
| Echo / minibuffer | 26 | `surface.side` | messages; command line in `mono` |

Floats dock above the statusline at full width (which-key, pickers at 30 % height, peek, readback) and never cover the bufferline or statusline. **When a readback opens, the focused pane scrolls so the pinned target sits fully above it** (phase 5, challenge 10, FC-T19; `grammar.md` §13).

**Host segment** (phase 5, challenge 1; spec r2 §5.3.1). It sits in the bufferline after the attention counts, and reads `connection-signal` + host name + `hostMode` + protection:
- **Calm:** `homeserver · protected to seq 18340 (2 m)`, in `fg.muted` while `hostMode` is `active` and the verified off-host cutoff is within the host's exposed-work target (D003: 300 s). The target is shown as a target (`K`) and kept separate from achieved protection.
- **Not calm:** the segment takes the stale mark (`time`, steel) and names what is wrong in `fg`. Examples:
  - `catching up after a restore` (`hostMode` recovery-reconciling; the mode name shows in `K`);
  - `admission-disabled`;
  - `blocked`;
  - `unprotected since seq 18340 · 7 m`;
  - `backup unavailable`;
  - `restore not yet verified` (in `K` only, since it is a standing state, not an alarm).
- **Unprotected work:** acknowledged commits after the cutoff show as `+3 unprotected`, and stay calm while the cutoff is within the target. Once unprotected work is older than the target, the segment turns stale: `unprotected since seq 18340 · 7 m` (E-PROTO-5 defect 3). An idle workflow does not count as exposed just because its last save is old.
- **Separation** (evaluation-5 §4): the host segment and the `seq` / time group are separate segments, with `space.5` (16 px) and a 1 px `border.subtle` rule between them.
- **Pairing again:** after a restore, `restored · pair this device again` replaces the segment until the host's local admin pairs it again (backed-up credentials are refused; `grammar.md` §14).
- **Copy:** user-facing restore text uses plain words. Internal terms (epoch, deduplication, cutoff, `recovery-reconciling`) appear only in `K` details (evaluation-5 §2).
- **Narrow windows:** the segment shrinks to icon + mode word, but never drops while it is not calm (FC-M31).

**Statusline and bufferline under width pressure** (phase 4, since Etoile is wider):
- **Statusline:** segments drop in this order:
  1. the cursor position;
  2. the SAVE label (its `edit` icon stays);
  3. the DECISION label (the bufferline's ◆ count still shows it);
  4. the review basis summary shortens to its revisions (`r2 v3 pol3`, dropping digests; defect 10);
  5. the breadcrumb then truncates from the left (`…› coordinator`).

  The mode badge, ledger seq and host time never drop.
- **Bufferline:** view tabs shrink to icon + number before the attention counts and the host segment ever drop.
- The echo area never repeats a segment the statusline is showing (FC-Q21).

### 2.3 Panes and density

- **Main and side panes.** Each view has one **main pane**, the thing being read or worked through: the queue list, transcript, document, diff, evidence body, explorer list or decision text. It sits on `surface.read`. Every other pane sits on `surface.side`: the card, outline, notes, chat info, explorer sidebar, explorer preview and agents detail.
- Separators are 1 px `border.strong`; the focused pane's separators and title use `rule.focus`.
- Pane padding: `space.5` horizontal, `space.4` top. List rows are 26 px; dense tables 24 px; group headers have `space.6` above.
- The cursor row is the pane's cursor surface (§5.1) with a 2 px left bar in `rule.focus`.
- Density (measured on phase 2): 34 list rows visible at 1512 × 982. The target is ≥ 28.

## 3. Type

### 3.1 Families (bundled; checked at startup, `stack.md` §4)

**Two families (phase 4, Q28 answered).** The user: *"Iosevka Etoile, which is what I asked for"*. Chrome and prose both use Iosevka Etoile; Iosevka (mono) is for code, IDs, keys and fixed numeric columns. IBM Plex Sans is dropped entirely, and `ui.font.ui` is removed: nothing needs a second proportional face.

| Role | Family and release | Licence | Notes |
|---|---|---|---|
| **Chrome and prose:** labels, rows, tabs, headers, statusline, readback field names; chat, documents, card question, decision text, notes | **Iosevka Etoile**, v34.9.1, `PkgTTC-IosevkaEtoile-34.9.1` | SIL OFL 1.1 | A quasi-proportional slab serif on Iosevka's skeleton, so inline code sits in prose without a jump |
| **Mono:** code, diffs, IDs, digests, keys, key chips, the command line, **fixed numeric columns** (counts, waiting, downstream, sizes, seq, times) | **Iosevka** (default spacing), v34.9.1 (2026-10-24), `PkgTTC-Iosevka-34.9.1` | SIL OFL 1.1, no Reserved Font Name | Advance **0.5 em, measured**: 100 columns = 700.0 px at 14 px. No ligatures in the default build |

**Measured on the bundled WOFF2 with CoreText (10-29):**
- **x-height:** Etoile 0.520 em vs Plex Sans 0.516. At the same size Etoile reads as large, so the chrome sizes stay unchanged.
- **Width:** Etoile is wider. Sample chrome strings at 13 px (queue paths, reasons, tree names, statusline) are 1.16–1.28× the Plex Sans width, 1.20× on average. Uppercase captions at 11 px are 0.95–1.08×, about the same.
- **Weights:** Etoile and Iosevka keep one advance width across weights ('m' 14.4 px at 16 px in both regular and bold), so bold never reflows a line (FC-P08).
- **Figures:** Etoile's digits are tabular (all 7.80 px at 13 px). Fixed numeric columns still use Iosevka for column alignment with IDs and times.

**What the wider chrome changes:**
- At 1512 px the widest sample row text, `reduce-test-runtime/simplify-adapter-launch-tests` (361 px), still fits the queue's 372 px item column.
- Narrower windows truncate and drop columns sooner. The rules in §4.4 are unchanged in kind, but the sibling rule is new.
- The SC-16 scope tree gives names their own line width (FC-Q18).
- The statusline drops segments by priority (§2.2).

**Hierarchy without a second family.** Chrome is told from content by lane, surface, size and case, not by face:
- chrome sizes are 11–15 px, against prose at 15 px (phase 6). The 15 px chrome size is only `ui.title`, which differs from prose by weight and lane;
- **content in a side pane is two steps above chrome** (phase 5, challenge 5): `prose.small` is 15/24, against chrome's 13 px;
- every content block in a side pane (the card's QUESTION, note bodies, quoted steers, picker previews) sits on a content lane with a **2 px `border.strong` left bar**, which chrome never has;
- captions are 11 px uppercase with +0.06 em tracking, which content cannot produce;
- chrome never sits inside a content container (§10.2, FC-S18).

Fallback if the human style check still sees one texture: weight, with chrome values at 500 and content at 400 (Q36). Evaluation-4 found SC-02's card QUESTION and fact values sharing face, colour and nearly size.

Trade-off: phase 3 kept Plex Sans so that chrome looked unlike content. That separation now rests on layout alone, and the SPOOF suite gains caption lookalikes to prove it holds.

### 3.2 Scale

| Token | Family | Size / line (px) | Weight | Notes |
|---|---|---|---|---|
| `ui.label` | Iosevka Etoile | 11 / 14 | 700 | UPPERCASE, +0.06 em tracking; section captions, strip labels, readback field names. May wrap to two lines at a word boundary (§4.4) |
| `ui.small` | Iosevka Etoile | 12 / 16 | 400 | metadata, header bands, picker meta |
| `ui` | Iosevka Etoile | 13 / 18 | 400 | default chrome text, list rows, statusline |
| `ui.strong` | Iosevka Etoile | 13 / 18 | 600 | pane titles, readback verb, author names, and **unseen rows** (§8). List row titles are regular `ui`, so bold means one thing in lists (challenge 15) |
| `ui.title` | Iosevka Etoile | 15 / 20 | 600 | card and view titles |
| `ui.quote` | Iosevka Etoile | 13 / 18 | 400 italic, `fg.alt` | **excerpts** of content in a side pane, at most 3 lines then `…`, with the content bar: the steering queue's queued steer, picker list previews. Full note bodies use `prose.small` (defect 12) |
| `mono.small` | Iosevka | 12 / 16 | 500 | key chips, hint labels, gutter IDs, statusline numbers, every fixed numeric column (counts, waiting, downstream, sizes, durations) |
| `mono` | Iosevka | 14 / 20 | 400 | code blocks, diffs, digests, BINDS values, command line, tool-call headers |
| `prose` | Iosevka Etoile | **15 / 24** | 400 | body; italic for block quotes. **Phase 6** (the user: *"chat and markdown have a too big of a font"*): from 16/26. Etoile's x-height is 0.520 em, so 15 px gives a 7.8 px x-height, against 8.3 px at 16 (`tools/font_metrics.txt`) |
| `prose.small` | Iosevka Etoile | **15 / 24** | 400 | content in side panes: the card question, note bodies, decision context; always with the content bar. Since phase 6 it **equals `prose`**: it must stay two steps above 13 px chrome (challenge 5), and with prose at 15 nothing fits between. The token stays so side-pane content can be retuned alone (Q36) |
| `prose.h1` | Iosevka Etoile | 24 / 32 | 700 | `space.7` above, `space.3` below, then a 1 px `border.strong` rule across the text column (phase 6: from 26/34) |
| `prose.h2` | Iosevka Etoile | 20 / 28 | 700 | `space.7` above, `space.2` below, then a 1 px `border.subtle` rule (from 21/30) |
| `prose.h3` | Iosevka Etoile | 17 / 26 | 700 | `space.6` above (from 18/27) |
| `prose.h4` | Iosevka Etoile | 15 / 24 | 700 | `space.6` above (body size: weight and space are its two cues) |
| `prose.h5` | Iosevka Etoile | 13 / 20 | 700 | UPPERCASE, +0.04 em, `fg.alt`, `space.5` above (from 14/22). 13 px uppercase with +0.04 em is not the chrome caption style (11–12 px, +0.06 em; §10.2) |
| `prose.h6` | Iosevka Etoile | 13 / 20 | 600 italic | `fg.alt`, `space.5` above (from 14/22) |
| `prose.code` | Iosevka | 14 / 24 | 400 | inline code in prose: one px under prose size because Iosevka sets tighter than Etoile; inherits the prose line height |
| `prose.ref` | Iosevka | 14 / 24 | 500 | references in content, in `prose` and `prose.small` alike (§5.9) |
| `prose.table` | Iosevka Etoile | 14 / 22 | 400 (header 700) | table cells (§4.8) |

Numbers in fixed columns use `mono.small`; numbers inside a sentence stay in the sentence's face, whose digits are tabular anyway. Iosevka ligatures are off (default build). Global zoom only.

## 4. Reading layout (normative)

These rules hold for every renderer. They were measured as passing on phase 2 (WRAP 0/379, MEASURE 0/917, FIT 0/19,435, TRUNC 0/787 at four widths) and they continue unchanged, except for the measure value and the break mechanism.

### 4.1 Measure (recomputed, F9)

| Measure | Definition | Value at default size |
|---|---|---|
| `measure.prose` | **68 average characters of the prose face**: the renderer sets the reference paragraph, takes its mean advance per character, multiplies by 68 and rounds down to 4 px. The paragraph is pinned in the repo as `tools/measure-sample.txt`, not cited from the moving spec (challenge 22). Recomputed at startup and on zoom; READ uses the computed value, never a constant | **548 px** for Etoile at 15 px (phase 6; was 584 at 16): mean advance 0.539 em, 68 × 8.090 = 550.1, rounded down. Evidence: `tools/font_metrics.swift` → `tools/font_metrics.txt` (CoreText on the bundled WOFF2) |
| `measure.mono` | 100 columns of the mono face at `mono` size. **It applies to mono prose only** (`␣tp` sets prose in Iosevka); code frames follow the breakout rule (§4.3, defect 2) | **700 px**, measured (`tools/font_metrics.txt`) |

The measure is a maximum. In panes wider than the measure plus 160 px, the text column is centred.

### 4.2 Prose wraps at words (semantics, not mechanism; F3)

**Semantics:**
- Break only at spaces; no justification and no hyphenation.
- Display IDs, key names and inline code up to 40 characters never break.
- A token longer than the measure may break after `/ - _ . ·`, with a 12 px `arrow--right` continuation mark in the gutter.
- Hanging indents for lists; quote bars repeat on every line.

**Mechanism belongs to the renderer**: `white-space: nowrap` spans and `<wbr>` in HTML (what E-PROTO-2 did), or line-break opportunities in GPUI's wrapper. **The renderer never inserts characters into content text.** Yanked or copied text must equal the source bytes. Zero-width and joiner characters are exactly what §10.6 renders as visible escapes, so inserting them would collide with the spoofing rule.

### 4.3 Blocks that do not wrap

- Code, tables and diagrams keep their lines. They never wrap.
- **Breakout, grow right first** (phase 5; challenge 24, defect 1, evaluation-4 §2; replaces phase 4's centring). A block is as wide as its natural width, from the text column's width upward. **Its left edge stays on the text column's left edge**, so the reading edge never moves, and it grows rightwards to the pane's right content edge.
  - **It never extends left.** The gutter sits directly left of the text column, and it is a chrome lane with node IDs, note bars and suspicious marks (FC-S18). A block can't pass the gutter without covering it, so the only room is to the right.
  - Beyond the pane's right content edge, the block scrolls.
  - Evaluation-4 §2 suggested that a still-wider block might extend left without covering the gutter. With the gutter adjacent to the column, that is impossible, so the rule is simply "grow right".
  - Prose before and after keeps the measure.
  - Code, tables and diagrams follow the same rule (defect 8).
- **Overflow cue, visible at reading distance** (evaluation-4 §3). Each clipped edge shows three things:
  - a 32 px fade to the block's surface (`surface.code` for code, `surface.read` for tables and diagrams);
  - a 2 px `fg.muted` edge rule over the block's full visible height;
  - a 16 px `caret--right` (or `caret--left`) at the vertical middle of the visible block.

  `zl`/`zh` scroll the block and `0` resets; a left cue appears once scrolled. `K` opens the block full-window.
- History: evaluation-3 found code cut at about 580 px with 450 px blank on each side. E-PROTO-4's centred breakout then moved wide tables from x 476 to x 16, over the gutter.
- Prose diffs wrap per side, and only the first line of each source line carries its sign.
- Diagrams have their own fit rule (§11).

### 4.4 Narrow fields, truncation and captions

- Fields declare a minimum, a maximum and a priority. Optional fields drop first; then fields truncate by kind:
  - labels: `…`;
  - paths: `…/leaf`;
  - IDs and digests: never partial;
  - numbers and times: never truncated, only dropped.
- `space.3` is reserved before every separator. `K` and the statusline show the full value.
- **Keep what tells rows apart (FC-Q18):**
  - **Names come before decorations** (phase 4). A row's name gets its width before marks, strips and metadata do. In the SC-16 scope tree the small-multiple strip has its own 14 px line under the proposal name.
  - **Structured rows** (phase 5, replacing phase 4's middle truncation; evaluation-4 §1, defect 5). Side-pane list rows render host fields in fixed slots, never a host display string cut by characters. The slots are **key · role · state · time**, e.g. OTHER CONVERSATIONS `b · candidate · running · 3m`.
    - The **key** is the field that tells siblings apart: the candidate letter, or the assignment `as42·g1`. It comes from the host (RQ-30, RQ-09) and never drops or truncates.
    - Fields drop whole, from the right.
    - A row whose key and role don't fit takes a second 18 px line.
    - Middle truncation is retired: it made `experi…date as42·g1  opus-5.5…ning 3m`.
- **Column captions size their column; they never truncate.** Fixes "ASSIGNME…" (evaluation-2 §3) and **A1** (queue `waiting` 60 px, `downstream` 84 px).
  - **Narrow windows (E-PROTO-3 defect 5):** a caption may wrap to a second line at a word boundary, and every caption in that header row then bottom-aligns. It never breaks inside a word and never takes a third line.
  - If a single word is wider than its column, the column widens. If captions still don't fit, whole columns drop by priority.
- **Copy (FC-Q21).** Counts in chrome are pluralised by count ("1 line", "2 lines", "1 slice"). Host-written text is shown as sent.
- **No bare dash in a handover field** (phase 6, trial (b), FC-R08). The strip and the card render an empty field as words, built from the host's structured null and wait class:
  - OWNER `no owner · waits for a slot` / `no owner · done`;
  - EVIDENCE `none yet`;
  - BLOCKER `none`, or the wait class (`slot 4/4 busy`);
  - NEXT `nothing for you yet`.

  OWNER `—` took 14.7 s in the trial, while the worded NEXT took 2.6–3.3 s. A dash stays only in numeric columns ("no downstream"), where it is a value, not a field.

### 4.5 Composers and floats

Composers are at most `measure.prose + 32 px` wide, wrap inside their frame with `space.4` padding, and grow to 8 lines, then scroll.

### 4.6 Hierarchy

Headings use size, weight, rules and space (§3.2): every level has at least two cues, and consecutive levels differ in size or weight (§4.8). Node IDs sit in the gutter on heading lines (`mono.small`, `fg.muted`).

### 4.7 Checks

Run on real line breaks and element boxes at 1512, 1200, 1000 and 800 px:

| Check | Fails when |
|---|---|
| WRAP | rejoined lines do not reproduce the source words, or a word that fits the measure is split |
| MEASURE | a prose line is wider than the computed `measure.prose` |
| FIT | any text or icon box overlaps a separator, border or neighbour. Phase 5: a code block, table or diagram is narrower than its natural width while the pane has spare content width; **its box overlaps the gutter**; **its left edge leaves the text column while it fits to the right**; or a clipped edge lacks any of fade, edge rule and 16 px caret |
| TRUNC | a shortened field has no ellipsis, or `K` does not give the full value. Phase 4: two visible labels in one list are equal, or a tree name is truncated while its strip shows glyphs. **Phase 5:** a structured row cuts a field mid-characters, or its key is missing |
| CAPTION (new) | a column caption is truncated |
| HIER | headings do not follow §3.2 |
| CHROME | an icon, tint class or chrome style appears inside a content container (§10) |
| SVGFIT (new) | an inline diagram's text box lies outside its frame, its effective size is under 12 px, or two text boxes overlap (§11); **phase 4:** a node label's box lies outside its node's box (FC-Q22) |
| COPY (phase 4) | a chrome count of 1 is followed by a plural noun from the chrome vocabulary ("1 lines"), or the echo area shows text equal to a visible statusline segment (FC-Q21). **Phase 5:** a chrome revision label does not match its kind's display form from `grammar.md` §4.2 (FC-M34); or a role word in chrome ("the coordinator is idle") differs from the conversation's host role (defect 14). **Phase 6:** two surfaces show different numbers for one state (NEEDS YOU, ON THE HOST, running, slots); a handover field is a bare dash; or a bare `n/m` stands without the word `slots` |
| ALIGN (phase 6) | a message body's first text line starts anywhere but the text column's left edge, for any role (human, agent, host). The human band may extend into the gutter; its text may not |
| MD (new, after the tldraw review) | on the Markdown coverage fixture, a construct does not render its §4.8 shape: heading levels not strictly ordered by size or weight, a missing h1/h2 rule, list markers not stepping 24 px per level, a task box outside the marker column, a table cell clipped or split mid-word, a quote line without its bar, an alert with a hue or icon, frontmatter not collapsed, a footnote marker that `gd` does not reach, or an unlabelled or unknown fence that is highlighted |
| REF (new, after the tldraw review) | a host reference span renders without the reference style, anything else renders with it (plain lookalikes, ID-labelled links, IDs in inline code, code blocks or tool output), a dangling span renders gold, a span whose bytes differ from its label is styled, or `gd` on a dangling reference moves the cursor (§5.9) |

### 4.8 Markdown blocks (after the tldraw review)

The user: *"render markdown as any other markdown reader, one that makes content easy to read and tell apart."* Documents, messages, notes and decision text all render through these rules. They sit inside the text column (§4.1) unless stated.

**Dialect:**
- CommonMark plus the GFM extensions: tables, task lists, strikethrough, autolinks and footnotes.
- GFM alerts (`> [!NOTE]` and the other four kinds).
- YAML frontmatter at the start of a file.
- Fenced `mermaid` blocks, which are diagrams (§11).
- **Shown as literal text:** raw HTML, math, wiki links and emoji shortcodes. HTML stays escaped (§10.6).

**Why these, measured in `~/skl-ledger`** (read-only count, 851 Markdown files, 10-29):
- tables: 5,761 table lines;
- task-list items: 1,033;
- nested list items: 1,320;
- h4 headings: 245; h5 and h6: none;
- frontmatter: 253 files;
- blockquotes: 2;
- footnotes, alerts and images: none.

Tables and task lists therefore carry the most design weight. Footnotes, alerts and images get a correct, minimal treatment.

| Block | Rendering (dark tokens; Soft and Light use their own) |
|---|---|
| Paragraph | `prose` 15/24, `space.4` (12 px) between paragraphs; hard line breaks kept |
| Headings | §3.2 scale: h1 24/32 + `border.strong` rule; h2 20/28 + `border.subtle` rule; h3 17/26; h4 15/24 700; h5 13/20 700 uppercase `fg.alt`; h6 13/20 600 italic `fg.alt` (phase 6). All `fg` (or `fg.alt` for h5–h6); **no heading hues**, although Ember's nvim colours h1–h5 coral to steel (§5.6 rule 2; coral §5.4). The node ID sits in the gutter |
| Bulleted list | markers `•` / `◦` / `▪` by level (cycling after 3), `fg.muted`, in a 20 px marker column; each level indents **24 px**; hanging indent; tight lists 4 px between items, loose lists 12 px (CommonMark looseness). Beyond level 4 the indent stops growing, so text never narrows below the measure minus 96 px |
| Numbered list | numerals right-aligned in a 28 px column, tabular, `fg.alt`, as written in the source (CommonMark has no a/i styles) |
| Task list | a 14 px box in the marker column, at text size in the content lane. Unchecked: 1.5 px outline in `fg.muted`. Checked: filled `fg.alt` with a knocked-out tick. Item text stays `fg`, with no strikethrough and no colour. Ledger task items are acceptance criteria to read, not chores done. Boxes are display only; editing one is an emission edit (`␣me`). Never olive and never in the gutter (FC-S17) |
| Table | header `prose.table` 700 `fg` with a 1 px `border.strong` rule under it; body `prose.table` 14/22; a 1 px `border.subtle` rule under each row; no vertical rules and no zebra fill. Cell padding 6 px × 12 px; numeric cells tabular; GFM alignment honoured. **Width:** tables are not prose, so they break out of the measure up to the pane's content width (§4.3, phase 4; previously capped at 960 px). Each column is at most `min(measure, 480 px)`, and cells wrap at words by §4.2. If the columns' minimum widths (their longest unbreakable token) do not fit the pane, the table scrolls horizontally with the fade and `caret--right` cue (§4.3), never clipping a cell mid-word. Header cells never truncate (§4.4). Inline code and references inside cells keep their inline styles |
| Blockquote | a 3 px `border.strong` bar on every line, 16 px left padding, Etoile italic `fg.alt`; nested quotes add a bar 12 px further in |
| Alert (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) | the blockquote shape with a 3 px `fg.muted` bar and a caption line: the kind word in Etoile 13/18 700 uppercase `fg.alt`. **No icon, no hue, no tint.** GitHub colours these blue, green, purple, yellow and red; a red CAUTION box would read as a failed tool call or host state (FC-S17) |
| Horizontal rule | 1 px `border.strong` across the text column, `space.6` above and below |
| Frontmatter | collapsed to one content line, `prose.small` `fg.muted`: "frontmatter · 6 fields · `za`". Its band spans **the text column exactly**, never past the measure (FC-Q20). `za` expands it to a `yaml` code block, which then follows the code-block breakout. Keys like `state: approved` are content, never host state (FC-S11) |
| Sticky heading | while a section is scrolled, its heading stays pinned under the pane top. **The band's background spans the pane's full content width**, from the pane's left content edge (or the gutter's left edge, whichever is further left) to the right content edge (E-PROTO-5 defect 2), so breakout blocks and gutter IDs scrolling beneath are covered (defect 4). The heading text aligns with the text column, and the 1 px `border.subtle` rule runs from the text column's left edge to the band's right edge (evaluation-3 §5). It yields when the next heading is within its height + 48 px. The node ID stays in the gutter |
| Code block | `surface.code` frame, `radius.1`, a 2 px orange left rule, padding 12 × 16 (20 px on top when labelled, so the label never sits on a long first line; E-PROTO-3 deviation 6). The frame **breaks out of the measure up to the pane's content width** (§4.3), then scrolls with the fade and caret cue. The language label sits top-right in `ui.small` orange (chrome, from the info string). Code is `mono` 14/20, syntax-highlighted per §5.10, and never wraps (§4.3). `yi` yanks the source bytes. No line numbers unless `:numbers` |
| Inline code | `prose.code` orange on a `surface.code` chip (padding 0 × 3, `radius.1`); never breaks up to 40 characters (§4.2) |
| Reference | host-resolved spans only: §5.9 |
| Link `[text](url)`, autolink | prose face, `fg` text, 1 px dotted gold underline. With the cursor on a link, the echo area shows the full URL. `gx` opens it externally after a confirm that shows the whole URL (FC-S05). A link never takes the reference style, whatever its text (FC-S15) |
| Emphasis | *italic* = Etoile italic; **bold** = 700; ~~strikethrough~~ = `fg.muted` with a 1 px line; bold italic combines both |
| Image | **not loaded** in v1 (§10.6, FC-S07). A 32 px placeholder line in a 1 px dashed `border.strong` frame: `prose.small` `fg.muted` "image · <alt text> · <host of the URL>"; `K` shows the full URL |
| Footnote | the marker is a superscript numeral in Iosevka 11 px `fg.alt`; `gd` jumps to the note and `C-o` returns. Notes are collected at the end under a 1 px `border.subtle` rule in `prose.small`, each with `↩` back to its marker. Footnotes are resolved by the Markdown parser within the same document, so they do not take the reference style |
| Mermaid fence | a diagram (§11) |

**Streaming.** The trailing block re-parses as it grows (`stack.md` §3). An unclosed fence renders as a code block so far. An unclosed table renders as rows so far. Nothing re-styles outside the trailing block.

## 5. Colour (Ember)

Sources: `inputs/ember-theme/ember/palette.json` (bg, fg, accents, accents_light) and `inputs/ember-theme/nvim/lua/ember/palette.lua` (`base0`–`base8`, `bg_alt`, `fg_alt`). Blends use Ember's `util.blend`, which rounds half up. That rounding fixes **F11**: phase 2's `#2c2e25` came from banker's rounding. **▲** marks the smallest L* change needed to reach AA, computed.

### 5.1 Surfaces: the reading area is the high-contrast surface

The user asked for the darker background on the main reading area and the lighter one for sidebars. The general rule is that **the reading area is the surface with the most contrast against text**:
- In the dark variants that is the darkest surface, `base0`.
- **In Ember Light there is no "darker" surface in that sense.** The most-contrast surface is the lightest, `base0` (`#f0e8d8`). Side areas use the parchment `bg`, one step toward the mid-tone.
- In all three variants, side areas are one step *quieter* than the reading area.

| Token | Ember (dark) | Ember Soft | Ember Light | Used for |
|---|---|---|---|---|
| `surface.read` | `#151412` `base0` | `#1c1b19` `base0` | `#f0e8d8` `base0` | main panes (§2.3) |
| `surface.side` | `#1c1b19` `bg` | `#242320` `bg` | `#e6dac4` `bg` | side panes, floats (which-key, pickers, peek), echo area |
| `surface.bar` | `#252422` `base2` | `#2c2b28` `base2` | `#d8ccb0` `base2` | bufferline, strip, statusline, chips, running tool call |
| `surface.cursor.read` | `#242320` `bg_alt` | `#2a2927` `bg_alt` | `#e6dac4` `bg` | cursor row in a main pane |
| `surface.cursor.side` | `#2e2d2a` `base3` | `#353430` `base3` | `#ddd0b8` `bg_alt` | cursor row in a side pane |
| `surface.code` | `#242320` `bg_alt` | `#2a2927` `bg_alt` | `#e6dac4` `bg` | code blocks and inline-code chips inside the reading area |
| `surface.readback` | `#252422` `base2` | `#2c2b28` `base2` | `#ddd0b8` `bg_alt` | readback panel (plus a 2 px coral top rule) |
| `surface.selection` | `#3e3c38` | `#444240` | `#b8ac96` | `base4` |
| `border.subtle` / `border.strong` | `#2e2d2a` / `#3e3c38` | `#353430` / `#444240` | `#cec2a8` / `#b8ac96` | `base3` / `base4` (decorative) |
| `rule.focus` | `#908a7e` | `#908a7e` | `#787060` | `base7` / `base6` (non-text ≥ 3:1) |
| `fg` / `fg.alt` | `#d8d0c0` / `#b0a898` | same | `#282418` / `#585040` | Ember fg / fg_alt |
| `fg.muted` | `#999489` ▲ | `#a19c92` ▲ | `#5e5646` ▲ | `base7`, nudged to ≥ 4.5:1 on every surface including tints |

**Floats** sit on `surface.side` with a 1 px `border.strong` and a shadow. Over the reading area they read as side material lifted on top, the same idea as Ember's own float convention.

**Variant by config (decision):**
- The key is `ui.theme` in the client's config file `~/.config/render/client.toml`. Values: `"ember"` (default), `"ember-soft"`, `"ember-light"`, or `"auto"` (macOS appearance chooses `ember` or `ember-light`).
- `␣ht` opens the variant picker and switches **live**: tokens swap within one frame, and type and layout do not change, so pins, cursor and scroll position are untouched. `:set theme=<variant>` switches for the session only; the picker writes the config.
- **Rendered Mermaid on a switch:** cached SVGs keep Pele's CSS variables (`stack.md` §5). On a switch, visible diagrams are re-substituted with the new tokens and re-rasterised (≤ 38 ms each, measured upper bound for resvg). Off-screen diagrams do the same lazily when they scroll into view. No host request is made.

### 5.2 State (marks only)

| Token | Dark / Soft | Light | Ember name | Meaning | Mark |
|---|---|---|---|---|---|
| `state.attn` | `#e08060` | `#b84c30` | coral (hero) | needs your decision now; open readback | filled diamond |
| `state.blocked` | `#b07878` | `#905050` | rose | failed, refused, quarantined, conflict, revoked | **`stop-sign--filled`** (a filled octagon; phase 6, FC-M37. Phase 3's `error--filled` was a circle like unknown's) |
| `state.stale` | `#7890a0` | `#3a6080` | steel | basis newer than this view has shown you | `time` |
| `state.unknown` | `#988090` | `#706070` | mauve | outcome or effect unknown | `help` |
| `state.local` | `#80a090` | `#386858` | sage | exists only on this device | `edit` |
| `state.ok` | `#8a9868` | `#4a6830` | olive | pass, accepted, succeeded (evidence, receipts, tool calls) | `checkmark` |

State colour sits on marks (icons, 2 px bars, chip borders) and on **state tints** (§5.5). It never colours running text. As icons all six are ≥ 3:1 on every surface (§5.7).

### 5.3 Kind colour: accent roles (new)

Phase 2 kept every accent on marks, and the result read "plain". Ember's quieter accents now get **kind** roles: they tell *what* something is, never its state.

| Role | Accent | Element | Dark / Soft / Light value |
|---|---|---|---|
| **You** (human author) | steel | author name in the message header band (`ui.strong`); an 8 % steel **band** behind the human message body | text `#7890a0` / `#7d94a3` ▲ / `#3a6080` |
| **Coordinator** | **none** (phase 5, challenge 11, accepted by the user) | author name in `fg` `ui.strong` with its `bot` icon in `fg.alt`. The default voice stays neutral, as the dark-cockpit rule treats running work | `fg` |
| **Independent reviewers** (challenger, audit, watchdog) | mauve | author name | `#9b8493` ▲ / `#a08a98` ▲ / `#6b5b6b` ▲ |
| **Workers** (implementer, candidate, experiment roles) | sage | author name | `#80a090` / `#80a090` / `#386858` |
| **Code** | orange | inline-code text on a `surface.code` chip (`radius.1`); code-block language label; the code block's 2 px left rule; syntax keywords | `#c09058` / `#c09058` / `#83552b` ▲ |
| **References** (in the host's reference index, in content; §5.9) | gold | Iosevka 500 text in gold with a solid 1 px gold underline, no background | `#c8b468` / `#c8b468` / `#67581b` ▲ |
| **Links** (URLs) | gold underline | text stays `fg` in the prose face; 1 px dotted underline in gold (D4 kept) | underline `#c8b468` / `#c8b468` / `#7a6820` |
| Host events | none | `ui.small` in `fg.muted` | — |

**Declined, with reason:**
- **IDs in chrome** (rows, cards, strip, readback BINDS, side lists) stay `fg.alt` in `mono`: lists scan by state (rule 4). **IDs in content** were also uncoloured in phase 3. The user's tldraw review reversed that ("we can easily tell apart items in the content such as references to reports, contracts, etc."). Host-resolved references in content now take the reference style (§5.9).
- **Section captions** stay `fg.muted`: they are structure, and colour there would compete with marks.
- **Projects** get no hue: there is no stable meaning, and lists must scan by state.
- **Headings** stay `fg`.

Why these mappings:
- Steel reads as cool and human against warm agent hues.
- The coordinator, the most frequent voice, is neutral (phase 5): it is the default, and the exceptions (you, reviewers, workers) carry hue.
- Mauve keeps independent review visually distinct from the coordinator. Independence is a core Render invariant (I13).
- Orange is already Ember's code colour, so "orange = code" holds across inline code, block chrome and syntax.
- **Gold means navigable, and only that** (phase 5, challenge 11; Q29 closed): references (solid underline) and links (dotted underline). The coordinator no longer shares it. A transcript uses steel (you), gold (references and links) and orange (code): three kind hues (§5.6 rule 3). Reviewer or worker turns in the same pane are the rare fourth hue, and fall back to `fg.alt` by rule 3.

### 5.4 Coral: the one spark

Coral appears only for **needs your decision now** and the **open readback**.
- **F5:** operator actions in NEEDS YOU (a quarantine) take the filled failed mark, not the diamond, and the NEXT cell reads `on the host: …` without a diamond. Their remedy is not a decision in this client.
- **F6:** legends, which-key, help and the explorer's state filter draw the diamond in `fg.alt`, so a calm screen has zero coral pixels (measured: phase 2 had 0 on 3 calm shots).
- **Readback (tldraw review: "the background can still be grey"; the drawing had a coral-tinted fill):** the panel is the neutral raised `surface.readback`, a grey one step above the reading area. Its only coral is the 2 px top rule and the 16 px diamond before the verb. The verb ("DECIDE"), field names and values stay `fg`/`fg.alt`. There is no coral fill, tint or text. That is about 1,512 × 2 + 16 × 16 coral pixels, against a full-width coral band.
  - **Calm-screen rule:** the readback opens only from the user's own authority key, never from a host event (FC-T07). An authority command exists only for something that needs the user, so a calm screen never carries a readback, and closing it removes its coral. The coral scan's allowed set is unchanged: needs-you diamonds, the open readback's rule and diamond.
- **Decision pane (SC-09):** the decision text sits on `surface.read` with no coral. The NEXT diamond stays in the strip. The option under the cursor uses the cursor bar, and the recommended option an outlined `recommended` chip in `fg.alt`, not a diamond.

Stock Ember paints keywords, cursor, links, modeline and search in coral; Render uses orange keywords, an `fg` caret, a gold link underline, neutral badges and `surface.selection` for search matches.

### 5.5 Tints: coloured backgrounds (bounded)

Tints sit only on whole blocks, never on inline spans. The human band and the diff tints are Ember blends over `surface.read` (8 % and 15 %).

**Tool-call tints, phase 4.** The user: tool tints should be *"subtle but noticeable"*. E-PROTO-3 measured them too faint (FC-M30):
- failed vs unknown were ΔE2000 2.9–3.3;
- `running` equalled the code surface (ΔE 0.8);
- evaluation-3 saw ok, unknown and running as the same grey, although ok vs `surface.read` was already ΔE 8.

At this darkness chroma reads weaker than ΔE2000 suggests, so a tint now takes **the hue and chroma of a 36 % accent blend, held at one lightness**: the `surface.bar` step (`base2`) in the dark variants and `bg_alt` in Light. They differ from each other by hue, not brightness, and text contrast stays where it was. Computed by `tools/ember_tokens.py` (`TOOL_ALPHA`, `TINT_TARGETS`).

| Tint | Ember | Soft | Light | Used for | Always with |
|---|---|---|---|---|---|
| `tint.tool.run` | `#2e2d2a` (`base3`) | `#353430` (`base3`) | `#d8ccb0` (`base2`) | tool call running: neutral, but no longer the code surface | outcome word `running · 40 s` (elapsed, every 10 s) |
| `tint.tool.ok` | `#212615` | `#292d1b` | `#cfd5b6` | tool call succeeded | outcome word `ok` (or `exit 0`) |
| `tint.tool.fail` | `#321f1e` | `#3a2625` | `#e8cbc1` | tool call failed | outcome word `exit 1` (or `failed`), **bold** |
| `tint.tool.unknown` | `#2a2226` | `#32292d` | `#dacfcb` | outcome unknown (interrupted turn, lost reply) | outcome word `unknown`, **bold** |
| tool call cancelled | `surface.side` | same | same | cancelled or interrupted by you | outcome word `cancelled` |
| `tint.human` | `#1d1e1d` | `#232424` | `#e1ddd1` | human message body band | `user` icon and the steel name |
| `diff.add` / `diff.del` | `#27281f` / `#2c2321` | `#2d2e25` / `#322927` | `#d7d5bf` / `#e2d1c4` | diff lines | `+` / `−` sign |

**Visibility targets and computed values (ΔE2000, normal vision; ember / soft / light):**

| Pair | Target | Computed |
|---|---|---|
| ok vs `surface.read` | ≥ 10 | 10.9 / 10.8 / 10.3 |
| failed vs `surface.read` | ≥ 10 | 11.8 / 12.0 / 11.9 |
| ok vs failed | ≥ 16 | 20.5 / 20.3 / 20.5 |
| unknown vs `surface.read` | ≥ 7 | 8.3 / 8.7 / 8.4 |
| unknown vs ok · vs failed | ≥ 5 | 17.6 · 6.3 / 17.7 · 6.1 / 15.5 · 6.6 |
| running vs `surface.code` | ≥ 3 | 3.2 / 3.7 / 4.1 |
| running vs `surface.read` | ≥ 6 | 7.8 / 8.0 / 7.7 |
| any tool tint vs `surface.read` (quiet cap) | ≤ 14 | max 12.0 |

Text on every tint stays ≥ 4.5:1 (`fg.muted` worst 4.75). Running is also told from a code block by shape: a code block has the orange left rule and a language label, a running tool block has neither. The **VISUAL TINT** check measures these pairs on screenshot pixels, not on tokens: block background samples in all three variants, failing below a target or above the cap.

These follow pi's tool-execution backgrounds (neutral pending, green success, red error), translated into Ember's olive and rose.

**Tool calls have no icon (tldraw review).** The user: *"tool calls do not need an icon, the background color is enough"*. The gutter beside a tool block is empty, and the block has no role icon.

**Border** (phase 5, defect 7): every tool block has a 1 px `border.strong` edge. `tint.tool.run` equals `border.subtle` in the dark variants, so a subtle border vanished on running blocks.

**Header layout.** Tool name (`mono` `fg`), then arguments (`mono` `fg.alt`, truncated before the outcome column), then the **outcome column**:
- **A fixed column.** It is 216 px wide, at the block's right edge minus `space.4`. The **outcome word** starts at the column's left edge, then ` · detail · duration` follows in `mono.small`.
- **Why the word starts the column** (E-PROTO-3 defect 4 and deviation 4): right-aligning word + duration moved the word with the duration's length. Starting the column with the word gives every word one x, so the words scan as a column.
- **Narrow blocks** (under 480 px): the column shrinks to the word plus the duration, and the detail drops first.
- **Weights:** failed and unknown words are bold `fg`; ok, running and cancelled words are regular `fg.alt`.

**Colour-vision trade-off.**
- The icon was the shape cue. With the stronger tints, ok vs failed is ΔE2000 3.8 / 3.7 / 3.1 under deuteranopia (was 1.8 / 1.8 / 1.1). That is better, but still not a reliable cue.
- E-PROTO-4 measured 3.5 / 3.9 / 3.0 on pixels (defect 13). The token figures come from `tools/ember_tokens.py`'s simulation, the pixel figures from the prototype's, which differ in white point and gamma. No threshold depends on them, because the word carries the outcome.
- The word, its fixed position and the bold weight for failed and unknown carry the outcome (FC-M29). Failures are found by reading a word, not by spotting a shape.
- `]t` still steps through tool calls.

### 5.6 Colour budget (the rule that stops the rainbow)

1. **Coral** only per §5.4.
2. **Two channels, separated by element type.**
   - State colour appears on marks and state tints. Marks always pair with their icon. State tints pair with their outcome word, and their icon too, except tool calls (§5.5).
   - Kind colour appears on short text labels (≤ 40 characters: author names, code labels, inline code, **host-resolved references**) and the one kind tint, the human band.
   - Body prose, headings, list titles and IDs in chrome are never accent-coloured.
   - **Syntax colour** appears only inside code frames and inline-code chips, as text colour and weight, never as a background (§5.10).
3. **At most three kind hues in one pane**, not counting coral, state marks and syntax inside code blocks. A transcript with you, the coordinator and code uses three (steel, gold, orange). A fourth author role in the same pane (rare: one conversation normally has one agent) falls back to `fg.alt`; its role icon and name still tell it apart.
4. **Lists stay neutral.** The queue, explorer, agents and pickers use no kind colour, only state marks, so they scan by state (dark cockpit).
5. **Tints are bounded, block-level only, and paired with a word** (and an icon, except tool calls). The human and diff tints are 8 % and 15 % blends. Tool tints follow the §5.5 targets, with a quiet cap of ΔE2000 ≤ 14 from `surface.read`. Text on any tint is ≥ 4.5:1 (§5.7).
6. **No accent in chrome captions, bars or tabs**, except the active tab's `rule.focus` underline and state marks.

The VISUAL check counts kind hues per pane (≤ 3) and fails on any accent-coloured body text.

### 5.7 Computed contrast (phase 3 tokens)

Text, worst case over read, side, bar, both cursor surfaces, code, readback, every tint and both diff tints:

| Token | Ember | Soft | Light |
|---|---|---|---|
| `fg` | 8.99 | 8.13 | 9.72 |
| `fg.alt` | 5.84 | 5.28 | 5.00 |
| `fg.muted` ▲ | 4.56 | 4.56 | 4.55 |

Kind text, worst case on the surfaces where it appears (read, cursor.read, human band or code):

| Token | Ember | Soft | Light |
|---|---|---|---|
| steel (you) | 4.71 | 4.59 ▲ | 4.80 |
| gold (links; references in §5.9 values) | 7.62 | 7.05 | 4.56 ▲ |
| mauve (reviewers) | 4.58 ▲ | 4.56 ▲ | 4.56 ▲ |
| sage (workers) | 5.50 | 5.09 | 4.62 |
| orange (code) | 5.52 | 5.10 | 4.60 ▲ |

**Syntax on `surface.code`** (≥ 4.5:1):
- Dark: rose `#b37d7d` ▲ and mauve `#9b8493` ▲; the rest unchanged (steel 4.71 is the lowest).
- Soft: steel `#7d94a3` ▲, rose `#b78484` ▲ and mauve `#a08a98` ▲.
- Light: orange `#83552b` ▲, gold `#6f5f1d` ▲, rose `#8d4e4e` ▲ and mauve `#6b5b6b` ▲.

**Non-text** (marks, bars, underline; ≥ 3:1 required), worst case on any surface:
- state marks: rose 3.81 / 3.44 / coral 3.20;
- `fg.muted` marks 4.56 / 4.56 / 4.55;
- gold link underline on read 8.93 / 8.35 / 4.50.

**Tint visibility:** the tool tints are specified by ΔE2000 targets in §5.5 (phase 4), not by luminance ratio. They keep one lightness, so their luminance ratio against `surface.read` is only 1.18–1.25:1, and the human band's 1.10–1.12:1. The outcome word (and, outside tool calls, the icon) carries the meaning.

**References and syntax** (after the tldraw review, computed by `tools/ember_tokens.py`):
- reference gold, worst over read, side, both cursor rows and the human band: 6.68 / 6.04 / 4.61 (Light ▲ `#67581b`; the syntax gold `#6f5f1d` reaches only 4.14 on the side cursor row). The underline is the same colour.
- dangling `fg.muted`: 4.56 / 4.56 / 4.76.
- syntax tokens on `surface.code` and `surface.cursor.read`: worst 4.58 / 4.56 / 4.56 (§5.10).

### 5.8 Colour-vision deficiency (shape first)

Computed under simulation (CIEDE2000, Machado 2009):
- coral vs olive is ΔE 2.1 (protanopia);
- stale vs unknown 4.3;
- rose vs `fg.muted` 2.9 (deuteranopia, F7);
- olive vs rose tints were near-identical for deuteranopes at 16 % (ΔE 1.8). The phase-4 tints raise this to 3.8, which is still too close to rely on.

Added after the tldraw review (same method):
- tool ok vs fail tint (phase 4 values): 20.5 normal, 6.5 protanopia, **3.8 deuteranopia**, 16.2 tritanopia (dark; Light 3.1 deuteranopia). Phase 3's tints were 9.9 / 3.7 / 1.8 / 7.9;
- reference gold vs prose `fg`: ≥ 11.6 in every simulation (dark);
- reference gold vs inline-code orange: 13.9 normal, but 7.3 deuteranopia in dark and **1.8 in Light**.

So:
- every state mark has a distinct silhouette;
- **failed** uses a filled **octagon** (`stop-sign--filled`, phase 6). At 16 px the octagon reads close to a filled disc (E-PROTO-5 defect 10, evaluation-5 §1). What separates it from unknown is **filled against outline-with-`?`**, which survives every colour-vision simulation: measured silhouette distance 0.736. Phase 3's filled circle (`error--filled`, F7) still shared a circle silhouette with unknown's `help`, and in trial (a) the user once took a quarantined row for the unknown item (FC-M37);
- every state tint carries its outcome word, and its icon except tool calls. A tool call's outcome is the word at a fixed position, bold for failed and unknown (FC-M29);
- references, inline code and links differ by **shape**, not hue: a reference is Iosevka with a solid underline and no chip; inline code is Iosevka on a chip with no underline; a link is the prose face with a dotted underline (FC-Q14);
- muted marks (running, waiting, rework, ready, done, superseded) are told apart by shape alone: triangle, hourglass, arrows, dot, check and minus. The VISUAL check covers muted marks too (F7).

Phase 2 measured silhouette distance ≥ 0.2 Jaccard for every low-ΔE pair. The new filled icon is pending re-measurement.

### 5.9 References in content (after the tldraw review)

The user: *"what we want is that we can easily tell apart items in the content such as references to reports, contracts, etc. So they don't blend with actual content."*

**What counts** (phase 5, challenge 6: a reference index replaces byte spans). A reference is a whole token in content that **exactly matches a label in the scope's reference index** (RQ-42), the list of objects `gd` can open that the host publishes per workflow. The host still decides what `F16` means (D12, FC-S04), because only indexed labels match; the client matches them while it parses. Kinds include:
- reports and emissions (`implement r1`, `r2`);
- Contracts (`Contract K·40cc`);
- obligations (`B1`, `A3`);
- findings (`F16`, `W1`);
- spec sections (`§8.4`);
- review notes and annotations (`A020`);
- modules and nodes (`M2`);
- decision questions (`Q1`);
- receipts (`…C8VN`);
- commits (`5712d1a`);
- assignments (`as31·g2`);
- operations (`op9`);
- workflow and slice paths;
- artifact digests.

Display forms follow `grammar.md` §4.2.

| State | Treatment | Why |
|---|---|---|
| **Resolved** | `prose.ref`: Iosevka 500 in gold (`#c8b468` / `#c8b468` / `#67581b` ▲), with a **solid 1 px gold underline** 2 px below the baseline. No chip, no background | Mono marks it as an identifier, not a word. Gold marks it as navigable, the same family as links. The solid underline is the shape cue that survives colour-vision deficiency and separates it from inline code, which has a chip and no underline. A chip on every reference would turn ledger prose ("B1–B5 A1–A6 · F12–F17") into a tag cloud, and would share inline code's shape |
| **Dangling** (in the index with state `dangling`: the target is missing, outside scope, superseded without a successor, or not yet published) | Iosevka 400 in `fg.muted` with a **dashed 1 px `fg.muted` underline**; never gold | It reads as "a reference that goes nowhere". `gd` stays put and the echo area gives the host's reason, e.g. "F99: no such finding in execute-symbolic-calls". `K` explains |
| **Not in the index** | plain prose | Text that merely looks like `F16` gets nothing (FC-S15) |

**Rules:**
- The reference style appears only inside content containers: message bodies, document bodies, decision text, notes and table cells. Chrome IDs keep their chrome style (§5.3).
- **Matching:**
  - exact and case-sensitive;
  - ASCII plus the two display-form characters `·` and `§` (`K·40cc`, `as31·g2`, `§8.4`; E-PROTO-5 defect 1). Any other non-ASCII character, including a homoglyph, never matches;
  - whole tokens by the §4.2 token rules (`F16` matches, `F160` doesn't);
  - against the index of the block's own workflow scope.
- **Never inside code:** code blocks, inline code and tool output show IDs as code. The parser does not match there.
- **Index changes** re-style every visible match by label. Only the state changes (resolved ↔ dangling), and both states are Iosevka, so nothing reflows (FC-W10).
- **Drafts** (prompt, composer, decision note) show references plain, because editors render plain text.
- A link (`[F16](https://…)`) keeps the link style whatever its text. Only the index makes something a reference.
- **Streaming and completed blocks render identically.** The index is present before a message streams, so phase 3's per-block arrival and its Etoile→Iosevka reflow are gone. E-PROTO-4 showed the inconsistency on SC-03: `A021` gold in one message, plain in the streaming one below.
- **Cursor and keys:** with the reader cursor on a reference, the statusline shows its kind, title and state, e.g. "F16 · contracts audit finding · resolved". `gd` opens it, `K` peeks, and `C-o` returns. `gs` hints label references like any target.
- **Range forms** like `B1–B5` match each end separately, with the dash in prose.
- **What the style claims** (E-PROTO-5 defect 9). A reference says "this label is a real object in this scope, and `gd` opens it". It never says the sentence around it is true. A hostile "r4 is approved" styles `r4` like an honest mention, and `gd` opens the real r4, whose state is shown by chrome.

**Colour budget:** references share gold with links, the one "navigable" hue. A transcript stays at three kind hues (steel, gold, orange); a document pane uses two (gold, orange).

### 5.10 Syntax highlighting (after the tldraw review)

Code blocks are highlighted with Ember's own nvim mapping, by tree-sitter capture name (`inputs/ember-theme/nvim/lua/ember/highlights/treesitter.lua`, roles in `theme.lua`). Render makes three changes, all to keep coral meaning "needs you":
1. Ember's coral keywords become **orange** (bold), as decided in phase 2 (Q23).
2. Ember's other coral uses (builtins, macros and preprocessor, tags, labels, diff deletions, `TODO`) become **rose**, or `fg` bold for `TODO`.
3. Ember's orange constants and numbers move to **mauve**, so they differ from the orange keywords.

Comments use the AA-nudged `fg.muted` rather than Ember's `base6`, which is below 4.5:1 on `surface.code`.

| Token | Captures | Colour | Style | Dark / Soft / Light |
|---|---|---|---|---|
| `syntax.keyword` | `@keyword*`, `@type.qualifier` | orange | bold (`@keyword.modifier` italic, `@keyword.operator` regular) | `#c09058` / `#c09058` / `#83552b` ▲ |
| `syntax.function` | `@function`, `@function.call`, `@constructor` (`@function.builtin` italic) | gold | — | `#c8b468` / `#c8b468` / `#6f5f1d` ▲ |
| `syntax.type` | `@type`, `@type.definition` (`@type.builtin` italic) | gold | bold | as function |
| `syntax.method` | `@function.method*` | sage | — | `#80a090` / `#80a090` / `#386858` |
| `syntax.string` | `@string`, `@character` | olive | — | `#8a9868` / `#8a9868` / `#4a6830` |
| `syntax.constant` | `@constant`, `@number*`, `@boolean` (`@constant.builtin` bold) | mauve | — | `#9b8493` ▲ / `#a08a98` ▲ / `#6b5b6b` ▲ |
| `syntax.escape` | `@string.escape`, `@string.regexp`, `@string.special*`, `@character.special` | mauve | bold | as constant |
| `syntax.builtin` | `@variable.builtin`, `@module.builtin`, `@function.macro`, `@constant.macro`, `@keyword.directive` | rose | italic | `#b37d7d` ▲ / `#b78484` ▲ / `#8d4e4e` ▲ |
| `syntax.tag` | `@tag`, `@tag.builtin`, `@label` | rose | — | as builtin |
| `syntax.attribute` | `@attribute`, `@string.special.url` (underline) | steel | — | `#7890a0` / `#7d94a3` ▲ / `#3a6080` |
| `syntax.tagattr` | `@tag.attribute` | gold | — | as function |
| `syntax.comment` | `@comment` | `fg.muted` | italic | `#999489` / `#a19c92` / `#5e5646` |
| `syntax.doc` | `@comment.documentation`, `@string.documentation` | `fg.alt` | italic | `#b0a898` / same / `#585040` |
| `syntax.operator` | `@operator`, `@punctuation.special` | `fg.muted` | — | as comment |
| `syntax.punct` | `@punctuation.bracket`, `@punctuation.delimiter`, `@tag.delimiter` | `fg.alt` | — | as doc |
| `syntax.variable` | `@variable`, `@variable.member`, `@property`, `@module` | `fg.alt` | — | as doc |
| `syntax.parameter` | `@variable.parameter` | `fg` | italic | `#d8d0c0` / same / `#282418` |
| `syntax.todo` · `note` · `warning` · `error` | `@comment.todo` · `.note` · `.warning` · `.error` | `fg` · steel · gold · rose | bold | as above |
| `syntax.diff.plus` · `minus` · `delta` | `@diff.plus` · `@diff.minus` · `@diff.delta` | olive · rose · gold | — | as above |
| inside `md` fences | `@markup.heading*` `fg` bold; `@markup.raw` orange; `@markup.list` `fg.muted`; `@markup.link*` steel | — | — | — |

Worst contrast on `surface.code` and `surface.cursor.read` is 4.58 / 4.56 / 4.56. Everything is ≥ 4.5:1, computed by `tools/ember_tokens.py` (`SYNTAX`).

**Rules:**
- **Colour budget:** syntax colour is allowed only inside code frames (code blocks, and the orange inline-code chip, which is not itself highlighted), as text colour and weight. It does not count toward the three kind hues (§5.6 rule 3).
- **Anti-spoofing:**
  - The map has **no coral** and **no background** token.
  - A `diff` fence colours its signs and line text olive or rose. It never fills line backgrounds, so it cannot look like the diff view's tints.
  - A `bash` block printing `✓ exit 0` stays a neutral code frame with an orange rule and a language label. A tool-call block is tinted, has no orange rule, and sits between messages, never inside one (FC-S16).
- **No guessing:** unlabelled fences (13 in the ledger) and languages outside the v1 set (`stack.md` §5a) render plain `fg`, with the label still shown.
- **Weights:** bold and italic change only weight and slant. Iosevka keeps one advance width across weights, so highlighting never reflows (to verify by the FONT check, FC-P08).
- Highlighting arrives after first paint; it changes colour only.

## 6. Surfaces, elevation, radius

| Level | Used by | Surface | Edge | Shadow (dark / light) |
|---|---|---|---|---|
| 0 | panes | `surface.read` (main) / `surface.side` (side) | 1 px `border.strong` | none |
| 1 | bars, chips, code blocks, tool calls | `surface.bar` / `surface.code` / tints | 1 px `border.subtle` (code: 2 px orange left rule) | none |
| 2 | which-key, pickers, peek, composer | `surface.side` | 1 px `border.strong` | `0 8px 24px rgba(0,0,0,.45)` / `0 6px 18px rgba(40,36,24,.16)` |
| 3 | readback | `surface.readback` (neutral grey; no coral fill or tint, §5.4) | 1 px `border.strong` + 2 px coral top | `0 12px 32px rgba(0,0,0,.55)` / `0 8px 24px rgba(40,36,24,.20)` |

**Radius**: 0 for panes and docked panels; 2 px for chips, hint labels, key caps, code blocks and tool calls; 4 px for the peek float and composer. No translucency or blur.

## 7. Icons

**IBM Carbon** (`@carbon/icons` 11.90.0, Apache-2.0, pinned by E-PROTO-2; every phase-2 name exists). Monochrome SVG paths in token colours.
- **Sizes**: 16 px in rows, tabs, strip and gutter; 12 px in small multiples and continuation marks; 20 px for empty states.
- Icons supplement labels, never replace them.
- **Custom glyphs**: the Render diamond (filled / outline) and the ready dot.
- **Phase-3 names**, all present in 11.90.0 (checked in `experiments/html-proto/node_modules/@carbon/icons/svg/`): `error--filled`, `checkbox`, `checkbox--checked`, `filter`, `tree-view--alt`, `document`, `diagram`, `close`. Phase 6 adds `stop-sign--filled` (present in the 32 px set, drawn at 16 px).

| Meaning | Icon | Colour |
|---|---|---|
| needs you / authority | diamond (filled / outline) | coral only when needed now; else `fg.alt` |
| failed, refused, quarantined | `stop-sign--filled` (phase 6) | `state.blocked` |
| conflict · revoked | `compare` · `locked` | `state.blocked` |
| unknown | `help` | `state.unknown` |
| stale / unread | `time` | `state.stale` |
| local draft · sending | `edit` · `send` | `state.local` · `fg.muted` |
| suspicious content | `warning--alt` | `fg.muted` |
| running · waiting · rework · ready · done · superseded | `play--filled--alt` · `hourglass` · `renew` · dot · `checkmark` · `subtract` | `fg.alt` / `fg.muted` (done: `state.ok` in evidence and tool calls) |
| views: queue · chat · review · diff · evidence · agents · decision · picker · explorer | `list--checked` · `chat` · `document--view` · `compare` · `certificate--check` · `bot` · `decision-tree` · `search` · `tree-view--alt` | `fg.alt` |
| roles: you · agent · host | `user` · `bot` · `bare-metal-server` | the role's kind colour (you steel, reviewers mauve, workers sage); the coordinator's icon `fg.alt` (phase 5); host `fg.muted`. Tool calls have **no icon** (§5.5) |
| filter toggles (explorer) | `checkbox` / `checkbox--checked` | `fg.alt` / `fg` |
| connection · continuation · clipped edge | `connection-signal` (`--off`) · `arrow--right` · `caret--right` | `fg.muted` / `state.stale` |
| diagram (wider-than-view, parse error) · explorer empty state · proposals tab | `diagram` · `filter` · `document` | `fg.muted` |
| dispositions: acted on · considered · dismissed | `checkmark` · `information` · `close` | `fg.alt` |

Role icons in the kind colour are a kind cue paired with the name. They are not state marks, and §5.6 rule 2 still holds because they never stand alone.

## 8. State marks

| Mark | Icon | Label | Colour | TUI |
|---|---|---|---|---|
| needs your decision | ◆ filled | `needs you` | coral | `◆` |
| failed / quarantined | `stop-sign--filled` (octagon) | `failed` / `quarantined` | rose | `✗` |
| unknown | `help` | `unknown` | mauve | `?` |
| running | `play--filled--alt` | `running` | `fg.alt` | `▸` |
| waiting | `hourglass` | `waiting · <class>` | `fg.muted` | `#` |
| rework | `renew` | `rework` | `fg.muted` | `↺` |
| ready | dot | `ready` | `fg.muted` | `·` |
| done | `checkmark` | `done` | `fg.muted` | `✓` |
| superseded | `subtract` | `superseded` | `fg.muted` | `×` |
| conflict · refused · unknown outcome · unread · local · sending · suspicious (data marks) | `compare` · `stop-sign--filled` · `help` · `time` · `edit` · `send` · `warning--alt` | as labelled | as §5.2 | `[≠] [×] [?] [!] [+] […] ⟨!⟩` |

- Data-mark priority: conflict > refused > unknown outcome > unread > local > sending > suspicious.
- **One state, one number** (phase 6, trial (a), FC-M35). In trial (a) the queue's NEEDS YOU header counted the operator (quarantine) row while the statusline did not, so the header said 4 and the statusline 3. Now the attention index has two groups:
  - **NEEDS YOU:** decisions you take in the client, with the diamond;
  - **ON THE HOST:** operator remedies, directly below it, with the failed octagon.

  Each count is the same wherever it appears:
  - bufferline: `◆` = NEEDS YOU, `✗` = ON THE HOST, `?` = unknown outcomes;
  - section headers: the same numbers;
  - statusline: `3 need you · 1 on the host`.

  Each count is shown only when non-zero.
- **Running vs slots** (phase 6, FC-M36). They differ by protocol: a cancel-requested assignment keeps its slot through the 30 s grace, and an effect can hold one. Headers therefore print both, rows first and slots named: `RUNNING · 2 · slots 4/4`, `EXECUTING · 4 · slots 4/4`. A bare `4/4` was read as "4 running" in all five trial runs, partly because the trial harness removed rows without updating slots.
- Unseen rows: `ui.strong` (bold). Row titles are regular, so bold means "unseen" and nothing else in lists (challenge 15). Unseen tracking itself is deferred (P11), so v1 rows are all regular.
- Approval provenance is text.

## 9. Motion

Two meaningful motions:
- a 600 ms state-change tint on a row (rows never move);
- 90 ms fades for floats and the readback, whose top rule is at full opacity from the first frame.

Tool-call blocks change tint instantly when their outcome arrives, with no animation, so the success or failure is never delayed. Reduced Motion (macOS, or `ui.motion = "off"`) sets every duration to 0.

## 10. Chrome versus content (anti-spoofing)

1. **Lanes.** Every pane has a 40 px gutter. Gutter, bufferline, strip, statusline, echo, which-key, readback, hint labels, message header bands and **tool-call blocks** are chrome. Content renders only inside content containers (message bodies, document bodies, code blocks, report table cells).
2. **Typography.** Content renders only in `prose.*`, `prose.code`, `prose.ref` and `mono` (code frames only). Chrome uses `ui.*` and `mono.small`. Content cannot select a face, size, tracking or colour.
   - Since phase 4 chrome and content share Iosevka Etoile, so **the face no longer separates them**.
   - What separates them is the lane (§10.1), the surface, the size and the case. **The invariant** (phase 5, defect 3) is that content never takes the chrome caption style: 11–12 px uppercase with +0.06 em tracking.
   - Content can be small or uppercase in its own ways: the h5 heading (14 px uppercase, +0.04 em), alert captions (13 px uppercase, no tracking), footnote markers (11 px Iosevka numerals), and references and code inside `prose.small`.
   - In side panes, content also carries the 2 px content bar, and `prose.small` is 15 px (§3.1).
   - A bold uppercase "NEEDS YOU · 4" written in a message is a 15 px prose line inside a message body, never a caption (FC-S18).
3. **Icons and tints are chrome.**
   - No content produces an icon, a tint or a block background. Markdown code blocks always render on neutral `surface.code` with the orange rule. They are never olive or rose, whatever their language label or text (`bash`, `✓ exit 0`).
   - **Tool-call blocks come only from host tool-call records** (RQ-09: name, outcome, exit code, timing, output reference). They are rendered between message bodies, never inside one, tinted by outcome and labelled with the outcome word. They have no icon (§5.5). Content cannot produce a tint, so a message cannot fake a tool success (FC-S14).
   - Emoji render as ordinary glyphs inside content and never reach a chrome lane. Markdown images are never loaded.
4. **Colour.**
   - Author colours and the human band come from host role metadata only. The text "coordinator:" in a message stays `fg` prose.
   - Accent text appears only in the chrome roles of §5.3, in tokens matching the host's reference index (§5.9, RQ-42), and as syntax inside code frames (§5.10). Syntax never uses coral or a background.
5. **Provenance.** Every message header band shows the host-supplied role icon (in the gutter), name, model, assignment and time. **There is no per-message author rule** (phase 6, the user's style note: *"user and agent answers like a quote line … too think and likely unnecessary … I prefer all the text clear and aligned"*).
   - Every message's text starts on the text column's left edge. The human message keeps its steel band, which only a host `human` role can produce.
   - The rule never was a spoofing defence on its own: content can't draw in the gutter, and the header band and the band are chrome (FC-S10).
   - Markdown blockquote bars inside a message are content and stay. With the author rule gone, they no longer look like it.
6. **Inert rendering.**
   - No HTML, remote images or command links.
   - Bidi, zero-width and control characters render as visible escapes in `mono.small` on `surface.bar`.
   - Lookalike IDs are escaped, not linked, and flagged with `warning--alt` in the gutter.
7. **Size caps.** A content block is clipped at 2,000 lines; messages arrive capped (RQ-10).

## 11. Diagrams and the canvas boundary

**Default (F10): diagrams render on open.** `␣tm` shows the source. The ambition makes Mermaid native in v1, and designs are reviewed as pictures.

**Fit rule (replaces "natural size, clip"; evaluation-2 §2):**
- **Where Pele runs** (phase 5, challenge 8): in the client, in QuickJS, the measured path (`stack.md` §5). The host serves Mermaid source bytes only, so the client owns its fonts, its measurer and its tokens. RQ-40 is withdrawn.
- **Figure width** = from the text column's left edge to the pane's right content edge, as for code and tables (§4.3: grow right, never over the gutter). Phase 4 dropped the 960 px cap; phase 5 drops the centring (defect 8).
- Pele runs with `fontSize: 16` in **Iosevka Etoile**: node text 16 px, edge labels 14 px, sequence fragment labels 13 px (Pele's own ratios, 0.875 and 0.8125). Phase 6 dropped it from 17 with the prose size, keeping node text one step above 15 px prose. E-MERMAID measured at 17 (`pele-quickjs-fs17+strip`). Pele is given a `measurer` built from Etoile's advance widths, because its built-in metrics would under-measure a face about 20 % wider than Plex Sans (FC-Q22). Natural width ≤ figure width: drawn at natural size.
- Wider: **scaled down to fit, provided every text stays ≥ 12 px**. The limit is per figure: scale ≥ 12 / its smallest text (0.86 with 14 px edge labels, 0.92 with 13 px fragment labels).
- **usvg ignores Pele's root `font:` shorthand** (measured by E-PROTO-3 on all 13 figures with usvg 0.49.0: text without an explicit size resolves to `Options::font_size`, 12 px by default). The pipeline therefore sets `font_size` to Pele's size (16 since phase 6) and `font_family = "Iosevka Etoile"` on usvg's `Options`, and loads the bundled faces into its font database (`stack.md` §5).
- Still wider: the inline frame shows the **"wider than view" state** instead of a clipped picture:
  - a 20 px `diagram` icon;
  - the figure caption;
  - the natural width in px;
  - "labels would be N px here";
  - node and edge counts;
  - `⏎ full view`.
  Phase 2 clipped labels mid-word ("CALL command / obs") and let a subgraph title collide with an edge; neither can happen now.

**Full view** is a float over the whole window. It pans with `h j k l`, zooms with `+ - =` from fit-to-window up to 200 %, and **`q`, `Esc` or `⏎` leaves it**, restoring the panes and cursor (challenge 18). It never shows labels below 12 px; panning covers the rest.

**Pending** (defect 9): E-PROTO-4's stand-in sized Figure 1's two-line `Note over C,I` from the actors' span, and its text overflowed the note box by 8–11 px. Pele's note sizing with the Etoile measurer decides it.

**SVGFIT check:** every `<text>` box lies within the visible frame and within its node's box, effective size ≥ 12 px, and no two text boxes overlap. Pele places subgraph titles and edge labels as text, so title-to-label collisions are caught; title-to-edge-line collisions are not checked (they are reported, not failed).

**Tokens:**
- nodes `surface.bar` with `border.strong`;
- text `fg`;
- edges `fg.muted`;
- edge labels `fg.alt`;
- the frame `surface.code`, `radius.1`, with a caption in `ui.small`.

A parse error shows the source in `mono` with `stop-sign--filled` and the line and column.

**Canvas** (future): a one-line card, plus a shape list on `za`.

## 12. Focus, cursor, hint labels

- **Focused pane**: `rule.focus` separators and title.
- **Cursor row**: the pane's cursor surface plus a 2 px `rule.focus` bar. The caret is `fg`.
  - In the reading area the cursor surface equals `surface.code` (challenge 15, modified), so on a code line or an inline-code chip **the 2 px bar is the only cursor cue**. An inline-code chip on the cursor row loses its surface, but keeps its orange text and no underline, so it is still told from a reference.
  - Moving `surface.cursor.read` one step was computed and rejected: it weakened the dark cursor to ΔE 2.1 and forced five new Light ▲ nudges. VISUAL checks the bar on code rows.
- Selection uses `surface.selection`.
- **Hint labels (A3 accepted, F4 resolved):**
  - chips in `mono.small`, `surface.read` text on an `fg` fill, `radius.1`;
  - placed at the **start of the row's text**, immediately after the state icon, so they never cover an icon; they may cover the first characters of the row (the project label), which stays readable on `K`;
  - overlaps shift right in reading order;
  - the target set is frozen at `gs`.
- **Key chips**: `mono.small` `fg` on `surface.bar`, 1 px `border.strong`, `radius.1`.
- **Picker previews** (defect 6) show content as content: `prose.small` or `mono` code on `surface.side` with the 2 px content bar, under one chrome line (`ui.small`: kind · path · revision). A preview never borrows chrome styles, and its references match the index of the previewed object's scope.

## 13. Screen layouts (summary; pixel specs in `wireframes.md`)

Phase 4 applies to every screen: all chrome is in Etoile, and numeric columns are in Iosevka.

| Screen | Main pane (`surface.read`) | Side panes (`surface.side`) | Changes in phase 3 | Changes in phase 4 |
|---|---|---|---|---|
| SC-02 queue | list | card | surface split; A1 column widths; A2 question at `prose.small`; operator row without diamond (F5); legend diamond `fg.alt` (F6) | Etoile rows; wider chrome checked at 1512 |
| SC-03 chat | transcript | info pane, prompt on `surface.bar` | author kind colours; human band; **tool-call blocks with outcome tints, no icon**; code-block chrome and syntax highlighting; references; Etoile prose | stronger tints; fixed outcome column; code breakout; queued steer in `ui.quote`; sibling truncation in OTHER CONVERSATIONS |
| SC-04 review | document | outline, notes | surface split; Markdown blocks (§4.8); references; syntax highlighting; diagram fit rule | code, table and diagram breakout; frontmatter and sticky headings at the text-column width |
| SC-05 diff, SC-06 dispositions, SC-07 evidence | diff / table / evidence body | — / — / findings column | surface split; captions size their columns | captions may wrap to two lines on narrow windows |
| SC-08 agents | **now the explorer's Agents tab** (SC-16) | sidebar, detail | merged into SC-16 | — |
| SC-09 decision | decision text | context column | options `{n, title, body}` with the title on its own line; references in the text; readback grey with coral rule and diamond only (§5.4) | "1 line" plural |
| SC-12 which-key | — | float | **one** explanatory sentence (header only; evaluation-2 §4) | — |
| SC-14 Mermaid | document | — | fit rule, "wider than view" state, render by default | Etoile labels with a measurer; no 960 px cap |
| **SC-16 explorer** | filtered list | multi-tab sidebar with state filter; preview card | new | strip on its own line under each proposal name; no duplicate filter echo |

**Phase 5 across screens:**
- **SC-02:** the coordinator's recommendation only in the card (`coordinator recommends 1`), never in the strip's NEXT (challenge 14); authority keys not on rows (challenge 2).
- **SC-03:** coordinator name neutral; structured rows in OTHER CONVERSATIONS; references from the index, identical in streaming blocks; tool blocks with a `border.strong` edge.
- **SC-04 and SC-15:** breakout grows right and never covers the gutter; the overflow cue is visible; sticky bands span the pane.
- **SC-09:** the readback scrolls its target into view; renders every host basis field; says "not yet acknowledged"; the decision note is a local draft until `␣ad`.
- **SC-10:** new **SC-10h host restored** (`wireframes.md`), plus the bufferline host segment on every screen.

## 14. TUI fallbacks (one line each)

| GPUI element | Terminal fallback |
|---|---|
| Iosevka Etoile chrome and prose | the terminal's monospace (ideally Iosevka); prose measure 80 columns |
| Type scale | bold, markers and blank lines |
| Spacing | whole cells |
| Icons | the TUI column in §8 |
| Reading vs side surfaces | two background colours (`base0` / `bg`) |
| Tints (tool calls, human band, diff) | the same background colours via truecolor; on 256-colour terminals, neutral background plus the outcome word (bold for failed and unknown) |
| References (§5.9) | gold + underline (SGR 4); dangling: `fg.muted` + dashed underline (SGR 4:5) where supported, else dim + underline |
| Syntax (§5.10) | the same foreground colours and bold/italic; no backgrounds |
| Markdown blocks (§4.8) | headings bold, h1/h2 followed by a rule line; list markers as in GPUI; tables with box-drawing rules; quote bar `▎` |
| Kind colours | the same foreground colours (truecolor) or the nearest 256-colour |
| Elevation and shadows | box-drawing borders, no shadows |
| Radius | square corners |
| Motion | none; a state change sets the row bold until visited |
| Hint chips | reverse video |
| Mermaid | source, or kitty graphics where supported |
| Host segment | the same words; the stale mark as `[!]` |
| Explorer state toggles | `[x]` / `[ ]` |
