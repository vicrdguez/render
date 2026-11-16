# Wireframes: pixel layout at 1512 × 982

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). File names in code spans are relative to `docs/ui/`. Measured, looked-at and reasoned claims are separated in [`../evidence.md`](../evidence.md).

This is the normative pixel layout of the Brief design.
- **Coordinates:** logical px in a maximised window on a 14″ MacBook Pro, 1512 × 982. The origin is top-left; boxes are given as x, y, w, h.
- **Tokens:** type tokens are in `reference/visual-language.md` §3, surfaces in §5.1, and every value in `ember-tokens.json`.
- **Sample content:** comes from the one fixture in [`text-mocks.md`](text-mocks.md).
- **Width:** each section ends with what changes under 1180 px and at 800 px.

**Applies everywhere:**

| Rule | Value |
|---|---|
| Faces | Iosevka Etoile for chrome and prose; Iosevka for code, IDs, digests, keys and numeric columns |
| Body | `prose` 14/21 |
| Text measure | 600 px (80 × the mean advance at 14 px, floored to 4 px) |
| Radii | 0 everywhere, except 2 px on Render-drawn key chips, count tags and hint labels. Inline code, IDs and paths in text are rune pills with rune's fixed metrics (radius 5 pt, about 7 px a side), a recorded deviation |
| Separators | 1 px straight `border.subtle` hairlines between rows; regions are told apart by a surface step, never a rule |
| Selection, ordinary row | A square band on `surface.cursor.read` across the row, with a **2 px coral bar on the band's left edge**. One per window |
| Selection, needs-you row | The head line is **solid coral**, square and full band width, with text knocked out in `surface.read`. No bar beside it |
| Document cursor | Full-width current-line band, 2 px coral bar in the gutter (x 396–398), coral block caret |
| Agent content | Never drawn in coral; a streaming tail is a `fg.muted` block |
| Empty values | No field is a bare dash. A dash stays only as a value in a numeric column |

## 0. Frame (every screen)

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Tab bar | 0 | 0 | 1512 | 36 | `surface.side`, no rule | See below |
| Track row (work views only) | 0 | 36 | 1512 | 40 | `surface.read` | Left padding 172, right padding 116. Track, then the abnormal-fact slot (one entry, by the ladder in spec §2.3: rungs 1–4 in `fg` with their mark, the calm form in `fg.alt`), then action segments right-aligned to the right margin's right edge (x 1396 at 1512) |
| Stage | 0 | 36 (76 on work views) | 1512 | 894 (854) | `surface.read` | One page |
| Notice band (when a state needs one) | 0 | top of stage | 1512 | 38, or taller when wrapped | `surface.side` | Icon 13, text `ui` `fg` from x 172, action chip right-aligned to x 1396. It pushes the stage down by its height |
| Bottom float | 0 | ends at 930 | 1512 | grows to fit, up to 40 % of 982 (393) | `surface.readback`, 2 px coral top rule, shadow `0 -14px 40px rgba(0,0,0,.45)` | Leader menu, palette, pickers, handover, filter, readback, stale reply, outbox, URL confirm. Content padding 48 left and right |
| Statusline | 0 | 930 | 1512 | 26 | `surface.bar`, no rule | See below |
| Echo row | 0 | 956 | 1512 | 26 | `surface.side` | One `ui` message at x 16 in `fg.alt`, kept in `:messages`. Empty when nothing was said |

**Tab bar contents:**
- **Window controls:** painted by the OS at x 14–64, y 12.
- **Nav icons:** four 28 × 28 cells from x 80 (Slices, Proposals, Agents, Find), 16 px icons in `fg.muted`, then a 1 px hairline.
- **Tabs:** each is padding 14, orange `mono.small` number, 14 px view icon, `ui` label. The active tab has `surface.read` fill, a 2 px coral top rule and `fg`; the others are `fg.muted`, with a hairline between tabs. Local drafts show as a sage `edit` icon (12) and a count.
- **Count tags:** right-aligned to x 1496, gap 10. Each is 34 × 16 (wider with more digits), radius 2, with an 11 px icon and a `mono.small` number knocked out in `surface.read`:
  - coral with `◆` for needs you;
  - rose (`state.blocked`) with `×` for on the host;
  - mauve (`state.unknown`) with `?` for unknown.
  Each shows only while its count is above 0.

