# Visual language

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)), which condenses it. In code spans, `grammar.md` and `stack.md` are in `reference/`, `layout.md` and `text-mocks.md` in `wireframes/`, and other file names are relative to `docs/ui/`. Claims are labelled measured, looked at or reasoned in [`../evidence.md`](../evidence.md).

**Identity: Ember, as a modern keyboard tool** (the Brief, adopted 2026-11-06). Warm graphite, ivory text and coral, which marks where your keyboard is and, as a solid shape, what needs you. Real type with a scale, icons, square shapes and straight hairlines; regions are told apart by surface steps, not rules. It keeps the cues power users rely on: tabs, a statusline with a mode badge, `:w`, the ex line rising from the bottom, the ledger seq, a gutter and a block caret. It drops the limits of a text grid (one type size, fields pinned to columns, box-drawn bands) and the clutter of every fact and key on every screen. Ember's other accents name things, so kinds of text differ by colour, not only by brightness, without the screen turning into a rainbow.

This is the render spec for the rune client. Pixel layouts per screen are in `layout.md`; the text grids in `text-mocks.md` are structural wireframes on one fixture. Keyboard behaviour is in `grammar.md`. The five rules the owner changed with the rune switch (`stack.md` §2) are folded in here: native wrap with pills (§4.2), solid underlines (§5.9), rune's pill metrics (§4.2), Render's own code block (§4.8) and rune-kit's scanners (§5.10).

**Direction (owner):**
- 10-27: *"modern UI, with some icons… not like a typical apple UI or AI slop… we don't need to inherit the limitations of text-only, terminal UI"*; and *"take the ember theme as the signature theme"*.
- 10-29, after the style check (Q26): *"Iosevka for monospace and Iosevka Etoile for long prose… the darker background on the main reading area and the lighter one for sidebars… choose between the 3 variants by config… we are not using much of ember's colors… inline code, message author, code blocks… coloured background to agent actions like pi does… more color to help tell different things apart, without the UI becoming a rainbow show."*
- After the tldraw wireframe review: *"tool calls do not need an icon, the background color is enough"*; the Decide pane "looked great with the top border coral and the icon coral, but the background can still be grey"; *"we can easily tell apart items in the content such as references to reports, contracts, etc."*; *"code needs to be syntax highlighted… render markdown as any other markdown reader"*. The Brief replaced those layouts; the colour and content rules they approved stand (§4.8, §5.4, §5.5, §5.9, §5.10).
- 11-02 (Q23): *"we should use coral and other ember colors more widely without undermining understanding and visual queues to catch my attention... right now is basically brighter text vs dimmer text"*. This replaced the old colour budget (§5.3–§5.6).
- 11-05 and 11-06, the Brief: more modern, clean, accessible and intuitive, still for power users, judged by Kepano's ten rules. On the drafts: the terminal isn't the enemy, so tabs, the statusline and the mode badge stay; few printed keys, with which-key for discovery; Ember dark is the default; count tags and rose page titles; a solid coral head on needs-you rows and a solid coral primary action; a full-width bottom float with a coral top rule; the echo on its own row; a square 2 px bar for selection; the list peek on by default from 1180 px; no icon in the chat composer ([`../open-questions.md`](../open-questions.md), answered).
- 11-06, rune: the five rules of `stack.md` §2.

**Evidence** ([`../evidence.md`](../evidence.md)):
- **Measured on the Brief prototype** (HTML in headless Chromium, 76 states in Ember dark, Light and at 800 and 1200 px, 2026-11-06 20:05): contrast 0 failures over 9,985 text elements and 2,386 marks; at most one solid coral mass besides the `◆` tag in every state, none in 46; prose 60–78 characters per full line at the 600 px measure, over 41 states; full margin notes other than the cursor's within 39 px of their anchors, 42 stubs over 33 states; 0 margin-note overlaps; 26 spoof states pass; 240 repeated counts agree.
- **Measured on rune** (E-RUNE-1, `stack.md` §7): 0 atomic splits over 2,286 wrapped lines with pills; copy equals the source bytes; 12/12 font roles resolve to the bundled faces; 0 ligature substitutions in code.
- **Carried from the earlier package** (`fd270d7`, where the token values are unchanged): the computed contrast and ΔE tables (§5.5, §5.7, §5.8); tool tints equal to the computed ΔE values on pixels; CVD silhouettes distinct.
- **Not yet measured on rune:** the Brief's screens. The SC-04 Markdown screen is a first implementation test (`stack.md` §8).

## 1. Character and references

