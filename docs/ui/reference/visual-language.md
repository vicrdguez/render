# Visual language

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)), which condenses it. File names in code spans are relative to `docs/ui/`. Measured, proposed and pending claims are separated in [`../evidence.md`](../evidence.md).

**Identity: Ember.** Warm graphite, ivory text and coral, which marks where your keyboard is and, as a solid shape, what needs you. Ember's other accents name things, so the eye can tell parts of the screen and kinds of text apart by colour, not only by brightness, without the screen turning into a rainbow. The interface is keyboard-native and dense, with sharp lines and a calm surface: modern, but neither macOS-default nor generic SaaS.

This is the render spec. Pixel layouts per screen are in `layout.md`. Text grids in `text-mocks.md` are structural wireframes only.

**Direction (user):**
- 10-27: *"modern UI, with some icons… not like a typical apple UI or AI slop… we don't need to inherit the limitations of text-only, terminal UI"*; and *"take the ember theme as the signature theme"*.
- 10-29, after the style check (Q26): *"Iosevka for monospace and Iosevka Etoile for long prose… the darker background on the main reading area and the lighter one for sidebars… choose between the 3 variants by config… we are not using much of ember's colors… inline code, message author, code blocks… coloured background to agent actions like pi does… more color to help tell different things apart, without the UI becoming a rainbow show."*

- After the tldraw wireframe review: *"tool calls do not need an icon, the background color is enough"*; the Decide pane "looked great with the top border coral and the icon coral, but the background can still be grey"; *"we can easily tell apart items in the content such as references to reports, contracts, etc."*; *"code needs to be syntax highlighted… render markdown as any other markdown reader"*. The layouts were approved (§4.8, §5.4, §5.5, §5.9, §5.10).
- 11-02 (Q23): *"we should use coral and other ember colors more widely without undermining understanding and visual queues to catch my attention... right now is basically brighter text vs dimmer text"*. This replaced the old colour budget (§5.3–§5.6).

Keyboard behaviour is in `reference/grammar.md`.

**Evidence** ([`../evidence.md`](../evidence.md) §1). **Measured** on the HTML prototype at four widths, in all three variants:
- reading checks 0 failures (WRAP 0/4,713, MEASURE 0/9,876, FIT 0/153,732, TRUNC 0/4,878);
- the coral test (§5.6) on the colour-pass renders in Ember: 0 survivors outside needs-you elements, 0 on the calm queue;
- contrast, computed for the current tokens: worst 4.50 for text and 3.44 for marks;
- tool tints equal to the computed ΔE values, on pixels;
- SPOOF 55/55; CVD silhouettes distinct.

## 1. Character and references