**Statusline contents** (left to right, `ui.small` 12/16):

| Segment | Geometry and style |
|---|---|
| Mode badge | x 0, h 26, padding 0 10 0 12, `surface.cursor.side`, Iosevka 11/14 600 uppercase +0.08 em in `fg`, with a 2 px left edge: coral `NORMAL`, sage `INSERT`, steel `VISUAL`/`V-LINE`, orange `COMMAND`/`HINT`. `READBACK` is a solid coral fill with the word knocked out |
| Breadcrumb | padding-left 12, `fg.alt`, separators `›` in `fg.muted`; the first segment sage when it is a project |
| Save state | Margin-left 18: sage `edit` 12, `2 not saved` in `fg.alt`, then the `:w` chip. Shown only while drafts exist. The chip is live only in Normal and Visual while writes are on and no float is open; in Insert, COMMAND and under any float it draws `fg.muted` and is inert; under a readback it is hidden |
| Pending keys | `mono.small` orange, the drawn leader mark for `␣`; shown only while a sequence is pending |
| Basis token | Authority views only, `mono.small` `fg.muted`, `basis r2 v3 pol3`. Unacknowledged: `basis r2 v5→v6 [!] pol3 ]d`, with `[!]` orange and `]d` a chip; the chip is omitted while a readback is open |
| Host segment | Right side, margin-right 16. Calm: `homeserver` sage, then `· protected to seq 18340 (2 m) · +2 unprotected` `fg.muted`. Not calm: `fg`, a 12 px steel `time` mark (or the offline ring, or the rose stop-sign when revoked), and the spec's words |
| Seq | `mono.small` `fg.muted`, margin-right 14: `seq 18342`, or `seq 18350 · as of 14:05:31` when the view isn't live |

**Statusline drop order** at narrow widths: the breadcrumb first (truncating from the left), then the save label, then a calm host segment. The mode badge, the seq and a host segment that isn't calm never drop. Messages never compete for this row; they have the echo row.

**Under 1180 px:**
- inactive tabs shrink to number and icon;
- the nav icons tighten to x 76;
- the Track row's padding becomes 0 16 0 24;
- Track labels other than the current stage drop, and connectors shorten to 8 px.

### 0.1 Widths from 1180 to 1512 px, and under

`w` is the window width in logical px. Values round to whole px.

**Work views** (review, decision, evidence, chat, Proposal page, settings, local prompt). The axis is left padding · left margin · 24 · gutter 40 · text 600 · 40 · right margin · right padding. The gutter and text column (640 px with their gaps) never change.
- **w ≥ 1264:** margins at full size (left 200, right 320); the 1224 px axis is placed with the leftover split 3:2, so left padding `floor(0.6 × (w − 1224))` and right padding the rest. At 1512: 172 and 116; at 1264: 24 and 16, where the next band starts.
- **1180 ≤ w < 1264:** paddings fixed at 24 left and 16 right; the right margin shrinks first, `320 − (1264 − w)`, down to 240 (at w = 1184); then the left margin, from 200 down to 196 at 1180.
- **w < 1180:** margin notes fold inline under their paragraph, the left margin hides, and the gutter and text column are centred: text x `(w − 600) / 2`. The Track row's padding becomes 0 16 0 24.
- The Track row's Track starts at the left margin's left edge and its segments end at the right margin's right edge.