| Reference | Taken | Left |
|---|---|---|
| **Ember** (MIT, © 2026 Hossam Saraya) | Palette (`palette.json`), three variants, "nearly monochrome, one hero", warm graphite, ivory text, Ember's own `blend` | Coral on keywords and links: agent content never draws coral (§5.4). Render keeps Ember's coral cursor, focus, active tab and mode badge |
| **pi's TUI** (`badlogic/pi-mono`, theme `dark.json`) | Tool executions as blocks with an outcome background (neutral pending, green success, red error), title in text colour, output muted; user messages on a tinted band | pi's saturated blue/green/violet values; its thinking-level colour scale |
| **Neovim + mini.nvim + fzf-lua** (the user's config) | Modes and the mode badge, the statusline, tabs, bottom-docked borderless pickers, 300 ms which-key, `[+]`-style marks | Single-size monospace everything |
| **Doom Emacs** | which-key panel, leader tree, `SPC m`; variable-pitch prose beside monospace code (the Iosevka Etoile pairing is a Doom habit) | Fringe bitmaps, box-drawing |
| **Zed** | Proportional chrome around monospace content, 1 px separators, docked panels | Blue accent, tab-bar weight, rounded controls |
| **Kepano's ten rules** (the owner's brief for the Brief) | Each screen answers one named question; size, weight and space before decoration; honest states (a disabled action says `off`); as little as possible | — |
| **The owner's Obsidian** | Pitch, hairline weight and selection, measured from its pixels | Its surfaces, which are Ember Soft's pair: Ember dark stays the default |
| **iA Writer** | A fixed measure, generous line height, quiet chrome around text | Its typeface (replaced by Iosevka Etoile at the user's request) |
| **Magit / Sublime Merge** | Sectioned review, hunk navigation, dense readable diffs | Staging metaphors |
| **Glass cockpits** | Abnormal facts light themselves at zero keys, and alerts name the action | "Normal is silent": here colour tells parts apart on a calm screen too, and only solid coral asks for you. Saturated symbology |
| **Carbon icons** | A flat, square-ish icon set (16 / 12 / 20 px) | Carbon's component styling, and IBM Plex: the user wants Iosevka Etoile for chrome too |

**Refused:** SF-style pill buttons, sheets and vibrancy; translucency and blur; gradient blobs; oversized cards; everything-in-a-rounded-box; emoji in chrome; Lucide-in-cards; big buttons; spinners; radii above 2 px in chrome (rune's in-text pills are a recorded deviation, §4.2); colour on body text; a different hue for each project (every project is the same sage).

## 2. Layout system

Layout is in logical pixels on a 4 px base; there is no global character grid. Monospace alignment remains only where it carries meaning: code, diffs, IDs, digests, key chips and numeric columns.

### 2.1 Spacing scale

| Token | px | Typical use |
|---|---|---|
| `space.1` | 2 | icon-to-tag gaps, chip vertical padding |
| `space.2` | 4 | icon-to-label gap, chip horizontal padding |
| `space.3` | 8 | row horizontal padding, gutter inner margin, reserved gap before separators |
| `space.4` | 12 | pane top padding, label-to-value gap, tool-block padding |
| `space.5` | 16 | pane horizontal padding, panel padding |
| `space.6` | 24 | group spacing, gap between messages, H2/H3 top margin |
| `space.7` | 32 | H1 top margin |

### 2.2 The frame

| Region | Box (x, y, w, h) | Surface | Contents |
|---|---|---|---|
| Tab bar | 0, 0, 1512, 36 | `surface.side`, no rule | Window controls; nav icons, each running one command (Slices `␣os`, Proposals `␣oP`, Agents `␣oa`, Find `␣.`); open views as numbered tabs: orange `mono.small` number, 14 px icon, `ui` label, drafts as a sage `edit` mark and count. The active tab fills with `surface.read` and has a 2 px coral top rule. Count tags at the right end (§5.4) |
| Track row (work views only) | 0, 36, 1512, 40 | `surface.read` | The workflow's Track, the abnormal-fact slot (one entry by the ladder in `spec.md` §2.3), action segments (§5.11) |
| Stage | work views 0, 76, 1512, 854; Brief and lists 0, 36, 1512, 894 | `surface.read` | One page |
| Peek (lists, on by default at 1180 px and wider) | 972, 36, 540, 894; content 500 px wide after its 40 px right padding | `surface.read` | The cursor row's handover |
| Bottom float | full width, its bottom edge on the statusline (y 930), up to 40 % of the window: 0, 678, 1512, 252 with the `:` line; 0, 717, 1512, 213 with a decision readback | `surface.readback`, 2 px coral top rule, upward shadow (§6) | Leader menu, palette, `:` line, pickers, handover, filter, readback, stale reply, outbox, URL confirm |
| Statusline | 0, 930, 1512, 26 | `surface.bar`, no rule | Mode badge, breadcrumb, save state, pending keys, basis token, host segment, seq |
| Echo row | 0, 956, 1512, 26 | `surface.side` | One transient message in `ui.small` `fg.alt`, ending in an ellipsis when long; reserved and empty when there is none |

Regions are told apart by surface steps, never by rules. The bottom float covers the stage only, never the tab bar, statusline or echo row. **When a readback opens, the page scrolls so the pinned target sits fully above it** (FC-T19; `grammar.md` §13). A notice band (38 px, `surface.side`) sits at the top of the stage when a state needs one, and pushes the stage down.

**Statusline segments** (`ui.small` 12/16; geometry in `layout.md` §0):
- **Mode badge:** square, 26 px tall, Iosevka 11/14 600 uppercase tracked +0.08 em in `fg` on `surface.cursor.side`, with a 2 px left edge in the mode's colour: coral `NORMAL`, sage `INSERT`, steel `VISUAL`/`V-LINE`, orange `COMMAND`/`HINT`. `READBACK` is a solid coral fill with the word knocked out in `surface.read`.
- **Breadcrumb:** `fg.alt` with `›` in `fg.muted`; its first segment sage when it is a project.
- **Save state:** sage `edit`, `2 not saved` in `fg.alt`, then the `:w` chip. The chip is live only in Normal and Visual while writes are on and no float is open; in Insert and COMMAND, and under any float, it draws `fg.muted` and is inert; under a readback it is hidden.
- **Pending keys:** `mono.small` orange, with the drawn leader mark for `␣`.
- **Basis token** on authority views: `basis r2 v3 pol3`; unacknowledged `basis r2 v5→v6 [!] pol3 ]d`, with `]d` a chip, omitted while a readback is open.
- **Host segment** and **seq**, below.

**Under width pressure:**
- **Statusline:** the breadcrumb drops first, truncating from the left so its tail survives (`…› coordinator`), then the save label (its `edit` icon and count stay while drafts exist), then a calm host segment. The mode badge, the seq and a host segment that isn't calm never drop.
- **Echo row:** never drops. A long message ends in an ellipsis and stays whole in `:messages`. It never repeats a segment the statusline shows (FC-Q21) and prints no key chips; a key worth printing belongs in a notice. Anything the user must act on is a notice, never only an echo (FC-L14).
- **Tab bar:** inactive tabs shrink to number and icon before a count tag drops.
- **Under 1180 px:** the Brief's columns stack, margin notes fold inline, and the list peek gives way to the `K` float.

**Host segment** (S§5.3.1 L503). It sits at the statusline's right end, before the seq, and reads the host name (sage) and its protection:
- **Calm:** `homeserver · protected to seq 18340 (2 m)`, in `fg.muted` while `hostMode` is `active` and the last verified off-host backup is within the host's exposed-work target (300 s).
- **Unprotected work:** acknowledged commits after the backup show calmly as `+2 unprotected` until they are older than the target. Then the segment is no longer calm: `unprotected since seq 18340 · 7 m`. An idle workflow does not count as exposed just because its last save is old.
- **Not calm:** the segment takes the stale mark (`time`, steel) and names what is wrong in `fg`. Per `hostMode`:
  - `not accepting changes` (admission-disabled);
  - `catching up after a restore` (recovery-reconciling);
  - `blocked on the host` (blocked).

  Otherwise `unprotected since seq 18340 · 7 m` or `backup unavailable`. Offline it reads `○ offline 2 m`; revoked, `revoked 14:20:05` with the rose stop-sign.
- **Pairing again:** after a restore, `restored · pair this device again` replaces the segment until the host's local admin pairs it again (backed-up credentials are refused; `grammar.md` §14).
- **`K` on the segment** shows the target (`target ≤ 5 min`), the protection (`protected to seq N, verified <time>`), `restore not yet verified` or `verified <time>`, and the host's reason. The target is shown as a target, apart from achieved protection.
- **Copy:** user-facing restore text uses plain words. Internal terms (epoch, deduplication, cutoff, `recovery-reconciling`) appear only in `K` details.
- **Narrow windows:** the segment shrinks to icon + mode word, but never drops while it is not calm (FC-M31).

**Host time** appears where freshness is claimed: `seq N · as of T` in the statusline when the view isn't live (offline, reconnecting, catching up), the readback's state line, stale and offline notices, and `K` on the seq. A live view is current by definition, so the statusline prints no time. Ages in rows, and the age after `lastActivity`, are the host time at receipt plus the local monotonic time elapsed since, never the local wall clock (FC-M12).

**Handover values** (`spec.md` §2.2). The five facts show in full in the handover float (`K`, `gk`), the list peek and the Track row's abnormal slot. A value drops whole parts, never characters of an ID; only host free text truncates, at its end, with `K`. **Who decided** is a word plus a role icon: `user` for a human decision, `bot` in `fg.alt` for a machine one, never the human band or coral (FC-M09). The ID and the icon never drop.

### 2.3 Stage, axis and density

- **One page per stage,** on `surface.read`. There are no side panes: margins, the Brief's right column and the list peek sit on the same surface, and the bottom float is the only raised surface.
- **Work-view axis** (review, decision, evidence, chat, Proposal page, settings, local prompt): left margin x 172–372, gutter x 396–436, text column x 436–1036 (600 px, §4.1), right margin x 1076–1396. Two work pages overlaid share the text column.
- **The Brief:** left column x 48–868 (Needs you, On the host, Waiting), right column x 924–1464 (Running, Done). Reading order equals `j` order.
- **Lists:** the list column x 48–928; the peek box x 972–1512 (540 px), its content x 972–1472 (500 px) after a 40 px right padding.
- **Between 1180 and 1512 px** the work-view axis keeps its 640 px gutter and text column while the paddings, then the right margin (to 240 px), then the left margin shrink; the Brief's columns keep a 60:40 split; the peek shrinks to 440 px. Under 1180 px margin notes fold inline and the text column is centred. Formulas and worked values at 1200 and 1000 px: `layout.md` §0.1.
- **Rows:** dense rows are 28 px, with 1 px `border.subtle` hairlines between them. Brief entries are square bands with hairlines. Group heads use `group` (13/18 600 steel), 14 px above.
- **Selection** (§12): a square band on `surface.cursor.read` with a 2 px coral bar on its left edge, full band height. On a row whose host wait class is `human`, the head is solid coral instead (§5.4).
- **Density** was not re-measured for the Brief. Looked at: the heavy-day Brief (`mockups/brief-heavy.png`) shows 14 waiting rows below the three needs-you entries and the host entry, with `16 more below`.

## 3. Type

### 3.1 Families (bundled; checked at startup, `stack.md` §4)

**Two families (Q28).** Chrome and prose both use Iosevka Etoile; Iosevka (mono) is for code, IDs, keys and fixed numeric columns. Nothing needs a second proportional face, so there is no IBM Plex Sans and no `ui.font.ui`.

| Role | Family and release | Licence | Notes |
|---|---|---|---|
| **Chrome and prose:** labels, rows, tabs, headers, statusline, readback field names; chat, documents, the Brief's ask, decision text, notes | **Iosevka Etoile**, v34.9.1, `PkgTTC-IosevkaEtoile-34.9.1` | SIL OFL 1.1 | A quasi-proportional slab serif on Iosevka's skeleton, so inline code sits in prose without a jump |
| **Mono:** code, diffs, IDs, digests, keys, key chips, the command line, the mode badge, **fixed numeric columns** (counts, waiting, blocks, sizes, seq, times) | **Iosevka** (default spacing), v34.9.1 (2026-10-24), `PkgTTC-Iosevka-34.9.1` | SIL OFL 1.1, no Reserved Font Name | Advance **0.5 em, measured**: 100 columns = 700.000 px at 14 px, also on rune. Contextual alternates are on in the default build (measured); rune turns them off on mono-slot runs, so code always uses the mono slot (`stack.md` §4). `— → … ⏎ ▸ ↺` take two cells (Q37: default spacing kept, not Term) |

**Measured on the bundled WOFF2 with CoreText (10-29):**
- **x-height:** Etoile 0.520 em, against 0.516 for Plex Sans, so at the same size Etoile reads as large and the chrome sizes follow.
- **Width:** Etoile is wide. Sample chrome strings at 13 px (row paths, reasons, tree names, statusline) are 1.16–1.28× the Plex Sans width, 1.20× on average. Uppercase captions at 11 px are 0.95–1.08×, about the same.
- **Weights:** Etoile and Iosevka keep one advance width across weights ('m' 14.4 px at 16 px in both regular and bold), so bold never reflows a line (FC-P08).
- **Figures:** Etoile's digits are tabular (all 7.80 px at 13 px). Fixed numeric columns still use Iosevka for column alignment with IDs and times.

**Hierarchy without a second family.** Chrome is told from content by lane, surface, size and case, not by face:
- chrome is 11–14 px (`badge` 11, `key` 11.5, `ui.small` 12, `ui` 13, `move` 14); prose is 14 px, headings 14–20 px and page titles 22 px;
- **content outside a document or transcript sits on the 2 px content bar** (`border.strong`), which chrome never has: the Brief's ask, margin notes, picker previews. It is `prose.small` 13/19, about the size of `ui`, so the bar and the lane separate it, not size;
- the mode badge and the readback verb tag are Iosevka 11 px uppercase tracked +0.08 em, which content cannot produce;
- chrome never sits inside a content container (§10.2, FC-S18).

Trade-off: the separation rests on lane and bar, not size. The Brief prototype's spoof check passes in 26 states (measured), including `brief-spoof`, where a Running row's `lastActivity` reads `approved by you · merged main` and stays on the content bar. It is a regression guard over the prototype's own fixtures, not evidence for FC-S23 or FC-S25; the client's SPOOF fixture is owed.

### 3.2 Scale

| Token | Family | Size / line (px) | Weight | Notes |
|---|---|---|---|---|
| `page.title` | Iosevka Etoile | 22 / 28 | 700 | Brief and list titles, rose; the count coral while above 0 (Brief) or `fg.alt` (lists). **No rule.** Never both the size and weight of `prose.h1` (FC-S23) |
| `prose.h1` | Iosevka Etoile | 20 / 28 | 700 | content `h1` and work-view titles, rose (`content.h1`); `space.6` above, `space.2` below, then a 1 px `border.strong` rule across the text column. **Always with its rule** |
| `prose.h2` | Iosevka Etoile | 17 / 24 | 600 | orange (`content.h2`); 26 px above, 8 px below; on a review the class word sits at the heading row's right end |
| `prose.h3` | Iosevka Etoile | 15 / 22 | 600 | `fg`; `space.6` above |
| `prose.h4` | Iosevka Etoile | 14 / 20 | 600 | `fg`; `space.6` above (body size: weight and space are its two cues) |
| `prose.h5` | Iosevka Etoile | 13 / 19 | 600 | uppercase +0.04 em, `fg.alt`, `space.5` above. Not the badge style, which is Iosevka 11 px +0.08 em |
| `prose.h6` | Iosevka Etoile | 13 / 19 | 600 italic | `fg.alt`, `space.5` above |
| `move` | Iosevka Etoile | 14 / 20 | 600 | Brief entry heads (`Answer Q1`); the qualifier after `·` is 400 `fg.alt` |
| `group` | Iosevka Etoile | 13 / 18 | 600 | group heads (`On the host`, `Waiting, not on you`), steel; count `fg.alt` |
| `prose` | Iosevka Etoile | 14 / 21 | 400 | body; italic for block quotes |
| `prose.small` | Iosevka Etoile | 13 / 19 | 400 | content on the 2 px content bar: the Brief's ask (at most 2 lines), margin notes, picker previews |
| `prose.table` | Iosevka Etoile | 13 / 19 | 400 (header 600 `fg.alt`) | table cells (§4.8) |
| `prose.code` | Iosevka | 13 / 21 | 400 | inline code: gold on a `surface.code` rune pill (§4.2); inherits the prose line height |
| `prose.ref` | Iosevka | 13 / 21 | 500 | references in content (§5.9) |
| `ui` | Iosevka Etoile | 13 / 18 | 400 | rows, tabs, Waiting titles |
| `ui.strong` | Iosevka Etoile | 13 / 18 | 600 | changed rows on the Brief since you left (§8), author names, margin headers. Row titles are otherwise regular, so bold means one thing in lists |
| `ui.small` | Iosevka Etoile | 12 / 16 | 400 | bylines (12/17), the Track, statusline, echo row, column captions (lowercase, `fg.muted`), field labels (steel) |
| `mono` | Iosevka | 13 / 20 | 400 | code blocks, diffs, BINDS values, the `:` line, tool-call headers |
| `mono.small` | Iosevka | 12 / 16 | 400 | times, digests in rows, gutter IDs, seq, `lastActivity`, every fixed numeric column |
| `key` | Iosevka | 11.5 / 16 | 500 | key chips, orange (`kind.literal`) on `surface.bar`, square, radius 2 |
| `badge` | Iosevka | 11 / 14 | 600 | mode badge and readback verb tag; uppercase, +0.08 em |

Numbers in fixed columns use `mono.small`; numbers inside a sentence stay in the sentence's face, whose digits are tabular anyway. Global zoom only. `h3`–`h6` were not drawn by the prototype; their values follow the two-cues rule (§4.6) and are reasoned.

## 4. Reading layout (normative)

These rules hold for every renderer. Measured: on the Brief prototype, prose ran 60–78 characters per full line at the 600 px measure over 40 states; on rune, wrapping with pills split 0 atomic tokens over 2,286 lines (`stack.md` §7). The earlier prototype's runs at four widths (WRAP, MEASURE, FIT, TRUNC, all 0 failures) used the old 548 px measure at 15 px and are history.

### 4.1 Measure

| Measure | Definition | Value at default size |
|---|---|---|
| `measure.prose` | **80 average characters of the prose face**: the renderer sets a bundled reference paragraph, takes its mean advance per character, multiplies by 80 and floors to 4 px. Recomputed at startup, on zoom and when a font falls back; checks use the computed value, never a constant | **600 px** for Etoile at 14 px: mean advance 0.539 em, 80 × 7.546 = 603.7, floored (reasoned from the measured advance). The prototype measured a mean advance of 7.6 px in Chromium, 79 characters by advance, and 60–78 characters per full line by word wrap |
| `measure.mono` | 100 columns of the mono face at `mono` size. **It applies to mono prose only** (`␣tp` sets prose in Iosevka); code blocks follow the grow-right rule (§4.3) | **650 px** at 13 px |

The measure is a maximum. In panes wider than the measure plus 160 px, the text column is centred; work views keep the shared axis (§2.3). `stack.md` §4 states the Brief's 600 px at 14 px; the re-measure through rune at 14 px is owed (Q49).

### 4.2 Wrapping: rune's native wrap with pills

**Semantics:**
- Prose, and chrome text that wraps, use rune's native wrap (Parley, UAX #14). No justification and no inserted hyphens; a break after a hyphen already in a word is fine.
- **IDs, key names, paths and inline code up to 40 characters never break.** Each is a rune pill (`El::pills`), which keeps its byte range whole and takes room in the line. **One rule:** inline code is a drawn pill; references, IDs, paths and key names in prose and chrome are transparent pills, and only when they contain an internal break opportunity (`-`, `/`, `.`), because a token without one stays whole anyway. This is the stated default; Q45 stays open until the SC-04 Markdown test verifies it. A pill covers the whole space-delimited word, because a pill's edges are break points and trailing punctuation would otherwise be orphaned (`stack.md` §3).
- A token longer than the measure wraps anywhere inside the measure (`.wrap_anywhere()`).
- Hanging indents for lists; quote bars repeat on every line.

**The renderer never inserts characters into content text.** Yanked or copied text equals the source bytes (measured on rune: 694/694 blocks). Zero-width and joiner characters are exactly what §10.6 renders as visible escapes, so inserting them would collide with the spoofing rule.

**Pills are a recorded deviation.** rune's pill metrics are fixed at the pin: about 7 px a side at 15 px (5.4 px of padding inside the chip plus a 1.8 px margin outside it, scaling with the size) and a radius of 5 pt, capped at half the chip's height. `PillStyle` sets only the chip colour, the text colour and an icon, so changing the metrics would mean patching rune. Render takes rune's metrics for in-text pills instead of the square 0 × 3 chip the earlier spec asked for. Render-drawn chips (key chips, count tags, hint labels) stay square with radius 2.

**Owed on rune** (`stack.md` §2, §7):
- **Transparent pills take the same room** as drawn ones, so `Contract K·40cc` showed a double-space gap on each side (looked at). The one rule above limits pills to tokens that need one; whether that removes the gap where it matters is Q45.
- **One known wrap miss:** a line can start with `-tail` after a code pill.

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
- Diagrams have their own fit rule (§11). On rune, the fade is a gradient element and the edge rule a 1 px or 2 px element, since rune has no per-side borders (`stack.md` §3).

### 4.4 Narrow fields, truncation and captions

- Fields declare a minimum, a maximum and a priority. Optional fields drop first; then fields truncate by kind:
  - labels: `…`;
  - paths: `…/leaf`;
  - IDs and digests: never partial;
  - numbers and times: never truncated, only dropped.
- `space.3` is reserved before every separator. `K` and the statusline show the full value.
- **Keep what tells rows apart (FC-Q18):**
  - **Names come before decorations.** A row's name gets its width before marks, strips and metadata do. In the filter float's scope tree the small multiples sit in their own column after the name. In the SC-04 outline there is no class mark, so the title gets the full width (FC-Q27).
  - **Structured rows.** Margin rows render host fields in fixed slots, never a host display string cut by characters. The slots are **key · role · state · time**, e.g. the chat roster's `b candidate running 3m`.
    - The **key** is the field that tells siblings apart: the candidate letter, or the assignment `as42·g1`. It comes from the host (RQ-30, RQ-09) and never drops or truncates.
    - Fields drop whole, from the right.
    - A row whose key and role don't fit takes a second 18 px line.
    - There is no middle truncation.
- **Column captions size their column; they never truncate.** The Slices list's `waiting` column is 80 px and `blocks` 56 px.
  - **Narrow windows:** a caption may wrap to a second line at a word boundary, and every caption in that header row then bottom-aligns. It never breaks inside a word and never takes a third line.
  - If a single word is wider than its column, the column widens. If captions still don't fit, whole columns drop by priority.
- **Copy (FC-Q21).** Counts in chrome are pluralised by count ("1 line", "2 lines", "1 slice"). Host-written text is shown as sent.
- **No bare dash in a field** (FC-R08). The handover float, the peek, the Track row's slot, Brief rows and BINDS render an empty field as words, built from the host's structured null and wait class:
  - owner `no owner · waits for a slot` / `no owner · done`;
  - evidence `none yet`;
  - blocker `none`, or the wait class (`slot 4/4 busy`);
  - next `nothing for you yet`;
  - BINDS `intake none`, or a digest alone when there is no revision.

  In a human trial on the earlier design an owner field of `—` took 14.7 s to read, while the worded next action took 2.6–3.3 s. A dash stays only in numeric columns ("no downstream"), where it is a value, not a field.
- **Key lines** (key bars, footers, hint lines, chip lines; one row each) drop whole parts from the end until they fit inside their box. The first part never drops, a chip is never cut or touching a border, and nothing wraps (`grammar.md` §18).

### 4.5 Composers and floats

- **Note composer:** in the right margin at its anchor's y, 320 px wide, up to 8 lines, then it scrolls; footer in Insert `Esc jk leave Insert · stays on this device until you save`.
- **Decision note:** in the text column under the options, with the header `your answer · local · editing` and the footer in Insert `Esc jk leave Insert · stays on this device until you answer`.
- **Chat composer:** at the page foot on the text axis, square, on `surface.side`, **with no icon**. Its header says whether the send prompts or steers; its footer in Insert reads `Esc jk leave Insert · ⌘⏎ sends · M-⏎ queue as follow-up`.
- **A footer prints only keys bound where it is printed** (KL17, strict in Insert): no post-`Esc` keys, no leader keys. After `Esc`, the statusline's `:w` chip and the Track row's segments carry the rest; in Insert those draw muted.
- Each wraps inside its frame with `space.4` padding and grows to its line limit, then scrolls.
- **The bottom float** is full width with 48 px content padding, grows to fit up to 40 % of the window, then scrolls. Its input line, when it has one, is its last line, and results grow upward.

### 4.6 Hierarchy

Headings use size, weight, rules and space (§3.2): every level has at least two cues, and consecutive levels differ in size or weight (§4.8). Node IDs sit in the gutter on heading lines (`mono.small`, orange `kind.literal`). Colour is not a rank cue: h1 and h2 carry hue (§5.3), and rank still comes from size, weight and rule. A page title (22/28, no rule) and a content `h1` (20/28 with its rule) never share both size and rule, so content can't draw a chrome title (FC-S23).

### 4.7 Checks

The implementation suite runs these on rune's own layout: AccessKit line runs give each line's byte range and box, and `--tree` gives every element's box (`stack.md` §3). They run at 1512, 1200, 1000 and 800 px, in all three variants. The last column is the latest run of each.

| Check | Fails when | Latest run |
|---|---|---|
| WRAP | rejoined lines do not reproduce the source bytes, or a pill (ID, key, path, inline code ≤ 40 characters) is split | rune, E-RUNE-1: 0 splits over 2,286 lines (`stack.md` §7) |
| MEASURE | a prose line is wider than the computed `measure.prose` | Brief prototype: 60–78 characters per full line, 40 states |
| FIT | any text or icon box overlaps a separator, border or neighbour; a code block, table or diagram is narrower than its natural width while the pane has spare content width; its box overlaps the gutter; its left edge leaves the text column while it fits to the right; or a clipped edge lacks any of fade, edge rule and caret | Brief prototype checked margin notes against each other and against wide code blocks only: 0 overlaps |
| DRIFT | a full margin note sits more than about two lines (40 px) below its anchor while it isn't the cursor's | Brief prototype: ≤ 39 px for notes other than the cursor's (the cursor's own note reaches 44 px at 1200 px, exempt); 42 stubs over 33 states |
| TRUNC | a shortened field has no ellipsis, or `K` does not give the full value; two visible labels in one list are equal; a tree name is truncated while its small multiples show; or a structured row cuts a field mid-characters or lacks its key | earlier prototype only |
| CAPTION | a column caption is truncated | earlier prototype only |
| HIER | headings do not follow §3.2; a page title and a content `h1` share size and rule | not run on the Brief |
| CHROME | an icon, tint class, chip or chrome style appears inside a content container (§10) | Brief prototype: 26 spoof states pass |
| CORAL | more than one solid coral mass besides the `◆` tag outside a readback, or any on a calm screen (§5.4) | Brief prototype: ≤ 1 in 76 states, 0 in 46 |
| CONTRAST | text under 4.5:1 (3:1 when large) or a mark under 3:1 on the surface it actually sits on | Brief prototype: 0 failures over 9,985 text elements and 2,386 marks |
| CHIPS | a printed chip doesn't resolve in its active context (KL17, strict in Insert), or a view at first sight prints more than 3 chips in the stage, 1 in the statusline or any in the echo row (KL20) | Brief prototype: 168 chips, 0 unresolved with Insert strict, 0 views over, none in the echo row |
| DIM | while any bottom float is open, a chip or action segment outside it isn't `fg.muted` | Brief prototype: 15 float states and 3 Insert states, 0 failures |
| COUNTS | two surfaces show different numbers for one state, or a count differs from what it counts (§8) | Brief prototype: 240 counts, 0 failures |
| DIAGFIT | a diagram label lies outside its frame or its node's box, its effective size is under 12 px, or two labels overlap (§11) | rune-mermaid: 13/13 figures render; 4 have labels of about 10 px (`stack.md` §5) |
| COPY | a chrome count of 1 is followed by a plural noun from the chrome vocabulary ("1 lines"); the echo row shows text equal to a visible statusline segment (FC-Q21); a chrome revision label does not match its kind's display form from `grammar.md` §4.2 (FC-M34); a role word in chrome differs from the conversation's host role; a field is a bare dash; or a bare `n/m` stands without the word `slots` | earlier prototype only |
| ALIGN | a message body's first text line starts anywhere but the text column's left edge, for any role. The human band may extend into the gutter; its text may not | earlier prototype only |
| MD | on the Markdown coverage fixture, a construct does not render its §4.8 shape: heading levels not strictly ordered by size or weight, a missing h1 rule, list markers not stepping 24 px per level, a task box outside the marker column, a table cell clipped or split mid-word, a quote line without its bar, an alert with a hue or icon, frontmatter not collapsed, a footnote marker that `gd` does not reach, or an unlabelled or unknown fence that is coloured | owed: the SC-04 Markdown screen (`stack.md` §8) |
| REF | a host reference span renders without the reference style; anything else renders with it (plain lookalikes, ID-labelled links, IDs in inline code, code blocks or tool output); a dangling span renders in `kind.link`; a span whose bytes differ from its label is styled; or `gd` on a dangling reference moves the cursor (§5.9) | earlier prototype only |

### 4.8 Markdown blocks

The user: *"render markdown as any other markdown reader, one that makes content easy to read and tell apart."* Documents, messages, notes and decision text all render through these rules. They sit inside the text column (§4.1) unless stated.

**Renderer:** rune-kit's `Markdown` (pulldown-cmark), with an Ember `MarkdownStyle`. Render adds what the kit lacks (footnotes, GFM alerts, YAML frontmatter), its own prose paragraphs with pills (§4.2), because the kit draws inline code as a span background that can split and takes no room, and its own code block (below). How Render's blocks combine with the kit's, which has no hook to swap its code block, is settled with the SC-04 Markdown screen (`stack.md` §3, §8).

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
| Paragraph | `prose` 14/21, `space.4` (12 px) between paragraphs; hard line breaks kept |
| Headings | §3.2 scale: h1 20/28 700 + `border.strong` rule; h2 17/24 600; h3 15/22 600; h4 14/20 600; h5 13/19 600 uppercase; h6 13/19 600 italic. **h1 is rose (`content.h1`), h2 is orange (`content.h2`), and h3 and below are `fg`**, after the user's Ember setup (§5.3). Size, weight and rule carry rank. The node ID sits in the gutter |
| Bulleted list | markers `•` / `◦` / `▪` by level (cycling after 3), `fg.muted`, in a 20 px marker column; each level indents **24 px**; hanging indent; tight lists 4 px between items, loose lists 12 px (CommonMark looseness). Beyond level 4 the indent stops growing, so text never narrows below the measure minus 96 px |
| Numbered list | numerals right-aligned in a 28 px column, tabular, `fg.alt`, as written in the source (CommonMark has no a/i styles) |
| Task list | a 14 px box in the marker column, at text size in the content lane. Unchecked: 1.5 px outline in `fg.muted`. Checked: filled `fg.alt` with a knocked-out tick. Item text stays `fg`, with no strikethrough and no colour. Ledger task items are acceptance criteria to read, not chores done. Boxes are display only; editing one is an emission edit (`␣me`). Never olive and never in the gutter (FC-S17) |
| Table | header `prose.table` 600 `fg.alt` with a 1 px `border.strong` rule under it; body `prose.table` 13/19; a 1 px `border.subtle` rule under each row; no vertical rules and no zebra fill. Cell padding 6 px × 12 px; numeric cells tabular; GFM alignment honoured. **Width:** tables are not prose, so they break out of the measure up to the pane's content width (§4.3). Each column is at most `min(measure, 480 px)`, and cells wrap by §4.2. If the columns' minimum widths (their longest unbreakable token) do not fit the pane, the table scrolls horizontally with the fade and `caret--right` cue (§4.3), never clipping a cell mid-word. Header cells never truncate (§4.4). Inline code and references inside cells keep their inline styles |
| Blockquote | a 3 px `border.strong` bar on every line, 16 px left padding, Etoile italic `fg.alt`; nested quotes add a bar 12 px further in |
| Alert (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) | the blockquote shape with a 3 px `fg.muted` bar and a caption line: the kind word in Etoile 13/18 700 uppercase `fg.alt`. **No icon, no hue, no tint.** GitHub colours these blue, green, purple, yellow and red; a red CAUTION box would read as a failed tool call or host state (FC-S17) |
| Horizontal rule | 1 px `border.strong` across the text column, `space.6` above and below |
| Frontmatter | collapsed to one client-drawn line in `ui.small` `fg.muted`: `frontmatter · 6 fields`; `za` expands it (the key is found through which-key, not printed). Its band spans **the text column exactly**, never past the measure. `za` expands it to a `yaml` code block, which then follows the code-block breakout. Keys like `state: approved` are content, never host state (FC-S11) |
| Sticky heading | while a section is scrolled, its heading stays pinned under the pane top. **The band's background spans the pane's full content width**, from the pane's left content edge (or the gutter's left edge, whichever is further left) to the right content edge, so breakout blocks and gutter IDs scrolling beneath are covered. The heading text aligns with the text column, and the 1 px `border.subtle` rule runs from the text column's left edge to the band's right edge. On a review, the band repeats the node's class word at the rule's right end (SC-04). It yields when the next heading is within its height + 48 px. The node ID stays in the gutter |
| Code block | **Render's own element** (rune-kit's wraps long lines, has a radius of about 6 and no gold rule): `surface.code`, square, a 2 px gold left rule (`kind.code`), padding 7 × 14 (20 px on top when labelled, so the label never sits on a long first line). The frame **grows right up to the pane's content edge** (§4.3), then scrolls with the fade and caret cue. The language label sits top-right in `ui.small` gold (chrome, from the info string). Code is `mono` 13/20, coloured per §5.10, and never wraps. `yi` yanks the source bytes. No line numbers unless `:numbers` |
| Inline code | `prose.code` gold (`kind.code`) on a `surface.code` rune pill, with rune's metrics (§4.2); never breaks up to 40 characters |
| Reference | host-resolved spans only: §5.9 |
| Link `[text](url)`, autolink | prose face, salmon text (`kind.link`) with rune's solid 1 pt underline in the same colour; `kind.link_active` on hover or under the document cursor (§5.9). With the cursor on a link, the echo area shows the full URL. `gx` opens it externally after a confirm that shows the whole URL (FC-S05). A link never takes the reference style, whatever its text (FC-S15) |
| Emphasis | *italic* = Etoile italic, neutral; **bold** = 700 in steel (`content.strong`); ~~strikethrough~~ = `fg.muted` with a 1 px line; bold italic combines both. Bold inside a heading takes the heading's colour. A reference, link or inline code inside bold keeps its own colour |
| Image | **not loaded** in v1 (§10.6, FC-S07). A 32 px placeholder line in a 1 px `border.strong` frame: `prose.small` `fg.muted` "image · <alt text> · <host of the URL>"; `K` shows the full URL |
| Footnote | Render's addition to the kit. The marker is a superscript numeral in Iosevka 11 px `fg.alt`; `gd` jumps to the note and `C-o` returns. Notes are collected at the end under a 1 px `border.subtle` rule in `prose.small`, each with `↩` back to its marker. Footnotes are resolved within the same document, so they do not take the reference style |
| Mermaid fence | a diagram (§11) |

