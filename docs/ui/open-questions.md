# Open questions for the human

> **Supporting file of the Render UI spec** ([`spec.md`](spec.md)).
> - **File names** in code spans: `visual-language.md`, `grammar.md` and `stack.md` are in [`reference/`](reference/); `layout.md` and `text-mocks.md` are in [`wireframes/`](wireframes/).
> - **Measured, looked-at and reasoned** claims, and what is owed, are labelled in [`evidence.md`](evidence.md).

Decisions that are yours, each with my recommendation and what evidence (if any) will settle it. Numbering is stable: other files cite these IDs. Status: **open**, **resolved** (you answered), **resolved by direction** (answered by your own words, shown so you can object), **default, user may override** (you didn't answer, so my recommendation stands until you say otherwise), or **superseded** (the question no longer applies).

On 11-02 you said *"Let's use the defaults on the rest of open items for now"*: every question below that you haven't answered takes its recommendation or stated default.

## Open

**Q39 Human timing trials (open).** Nothing on the Brief has been timed with a person. Owed, in order of weight:
- **Re-entry:** the five handover questions answered in ≤ 10 s from a cold Brief (T01), and the server spec's V8 target of ≤ 2 min without chat. This is the Brief's central claim.
- **First note:** does the `+ note c` hint and `␣mn` get a first-time reviewer writing a note without help (FC-K19)?
- **Alarming title:** a rose page title or content `h1` beside a failure ("Build failed"); is it read as a failure (FC-S22, FC-S23)?
- **Grey test:** with hue removed, does the needs-you flag still win at a glance (FC-M62)?
- **Mode and focus:** is the mode badge enough to avoid typing into the wrong mode (FC-K27, FC-T23); is the coral head read as "only this one needs you" (FC-M66)?

*Recommendation:* run re-entry and first note before building the remaining screens; the rest can wait for the client. Q21 skipped the earlier round; this is the Brief's own.

**Q40 Presence detection for "since you left" (open).** You are present while the window is key and visible, the screen awake and unlocked, a key or pointer event arrived within the last 5 min, and the Brief tab is focused (FC-M68). Unbuilt and unmeasured: which of these rune exposes (window key, occlusion, sleep and lock, input idle), and whether 5 min is right.
*Recommendation:* where rune doesn't expose occlusion, use key window plus input idle; test the threshold with CONF fixtures for FC-M67, FC-M68 and FC-M70 and one day of real use.

**Q41 Pointer behaviour (open).** Rows, segments, tabs and nav icons are clickable; a click never confirms authority (Q50), and a click within 400 ms of a float opening is discarded (FC-T22). The prototype has no pointer code, so nothing about pointer use is measured: click targets, hover, scrolling a margin note, dragging.
*Recommendation:* keep the keyboard the only tested path for v1; add a pointer pass to the implementation suite (every command still reachable without it, 0 pointer events in COV).

**Q42 Known key-budget misses (open).**
- **T32, the Slices filter path, 10 keys against a budget of 8.** T32 (explore slices that need a human or await review) was `␣os C-j x 3j x`, 8 keys. `C-j` stays reserved for splits (Q53), so the filter float opens with `␣sf`: `␣os ␣sf x 3j x` is 10.
- **T14, approve, 5 keys against a budget of 4.** `⏎ ␣aa y` is 5 by the budgets' own counting rule (`␣aa` is three keys); it was recorded as 4. *Recommendation:* raise the budget to 5. Approving from the Brief is open, then the authority key and `y`, and none of those can be shortened without weakening the readback.

On T32: The `:filter review-queue⏎` path is 2 + the name, and `review-queue` ships as the default saved filter.
*Options:* (a) raise T32's budget to 10; (b) open the Slices list with its filter float when no filter was used yet; (c) a direct key for the saved filter. *Recommendation:* (a). The saved filter is the frequent path, and the float is for building new ones.

**Q43 The stack's first implementation tests (open; `stack.md` §8).** On-screen key latency in a real window (L1 on screen and L2), real IME (`jk` and `M-⏎` under Japanese and Chinese IMEs, Google Japanese Input, dead keys), NSEvent `input_time` in a real window, and the SC-04 Markdown screen. Four live streams side by side measured 20–28 ms frame CPU p99 headless, over L1; you accepted that on 11-06.
*Recommendation:* run all four before building more than SC-03 and SC-04; a failure with no Render-side fix is what would send the build to the GPUI fallback.

**Q44 Pill metrics: accept rune's or patch rune (default, user may override).** rune's in-text pills are about 7 px a side and radius 5, and `PillStyle` can't change them at the pin. The design asked for square chips with 0 × 3 padding. The spec records rune's metrics as a deviation (`visual-language.md` §4.2); Render-drawn key chips, count tags and hint labels stay square.
*Recommendation:* accept the deviation. Patching rune means carrying a fork of a project that takes no pull requests.

**Q45 Transparent pills leave a double space (open to verify; the default is stated).** Plain-text IDs and paths kept whole by transparent pills take the same room as drawn ones, so `Contract K·40cc` shows a double gap on each side (looked at). **Stated default** (spec §5.6, `visual-language.md` §4.2): inline code is a drawn pill; IDs, paths and key names are transparent pills only when they have an internal break opportunity (`-`, `/`, `.`); tokens without one stay whole anyway. Verify with the SC-04 Markdown test that this removes the gap where it matters.

**Q46 The float's shadow on rune (closed 11-06).** rune at the pin has `box_shadow`, `shadow`, `gradient` and `border_dash` (`crates/rune/src/el/visuals.rs`). The float's upward shadow is `box_shadow` with a negative y; no gradient workaround.

**Q47 Margin-note placement on rune (open).** Notes sit at their anchor's y, which needs each paragraph's box after layout, and stub when pushed more than about two lines (FC-Q28). Unverified on rune. *Recommendation:* settle it in the SC-04 Markdown test, reading anchor boxes from `--tree`.

**Q48 Syntax colour without bold or italic (default, user may override).** rune-kit's scanners change colour only, so Ember's bold keywords and italic comments aren't drawn, and TOML, Elixir and Markdown fences render plain. tree-sitter can be added per language later without a design change (`stack.md` §5a).
*Recommendation:* accept for v1; add tree-sitter for TOML and Elixir first if their fences turn up often.

**Q49 The measure through rune at 14 px (open).** The spike computed `measure.prose` through rune at the earlier design's 15 px (548 px). The Brief's is 600 px at 14 px (80 × the mean advance, `visual-language.md` §4.1), and `stack.md` §4 now says so. *Recommendation:* re-run the spike's measure check at 14 px with the first implementation tests.

### Defaults set on 11-06 after the docs challenge (default, user may override)

**Q50 A pointer click never confirms authority (default, user may override).** A click on the readback's confirm chip does nothing and echoes `press y to confirm`; only `y` confirms. The 400 ms click discard stays, as a guard against a click landing in a float that just opened under the pointer (FC-T22).
*Why:* principle 3 says nothing but `y` reaches authority; a clickable confirm would need its own typeahead defences.

**Q51 `lastActivity` is content (default, user may override).** The agent reports it, so on the Brief's Running rows it is drawn on the 2 px content bar, one `prose.small` line with an ellipsis, and only its host time stays in chrome at the right. Principle 6 then holds with no exception. It costs one more line per Running row (FC-S25, FC-M69).

**Q52 Footers print only keys that work where they are printed (default, user may override).** A composer in Insert prints only keys bound in Insert: `Esc`/`jk` to leave it, and in the chat composer `⌘⏎` and `M-⏎`. No post-`Esc` keys and no leader keys; after `Esc`, the statusline's `:w` and the Track row's segments carry the rest. While any bottom float is open, every chip outside it is muted and inert, and `:w` is muted in COMMAND and Insert. KL17 is strict in Insert.

**Q53 Splits are not in v1 (default, user may override).** `C-h/j/k/l`, the `␣w` and `C-w` groups, and `C-v`/`C-s` in pickers are reserved and bound to nothing, so they come back with their nvim meanings if splits do (`grammar.md` §6). Splits would first need a layout: the axis, Track row and peek per pane. Because `C-j` stays reserved, the filter float stays on `␣sf` (Q42).

**Q54 The abnormal-fact slot's ladder (default, user may override).** The Track row's slot shows one entry, the highest that applies: unknown outcome, then typed blocker, then evidence not yet shown, then delegated route, then the calm form, owner or turn state (spec §2.3). The direction record gives no other order; this one puts what can mislead about authority first.

## Answered for the Brief (11-05 and 11-06)

You adopted the Brief on 11-06: *"much better than the original one"*. It replaces the accepted design, which stays in git history at `fd270d7`.

| Date | Decision | Where it went |
|---|---|---|
| 11-05 | The terminal isn't the enemy: tabs, a statusline and the mode badge stay | `spec.md` §2; `visual-language.md` §2.2 |
| 11-05 | Few printed keys; which-key is the main way to find them | `grammar.md` §18; KL20 |
| 11-05 | Ember dark is the default variant (Q08) | `visual-language.md` §5.1 |
| 11-05 | The solid coral head on a needs-you cursor row stays | `visual-language.md` §5.4, §12 |
| 11-05 | Count tags back in the tab bar; the side rail out | `spec.md` §2 |
| 11-05 | Rose page titles are fine | `visual-language.md` §3.2, §5.3 |
| 11-05 | Square shapes, straight hairlines; nothing oversized | `visual-language.md` §1, §6 |
| 11-05 | "Since you left" must say what it measures | `spec.md` SC-02 |
| 11-05 | The bottom float stays full width with a coral top rule | `visual-language.md` §2.2 |
| 11-06 | The solid coral primary action stays (challenge CH-06) | `visual-language.md` §5.4, §5.11 |
| 11-06 | Messages (the echo) get their own row, below the statusline | `visual-language.md` §2.2 |
| 11-06 | Selection: a square 2 px coral bar on a non-needs-you row, replacing the `▸` pointer | `visual-language.md` §12 |
| 11-06 | The list peek is on by default from 1180 px | `spec.md` SC-16 |
| 11-06 | The chat composer has no pencil icon | `visual-language.md` §4.5 |
| 11-06 | The client is built on rune; GPUI is the first fallback, mygo the second, nsh dropped | `stack.md` |
| 11-06 | With rune: native wrap with pills, solid underlines only, rune's pill metrics (Q44), Render's own code block, rune-kit's scanners (Q35, Q48) | `stack.md` §2; `visual-language.md` §4.2, §4.8, §5.9, §5.10 |
| 11-06 | Four live streams side by side at 20–28 ms frame CPU p99 are acceptable | `stack.md` §6 |

## Look and feel

**Q26 Visual style check (resolved: answered 10-29).** You reviewed the E-PROTO-2 renders. Your answers and where they went:
- Iosevka for mono, Iosevka Etoile for prose → `visual-language.md` §3, `stack.md` §4 (Q01, Q02).
- Darker main reading area, lighter sidebars → `surface.read` / `surface.side` (§5.1). The Brief has no sidebars, so the stage is the darkest surface and chrome regions are one step quieter. In Light the stage is the lightest surface instead (Q31).
- Three variants by config → `ui.theme`, switched live with `␣ht` (§5.1).
- More Ember colour without a rainbow → accent roles, tool-call tints and a colour budget (§5.3–§5.6).
- A slice explorer → first SC-16's three-pane explorer, now the Slices list with its filter float (`␣sf`).

**Q28 Chrome face (resolved: answered after E-PROTO-3).** You: *"Iosevka Etoile, which is what I asked for"*. Chrome and prose use Iosevka Etoile; Iosevka is for code, IDs, keys and fixed numeric columns. IBM Plex Sans and Iosevka Aile are dropped, and `ui.font.ui` is removed.
- **Measured:** at 13 px Etoile is about 20 % wider than Plex Sans, with the same x-height.
- **Trade-off:** the face doesn't separate chrome from content. Lanes, surfaces, the content bar and case do (FC-S18).

**Q29 Who gets which accent (resolved; reversed in part on 11-02).** **Kept:** the coordinator's name is neutral (`fg`, icon `fg.alt`); you steel, reviewers mauve, workers sage; tool tints by outcome. A role name takes its hue wherever the client draws it from a host field, and the word separates `Audit` from `Watchdog`. **Reversed:** "gold means navigable only". **Gold now means inline code, code as a thing.** Salmon means navigable, and orange means literal machine text in chrome (`visual-language.md` §5.3).

**Q30 List defaults (resolved for saved filters: you kept them; the rest default, user may override).** The explorer's three tabs became three list views in the Brief.
- `␣os` opens the Slices list with this device's last filter; the first open uses `review-queue` (needs human + awaiting review). `␣oP` opens Proposals, `␣oa` Agents.
- Saved filters are device-local, not synced through the host.

*Recommendation (the default):* accept. Syncing saved filters would need a host-side preference store, which nothing else needs yet.

**Q31 Light variant and `auto` (default, user may override).**
- In Light the stage is the lightest surface, `#f0e8d8`, and chrome regions use Ember Light's `#e6dac4`. "Darker reading area" therefore means "the surface with the most contrast against text" in every variant.
- `ui.theme = "auto"` follows the macOS appearance: dark → `ember`, light → `ember-light`.

*Recommendation:* accept. Choose `ember-soft` for auto-dark if you prefer it.

**Q23 Coral and Ember's other colours (closed 11-02; coral places updated by the Brief).** You: *"we should use coral and other ember colors more widely without undermining understanding and visual queues to catch my attention… right now is basically brighter text vs dimmer text"*. The set as it stands (`visual-language.md` §5.3–§5.6):
- **Solid coral** only on the `◆` count tag, the needs-you cursor head, the primary action at the NEXT target, and an open readback's verb tag with its badge. At most one solid mass besides the tag; none when calm.
- **Thin coral** for the keyboard: caret, the 2 px cursor bar, the active tab's rule, the Normal badge's edge, the float's rule, the current search match. The caret is allowed in text you are typing; agent content never draws coral.
- **Chrome:** steel for labels, orange for IDs, digests, revisions and key chips, sage for projects and hosts, olive and rose for outcomes only, rose for page titles.
- **Content, after your Ember setup:** `h1` rose, `h2` orange, `h3` and below `fg`; `strong` steel; `em` neutral italic.
- **Code:** inline code is gold on its pill; the code block's rule and label are gold; keywords orange.
- **Links and references:** your own colours (Q33). **Roles:** Q29.
- **Budget:** accent share is a reported number with no limit; you were fine with up to 49.5 % on a calm list.

**Q33 How references look (resolved; gold reversed on 11-02; underline style changed by the rune switch, 11-06).** On 11-02 you chose your own link colours: `#c09080` at rest and `#eb9a7f` active; for Light, `#905050` and `#913c28`.
- **References:** Iosevka 500 in `kind.link` with a solid underline. **Links:** the prose face in `kind.link` with the same solid underline. **Dangling:** Iosevka 400 `fg.muted` with a solid `fg.muted` underline. rune draws solid underlines only, so the earlier dotted link and dashed dangling underlines are gone; face tells a reference from a link, and colour tells a dangling reference from a resolved one.
- **`kind.link_active`** is hover and also the reference or link under the document cursor.
- **As applied, by contrast** (`visual-language.md` §5.7): Soft's rest colour is raised one step to `#c09181`; Light's to `#844949`, because `#905050` passes AA only on `surface.read`.

**Two notes you can overrule:**
- **The underline.** Your Obsidian has no underline on links. The underlines stay: they mark what's followable by shape as well as colour.
- **Closeness in Light.** After the raise, a Light link is ΔE 0.8 from the rose `h1` (`#814747`). Mono, the underline and size keep them apart; judge it again on real documents.

**Q34 Markdown alerts stay neutral (default, user may override).** Render draws GFM alerts as a quote bar plus the kind word, with no hue and no icon, so an agent's red CAUTION box can't read as a failed tool call (FC-S17). The ledger has none today.
*Recommendation:* accept.

**Q35 Code languages (closed by the rune switch, 11-06).** You asked for all 22 languages plus Elixir, staged with 12 in v1 through tree-sitter. With rune, highlighting is rune-kit's 13 scanners (Rust, JS/JSX, TS/TSX, JSON, Python, Go, Swift, shell, SQL, HTML/XML, CSS, YAML, diff); TOML, Elixir and Markdown fences render plain for now, and tree-sitter is optional later (`stack.md` §5a, Q48). Elixir is plain, so `tree-sitter-elixir` and its licence notice are not shipped.

**Q08 Light theme (resolved by direction; default variant answered 11-05).** Ember Light replaces the light variant derived from vague, with accents nudged for AA. Ember dark is the default; Soft and Light by config or live with `␣ht`.

**Q09 Heading colours (superseded).** Your nvim's per-level heading colours used state hues. Headings get rank from size, weight, rule and space; `h1` rose and `h2` orange came later, from your Ember setup (Q23).

**Q24 Icon set (resolved: answered 11-02).** You: *"carbon icons are ok"*. IBM Carbon (Apache-2.0), drawn with rune's `icon()`. The names all exist in the pinned 11.90.0 (`visual-language.md` §7).

**Q25 Motion (resolved for now: answered 11-02).** You: *"they are ok for now"*. A 600 ms tint when a row's state changes and 90 ms fades for floats; macOS Reduce Motion turns both off. The state-change tint is the one to drop if it feels busy.

## Taste and muscle memory

**Q01 Fonts (resolved: answered 10-29, chrome face answered after E-PROTO-3).** Iosevka v34.9.1 for code, IDs, keys and fixed numeric columns; Iosevka Etoile for chrome and prose (Q28). All bundled, SIL OFL 1.1, checked at startup (`stack.md` §4).

**Q02 Prose face, size and measure (resolved: 10-29; size changed 10-30 and again with the Brief, adopted 11-06).** Iosevka Etoile, computed at startup from the bundled reference paragraph.
- **Size:** 14/21 with the Brief, down from 15/24 (after the trials you said prose was too big) and 16/26 before that.
- **Measure:** 80 average characters, 600 px at 14 px (`visual-language.md` §4.1). It was 68 characters, 548 px at 15 px.
- `␣tp` switches prose to Iosevka (the nvim feel), and `␣tw` widens the measure.

**Q03 How the prompt sends (resolved by the Brief).** `⏎` in Normal sends, `⌘⏎` sends from Insert, `⏎` in Insert is a newline, and `M-⏎` queues a follow-up. The composer's header says whether the send prompts or steers.

**Q04 `c` means annotate in read-only views** (and `gc`, your mini.comment habit). *Recommendation:* accept.

**Q05 Authority confirmation.** Every authority command is readback + `y`, with typeahead discarded and a read basis. *Recommendation:* accept. If a trial shows reflexive confirms, add a typed code for accepting an intake only.

**Q06 Arming delay** before `y` counts in a readback (default, user may override). Keys timestamped before the readback was drawn are discarded; pointer clicks within 400 ms of it are discarded too (FC-T22). *Recommendation:* no key arming delay beyond that by default; measure accidental confirms in a trial (Q39).

**Q07 Hint key `gs`**, not vimium's `f`. *Recommendation:* accept.

**Q19 Interrupt is `␣cx`**; `Esc` and `C-c` never interrupt. *Recommendation:* accept.

## Behaviour

**Q10 Device-local draft journal.** *Recommendation:* yes. Drafts surviving restart and resnapshot is measured on the earlier prototype.

**Q11 Landing view (resolved by the Brief).** The Brief is always tab 1 and the landing view, with the cursor on the oldest Needs you entry.

**Q12 Brief order.** *Recommendation:* oldest first within each group; `blocks N` is in each entry's foot.

**Q13 Notifications.** *Recommendation:* off by default; dock badge count only.

**Q27 Quarantine as "needs you".** A quarantined sandbox needs an operator action on the host. It sits in its own group, **On the host**, directly under Needs you, with its own `×` tag. Needs you is decisions only, and each group has one number everywhere (FC-M35).

**Q38 Where proposal progress lives (resolved: answered 11-01; moved with the Brief).** You: *"Move to Proposals tab"*. Proposal progress and readiness live in the Proposals list (`␣oP`) and the Proposal page (SC-19); the Brief shows a proposal only when it needs you, such as `Merge main · on the forge`.

## Protocol (asks of the host)

**Q14 Who computes consequences (resolved by the accepted spec for actions; EFFECT and NOT text remain the ask, RQ-06).** Snapshots carry exact available actions (S§5.2.1 L351). Every authority command needs a host decidable.

**Q15 Search.** *Recommendation:* server-side search (RQ-21); client-only is acceptable for v1.

**Q16 Revoking a device from another device.** Deferred in v1. *Recommendation:* add later as an authority command if the host's admin interface proves too slow.

**Q17 Approve-with-notes (resolved by the accepted spec).** It approves the original emitted bytes, carrying saved notes as nonbinding (S§8 L959).

**Q32 Slice lifecycle vocabulary (default, user may override).** The Slices list filters on lifecycle states. Their names, labels and mark classes should come from the host with the slices scope (RQ-41). *Recommendation:* the host owns the vocabulary and sends each state's label, mark class and `open` flag; the client falls back to the raw state name with the unknown mark.

## Later

**Q18 Canvas library.** *Recommendation:* Excalidraw (MIT), when canvas work starts. rune has no web view, so the canvas is also when that gets revisited (`stack.md` §3).

**Q20 TUI keyboard protocol.** *Recommendation:* kitty protocol when available; the listed alternates otherwise. `⌘K` and `⌘⏎` are GUI-only aliases.

**Q21 Human trial sessions (skipped: answered 11-02; the Brief's own trials are Q39).** You: *"let's skip the human trial and on-screen GPUI and IME"*. The earlier round ran on a frozen early build: (a) 5-second 18/25; (b) handover 3/5 within 10 s; (c) checkpoint review a discovery failure, 264 command keys against 35 scripted; (d) reading, 1 of 4 conditions (`evidence.md` §4.4). On-screen GPUI is moot with rune; the on-screen and IME tests are now Q43.

**Q36 Side-pane content (superseded by the Brief).** You kept the side-pane content bar (11-02). The Brief has no side panes; the 2 px content bar stays for content outside a document or transcript (the Brief's ask, margin notes, previews), at `prose.small` 13/19.

**Q37 Mono variant: Iosevka or Iosevka Term (resolved: answered 11-01).** You: *"Keep Iosevka"*. In Iosevka's default spacing, `— → … ⏎ ▸ ↺` are two cells wide and `· ⟨ ⟩ ␣ • ◦` one, and column widths count them so (`stack.md` §4).