**The Brief.** Columns from x 48 with a 56 px gap and 48 px right padding: right column `round(0.397 × (w − 152))`, left column the rest, so 820 and 540 at 1512. Minimums 600 and 400, never reached above 1180. Under 1180 the columns stack at x 44, width `min(w − 76, 820)`.

**Lists.** Peek box `round(0.357 × w)` wide, minimum 440, at the window's right edge, with a 40 px right padding inside it; list column from x 48 to 44 px left of the peek. Under 1180 the peek hides and the list column runs from x 48 to `w − 48`.

**Worked values:**

| Region | 1512 | 1200 | 1000 | 800 |
|---|---|---|---|---|
| Work view: left margin | 172–372 | 24–224 | hidden | hidden |
| Work view: gutter | 396–436 | 248–288 | 160–200 | 60–100 |
| Work view: text column | 436–1036 | 288–888 | 200–800 | 100–700 |
| Work view: right margin (notes) | 1076–1396 | 928–1184 (256) | notes inline | notes inline |
| Brief: left column | 48–868 | 48–680 (632) | 44–864, stacked | 44–768, stacked |
| Brief: right column | 924–1464 | 736–1152 (416) | below, same box | below, same box |
| Lists: list column | 48–928 | 48–716 | 48–952 | 48–752 |
| Lists: peek box (content) | 972–1512 (500) | 760–1200 (400) | hidden | hidden |

## SC-02 The Brief

The Brief has no Track row. Stage y 36–930.

| Region | x | y (window) | w | Contents |
|---|---|---|---|---|
| Left column | 48 | 58 | 820 | Title, since line, Needs you, On the host, Waiting |
| Right column | 924 | 58 | 540 | Running, Done |

**Title and since line:**
- `page.title` 22/28 700 rose `Needs you`, with a coral count 9 px after it. Calm: `Nothing needs you`.
- 3 px below, the since line, 18 px high, `ui.small` `fg.alt`, with a 13 px `time` icon: `Since 13:03 on this device · away 1 h · 1 new for you · 1 on the host · 3 started`. When no row moved it reads `Since 13:03 on this device · away 1 h · nothing changed`. It is absent when you never left, and then the first group sits 16 px under the title.

**Entries** (Needs you, On the host). They start 12 px under the since line. The band spans x 20–880: the column, plus 28 px left for the selection bar gutter and 12 px right.

| Part | Geometry | Style |
|---|---|---|
| Band | padding 6 12 8 28, hairline above (none on the first) | `surface.cursor.read` when selected |
| Head | min-height 20; mark column 14 px at x 48, then 10 gap | Mark: coral `◆` 12, or rose stop-sign 13 on the host. Move `move` 14/20 600 `fg`, qualifier 400 `fg.alt`. Time right-aligned, `mono.small` `fg.alt` |
| Selected needs-you head | The head line fills x 20–880, height 26, solid coral; mark, move, time and the `⏎` chip knocked out | No bar |
| Selected other row | The band, plus the 2 px coral bar at x 20, full band height | |
| Byline | x 72, 1 px below the head, 12/17 `fg.alt` | Project and proposal in sage, 2 spaces after the title |
| Ask, content-typed field | x 72, 4 px below, 13/19 `fg`, 2 px `border.strong` content bar at x 72 with 10 px padding, at most 2 lines | Agent-authored text: a decision's question, a coordinator sentence |
| Ask, host value | x 72, 12/17 `fg.alt`, steel label first | `blocker none · 1 uncertainty` |
| Foot | x 72, 5 px below, 16 high | Track (12/16; 11 px marks; 14 px connectors with 6 px gaps) or ticks (3 × 10 px each, 2 px gap, olive), then `blocks N` right-aligned (`ui.small` `fg.muted`, number `mono.small` `fg.alt`) |
| Unseen since return | Title weight 700 (`ui.strong`); no dot | Cleared when the cursor visits |