**Streaming.** rune-kit's Markdown re-parses from the start of the last top-level block, closes open spans in the streaming tail, and keys its blocks so an append never remounts earlier ones (`stack.md` §3). An unclosed fence renders as a code block so far. An unclosed table renders as rows so far. Nothing re-styles outside the trailing block. The tail itself is `fg.muted`, never coral.

## 5. Colour (Ember)

Every token is in `ember-tokens.json`. Blends use Ember's `util.blend`, which rounds half up. **▲** marks the smallest L* change needed to reach AA, computed.

### 5.1 Surfaces: the reading area is the high-contrast surface

The user asked for the darker background on the main reading area and the lighter one for sidebars. The Brief has no sidebars, so the rule now reads: **the stage is the surface with the most contrast against text**, and chrome regions (tab bar, echo row, statusline, float) are one step quieter:
- In the dark variants the stage is the darkest surface, `base0`.
- **In Ember Light there is no "darker" surface in that sense.** The most-contrast surface is the lightest, `base0` (`#f0e8d8`). Chrome regions use the parchment `bg`, one step toward the mid-tone.
- Ember dark is the default (owner, 11-05).

| Token | Ember (dark) | Ember Soft | Ember Light | Used for |
|---|---|---|---|---|
| `surface.read` | `#151412` `base0` | `#1c1b19` `base0` | `#f0e8d8` `base0` | the stage, the active tab, the Track row, the peek |
| `surface.side` | `#1c1b19` `bg` | `#242320` `bg` | `#e6dac4` `bg` | tab bar, echo row, chat composer, notice band, tooltips |
| `surface.bar` | `#252422` `base2` | `#2c2b28` `base2` | `#d8ccb0` `base2` | statusline, key chips, running tool call |
| `surface.cursor.read` | `#242320` `bg_alt` | `#2a2927` `bg_alt` | `#e6dac4` `bg` | the cursor band in rows and documents |
| `surface.cursor.side` | `#2e2d2a` `base3` | `#353430` `base3` | `#ddd0b8` `bg_alt` | the mode badge; the cursor band inside the float |
| `surface.code` | `#242320` `bg_alt` | `#2a2927` `bg_alt` | `#e6dac4` `bg` | code blocks and inline-code pills |
| `surface.readback` | `#252422` `base2` | `#2c2b28` `base2` | `#ddd0b8` `bg_alt` | the bottom float, readback included (plus a 2 px coral top rule) |
| `surface.selection` | `#3e3c38` | `#444240` | `#b8ac96` | `base4` |
| `border.subtle` / `border.strong` | `#2e2d2a` / `#3e3c38` | `#353430` / `#444240` | `#cec2a8` / `#b8ac96` | `base3` / `base4` (decorative) |
| `rule.focus` | `#908a7e` | `#908a7e` | `#787060` | `base7` / `base6`; kept for a future multi-pane view; the Brief draws no focus separators (non-text ≥ 3:1) |
| `fg` / `fg.alt` | `#d8d0c0` / `#b0a898` | same | `#282418` / `#585040` | Ember fg / fg_alt |
| `fg.muted` | `#999489` ▲ | `#a19c92` ▲ | `#5e5646` ▲ | `base7`, nudged to ≥ 4.5:1 on every surface including tints |

