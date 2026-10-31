# Wireframes: pixel layout spec at 1512 × 982

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`../reference/`](../reference/); `wireframes.md` → [`../wireframes/layout.md`](../wireframes/layout.md); `screens.md` → [`../wireframes/text-mocks.md`](../wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`../evidence.md`](../evidence.md).


This is the input for the tldraw wireframes, for the screens whose layout changes in phase 3 and for the new slice explorer (SC-16). Coordinates are logical px in a maximised window on a 14″ MacBook Pro: 1512 × 982 (origin top-left; x, y, w, h). Tokens refer to `visual-language.md`; type tokens to §3.2; surfaces to §5.1. Sample content comes from the existing fixtures (`screens.md`, `fake-host`); fixture-only values are marked *(fixture)*.

Layout values are **proposed**. The renderer computes `measure.prose` at startup (`visual-language.md` §4.1). Phase 6 **measured** it at **548 px** for Iosevka Etoile at 15 px (phase 4: 584 px at 16 px), with CoreText on the bundled WOFF2, and Iosevka's advance at exactly 0.5 em. Text columns below are drawn at 548 (phase 5: 584; phase 3: 580).

**Phase 6 applies everywhere** (`dispositions-2.md`; human trials and the user's style notes):
- **Prose is 15/24** (was 16/26), so `measure.prose` is **548 px** (`tools/font_metrics.txt`). Text columns below are redrawn at 548 + the 40 px gutter = 588.
- **No per-message author rule.** All message text starts on the text column's left edge; the human message keeps its steel band.
- **NEEDS YOU counts decisions only.** Operator rows are their own group, ON THE HOST. RUNNING shows rows and slots apart.
- **The failed mark is a filled octagon** (`stop-sign--filled`).
- **No handover field is a bare dash.**

**Phase 5 applies everywhere** (`dispositions-1.md`):
- The bufferline's right end carries the **host segment**: host name, `hostMode` and protection (`visual-language.md` §2.2).
- Wide blocks **grow right from the text column's left edge** and never cover the gutter; the clipped edge shows a 32 px fade, a 2 px edge rule and a 16 px caret.
- The coordinator's name is neutral.
- Side-pane content is `prose.small` 15/24 with a 2 px content bar.
- Side-pane list rows are structured (key · role · state · time).

**Phase 4 applies everywhere:**
- All chrome is Iosevka Etoile at unchanged sizes, about 20 % wider than Plex Sans was (`visual-language.md` §3.1). Numeric columns are Iosevka `mono.small`.
- Code blocks, tables and diagrams **break out** of the text column up to the pane's content width, then scroll with a fade + caret cue (§4.3).
- Tool tints are stronger (§5.5).

## 0. Frame (every screen)

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Bufferline | 0 | 0 | 1512 | 30 | `surface.bar`, bottom 1 px `border.subtle` | Left from x 8: view tabs, each `space.3` padding + 16 px view icon + 4 + `ui` label. Active tab in `fg` with a 2 px `rule.focus` underline at y 28; others `fg.muted`. Right-aligned to x 1504: attention counts (coral diamond 12 + `mono.small` "3", `error--filled` rose 12 + "1", `help` mauve 12 + "1"), gap 12, **host segment**: `connection-signal` 16 + "homeserver" `ui` + "protected to seq 18340 (2 m)" `ui.small` `fg.muted`. When not calm: the stale mark + `fg` words, e.g. "catching up after a restore" or "unprotected since seq 18340 · 7 m". Then, after a 16 px gap and a 1 px `border.subtle` rule, "seq 18342 · 14:03:12" in `mono.small` `fg.muted` |
| Handover strip (workflow views only) | 0 | 30 | 1512 | 48 | `surface.bar`, bottom `border.subtle` | Five columns of 302 px separated by 1 px `border.subtle`. Padding 16 left; label `ui.label` `fg.muted` at y +8; value `ui` `fg` at y +26. NEXT: coral diamond 12 only if a decision is due now, text, key chips right-aligned **Phase 6 (trial b, FC-R08):** no value is a bare dash. Empty fields are words: OWNER `no owner · waits for a slot`, EVIDENCE `none yet`, BLOCKER `none` (or the wait class, e.g. `slot 4/4 busy`), NEXT `nothing for you yet` |
| Content | 0 | 30 (78 with strip) | 1512 | 902 (854) | per screen | — |
| Statusline | 0 | 932 | 1512 | 24 | `surface.bar`, top `border.subtle` | Mode badge (outlined chip, `mono.small` uppercase, 6 px padding; Insert border `state.local`, Readback border `state.attn`, else `border.strong`); breadcrumb `ui`; SAVE (`edit` 16 + text) and DECISION segments; right: `mono.small` seq, host time, position |
| Echo | 0 | 956 | 1512 | 26 | `surface.side` | `ui` message at x 16, or the command line in `mono` |

**Surface rule:** each screen's main pane is `surface.read` and every other pane is `surface.side`. In dark and Soft the main pane is the darker one; in Light it is the lighter one (`visual-language.md` §5.1).

## SC-02 Needs-me queue

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Queue list (main) | 0 | 30 | 992 | 902 | `surface.read` | groups and rows, below |
| Separator | 992 | 30 | 1 | 902 | `border.strong` | — |
| Card (side) | 993 | 30 | 519 | 902 | `surface.side` | the handover card, padding 16 |

**List columns** (row height 26, group header 24 with 24 above):

| Column | x | w | Type | Sample |
|---|---|---|---|---|
| state icon | 16 | 16 | icon | coral diamond / `stop-sign--filled` (phase 6) / `hourglass` / `play--filled--alt` / `checkmark` |
| project | 40 | 72 | `ui.small` `fg.muted` | `minos` |
| item | 120 | 372 | `ui` `fg`, path truncation | `native-engine/execute-symbolic-calls` |
| reason | 500 | 328 | `ui` `fg.alt` | `decide Q1 · aliased callee Axes` |
| waiting (A1) | 832 | 60 | `mono.small`, right-aligned | `2d 4h` |
| downstream (A1) | 896 | 84 | `mono.small`, right-aligned; the host's `downstream.transitive` | `25` |

**Sample rows**, with the ledger facts and the phase-3 fake host's downstream counts (`fake-host/report-phase3.md`; direct / transitive in brackets):
- NEEDS YOU · 3 (phase 6: decisions you take in the client, the same 3 as the bufferline ◆ and the statusline's "3 need you"; FC-M35):
  - skills `reduce-test-runtime/simplify-adapter-launch-tests` · direction · held by you · 8d 5h · 0
  - minos `native-engine/execute-symbolic-calls` · decide Q1 · 2d 4h · 25 [4 / 25] (**cursor row**: `surface.cursor.read` + 2 px `rule.focus` bar at x 0)
  - render `render-host` · review checkpoint · 6m · —
- ON THE HOST · 1 (phase 6: operator remedies, directly under NEEDS YOU; the bufferline's ✗1; statusline "1 on the host"):
  - minos `native-evaluation/specify-rsps-profile` · operator · as38 quarantined · 52m · 4 [2 / 4] (*fixture*). Rose `stop-sign--filled` octagon, **no diamond** (F5).
- WAITING · NOT ON YOU · 5, **oldest first**: work-router 4d · 2, checkpoint-engine 4d · 1, design-playbook 4d · 0, evaluate-exact-sum-with-demand 41m · 23 [3 / 23], then op9 23m · —.
- RUNNING · 4 · slots 4/4 (phase 6: rows first, slots named; they differ while a cancel-requested assignment holds its slot through the 30 s grace, FC-M36): execute-causal-scan 41m · 23 [3 / 23], auto-tag-bookmarks 12m · 0, specify-cma-profiles 8m · 29 [8 / 29], p2 candidate b 3m · —.
- DONE · 24 h; PROPOSALS small multiples (12 px icons, 2 px gap) in the host's dependency order (`screens.md` SC-02); legend (diamond drawn in `fg.alt`, F6).

**Card** (x 1009–1496):

| Element | y (from 30) | Contents |
|---|---|---|
| Title | 16 | `ui.title` "Execute symbolic Calls"; path `ui.small` `fg.muted` "minos / native-engine / execute-symbolic-calls · waiting 2d 4h" |
| Facts | 64–196 | label column 96 px (`ui.label`), values `ui`: COMMITMENT · OWNER · EVIDENCE (2 lines) · BLOCKER · NEXT (coral diamond + "answer Q1 · 3 options" + chip `␣ad`). Phase 5: no recommendation in NEXT; it is the coordinator's, not the system's (challenge 14) |
| Meta | 204 | `ui.small` `fg.muted` "rework 1/2 · downstream 4 · 25 in all · since 10-25 09:52" |
| QUESTION | 236 | caption `ui.label`; question in **`prose.small` (Etoile 15/24, phase 5)** on a content lane with a 2 px `border.strong` left bar (x 1009), text from x 1021, max width 475; then `ui.small` `fg.muted` "coordinator recommends 1" |
| Options | +12 | three lines with the option titles only (`{n, title}`): "1 Accept the current dispositions", "2 Forbid aliasing", "3 Define the semantics"; `prose.small`; number in `mono.small`; "recommended" outlined chip |
| ACTIONS | +24 | caption; two columns of key chip + `ui` label |
| Below | rest | empty (style-check note: about 300 px free) |

## SC-03 Chat (tool-call blocks, authors, human band)

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Transcript (main) | 0 | 78 | 1171 | 742 | `surface.read` | message stream |
| Prompt | 0 | 820 | 1171 | 112 | `surface.bar`, top `border.subtle` | header 24 + 2 lines × 26 + hints 20 + padding 16 |
| Separator | 1171 | 78 | 1 | 854 | `border.strong` | — |
| Info pane (side) | 1172 | 78 | 340 | 854 | `surface.side` | CONVERSATION, STEERING QUEUE, ARTIFACTS IN THIS TURN, OTHER CONVERSATIONS, OUTLINE |

**Text column** (centred in the transcript): gutter x 291–331 (40), text x 331–879 (548; phase 6). **Breakout area** for code, tables and diagrams: the pane's content width, x 16–1155 (1,139).

| Block | Geometry | Tokens | Sample |
|---|---|---|---|
| Message header band | h 20, gutter + text | role icon 16 in the gutter in the role's kind colour; name `ui.strong` in the kind colour (the host's display label: role class `human` shows as "you"); meta `ui.small` `fg.muted` | **you** (steel) "laptop · 18:41 · rcpt …f07d"; **coordinator** (`fg`, neutral since phase 5; icon `fg.alt`) "opus-5.5 · as27·g1 · turn t42 · 13:52" |
| Human message | band x 287–883 behind header and body, radius 2, padding 8 / 12. **No author rule** (phase 6, the user's style note); the body text starts at x 331 like every message | `tint.human` behind header and body; body `prose` 15/24 | "A020 needs a real comparison of storage, not the SQLite default. Keep one authoritative host and say what each option costs." (`A020` is a host-resolved reference: gold Iosevka 500 with a solid underline, `visual-language.md` §5.9) |
| Agent message | no band and **no rule** (phase 6); text from x 331. Provenance is the header band: role icon in the gutter, name, model, assignment, time (`visual-language.md` §10.5) | body `prose` | "I'll answer A020 with an experiment rather than argument. Protocol p2 compares three layouts…" with a numbered list |
| Tool call, collapsed | x 331–879, h 28, radius 2, 1 px `border.strong` (phase 5, defect 7) | **no icon; the gutter stays empty** (tldraw review).<br>• Tool name `mono` `fg` at x 325, then arguments `mono` `fg.alt`, truncated before the outcome column.<br>• **Outcome column** x 651–867 (216 px, fixed; phase 4; x from the phase-6 column): the outcome word **starts** at x 651, then ` · detail · duration` in `mono.small`. Every word in the transcript sits at x 651 (E-PROTO-3 defect 4).<br>• Background by outcome, phase-4 tints (`visual-language.md` §5.5): ok `#212615`, failed `#321f1e`, unknown `#2a2226`, running `#2e2d2a` in Ember | `read_artifact docs/spec.md §5.4` · "ok · 6.1 KB · 0.2 s" (`fg.alt`) on `tint.tool.ok`. The approved drawing had a green gutter dot here; it goes |
| Tool call, failed | same | `tint.tool.fail`; outcome word **bold `fg`** | `bash rg -n 'blocksCount' host/` · "**exit 1** · no matches · 0.1 s" (the outcome word bold; the host's short `status` text and the duration regular). The drawing's rose square goes |
| Tool call, running | same | `tint.tool.run`; elapsed time updates every 10 s | `bash mise run probe -- p2 b` · "running · 40 s" (`fg.alt`). The drawing's blue arrow goes |
| Tool call, unknown / cancelled | same | `tint.tool.unknown` with **bold** "unknown"; cancelled on `surface.side` with "cancelled" (`fg.alt`) | the p2-b worker chat's interrupted and cancelled calls (`conversation:p2-b`) |
| Tool call, expanded (`za`) | + output rows | output `mono` 13/20 `fg.alt` on the same tint, max 12 lines, then "… 37 more lines · K" `ui.small` | the gate output |
| Code block in a message | its natural width, from the text column's width up to x 1155. **The left edge stays at x 331** (phase 5: grow right; never over the gutter at x 291–331), so the maximum width is 824 px (phase 6). Still wider: horizontal scroll, with each clipped edge showing a 32 px fade, a 2 px `fg.muted` edge rule and a 16 px `caret--right` at the visible block's vertical middle. Radius 2, padding 12 × 16 (20 on top when labelled) | `surface.code`; 2 px left rule in orange; language label `ui.small` orange at top-right; `mono` 14/20 highlighted per `visual-language.md` §5.10 (keywords orange bold, functions and types gold, strings olive, constants mauve, comments `fg.muted` italic) | ```` ```rust ```` reconcile snippet: `fn` `let` `match` orange bold; `reconcile` gold; `"stale_basis"` olive; `// pinned target` `fg.muted` italic |
| Inline code | inline | Iosevka 14 orange on a `surface.code` chip (padding 0 3, radius 2; phase 6: one px under 15 px prose) | `observe(scope, cursor?)` |
| Gap between messages | 24 | — | — |

**Info pane:**
- STEERING QUEUE's queued steer renders in `ui.quote` (Etoile 13/18 italic `fg.alt`, at most 3 lines), on a content lane with the 2 px bar (evaluation-3 §4; phase 5).
- **OTHER CONVERSATIONS uses structured rows** (phase 5, evaluation-4 §1; replaces phase 4's middle truncation). The slots are key `mono.small` (x 1188, 56 px) · role `ui` (x 1252, 96 px) · state `ui` `fg.alt` (x 1356, 96 px) · time `mono.small`, right-aligned at x 1496. The rows read:
  - `a · candidate · queued · 16m`
  - `b · candidate · running · 3m`
  - `c · candidate · queued · 16m`
  - `as33·g1 · challenger · r1 done · 2h`

  The key is the host's `candidate` letter or assignment (RQ-30). Fields drop from the right whole; a row whose key and role don't fit takes a second line.
- ARTIFACTS IN THIS TURN uses key · state, plus time when the host sends it. The kind slot is dropped until the host sends a kind, so the rows don't repeat `artifact` (E-PROTO-5 defect 7, evaluation-5 §5; RQ-30). Not `p2 protocol · 3 la…  accepted · rcpt ……`.

**Prompt:** header `ui.small` "→ steer · turn t42 running · delivers after the current tool call"; input `prose` in the text column, local-draft `edit` icon in the gutter (sage); hints `ui.small` `fg.muted` "Esc / jk leave Insert · ⏎ in Normal sends · M-⏎ follow-up". Sample input: "Also: M4 should list which credentials stay host-only now that workers get network (A006)."

**Kind-colour budget check for this screen:** steel (you), gold (references and links only, phase 5), orange (code). Three kind hues; tool tints are the state channel; syntax inside the code frame does not count.

**Tool blocks** (phase 5, defect 7): 1 px `border.strong` edge on every outcome, so the running block (`#2e2d2a`, equal to `border.subtle`) keeps a visible edge.

**References in this sample** (host spans, RQ-42): `A020` in the human and agent messages, `A021` and `M3` in the steer, `docs/spec.md §5.4` in the agent text. The prompt draft's `A006` stays plain until sent (drafts are not resolved).

## SC-04 Checkpoint review

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Outline (side) | 0 | 78 | 220 | 854 | `surface.side` | title "modules r2 · 9f3c·a1e2", nodes M0–M5 + C (rows 26: ID `mono.small`, title `ui`, class `mono.small` `fg.muted`, note mark right), REVISIONS, EXPERIMENTS |
| Document (main) | 221 | 78 | 930 | 854 | `surface.read` | gutter x 392–432 with node IDs and note bars; text x 432–980 (548; phase 6). **Breakout area: x 432–1135 (703 px)** for code, tables and diagrams. The left edge never leaves x 432, so nothing covers the gutter (phase 5) |
| Notes (side) | 1152 | 78 | 360 | 854 | `surface.side` | NOTES ON r2, CHALLENGER r2, PREVIOUS ROUND, ACTIONS. **Phase 6 (trial c, FC-K19):**<br>• NOTES ON r2 ends with a key line, `␣mn note this paragraph · c{motion} any range`.<br>• With no notes yet, its empty state reads `No notes on r2 yet` (`ui`), then that key line, then `V…c notes a selection`.<br>• Note bodies are `prose.small` 15/24 on the content bar |

- Headings: module titles are `prose.h2` (Etoile 20/28 700 with a 1 px `border.subtle` rule under them); sub-sections `prose.h3` 17/26 (phase 6) (`visual-language.md` §3.2, §4.8).
- References in the body: `A006`, `A014`–`A022` (review notes), `M2`, `§5.4`, `I11`, in gold Iosevka 500 with a solid underline. An ID-like token the host did not resolve stays prose.
- The interface line "command(envelope, ctx) → receipt · observe(scope, cursor?)" is inline code (orange chips) or a code block (`surface.code` + orange rule).
- Draft range: 2 px `state.local` gutter bar plus the `edit` icon on its first line.
- Composer: `surface.side`, radius 4, 1 px `border.strong`, 2 px left `state.local`; `prose` text; width text + 32 = 580 (x 416–996; phase 6). **Footer** (phase 6, FC-K19): `ui.small` `fg.muted` "Esc Esc done · :w saves · ␣ar sends with rework".
- **Frontmatter line** spans the text column exactly, x 432–980 (evaluation-3 §5).
- **Sticky heading band** (phase 5, defect 4): its opaque `surface.read` background spans x 237–1135, so breakout blocks and gutter IDs scrolling beneath are hidden. The heading text sits at x 432, and the 1 px `border.subtle` rule runs from x 432 to 1135.

## SC-09 Decision with readback

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Decision text (main) | 0 | 78 | 1131 | 654 | `surface.read` | gutter x 271–311 and text x 311–859 (gutter + 548 centred, as in SC-03; phase 6): question (`prose`), EVIDENCE (bullets, `prose`; references `§8.4`, `F7` in the reference style), OPTIONS (per option: number `mono.small` + **title** Etoile 15/24 700 on its own line (phase 6) + `recommended` outlined chip; **body** `prose` 15/24 below; the cursor option has the 2 px `rule.focus` bar; no diamond), YOUR ANSWER (draft with `edit` icon) |
| Context (side) | 1132 | 78 | 380 | 654 | `surface.side` | CONTEXT, RELATED, HISTORY |
| Readback | 0 | 732 | 1512 | 200 | `surface.readback` (neutral grey, **no coral fill or tint**), 2 px coral top, shadow level 3 | title row: coral diamond 16 + "DECIDE" `ui.strong` in `fg` + path `ui`; grid of field names `ui.label` (96 px) and values (BINDS in `mono`). The ANSWER row reads "option 1 · Accept the current dispositions · note, 1 line", pluralised by count; E-PROTO-3 showed "1 lines" (FC-Q21). Then the key-chip row, and "pinned 14:03:12 at Q1, option 1" in `mono.small` at the right |

**Phase 5 on SC-09:**
- **Target in view** (challenge 10). When the readback opens, the decision pane scrolls so the pinned option, title and body, sits fully above y 732. With the cursor on option 2, option 2's whole body is visible above the float; E-PROTO-4 hid it after its first line.
- **BINDS** lists every field of the host's `Basis.fields` in the host's order, known or not (challenge 4). For `recordDecision` the fake host sends question, evidence refs and policy. For `approveCheckpoint` it must add decisions and the policy binding (spec r2 §5.3).
- **Stale rows** read `annotations v4 not yet acknowledged · d shows it` (challenge 3).
- **The note** under YOUR ANSWER is a local draft until `␣ad y`. The echo says `local draft · sent with ␣ad`, never `:w` (challenge 13).

Options as the phase-3 fake host sends them (`{n, title, body, recommended}`, ledger text): 1 "Accept the current dispositions" (recommended) / "One identity, an Output over both is a definition error, a reduction over one aliased Axis is unsupported. This needs no code change. …"; 2 "Forbid aliasing"; 3 "Define the semantics". The title and body are no longer joined (evaluation-2 §5). **Readback fill:** the tldraw frame drew it coral-tinted. The user wants it grey: `surface.readback` (`#252422` / `#2c2b28` / `#ddd0b8`), keeping only the coral top rule and the coral diamond (`visual-language.md` §5.4). Host values in this screen: the CONTEXT line reads "blocker F16 HARD · downstream 4 · 25 in all". The readback's EFFECT is host-written (RQ-06); with the graph it would say "unblocks 25 downstream slices", not 34.

## SC-12 which-key

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| which-key (`␣a`) | 0 | 812 | 1512 | 120 | `surface.side`, top 1 px `border.strong`, shadow level 2 | header row 28: chip `␣a` + "AUTHORIZE" `ui.label` + **one** sentence `ui.small`: "every command reads back its exact basis before it binds; confirm with y". Then rows of key chip + diamond outline (`fg.alt`) + `ui` label: a approve emission · r request rework · d answer decision · s confirm task shape · c accept intake / Contract · x cancel assignment. **No footer sentence** (evaluation-2 §4) |

## SC-14 Diagram states (inside SC-04's document pane)

**Figure width (phase 5)** runs from the text column's left edge to the pane's right content edge, so diagrams follow the code and table rule and never cover the gutter (defect 8):
- SC-04: x 432–1135 = **703 px** (phase 6; phase 5 had 721; phase 4 drew 898, centred over the gutter).
- SC-15's single pane: text column x 502–1050, so figures run x 502–1496, **994 px** (phase 6; phase 4: 1,480).

Phase 4 dropped the 960 px cap. Diagrams render in the client (Pele in QuickJS, RQ-40 withdrawn). The labels are now Iosevka Etoile, with Pele measuring through an Etoile `measurer`. **The widths below were measured with Plex Sans and must be re-measured** (`stack.md` §5). Widths below are E-MERMAID's measured natural widths at Pele `fontSize: 17` (`results/matrix.csv`, `pele-quickjs-fs17+strip`). Scales are derived from them.

| State | Example | Frame | Contents |
|---|---|---|---|
| Natural size | Fig. 8, sequence, 668 px (Plex-measured at `fontSize` 17; smaller at 16) | left-aligned at x 432 (x 432–1100), `surface.code`, `radius.1`, padding 12 | the diagram at natural size; caption `ui.small` "Figure 8 · sequence" and a `␣tm source` chip under it |
| Scaled to fit | a figure up to 703 / 0.92 = 764 px with 13 px fragment labels, or 703 / 0.86 = 818 px with 14 px edge labels (Pele `fontSize` 16, phase 6) | full figure width (x 432–1135) | as above; the caption adds `mono.small` "92 %" |
| Wider than view | Fig. 10, state, 1,335 px at `fontSize` 17 (about 1,256 at 16, estimated) → would need about 0.56 (14 px labels → 7.8 px) | x 432–1135, h 96 | 20 px `diagram` icon; caption "Figure 10 · state diagram · 1,335 px natural"; `ui.small` `fg.muted` "labels would be 10 px here · 8 states · 12 transitions"; chip `⏎ full view` |
| Full view | any | the whole content area (1512 × 902) | at natural size if it fits (all 13 figures do at 1512 px, measured); otherwise fit-to-window down to 12 px text, then pan `h j k l`; zoom `+ - =` up to 200 % |

**Trade-off (phase 5):** keeping the reading edge costs SC-04 diagram width (898 → 721 px; 703 px since phase 6), so more figures show "wider than view" inline and open with `⏎`. E-PROTO-4 measured Etoile widths 0.99–1.14× the Plex ones with the mermaid.js stand-in. The counts per state wait for Pele with the Etoile measurer (`visual-language.md` §11, defect 9).

## SC-10h Host restored (phase 5, challenge 1; copy rewritten in phase 7)

Two states in sequence, from spec r2 §5.3.1 (`screens.md` SC-10h, FC-W12, FC-L12, FC-M31).

**Copy rules** (evaluation-5 §2):
- plain words, with no internal terms such as epoch, deduplication or cutoff;
- every line within the text column (548 px);
- the message said **once**, in the notice under the strip, and never repeated in the echo line. The echo shows only the key hint.

| State | Region | Contents |
|---|---|---|
| **1. Not paired** | bufferline right | stale mark + "homeserver · restored · pair this device again" (`fg`), a 16 px gap and rule, then "last seq 18402" (`mono.small`) |
| | notice (text column, `ui`) | "The host was restored from a backup and no longer knows this device. Ask the host's admin to pair it again. It reconnects by itself after that. Nothing on this device is lost: your 2 drafts and 1 unsent request stay here." |
| | echo | "␣rc try now" |
| | content | the last painted views stay, read-only and marked stale |
| **2. Catching up** | bufferline right | stale mark + "homeserver · catching up after a restore", gap and rule, "seq 18214" (older than the 18402 seen before, and accepted because the host was restored) |
| | notice (text column, `ui`) | "The host was restored from a backup, so recent changes may be missing. It is catching up. Until it finishes you can read and draft, but not save or decide." It clears when the host is active again |
| | outbox (`␣ru`, the SC-10c float, rows within the measure) | "[?] request rework · modules r2 · sent 14:09:30", then "This request may or may not have reached the host before the restore. It can't be sent again as it was. When the host is ready, open modules r2 and ask again if you still need to." `␣rt` is disabled; `␣rq` asks the host |
| | authority and write keys | echo "Saving and deciding are paused while the host catches up". No readback opens |

## SC-16 Slice explorer (new)

Not workflow-scoped: no strip; content y 30–932.

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Sidebar (side) | 0 | 30 | 280 | 902 | `surface.side` | tabs, scope tree, saved filters, state filter. **Narrow windows** (phase 5, defect 11): minimum 240 px. Below 280 the inactive tabs show their icons only. Below 1100 px of window the preview drops first; the sidebar never goes below 240, and the list shrinks by its column-drop rules instead |
| Separator | 280 | 30 | 1 | 902 | `border.strong` | — |
| Slice list (main) | 281 | 30 | 750 | 902 | `surface.read` | header, captions, grouped rows |
| Separator | 1031 | 30 | 1 | 902 | `border.strong` | — |
| Preview (side) | 1032 | 30 | 480 | 902 | `surface.side` | the SC-02 handover card for the cursor slice |

**Sidebar** (x 0–280; padding 16):

| Part | y | h | Contents |
|---|---|---|---|
| Tabs | 30 | 32 | **Slices** (`tree-view--alt` 16 + `ui`; active: `fg` + 2 px `rule.focus` underline) · Proposals (`document`) · Agents (`bot`) in `fg.muted`. Bottom 1 px `border.subtle`. `gt`/`gT` |
| SCOPE caption | 62 | 24 | `ui.label` "SCOPE" + `ui.small` `fg.muted` "counts match the filter" |
| Scope tree | 86 | 462 (scrolls) | Rows 26: indent 16 per level; 12 px caret; label `ui` (projects too: bold now means only "unseen", challenge 15; the indent shows the level); count `mono.small` right-aligned at x 264.<br>• **Phase 4 (FC-Q18):** a proposal row is **40 px**: the name line (26) gets the full width up to the count, so names never truncate for the strip. The small-multiple strip takes its own 14 px line under the name: 12 px icons at a 14 px pitch from the name's x (64) to x 264, so 14 glyphs when they all fit, else 13 and then "+N" in `mono.small`.<br>• Total height: 6 single rows × 26 + 7 proposal rows × 40 = 436 px, within the 462 px region.<br>• Widest names in Etoile 13 px (measured): reduce-test-runtime 143 px, fast-full-test-suite 137 px, native-evaluation 121 px. Each fits the 168 px name width at indent level 2 (x 64 to the count's 24 px column at x 240–264, less `space.3`). Rows (host values, RQ-41; glyphs in the host's dependency order): All open **3** (scope cursor) · skills 1 · design-workflow ✓·✓✓### 0 · reduce-test-runtime ◆ 1 · fast-full-test-suite ✓✓×✓✓✓✓✓ 0 · lnkr 1 · gathering ▸✓✓✓ 1 · multi-tenant ✓·## 0 · minos 1 · native-engine (43 slices: 13 glyphs on the strip line, then "+30") 1 · native-evaluation (35: 13 glyphs, then "+22") 0 · render — · render-host "design" — |
| Divider | 552 | 1 | `border.subtle` |
| SAVED | 556 | 24 + 26 | caption `ui.label`; row "review-queue" `ui` + "2 states" `ui.small` `fg.muted` (device-local; `:filter save`) |
| STATES caption | 612 | 24 | `ui.label` "STATES" + `ui.small` `fg.muted` "counts in scope" |
| State rows | 636 | 10 × 26 = 260 | `checkbox` / `checkbox--checked` 16 at x 16; state icon 16 at x 40 in **`fg.alt`** (a control, not a live state: no coral, F6); label `ui` at x 64; count `mono.small` right-aligned at x 264. Rows, the host's counts: ☑ needs human 2 · ☐ failed 1 · ☐ unknown 0 · ☑ awaiting review 1 · ☐ implementing 1 · ☐ rework 1 · ☐ waiting on dependency 63 · ☐ ready 3 · ☐ merged 26 · ☐ superseded 4. The first eight states are `open: true` in the host's vocabulary; their sum is 72. Failed and implementing are the two fixture slices (`specify-rsps-profile`, `specify-cma-profiles`) that the ledger records as merged. The order and labels come from the host vocabulary, not from the client |
| Hint | 900 | 20 | `ui.small` `fg.muted` "x toggle · X only · :filter" |

**Slice list** (x 281–1031; padding 16):

| Part | y | h | Contents |
|---|---|---|---|
| Title row | 30 | 32 | `ui.title` "Slices · all open" + `ui` `fg.muted` "3 of 72"; right: `ui.small` `fg.muted` "dependency order" |
| Filter chips | 62 | 24 | outlined chips (1 px `border.strong`, radius 2, padding 2 / 6): diamond 12 `fg.alt` + "needs human" `ui.small` + `close` 12 · `play--filled--alt` 12 + "awaiting review" + `close` 12 · then `ui.small` `fg.muted` "saved: review-queue" |
| Column captions | 94 | 24 | `ui.label`: SLICE (x 321), STATUS (x 621), WAITING (right at x 927, 60 wide), DOWNSTREAM (right at x 1019, 84 wide). Captions size their columns (CAPTION check) |
| Group header | 118 | 26 | `ui.label` "SKILLS · REDUCE-TEST-RUNTIME" + count `mono.small` |
| Rows | — | 26 | the queue's anatomy: state icon 16 at x 297 (state colours; coral diamond for needs-you); slice `ui` x 321–613 (path truncation; the group header supplies project and proposal); status `ui` `fg.alt` x 621–867; waiting `mono.small` right at x 927; downstream `mono.small` right at x 1019 |
| Sample | — | — | SKILLS · REDUCE-TEST-RUNTIME 1: ◆ simplify-adapter-launch-tests · direction · held by you · 8d 5h · 0. LNKR · GATHERING 1: ▸ auto-tag-bookmarks · awaiting review · watchdog r1 · 12m · 0. MINOS · NATIVE-ENGINE 1: ◆ execute-symbolic-calls · decide Q1 · aliased callee Axes · 2d 4h · 25 (**cursor row**). Widening to `ready` adds evaluate-exact-sum-with-demand (minos native-engine, 23), integrate-fast-full-test-suite (skills design-workflow, 3) and administer-users (lnkr multi-tenant, 2) |
| Footer | after the rows | 24 | `ui.small` `fg.muted` "69 open slices hidden by the filter · x in STATES widens it · ]g next group" |

**Preview** (x 1048–1496): the SC-02 card for `execute-symbolic-calls`, plus two lines: CONTRACT "B1–B5 A1–A6 · 0 manual" and LATEST "implement r1 · needs_human · 10-25 09:52 · F12–F17" (the host's `lastFact`). Meta: "rework 1/2 · downstream 4 · 25 in all".

**Statusline and echo** (phase 4, FC-Q21): the statusline carries "filter: needs human + awaiting review · 3 of 72". The echo line shows only transient messages ("filter saved on this device"), never the filter text a second time.

**Empty state** (scope `minos / native-evaluation`, filter awaiting review; title "0 of 33" open; its STATES counts are failed 1, implementing 1, waiting on dependency 31, merged 1, superseded 1). In the list area, centred at x 656, y ~200:
- a 20 px `filter` icon in `fg.muted`;
- `ui` "No slice in minos / native-evaluation is awaiting review.";
- `ui.small` `fg.muted` "1 matches elsewhere: lnkr gathering/auto-tag-bookmarks";
- chips `⏎ widen to All open` and `x change the filter`;
- `ui.small` "2 slices need you in other scopes".

The preview pane shows nothing; the bufferline keeps ◆3.

**Calm state** (nothing needs you): no coral anywhere; the needs-human filter row shows 0 in `fg.muted`; with no state selected the list shows every state the host marks `open: true`.

**Agents tab** (`␣oa`). The main list's first group header reads `EXECUTING · 4 · slots 4/4`: rows first, slots named (phase 6, FC-M36).
- Scope tree: All / projects.
- States: executing · on the host (operator) · held · queued · quarantined · canceled.
- Main list: the SC-08 columns, dropping lowest priority first to fit 750 px: icon, slot, assignment `mono`, workflow (path), role, state, since. Model and last activity move to the preview.
- Preview: the assignment detail, including the lifecycle list (`mono.small` times + `ui` events + 12 px icons).

**Proposals tab:**
- Main list rows: proposal `ui` (regular, challenge 15), slice small multiples (12 px), counts (diamond / failed / running) in `mono.small`, next action `ui` `fg.alt`.
- Design workflows (`render-host`) show their phase strip "Ground ✓ Seams ✓ Modules ◆ Proposal · Record ·".
- Preview: the proposal card (phases, canonical and published heads, merge readiness).