**Groups:**
- Header 24 px, margin-top 14: `group` 13/18 600 steel, count in `fg.alt`.
- **Waiting rows:** 28 px with hairlines, padding 0 12 0 28. Columns: mark 14 (hourglass 13 `fg.muted`, or mauve `?`), title `ui` `fg.alt` 440 px, reason `ui.small` `fg.muted` filling the rest, time `mono.small` right-aligned. A risk row's title and leading word are `fg`.
- **Heavy day:** a last row 28 px high reads `↓ 15 more below · the list scrolls as the cursor moves`.

**Running rows** (right column):
- **Header:** `Running 4`, then slot pips (12 × 5, gap 3, filled in the role hue: sage for workers, mauve for reviewers; a cancelled run holding its slot is outlined), then `slots 4/4` right-aligned.
- **Rows:** padding 6 12 7 28, hairline above; three lines.
  - Line 1, chrome: 12 px play icon, title `ui` `fg`, project sage `ui.small`, time running `mono.small` right.
  - Line 2, chrome: `ui.small` 12/17 in `fg.alt`: role in its hue, `· pass N`.
  - Line 3, content: `lastActivity` as sent, `prose.small` 13/19 `fg` on a 2 px `border.strong` content bar at x 972 with 10 px padding, one line ending in `…`. Its host time, `1 m ago`, is chrome: `mono.small` `fg.muted`, right-aligned on the same line, outside the bar.
- **Done:** a 24 px collapsed header, 14 px below Running: chevron, `Done, last 24 h 3`.

**Handover float (`K`):**
- **Head row:** padding 10 48 0. Title `ui` 14/20 600, path `ui.small` (first segment sage), meta right-aligned (`reviews 1 of 2 · since 10-25 09:52 · blocks 4 direct, 25 in all`).
- **Five columns:** grid `1.25fr 1fr 1fr 1.15fr 1fr`, gap 28, padding 10 48 4.
  - Labels `ui.small` steel with a 12 px icon; values 13/19 `fg`; IDs `mono` orange; sub-lines 12 `fg.muted`.
  - Blocker and next are lit: label `fg`; next value 600.
- **Footer:** padding 4 48 10: `j k move · ⏎ opens · ␣n opens next · K closes`. These are the `handover` key set; every other key is inert while it is open.
- The list scrolls so the cursor row stays above the float.

**Under 1180 px:** both columns stack at x 44, width `min(w − 76, 820)` (724 at 800 px), in `j` order: Needs you, On the host, Waiting, Running, Done.

## SC-03 Chat

| Region | x | y | w | Contents |
|---|---|---|---|---|
| Track row | 0 | 36 | 1512 | Design Track with the current stage `◆ Modules r2 awaiting you`; slot `turn t42 running · 11 m · 5 tools`; segment `◆ ␣n Modules r2` |
| Roster (left margin) | 172 | 98 | 200 | Project name sage 12/16; rows 28 px with hairlines: key or role icon (12), role in its hue, state `ui.small` `fg.muted`, time `mono.small` right. Current conversation on `surface.cursor.read` with the 2 px bar |
| Transcript | gutter 396–436, text 436–1036 | from 98 | 600 | Messages, 20 px apart |
| Right margin | 1076 | at the anchor message | 320 | Artifacts in this turn: rows 24 px, `mono` name, `ui.small` state |
| Pending steers | 436 | above the composer, 14 px gap | 600 | `ui.small` header (`send` icon, `#2 13:55 · on host, not yet delivered`), excerpt 13/19 on a 2 px content bar |
| Composer | 396 | bottom at 916 (14 above the statusline) | 640 | See below |

**Message parts:**

