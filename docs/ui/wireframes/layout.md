# Wireframes: pixel layout spec at 1512 × 982

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). File names in code spans are relative to `docs/ui/`. Measured, proposed and pending claims are separated in [`../evidence.md`](../evidence.md).

This is the normative pixel layout. Coordinates are logical px in a maximised window on a 14″ MacBook Pro: 1512 × 982 (origin top-left; x, y, w, h). Tokens refer to `reference/visual-language.md`; type tokens to §3.2; surfaces to §5.1. Sample content comes from the fixtures in `text-mocks.md`; fixture-only values are marked *(fixture)*.

Layout values are **proposed**. The renderer computes `measure.prose` at startup (`reference/visual-language.md` §4.1). It is **measured** at **548 px** for Iosevka Etoile at 15 px, with CoreText on the bundled face, and Iosevka's advance at exactly 0.5 em. Text columns below are drawn at 548 + the 40 px gutter = 588.

**Applies everywhere:**
- Prose is 15/24. All chrome is Iosevka Etoile; numeric columns are Iosevka `mono.small`.
- No per-message author rule. All message text starts on the text column's left edge; the human message keeps its steel band.
- NEEDS YOU counts decisions and acts only you take. Operator rows are their own group, ON THE HOST. RUNNING shows rows and slots apart.
- The failed mark is a filled octagon (`stop-sign--filled`).
- No field is a bare dash. A dash stays only as a value in numeric columns.
- The bufferline's right end carries the **host segment** (`reference/visual-language.md` §2.2).
- Wide blocks **grow right from the text column's left edge** and never cover the gutter; a clipped edge shows a 32 px fade, a 2 px edge rule and a 16 px caret, then scrolls (`reference/visual-language.md` §4.3).
- The coordinator's name is neutral.
- Side-pane content is `prose.small` 15/24 with a 2 px content bar.
- Side-pane list rows are structured (key · role · state · time).
- A key printed as an invitation is a chip that resolves where it is printed. Key lines drop whole parts from the end, and nothing wraps (`reference/grammar.md` §18).

## 0. Frame (every screen)

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Bufferline | 0 | 0 | 1512 | 30 | `surface.bar`, bottom 1 px `border.subtle` | Left from x 8: view tabs, each `space.3` padding + 16 px view icon + 4 + `ui` label. Active tab in `fg` with a 2 px `rule.focus` underline at y 28; others `fg.muted`. Right-aligned to x 1504: attention counts (coral diamond 12 + `mono.small` "3", `stop-sign--filled` rose 12 + "1", `help` mauve 12 + "1"), each only when non-zero; gap 12; **host segment**: `connection-signal` 16 + "homeserver" `ui` + "protected to seq 18340 (2 m)" `ui.small` `fg.muted`. When not calm: the stale mark + `fg` words, per `hostMode` "not accepting changes", "catching up after a restore" or "blocked on the host", otherwise e.g. "unprotected since seq 18340 · 7 m". `K` on the segment shows the target, the protection and restore verification. The bufferline prints no ledger seq and no time |
| Handover strip (workflow views only) | 0 | 30 | 1512 | 48 | `surface.bar`, bottom `border.subtle` | Five columns of 302 px separated by 1 px `border.subtle`. Padding 16 left; label `ui.label` `fg.muted` at y +8; value `ui` `fg` at y +26. Each value has **240 px with an icon or mark, 262 px without** (137/159 at 1000, 97/119 at 800) and drops whole parts down its ladder (`spec.md` §2.1). COMMITMENT leads with the `user` or `bot` icon. NEXT: coral diamond 12 only if a decision is due now, text, key chips right-aligned: the authority keys at the NEXT target, `␣n` everywhere else. No value is a bare dash (FC-R08): OWNER `no owner · waits for a slot`, EVIDENCE `none yet`, BLOCKER `none` or the wait class (`slot 4/4 busy`), NEXT `nothing for you yet` |
| Content | 0 | 30 (78 with strip) | 1512 | 902 (854) | per screen | — |
| Statusline | 0 | 932 | 1512 | 24 | `surface.bar`, top `border.subtle` | Mode badge (outlined chip, `mono.small` uppercase, 6 px padding; Insert border `state.local`, Readback border `state.attn`, else `border.strong`); breadcrumb `ui`; SAVE (`edit` 16 + text); right, in `mono.small`: seq, the read-basis token on workflow views (`basis r2 v3 pol3`; with a change not yet acknowledged, `basis r2 v3→v4 [!] pol3 ]d`, with `]d` a chip that an open readback omits), position. When the view isn't live: `seq 18350 · as of 14:05:31`. **Drop order:** position → SAVE label → the breadcrumb truncates from the left. Mode and seq never drop |
| Echo | 0 | 956 | 1512 | 26 | `surface.side` | `ui` message at x 16, or the command line in `mono` |

**Surface rule:** each screen's main pane is `surface.read` and every other pane is `surface.side`. In dark and Soft the main pane is the darker one; in Light it is the lighter one (`reference/visual-language.md` §5.1).

**Host time** appears only where freshness is claimed: `seq N · as of T` when not live, the readback's STATE line, stale and offline notices, and `K` on the seq.

## SC-02 Needs-me queue

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Queue list (main) | 0 | 30 | 992 | 902 | `surface.read` | groups and rows, below |
| Separator | 992 | 30 | 1 | 902 | `border.strong` | — |
| Card (side) | 993 | 30 | 519 | 902 | `surface.side` | the handover card, padding 16 |

**Under a 1180 px pane** the card sits below the list, so rows keep their width and widths degrade monotonically.

**List columns** (row height 26, group header 24 with 24 above):

