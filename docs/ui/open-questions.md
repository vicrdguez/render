# Open questions for the human

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)).
> - **File names** in code spans: `visual-language.md`, `grammar.md` and `stack.md` are in [`reference/`](reference/); `layout.md` and `text-mocks.md` are in [`wireframes/`](wireframes/).
> - **Measured, proposed and pending** claims are separated in [`evidence.md`](evidence.md).


Decisions that are yours, each with my recommendation and what evidence (if any) will settle it. Inputs so far:
- **Screen Recording permission is granted**, which unblocks screenshot checks of the real GPUI window (E-GPUI-2).
- **Visual direction**: "modern UI, with some icons, more aesthetic… not like a typical apple UI or AI slop… we don't need to inherit the limitations of text-only, terminal UI".
- **Ember is the signature theme**.
- **Answers to the first design review**:
  - **Accepted:** the coordinator is neutral (Q29; the gold half was reversed on 11-02); v1 ships 12 languages (Q35); human trials before the final spec.
  - **Kept against the review's advice:** `␣ht` and live theme switching; named saved filters (Q30).
- **Answers after E-PROTO-3**:
  - Q28: Iosevka Etoile for chrome ("Iosevka Etoile, which is what I asked for"), so Plex Sans is dropped.
  - Tool tints should be "subtle but noticeable".
  - Q33: the gold underline (reversed on 11-02).
  - Q35: all 22 languages plus Elixir.
  - Q29–Q32 and Q34 got no answer and stand as defaults.
- **tldraw wireframe review**: the layouts are approved, with four comments. Tool calls need no icon. The readback stays grey with its coral rule and icon. References in content must stand apart. Markdown should read like a good Markdown reader, with syntax-highlighted code. These are folded in as `visual-language.md` §4.8, §5.4, §5.5, §5.9 and §5.10. They open Q33–Q35.
- **Answers on 11-02**: Q23, Q24, Q25, Q36 and Q21, below. *"Let's use the defaults on the rest of open items for now"*: every other question here takes its recommendation or stated default until you say otherwise.
- **Style check answers**: Iosevka for mono and Iosevka Etoile for long prose; the darker background on the main reading area; the three variants chosen by config; more of Ember's colours to tell things apart (inline code, authors, code blocks, pi-style tool-call tints), "without the UI becoming a rainbow show"; and a view to explore slices by status. They close Q26, Q01 and Q02, and open Q28–Q32.

Numbering is stable: other files cite these IDs. Status: **open**, **resolved** (you answered), **resolved by direction** (answered by your own words, shown so you can object), **default, user may override** (you didn't answer, so my recommendation stands as the design's default until you say otherwise), or **superseded** (the question no longer applies).

## Look and feel

**Q26 Visual style check (resolved: answered 10-29).** You reviewed the E-PROTO-2 renders. Your answers and where they went:
- Iosevka for mono, Iosevka Etoile for prose → `visual-language.md` §3, `stack.md` §4 (Q01, Q02).
- Darker main reading area, lighter sidebars → `surface.read` / `surface.side` (§5.1). In Light the reading area is the lightest surface instead (Q31).
- Three variants by config → `ui.theme`, switched live with `␣ht` (§5.1).
- More Ember colour without a rainbow → accent roles, tool-call tints and a colour budget (§5.3–§5.6).
- A slice explorer → SC-16 (`layout.md`).

*Follow-up:* done on the E-PROTO-3 renders. The answers are recorded under Q28, Q33 and Q35, plus the tint direction in `visual-language.md` §5.5. The next look is at the E-PROTO-4 renders (Q21).

**Q28 Chrome face (resolved: answered after E-PROTO-3).** You: *"Iosevka Etoile, which is what I asked for"*. Chrome and prose use Iosevka Etoile; Iosevka is for code, IDs, keys and fixed numeric columns. IBM Plex Sans and Iosevka Aile are dropped, and `ui.font.ui` is removed.
- **Measured:** at 13 px Etoile is about 20 % wider than Plex Sans, with the same x-height. The chrome sizes therefore stay the same, and the layout absorbs the width: sibling-aware truncation, strips on their own line in the tree, statusline drop order (`visual-language.md` §3.1).
- **Trade-off:** the face no longer separates chrome from content. Lanes, surfaces, size and case do (FC-S18).

**Q29 Who gets which accent (resolved; reversed in part on 11-02).** **Kept:** the coordinator's name is neutral (`fg`, icon `fg.alt`); you steel, reviewers mauve, workers sage; tool tints by outcome. You value telling agent roles apart at a glance, so a role name takes its hue wherever the client draws it, and the word separates `Audit` from `Watchdog`. **Reversed:** "gold means navigable only". You chose your own link colours over keeping references gold (Q33), so **gold now means inline code, code as a thing**, and not navigable. Salmon means navigable, and orange means literal machine text in chrome (`visual-language.md` §5.3).