| Part | Geometry and style |
|---|---|
| Header band | 20 high, role icon 14 in the gutter at x 405. Name 13/18 600 in the role hue (coordinator `fg`, you steel, workers sage, reviewers mauve); meta `ui.small` `fg.muted`. Model, assignment, turn and receipt are on `K` |
| Human message | Band `tint.human` from x 396 to 1036, padding 7 0 8 40 |
| Tool call | 28 high, 1 px `border.strong`, square, on its outcome tint (ok `#212615`, failed `#321f1e`, unknown `#2a2226`, running `#2e2d2a`). Name `mono` 600 `fg`, arguments `mono` `fg.alt` 250 px; the outcome column starts at x 776 (block x + 340); failed and unknown words 600. A cursor on a tool row draws the 2 px coral bar at x 395 |
| Folded calls | Same row with a chevron and `2 tool calls`, ok tint |
| Code block | `surface.code` with a 2 px gold left rule, `mono` 13/20, padding 7 14; grows right to x 1396 |
| Streaming tail | 8 × 17 block in `fg.muted` |

**Composer:** `surface.side`, 1 px `border.strong`, square, no pencil icon.
- Header 28 px: `→ steer · turn t42 running · delivers after the current tool call` (or `→ prompt · turn t42 ended · sending starts a new turn`).
- Body padding 8 14 8 40, `prose` 14/21, min 58 px; coral bar caret in Insert.
- Footer, Insert only, from the keys bound in Insert: `Esc jk leave Insert · ⌘⏎ sends · M-⏎ queue as follow-up`. `⏎` in Normal and `␣cx` are not printed here.

**`37 new ↓`:** a 24 px chip on `surface.bar` with a 1 px `border.strong` edge, centred on the column, 30 px above the composer.

**Under 1180 px:** the roster and right margin hide; the text column is centred (§0.1).

## SC-04 Review

| Region | x | y | w | Contents |
|---|---|---|---|---|
| Track row | 0 | 36 | 1512 | Design Track; slot `your review · captured s2`; segments `␣ar rework` and `␣aa approve`, equal weight, neutral |
| Left margin | 172 | 98 | 200 | Head `modules r2` 13/18 600; `9f3c·a1e2 · emitted 13:57` `ui.small`; outline rows 26 px (ID `mono.small` 22 px, title, notes mark right); current node on `surface.cursor.read`; groups `Previous round r1` and `Challenger r2`, 22 px apart |
| Document | gutter 396–436, text 436–1036 | from 98 | 600 | The emission |
| Right margin | 1076 | at each note's anchor | 320 | Notes, composer, first-note hint |

**Document:**
- **Headings:** `h1` 20/28 700 rose, with a 1 px `border.strong` rule 6 px below spanning the column. `h2` 17/24 600 orange, with the node ID in the gutter (`mono.small` `fg.muted`) and the class word right-aligned (`ui.small` `fg.muted`).
- **Paragraphs:** 14/21, 10 px apart.
- **Change bars:** 2 px `fg.muted` at x 426 over the changed lines.
- **Unacknowledged change:** `[!]` orange in the gutter.

**Notes:**
- Each note is `padding 1 0 3 12` with a 2 px left bar: `border.strong` for saved and previous-round notes, sage for local drafts.
- Header 12/16: id `mono` `fg.alt`, then where and status.
- Body 13/19.
- A previous-round note adds a reply line with a `fg.muted` label.

**Stacking:**
- Each note sits at its anchor's y, or 10 px below the previous one.
- A code block running past x 1068 is an obstacle; notes beside it move below it.
- A note pushed more than about two lines (42 px) below its anchor collapses to its header line, with `↑`, unless the cursor is on its anchor. Notes that push the cursor's note also collapse.
- Measured drift of full notes: at most 39 px, except the cursor's own note, which the rule exempts (44 px at 1200 px; `../evidence.md`).

**Composer and hint:**
- **Composer:** x 1076, w 320, `surface.side`, 1 px `border.strong`, padding 7 11 8. Header `note on M4 ¶2 · local · editing`; body 13/19 with a coral bar caret; footer in Insert `Esc jk leave Insert · stays on this device until you save`. After `Esc Esc`, the statusline's `:w` and the Track row's `␣ar rework` carry the rest.
- **First-note hint:** `+ note c` at x 1090 on the cursor line, `ui.small` `fg.muted`, until 3 notes are written on this device.