| Column | x | w | Type | Sample |
|---|---|---|---|---|
| state icon | 16 | 16 | icon | coral diamond / `stop-sign--filled` / `hourglass` / `help` / `play--filled--alt` / `checkmark` |
| project | 40 | 72 | `ui.small` `fg.muted` | `minos` |
| item | 120 | 372 | `ui` `fg`, path truncation | `native-engine/execute-symbolic-calls` |
| reason | 500 | 328 | `ui` `fg.alt`, truncating at its end; persistent state words lead | `decide Q1 · aliased callee Axes` |
| waiting | 832 | 60 | `mono.small`, right-aligned | `2d 4h` |
| downstream | 896 | 84 | `mono.small`, right-aligned; the host's `downstream.transitive` | `25` |

**Sample rows** (direct / transitive downstream in brackets):
- NEEDS YOU · 3 (decisions and acts only you take; the same 3 as the bufferline ◆; FC-M35):
  - skills `reduce-test-runtime/simplify-adapter-launch-tests` · direction · held by you · 8d 5h · 0
  - minos `native-engine/execute-symbolic-calls` · decide Q1 · 2d 4h · 25 [4 / 25] (**cursor row**: `surface.cursor.read` + 2 px `rule.focus` bar at x 0)
  - render `render-host` · review checkpoint · 6m · —

  The main merge is a row here: minos `native-engine` · merge main · on the forge · 2m · — *(package fixture)*.