**Q30 Explorer defaults (resolved for saved filters: you kept them; the rest default, user may override).**
- `␣os` reopens this device's last filter; the first open uses `review-queue` (needs human + awaiting review).
- The three tabs are Slices, Proposals and Agents. The Agents tab replaces the separate agents view (SC-08).
- Saved filters are device-local, not synced through the host.

*Recommendation (the default):* accept all three. You kept named saved filters when the challenger proposed dropping them. Syncing them would need a host-side preference store, which nothing else needs yet.

**Q31 Light variant and `auto` (default, user may override).**
- In Light the reading area is the lightest surface, `#f0e8d8`, and the sidebars use Ember Light's own `#e6dac4`. "Darker reading area" therefore means "the surface with the most contrast against text" in every variant.
- `ui.theme = "auto"` follows the macOS appearance: dark → `ember`, light → `ember-light`.

*Recommendation:* accept. Choose `ember-soft` for auto-dark if you prefer it.

**Q23 Coral and Ember's other colours (closed 11-02).** You: *"we should use coral and other ember colors more widely without undermining understanding and visual queues to catch my attention. Aside from coral, so far I've seen very little use of the other ember colors that would help differentiate different parts the UI and different text better. right now is basically brighter text vs dimmer text"*.

The first recommendation, coral only for needs-you with lists and chrome kept neutral, is rejected. **The final set,** settled on the e9 renders (`visual-language.md` §5.3–§5.6):
- **Top bar:** every count is a solid tag, 34 × 16 px, with icon and number knocked out in `surface.read`: coral `◆ n`, rose `✗ n`, mauve `? n`.
- **Rows, strip and card NEXT, REVISIONS:** the coral diamond alone, at its previous size, with no background. The `NEEDS YOU` caption and count are coral while the count is above 0. The readback keeps its verb tag, and its mode badge is solid.
- **Your keyboard:** six thin coral elements: caret, cursor bar, focused pane's top rule, active tab, mode badge border, current search match. The caret is allowed in text you are typing; only agent content is excluded.
- **Chrome:** steel for labels, orange for IDs, digests, revisions and key chips, sage for projects and hosts, olive and rose for outcomes only.
- **Content, after your Ember setup:** `h1` rose, `h2` orange, `h3` and below `fg`; `strong` steel, which you agreed to over your Obsidian's mauve, because mauve dims it; `em` neutral italic.
- **Code:** inline code is gold on its chip, your change, as in your Obsidian, so it doesn't share a hue with `h2`. The code frame's left rule and label are gold too. Keywords stay orange, with no coral keywords.
- **Links and references:** your own colours (Q33).
- **Roles:** Q29.
- **SC-19 Slice rows:** the quieter variant: role name in its hue, digests orange, verdict `pass` olive, `2 fixed` and higher in `fg`, the rest muted.
- **Budget:** accent share is a reported number with no limit. The render showed up to 49.5 % on a calm list with short titles, and you were fine with it. Accent text stays the minority.

**Q33 How references look (resolved; the gold answer was reversed on 11-02).** Your first answer after E-PROTO-3 was the gold underline. On 11-02 you chose your own link colours over keeping references gold: from your Obsidian, `#c09080` at rest (your unresolved colour) and `#eb9a7f` on hover, which you said *"might be useful in other situations as well"*; for Light, `#905050` and `#913c28`. This **reverses Q33's gold and Q29's "gold means navigable"**.

- **References:** Iosevka 500 in `kind.link` with a solid underline. **Links:** the prose face in `kind.link` with a dotted underline. **Dangling:** `fg.muted` with a dashed underline. The chip stays rejected: E-PROTO-3's pair showed it reading as inline code (`F7` beside `[K]` on SC-09; defect 8).
- **`kind.link_active`** is hover and also the reference or link under the document cursor, because this is a keyboard-first app.
- **As applied, by contrast** (`visual-language.md` §5.7). Dark is your pair. Soft is the dark pair with the rest colour raised one step to `#c09181`, because `#c09080` is 4.48 on a side-pane cursor row. Light's rest colour is raised to `#844949`, because `#905050` passes AA only on `surface.read` (5.00) and references also sit on `surface.side` and `surface.cursor.read` (4.40), the human band (4.48) and `surface.cursor.side` (4.00). `#913c28` is unchanged.