**Readback** (bottom float):

| Part | Geometry and style |
|---|---|
| Head row | Padding 12 48 0. Verb tag 22 high, solid coral, `◆` and the verb in Iosevka 11/14 600 knocked out. Target 14/20 600. State line right-aligned `ui.small`: `fresh · every basis field acknowledged · seq 18356 · host 14:07:10 (0 s ago)`, the first word 600 `fg` |
| Body | Grid `400px 1fr`, gap 56, padding 12 48 14 |
| Left: binds | `ui.small` steel label, then rows: key 96 px `ui.small` `fg.muted`, value `mono` 12.5/20 `fg`; a changed field's key in `fg` and `[!]` orange |
| Right: carries, effect, not | Grid `64px 1fr`, row gap 8, labels steel, values 13/19 `fg` |
| Key bar | 18 px below the right column at a fixed y: `y confirm · n Esc q cancel · K full basis`, and `pinned 14:07:07 at modules r2` right-aligned |

While a readback is open, the mode badge is `READBACK`, and every chip and segment outside the float is `fg.muted` and inert, as under any bottom float. The page scrolls so the pinned target sits above the float.

**Lenses:**
- `␣md` compare: two 600 px columns at x 116 and x 796 over the stage, hunks aligned, `diff.add` and `diff.del` tints with `+`/`−` signs.
- `␣om` dispositions: a list in the text column: note, disposition word, where it went.

**Under 1180 px:**
- the left margin hides; the text column is centred (§0.1);
- notes fold inline under their paragraph (`margin -2 0 12 0`);
- a wide code block clips with the FC-Q19 cue: a 32 px fade to `surface.code`, a 2 px `fg.muted` edge rule and a `›` at the right edge.

## SC-07 Evidence

| Region | x | y | w | Contents |
|---|---|---|---|---|
| Track row | 0 | 36 | 1512 | Slice Track; slot `● F16 HARD · aliased callee Axes undefined`; segment `◆ ␣n Answer Q1` |
| Left margin | 172 | 98 | 200 | Passes (pass 2 current, expanded; pass 1 historical), Obligations 12, Findings 7 (`Audit 6 · Watchdog r1 1`) |
| Document | 436 | from 98 | 600, the matrix 960 | Title, proof chain, the `.gitattributes` notice, rank paragraph, Findings, Obligations, Gate receipt, Catalog, Web passage, Native checks, Limitations |

**Proof chain:**
- Nodes 6 7 padding.
- Mark (12 px) at x 409 on a 1 px `border.strong` line joining the nodes.
- Node line 13/20 600 with the digest in `mono` orange and an end note right-aligned.
- Sub-line 12/17 `fg.alt`.

**Rows:**
- **Findings:** grid `40px 52px 1fr 116px`, rows at least 28 px with hairlines; the HARD row is lit.
- **Matrix:** grid `30px 248px 286px 176px 1fr`, rows 28 px. Header: `id · obligation · implementer @5712d1a · Audit @a6dcb53 · Watchdog · none yet`.

**Under 1180 px:** the left margin hides; the matrix scrolls with the clip cue.

## SC-08 Agents list, SC-16 Slices and Proposals lists

No Track row. The list column is x 48, w 880 (rows run x 20–928). The peek box is 972, 36, 540, 894, with 500 px of content after its 40 px right padding. Between 1180 and 1512 px both scale (§0.1).