**The bottom float** sits on `surface.readback` with a 2 px coral top rule and an upward shadow (§6). Tooltips are square on `surface.side` with a 1 px `border.strong`.

**Variant by config (decision):**
- The key is `ui.theme` in the client's config file `~/.config/render/client.toml`. Values: `"ember"` (default), `"ember-soft"`, `"ember-light"`, or `"auto"` (macOS appearance chooses `ember` or `ember-light`).
- `␣ht` opens the variant picker and switches **live**: tokens swap within one frame, and type and layout do not change, so pins, cursor and scroll position are untouched. `:set theme=<variant>` switches for the session only; the picker writes the config.
- rune springs colour changes in OKLab by default, so Render switches with `Tx::instant()` to change tokens within one frame (`stack.md` §4).
- **Diagrams on a switch:** rune-mermaid draws diagrams as rune shapes in token colours, so a switch recolours them like any other element. Nothing is cached as an image or re-rasterised, and no host request is made (`stack.md` §5; reasoned).

### 5.2 State (marks only)

| Token | Dark / Soft | Light | Ember name | Meaning | Mark |
|---|---|---|---|---|---|
| `state.attn` | `#e08060` | `#af482e` ▲ | coral (hero) | needs your decision now; open readback (§5.4 also gives it the keyboard's thin marks) | filled diamond |
| `state.blocked` | `#b07878` | `#905050` | rose | failed, refused, quarantined, conflict, revoked | **`stop-sign--filled`** (a filled octagon; FC-M37) |
| `state.stale` | `#7890a0` | `#3a6080` | steel | basis newer than this view has shown you | `time` |
| `state.unknown` | `#988090` | `#706070` | mauve | outcome or effect unknown | `help` |
| `state.local` | `#80a090` | `#386858` | sage | exists only on this device | `edit` |
| `state.ok` | `#8a9868` | `#4a6830` | olive | pass, accepted, succeeded (evidence, receipts, tool calls) | `checkmark` |

State colour sits on marks (icons, 2 px bars, slot pips), on **state tints** (§5.5) and on the tab bar's **count tags** (§5.4). Olive and rose also colour short typed outcome words, in their text tokens `text.ok` and `text.failed` (§5.3). State colour never colours running text. As icons all six are ≥ 3:1 on every surface (§5.7).

### 5.3 Colour roles: one hue, one family

Ember's accents name **families** of things. In chrome, a piece of text keeps its family's hue wherever the client draws it, so parts of the screen and kinds of text differ by colour, not only by brightness. The hue goes on a short field whose type the client knows from a host field (§5.6 rule 3). All values are in `ember-tokens.json`.

| Hue | Means | Token: Dark / Soft / Light | Goes on |
|---|---|---|---|
| **Coral** | what needs you; where your keyboard is | `state.attn`: `#e08060` / `#e08060` / `#af482e` ▲ | §5.4 |
| **Steel** | a label: it names what follows | `kind.you`: `#8097a6` ▲ / `#8a9fac` ▲ / `#375a78` ▲ | group heads, field labels in the handover and readback, the since line's icon |
| **Orange** | literal machine text | `kind.literal`: `#c09058` / `#c2935c` ▲ / `#784e27` ▲ | chrome IDs, digests and revisions (`K·7d21`, `R41`, `#135`, `as46·g1`, `58b3c69`, `M2`), key chips, tab numbers. Syntax keywords take the same hue through `syntax.keyword` (§5.10) |
| **Gold** | code as a thing | `kind.code`: `#c8b468` / `#c8b468` / `#65561a` ▲ | inline code on its `surface.code` chip, the code frame's 2 px left rule and its language label. Inside the frame, syntax colours apply (§5.10) |
| **Salmon** | you can go there | `kind.link`: `#c09080` / `#c09181` ▲ / `#844949` ▲. `kind.link_active`: `#eb9a7f` / `#eb9a7f` / `#913c28` | references and links, in content only (§5.9). The user's own link colours, not Ember's |
| **Sage** | where it lives | `kind.worker`: `#80a090` / `#84a393` ▲ / `#335f51` ▲ | project, host name, the breadcrumb's first segment |
| **Olive** | it passed | `text.ok`: `#8b996a` ▲ / `#94a175` ▲ / `#445f2c` ▲ | short typed outcome words: `pass`, `accepted`, `eligible`. Marks use `state.ok` |
| **Rose** | it failed | `text.failed`: `#b98787` ▲ / `#bf9191` ▲ / `#814747` ▲ | short typed outcome words: `failed`, `refused`, `conflict`. Marks use `state.blocked` |

Tool-call outcome words are the exception to the olive and rose rows: they keep the §5.5 weights in `fg` and `fg.alt`, because the tint already carries the outcome.

**Roles.** Telling agent roles apart at a glance matters, so a role name takes its hue wherever the client draws it from a host field: message headers, the chat roster, Running rows and slot pips, the handover, the Agents list and Slice rows.

| Role | Hue | Notes |
|---|---|---|
| **You** | steel, `kind.you` | the name in the header band, `you` in a host field (`by you`, owner), the `user` icon, and an 8 % steel **band** behind the human message body |
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
- **Counts in group heads and columns** (`fg.alt`): they read with the head beside them and belong to no family. The Brief title's count is the exception (§5.4).
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
- **Page titles are rose** (owner, 11-05), like a content `h1`: rose means "it failed" only on short typed outcome words, which always carry their icon (§5.6 rule 5).

### 5.4 Coral: what needs you, and where your keyboard is

Coral does two jobs, told apart by shape and by what moves it.

**The flag: what needs you.** Only for a decision that is yours now, from a host wait, in chrome lanes. **Solid coral appears only on these:**

| Where | Form |
|---|---|
| Tab bar count | **count tag**: a solid block 34 × 16 px at one digit (wider with more), radius 2, with the diamond and number knocked out in `surface.read`. On every screen while the count is above 0 |
| The cursor row of a needs-you entry (the Brief, any list) | **the needs-you head**: solid coral, square, full band width, with mark, move, time and the `⏎` chip knocked out in `surface.read`; no bar beside it (§12) |
| Track row, at the NEXT target, when NEXT is one act | **the primary action**: a solid coral segment with the key and label knocked out (`◆ ␣ad Answer Q1`, `◆ ␣n Merge main · on the forge`) |
| Readback | **verb tag** (`◆ APPROVE`, knocked out) and the solid `READBACK` mode badge, counted as one pair. The float stays grey (below) |

**Coral without a fill:**
- the filled coral `◆` mark at its size (§7) on a needs-you row that isn't under the cursor, and on the Track stage that is yours;
- the Brief title's count (`Needs you 4`), in coral text only while above 0, and only on `surface.read`: coral text fails AA on the bar, and in Light on `surface.side` (§5.7).

- **At most one solid coral mass besides the `◆` tag, outside a readback,** and none on a calm screen (measured on the Brief prototype: ≤ 1 in all 76 states, 0 in 46). The needs-you head and the primary action never meet: rows live on the Brief and lists, the primary on work views.
- Coral is not the only solid colour: rose (`state.blocked`) and mauve (`state.unknown`) counts use the same tag, with `×` and `?` knocked out. So being solid doesn't say "needs you". Coral, the diamond and first place among the tags do, and the diamond survives in grey where hue doesn't.
- **Content can draw none of this.** Content has no backgrounds, the syntax map has no coral, Mermaid styles are stripped (`stack.md` §5, FC-S09), and emoji such as 🔶 stay at text size in the content lane (FC-S21). Agent text on the Brief sits only on the content bar.
- **Calm:** nothing reads as needs-you. No coral tag, head, diamond or title count; the title reads `Nothing needs you`. The keyboard's thin marks remain.

**Thin coral: where your keyboard is.** At most 2 px, at most one of each per window. They move only on your keys, and no host event can add one:

| Element | Form |
|---|---|
| Caret | coral block caret in documents; a coral bar in every editor, including composers and note drafts |
| Cursor bar | 2 px on the left edge of the cursor band, full band height, in the Brief, lists and the float; at the gutter (x 396–398) in documents. An unfocused region keeps its band and loses the bar |
| Active tab | 2 px top rule |
| Bottom float | 2 px top rule, whatever it holds |
| Mode badge | a 2 px left edge on `NORMAL` (and Operator-pending). Other modes take their own colour; the word stays `fg`. While a readback is open, the badge is the solid form above |
| Current search match | 1 px outline, judged against the surface outside it; other matches stay on `surface.selection` |

- **The caret rule:** the caret is the keyboard, so it is allowed inside text you are typing, including a note composer. What is excluded from thin coral is **agent content**, the bytes an agent wrote, the streaming tail and a Track stage that isn't yours.
- **The stated exception:** the Brief title's coral count doesn't follow the keyboard. It belongs to the flag, and it appears only while something needs you.

**Not coral:**
- **Operator remedies** (a quarantine) take the filled failed mark in On the host, not the diamond, and their next value reads `your move, on the host: …` without a diamond. Their remedy is not a decision in this client.
- **Legends, which-key (the `␣a` leaves), help, the filter float and the palette** draw the outline diamond in `fg.alt`.
- **A delegated decision** uses the word and the `bot` icon in `fg.alt`, in its row, Track stage and handover.
- **Advisory lines** (SC-18, the Proposal page's Advisory) and the dispositions lens carry no flag.
- **Decision (SC-09):** the decision text sits on `surface.read`. The option under the cursor has the band and the 2 px bar, and the recommended option a square `recommended` tag in `fg.alt`, not a diamond. The coral is the Track row's primary.

When this spec says a row or line "draws no coral" or "has no coral mark", it means the flag. The keyboard's thin marks still pass over it.

**Readback** (*"the background can still be grey"*, the user): the bottom float on the neutral `surface.readback`, a grey one step above the stage. Its coral is the 2 px top rule, the verb tag and the badge. Field names are steel, values `fg` or `fg.alt`, and IDs orange. There is no coral fill or tint on the float, and confirm is a chip, never a filled button.
- The readback opens only from the user's own authority key, never from a host event (FC-T07). An authority command exists only for something that needs the user, so a calm screen never carries a readback, and closing it removes its tag and its badge.

**Stock Ember** paints keywords, cursor, links, modeline and search in coral. Render keeps the cursor, active tab, modeline badge and current search match, and moves keywords to orange and links to salmon, so agent content never draws coral.

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

1. **Solid coral only for a decision that is yours now,** in chrome lanes: the four places of §5.4. Outside a readback, at most one solid coral mass besides the `◆` tag; none when calm.
2. **Thin coral follows the keyboard:** the six elements of §5.4, at most 2 px. It never appears in agent content. The caret in text you are typing is the keyboard, so it is allowed. The Brief title's count is the one stated exception, and it belongs to the flag.
3. **One hue, one family, in chrome (§5.3).** A hue goes on a short field (≤ 40 characters) whose type the client knows from a host field, never found by parsing a sentence. **Stated exceptions in content, after the user's Ember setup:** `h1` rose, `h2` orange, `strong` steel.
4. **Neutral leads.** Titles, values, prose and host text stay neutral, and accent text stays the minority of a pane's text. In a list, one field has one hue down its column. The share is a reported number with no limit: the colour-pass render measured 4.8 % on a transcript and up to 49.5 % on a calm list with short titles, and the user accepted that.
5. **Olive and rose label nothing in chrome.** They appear only on outcomes: marks, typed words, tints, diffs and syntax. An olive `checks` label would read as "passed". **Rose titles are the stated exception** (content `h1` and the Brief's and lists' page titles): a failed mark always has its icon and its word, so it doesn't rely on hue, and a title has neither (FC-S22).
6. **Tints are bounded, block-level only, and paired with a word** (and an icon, except tool calls). The human and diff tints are 8 % and 15 % blends. Tool tints follow the §5.5 targets, with a quiet cap of ΔE2000 ≤ 14 from `surface.read`. Text on any tint is ≥ 4.5:1 (§5.7).
7. **Syntax colour appears only inside code blocks,** as text colour only, with no coral and no background (§5.10).

**CORAL** (§4.7; the Brief prototype measured solid coral areas larger than the caret and wider than a 3 px rule). On rune it runs as the pixel test: mask the pixels within ΔE2000 5 of `state.attn`, then erode by 5 × 5. Text stems and 2 px rules vanish, and whatever survives must lie inside `[data-attn]`: the count tag, a diamond, the needs-you head, the primary action, the verb tag or the readback badge, with at most one mass besides the tag. The test masks coral only, so the rose and mauve tags don't trip it. `kind.link_active` is ΔE 6.9 / 6.9 / 7.1 from coral at its core, though a few of its edge pixels can fall inside the mask (measured 9 and 7, in Ember and Light); none survive erosion. A calm screen has no survivors, no flag element and no coral title count. No mask pixel survives erosion in an agent-content container, and coral elsewhere lies only in the six thin elements of §5.4 or the title count. Every needs-you row, primary action and count has its flag.

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
- the Brief title's count on `surface.read`: 6.51 / 6.09 / 4.55. On `surface.side`: 6.09 / 5.56 / **4.01 in Light, under AA**, so the count sits only on `surface.read`, the one place it appears. On the bar it fails too (Light 3.48);
- knocked-out text (`surface.read` on coral) on the tags, the needs-you head, the primary action and the verb tag: coral 6.51 / 6.09 / 4.55; on the tags, rose 5.09 / 4.76 / 5.00, mauve 5.11 / 4.77 / 4.79. The Brief prototype measured the head's text at 6.51:1 in Ember and 4.55:1 in Light.

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
- reference and link underlines: the text colour, so the values above;
- the 2 px cursor bar is thin coral: the values above.

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
- references, inline code and links differ by **shape**, not hue: a reference is Iosevka with a solid underline and no pill; inline code is Iosevka on a pill with no underline; a link is the prose face with a solid underline (FC-Q14). A link and a reference share the underline and differ by face. A dangling reference differs from a resolved one by colour only (`fg.muted` against salmon), since rune draws solid underlines only; `gd` and `K` say which it is. This is also what separates a reference or link from a rose `h1`, along with size and rule;
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

Display forms follow `grammar.md` §4.2.

| State | Treatment | Why |
|---|---|---|
| **Resolved** | `prose.ref`: Iosevka 500 in salmon (`kind.link`: `#c09080` / `#c09181` ▲ / `#844949` ▲), with rune's **solid 1 pt underline** in the same colour, at baseline + 2 pt. No pill, no background; a transparent pill keeps it whole (§4.2). On hover or **under the document cursor**, text and underline take `kind.link_active` (`#eb9a7f` / `#eb9a7f` / `#913c28`), because this is a keyboard-first app | Mono marks it as an identifier, not a word. Salmon marks it as navigable, the same family as links. The underline is the shape cue that survives colour-vision deficiency and separates it from inline code, which has a drawn pill and no underline. A drawn pill on every reference would turn ledger prose ("B1–B5 A1–A6 · F12–F17") into a tag cloud, and would share inline code's shape |
| **Dangling** (in the index with state `dangling`: the target is missing, outside scope, superseded without a successor, or not yet published) | Iosevka 400 in `fg.muted` with the same **solid underline** in `fg.muted`; never `kind.link` | Colour tells it from a resolved one: rune draws solid underlines only, so the earlier dashed underline is gone (`stack.md` §2). It reads as "a reference that goes nowhere". `gd` stays put and the echo area gives the host's reason, e.g. "F99: no such finding in execute-symbolic-calls". `K` explains |
| **Not in the index** | plain prose | Text that merely looks like `F16` gets nothing (FC-S15) |

**Rules:**
- The reference style appears only inside content containers: message bodies, document bodies, decision text, notes and table cells. Chrome IDs keep their chrome style (§5.3).
- **Matching:**
  - exact and case-sensitive;
  - ASCII plus the two display-form characters `·` and `§` (`K·40cc`, `as31·g2`, `§8.4`). Any other non-ASCII character, including a homoglyph, never matches;
  - whole tokens: a match is bounded by whitespace or punctuation on both sides (`F16` matches, `F160` doesn't);
  - against the index of the block's own workflow scope.
- **Never inside code:** code blocks, inline code and tool output show IDs as code. The parser does not match there.
- **Index changes** re-style every visible match by label. Only the state changes (resolved ↔ dangling), and both states are Iosevka, so nothing reflows (FC-W10).
- **Drafts** (prompt, composer, decision note) show references plain, because editors render plain text.
- A link (`[F16](https://…)`) keeps the link style whatever its text. Only the index makes something a reference.
- **Streaming and completed blocks render identically.** The index is present before a message streams, so nothing arrives per block and nothing reflows.
- **Cursor and keys:** with the reader cursor on a reference, the echo row shows its kind, title and state, e.g. "F16 · contracts audit finding · resolved". `gd` opens it, `K` peeks, and `C-o` returns. `gs` hints label references like any target.
- **Range forms** like `B1–B5` match each end separately, with the dash in prose.
- **What the style claims.** A reference says "this label is a real object in this scope, and `gd` opens it". It never says the sentence around it is true. A hostile "r4 is approved" styles `r4` like an honest mention, and `gd` opens the real r4, whose state is shown by chrome.

**Where the link colours sit:** in content only, on `surface.read`, `surface.side`, both cursor surfaces, the human band and the diff tints (§5.7). Under `surface.selection` they fall to `fg`. References and links share these two colours, the one "navigable" hue; their face separates them.

**A note on closeness.** A rest-colour reference and a rose `h1` are close in dark (ΔE 7.2) and nearly the same colour in Light (ΔE 0.8; `state.blocked` is ΔE 3.2 from it). Mono, the underline and size keep them apart (§5.8). Recorded for the user under Q33.

### 5.10 Syntax highlighting

**Highlighter: rune-kit's scanners** (`stack.md` §5a), hand-written and linear-time, through an Ember `SyntaxTheme`. They colour Rust, JavaScript/JSX, TypeScript/TSX, JSON, Python, Go, Swift, shell, SQL, HTML/XML, CSS, YAML and diff. **TOML, Elixir, Markdown fences, unlabelled fences and every other language render plain `fg`**, with the label still shown, and no guessing. Aliases are the kit's (`sh`, `bash`, `zsh`, `yml`, `patch`, `jsonc` …), plus Render's own rows such as `console` for shell, in a `Highlighter` that falls back to the kit.

**Colour only.** A highlight changes colour, never weight or slant, so highlighting never moves a glyph. Ember's bold keywords and italic comments are therefore not drawn; the style column below applies only if a tree-sitter highlighter is added later (`Markdown::highlight` and `Highlighter::new` take one, per language, without a design change). Only the first 32 KiB and 8,192 ranges of a block are coloured; the rest draws plain.

**The kit's ten token kinds map to Ember** (`syntax_kit_map` in `ember-tokens.json`):

| Kit kind | Covers | Ember token | Colour | Dark / Soft / Light |
|---|---|---|---|---|
| Keyword | keywords, markup tag names | `syntax.keyword` | orange | `#c09058` / `#c09058` / `#83552b` ▲ |
| String | strings, characters, regex literals, YAML's unquoted values | `syntax.string` | olive | `#8a9868` / `#8a9868` / `#4a6830` |
| Number | numbers, `true`, `null`, `ALL_CAPS` constants | `syntax.constant` | mauve | `#9b8493` ▲ / `#a08a98` ▲ / `#6b5b6b` ▲ |
| Comment | comments, a diff's header lines | `syntax.comment` | `fg.muted` | `#999489` / `#a19c92` / `#5e5646` |
| Type | type names, CSS classes and ids, YAML tags | `syntax.type` | gold | `#c8b468` / `#c8b468` / `#6f5f1d` ▲ |
| Function | functions where called or defined, macros, shell commands | `syntax.function` | gold | as type |
| Property | JSON and YAML keys, CSS properties, markup attributes, shell and SQL variables | `syntax.variable` | `fg.alt` | `#b0a898` / same / `#585040` |
| Punctuation | brackets, operators, separators | `syntax.punct` | `fg.alt` | as variable |
| Inserted | a diff's added lines | `syntax.diff.plus` | olive | as string |
| Deleted | a diff's removed lines | `syntax.diff.minus` | rose | `#b37d7d` ▲ / `#b78484` ▲ / `#8d4e4e` ▲ |

Render's changes to Ember's own map, kept from the earlier design, all keep coral out of agent content (§5.4): Ember's coral keywords become **orange** (Q23); Ember's other coral uses become **rose**; Ember's orange constants move to **mauve**. Comments use the AA-nudged `fg.muted`. The full tree-sitter capture map stays in the `syntax` block of `ember-tokens.json` for the later highlighter. Worst contrast on `surface.code` and `surface.cursor.read` is 4.58 / 4.56 / 4.56, computed.

**Rules:**
- **Colour budget:** syntax colour is allowed only inside code blocks (§5.6 rule 7). The gold inline-code pill is not itself highlighted.
- **Anti-spoofing:**
  - The map has **no coral** and **no background** token.
  - A `diff` fence colours its line text olive or rose. It never fills line backgrounds, so it cannot look like the compare lens's tints.
  - A `bash` block printing `✓ exit 0` stays a neutral code block with a gold rule and a language label. A tool-call block is tinted, has no gold rule, and sits between messages, never inside one (FC-S16).
- **Cost:** the kit highlights while building the view, not on a worker; it claims 0.01–0.5 ms per thousand lines, and results are cached per language and code. Its cost under the streaming firehose is owed (FC-P08).

### 5.11 Action segments

The Track row's actions, right-aligned to x 1396 (`layout.md` §0).
- **Square and key-first:** the key chip, then the label: `␣ar rework`, `␣aa approve`, `◆ ␣n Modules r2`. The label names the act, never the option.
- **Neutral:** 1 px `border.strong`, `ui` `fg`; two neutral segments have equal weight.
- **The primary at the NEXT target, when NEXT is one act:** solid coral, text and key knocked out (§5.4).
- **Disabled by host or connection state:** a dashed 1 px `border.subtle` edge (rune's `border_dash`), `fg.muted`, no chip, and `· off` after the verb (`rework · off`); the reason is on `K`. The dash, the colour and the word carry it (FC-M71). "No dotted or dashed underlines" (`stack.md` §2) is about underlines, not borders.
- **While any bottom float is open** (readback, `:` line, palette, pickers, which-key, filter, outbox, URL confirm, stale reply, handover): every segment and chip outside the float is `fg.muted` and inert, in its usual shape. In Insert, the segments' chips draw muted too. Measured on the Brief prototype: 15 float states and 3 Insert states, 0 failures.

## 6. Surfaces, elevation, radius

| Level | Used by | Surface | Edge | Shadow (dark / light) |
|---|---|---|---|---|
| 0 | tab bar, stage, Track row, peek, statusline, echo row | `surface.side` / `surface.read` / `surface.bar` | none: surface steps | none |
| 1 | chips, count tags, code blocks, tool calls, notice band | `surface.bar` / `surface.code` / tints / `surface.side` | tool calls 1 px `border.strong`; code a 2 px gold left rule | none |
| 2 | the bottom float (readback included) | `surface.readback` (neutral grey; no coral fill or tint, §5.4) | 2 px coral top rule | upward only: `0 -14px 40px rgba(0,0,0,.45)` / `0 -14px 40px rgba(60,48,24,.22)` |
| 2 | tooltips | `surface.side` | 1 px `border.strong` | `0 4px 12px rgba(0,0,0,.35)` |

**On rune:** the float's upward shadow is rune's `box_shadow` with a negative y offset (`el/visuals.rs` at the pin; `shadow`, `gradient` and `border_dash` are there too). Q46 is closed.

**Radius:** 0 everywhere, except 2 px on Render-drawn key chips, count tags and hint labels. In-text pills take rune's fixed radius (§4.2). Code blocks, tool calls, segments, the float and tooltips are square. No translucency or blur.

## 7. Icons

**IBM Carbon** (`@carbon/icons` 11.90.0, Apache-2.0), bundled as SVG paths and drawn with rune's `icon()`, tinted with `.color()`. rune reads an SVG subset (path, rect, circle, ellipse, line); the spike's 56 converted icons drew correctly (looked at, `stack.md` §4).
- **Sizes**: 14 px in tabs and nav, 12–16 px in rows and gutter; 11–12 px in the Track, small multiples, tags and continuation marks; 20 px for empty states.
- Icons supplement labels, never replace them.
- **Custom glyphs**: the Render diamond (filled / outline), the drawn leader mark `␣`, the offline ring and the ready dot.
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
| views and nav: Brief · chat · review · evidence · decision · Proposal page and Proposals list · Slices · Agents · find · operation | `list--checked` · `chat` · `document` · `document--signed` · outline diamond · `document--tasks` · `tree-view` · `bot` · `search` · `help` | `fg.alt` in the active tab, `fg.muted` otherwise |
| Track stages: done · rework · to come · yours · delegated | `checkmark` · `renew` · `circle-dash` · filled diamond · `bot` | `fg.alt`; the diamond coral only when the stage is yours now; `bot` `fg.alt` |
| since line · external link · more below | `time` · `launch` · `arrow--down` | `fg.muted` / steel for `time` |
| roles: you · agent · host | `user` · `bot` · `bare-metal-server` | the role's hue (you steel, reviewers mauve, workers sage); the coordinator's icon and a delegated decision's `bot` `fg.alt`; host `fg.muted`. Tool calls have **no icon** (§5.5) |
| states in the filter float | `checkbox` / `checkbox--checked` | `fg.alt` / `fg` |
| connection · continuation · clipped edge | `connection-signal` (`--off`) · `arrow--right` · `caret--right` | `fg.muted` / `state.stale` |
| diagram (wider-than-view, parse error) · empty filtered list | `diagram` · `filter` | `fg.muted` |
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
  - **Needs you:** decisions and acts only you take, with the diamond. This includes the main merge;
  - **On the host:** operator remedies, directly below it, with the failed octagon.

  Each count is the same wherever it appears:
  - the tab bar's count tags (§5.4): `◆` = Needs you, `×` = On the host, `?` = unknown outcomes;
  - the Brief's title and group heads: the same numbers (measured on the Brief prototype: 220 repeated counts agree).

  Each count is shown only when non-zero, and appears nowhere else.
- **Running vs slots** (FC-M36). They differ by protocol: a cancel-requested assignment keeps its slot through the 30 s grace, and an effect can hold one. Headers therefore print both, rows first and slots named: `Running 3`, the slot pips, then `slots 4/4 · 1 held by a cancelled run`; `Executing 4 · slots 4/4`. A cancelled run holding its slot is an outlined pip. A bare `4/4` was read as "4 running" in all five trial runs on the earlier design.
- **Changed since you left:** on the Brief, a row the since line counts takes a `ui.strong` title, with no dot, until the cursor visits it (`spec.md` SC-02). Row titles are otherwise regular, so bold means "changed since you left" and nothing else in lists.
- Approval provenance is text plus the `user` or `bot` icon (§2.2).

## 9. Motion

Two meaningful motions:
- a 600 ms state-change tint on a row (rows never move);
- 90 ms fades for floats and the readback, whose top rule is at full opacity from the first frame.

Tool-call blocks change tint instantly when their outcome arrives, with no animation, so the success or failure is never delayed. Reduced Motion (macOS, or `ui.motion = "off"`) sets every duration to 0.

## 10. Chrome versus content (anti-spoofing)

1. **Lanes.** Work views have a 40 px gutter. Gutter, tab bar, Track row, statusline, echo row, the bottom float (which-key, palette, readback), hint labels, message header bands, **tool-call blocks**, and the Brief's heads, bylines and labelled values are chrome. Content renders only inside content containers: message bodies, document bodies, code blocks, report table cells, and the 2 px content bar.
2. **Typography.** Content renders only in `prose.*`, `prose.code`, `prose.ref` and `mono` (code frames only). Chrome uses `ui.*` and `mono.small`. Content cannot select a face, size, tracking or colour.
   - Chrome and content share Iosevka Etoile, so **the face does not separate them**.
   - What separates them is the lane (§10.1), the surface, the content bar and the case. **The invariant** is that content never takes a chrome style: the badge (Iosevka 11 px uppercase, +0.08 em), a page title at the stage origin without a rule, a chip, a tag or a fill.
   - Content can be small or uppercase in its own ways: the h5 heading (13 px uppercase, +0.04 em), alert captions (13 px uppercase, no tracking), footnote markers (11 px Iosevka numerals), and references and code inside `prose.small`. None is the badge style (Iosevka 11 px, +0.08 em).
   - Outside a document or transcript, content sits on the 2 px content bar, in `prose.small` 13/19 (§3.1). On the Brief that is only the ask, and only for a field the host marks as content (RQ-50).
   - A bold uppercase "NEEDS YOU · 4" written in a message is a 14 px prose line inside a message body, never a title or tag (FC-S18). A content `h1` reading "Approved" is a rose 20 px heading with its rule in the text column, never a page title (FC-S23).
3. **Icons and tints are chrome.**
   - No content produces an icon, a tint or a block background. Markdown code blocks always render on neutral `surface.code` with the gold rule. They are never olive or rose, whatever their language label or text (`bash`, `✓ exit 0`).
   - **Tool-call blocks come only from host tool-call records** (RQ-09: name, outcome, exit code, timing, output reference). They are rendered between message bodies, never inside one, tinted by outcome and labelled with the outcome word. They have no icon (§5.5). Content cannot produce a tint, so a message cannot fake a tool success (FC-S14).
   - **Content can't produce a chip, a pill style of its own, a solid fill or a chrome face.** Inline code is a gold pill only because the Markdown block type says so.
   - Emoji render as ordinary glyphs inside content and never reach a chrome lane. Markdown images are never loaded.
4. **Colour.**
   - Author colours and the human band come from host role metadata only. The text "coordinator:" in a message stays `fg` prose.
   - In content, accent text appears only as references matching the host's reference index (§5.9, RQ-42), links, inline code, syntax inside code frames (§5.10), `h1`, `h2` and `strong` (§5.3). All of these follow from the block type, never from a colour the author picked. Everything else accented is chrome. Content never draws coral, a background or a tag (§5.4).
   - **Hue is not provenance.** Bold content is steel, the same hue as the `you` name, and a content `h1` is rose, the same hue as a failed mark and the page titles. The header band, the gutter's role icon, the human band, the failed mark's icon and word, and the page title's place at the stage origin without a rule are what can't be forged (FC-S10, FC-S22, FC-S23).
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
9. **The Brief's ask** is agent text only when the host marks the field as content (RQ-50); then it sits on the content bar, at most two lines, cut at the last whole word with `…`; the whole text is on `K` and `⏎` (FC-Q29). **`lastActivity` is always content** (agent-reported): one `prose.small` line on the content bar under the Running row's chrome lines, its host time in chrome at the right. A host value outside its usual place keeps its label (`blocker none · 1 uncertainty`). Until the host marks authorship, every free-text field is treated as content.

## 11. Diagrams and the canvas boundary

**Default: diagrams render on open.** `␣tm` shows the source. The ambition makes Mermaid native in v1, and designs are reviewed as pictures.

**Renderer: rune-mermaid** from the rune pin, in the client (`stack.md` §5). It parses and lays out Mermaid in Rust and draws it with rune shapes in the app's fonts, with no JavaScript, web view or network. rune-kit's Markdown draws `mermaid` fences with it, also while a fence is still streaming. The host serves Mermaid source bytes only, so the client owns its fonts, its layout and its tokens. Layout and drawing use the same text system, so labels can't be measured with one font and drawn with another (FC-Q22).

**Strip styles first.** `style`, `classDef`, `class`, `:::class`, `linkStyle` and sequence `rect` tints are removed before layout, so content can't paint chrome colours (FC-S09).

**Fit rule:**
- **Figure width** = from the text column's left edge to the pane's right content edge, as for code and tables (§4.3: grow right, never over the gutter). No fixed cap; rune-kit's `diagram_max_width` is set to it.
- Labels in **Iosevka Etoile** (`diagram_font`), node text 16 px, one step above 14 px prose. Natural width ≤ figure width: drawn at natural size.
- Wider: **scaled down to fit, provided every label stays ≥ 12 px**.
- Still wider: the inline frame shows the **"wider than view" state** instead of a clipped picture:
  - a 20 px `diagram` icon;
  - the figure caption;
  - the natural width in px;
  - "labels would be N px here";
  - node and edge counts;
  - the chip `⏎ full view`.

  Labels are never clipped mid-word, and a subgraph title never collides with an edge label.

**Full view** is a float over the whole window. It pans with `h j k l`, zooms with `+ - =` from fit-to-window up to 200 %, and **`q`, `Esc` or `⏎` leaves it**, restoring the panes and cursor. It never shows labels below 12 px; panning covers the rest.

**Owed on rune** (looked at, `stack.md` §5): all 13 spec figures render, but labels wrap oddly; with the Ember style, four figures have labels of about 10 px, under the 12 px rule; one keeps a `rect` tint, which the strip removes; two are wider than 1,512 px. What a malformed diagram shows is unchecked: the kit shows the source as a code block, and this spec wants the error's line and column.

**DIAGFIT check** (§4.7): every label box lies within the visible frame and within its node's box, effective size ≥ 12 px, and no two label boxes overlap. Title-to-edge-line collisions are reported, not failed.

**Tokens:**
- nodes `surface.bar` with `border.strong`;
- text `fg`;
- edges `fg.muted`;
- edge labels `fg.alt`;
- the frame `surface.code`, square, with a caption in `ui.small`.

A variant switch recolours diagrams like any other element; nothing is re-rasterised (§5.1).

A parse error shows the source in `mono` with `stop-sign--filled` and the line and column.

**Canvas** (future): a one-line summary, plus a shape list on `za`. Only the canvas would need a web view, which rune lacks; revisit then (`stack.md` §3).

## 12. Focus, cursor, hint labels

- **One keyboard cursor per window.** The focused region has the coral bar; an unfocused region keeps its band and loses the bar. There are no focus separators.
- **Cursor row** (the Brief, lists, the float's rows, options): a square band on `surface.cursor.read` with a **2 px coral bar on its left edge**, full band height. It replaced the `▸` pointer (owner, 11-06).
- **Needs-you cursor row:** the head is solid coral, square, full band width, with text knocked out in `surface.read`, and no bar (§5.4).
- **Document cursor:** a full-width current-line band, the 2 px coral bar at the gutter (x 396–398), and a coral block caret. The caret is the keyboard, never content. A reference or link under the document cursor takes `kind.link_active` (§5.9).
  - The cursor band equals `surface.code`, so on a code line or an inline-code pill **the 2 px bar is the only cursor cue**. An inline-code pill on the cursor row keeps its gold text and no underline, so it is still told from a reference.
  - Moving `surface.cursor.read` one step was computed and rejected: it weakens the dark cursor to ΔE 2.1 and forces five new Light ▲ nudges.
  - rune has no caret in static text (`stack.md` §3), so Render draws the caret as an element.
- Selection uses `surface.selection`.
- **Hint labels** (chips in context `hint`):
  - square chips in `mono.small`, `surface.read` text on an `fg` fill, radius 2;
  - placed at the **start of the row's text**, immediately after the state icon, so they never cover an icon; they may cover the first characters of the row (the project label), which stays readable on `K`;
  - overlaps shift right in reading order;
  - the target set is frozen at `gs`; the badge reads `HINT`.
- **Key chips:** `key` (Iosevka 11.5/16 500) orange (`kind.literal`) on `surface.bar`, square, radius 2, no border. While any bottom float is open, chips outside it draw in `fg.muted`. Few are printed (`grammar.md` §18; KL20).
- **Picker previews** show content as content: `prose.small` or `mono` code with the 2 px content bar, under one chrome line (`ui.small`: kind · path · revision). A preview never borrows chrome styles, and its references match the index of the previewed object's scope.

## 13. Screen layouts (summary; pixel specs in `layout.md`)

All chrome is in Etoile, and numeric columns are in Iosevka. Every screen sits on the frame of §2.2.

| Screen | Stage | Visual rules |
|---|---|---|
| SC-02 the Brief | two columns: Needs you, On the host, Waiting · Running, Done | Rose `page.title` with a coral count; the since line; entries with head (`move`), byline, ask on the content bar (content-typed fields only), Track foot; the needs-you cursor head solid coral; Waiting as 28 px dense rows; Running rows of three lines: chrome title and role lines, then `lastActivity` as content on the content bar with its host time in chrome at the right; slot pips; changed rows in `ui.strong`; authority keys never on rows |
| SC-03 chat | roster in the left margin, transcript on the text axis, artifacts in the right margin | Role hues, coordinator neutral; human band; **tool-call blocks with outcome tints, no icon**, a `border.strong` edge and a fixed outcome column; code blocks and syntax colour; references from the index, identical in streaming blocks; the streaming tail `fg.muted`; the composer square on `surface.side` with no icon |
| SC-04 review | outline and round summary in the left margin, document on the text axis, margin notes on the right | Markdown blocks (§4.8); references; syntax colour; diagram fit rule; blocks grow right, never over the gutter, with the clip cue; change bars `fg.muted` in the gutter; notes at their anchor's y, stubbed beyond about two lines of drift; the class word on the heading row; `␣md` and `␣om` lenses replace SC-05 and SC-06 |
| SC-07 evidence | passes, obligations and findings in the left margin; the proof chain as a vertical Track on the text axis | Gate passes use the olive `checkmark`; a web passage is content on the content bar; the Watchdog column reads `none yet` until a round exists |
| SC-08 Agents list, SC-16 Slices and Proposals lists | list column, peek on the right from 1180 px | Rose `page.title`; 28 px dense rows grouped with steel heads; Proposals rows exactly two lines; filter words and the filter float (`␣sf`); the peek gives way to the `K` float |
| SC-09 decision | question as content `h1`, provenance, evidence, options, your answer | Options `{n, title, body}` with a square `recommended` tag; the readback grey with the coral rule, verb tag and badge only (§5.4); it scrolls its target into view, renders every host basis field and says "not yet acknowledged"; chips outside it dimmed |
| SC-10 states | the open view | One notice band, with no per-cell mark; the host segment on every screen; plain words for SC-10h; disabled segments `· off` |
| SC-11, SC-12 | the bottom float | Input on the last line, results growing upward; which-key's **one** explanatory sentence, in the `␣a` head |
| SC-14 Mermaid | in the document | rune-mermaid; fit rule; "wider than view" state; render by default; no fixed width cap |
| SC-17 settings | the text axis | Reader rows; the field under the cursor is bold; no flag outside the readback |
| SC-18 local prompt | the text axis | The SC-04 reader with no notes margin; advisory, so no flag |
| SC-19 Proposal page | one reader column | Ticks per Slice on the Track row; the coral primary only for `mergeMain`; Slice columns next to the name, quiet per §5.3; advisory rows carry no stale, failed or coral mark |

## 14. TUI fallbacks (one line each)

| rune element | Terminal fallback |
|---|---|
| Iosevka Etoile chrome and prose | the terminal's monospace (ideally Iosevka); prose measure 80 columns |
| Type scale | bold, markers and blank lines |
| Spacing | whole cells |
| Icons | the TUI column in §8 |
| Stage vs chrome surfaces | two background colours (`base0` / `bg`) |
| Tints (tool calls, human band, diff) | the same background colours via truecolor; on 256-colour terminals, neutral background plus the outcome word (bold for failed and unknown) |
| Count tags, the needs-you head, the primary action and the verb tag (§5.4) | coral background cells with the glyph and text in the surface colour; rose and mauve tags the same; reverse video on 256-colour terminals |
| Thin coral (§5.4) | the terminal cursor in coral where supported; the cursor bar `▎`, active tab and mode badge edge in coral foreground |
| References (§5.9) | salmon + underline (SGR 4), `kind.link_active` under the cursor; dangling: `fg.muted` + underline |
| Syntax (§5.10) | the same foreground colours; no backgrounds |
| Markdown blocks (§4.8) | headings bold, h1 rose and h2 orange, h1 followed by a rule line; `strong` bold steel; list markers as in the GUI; tables with box-drawing rules; quote bar `▎` |
| Role and family hues (§5.3) | the same foreground colours (truecolor) or the nearest 256-colour |
| Elevation and shadows | the bottom float's top rule as a coral `━` line; no shadows |
| Radius and pills | square corners; pills become plain text kept whole |
| Motion | none; a state change sets the row bold until visited |
| Hint chips | reverse video |
| Mermaid | source, or kitty graphics where supported |
| Host segment | the same words; the stale mark as `[!]` |
| Filter float states | `[x]` / `[ ]` |