**Two notes you can overrule:**
- **The underline.** Your Obsidian has no underline on links. The underlines stay for now: they mark what's followable by shape as well as colour (`visual-language.md` §5.8), and salmon is muted beside prose and close to the rose `h1`.
- **Closeness in Light.** `#905050` is Ember Light's own rose (`state.blocked`). After the raise, a Light link is ΔE 0.8 from the rose `h1` (`#814747`) and 3.2 from `state.blocked`: effectively the same colour as `h1`. Mono, the underline and size keep them apart. In dark a link is ΔE 7.2 from `h1`, in Soft 6.8. Keeping `#905050` wouldn't solve it: it would be ΔE 4.0 from `h1`, identical to `state.blocked`, and under AA on those surfaces. So if they read too close, the choice is to change Light's `h1` or pick another Light link colour. Nothing here has been rendered.

**Q34 Markdown alerts stay neutral (default, user may override).** GitHub colours `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` blue, green, purple, yellow and red, each with an icon. Render draws them as a quote bar plus the kind word, with no hue and no icon. Otherwise a red CAUTION box written by an agent would read as a failed tool call or host state (FC-S17). The ledger has none today.
*Recommendation:* accept. The cost is that alerts are less striking than on GitHub.

**Q35 Code languages (resolved: answered after E-PROTO-3; staged, accepted).** v1 ships 12: rust, ts/tsx, js, json, toml, yaml, bash, sql, python, md, diff and elixir. The other 11 of the 23 stay the target set, each one crate and one alias row when a fence in it appears. Unknown fences render plain (`stack.md` §5a). `tree-sitter-elixir` 0.3.5 is Apache-2.0, so its notice ships with the app.

**Q08 Light theme (resolved by direction).** Ember Light replaces the light variant derived from vague. Its accents and muted text are nudged for AA (computed; `visual-language.md` §5.7).
*Remaining choice:* the default variant. *Recommendation:* `ui.theme = "ember"` (dark) by default; Soft and Light by config or live with `␣ht`.

**Q09 Heading colours (superseded).** The design dropped your nvim's per-level heading colours because they used state hues. With a proportional reading face, headings now get hierarchy from size, weight and space, and Ember colours stay off headings.

**Q24 Icon set (resolved: answered 11-02).** You: *"carbon icons are ok"*. IBM Carbon icons (Apache-2.0): square-ish and flat. Plex is gone; Carbon stands on its own. The alternatives considered: Phosphor (MIT; rounder, common in SaaS), VS Code Codicons (CC BY 4.0; strongly "VS Code"), and Lucide (ISC; the look you asked to avoid).
The icon names all exist in the pinned 11.90.0 (`visual-language.md` §7).

**Q25 Motion (resolved for now: answered 11-02).** You: *"they are ok for now"*. Two meaningful motions only:
- a 600 ms tint when a row's state changes;
- 90 ms fades for floats and the readback.

macOS Reduce Motion turns both off.
The state-change tint is the one to drop if it feels busy (P10).

## Taste and muscle memory

**Q01 Fonts (resolved: answered 10-29, chrome face answered after E-PROTO-3).** Iosevka v34.9.1 for code, IDs, keys and fixed numeric columns; Iosevka Etoile for chrome and prose (Q28). All bundled, all SIL OFL 1.1, checked at startup (`stack.md` §4).

**Q02 Prose face, size and measure (resolved: answered 10-29; size changed 10-30).** Iosevka Etoile at 68 average characters, computed at startup.
- **Size:** after the trials you said prose was too big, so it is **15/24**, down from 16/26. The measure is now 548 px (`tools/font_metrics.txt`), down from 584.
- `␣tp` switches prose to Iosevka (the nvim feel), and `␣tw` widens the measure.
- The reading trial's 80 vs 100 comparison is still owed (Q21).

**Q03 How the prompt sends.** `⏎` in Normal sends; `⏎` in Insert is a newline; `M-⏎` queues a follow-up. *Recommendation:* keep the modal send.

**Q04 `c` means annotate in read-only views** (and `gc`, your mini.comment habit). *Recommendation:* accept.

**Q05 Authority confirmation.** The design cut the typed check code: every authority command is now readback + `y`, with typeahead discarded and a read basis.
*Recommendation:* accept. If the human trial shows reflexive confirms, add a typed code for accepting an intake only.

**Q06 Arming delay** before `y` counts in a readback. *Recommendation:* none by default; measure accidental confirms in the trial.

**Q07 Hint key `gs`**, not vimium's `f`. *Recommendation:* accept.

**Q19 Interrupt is `␣cx`**; `Esc` and `C-c` never interrupt. *Recommendation:* accept.

## Behaviour