- ON THE HOST · 1 (operator remedies, directly under NEEDS YOU; the bufferline's ✗1):
  - minos `native-evaluation/specify-rsps-profile` · operator · as38 quarantined · 52m · 4 [2 / 4] *(fixture)*. Rose `stop-sign--filled` octagon, **no diamond**.
- WAITING · NOT ON YOU · 6, **oldest first**: work-router 4d · 2, checkpoint-engine 4d · 1, design-playbook 4d · 0, evaluate-exact-sum-with-demand 41m · 23 [3 / 23], render-host `duplicate risk · effect · forge reply lost · op9 reconciling` 23m · —, render-cli `delegated (s3) · agent decides` 15m · — *(fixture)*. A delegated reason drops `· agent decides` first and then `(s3)`; `delegated` stays whole.
- RUNNING · 4 · slots 4/4 (rows first, slots named; they differ while a cancelled assignment holds its slot through the 30 s grace, FC-M36): execute-causal-scan `implementer as19·g3 · pass 2` 41m · 23 [3 / 23], auto-tag-bookmarks 12m · 0, specify-cma-profiles `implementer as45·g1 · pass 1` 8m · 29 [8 / 29], p2 candidate b 3m · —.
- DONE · LAST 24H: `integrated into proposal`, `merged main (observed)`, `merged main (observed) · merged source differs from reviewed R7`, `modules r1 · advanced · delegated (s3)`.

**Card** (x 1009–1496):

| Element | y (from 30) | Contents |
|---|---|---|
| Title | 16 | `ui.title` "Execute symbolic Calls"; path `ui.small` `fg.muted` "minos / native-engine / execute-symbolic-calls · waiting 2d 4h" |
| Facts | 64–196 | label column 96 px (`ui.label`), values `ui` in their full forms: COMMITMENT (2 lines) · OWNER · EVIDENCE · BLOCKER · NEXT (coral diamond + "answer Q1 · 3 options" + chip `␣n`). The chip is `␣n` because the queue is not the NEXT target. No recommendation in NEXT; it is the coordinator's, not the system's |
| Meta | 204 | `ui.small` `fg.muted` "reviews 1 of 2 · downstream 4 · 25 in all · since 10-25 09:52" |
| QUESTION | 236 | caption `ui.label`; question in `prose.small` (Etoile 15/24) on a content lane with a 2 px `border.strong` left bar (x 1009), text from x 1021, max width 475; then `ui.small` `fg.muted` "coordinator recommends 1" |
| Options | +12 | three lines with the option titles only (`{n, title}`): "1 Accept the current dispositions", "2 Forbid aliasing", "3 Define the semantics"; `prose.small`; number in `mono.small`; "recommended" outlined chip |
| ACTIONS | +24 | caption; two columns of key chip + `ui` label. The row's own actions only: `⏎ open decision`, local keys, `␣ax ◆ cancel work` |
| Below | rest | empty (about 300 px free) |

**A delegated request's card** adds one line after the facts: the host's sentence "notes you save must be answered before it advances" (`ui`), then the chip `␣ax` and "cancels the request".

**The main merge's card** replaces QUESTION with READINESS: `ui.label` caption, then ELIGIBLE, PUBLISHED, PROMOTION and ON THE FORGE, one labelled field each (SC-16). Its BLOCKER reads `none · 1 uncertainty`, and ACTIONS holds `⏎ open package`.

**Statusline:** mode, `queue › NEEDS YOU › 2 of 3`, seq, position. The group counts appear on the headers and in the bufferline, nowhere else.

## SC-03 Chat (tool-call blocks, authors, human band)

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Transcript (main) | 0 | 78 | 1171 | 742 | `surface.read` | message stream |
| Prompt | 0 | 820 | 1171 | 112 | `surface.bar`, top `border.subtle` | header 24 + 2 lines × 26 + hints 20 + padding 16 |
| Separator | 1171 | 78 | 1 | 854 | `border.strong` | — |
| Info pane (side) | 1172 | 78 | 340 | 854 | `surface.side` | CONVERSATION, STEERING QUEUE, ARTIFACTS IN THIS TURN, OTHER CONVERSATIONS, OUTLINE |

**Text column** (centred in the transcript): gutter x 291–331 (40), text x 331–879 (548). **Blocks** grow right from x 331 up to x 1155 (824).

| Block | Geometry | Tokens | Sample |
|---|---|---|---|
| Message header band | h 20, gutter + text | role icon 16 in the gutter in the role's kind colour; name `ui.strong` in the kind colour (the host's display label: role class `human` shows as "you"); meta `ui.small` `fg.muted` | **you** (steel) "laptop · 18:41 · rcpt …f07d"; **coordinator** (`fg`, neutral; icon `fg.alt`) "opus-5.5 · as27·g1 · turn t42 · 13:52" |
| Human message | band x 287–883 behind header and body, radius 2, padding 8 / 12. **No author rule**; the body text starts at x 331 like every message | `tint.human` behind header and body; body `prose` 15/24 | "A020 needs a real comparison of storage, not the SQLite default. Keep one authoritative host and say what each option costs." (`A020` is a host-resolved reference: gold Iosevka 500 with a solid underline, `reference/visual-language.md` §5.9) |
| Agent message | no band and **no rule**; text from x 331. Provenance is the header band: role icon in the gutter, name, model, assignment, time (`reference/visual-language.md` §10.5) | body `prose` | "I'll answer A020 with an experiment rather than argument. Protocol p2 compares three layouts…" with a numbered list |
| Tool call, collapsed | x 331–879, h 28, radius 2, 1 px `border.strong` | **no icon; the gutter stays empty**.<br>• Tool name `mono` `fg` at x 343, then arguments `mono` `fg.alt`, truncated before the outcome column.<br>• **Outcome column** x 651–867 (216 px, fixed): the outcome word **starts** at x 651, then ` · detail · duration` in `mono.small`. Every word in the transcript sits at x 651.<br>• Background by outcome (`reference/visual-language.md` §5.5): ok `#212615`, failed `#321f1e`, unknown `#2a2226`, running `#2e2d2a` in Ember | `read_artifact docs/spec.md §5.4` · "ok · 6.1 KB · 0.2 s" (`fg.alt`) on `tint.tool.ok` |
| Tool call, failed | same | `tint.tool.fail`; outcome word **bold `fg`** | `bash rg -n 'blocksCount' host/` · "**exit 1** · no matches · 0.1 s" (the outcome word bold; the host's short `status` text and the duration regular) |
| Tool call, running | same | `tint.tool.run`; elapsed time updates every 10 s | `bash mise run probe -- p2 b` · "running · 40 s" (`fg.alt`) |
| Tool call, unknown / cancelled | same | `tint.tool.unknown` with **bold** "unknown"; cancelled on `surface.side` with "cancelled" (`fg.alt`) | the p2-b worker chat's interrupted and cancelled calls |
| Web call | same, with the outcome detail `<provider> · <primary> <primary outcome> · <duration>`. **Drop order:** the duration, then the fallback provider's name; the outcome word and the primary's phrase never drop. Below a 480 px block the arguments drop first and the tool name then truncates | the primary's outcome in bold `fg`: `failed` for a classified failure, `timed out` for a per-attempt timeout | `web_search "aliased callee axes"` · "ok · Tavily · **Exa failed** · 2.4 s". `K` and `za` give the class: `failed: allowance`, or `timeout · outcome uncertain · may have been charged` |
| Tool call, expanded (`za`) | + output rows | output `mono` 13/20 `fg.alt` on the same tint, max 12 lines, then "… 37 more lines" `ui.small` and the chip `K` | the gate output |
| Web call, expanded (`za`) | + one row per attempt | `mono.small`: provider · observation · outcome · completeness · digest · time. A missing digest reads `none`. An expired handle adds `full result expired · the committed output above stays · a new fetch is a new observation` in `ui.small` | `Tavily  o2  ok  partial  9f2c·4e1a  09:31:00` |
| Code block in a message | its natural width, from the text column's width up to x 1155. **The left edge stays at x 331**, so the maximum width is 824 px. Still wider: horizontal scroll, with each clipped edge showing a 32 px fade, a 2 px `fg.muted` edge rule and a 16 px `caret--right` at the visible block's vertical middle. Radius 2, padding 12 × 16 (20 on top when labelled) | `surface.code`; 2 px left rule in orange; language label `ui.small` orange at top-right; `mono` 14/20 highlighted per `reference/visual-language.md` §5.10 (keywords orange bold, functions and types gold, strings olive, constants mauve, comments `fg.muted` italic) | ```` ```rust ```` reconcile snippet: `fn` `let` `match` orange bold; `reconcile` gold; `"stale_basis"` olive; `// pinned target` `fg.muted` italic |
| Inline code | inline | Iosevka 14 orange on a `surface.code` chip (padding 0 3, radius 2; one px under 15 px prose) | `observe(scope, cursor?)` |
| Gap between messages | 24 | — | — |

**Info pane:**
- STEERING QUEUE's queued steer renders in `prose.small`, clamped to 3 lines, on a content lane with the 2 px bar.
- **OTHER CONVERSATIONS uses structured rows.** The slots are key `mono.small` (x 1188, 56 px) · role `ui` (x 1252, 96 px) · state `ui` `fg.alt` (x 1356, 96 px) · time `mono.small`, right-aligned at x 1496. The rows read:
  - `a · candidate · queued · 16m`
  - `b · candidate · running · 3m`
  - `c · candidate · queued · 16m`
  - `as33·g1 · challenger · r1 done · 2h`

  The key is the host's `candidate` letter or assignment (RQ-30). Fields drop from the right whole; a row whose key and role don't fit takes a second line.
- ARTIFACTS IN THIS TURN uses key · state, plus time when the host sends it. The kind slot is dropped until the host sends a kind, so the rows don't repeat `artifact` (RQ-30).

**Prompt:** header `ui.small` "→ steer · turn t42 running · delivers after the current tool call"; input `prose` in the text column, local-draft `edit` icon in the gutter (sage); hints `ui.small` `fg.muted` "Esc / jk leave Insert · ⏎ in Normal sends · M-⏎ follow-up". Sample input: "Also: M4 should list which credentials stay host-only now that workers get network (A006)."

**Kind-colour budget check for this screen:** steel (you), gold (references and links only), orange (code). Three kind hues; tool tints are the state channel; syntax inside the code frame does not count.

**References in this sample** (from the host's index, RQ-42): `A020` in the human and agent messages, `A021` and `M3` in the steer, `docs/spec.md §5.4` in the agent text. The prompt draft's `A006` stays plain until sent (drafts are not resolved).

## SC-04 Checkpoint review

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Outline (side) | 0 | 78 | 220 | 854 | `surface.side` | header, then nodes M0–M5 + C, REVISIONS, EXPERIMENTS. **Rows 26, grid ID · title · notes:** ID `mono.small`; title `ui`, 125 px less any note; note mark right. A cut title ends in `…`; `]n` reaches its node, whose heading shows it whole. No class mark and no legend |
| Document (main) | 221 | 78 | 930 | 854 | `surface.read` | gutter x 392–432 with node IDs and note bars; text x 432–980 (548). **Blocks grow right to x 1135 (703 px)**. The left edge never leaves x 432, so nothing covers the gutter |
| Notes (side) | 1152 | 78 | 360 | 854 | `surface.side` | NOTES ON r2, CHALLENGER r2, PREVIOUS ROUND, ACTIONS.<br>• NOTES ON r2 ends with a key line, `␣mn note this paragraph · c{motion} any range`.<br>• With no notes yet, its empty state reads `No notes on r2 yet` (`ui`), then that key line, then `V…c notes a selection`.<br>• Note bodies are `prose.small` 15/24 on the content bar |

- **Outline header** (x 16–204): `ui.strong` "modules r2 · 9f3c·a1e2"; `ui.small` `fg.muted` emission time and author; then whose decision it is, from the request's capture, `ui.small`: "your review · captured s2", or "delegated (s3) · agent decides" with the `bot` icon in `fg.alt`, followed by the host's sentence "notes you save must be answered before it advances" and the chip `␣ax` "cancels the request". `K` shows the agreed scope reference. A settings change never changes this line.
- **Node class** (`observable`, `judgment`, `product`) is a word on the node's heading row, at the right end of the heading rule, `ui.small` `fg.muted`, right-aligned at x 980. It is client chrome from the manifest, and the heading text wraps before it. The sticky band repeats it. The statusline breadcrumb's tail also names it for the cursor's node (`… › r2 › M4 · observable`), and a `K` peek on a reference to a node lists it.
- Headings: module titles are `prose.h2` (Etoile 20/28 700 with a 1 px `border.subtle` rule under them); sub-sections `prose.h3` 17/26 (`reference/visual-language.md` §3.2, §4.8).
- References in the body: `A006`, `A014`–`A022` (review notes), `M2`, `§5.4`, `I11`, in gold Iosevka 500 with a solid underline. An ID-like token the host did not resolve stays prose.
- The interface line "command(envelope, ctx) → receipt · observe(scope, cursor?)" is inline code (orange chips) or a code block (`surface.code` + orange rule).
- Draft range: 2 px `state.local` gutter bar plus the `edit` icon on its first line.
- Composer: `surface.side`, radius 4, 1 px `border.strong`, 2 px left `state.local`; `prose` text; width text + 32 = 580 (x 416–996). **Footer** (FC-K19): `ui.small` `fg.muted` "Esc Esc done · :w saves · ␣ar sends with rework".
- **Frontmatter line** spans the text column exactly, x 432–980: `frontmatter · 6 fields`, then the chip `za` `expands`.
- **Sticky heading band:** its opaque `surface.read` background spans x 237–1135, so blocks and gutter IDs scrolling beneath are hidden. The heading text sits at x 432, and the 1 px `border.subtle` rule runs from x 432 to 1135.

## SC-07 Evidence and receipts

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Evidence body (main) | 0 | 78 | 1131 | 854 | `surface.read` | PASS block, OBLIGATIONS, GATE RECEIPT, CATALOG, WEB PASSAGE, advisory line, RANK, LIMITATIONS |
| Separator | 1131 | 78 | 1 | 854 | `border.strong` | — |
| Side (side) | 1132 | 78 | 380 | 854 | `surface.side` | FINDINGS, REPORTS, INTEGRATION. At 800 px this column sits under the main column |

**PASS block** (x 40–1115, first in the main pane):
- Title row: `ui.label` "PASS 2", then `ui.small` `fg.muted` "opened by Watchdog r1 rework · Audit done".
- Four rows of 32: label `ui.label` x 40 (136 px); digest `mono.small` x 176; text `ui` `fg.alt` x 256. Labels are AUDIT EXAMINED, SUBMITTED, PREPARED, WATCHDOG.
- `reviews 1 of 2` is `ui` right-aligned at x 1115 on the Watchdog row. The Audit row carries no staleness word or mark, ever.

**Reports** (side pane): `pass 2 current`, then `pass 1 historical`, each a `ui` header; rows 26 under them. A historical pass collapses to its header and its Watchdog rounds, each with its verdict and a counted mark.

**Web passage** (main pane): caption `ui.label` "WEB PASSAGE" + `ui.small` "retained for F16"; chrome row `ui.small`: `partial · Tavily · obs o2 · 10-25 09:31 · 9f2c·4e1a`; `URL → final URL` `ui.small` `fg.muted`; then the passage as content, `prose.small` on the content bar.

## SC-09 Decision with readback

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Decision text (main) | 0 | 78 | 1131 | 654 | `surface.read` | gutter x 271–311 and text x 311–859 (gutter + 548 centred, as in SC-03): question (`prose`), EVIDENCE (bullets, `prose`; references `§8.4`, `F7` in the reference style), OPTIONS (per option: number `mono.small` + **title** Etoile 15/24 700 on its own line + `recommended` outlined chip; **body** `prose` 15/24 below; the cursor option has the 2 px `rule.focus` bar; no diamond), YOUR ANSWER (draft with `edit` icon) |
| Context (side) | 1132 | 78 | 380 | 654 | `surface.side` | CONTEXT, RELATED, HISTORY |
| Readback | 0 | 732 | 1512 | 200, growing to fit, up to 40 % of the window | `surface.readback` (neutral grey, **no coral fill or tint**), 2 px coral top, shadow level 3 | title row: coral diamond 16 + "DECIDE" `ui.strong` in `fg` + path `ui`; grid of field names `ui.label` (96 px) and values (BINDS in `mono`, wrapped in one block). The ANSWER row reads "option 1 · Accept the current dispositions · note, 1 line", pluralised by count (FC-Q21). Then the key-chip row, and "pinned 14:03:12 at Q1, option 1" in `mono.small` at the right |

- **Target in view** (FC-T19). When the readback opens, the decision pane scrolls so the pinned option, title and body, sits fully above the float. With the cursor on option 2, option 2's whole body is visible above it.
- **BINDS** lists every field of the host's `Basis.fields` in the host's order, known or not. A missing value reads `none`, never a dash. For `recordDecision` that is question, evidence refs and policy. For `approveCheckpoint` it is `request C2 · captured s2 · human`, emission, manifest, annotations, decisions, intake, policy and binding (S§5.3 L400).
- **Stale rows** read `annotations v4 not yet acknowledged · d shows it`, with `d` a chip; the key bar reads `confirm disabled`.
- **Modal:** while the readback is open, chips outside it draw dimmed (`fg.muted`) and do nothing.
- **The note** under YOUR ANSWER is a local draft until the answer is sent. The header and the echo say `local draft · sent with your answer`, with no key.
- **Recovery decisions** use this view: the header names the operation, the context column holds its facts, and BINDS includes the observations.

Options as the host sends them (`{n, title, body, recommended}`): 1 "Accept the current dispositions" (recommended) / "One identity, an Output over both is a definition error, a reduction over one aliased Axis is unsupported. This needs no code change. …"; 2 "Forbid aliasing"; 3 "Define the semantics". **Readback fill:** `surface.readback` (`#252422` / `#2c2b28` / `#ddd0b8`), keeping only the coral top rule and the coral diamond (`reference/visual-language.md` §5.4). Host values in this screen: the CONTEXT line reads "blocker F16 HARD · downstream 4 · 25 in all". The readback's EFFECT is host-written (RQ-06); here it would say "unblocks 25 downstream slices".

## SC-12 which-key

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| which-key (`␣a`) | 0 | 812 | 1512 | 120 | `surface.side`, top 1 px `border.strong`, shadow level 2 | header row 28: chip `␣a` + "AUTHORIZE" `ui.label` + **one** sentence `ui.small`: "every command reads back its exact basis before it binds". Then rows of key chip + diamond outline (`fg.alt`) + `ui` label: a approve emission · r request rework · d answer decision · s confirm task shape · c accept intake / Contract · t checkpoint routing · p review policy: save / adopt · x cancel work. **No footer** |
| which-key (root) | 0 | as tall as its rows | 1512 | up to 12 rows | same | the head reads "display only · decides nothing", then the chip `Esc` "closes" |

## SC-14 Diagram states (inside SC-04's document pane)

**Figure width** runs from the text column's left edge to the pane's right content edge, so diagrams follow the code and table rule and never cover the gutter:
- SC-04: x 432–1135 = **703 px**.
- SC-15's single pane: text column x 502–1050, so figures run x 502–1496, **994 px**.

Diagrams render in the client (Pele in QuickJS). The labels are Iosevka Etoile, with Pele measuring through an Etoile `measurer`. **The widths below were measured with Plex Sans at Pele `fontSize: 17` and must be re-measured** (`reference/stack.md` §5). Scales are derived from them.

| State | Example | Frame | Contents |
|---|---|---|---|
| Natural size | Fig. 8, sequence, 668 px (measured at `fontSize` 17; smaller at 16) | left-aligned at x 432 (x 432–1100), `surface.code`, `radius.1`, padding 12 | the diagram at natural size; caption `ui.small` "Figure 8 · sequence" and the chip `␣tm` "source" under it |
| Scaled to fit | a figure up to 703 / 0.92 = 764 px with 13 px fragment labels, or 703 / 0.86 = 818 px with 14 px edge labels (Pele `fontSize` 16) | full figure width (x 432–1135) | as above; the caption adds `mono.small` "92 %" |
| Wider than view | Fig. 10, state, 1,335 px at `fontSize` 17 (about 1,256 at 16, estimated) → would need about 0.56 (14 px labels → 7.8 px) | x 432–1135, h 96 | 20 px `diagram` icon; caption "Figure 10 · state diagram · 1,335 px natural"; `ui.small` `fg.muted` "labels would be 10 px here · 8 states · 12 transitions"; chip `⏎ full view` |
| Full view | any | the whole content area (1512 × 902) | at natural size if it fits (all 13 figures do at 1512 px, measured); otherwise fit-to-window down to 12 px text, then pan `h j k l`; zoom `+ - =` up to 200 % |

**Trade-off:** keeping the reading edge limits SC-04 diagrams to 703 px, so more figures show "wider than view" inline and open with `⏎`. Measured Etoile widths with the mermaid.js stand-in are 0.99–1.14× the Plex ones. The counts per state wait for Pele with the Etoile measurer (`reference/visual-language.md` §11).

## SC-10h Host restored

Two states in sequence, from S§5.3.1 L503–509 (`text-mocks.md` SC-10h, FC-W12, FC-L12, FC-M31).

**Copy rules:**
- plain words, with no internal terms such as epoch, deduplication or cutoff;
- every line within the text column (548 px);
- the message said **once**, in the notice under the strip, and never repeated in the echo line. The echo shows only the key hint.

| State | Region | Contents |
|---|---|---|
| **1. Not paired** | bufferline right | stale mark + "homeserver · restored · pair this device again" (`fg`) |
| | statusline right | `seq 18402 · as of 14:20:05` |
| | notice (text column, `ui`) | "The host was restored from a backup and no longer knows this device. Ask the host's admin to pair it again. It reconnects by itself after that. Nothing on this device is lost: your 2 drafts and 1 unsent request stay here." |
| | echo | the chip `␣rc`, then "try now" |
| | content | the last painted views stay frozen and marked stale |
| **2. Catching up** | bufferline right | stale mark + "homeserver · catching up after a restore" |
| | statusline right | `seq 18214 · as of 14:21:40`: older than the 18402 seen before, and accepted because the host was restored |
| | notice (text column, `ui`) | "The host was restored from a backup, so recent changes may be missing. It is catching up. Until it finishes you can read and draft, but not save or decide." It clears when the host is active again |
| | outbox (`␣ru`, the SC-10c float, rows within the measure) | "[?] request rework · modules r2 · sent 14:09:30", then "This request may or may not have reached the host before the restore. It can't be sent again as it was. When the host is ready, open modules r2 and ask again if you still need to." The entry's note reads `can't be sent again after a restore`. `␣rt` is refused; `␣rq` asks the host |
| | authority and write keys | echo "Saving and deciding are paused while the host catches up". No readback opens |

## SC-16 Slice explorer

Not workflow-scoped: no strip; content y 30–932.

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Sidebar (side) | 0 | 30 | 280 | 902 | `surface.side` | tabs, scope tree, saved filters, state filter. **Narrow windows:** minimum 240 px. Below 280 the inactive tabs show their icons only. Below 1100 px of window the preview drops first; the sidebar never goes below 240, and the list shrinks by its column-drop rules instead |
| Separator | 280 | 30 | 1 | 902 | `border.strong` | — |
| Slice list (main) | 281 | 30 | 750 | 902 | `surface.read` | header, captions, grouped rows |
| Separator | 1031 | 30 | 1 | 902 | `border.strong` | — |
| Preview (side) | 1032 | 30 | 480 | 902 | `surface.side` | the SC-02 handover card for the cursor slice |

**Sidebar** (x 0–280; padding 16):

| Part | y | h | Contents |
|---|---|---|---|
| Tabs | 30 | 32 | **Slices** (`tree-view--alt` 16 + `ui`; active: `fg` + 2 px `rule.focus` underline) · Proposals (`document`) · Agents (`bot`) in `fg.muted`. Bottom 1 px `border.subtle`. `gt`/`gT` |
| SCOPE caption | 62 | 24 | `ui.label` "SCOPE" + `ui.small` `fg.muted` "counts match the filter" |
| Scope tree | 86 | 462 (scrolls) | Rows 26: indent 16 per level; 12 px caret; label `ui` (bold means only "unseen"; the indent shows the level); count `mono.small` right-aligned at x 264.<br>• A proposal row is **40 px** (FC-Q18): the name line (26) gets the full width up to the count, so names never truncate for the strip. The small-multiple strip takes its own 14 px line under the name: 12 px icons at a 14 px pitch from the name's x (64) to x 264, so 14 glyphs when they all fit, else 13 and then "+N" in `mono.small`.<br>• Total height: 6 single rows × 26 + 7 proposal rows × 40 = 436 px, within the 462 px region.<br>• Widest names in Etoile 13 px (measured): reduce-test-runtime 143 px, fast-full-test-suite 137 px, native-evaluation 121 px. Each fits the 168 px name width at indent level 2 (x 64 to the count's 24 px column at x 240–264, less `space.3`). Rows (host values, RQ-41; glyphs in the host's dependency order): All open **3** (scope cursor) · skills 1 · design-workflow ✓·✓✓### 0 · reduce-test-runtime ◆ 1 · fast-full-test-suite ✓✓×✓✓✓✓✓ 0 · lnkr 1 · gathering ▸✓✓✓ 1 · multi-tenant ✓·## 0 · minos 1 · native-engine (43 slices: 13 glyphs on the strip line, then "+30") 1 · native-evaluation (35: 13 glyphs, then "+22") 0 · render — · render-host "design" — |
| Divider | 552 | 1 | `border.subtle` |
| SAVED | 556 | 24 + 26 | caption `ui.label`; row "review-queue" `ui` + "2 states" `ui.small` `fg.muted` (device-local; `:filter save`) |
| STATES caption | 612 | 24 | `ui.label` "STATES" + `ui.small` `fg.muted` "counts in scope" |
| State rows | 636 | 10 × 26 = 260 | `checkbox` / `checkbox--checked` 16 at x 16; state icon 16 at x 40 in **`fg.alt`** (a control, not a live state: no coral); label `ui` at x 64; count `mono.small` right-aligned at x 264. Rows, the host's counts: ☑ needs human 2 · ☐ failed 1 · ☐ unknown 0 · ☑ awaiting review 1 · ☐ implementing 1 · ☐ rework 1 · ☐ waiting on dependency 63 · ☐ ready 3 · ☐ merged 26 · ☐ superseded 4. The first eight states are `open: true` in the host's vocabulary; their sum is 72. Failed and implementing are the two fixture slices (`specify-rsps-profile`, `specify-cma-profiles`) that the ledger records as merged. The order and labels come from the host vocabulary, not from the client |
| Hint | 900 | 20 | chips `x` "toggle", `X` "only", `:filter`; a key line in the state filter's own context |

**Slice list** (x 281–1031; padding 16):

| Part | y | h | Contents |
|---|---|---|---|
| Title row | 30 | 32 | `ui.title` "Slices · all open" + `ui` `fg.muted` "3 of 72"; right: `ui.small` `fg.muted` "dependency order" |
| Filter chips | 62 | 24 | outlined chips (1 px `border.strong`, radius 2, padding 2 / 6): diamond 12 `fg.alt` + "needs human" `ui.small` + `close` 12 · `play--filled--alt` 12 + "awaiting review" + `close` 12 · then `ui.small` `fg.muted` "saved: review-queue" |
| Column captions | 94 | 24 | `ui.label`: SLICE (x 321), STATUS (x 621), WAITING (right at x 927, 60 wide), DOWNSTREAM (right at x 1019, 84 wide). Captions size their columns (CAPTION check) |
| Group header | 118 | 26 | `ui.label` "SKILLS · REDUCE-TEST-RUNTIME" + count `mono.small` |
| Rows | — | 26 | the queue's anatomy: state icon 16 at x 297 (state colours; coral diamond for needs-you); slice `ui` x 321–613 (path truncation; the group header supplies project and proposal); status `ui` `fg.alt` x 621–867; waiting `mono.small` right at x 927; downstream `mono.small` right at x 1019 |
| Sample | — | — | SKILLS · REDUCE-TEST-RUNTIME 1: ◆ simplify-adapter-launch-tests · direction · held by you · 8d 5h · 0. LNKR · GATHERING 1: ▸ auto-tag-bookmarks · awaiting review · watchdog r1 · 12m · 0. MINOS · NATIVE-ENGINE 1: ◆ execute-symbolic-calls · decide Q1 · aliased callee Axes · 2d 4h · 25 (**cursor row**). Widening to `ready` adds evaluate-exact-sum-with-demand (minos native-engine, 23), integrate-fast-full-test-suite (skills design-workflow, 3) and administer-users (lnkr multi-tenant, 2) |
| Hint line | after the rows | 24 | `ui.small` `fg.muted` "69 open slices hidden by the filter", then the chip `:filter clear` "shows them", then the chip `]g` "next group". It is a key line: `]g next group` drops first |

**Preview** (x 1048–1496): the SC-02 card for `execute-symbolic-calls`, plus two lines: CONTRACT "B1–B5 A1–A6 · 0 manual" and LATEST "implement r1 · needs_human · 10-25 09:52 · F12–F17" (the host's `lastFact`). Meta: "reviews 1 of 2 · downstream 4 · 25 in all".

**Statusline and echo** (FC-Q21): the statusline carries "filter: needs human + awaiting review · 3 of 72". The echo line shows only transient messages ("filter saved on this device"), never the filter text a second time.

**Empty state** (scope `minos / native-evaluation`, filter awaiting review; title "0 of 33" open; its STATES counts are failed 1, implementing 1, waiting on dependency 31, merged 1, superseded 1). In the list area, centred at x 656, y ~200:
- a 20 px `filter` icon in `fg.muted`;
- `ui` "No slice in minos / native-evaluation is awaiting review.";
- `ui.small` `fg.muted` "1 match elsewhere: lnkr gathering/auto-tag-bookmarks";
- the chip `:filter clear`, then "shows them";
- `ui.small` "2 slices need you in other scopes".

The preview pane shows nothing; the bufferline keeps ◆3.

**Calm state** (nothing needs you): no coral anywhere; the needs-human filter row shows 0 in `fg.muted`; with no state selected the list shows every state the host marks `open: true`.

**Agents tab** (`␣oa`). The main list's first group header reads `EXECUTING · 4 · slots 4/4`: rows first, slots named (FC-M36).
- Scope tree: All / projects.
- States: executing · on the host (operator) · held · queued · quarantined · canceled.
- Main list: the SC-08 columns, dropping lowest priority first to fit 750 px: icon, slot, assignment `mono`, workflow (path), role, state, since. Model and last activity move to the preview.
- Preview: the assignment detail, including the lifecycle list (`mono.small` times + `ui` events + 12 px icons).
- Statusline: `4 executing · slots 4/4`.

**Proposals tab** (the one home for proposal progress). Rows are exactly two lines, **52 px** at every width:

| Part | x | Type | Contents |
|---|---|---|---|
| Line 1: name | 321 | `ui.strong` | `minos / native-engine` |
| Line 1: progress strip | 549 | small multiples 12 px, or `ui` | slice marks, or the shape word and the host's path: `design · Ground ✓ Seams ✓ Modules ◆ Proposal · Record ·`. When the full strip doesn't fit it becomes `design · Modules ◆ · 3 of 5`. Never cut |
| Line 1: counts | 712 | `mono.small` | diamond (`fg.alt` at 0, coral when non-zero) / failed / running |
| Line 1: status | 815 | `ui` `fg.alt` | `1 needs you`, `nothing for you`, `awaiting review` |
| Line 2: readiness | 321 | `ui.small` `fg.muted` | `[? duplicate risk · ]ready: <eligibility>[ (<first blocker>)] · forge: <state>`. It never wraps. Narrow widths drop whole parts, in order: the forge field while it agrees with eligibility; the blocker; the `ready:` label. The sticky risk, the eligibility word, the merge line and a disagreeing forge field never drop |

**Legend** (one row under the rows, `ui.small` `fg.muted`): the small-multiple marks in words, with the diamond in `fg.alt`.

**Preview:** the proposal card, READINESS with four labelled fields (ELIGIBLE, PUBLISHED, PROMOTION, ON THE FORGE; label column 104 px, `ui.label`), every gap, the lag and the host's free text; then the state counts; then the chip `␣oe` "final package".

## SC-17 Project settings

Not workflow-scoped: no strip; content y 30–932. One reader column.

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Settings (main) | 0 | 30 | 1512 | 902 | `surface.read` | below; text from x 40 |
| Readback (`␣at`, `␣ap`) | 0 | 722 | 1512 | 210, growing to fit, up to 40 % of the window | `surface.readback`, 2 px coral top, shadow level 3 | as in SC-09; the extra rows are PENDING (`␣at`) and CHANGES (`␣ap` save) |

| Part | y (from 30) | h | Contents |
|---|---|---|---|
| CHECKPOINT ROUTING | 16 | 24 | `ui.label` "CHECKPOINT ROUTING · render · s3 · by you 10-31 09:12" |
| Routing row | 40 | 26 | Three field pairs in `ui`: name x 40 (84 px), value x 132 (170 px); name x 310, value x 402; name x 580, value x 672 (`human · always`, not editable). The cursor row takes the cursor surface and the 2 px bar, and the field under the cursor is `ui.strong` |
| Applies line | 66 | 20 | `ui.small` `fg.muted` "applies to new checkpoint requests · pending ones keep what they captured" |
| PENDING | 86 | 26 per request | label `ui` x 40; value x 132: `seams C1 · captured s2 · human`, or `none` |
| REVIEW POLICY | +24 | 24 | `ui.label` "REVIEW POLICY · default pol3 · for new workflows"; `[+] local draft` right when a draft exists |
| Policy row | — | 26 | `ui` "completed-review limit 2 · minimum evidence rank tests · reviewer diversity different family". While drafting, the composer opens in its place (measure + 32 wide), footer `Esc Esc done` |
| WORKFLOWS | — | 26 | label `ui` x 40; from x 132, one entry per workflow, name `ui` then `pol2 (bind1)` `ui` `fg.alt`, 24 px between entries. Each entry is a cursor stop for `␣ap` |
| HISTORY | +24 | 26 | label `ui` x 40; value x 132 `ui` `fg.alt`, truncating at its end: "s3 by you 10-31 · pol3 by you 10-30 · s2 by local admin import 10-20" |

**Readback rows:** BINDS `settings s2 · field modules human → delegated`; PENDING (`mono.small`, wrapped in one block) lists the requests that keep their capture. A `[≠]` field in a rebased policy draft shows both values, and the key bar reads `confirm disabled` until you edit it.

**Statusline:** mode, `settings › render › seams`, seq, the read-basis token (`basis s3 pol3`), position.

## SC-18 Local-verification prompt

Reuses the SC-04 reader with no notes pane or outline: the single pane of SC-15, under the proposal-scope strip. No render exists.

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Header (chrome) | 502 | 90 | 548 | 96 | `surface.read` | `ui.label` "LOCAL CHECK PROMPT 3 · advisory · nothing waits on this"; then rows of label `ui.small` `fg.muted` (64 px) and value `ui`: source, gaps, missing. An older prompt adds `for an older source (R5) · current is R7` |
| Key line | 502 | 186 | 548 | 26 | `surface.read` | chips `gg␣yG` "copies it" and `:request-prompt` "makes a new one for the current source". `:request-prompt …` drops first |
| Body (content) | 462 | 212 | 1034 | rest | `surface.read` | gutter x 462–502; text x 502–1050, `prose`; blocks grow right to x 1496. The artifact renders as content |
| HISTORY | 502 | after the body | 548 | 26 per row | `surface.read` | caption `ui.label`; older prompts as rows, `ui` |

Advisory: no coral, no mark, and no entry in NEEDS YOU. Where it is announced elsewhere (SC-07, SC-19, the proposal card), it is one line: `local check (advisory) · prompt 3 for R7`, then the chip `␣ol`; or `not available yet: <what is missing>`.

## SC-19 Merge package

One reader column under the proposal-scope strip; content y 78–932. **All sections above SLICES are on the first screen at 1512 and 800.**

| Region | x | y | w | h | Surface | Contents |
|---|---|---|---|---|---|---|
| Package (main) | 0 | 78 | 1512 | 854 | `surface.read` | below; text from x 40 to the pane's right content edge |

**Strip:** COMMITMENT `intake K·7d21 · by you` · OWNER `you · main merge` · EVIDENCE `R41 published #135 · 41/41 Watchdog pass` · BLOCKER `none · 1 uncertainty` · NEXT coral diamond + `merge main · on the forge` + chip `␣n`. At 800 px: `K·7d21`, `you · main merge`, `R41 · 41/41 pass`, `none`, `merge main` + chip `␣n`.