| Part | Geometry and style |
|---|---|
| Head | `page.title` 22/28 rose, count 18 px 400 `fg.alt`; tools right-aligned `ui.small` `fg.alt` (Slices: `Filter`; Proposals: `not archived · host dependency order`; Agents: `all projects`) |
| Filter words (Slices) | 20 px, 6 px below: scope `fg.alt`, words `fg` with `×`, `saved: review-queue`, `dependency order` right |
| Column heads | 24 px, 14 px below, lowercase `ui.small` `fg.muted`. Slices grid `24px 300px 1fr 80px 56px 34px` |
| Group heads | 30 px, 13/18 600 steel; project sage 400; count `fg.alt` |
| Rows | 28 px, hairline above, padding 0 12 0 28. A selected row has the band and the 2 px bar; a selected row on a `human` wait is the solid coral head with `⏎` |
| Hint line | 14 px below: `69 open slices hidden by the filter · :filter clear shows them · ]g next group` |
| Proposals rows | 52 px, two lines. Line 1: name 270, strip 300, counts 116 (only non-zero ones), status. Line 2: readiness, 12/17 |
| Proposals legend | 16 px below the rows, `ui.small` |
| Agents rows | Grid `24px 30px 84px 300px 130px 1fr 60px`, 28 px; groups Executing, On the host, Held, Queued |
| Peek | box x 972, w 540, padding 22 40 0 0, so content w 500. Title 14/20 600, path, a full-width meta line, then single-column sections, 14 px apart. Gives way while the `K` float is open; hidden under 1180 px |

**Filter float (`␣sf`):**
- Grid `560px 330px 1fr`, gap 44, padding 10 48 14.
- Rows 21 px.
- Scope tree indented 14 and 28.
- Small multiples in `mono` 11.5 with 1 px letter-spacing.

## SC-09 Decision

| Region | x | y | w | Contents |
|---|---|---|---|---|
| Track row | 0 | 36 | 1512 | Slice Track; slot `● F16 HARD · aliased callee Axes undefined`; segment, solid coral, `◆ ␣ad Answer Q1` |
| Left margin | 172 | 98 | 200 | `This Slice`, `History` |
| Document | 436 | from 98 | 600 | Content `h1` with its rule (the question), lede `fg.alt`, provenance `ui.small`, `Evidence` (bullets with a `–` marker in `fg.muted`), `Options` (head right `coordinator recommends 1`), `Your answer` (head right `local draft · sent with your answer`) |
| Right margin | 1076 | at Evidence | 320 | `related · gd opens`: references, rows 24 px |

**Options:**
- Padding 9 0 10; number `mono` 13/20 in the gutter.
- Title 14/20 600, then a square `recommended` tag (18 high, 1 px `border.strong`, `ui.small` `fg.alt`); body 14/21.
- The cursor option is on `surface.cursor.read` from x 380, with the 2 px bar at x 380.

**Your answer:**
- At rest, on a 2 px sage bar.
- In Insert, a composer (`surface.side`, 1 px edge): header `your answer · local · editing`, footer in Insert `Esc jk leave Insert · stays on this device until you answer`. The Track row's `◆ ␣ad Answer Q1` sends it.

**Readback:** as in SC-04. The pane scrolls so the cursor option's title and body sit above the float.

## SC-10 States

| State | Geometry |
|---|---|
| Offline, revoked, restored | The notice band (38 px, taller when wrapped) under the Track row, or at the top of the Brief's stage. Action segments that need the host draw a dashed 1 px `border.subtle` edge (rune `border_dash`) in `fg.muted`, lose their key chip, and are followed by `· off` |
| Fresh snapshot | Echo row only; basis token and gutter `[!]` |
| `stale_basis` | Bottom float: grid `330px 330px 1fr`, gap 40, padding 12 48 14. You sent, host has, what changed. The tag `stale_basis` is a 22 px outlined box |
| Unknown outcome | The Track-row slot, plus the outbox float: rows padding 7 48 8 76, mark at x 50, command `mono` 96 px, verb 128 px |
| Uncertain effect | A work view: operation Track in the Track row; the `Blocks` and `Continues` groups in the left margin; document sections `Operation` (key-value grid `104px 1fr`), `Safe choices`, `Decide` (a 30 px line with `⏎ open`) |
| Can't show | A block in the text column, `surface.side`, padding 16 18, a 16 px `view--off` icon |

