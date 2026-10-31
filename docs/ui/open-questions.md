# Open questions for the human

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`reference/`](reference/); `wireframes.md` → [`wireframes/layout.md`](wireframes/layout.md); `screens.md` → [`wireframes/text-mocks.md`](wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`evidence.md`](evidence.md).


Decisions that are yours, each with my recommendation and what evidence (if any) will settle it. Inputs so far:
- **Screen Recording permission is granted**, which unblocks screenshot checks of the real GPUI window (E-GPUI-2).
- **Visual direction** (phase 2): "modern UI, with some icons, more aesthetic… not like a typical apple UI or AI slop… we don't need to inherit the limitations of text-only, terminal UI".
- **Ember is the signature theme** (phase 2).
- **Answers to challenge 1** (phase 5, `dispositions-1.md`):
  - **Accepted:** 11 (the coordinator is neutral and gold means navigable only, which closes Q29), 21 (v1 ships 12 languages; Q35) and 9 (human trials now, on a frozen phase-3 copy; Q21).
  - **Rejected:** 16 (keep `␣ht` and live theme switching) and 17 (keep named saved filters; Q30).
- **Answers after E-PROTO-3** (phase 4):
  - Q28: Iosevka Etoile for chrome ("Iosevka Etoile, which is what I asked for"), so Plex Sans is dropped.
  - Tool tints should be "subtle but noticeable".
  - Q33: the gold underline.
  - Q35: all 22 languages plus Elixir.
  - Q29–Q32 and Q34 got no answer and stand as defaults.
- **tldraw wireframe review** (after phase 3): the layouts are approved, with four comments. Tool calls need no icon. The readback stays grey with its coral rule and icon. References in content must stand apart. Markdown should read like a good Markdown reader, with syntax-highlighted code. These are folded in as `visual-language.md` §4.8, §5.4, §5.5, §5.9 and §5.10. They open Q33–Q35.
- **Style check answers** (phase 3, on the E-PROTO-2 renders): Iosevka for mono and Iosevka Etoile for long prose; the darker background on the main reading area; the three variants chosen by config; more of Ember's colours to tell things apart (inline code, authors, code blocks, pi-style tool-call tints), "without the UI becoming a rainbow show"; and a view to explore slices by status. They close Q26, Q01 and Q02, and open Q28–Q32.

Numbering is stable: other files cite these IDs. Status: **open**, **resolved** (you answered), **resolved by direction** (answered by your own words, shown so you can object), **default, user may override** (you didn't answer, so my recommendation stands as the design's default until you say otherwise), or **superseded** (the question no longer applies).

## Look and feel

**Q26 Visual style check (resolved: answered 10-29).** You reviewed the E-PROTO-2 renders. Your answers and where they went:
- Iosevka for mono, Iosevka Etoile for prose → `visual-language.md` §3, `stack.md` §4 (Q01, Q02).
- Darker main reading area, lighter sidebars → `surface.read` / `surface.side` (§5.1). In Light the reading area is the lightest surface instead (Q31).
- Three variants by config → `ui.theme`, switched live with `␣ht` (§5.1).
- More Ember colour without a rainbow → accent roles, tool-call tints and a colour budget (§5.3–§5.6).
- A slice explorer → SC-16 (`wireframes.md`).

*Follow-up:* done on the E-PROTO-3 renders. The answers are recorded under Q28, Q33 and Q35, plus the tint direction in `visual-language.md` §5.5. The next look is at the E-PROTO-4 renders (Q21).

**Q28 Chrome face (resolved: answered after E-PROTO-3).** You: *"Iosevka Etoile, which is what I asked for"*. Chrome and prose use Iosevka Etoile; Iosevka is for code, IDs, keys and fixed numeric columns. IBM Plex Sans and Iosevka Aile are dropped, and `ui.font.ui` is removed.
- **Measured:** at 13 px Etoile is about 20 % wider than Plex Sans, with the same x-height. The chrome sizes therefore stay the same, and the layout absorbs the width: sibling-aware truncation, strips on their own line in the tree, statusline drop order (`visual-language.md` §3.1).
- **Trade-off:** the face no longer separates chrome from content. Lanes, surfaces, size and case do (FC-S18).

**Q29 Who gets which accent (resolved: challenge 11 accepted by you).** The coordinator's name is neutral (`fg`, icon `fg.alt`). Gold means navigable only: references (solid underline) and links (dotted). You steel, reviewers mauve, workers sage; code orange; tool tints by outcome; coral for "needs you" (`visual-language.md` §5.3).

**Q30 Explorer defaults (resolved for saved filters: challenge 17 rejected by you; the rest default, user may override).**
- `␣os` reopens this device's last filter; the first open uses `review-queue` (needs human + awaiting review).
- The three tabs are Slices, Proposals and Agents. The Agents tab replaces the separate agents view (SC-08).
- Saved filters are device-local, not synced through the host.