**Q10 Device-local draft journal.** *Recommendation:* yes. It is implemented in the prototype, and survival of drafts across restart and resnapshot is measured.

**Q11 Landing view.** *Recommendation:* the queue when anything needs you; otherwise restore the last layout.

**Q12 Queue order.** *Recommendation:* oldest first. `downstream` is shown on every row; `:sort impact` re-sorts on request.

**Q13 Notifications.** *Recommendation:* off by default; dock badge count only.

**Q27 Quarantine as "needs you".** A quarantined sandbox needs an operator action on the host. In a personal tool the operator is you, so it stays above WAITING, but in its own group, **ON THE HOST**, directly under NEEDS YOU.
- **Why:** in trial (a) the NEEDS YOU header counted it (4) while the statusline did not (3), and a correct "3" was marked wrong (FC-M35).
- **Now:** NEEDS YOU is decisions only, and each group has one number everywhere.

**Q38 Where proposal progress lives (resolved: answered 11-01).** You: *"Move to Proposals tab"*. The PROPOSALS block and its legend left the landing queue, and the explorer's Proposals tab is the one home for proposal progress and readiness. T01 is still answered with 0 keys: every group fits without scrolling at 1512 (measured, groups end at y 552 of 932).

## Protocol (asks of the host)

**Q14 Who computes consequences (resolved by the accepted spec for actions; EFFECT and NOT text remain the ask, RQ-06).** Snapshots carry exact available actions (S§5.2.1 L351). Every authority command needs a host decidable.

**Q15 Search.** *Recommendation:* server-side search (RQ-21); client-only is acceptable for v1.

**Q16 Revoking a device from another device.** Deferred in v1. *Recommendation:* add later as an authority command if the host's admin interface proves too slow in practice.

**Q17 Approve-with-notes (resolved by the accepted spec).** It approves the original emitted bytes, carrying saved notes as nonbinding (S§8 L959).

**Q32 Slice lifecycle vocabulary (default, user may override).** The explorer filters on lifecycle states (needs human, failed, unknown, awaiting review, implementing, rework, waiting on a dependency, ready, merged, superseded). Their names, labels and mark class should come from the host with the slices scope (RQ-41), not be hard-coded in the client.
*Recommendation:* the host owns the vocabulary and sends each state's label, mark classes and `open` flag. The client falls back to the raw state name with the unknown mark. The fake host implements exactly this (10 states, `open: bool` each); RQ-41 now requires it.

## Later

**Q18 Canvas library.** *Recommendation:* Excalidraw (MIT), when canvas work starts.

**Q20 TUI keyboard protocol.** *Recommendation:* kitty protocol when available; the listed alternates otherwise.

**Q21 Human trial sessions (skipped: answered 11-02).** You: *"let's skip the human trial and on-screen GPUI and IME"*. The earlier results below stand, and no re-run is planned. What these sessions would have covered:
- the 5-second test;
- the five handover questions;
- a timed checkpoint review against your nvim + review-TUI baseline;
- the reading trial.

*Status:* run on a frozen early copy; results in the workbench's `trial-notes.md`.
- **(a) 5-second:** 18/25. Five of the seven misses came from inconsistent counts, now fixed.
- **(b) Handover:** 3/5 answers within 10 s in both runs. Bare-dash fields were slow, now fixed.
- **(c) Checkpoint review:** failed, a discovery failure, 264 command keys against 35 scripted. Now fixed with `␣mn` and visible hints.
- **(d) Reading:** 1 of 4 conditions.

**Not run, so unmeasured:**
- the reading comparison (mono vs prose, 80 vs 100);
- a review baseline in your nvim + review TUI (none was logged);
- re-runs of (a), (b) and (c) on the final design;

**Q36 Side-pane content: size step or weight (resolved: answered 11-02).** You: *"side panel is ok"*, so the size step with the bar stays. With Etoile everywhere, SC-02's card QUESTION and its fact values shared face, colour and nearly size.
- **The design:** side-pane content at `prose.small` 15/24, two steps above 13 px chrome, on a 2 px content bar. It costs the card question one more line than A2's 14/22.

The user kept the side-pane content bar (10-30); only the per-message chat bar was removed.

**Q37 Mono variant: Iosevka or Iosevka Term (resolved: answered 11-01).** You: *"Keep Iosevka"*. The mono role stays Iosevka in default spacing; Iosevka Term was the recommendation and is not used. Measured (E-MYGO-TEXT T3): in Iosevka, `— → … ⏎ ▸ ↺` are two cells wide and `· ⟨ ⟩ ␣ • ◦` one. Monospace lines snap those glyphs to two cells, and column widths and truncation count them as two (`stack.md` §4).