| Reference | Taken | Left |
|---|---|---|
| **Ember** (MIT, © 2026 Hossam Saraya) | Palette (`palette.json`), three variants, "nearly monochrome, one hero", warm graphite, ivory text, Ember's own `blend` | Coral on keywords and links: agent content never draws coral (§5.4). Render keeps Ember's coral cursor, focus, active tab and mode badge |
| **pi's TUI** (`badlogic/pi-mono`, theme `dark.json`) | Tool executions as blocks with an outcome background (neutral pending, green success, red error), title in text colour, output muted; user messages on a tinted band | pi's saturated blue/green/violet values; its thinking-level colour scale |
| **Neovim + mini.nvim + fzf-lua** (the user's config) | Modes and mode badge, bottom-docked borderless pickers, 300 ms which-key, `[+]`-style marks | Single-size monospace everything |
| **Doom Emacs** | which-key panel, leader tree, `SPC m`; variable-pitch prose beside monospace code (the Iosevka Etoile pairing is a Doom habit) | Fringe bitmaps, box-drawing |
| **Zed** | Proportional chrome around monospace content, 1 px separators, small radii, docked panels | Blue accent, tab-bar weight |
| **iA Writer** | A fixed measure, generous line height, quiet chrome around text | Its typeface (replaced by Iosevka Etoile at the user's request) |
| **Magit / Sublime Merge** | Sectioned review, hunk navigation, dense readable diffs | Staging metaphors |
| **Glass cockpits** | Abnormal is boxed, and alerts name the action | "Normal is silent": here colour tells parts apart on a calm screen too, and only solid coral asks for you. Saturated symbology |
| **Carbon icons** | A flat, square-ish icon set (16 / 12 / 20 px) | Carbon's component styling, and IBM Plex: the user wants Iosevka Etoile for chrome too |

**Refused:** SF-style pills, sheets and vibrancy; translucency and blur; gradient blobs; oversized cards; everything-in-a-rounded-box; emoji in chrome; Lucide-in-cards; big buttons; spinners; radii above 4 px; colour on body text; a different hue for each project (every project is the same sage).

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
| Bufferline | 30 | `surface.bar` + bottom `border.subtle` | view tabs (orange number, 16 px icon, `ui` label; the active tab has a 2 px coral underline); right: attention counts as count tags (§5.4), then the **host segment** |
| Handover strip | 48 (workflow views only) | `surface.bar` + bottom `border.subtle` | five equal columns, label `ui.label`, value `ui`; values follow `spec.md` §2.1, and NEXT prints its key per `reference/grammar.md` §18 |
| Panes | rest | **reading area `surface.read`, side areas `surface.side`** (§5.1) | content |
| Statusline | 24 | `surface.bar` + top `border.subtle` | mode badge, breadcrumb, SAVE; right: ledger seq, the read-basis token on workflow views, position |
| Echo / minibuffer | 26 | `surface.side` | messages; command line in `mono` |

Floats dock above the statusline at full width (which-key, pickers at 30 % height, peek, readback) and never cover the bufferline or statusline. **When a readback opens, the focused pane scrolls so the pinned target sits fully above it** (FC-T19; `reference/grammar.md` §13).

**Host segment** (S§5.3.1 L503). It sits at the bufferline's right end, after the attention counts, and reads `connection-signal` + host name (sage) + protection:
- **Calm:** `homeserver · protected to seq 18340 (2 m)`, in `fg.muted` while `hostMode` is `active` and the last verified off-host backup is within the host's exposed-work target (300 s).
- **Unprotected work:** acknowledged commits after the backup show calmly as `+3 unprotected` until they are older than the target. Then the segment turns stale: `unprotected since seq 18340 · 7 m`. An idle workflow does not count as exposed just because its last save is old.
- **Not calm:** the segment takes the stale mark (`time`, steel) and names what is wrong in `fg`. Per `hostMode`:
  - `not accepting changes` (admission-disabled);
  - `catching up after a restore` (recovery-reconciling);
  - `blocked on the host` (blocked).

  Otherwise `unprotected since seq 18340 · 7 m` or `backup unavailable`.
- **Pairing again:** after a restore, `restored · pair this device again` replaces the segment until the host's local admin pairs it again (backed-up credentials are refused; `reference/grammar.md` §14).
- **`K` on the segment** shows the target (`target ≤ 5 min`), the protection (`protected to seq N, verified <time>`), `restore not yet verified` or `verified <time>`, and the host's reason. The target is shown as a target, apart from achieved protection.
- **Copy:** user-facing restore text uses plain words. Internal terms (epoch, deduplication, cutoff, `recovery-reconciling`) appear only in `K` details.
- **Narrow windows:** the segment shrinks to icon + mode word, but never drops while it is not calm (FC-M31).

**Host time** appears where freshness is claimed: `seq N · as of T` in the statusline when the view isn't live (offline, reconnecting, catching up), the readback's STATE line, stale and offline notices, and `K` on the seq. A live view is current by definition, so neither bar prints a time. Ages in rows are computed from host time, never the local clock.

**Strip values.** Each value has 240 px with an icon or mark, 262 px without, at 1512, and drops whole parts down its ladder; a part or an ID is never cut (`spec.md` §2.1, the budgets and ladders; FC-Q25). Only host free text truncates, at its end, with `K`. **Who decided** is a word plus a role icon: `user` for a human decision, `bot` in `fg.alt` for a machine one, never the human band or coral (FC-M09). The ID and the icon never drop.

**Statusline and bufferline under width pressure:**
- **Statusline:** cursor position → SAVE label (its `edit` icon stays) → the breadcrumb truncates from the left, so its tail survives (`…› coordinator`). The mode badge and seq never drop.
- **Bufferline:** view tabs shrink to icon + number before the attention counts and the host segment ever drop.
- **Queue:** under a 1180 px pane the card sits below the list, so rows keep their width and widths degrade monotonically.
- The echo area never repeats a segment the statusline is showing (FC-Q21).

### 2.3 Panes and density

- **Main and side panes.** Each view has one **main pane**, the thing being read or worked through: the queue list, transcript, document, diff, evidence body, explorer list or decision text. It sits on `surface.read`. Every other pane sits on `surface.side`: the card, outline, notes, chat info, explorer sidebar, explorer preview and agents detail.
- Separators are 1 px `border.strong`. In a view with more than one pane, the focused pane has a 2 px coral top rule, and its separators and title use `rule.focus`.
- Pane padding: `space.5` horizontal, `space.4` top. List rows are 26 px; dense tables 24 px; group headers have `space.6` above.
- The cursor row is the pane's cursor surface (§5.1) with a 2 px left bar in coral (`state.attn`).
- Density (measured): 34 list rows visible at 1512 × 982. The target is ≥ 28.

## 3. Type

### 3.1 Families (bundled; checked at startup, `reference/stack.md` §4)

**Two families (Q28).** Chrome and prose both use Iosevka Etoile; Iosevka (mono) is for code, IDs, keys and fixed numeric columns. Nothing needs a second proportional face, so there is no IBM Plex Sans and no `ui.font.ui`.

| Role | Family and release | Licence | Notes |
|---|---|---|---|
| **Chrome and prose:** labels, rows, tabs, headers, statusline, readback field names; chat, documents, card question, decision text, notes | **Iosevka Etoile**, v34.9.1, `PkgTTC-IosevkaEtoile-34.9.1` | SIL OFL 1.1 | A quasi-proportional slab serif on Iosevka's skeleton, so inline code sits in prose without a jump |
| **Mono:** code, diffs, IDs, digests, keys, key chips, the command line, **fixed numeric columns** (counts, waiting, downstream, sizes, seq, times) | **Iosevka** (default spacing), v34.9.1 (2026-10-24), `PkgTTC-Iosevka-34.9.1` | SIL OFL 1.1, no Reserved Font Name | Advance **0.5 em, measured**: 100 columns = 700.0 px at 14 px. Contextual alternates are on in the default build (measured) and are switched off by the renderer. `— → … ⏎ ▸ ↺` take two cells (Q37: default spacing kept, not Term) |

**Measured on the bundled WOFF2 with CoreText (10-29):**
- **x-height:** Etoile 0.520 em, against 0.516 for Plex Sans, so at the same size Etoile reads as large and the chrome sizes follow.
- **Width:** Etoile is wide. Sample chrome strings at 13 px (queue paths, reasons, tree names, statusline) are 1.16–1.28× the Plex Sans width, 1.20× on average. Uppercase captions at 11 px are 0.95–1.08×, about the same.
- **Weights:** Etoile and Iosevka keep one advance width across weights ('m' 14.4 px at 16 px in both regular and bold), so bold never reflows a line (FC-P08).
- **Figures:** Etoile's digits are tabular (all 7.80 px at 13 px). Fixed numeric columns still use Iosevka for column alignment with IDs and times.

**What the wider chrome changes:**
- At 1512 px the widest sample row text, `reduce-test-runtime/simplify-adapter-launch-tests` (361 px), still fits the queue's 372 px item column.
- Narrower windows truncate and drop columns sooner, by the rules in §4.4.
- The SC-16 scope tree gives names their own line width (FC-Q18).
- The statusline drops segments by priority (§2.2).

**Hierarchy without a second family.** Chrome is told from content by lane, surface, size and case, not by face:
- chrome sizes are 11–15 px, against prose at 15 px. The 15 px chrome size is only `ui.title`, which differs from prose by weight and lane;
- **content in a side pane is two steps above chrome**: `prose.small` is 15/24, against chrome's 13 px;
- every content block in a side pane (the card's QUESTION, note bodies, steering excerpts, picker previews) sits on a content lane with a **2 px `border.strong` left bar**, which chrome never has;
- captions are 11 px uppercase with +0.06 em tracking, which content cannot produce;
- chrome never sits inside a content container (§10.2, FC-S18).


Trade-off: the separation of chrome from content rests on layout alone, and the SPOOF suite includes caption lookalikes to prove it holds.

### 3.2 Scale

| Token | Family | Size / line (px) | Weight | Notes |
|---|---|---|---|---|
| `ui.label` | Iosevka Etoile | 11 / 14 | 700 | UPPERCASE, +0.06 em tracking, in steel (`kind.you`); section captions, strip labels, readback field names. `NEEDS YOU` alone is coral while its count is above 0 (§5.4). May wrap to two lines at a word boundary (§4.4) |
| `ui.small` | Iosevka Etoile | 12 / 16 | 400 | metadata, header bands, picker meta |
| `ui` | Iosevka Etoile | 13 / 18 | 400 | default chrome text, list rows, statusline |
| `ui.strong` | Iosevka Etoile | 13 / 18 | 600 | pane titles, readback verb, author names, and **unseen rows** (§8). List row titles are regular `ui`, so bold means one thing in lists |
| `ui.title` | Iosevka Etoile | 15 / 20 | 600 | card and view titles |
| `mono.small` | Iosevka | 12 / 16 | 500 | key chips, hint labels, gutter IDs, statusline numbers, every fixed numeric column (counts, waiting, downstream, sizes, durations) |
| `mono` | Iosevka | 14 / 20 | 400 | code blocks, diffs, digests, BINDS values, command line, tool-call headers |
| `prose` | Iosevka Etoile | **15 / 24** | 400 | body; italic for block quotes. Etoile's x-height is 0.520 em, so 15 px gives a 7.8 px x-height |
| `prose.small` | Iosevka Etoile | **15 / 24** | 400 | content in side panes: the card question, note bodies, decision context, steering excerpts (clamped to 3 lines); always with the content bar. It **equals `prose`**: it must stay two steps above 13 px chrome, and with prose at 15 nothing fits between. The token stays so side-pane content can be retuned alone (Q36) |
| `prose.h1` | Iosevka Etoile | 24 / 32 | 700 | rose (`content.h1`); `space.7` above, `space.3` below, then a 1 px `border.strong` rule across the text column |
| `prose.h2` | Iosevka Etoile | 20 / 28 | 700 | orange (`content.h2`); `space.7` above, `space.2` below, then a 1 px `border.subtle` rule |
| `prose.h3` | Iosevka Etoile | 17 / 26 | 700 | `space.6` above |
| `prose.h4` | Iosevka Etoile | 15 / 24 | 700 | `space.6` above (body size: weight and space are its two cues) |
| `prose.h5` | Iosevka Etoile | 13 / 20 | 700 | UPPERCASE, +0.04 em, `space.5` above. 13 px uppercase with +0.04 em is not the chrome caption style (11–12 px, +0.06 em; §10.2) |
| `prose.h6` | Iosevka Etoile | 13 / 20 | 600 italic | `space.5` above |
| `prose.code` | Iosevka | 14 / 24 | 400 | inline code in prose: one px under prose size because Iosevka sets tighter than Etoile; inherits the prose line height |
| `prose.ref` | Iosevka | 14 / 24 | 500 | references in content, in `prose` and `prose.small` alike (§5.9) |
| `prose.table` | Iosevka Etoile | 14 / 22 | 400 (header 700) | table cells (§4.8) |

Numbers in fixed columns use `mono.small`; numbers inside a sentence stay in the sentence's face, whose digits are tabular anyway. Iosevka ligatures and contextual alternates are switched off by the renderer. Global zoom only.

## 4. Reading layout (normative)

These rules hold for every renderer. Measured passing at four widths (WRAP 0/4,713, MEASURE 0/9,876, FIT 0/153,732, TRUNC 0/4,878).

### 4.1 Measure

| Measure | Definition | Value at default size |
|---|---|---|
| `measure.prose` | **68 average characters of the prose face**: the renderer sets a bundled reference paragraph, takes its mean advance per character, multiplies by 68 and rounds down to 4 px. Recomputed at startup and on zoom; READ uses the computed value, never a constant | **548 px** for Etoile at 15 px: mean advance 0.539 em, 68 × 8.090 = 550.1, rounded down (measured with CoreText on the bundled face) |
| `measure.mono` | 100 columns of the mono face at `mono` size. **It applies to mono prose only** (`␣tp` sets prose in Iosevka); code frames follow the breakout rule (§4.3) | **700 px**, measured |

The measure is a maximum. In panes wider than the measure plus 160 px, the text column is centred.

### 4.2 Prose wraps at words (semantics, not mechanism)

**Semantics:**
- Break only at spaces; no justification and no hyphenation.
- Display IDs, key names and inline code up to 40 characters never break.
- A token longer than the measure may break after `/ - _ . ·`, with a 12 px `arrow--right` continuation mark in the gutter.
- Hanging indents for lists; quote bars repeat on every line.

**Mechanism belongs to the renderer**: Render's own line breaker on GPUI, shaping each row with `shape_line` and no wrap width (GPUI's wrapper breaks these rules and treats U+2060 as a break candidate, measured; FC-Q24). **The renderer never inserts characters into content text.** Yanked or copied text must equal the source bytes. Zero-width and joiner characters are exactly what §10.6 renders as visible escapes, so inserting them would collide with the spoofing rule.

### 4.3 Blocks that do not wrap

- Code, tables and diagrams keep their lines. They never wrap.
- **Breakout, grow right.** A block is as wide as its natural width, from the text column's width upward. **Its left edge stays on the text column's left edge**, so the reading edge never moves, and it grows rightwards to the pane's right content edge.
  - **It never extends left.** The gutter sits directly left of the text column, and it is a chrome lane with node IDs, note bars and suspicious marks (FC-S18). A block can't pass the gutter without covering it, so the only room is to the right.
  - Beyond the pane's right content edge, the block scrolls.
  - Prose before and after keeps the measure.
  - Code, tables and diagrams follow the same rule.
- **Overflow cue, visible at reading distance.** Each clipped edge shows three things:
  - a 32 px fade to the block's surface (`surface.code` for code, `surface.read` for tables and diagrams);
  - a 2 px `fg.muted` edge rule over the block's full visible height;
  - a 16 px `caret--right` (or `caret--left`) at the vertical middle of the visible block.

  `zl`/`zh` scroll the block and `0` resets; a left cue appears once scrolled. `K` opens the block full-window.
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
  - **Names come before decorations.** A row's name gets its width before marks, strips and metadata do. In the SC-16 scope tree the small-multiple strip has its own 14 px line under the proposal name. In the SC-04 outline there is no class mark, so the title gets the full width (FC-Q27).
  - **Structured rows.** Side-pane list rows render host fields in fixed slots, never a host display string cut by characters. The slots are **key · role · state · time**, e.g. OTHER CONVERSATIONS `b · candidate · running · 3m`.
    - The **key** is the field that tells siblings apart: the candidate letter, or the assignment `as42·g1`. It comes from the host (RQ-30, RQ-09) and never drops or truncates.
    - Fields drop whole, from the right.
    - A row whose key and role don't fit takes a second 18 px line.
    - There is no middle truncation.
- **Column captions size their column; they never truncate.** The queue's `waiting` column is 60 px and `downstream` 84 px.
  - **Narrow windows:** a caption may wrap to a second line at a word boundary, and every caption in that header row then bottom-aligns. It never breaks inside a word and never takes a third line.
  - If a single word is wider than its column, the column widens. If captions still don't fit, whole columns drop by priority.
- **Copy (FC-Q21).** Counts in chrome are pluralised by count ("1 line", "2 lines", "1 slice"). Host-written text is shown as sent.
- **No bare dash in a field** (FC-R08). The strip, the card and BINDS render an empty field as words, built from the host's structured null and wait class:
  - OWNER `no owner · waits for a slot` / `no owner · done`;
  - EVIDENCE `none yet`;
  - BLOCKER `none`, or the wait class (`slot 4/4 busy`);
  - NEXT `nothing for you yet`;
  - BINDS `intake none`, or a digest alone when there is no revision.

  In a human trial an OWNER of `—` took 14.7 s to read, while the worded NEXT took 2.6–3.3 s. A dash stays only in numeric columns ("no downstream"), where it is a value, not a field.
- **Key lines** (key bars, footers, hint lines, chip lines; one row each) drop whole parts from the end until they fit inside the pane's content box. The first part never drops, a chip is never cut or touching a border, and nothing wraps (`reference/grammar.md` §18).

### 4.5 Composers and floats

Composers are at most `measure.prose + 32 px` wide, wrap inside their frame with `space.4` padding, and grow to 8 lines, then scroll.

### 4.6 Hierarchy

Headings use size, weight, rules and space (§3.2): every level has at least two cues, and consecutive levels differ in size or weight (§4.8). Node IDs sit in the gutter on heading lines (`mono.small`, orange `kind.literal`). Colour is not a rank cue: h1 and h2 carry hue (§5.3), and rank still comes from size, weight and rule.

### 4.7 Checks

Run on real line breaks and element boxes at 1512, 1200, 1000 and 800 px:

| Check | Fails when |
|---|---|
| WRAP | rejoined lines do not reproduce the source words, or a word that fits the measure is split |
| MEASURE | a prose line is wider than the computed `measure.prose` |
| FIT | any text or icon box overlaps a separator, border or neighbour; a code block, table or diagram is narrower than its natural width while the pane has spare content width; **its box overlaps the gutter**; **its left edge leaves the text column while it fits to the right**; or a clipped edge lacks any of fade, edge rule and 16 px caret |
| TRUNC | a shortened field has no ellipsis, or `K` does not give the full value; two visible labels in one list are equal; a tree name is truncated while its strip shows glyphs; or a structured row cuts a field mid-characters or lacks its key |
| CAPTION | a column caption is truncated |
| HIER | headings do not follow §3.2 |
| CHROME | an icon, tint class or chrome style appears inside a content container (§10) |
| SVGFIT | an inline diagram's text box lies outside its frame, its effective size is under 12 px, or two text boxes overlap (§11); or a node label's box lies outside its node's box (FC-Q22) |
| COPY | a chrome count of 1 is followed by a plural noun from the chrome vocabulary ("1 lines"), or the echo area shows text equal to a visible statusline segment (FC-Q21); a chrome revision label does not match its kind's display form from `reference/grammar.md` §4.2 (FC-M34); a role word in chrome ("the coordinator is idle") differs from the conversation's host role; two surfaces show different numbers for one state (NEEDS YOU, ON THE HOST, running, slots); a field is a bare dash; or a bare `n/m` stands without the word `slots` |
| ALIGN | a message body's first text line starts anywhere but the text column's left edge, for any role (human, agent, host). The human band may extend into the gutter; its text may not |
| MD | on the Markdown coverage fixture, a construct does not render its §4.8 shape: heading levels not strictly ordered by size or weight, a missing h1/h2 rule, list markers not stepping 24 px per level, a task box outside the marker column, a table cell clipped or split mid-word, a quote line without its bar, an alert with a hue or icon, frontmatter not collapsed, a footnote marker that `gd` does not reach, or an unlabelled or unknown fence that is highlighted |
| REF | a host reference span renders without the reference style, anything else renders with it (plain lookalikes, ID-labelled links, IDs in inline code, code blocks or tool output), a dangling span renders in `kind.link`, a span whose bytes differ from its label is styled, or `gd` on a dangling reference moves the cursor (§5.9) |

### 4.8 Markdown blocks

The user: *"render markdown as any other markdown reader, one that makes content easy to read and tell apart."* Documents, messages, notes and decision text all render through these rules. They sit inside the text column (§4.1) unless stated.

**Dialect:**
- CommonMark plus the GFM extensions: tables, task lists, strikethrough, autolinks and footnotes.
- GFM alerts (`> [!NOTE]` and the other four kinds).
- YAML frontmatter at the start of a file.
- Fenced `mermaid` blocks, which are diagrams (§11).
- **Shown as literal text:** raw HTML, math, wiki links and emoji shortcodes. HTML stays escaped (§10.6).

**Why these, measured in `~/skl-ledger`** (counted, 851 Markdown files, 10-29):
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
| Headings | §3.2 scale: h1 24/32 + `border.strong` rule; h2 20/28 + `border.subtle` rule; h3 17/26; h4 15/24 700; h5 13/20 700 uppercase; h6 13/20 600 italic. **h1 is rose (`content.h1`), h2 is orange (`content.h2`), and h3 and below are `fg`**, after the user's Ember setup (§5.3). Size, weight and rule carry rank. The node ID sits in the gutter |
| Bulleted list | markers `•` / `◦` / `▪` by level (cycling after 3), `fg.muted`, in a 20 px marker column; each level indents **24 px**; hanging indent; tight lists 4 px between items, loose lists 12 px (CommonMark looseness). Beyond level 4 the indent stops growing, so text never narrows below the measure minus 96 px |
| Numbered list | numerals right-aligned in a 28 px column, tabular, `fg.alt`, as written in the source (CommonMark has no a/i styles) |
| Task list | a 14 px box in the marker column, at text size in the content lane. Unchecked: 1.5 px outline in `fg.muted`. Checked: filled `fg.alt` with a knocked-out tick. Item text stays `fg`, with no strikethrough and no colour. Ledger task items are acceptance criteria to read, not chores done. Boxes are display only; editing one is an emission edit (`␣me`). Never olive and never in the gutter (FC-S17) |
| Table | header `prose.table` 700 `fg` with a 1 px `border.strong` rule under it; body `prose.table` 14/22; a 1 px `border.subtle` rule under each row; no vertical rules and no zebra fill. Cell padding 6 px × 12 px; numeric cells tabular; GFM alignment honoured. **Width:** tables are not prose, so they break out of the measure up to the pane's content width (§4.3). Each column is at most `min(measure, 480 px)`, and cells wrap at words by §4.2. If the columns' minimum widths (their longest unbreakable token) do not fit the pane, the table scrolls horizontally with the fade and `caret--right` cue (§4.3), never clipping a cell mid-word. Header cells never truncate (§4.4). Inline code and references inside cells keep their inline styles |
| Blockquote | a 3 px `border.strong` bar on every line, 16 px left padding, Etoile italic `fg.alt`; nested quotes add a bar 12 px further in |
| Alert (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) | the blockquote shape with a 3 px `fg.muted` bar and a caption line: the kind word in Etoile 13/18 700 uppercase `fg.alt`. **No icon, no hue, no tint.** GitHub colours these blue, green, purple, yellow and red; a red CAUTION box would read as a failed tool call or host state (FC-S17) |
| Horizontal rule | 1 px `border.strong` across the text column, `space.6` above and below |
| Frontmatter | collapsed to one client-drawn line in `ui.small` `fg.muted`: `frontmatter · 6 fields`, then the chip `za` `expands`. Its band spans **the text column exactly**, never past the measure (FC-Q20). `za` expands it to a `yaml` code block, which then follows the code-block breakout. Keys like `state: approved` are content, never host state (FC-S11) |
| Sticky heading | while a section is scrolled, its heading stays pinned under the pane top. **The band's background spans the pane's full content width**, from the pane's left content edge (or the gutter's left edge, whichever is further left) to the right content edge, so breakout blocks and gutter IDs scrolling beneath are covered. The heading text aligns with the text column, and the 1 px `border.subtle` rule runs from the text column's left edge to the band's right edge. On a review, the band repeats the node's class word at the rule's right end (SC-04). It yields when the next heading is within its height + 48 px. The node ID stays in the gutter |
| Code block | `surface.code` frame, `radius.1`, a 2 px gold left rule (`kind.code`), padding 12 × 16 (20 px on top when labelled, so the label never sits on a long first line). The frame **grows right up to the pane's content edge** (§4.3), then scrolls with the fade and caret cue. The language label sits top-right in `ui.small` gold (chrome, from the info string). Code is `mono` 14/20, syntax-highlighted per §5.10, and never wraps (§4.3). `yi` yanks the source bytes. No line numbers unless `:numbers` |
| Inline code | `prose.code` gold (`kind.code`) on a `surface.code` chip (padding 0 × 3, `radius.1`); never breaks up to 40 characters (§4.2) |
| Reference | host-resolved spans only: §5.9 |
| Link `[text](url)`, autolink | prose face, salmon text (`kind.link`) with a 1 px dotted underline in the same colour; `kind.link_active` on hover or under the document cursor (§5.9). With the cursor on a link, the echo area shows the full URL. `gx` opens it externally after a confirm that shows the whole URL (FC-S05). A link never takes the reference style, whatever its text (FC-S15) |
| Emphasis | *italic* = Etoile italic, neutral; **bold** = 700 in steel (`content.strong`); ~~strikethrough~~ = `fg.muted` with a 1 px line; bold italic combines both. Bold inside a heading takes the heading's colour. A reference, link or inline code inside bold keeps its own colour |
| Image | **not loaded** in v1 (§10.6, FC-S07). A 32 px placeholder line in a 1 px dashed `border.strong` frame: `prose.small` `fg.muted` "image · <alt text> · <host of the URL>"; `K` shows the full URL |
| Footnote | the marker is a superscript numeral in Iosevka 11 px `fg.alt`; `gd` jumps to the note and `C-o` returns. Notes are collected at the end under a 1 px `border.subtle` rule in `prose.small`, each with `↩` back to its marker. Footnotes are resolved by the Markdown parser within the same document, so they do not take the reference style |
| Mermaid fence | a diagram (§11) |

**Streaming.** The trailing block re-parses as it grows (`reference/stack.md` §3). An unclosed fence renders as a code block so far. An unclosed table renders as rows so far. Nothing re-styles outside the trailing block.

## 5. Colour (Ember)

Every token is in `ember-tokens.json`. Blends use Ember's `util.blend`, which rounds half up. **▲** marks the smallest L* change needed to reach AA, computed.

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
| `rule.focus` | `#908a7e` | `#908a7e` | `#787060` | `base7` / `base6`; the focused pane's separators and title (non-text ≥ 3:1) |
| `fg` / `fg.alt` | `#d8d0c0` / `#b0a898` | same | `#282418` / `#585040` | Ember fg / fg_alt |
| `fg.muted` | `#999489` ▲ | `#a19c92` ▲ | `#5e5646` ▲ | `base7`, nudged to ≥ 4.5:1 on every surface including tints |

**Floats** sit on `surface.side` with a 1 px `border.strong` and a shadow. Over the reading area they read as side material lifted on top, the same idea as Ember's own float convention.

**Variant by config (decision):**
- The key is `ui.theme` in the client's config file `~/.config/render/client.toml`. Values: `"ember"` (default), `"ember-soft"`, `"ember-light"`, or `"auto"` (macOS appearance chooses `ember` or `ember-light`).
- `␣ht` opens the variant picker and switches **live**: tokens swap within one frame, and type and layout do not change, so pins, cursor and scroll position are untouched. `:set theme=<variant>` switches for the session only; the picker writes the config.
- **Rendered Mermaid on a switch:** cached SVGs keep Pele's CSS variables (`reference/stack.md` §5). On a switch, visible diagrams are re-substituted with the new tokens and re-rasterised (≤ 38 ms each, measured upper bound for resvg). Off-screen diagrams do the same lazily when they scroll into view. No host request is made.

### 5.2 State (marks only)

| Token | Dark / Soft | Light | Ember name | Meaning | Mark |
|---|---|---|---|---|---|
| `state.attn` | `#e08060` | `#af482e` ▲ | coral (hero) | needs your decision now; open readback (§5.4 also gives it the keyboard's thin marks) | filled diamond |
| `state.blocked` | `#b07878` | `#905050` | rose | failed, refused, quarantined, conflict, revoked | **`stop-sign--filled`** (a filled octagon; FC-M37) |
| `state.stale` | `#7890a0` | `#3a6080` | steel | basis newer than this view has shown you | `time` |
| `state.unknown` | `#988090` | `#706070` | mauve | outcome or effect unknown | `help` |
| `state.local` | `#80a090` | `#386858` | sage | exists only on this device | `edit` |
| `state.ok` | `#8a9868` | `#4a6830` | olive | pass, accepted, succeeded (evidence, receipts, tool calls) | `checkmark` |

State colour sits on marks (icons, 2 px bars, chip borders), on **state tints** (§5.5) and on the bufferline's **count tags** (§5.4). Olive and rose also colour short typed outcome words, in their text tokens `text.ok` and `text.failed` (§5.3). State colour never colours running text. As icons all six are ≥ 3:1 on every surface (§5.7).

### 5.3 Colour roles: one hue, one family

Ember's accents name **families** of things. In chrome, a piece of text keeps its family's hue wherever the client draws it, so parts of the screen and kinds of text differ by colour, not only by brightness. The hue goes on a short field whose type the client knows from a host field (§5.6 rule 3). All values are in `ember-tokens.json`.

| Hue | Means | Token: Dark / Soft / Light | Goes on |
|---|---|---|---|
| **Coral** | what needs you; where your keyboard is | `state.attn`: `#e08060` / `#e08060` / `#af482e` ▲ | §5.4 |
| **Steel** | a label: it names what follows | `kind.you`: `#8097a6` ▲ / `#8a9fac` ▲ / `#375a78` ▲ | section captions, column captions, field labels, strip captions, chrome labels (`SAVE`, `PROMPT`) |
| **Orange** | literal machine text | `kind.literal`: `#c09058` / `#c2935c` ▲ / `#784e27` ▲ | chrome IDs, digests and revisions (`K·7d21`, `R41`, `#135`, `as46·g1`, `58b3c69`, `M2`), key chips, tab numbers. Syntax keywords take the same hue through `syntax.keyword` (§5.10) |
| **Gold** | code as a thing | `kind.code`: `#c8b468` / `#c8b468` / `#65561a` ▲ | inline code on its `surface.code` chip, the code frame's 2 px left rule and its language label. Inside the frame, syntax colours apply (§5.10) |
| **Salmon** | you can go there | `kind.link`: `#c09080` / `#c09181` ▲ / `#844949` ▲. `kind.link_active`: `#eb9a7f` / `#eb9a7f` / `#913c28` | references and links, in content only (§5.9). The user's own link colours, not Ember's |
| **Sage** | where it lives | `kind.worker`: `#80a090` / `#84a393` ▲ / `#335f51` ▲ | project, host name, the breadcrumb's first segment |
| **Olive** | it passed | `text.ok`: `#8b996a` ▲ / `#94a175` ▲ / `#445f2c` ▲ | short typed outcome words: `pass`, `accepted`, `eligible`. Marks use `state.ok` |
| **Rose** | it failed | `text.failed`: `#b98787` ▲ / `#bf9191` ▲ / `#814747` ▲ | short typed outcome words: `failed`, `refused`, `conflict`. Marks use `state.blocked` |

Tool-call outcome words are the exception to the olive and rose rows: they keep the §5.5 weights in `fg` and `fg.alt`, because the tint already carries the outcome.

**Roles.** Telling agent roles apart at a glance matters, so a role name takes its hue wherever the client draws it from a host field: author bands, queue rows, the strip, side panes and Slice rows.

| Role | Hue | Notes |
|---|---|---|
| **You** | steel, `kind.you` | the name in the header band, `you` in a host field (`by you`, OWNER), the `user` icon, and an 8 % steel **band** behind the human message body |
| **Independent reviewers** (challenger, Audit, Watchdog) | mauve, `kind.reviewer`: `#a38e9b` ▲ / `#aa96a2` ▲ / `#615361` ▲ | every reviewer shares the hue, and the word separates `Audit` from `Watchdog`. Independence is a core Render invariant (I13) |
| **Workers** (implementer, candidate, experiment roles) | sage, `kind.worker` | |
| **Coordinator** | none | `fg` with its `bot` icon in `fg.alt`. The default voice stays neutral, so the exceptions carry hue (Q29) |

**In content,** three block types carry hue, after the user's Ember setup. The hue comes from the block type, never from anything the author chooses:

| Element | Colour | Token |
|---|---|---|
| `h1` | rose | `content.h1`: the `text.failed` values |
| `h2` | orange | `content.h2`: the `kind.literal` values |
| `h3`–`h6` | neutral | `fg` |
| `strong` | steel | `content.strong`: the `kind.you` values |
| `em` | neutral italic | `fg` |

Size, weight and rule carry heading rank. Steel stays on small chrome labels and on bold, not on headings, because it is dimmer than prose in the dark variants.

**Stays neutral, and why:**
- **Body prose:** it is the long text you read, and colour there would drown every rule above.
- **Host sentences** (BLOCKER text, findings, situation details, EFFECT, NOT): colour needs a type, and parsing a sentence for one would assert what the host didn't say. An ID inside host text stays neutral there (FC-M63).
- **Row titles, workflow paths and field values** (`fg`, reasons `fg.alt`): they are the answer, and labels only work if the answer leads.
- **Timestamps, seq numbers and the host segment's protection text** (`fg.muted`): read only on purpose.
- **Counts in captions and columns** (`fg.alt`): they read with the caption beside them and belong to no family. `NEEDS YOU`'s count is the exception (§5.4).
- **Running, waiting, rework and superseded marks:** neither outcomes nor actions, and their shapes tell them apart. Done and ready are outcomes, so they take `state.ok`.
- **Surfaces and borders:** grey, so that a solid colour area always means a state. Tints are the bounded exception (§5.5).

**SC-19 Slice rows** are the quietest list, because a package repeats them dozens of times:
- the Slice name is `fg`;
- the role name takes its hue, `K·40cc` and digests are orange, and the verdict `pass` is olive;
- everything else on the row is `fg.muted`, including `0 fixed` and `1 fixed`;
- `2 fixed` and higher is `fg`, so rework stands out down the column.

**Why these mappings:**
- Steel is cool against warm text, so a label reads as structure without pulling the eye.
- Orange was already Ember's warm keyword colour, and literal text reads as something a machine would accept.
- Gold marks code as an object. It no longer shares a hue with `h2` or with chrome IDs.
- Gold no longer means navigable. Salmon does (Q29, Q33), and only in content: every chrome row opens, so a navigable hue there would say nothing.

### 5.4 Coral: what needs you, and where your keyboard is

Coral does two jobs, told apart by shape and by what moves it.

**The flag: what needs you.** Only for a decision that is yours now, from a host wait, in chrome lanes.

| Where | Form |
|---|---|
| Bufferline count | **count tag**: a solid block 34 × 16 px at one digit (wider with more), radius 2, with the diamond and number knocked out in `surface.read`. On every screen while the count is above 0 |
| Queue rows, explorer rows, strip and card NEXT, REVISIONS | the **filled coral diamond** alone, at its mark size (§7), with no background |
| Queue caption | `NEEDS YOU` and its count in coral text, only while the count is above 0. It sits only on `surface.read`: coral text fails AA on the bar, and in Light on `surface.side` (§5.7) |
| Readback | **verb tag**: a solid block with the diamond and verb knocked out, `◆ DECIDE`. The panel stays grey (below) |
| Statusline mode badge while a readback is open | solid coral with `READBACK` knocked out |

- **The count tag is the only coral block on a screen outside an open readback.** Coral is not the only solid colour: rose (`state.blocked`) and mauve (`state.unknown`) counts use the same tag, with `stop-sign--filled` and `help` knocked out. So being solid doesn't say "needs you". Coral, the diamond and first place among the counts do, and the diamond survives in grey where hue doesn't.
- **Content can draw none of this.** Content has no backgrounds, the syntax map has no coral, Mermaid styles are stripped (`stack.md` §5, FC-S09), and emoji such as 🔶 stay at text size in the content lane (FC-S21). The §5.6 test checks it on pixels.
- **Calm:** nothing reads as needs-you. No coral tag, diamond or caption. The keyboard's thin marks remain.

**Thin coral: where your keyboard is.** Six elements, at most one of each per window, at most 2 px. They move only on your keys, and no host event can add one:

| Element | Form |
|---|---|
| Caret | coral, in every editor, including composers and note drafts |
| Cursor-row bar | 2 px, on the pane's cursor surface |
| Focused pane or float | 2 px top rule (only with more than one pane; a readback's is always there) |
| Active tab | 2 px underline, in the bufferline and the explorer's tabs |
| Mode badge | 1 px coral border; the word stays `fg`, because coral fails AA as text on the Light bar. Insert keeps its sage border. While a readback is open, the badge is the solid form above |
| Current search match | 1 px outline, judged against the surface outside it; other matches stay on `surface.selection` |

- **The caret rule:** the caret is the keyboard, so it is allowed inside text you are typing, including a note composer in the reading area. What is excluded from thin coral is **agent content**, the bytes an agent wrote.
- **The stated exception:** the `NEEDS YOU` caption is coral text that doesn't follow the keyboard. It belongs to the flag, and it appears only while something needs you.

**Not coral:**
- **Operator remedies** (a quarantine) take the filled failed mark in ON THE HOST, not the diamond, and the NEXT cell reads `on the host: …` without a diamond. Their remedy is not a decision in this client.
- **Legends, which-key, help, filter chips, action lists and the explorer's state filter** draw the outline diamond in `fg.alt`.
- **A delegated decision** uses the word and the `bot` icon in `fg.alt`, in its row, strip and card.
- **Advisory lines** (SC-18, SC-19's ADVISORY CHECKS) and **SC-06's CHECK flags** carry no flag.
- **Decision pane (SC-09):** the decision text sits on `surface.read`. The NEXT diamond stays in the strip. The option under the cursor has the cursor bar, and the recommended option an outlined `recommended` chip in `fg.alt`, not a diamond.

When this spec says a row or line "draws no coral" or "has no coral mark", it means the flag. The keyboard's thin marks still pass over it.

**Readback** (*"the background can still be grey"*, the user): the panel is the neutral raised `surface.readback`, a grey one step above the reading area. Its coral is the 2 px top rule and the verb tag. Field names are steel, values `fg` or `fg.alt`, and IDs orange. There is no coral fill or tint on the panel.
- The readback opens only from the user's own authority key, never from a host event (FC-T07). An authority command exists only for something that needs the user, so a calm screen never carries a readback, and closing it removes its tag and its badge.

**Stock Ember** paints keywords, cursor, links, modeline and search in coral. Render keeps the cursor, focus, active tab, modeline badge and current search match, and moves keywords to orange and links to salmon, so agent content never draws coral.

### 5.5 Tints: coloured backgrounds (bounded)

Tints sit only on whole blocks, never on inline spans. The human band and the diff tints are Ember blends over `surface.read` (8 % and 15 %).

**Tool-call tints.** The user: tool tints should be *"subtle but noticeable"* (FC-M30). At this darkness chroma reads weaker than ΔE2000 suggests, so a tint takes **the hue and chroma of a 36 % accent blend, held at one lightness**: the `surface.bar` step (`base2`) in the dark variants and `bg_alt` in Light. They differ from each other by hue, not brightness, and text contrast stays where it was.

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

Text on every tint stays ≥ 4.5:1 (`fg.muted` worst 4.75). Running is also told from a code block by shape: a code block has the gold left rule and a language label, a running tool block has neither. The **VISUAL TINT** check measures these pairs on screenshot pixels, not on tokens: block background samples in all three variants, failing below a target or above the cap.

These follow pi's tool-execution backgrounds (neutral pending, green success, red error), translated into Ember's olive and rose.

**Tool calls have no icon.** The user: *"tool calls do not need an icon, the background color is enough"*. The gutter beside a tool block is empty, and the block has no role icon.

**Border:** every tool block has a 1 px `border.strong` edge. `tint.tool.run` equals `border.subtle` in the dark variants, so a subtle border would vanish on running blocks.

**Header layout.** Tool name (`mono` `fg`), then arguments (`mono` `fg.alt`, truncated before the outcome column), then the **outcome column**:
- **A fixed column.** It is 216 px wide, at the block's right edge minus `space.4`. The **outcome word** starts at the column's left edge, then ` · detail · duration` follows in `mono.small`.
- **Why the word starts the column:** right-aligning word + duration moves the word with the duration's length. Starting the column with the word gives every word one x, so the words scan as a column.
- **Narrow blocks** (under 480 px): the column shrinks to the word plus the duration, and the detail drops first.
- **Weights:** failed and unknown words are bold `fg`; ok, running and cancelled words are regular `fg.alt`.

**Web calls** (S§6.6 L767–786). The outcome detail is `<provider> · <primary> <primary outcome> · <duration>`, e.g. `ok · Tavily · Exa failed · 2.4 s`, with the primary's outcome in bold `fg`:
- `<primary outcome>` is `failed` for a classified failure, or `timed out` for a per-attempt timeout, which the spec calls uncertain and possibly charged (FC-M56). The primary's failure shows even when the fallback succeeds (FC-M52).
- **Drop order:** the duration, then the fallback provider's name. The outcome word and the primary's phrase never drop, at any block width. Below a 480 px block the arguments drop first and the tool name then truncates.
- `K` and `za` give the class: `failed: allowance`, or `timeout · outcome uncertain · may have been charged`.
- **`za` rows:** `provider · observation · outcome · completeness · digest · time`, e.g. `Tavily  o2  ok  partial  9f2c·4e1a  09:31:00`. Outcomes are `ok`, `partial`, `failed: <class>`, `timed out`, `cancelled`, `interrupted`, `not attempted`. A missing digest reads `none`. A refetch of identical bytes shows as a new observation over the same digest.
- An expired result handle reads `full result expired · the committed output above stays · a new fetch is a new observation` (FC-M53).

**Colour-vision trade-off.**
- With no icon, ok vs failed is ΔE2000 3.8 / 3.7 / 3.1 under deuteranopia, computed, and 3.5 / 3.9 / 3.0 on pixels (the two differ by simulation pipeline). No threshold depends on them, because the word carries the outcome.
- The word, its fixed position and the bold weight for failed and unknown carry the outcome (FC-M29). Failures are found by reading a word, not by spotting a shape.
- `]t` still steps through tool calls.

### 5.6 Colour budget (the rule that stops the rainbow)

1. **Solid coral only for a decision that is yours now,** in chrome lanes: the flag of §5.4. The count tag is the only coral block on a screen outside an open readback.
2. **Thin coral follows the keyboard:** the six elements of §5.4, at most 2 px. It never appears in agent content. The caret in text you are typing is the keyboard, so it is allowed. The `NEEDS YOU` caption is the one stated exception, and it belongs to the flag.
3. **One hue, one family, in chrome (§5.3).** A hue goes on a short field (≤ 40 characters) whose type the client knows from a host field, never found by parsing a sentence. **Stated exceptions in content, after the user's Ember setup:** `h1` rose, `h2` orange, `strong` steel.
4. **Neutral leads.** Titles, values, prose and host text stay neutral, and accent text stays the minority of a pane's text. In a list, one field has one hue down its column. The share is a reported number with no limit: the colour-pass render measured 4.8 % on a transcript and up to 49.5 % on a calm list with short titles, and the user accepted that.
5. **Olive and rose label nothing in chrome.** They appear only on outcomes: marks, typed words, tints, diffs and syntax. An olive `CHECKS` caption would read as "passed". **Rose in content `h1` is the stated exception:** a failed mark always has its icon and its word, so it doesn't rely on hue, and a heading has neither (FC-S22).
6. **Tints are bounded, block-level only, and paired with a word** (and an icon, except tool calls). The human and diff tints are 8 % and 15 % blends. Tool tints follow the §5.5 targets, with a quiet cap of ΔE2000 ≤ 14 from `surface.read`. Text on any tint is ≥ 4.5:1 (§5.7).
7. **Syntax colour appears only inside code frames,** as text colour and weight, with no coral and no background (§5.10).

**VISUAL FLAG** (replaces the old coral count). Mask the pixels within ΔE2000 5 of `state.attn`, then erode by 5 × 5. Text stems and 2 px rules vanish, and whatever survives must lie inside `[data-attn]`: the count tag, a diamond, the verb tag or the readback badge. The test masks coral only, so the rose and mauve tags don't trip it. `kind.link_active` is ΔE 6.9 / 6.9 / 7.1 from coral at its core, though a few of its edge pixels can fall inside the mask (measured 9 and 7, in Ember and Light); none survive erosion. A calm screen has no survivors, no flag element and no coral caption. No mask pixel survives erosion in an agent-content container, and coral elsewhere lies only in the six elements of §5.4 or the caption. Every needs-you row, NEXT and count has its flag.

**VISUAL BUDGET.** Fails on accent-coloured body text, on an inline background other than `surface.code`, on a coordinator name or icon in a hue, on an accent colour outside its family's elements (§5.3), and on olive or rose outside outcomes and content `h1`. It reports the accent share of each pane's text, with no limit.

### 5.7 Computed contrast

Neutral text, worst case over read, side, bar, both cursor surfaces, code, readback, every tint and both diff tints:

| Token | Ember | Soft | Light |
|---|---|---|---|
| `fg` | 8.99 | 8.13 | 9.72 |
| `fg.alt` | 5.84 | 5.28 | 5.00 |
| `fg.muted` ▲ | 4.56 | 4.56 | 4.55 |

Coloured chrome text, worst case over the six chrome surfaces (read, side, bar, both cursors, readback). Each hue has one text token, raised by the smallest lightness change that reaches 4.5:1 on all six:

| Token | Ember | Soft | Light |
|---|---|---|---|
| `kind.you`, `content.strong` (steel) | 4.52 ▲ | 4.53 ▲ | 4.55 ▲ |
| `kind.reviewer` (mauve) | 4.52 ▲ | 4.51 ▲ | 4.52 ▲ |
| `kind.worker` (sage) | 4.82 | 4.53 ▲ | 4.55 ▲ |
| `kind.literal`, `content.h2` (orange) | 4.83 | 4.52 ▲ | 4.52 ▲ |
| `kind.code` (gold) | 6.68 | 6.04 | 4.55 ▲ |
| `text.ok` (olive) | 4.50 ▲ | 4.52 ▲ | 4.52 ▲ |
| `text.failed`, `content.h1` (rose) | 4.51 ▲ | 4.55 ▲ | 4.51 ▲ |

**Link colours** sit only in content, so their worst case is over read, side, both cursor surfaces, the human band and both diff tints:

| Token | Ember | Soft | Light | Worst surface |
|---|---|---|---|---|
| `kind.link` | 4.95 | 4.51 ▲ | 4.55 ▲ | `surface.cursor.side` |
| `kind.link_active` | 6.20 | 5.61 | 4.79 | `surface.cursor.side` |

- The user gave `#c09080` and `#eb9a7f` for dark, and `#905050` and `#913c28` for Light. Soft uses the dark pair.
- **Soft `kind.link`** is raised one step to `#c09181` (ΔE 0.4), because `#c09080` is 4.48 on `surface.cursor.side`.
- **Light `kind.link`** is raised to `#844949` (ΔE 3.2), because `#905050` passes only on `surface.read`: read 5.00, human band 4.48, side and `surface.cursor.read` 4.40, `surface.cursor.side` 4.00. References appear on all of those.
- **They may not sit** on `surface.bar` (Light 4.35) or under `surface.selection` (3.95 / 3.62 / 3.10). Nothing in chrome uses them.

**Under `surface.selection`, coloured text falls to `fg`** (7.18 / 6.53 / 6.92). Most hues are only 3.2–3.9:1 there, so the rule covers all of them.

**Coral as text and fill:**
- the `NEEDS YOU` caption on `surface.read`: 6.51 / 6.09 / 4.55. On `surface.side`: 6.09 / 5.56 / **4.01 in Light, under AA**, so the caption sits only on `surface.read`, the one place it appears. On the bar it fails too (Light 3.48);
- knocked-out text on the tags (`surface.read` on the tag), coral 6.51 / 6.09 / 4.55, rose 5.09 / 4.76 / 5.00, mauve 5.11 / 4.77 / 4.79.

**Syntax on `surface.code`** (≥ 4.5:1):
- Dark: rose `#b37d7d` ▲ and mauve `#9b8493` ▲; the rest unchanged (steel 4.71 is the lowest).
- Soft: steel `#7d94a3` ▲, rose `#b78484` ▲ and mauve `#a08a98` ▲.
- Light: orange `#83552b` ▲, gold `#6f5f1d` ▲, rose `#8d4e4e` ▲ and mauve `#6b5b6b` ▲.
- These are the `syntax` block's own values, nudged against the code surfaces only. Worst on `surface.code` and `surface.cursor.read`: 4.58 / 4.56 / 4.56 (§5.10).

**Non-text** (marks, bars, underlines; ≥ 3:1 required), worst case over the chrome surfaces and code:
- state marks: rose 3.81 / rose 3.44 / coral 3.48;
- `fg.muted` marks 4.56 / 4.56 / 4.55;
- thin coral: 4.87 / 4.41 / 3.48; on `surface.code`, where the cursor bar is the only cue, 5.56 / 5.14 / 4.01;
- the tags against `surface.bar`: coral 5.48 / 5.01 / 3.48, rose 4.29 / 3.91 / 3.82, mauve 4.30 / 3.93 / 3.67;
- the code frame's gold rule on read 8.93 / 8.35 / 5.95;
- reference and link underlines: the text colour, so the values above.

**Tint visibility:** the tool tints are specified by ΔE2000 targets in §5.5, not by luminance ratio. They keep one lightness, so their luminance ratio against `surface.read` is only 1.18–1.25:1, and the human band's 1.10–1.12:1. The outcome word (and, outside tool calls, the icon) carries the meaning.

**Dangling references:** `fg.muted` 4.56 / 4.56 / 4.76.

### 5.8 Colour-vision deficiency (shape first)

Computed under simulation (CIEDE2000, Machado 2009; protanopia, deuteranopia, tritanopia; Ember / Soft / Light where they differ):
- coral vs olive is ΔE 2.1 (protanopia);
- stale vs unknown 4.3;
- rose vs `fg.muted` 2.9 (deuteranopia);
- tool ok vs fail tint: 20.5 normal, 6.5 protanopia, **3.8 deuteranopia**, 16.2 tritanopia (dark; Light 3.1 deuteranopia), which is too close to rely on;
- coral tag vs rose tag: 14.0, 14.2, 10.6 (dark); 12.5, 12.0, 8.3 (Light). Coral tag vs mauve tag: ≥ 19.3 everywhere;
- link vs prose `fg`: ≥ 14.4 in every simulation and variant;
- link vs inline-code gold: ≥ 10.2 in every simulation and variant;
- link vs `h1` rose: 7.2 normal in dark, down to **2.5 tritanopia** (Soft 1.5). **In Light they are nearly the same colour: 0.8 normal**, and ≤ 1.0 in every simulation;
- inline-code gold vs chrome orange: 13.9 normal, 7.3 deuteranopia in dark and **1.8 in Light**;
- `h1` vs `h2`: ≥ 3.1 everywhere, and they also differ by size.

So:
- every state mark has a distinct silhouette;
- **failed** uses a filled **octagon** (`stop-sign--filled`). At 16 px the octagon reads close to a filled disc. What separates it from unknown is **filled against outline-with-`?`**, which survives every colour-vision simulation: measured silhouette distance 0.736 (FC-M37);
- **the needs-you diamond and the count tags** carry their icon, so coral vs olive at ΔE 2.1 depends on nothing. The tags stand in one order (`◆`, failed, `?`) in one place;
- every state tint carries its outcome word, and its icon except tool calls. A tool call's outcome is the word at a fixed position, bold for failed and unknown (FC-M29);
- **each text family also has a form:** labels are tracked caps, IDs and key chips are mono, projects are a fixed column, and role names are fixed words. Their closest pairs (Light orange/olive 2.5, steel/mauve 2.9–3.3, steel/sage 3.1) decide nothing;
- references, inline code and links differ by **shape**, not hue: a reference is Iosevka with a solid underline and no chip; inline code is Iosevka on a chip with no underline; a link is the prose face with a dotted underline (FC-Q14). This is also what separates a reference or link from a rose `h1`, along with size and rule;
- muted marks (running, waiting, rework, superseded) are told apart by shape alone: triangle, hourglass, arrows and minus. The VISUAL check covers muted marks too.

Measured silhouette distance is ≥ 0.2 Jaccard for every low-ΔE pair.

### 5.9 References in content

The user: *"what we want is that we can easily tell apart items in the content such as references to reports, contracts, etc. So they don't blend with actual content."*

**What counts.** A reference is a whole token in content that **exactly matches a label in the scope's reference index** (RQ-42), the list of objects `gd` can open that the host publishes per workflow. The host decides what `F16` means (FC-S04), because only indexed labels match; the client matches them while it parses. Kinds include:
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

Display forms follow `reference/grammar.md` §4.2.

| State | Treatment | Why |
|---|---|---|
| **Resolved** | `prose.ref`: Iosevka 500 in salmon (`kind.link`: `#c09080` / `#c09181` ▲ / `#844949` ▲), with a **solid 1 px underline** in the same colour, 2 px below the baseline. No chip, no background. On hover or **under the document cursor**, text and underline take `kind.link_active` (`#eb9a7f` / `#eb9a7f` / `#913c28`), because this is a keyboard-first app | Mono marks it as an identifier, not a word. Salmon marks it as navigable, the same family as links. The solid underline is the shape cue that survives colour-vision deficiency and separates it from inline code, which has a chip and no underline. A chip on every reference would turn ledger prose ("B1–B5 A1–A6 · F12–F17") into a tag cloud, and would share inline code's shape |
| **Dangling** (in the index with state `dangling`: the target is missing, outside scope, superseded without a successor, or not yet published) | Iosevka 400 in `fg.muted` with a **dashed 1 px `fg.muted` underline**; never `kind.link` | It reads as "a reference that goes nowhere". `gd` stays put and the echo area gives the host's reason, e.g. "F99: no such finding in execute-symbolic-calls". `K` explains |
| **Not in the index** | plain prose | Text that merely looks like `F16` gets nothing (FC-S15) |

**Rules:**
- The reference style appears only inside content containers: message bodies, document bodies, decision text, notes and table cells. Chrome IDs keep their chrome style (§5.3).
- **Matching:**
  - exact and case-sensitive;
  - ASCII plus the two display-form characters `·` and `§` (`K·40cc`, `as31·g2`, `§8.4`). Any other non-ASCII character, including a homoglyph, never matches;
  - whole tokens by the §4.2 token rules (`F16` matches, `F160` doesn't);
  - against the index of the block's own workflow scope.
- **Never inside code:** code blocks, inline code and tool output show IDs as code. The parser does not match there.
- **Index changes** re-style every visible match by label. Only the state changes (resolved ↔ dangling), and both states are Iosevka, so nothing reflows (FC-W10).
- **Drafts** (prompt, composer, decision note) show references plain, because editors render plain text.
- A link (`[F16](https://…)`) keeps the link style whatever its text. Only the index makes something a reference.
- **Streaming and completed blocks render identically.** The index is present before a message streams, so nothing arrives per block and nothing reflows.
- **Cursor and keys:** with the reader cursor on a reference, the statusline shows its kind, title and state, e.g. "F16 · contracts audit finding · resolved". `gd` opens it, `K` peeks, and `C-o` returns. `gs` hints label references like any target.
- **Range forms** like `B1–B5` match each end separately, with the dash in prose.
- **What the style claims.** A reference says "this label is a real object in this scope, and `gd` opens it". It never says the sentence around it is true. A hostile "r4 is approved" styles `r4` like an honest mention, and `gd` opens the real r4, whose state is shown by chrome.

**Where the link colours sit:** in content only, on `surface.read`, `surface.side`, both cursor surfaces, the human band and the diff tints (§5.7). Under `surface.selection` they fall to `fg`. References and links share these two colours, the one "navigable" hue; their face and underline separate them.

**A note on closeness.** A rest-colour reference and a rose `h1` are close in dark (ΔE 7.2) and nearly the same colour in Light (ΔE 0.8; `state.blocked` is ΔE 3.2 from it). Mono, the underline and size keep them apart (§5.8). Recorded for the user under Q33.

### 5.10 Syntax highlighting

Code blocks are highlighted with Ember's own nvim mapping, by tree-sitter capture name. Render makes three changes, all to keep coral out of agent content (§5.4):
1. Ember's coral keywords become **orange** (bold) (Q23).
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

Worst contrast on `surface.code` and `surface.cursor.read` is 4.58 / 4.56 / 4.56. Everything is ≥ 4.5:1, computed (the `syntax` block of `ember-tokens.json`).

**Rules:**
- **Colour budget:** syntax colour is allowed only inside code frames, as text colour and weight (§5.6 rule 7). The gold inline-code chip is not itself highlighted.
- **Anti-spoofing:**
  - The map has **no coral** and **no background** token.
  - A `diff` fence colours its signs and line text olive or rose. It never fills line backgrounds, so it cannot look like the diff view's tints.
  - A `bash` block printing `✓ exit 0` stays a neutral code frame with a gold rule and a language label. A tool-call block is tinted, has no gold rule, and sits between messages, never inside one (FC-S16).
- **No guessing:** unlabelled fences and languages outside the v1 set (`reference/stack.md` §5a) render plain `fg`, with the label still shown.
- **Weights:** bold and italic change only weight and slant. Iosevka keeps one advance width across weights, so highlighting never reflows (to verify by the FONT check, FC-P08).
- Highlighting arrives after first paint; it changes colour only.

## 6. Surfaces, elevation, radius

| Level | Used by | Surface | Edge | Shadow (dark / light) |
|---|---|---|---|---|
| 0 | panes | `surface.read` (main) / `surface.side` (side) | 1 px `border.strong` | none |
| 1 | bars, chips, code blocks, tool calls | `surface.bar` / `surface.code` / tints | 1 px `border.subtle` (code: 2 px gold left rule) | none |
| 2 | which-key, pickers, peek, composer | `surface.side` | 1 px `border.strong` | `0 8px 24px rgba(0,0,0,.45)` / `0 6px 18px rgba(40,36,24,.16)` |
| 3 | readback | `surface.readback` (neutral grey; no coral fill or tint, §5.4) | 1 px `border.strong` + 2 px coral top | `0 12px 32px rgba(0,0,0,.55)` / `0 8px 24px rgba(40,36,24,.20)` |

**Radius**: 0 for panes and docked panels; 2 px for chips, hint labels, key caps, code blocks and tool calls; 4 px for the peek float and composer. No translucency or blur.

## 7. Icons

**IBM Carbon** (`@carbon/icons` 11.90.0, Apache-2.0). Monochrome SVG paths in token colours.
- **Sizes**: 16 px in rows, tabs, strip and gutter; 12 px in small multiples and continuation marks; 20 px for empty states.
- Icons supplement labels, never replace them.
- **Custom glyphs**: the Render diamond (filled / outline) and the ready dot.
- **Names beyond the table below**, all present in 11.90.0: `checkbox`, `checkbox--checked`, `filter`, `tree-view--alt`, `document`, `diagram`, `close`. `stop-sign--filled` is in the 32 px set and is drawn at 16 px.

| Meaning | Icon | Colour |
|---|---|---|
| needs you / authority | diamond (filled / outline) | coral only when needed now (§5.4); else `fg.alt` |
| failed, refused, quarantined | `stop-sign--filled` | `state.blocked` |
| conflict · revoked | `compare` · `locked` | `state.blocked` |
| unknown | `help` | `state.unknown` |
| stale / unread | `time` | `state.stale` |
| local draft · sending | `edit` · `send` | `state.local` · `fg.muted` |
| suspicious content | `warning--alt` | `fg.muted` |
| running · waiting · rework · ready · done · superseded | `play--filled--alt` · `hourglass` · `renew` · dot · `checkmark` · `subtract` | `fg.alt` / `fg.muted`; done and ready `state.ok` everywhere |
| views: queue · chat · review · diff · evidence · agents · decision · picker · explorer | `list--checked` · `chat` · `document--view` · `compare` · `certificate--check` · `bot` · `decision-tree` · `search` · `tree-view--alt` | `fg.alt` |
| roles: you · agent · host | `user` · `bot` · `bare-metal-server` | the role's hue (you steel, reviewers mauve, workers sage); the coordinator's icon and a delegated decision's `bot` `fg.alt`; host `fg.muted`. Tool calls have **no icon** (§5.5) |
| filter toggles (explorer) | `checkbox` / `checkbox--checked` | `fg.alt` / `fg` |
| connection · continuation · clipped edge | `connection-signal` (`--off`) · `arrow--right` · `caret--right` | `fg.muted` / `state.stale` |
| diagram (wider-than-view, parse error) · explorer empty state · proposals tab | `diagram` · `filter` · `document` | `fg.muted` |
| dispositions: acted on · considered · dismissed | `checkmark` · `information` · `close` | `fg.alt` |

Role icons in the role's hue are a cue paired with the name. They are not state marks, and they never stand alone.

## 8. State marks

| Mark | Icon | Label | Colour | TUI |
|---|---|---|---|---|
| needs your decision | ◆ filled | `needs you` | coral | `◆` |
| failed / quarantined | `stop-sign--filled` (octagon) | `failed` / `quarantined` | rose | `✗` |
| unknown | `help` | `unknown` | mauve | `?` |
| running | `play--filled--alt` | `running` | `fg.alt` | `▸` |
| waiting | `hourglass` | `waiting · <class>` | `fg.muted` | `#` |
| rework | `renew` | `rework` | `fg.muted` | `↺` |
| ready | dot | `ready` | olive `state.ok` | `·` |
| done | `checkmark` | `done` | olive `state.ok` | `✓` |
| superseded | `subtract` | `superseded` | `fg.muted` | `×` |
| conflict · refused · unknown outcome · unread · local · sending · suspicious (data marks) | `compare` · `stop-sign--filled` · `help` · `time` · `edit` · `send` · `warning--alt` | as labelled | as §5.2 | `[≠] [×] [?] [!] [+] […] ⟨!⟩` |

- Data-mark priority: conflict > refused > unknown outcome > unread > local > sending > suspicious.
- **One state, one number** (FC-M35). The attention index has two groups:
  - **NEEDS YOU:** decisions and acts only you take, with the diamond. This includes the main merge;
  - **ON THE HOST:** operator remedies, directly below it, with the failed octagon.

  Each count is the same wherever it appears:
  - bufferline count tags (§5.4): `◆` = NEEDS YOU, `✗` = ON THE HOST, `?` = unknown outcomes;
  - section headers: the same numbers.

  Each count is shown only when non-zero, and appears nowhere else.
- **Running vs slots** (FC-M36). They differ by protocol: a cancel-requested assignment keeps its slot through the 30 s grace, and an effect can hold one. Headers therefore print both, rows first and slots named: `RUNNING · 2 · slots 4/4`, `EXECUTING · 4 · slots 4/4`. A bare `4/4` was read as "4 running" in all five trial runs.
- Unseen rows: `ui.strong` (bold). Row titles are regular, so bold means "unseen" and nothing else in lists. Unseen tracking itself is deferred, so v1 rows are all regular.
- Approval provenance is text plus the `user` or `bot` icon (§2.2).

## 9. Motion

Two meaningful motions:
- a 600 ms state-change tint on a row (rows never move);
- 90 ms fades for floats and the readback, whose top rule is at full opacity from the first frame.

Tool-call blocks change tint instantly when their outcome arrives, with no animation, so the success or failure is never delayed. Reduced Motion (macOS, or `ui.motion = "off"`) sets every duration to 0.

## 10. Chrome versus content (anti-spoofing)

1. **Lanes.** Every pane has a 40 px gutter. Gutter, bufferline, strip, statusline, echo, which-key, readback, hint labels, message header bands and **tool-call blocks** are chrome. Content renders only inside content containers (message bodies, document bodies, code blocks, report table cells).
2. **Typography.** Content renders only in `prose.*`, `prose.code`, `prose.ref` and `mono` (code frames only). Chrome uses `ui.*` and `mono.small`. Content cannot select a face, size, tracking or colour.
   - Chrome and content share Iosevka Etoile, so **the face does not separate them**.
   - What separates them is the lane (§10.1), the surface, the size and the case. **The invariant** is that content never takes the chrome caption style: 11–12 px uppercase with +0.06 em tracking.
   - Content can be small or uppercase in its own ways: the h5 heading (13 px uppercase, +0.04 em), alert captions (13 px uppercase, no tracking), footnote markers (11 px Iosevka numerals), and references and code inside `prose.small`.
   - In side panes, content also carries the 2 px content bar, and `prose.small` is 15 px (§3.1).
   - A bold uppercase "NEEDS YOU · 4" written in a message is a 15 px prose line inside a message body, never a caption (FC-S18).
3. **Icons and tints are chrome.**
   - No content produces an icon, a tint or a block background. Markdown code blocks always render on neutral `surface.code` with the gold rule. They are never olive or rose, whatever their language label or text (`bash`, `✓ exit 0`).
   - **Tool-call blocks come only from host tool-call records** (RQ-09: name, outcome, exit code, timing, output reference). They are rendered between message bodies, never inside one, tinted by outcome and labelled with the outcome word. They have no icon (§5.5). Content cannot produce a tint, so a message cannot fake a tool success (FC-S14).
   - Emoji render as ordinary glyphs inside content and never reach a chrome lane. Markdown images are never loaded.
4. **Colour.**
   - Author colours and the human band come from host role metadata only. The text "coordinator:" in a message stays `fg` prose.
   - In content, accent text appears only as references matching the host's reference index (§5.9, RQ-42), links, inline code, syntax inside code frames (§5.10), `h1`, `h2` and `strong` (§5.3). All of these follow from the block type, never from a colour the author picked. Everything else accented is chrome. Content never draws coral, a background or a tag (§5.4).
   - **Hue is not provenance.** Bold content is steel, the same hue as the `you` name, and a content `h1` is rose, the same hue as a failed mark. The header band, the gutter's role icon, the human band and the failed mark's icon and word are what can't be forged (FC-S10, FC-S22).
5. **Provenance.** Every message header band shows the host-supplied role icon (in the gutter), name, model, assignment and time. **There is no per-message author rule** (the user: *"I prefer all the text clear and aligned"*).
   - Every message's text starts on the text column's left edge. The human message keeps its steel band, which only a host `human` role can produce.
   - Content can't draw in the gutter, and the header band and the band are chrome (FC-S10).
   - Markdown blockquote bars inside a message are content and stay.
6. **Inert rendering.**
   - No HTML, remote images or command links.
   - Bidi, zero-width and control characters render as visible escapes in `mono.small` on `surface.bar`.
   - Lookalike IDs are escaped, not linked, and flagged with `warning--alt` in the gutter.
7. **Size caps.** A content block is clipped at 2,000 lines; messages arrive capped (RQ-10).
8. **Client-drawn lines in a content lane** (the frontmatter summary, `… 37 more lines`, the diagram's `⏎ full view`, the class word on a heading row) are chrome. Content can't produce a chip or any of these.

## 11. Diagrams and the canvas boundary

**Default: diagrams render on open.** `␣tm` shows the source. The ambition makes Mermaid native in v1, and designs are reviewed as pictures.

**Fit rule:**
- **Where Pele runs:** in the client, in QuickJS, the measured path (`reference/stack.md` §5). The host serves Mermaid source bytes only, so the client owns its fonts, its measurer and its tokens.
- **Figure width** = from the text column's left edge to the pane's right content edge, as for code and tables (§4.3: grow right, never over the gutter). No fixed cap.
- Pele runs with `fontSize: 16` in **Iosevka Etoile**: node text 16 px, edge labels 14 px, sequence fragment labels 13 px (Pele's own ratios, 0.875 and 0.8125), keeping node text one step above 15 px prose. The measured widths were taken at 17. Pele is given a `measurer` built from Etoile's advance widths, because its built-in metrics under-measure a face this wide (FC-Q22). Natural width ≤ figure width: drawn at natural size.
- Wider: **scaled down to fit, provided every text stays ≥ 12 px**. The limit is per figure: scale ≥ 12 / its smallest text (0.86 with 14 px edge labels, 0.92 with 13 px fragment labels).
- **usvg ignores Pele's root `font:` shorthand** (measured on all 13 figures with usvg 0.49.0: text without an explicit size resolves to `Options::font_size`, 12 px by default). The pipeline therefore sets `font_size` to Pele's size (16) and `font_family = "Iosevka Etoile"` on usvg's `Options`, and loads the bundled faces into its font database (`reference/stack.md` §5).
- Still wider: the inline frame shows the **"wider than view" state** instead of a clipped picture:
  - a 20 px `diagram` icon;
  - the figure caption;
  - the natural width in px;
  - "labels would be N px here";
  - node and edge counts;
  - the chip `⏎ full view`.

  Labels are never clipped mid-word, and a subgraph title never collides with an edge label.

**Full view** is a float over the whole window. It pans with `h j k l`, zooms with `+ - =` from fit-to-window up to 200 %, and **`q`, `Esc` or `⏎` leaves it**, restoring the panes and cursor. It never shows labels below 12 px; panning covers the rest.

**Pending:** with the prototype's stand-in renderer, Figure 1's two-line `Note over C,I` overflowed its note box by 8–11 px. Pele's note sizing with the Etoile measurer decides it.

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

- **Focused pane**: `rule.focus` separators and title, and a 2 px coral top rule when the view has more than one pane.
- **Cursor row**: the pane's cursor surface plus a 2 px coral bar. The caret is coral (§5.4). A reference or link under the document cursor takes `kind.link_active` (§5.9).
  - In the reading area the cursor surface equals `surface.code`, so on a code line or an inline-code chip **the 2 px bar is the only cursor cue**. An inline-code chip on the cursor row loses its surface, but keeps its gold text and no underline, so it is still told from a reference.
  - Moving `surface.cursor.read` one step was computed and rejected: it weakens the dark cursor to ΔE 2.1 and forces five new Light ▲ nudges. VISUAL checks the bar on code rows.
- Selection uses `surface.selection`.
- **Hint labels** (chips in context `hint`):
  - chips in `mono.small`, `surface.read` text on an `fg` fill, `radius.1`;
  - placed at the **start of the row's text**, immediately after the state icon, so they never cover an icon; they may cover the first characters of the row (the project label), which stays readable on `K`;
  - overlaps shift right in reading order;
  - the target set is frozen at `gs`.
- **Key chips**: `mono.small` orange (`kind.literal`) on `surface.bar`, 1 px `border.strong`, `radius.1`. While a readback is open, chips outside it draw in `fg.muted`.
- **Picker previews** show content as content: `prose.small` or `mono` code on `surface.side` with the 2 px content bar, under one chrome line (`ui.small`: kind · path · revision). A preview never borrows chrome styles, and its references match the index of the previewed object's scope.

## 13. Screen layouts (summary; pixel specs in `layout.md`)

All chrome is in Etoile, and numeric columns are in Iosevka.

| Screen | Main pane (`surface.read`) | Side panes (`surface.side`) | Visual rules |
|---|---|---|---|
| SC-02 queue | list | card | Queue `waiting` 60 px, `downstream` 84 px; QUESTION at `prose.small`; operator row without diamond; the coordinator's recommendation only in the card (`coordinator recommends 1`), never in the strip's NEXT; authority keys not on rows; the card sits below the list under a 1180 px pane |
| SC-03 chat | transcript | info pane, prompt on `surface.bar` | Role hues, coordinator neutral; human band; **tool-call blocks with outcome tints, no icon**, a `border.strong` edge and a fixed outcome column; code-block chrome and syntax highlighting; code grows right; references from the index, identical in streaming blocks; steering excerpts in `prose.small`, clamped to 3 lines; structured rows in OTHER CONVERSATIONS |
| SC-04 review | document | outline, notes | Markdown blocks (§4.8); references; syntax highlighting; diagram fit rule; breakout grows right and never covers the gutter, with a visible overflow cue; frontmatter at the text-column width; sticky bands span the pane; the class word on the heading row, none in the outline |
| SC-05 diff, SC-06 dispositions, SC-07 evidence | diff / table / evidence body | — / — / findings column | Captions size their columns, and may wrap to two lines on narrow windows. SC-06's CHECK flags are words: no diamond. SC-07 leads with the PASS block; gate passes use the olive `checkmark`; a web passage is content on the content bar |
| SC-08 agents | the explorer's Agents tab (SC-16) | sidebar, preview | Rows first, slots named |
| SC-09 decision | decision text | context column | Options `{n, title, body}` with the title on its own line; references in the text; readback grey, with the coral rule and verb tag only (§5.4); it scrolls its target into view, renders every host basis field and says "not yet acknowledged"; chips outside it draw dimmed; "1 line" plural |
| SC-10 states | the open view | as it was | One offline notice, with no per-cell mark; the bufferline host segment on every screen; plain words for SC-10h |
| SC-12 which-key | — | float | **One** explanatory sentence, in the header |
| SC-14 Mermaid | document | — | Fit rule, "wider than view" state, render by default; Etoile labels with a measurer; no fixed width cap |
| SC-16 explorer | filtered list | multi-tab sidebar with state filter; preview card | Strip on its own line under each proposal name; no duplicate filter echo; Proposals rows exactly two lines |
| SC-17 settings | settings column | — | Reader rows; the field under the cursor is bold; no flag outside the readback |
| SC-18 local prompt | artifact text | — | The SC-04 reader with no notes pane; advisory, so no flag |
| SC-19 merge package | one reader column | — | Proposal-scope strip; Slice columns next to the name, quiet per §5.3; advisory rows carry no stale, failed or coral mark |

## 14. TUI fallbacks (one line each)

| GPUI element | Terminal fallback |
|---|---|
| Iosevka Etoile chrome and prose | the terminal's monospace (ideally Iosevka); prose measure 80 columns |
| Type scale | bold, markers and blank lines |
| Spacing | whole cells |
| Icons | the TUI column in §8 |
| Reading vs side surfaces | two background colours (`base0` / `bg`) |
| Tints (tool calls, human band, diff) | the same background colours via truecolor; on 256-colour terminals, neutral background plus the outcome word (bold for failed and unknown) |
| Count tags and the verb tag (§5.4) | coral background cells with the glyph and text in the surface colour; rose and mauve the same; reverse video on 256-colour terminals |
| Thin coral (§5.4) | the terminal cursor in coral where supported; the cursor bar `▎`, active tab and mode badge in coral foreground |
| References (§5.9) | salmon + underline (SGR 4), `kind.link_active` under the cursor; dangling: `fg.muted` + dashed underline (SGR 4:5) where supported, else dim + underline |
| Syntax (§5.10) | the same foreground colours and bold/italic; no backgrounds |
| Markdown blocks (§4.8) | headings bold, h1 rose and h2 orange, h1/h2 followed by a rule line; `strong` bold steel; list markers as in GPUI; tables with box-drawing rules; quote bar `▎` |
| Role and family hues (§5.3) | the same foreground colours (truecolor) or the nearest 256-colour |
| Elevation and shadows | box-drawing borders, no shadows |
| Radius | square corners |
| Motion | none; a state change sets the row bold until visited |
| Hint chips | reverse video |
| Mermaid | source, or kitty graphics where supported |
| Host segment | the same words; the stale mark as `[!]` |
| Explorer state toggles | `[x]` / `[ ]` |