*Recommendation (the default):* accept all three. You kept named saved filters when the challenger proposed dropping them. Syncing them would need a host-side preference store, which nothing else needs yet (`proportionality.md` P16).

**Q31 Light variant and `auto` (default, user may override).**
- In Light the reading area is the lightest surface, `#f0e8d8`, and the sidebars use Ember Light's own `#e6dac4`. "Darker reading area" therefore means "the surface with the most contrast against text" in every variant.
- `ui.theme = "auto"` follows the macOS appearance: dark → `ember`, light → `ember-light`.

*Recommendation:* accept. Choose `ember-soft` for auto-dark if you prefer it.

**Q23 Coral, Ember's hero, is reserved for "needs you" (new; open).** Stock Ember paints the cursor, keywords, links, the modeline and search in coral. This design spends coral only on needs-you marks and the open readback, so the one spark means "you are needed here". It uses orange for keywords, a gold dotted underline for links, an ivory caret and a neutral modeline (`visual-language.md` §5.3).
*Recommendation:* accept. It is Ember's own principle ("your eyes know exactly where to look") applied to state rather than syntax. The cost is that code looks a little less like Ember elsewhere.

**Q33 How references look (resolved: answered after E-PROTO-3).** The gold underline, as shipped. Host-resolved references are gold Iosevka 500 with a solid underline; dangling ones `fg.muted` with a dashed underline. The chip is rejected: E-PROTO-3's pair showed it reading as inline code (`F7` beside `[K]` on SC-09; defect 8).

**Q34 Markdown alerts stay neutral (default, user may override).** GitHub colours `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION` blue, green, purple, yellow and red, each with an icon. Render draws them as a quote bar plus the kind word, with no hue and no icon. Otherwise a red CAUTION box written by an agent would read as a failed tool call or host state (FC-S17). The ledger has none today.
*Recommendation:* accept. The cost is that alerts are less striking than on GitHub.

**Q35 Code languages (resolved: answered after E-PROTO-3; staged by challenge 21, accepted).** v1 ships 12: rust, ts/tsx, js, json, toml, yaml, bash, sql, python, md, diff and elixir. The other 11 of the 23 stay the target set, each one crate and one alias row when a fence in it appears. Unknown fences render plain (`stack.md` §5a). `tree-sitter-elixir` 0.3.5 is Apache-2.0, so its notice ships with the app.

**Q08 Light theme (resolved by direction).** Ember Light replaces the light variant derived from vague in phase 1. Its accents and muted text are nudged for AA (computed; `visual-language.md` §5.7).
*Remaining choice:* the default variant. *Recommendation:* `ui.theme = "ember"` (dark) by default; Soft and Light by config or live with `␣ht`.

**Q09 Heading colours (superseded).** Phase 1 dropped your nvim's per-level heading colours because they used state hues. With a proportional reading face, headings now get hierarchy from size, weight and space, and Ember colours stay off headings.

**Q24 Icon set (new; open).** IBM Carbon icons (Apache-2.0): square-ish and flat. Plex is gone since phase 4; Carbon stands on its own. The alternatives considered: Phosphor (MIT; rounder, common in SaaS), VS Code Codicons (CC BY 4.0; strongly "VS Code"), and Lucide (ISC; the look you asked to avoid).
*Recommendation:* Carbon. You raised no objection in the style check; still open until you say so. Phase 3's new icon names all exist in the pinned 11.90.0 (`visual-language.md` §7).

**Q25 Motion (new; open).** Two meaningful motions only:
- a 600 ms tint when a row's state changes;
- 90 ms fades for floats and the readback.

macOS Reduce Motion turns both off.
*Recommendation:* accept. The state-change tint is the one to drop if it feels busy (P10).

## Taste and muscle memory

**Q01 Fonts (resolved: answered 10-29, chrome face answered after E-PROTO-3).** Iosevka v34.9.1 for code, IDs, keys and fixed numeric columns; Iosevka Etoile for chrome and prose (Q28). All bundled, all SIL OFL 1.1, checked at startup (`stack.md` §4).

**Q02 Prose face, size and measure (resolved: answered 10-29; size changed 10-30).** Iosevka Etoile at 68 average characters, computed at startup.
- **Size:** after the trials you said prose was too big, so it is **15/24**, down from 16/26. The measure is now 548 px (`tools/font_metrics.txt`), down from 584.
- `␣tp` switches prose to Iosevka (the nvim feel), and `␣tw` widens the measure.
- The reading trial's 80 vs 100 comparison is still owed (Q21).

**Q03 How the prompt sends.** `⏎` in Normal sends; `⏎` in Insert is a newline; `M-⏎` queues a follow-up. *Recommendation:* keep the modal send.

**Q04 `c` means annotate in read-only views** (and `gc`, your mini.comment habit). *Recommendation:* accept.

