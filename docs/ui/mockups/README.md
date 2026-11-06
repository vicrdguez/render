# Mockups: renders of the Brief prototype

Every image here is a headless Chromium render of the HTML prototype (`~/dev/render-ui-design/experiments/e10-modern/proto/`, `node build.mjs`), driven by a scripted fake host. None is a rune render.
- **Size:** 1512 × 982 logical px (a maximised 14″ MacBook Pro window), unless the name ends in `-800` or `-1200` (an 800 or 1200 px wide window).
- **Variant:** Ember dark, the default, unless the name starts with `light-`.
- **Build:** the final run, 2026-11-06 19:58 (+04), against the settled spec text. Its checks are in [`../evidence.md`](../evidence.md) §1.

The images show layout, type, colour and copy. They don't show rune's text rendering, its wrapping or pills, real font hinting, or performance. **The spec's text wins over any image.** The frame regions, outlined and labelled with their pixel boxes, are in [`../wireframes/`](../wireframes/).

## Where the renders differ from the text

| Images | What the render shows | What the text says |
|---|---|---|
| `brief-heavy` | `20 more below`: 10 Waiting rows fit under Needs you and On the host at 1512 × 982 | `↓ 15 more below` |
| `review-delegated` | modules r2 delegated: the Track's current stage is Modules with the bot icon | The delegated example is render-cli seams r1: `✓ Ground — ⚙ Seams — ◌ Modules — ◌ Proposal — ◌ Record` |
| `brief-k`, `frame-leader`, `list-slices-k`, `list-slices-filter`; `decision-insert` | Under a float, the `⏎` chip on a solid coral head is hidden, not muted. In Insert, the coral `◆ ␣ad Answer Q1` takes the muted neutral shape | Every chip and segment outside a float, and the Track row's chips in Insert, are `fg.muted` and inert. A muted chip on coral is 1.3:1, so the render hides or neutralises it |

## The Brief (SC-02)

- `brief-landing.png`: the landing view after an hour away: the since line, the cursor on the needs-you head of `Direction on Q1`, Running on the right with each row's `lastActivity` on the content bar and its host time.
- `brief-nothing-changed.png`: back after an hour with no row moved: `away 1 h · nothing changed`, no strong titles.
- `brief-k.png`: `K` on `Answer Q1`, the handover in full in the bottom float, its footer `j k move · ⏎ opens · ␣n opens next · K closes`; the cursor entry stays above it and everything outside is muted.
- `brief-since-list.png`: `za` opens the since-you-left list, five rows with their before and after groups.
- `brief-never-left.png`: you never left, so no since line.
- `brief-since-offline.png`: the since line after the client was offline.
- `brief-since-restore.png`: the since line after the host was restored from a backup.
- `brief-merge.png`: a merge entry, with the needs-you head on `Merge main · on the forge`.
- `brief-cancelled-slot.png`: a cancelled run still holding its slot, with the hollow slot pip.
- `brief-heavy.png`: 30 waiting rows, the 2 px coral bar on a non-needs-you row, and `20 more below`.
- `brief-800.png`: the Brief at 800 px, one column.
- `brief-1200.png`: the Brief at 1200 px, columns 632 and 416 (`layout.md` §0.1).
- `light-brief.png`: the Brief in Light.

## Frame (SC-01, SC-10h, SC-11, SC-12)

- `frame-tags-calm.png`: the calm state, nothing needs you and no coral fill; the `?` tag stays.
- `frame-host-late.png`: the host segment when backups fall behind: `unprotected since seq 18340 · 7 m`.
- `frame-host-offline.png`: the review offline with 1 draft on M5 ¶1; rework and approve are off with a dashed edge, and the draft stays on this device.
- `frame-host-restore.png`: the host restored from a backup, with the notice on the Brief (SC-10h).
- `frame-leader.png`: which-key after `␣`, with `␣ views`; the pending `␣` is in the statusline and everything outside the float is muted.
- `frame-leader-a.png`: which-key after `␣a` in the review (SC-12).
- `frame-cmdline.png`: the `:` line in the bottom float, with completions (SC-11).
- `frame-status-visual.png`: V-LINE in the review, two paragraphs selected, the VISUAL badge.