Sections run in this order, with a `ui.label` caption (h 24, 24 above) and the count in `mono.small` where there is one; rows are 26:

| Section | Row anatomy |
|---|---|
| **SOURCE** | label `ui.label` x 40 (96 px); value `ui` x 144: `canonical R41 58b3c69 · published R41 58b3c69 · PR #135 ready`. After an observed merge whose source differs, an evidence-gap row follows |
| **CHECKS** | directly under SOURCE, same grid: `41/41 Slices · required checks pass on their prepared source · weakest rank tests (minimum tests)` |
| **READINESS** | caption; then ELIGIBLE, PUBLISHED, PROMOTION, ON THE FORGE: label `ui.label` x 40 (96 px), value `ui` x 144 |
| **REMAINING FINDINGS** n | ID `mono.small` x 40; severity outlined chip; Slice `ui` `fg.muted`; the finding `ui`, wrapping at words inside its column |
| **DEVIATIONS** n | ID `mono.small` x 40; Slice `ui` `fg.muted`; what differs from the Contract and in which pass `ui`, wrapping at words |
| **UNCERTAINTIES** n | `help` 16 mauve in the gutter (x 16); ID `mono.small` x 40; the host's words `ui` |
| **ADVISORY CHECKS** n | name `ui` x 40; state `ui` `fg.muted` next to it (`suggested · not run`); no stale, failed or coral mark. Then the local prompt line in `ui` `fg.muted` with the chip `␣ol` |
| **SLICES** n | caption + count + `intake K·7d21` `mono.small`; dependency order |

**Slice rows** (26): columns sit **next to the name**, not at the pane's right edge. The name column is as wide as the longest name, then values follow directly with a 16 px gap: `K·40cc` `mono.small` · `pass 2` `ui` · `Audit examined 7bf2606` `mono.small` · `Watchdog r2 pass on 4026042` `mono.small` · `2 fixed` `ui`. A name is never cut. If a pane can't hold the row, `Audit examined …` drops whole first. `⏎` opens that Slice's SC-07 and `C-o` returns.

**URL confirm:** `␣n` opens the URL confirm that `gx` uses: `open https://… ? y/n`, with the host's `url`. It is a local confirm, not a readback, so it draws no coral. `y` opens the URL outside Render; `n` doesn't.

**Statusline:** mode, `minos/native-engine › package`, seq, position (`41 Slices`). The package binds no authority, so there is no read-basis token.