**Q05 Authority confirmation.** Phase 2 cut the typed check code: every authority command is now readback + `y`, with typeahead discarded and a read basis (`proportionality.md` P1).
*Recommendation:* accept. If the human trial shows reflexive confirms, add a typed code for accepting an intake only.

**Q06 Arming delay** before `y` counts in a readback. *Recommendation:* none by default; measure accidental confirms in the trial.

**Q07 Hint key `gs`**, not vimium's `f`. *Recommendation:* accept.

**Q19 Interrupt is `␣cx`**; `Esc` and `C-c` never interrupt. *Recommendation:* accept.

## Behaviour

**Q10 Device-local draft journal.** *Recommendation:* yes. It is implemented in the prototype, and survival of drafts across restart and resnapshot is measured.

**Q11 Landing view.** *Recommendation:* the queue when anything needs you; otherwise restore the last layout.

**Q12 Queue order.** *Recommendation:* oldest first. `downstream` is shown on every row; `:sort impact` re-sorts on request.

**Q13 Notifications.** *Recommendation:* off by default; dock badge count only.

**Q27 Quarantine as "needs you" (resolved by the trials, phase 6).** A quarantined sandbox needs an operator action on the host. In a personal tool the operator is you, so it stays above WAITING, but in its own group, **ON THE HOST**, directly under NEEDS YOU.
- **Why:** in trial (a) the NEEDS YOU header counted it (4) while the statusline did not (3), and a correct "3" was marked wrong (FC-M35).
- **Now:** NEEDS YOU is decisions only, and each group has one number everywhere.

## Protocol (feedback for the server spec; decided in the server design)

**Q14 Who computes consequences.** *Recommendation:* the host sends permitted actions with EFFECT/NOT text (RQ-06). Every authority command needs a host decidable (D13).

**Q15 Search.** *Recommendation:* server-side search (RQ-21); client-only is acceptable for v1.

**Q16 Revoking a device from another device.** Deferred in v1 (`proportionality.md` P3). *Recommendation:* add later as an authority command if the host's admin interface proves too slow in practice.

**Q17 Approve-with-notes is `approveCheckpoint`** with a non-empty annotation set. *Recommendation:* accept.

**Q32 Slice lifecycle vocabulary (default, user may override).** The explorer filters on lifecycle states (needs human, failed, unknown, awaiting review, implementing, rework, waiting on a dependency, ready, merged, superseded). Their names, labels and mark class should come from the host with the slices scope (RQ-41), not be hard-coded in the client.
*Recommendation:* the host owns the vocabulary and sends each state's label, mark classes and `open` flag. The client falls back to the raw state name with the unknown mark. The phase-3 fake host implements exactly this (10 states, `open: bool` each); RQ-41 now requires it.

**Q22 Mermaid on the host (superseded, phase 5, challenge 8).** Diagrams render in the client (Pele in QuickJS, the measured path), because host-side SVG would be laid out for one client's fonts. RQ-40 is withdrawn (`stack.md` §5).

## Later

**Q18 Canvas library.** *Recommendation:* Excalidraw (MIT), when canvas work starts.

**Q20 TUI keyboard protocol.** *Recommendation:* kitty protocol when available; the listed alternates otherwise.

**Q21 Human trial sessions.** Pending:
- the 5-second test;
- the five handover questions;
- a timed checkpoint review against your nvim + review-TUI baseline;
- the reading trial.

*Status (phase 6):* run on the frozen phase-3 copy; results in `trial-notes.md`, dispositions in `dispositions-2.md`.
- **(a) 5-second:** 18/25. Five of the seven misses came from inconsistent counts, now fixed.
- **(b) Handover:** 3/5 answers within 10 s in both runs. Bare-dash fields were slow, now fixed.
- **(c) Checkpoint review:** failed, a discovery failure, 264 command keys against 35 scripted. Now fixed with `␣mn` and visible hints.
- **(d) Reading:** 1 of 4 conditions.

**Still owed:**
- the reading comparison (mono vs prose, 80 vs 100);
- a review baseline in your nvim + review TUI (none was logged);
- re-runs of (a), (b) and (c) on the phase-6 build after E-PROTO-5;
- Q36, which the trial couldn't judge because it ran on the phase-3 faces.

**Q36 Side-pane content: size step or weight (new; open, judge in the style check).** With Etoile everywhere, SC-02's card QUESTION and its fact values shared face, colour and nearly size (evaluation-4 §4, challenge 5).
- **Phase 5's default:** side-pane content at `prose.small` 15/24, two steps above 13 px chrome, on a 2 px content bar. It costs the card question one more line than A2's 14/22.
- **Fallback:** weight instead of size, with chrome values at 500 and content at 400.

The trial runs on phase-3 faces (Plex chrome), so it can't judge this; the next look at Etoile renders decides.
*Recommendation:* the size step with the bar. The user kept the side-pane content bar (10-30); only the per-message chat bar was removed.