## SC-11 Palette and pickers, SC-12 which-key

All of these are bottom floats.

**Palette (`:`, `␣;`, `␣.`, `⌘K`):**
- Grid `1fr 1fr`, min-height 250.
- Results grow upward from the input, rows 26 px with hairlines: ex name `mono` 110 px, description, reason `ui.small` `fg.muted` when unavailable, key `mono.small` orange right-aligned.
- The selected row is on `surface.cursor.side` with the 2 px bar.
- Input line 32 px at the bottom: `:` and the query in `mono` 14/20, coral block caret, count `ui.small` right (`7 of 109 commands`).
- The preview takes the right half, padding 14 48 14 28, with a hairline on its left.

**Which-key:**
- Head row: the drawn leader mark and `display only · decides nothing`, `Esc closes` right.
- Grid of 5 columns, rows 23 px: key `mono` 12.5 orange 14 px wide, then the word. Groups are `fg`, leaves `fg.alt`.
- **`␣a`:** 3 columns. Each leaf has the outlined diamond. A leaf that can't run here is `fg.muted` and ends with its reason: `· settings only`, `· not on this view`, or the host's reason.

## SC-17 Settings, SC-18 Local prompt

- **Settings:** a reader on the work-view axis.
  - The Track row has no Track; it shows `render · settings` and the authority segments `␣at routing` and `␣ap policy` on the field under the cursor.
  - Fields: rows 26 px, label 104 px `ui.small` `fg.muted`, value `ui`. The cursor field has the band and bar.
- **Local prompt:** a reader with no notes. A chrome header block (key-value grid `104px 1fr`) sits above the content; the content starts at the column.

## SC-19 Proposal page

| Region | x | y | w | Contents |
|---|---|---|---|---|
| Track row | 0 | 36 | 1512 | One tick per Slice (3 × 10, gap 2, olive; your move coral; not integrated outlined), then `N Slices · N integrated`; segment: solid coral `◆ ␣n Merge main · on the forge ↗` when eligible, else neutral `◆ ␣n Answer Q1` |
| Left margin | 172 | 98 | 200 | Outline: What could stop you, Source and checks, Readiness, Advisory, Slices; then `Merging` |
| Document | 436 | from 98 | 600, the Slices table wider | Content `h1`, subtitle; `What could stop you` (head right: counts by kind); source and checks (key-value grid `104px 1fr`); `Readiness` (four rows); advisory block; `Slices` table |

**Stop items:**
- Padding 6 0 7; mark at x 409.
- Line 1: id `mono` 600, kind word, Slice `mono` `fg.alt`. Line 2: text 13/19.

**Slices table:**
- Starts 56 px left of the column for the cursor gutter; rows 27 px with hairlines.
- Name `fg`, `K·xxxx` and digests `mono` orange, `Watchdog` mauve, `pass` olive.
- `2 fixed` and up in `fg`, below 2 in `fg.muted`.

**URL confirm (bottom float):**
- Head `↗ Open PR #44 on the forge`.
- Line `open https://github.com/vicrdguez/skills/pull/44 ? y/n` in `mono` 15/22, with the URL salmon and underlined.
- Footer `y opens it in your browser · n Esc doesn't`.

## 800 px window

| Screen | What changes |
|---|---|
| Frame | Tabs show number and icon except the active one; the statusline drops the breadcrumb, then the save label |
| Brief | One column at x 44, w 724, in `j` order |
| Work views | Text column centred at x 100 (§0.1); margins hide; notes inline; Track labels collapse to the current stage |
| Lists | The peek hides; `K` opens the bottom float |
| Floats | Full width as always; grids reflow to 2 columns (which-key, handover) |