## Chat (SC-03)

- `chat-stream.png`: the coordinator transcript while it streams.
- `chat-tools.png`: a folded tool call under the cursor.
- `chat-steer.png`: INSERT in the steer composer, with no pencil icon; the footer prints only Insert keys.
- `chat-idle.png`: the transcript after the turn ends.
- `chat-new.png`: a new chat with no transcript.

## Review (SC-04, with SC-05 and SC-06 as lenses)

- `review-notes.png`: modules r2 with margin notes, the previous round and the challenger summary.
- `review-composer.png`: INSERT in a note composer on M4 ¶2; the note stays on this device until you save, and the Track row's chips and `:w` are muted.
- `review-changes.png`: the compare lens, change 5 of 7, r1 → r2.
- `review-dismissed.png`: a dismissed note `@6` with the coordinator's reason.
- `review-wide.png`: an interface line wider than the measure, and the margin note stubbed below it.
- `review-hint.png`: the `+ note c` affordance in the margin beside the cursor paragraph, in a saved review.
- `review-readback-fresh.png`: the approve readback, fresh, with the READBACK badge and the solid verb tag.
- `review-readback-stale.png`: the approve readback, stale, confirm off.
- `review-readback-changed.png`: the approve readback when the annotations move while it is open.
- `review-readback-rework.png`: the rework readback.
- `review-delegated.png`: a review delegated to an agent, with the bot icon instead of the ◆, the slot `delegated (s3) · agent decides · saved notes must be answered first` and `␣ax cancel`.
- `review-spoof.png`: the Contested section, whose content imitates an approval; it is content, not chrome.
- `review-800.png`: the review at 800 px, with the notes inline.
- `review-1200.png`: the review at 1200 px: text column 288–888, notes 928–1184 (`layout.md` §0.1).
- `light-review-notes.png`: the review in Light.
- `light-readback-fresh.png`: the fresh approve readback in Light.

## Decision (SC-09)

- `decision-q1.png`: Q1 with its three options and the evidence that bears on them.
- `decision-insert.png`: INSERT in the answer's composer; the footer prints only Insert keys.
- `decision-readback.png`: the answer readback.
- `decision-800.png`: the decision at 800 px.

## Evidence (SC-07)

- `evidence-chain.png`: the evidence chain for Execute symbolic Calls.
- `evidence-findings.png`: the findings, cursor on F16, needs-human, which leads to Q1.
- `evidence-matrix.png`: the obligation matrix, cursor on A1.
- `evidence-passes.png`: the pass list, cursor on the historical pass 1.
- `evidence-web.png`: a retained web passage, shown as content.

## Proposal page (SC-19)

- `proposal-eligible.png`: the proposal page with the at-target coral primary `␣n Merge main · on the forge`.
- `proposal-not-eligible.png`: the same page not eligible, the primary disabled.
- `proposal-slices.png`: the Slices section of the proposal page.
- `proposal-url.png`: the forge URL float.
- `proposal-800.png`: the proposal page at 800 px.

## Lists (SC-08, SC-16)

- `list-slices.png`: the Slices list filtered to needs human and awaiting review, the needs-you head on the cursor row, the peek on.
- `list-slices-filter.png`: the filter float (`␣sf`).
- `list-slices-k.png`: `K` on a Slice; the peek gives way while the handover is open.
- `list-slices-empty.png`: a filter with no matches in its scope, pointing to the match elsewhere.
- `list-proposals.png`: the Proposals list (`␣oP`) with the peek.
- `list-agents.png`: the Agents list with an assignment preview (SC-08).

## States (SC-10)

- `states-offline.png`: the Brief offline, with the notice and no since line.
- `states-fresh.png`: reconnected to a fresh snapshot, with the `[!]` gutter on the changed paragraph.
- `states-stale-basis.png`: the stale-basis reply to an approve.
- `states-unknown.png`: the outbox, 1 unknown, 1 waiting, 2 refused, with the slot `? rework request · no reply since 14:09:30`.
- `states-op9.png`: the operation view for `op9`, an effect with an unknown outcome.
- `states-revoked.png`: the review when this device's access is revoked.
- `states-cant-show.png`: content missing on the host.
