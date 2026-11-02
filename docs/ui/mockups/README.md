# Mockups: HTML-prototype renders, not GPUI

Every image here is a **render of the HTML prototype**, not of the GPUI client, against the scripted fake host.
- **Size:** 1512 × 982 logical px (a maximised 14″ MacBook Pro window), unless the name ends in `-800` (an 800 px wide window).
- **Variant:** `ember` (dark, the default) unless the name says `-soft` or `-light`.

They show layout, type and copy as of their build. They do not show GPUI's text rendering, real fonts at native hinting, or GPUI performance.

**Every `proto-*` image predates the current colour system** (`reference/visual-language.md` §5.3–§5.6), so read their colours as history. The captions don't repeat this.

## Colour reference

The closest renders to the current colours are the `colour-*` images, from the colour pass (`experiments/e9-colour/`, Ember at 1512). **All of them show the previous link and inline-code colours:** references and links are still gold, and inline code and code frames still orange. They draw nothing in Soft or Light. Other differences per image:

| File | Shows | Also not current |
|---|---|---|
| `colour-SC-02-queue-ember.png` | Count tags, plain coral diamonds, the coral `NEEDS YOU` caption, steel labels, sage projects, orange IDs and key chips, role hues | — |
| `colour-SC-02-calm-ember.png` | The calm queue: colour, and nothing that reads as needs-you | OWNER prints `undefined`, a fake-host glitch |
| `colour-SC-04-review-ember.png` | `h1` rose and `h2` orange in a review; thin coral on the cursor bar and tab | — |
| `colour-SC-04-markdown-ember.png` | Inline forms and heading levels: bold steel, `h3` and below in `fg`, dangling references | Italic is mauve here; it is neutral |
| `colour-SC-03-chat-ember.png` | Roles and IDs in a transcript, the caret, the info pane | The strip's NEXT is a tag; it is the plain diamond. The rose and mauve counts have no tag |
| `colour-SC-09-readback-ember.png` | The grey readback, verb tag, solid `READBACK` badge, steel field names | The strip and REVISIONS draw tags, the top-bar rose and mauve counts have no tag, and headings are steel |
| `colour-SC-19-package-ember.png` | The quiet Slice rows, typed outcome words, top-bar tags | — |

## Older renders

**No single build carries the whole spec, and the images were not re-rendered for the last design pass. The spec's text wins over any image.** Each caption in [`spec.md`](../spec.md) says what its render gets wrong. Four places matter most, because the old picture shows something now wrong rather than merely missing:

| Screen | Image | What is wrong in it |
|---|---|---|
| **SC-07** | `proto-SC-07-pass-lineage-ember.png` (lineage build; replaces the older render, which called the Audit "behind") | Strip NEXT prints `␣ad` (should be `␣n`); COMMITMENT is cut (see spec §2.1); the bufferline prints seq and time; the INTEGRATION panel's wording is older |
| **SC-10d** | `proto-SC-10d-op9-recovery-ember.png` (readiness build; replaces the older render, which called reissue deferred) | The DECIDE line prints `then ␣ad` (should be `⏎` only); the title should read `create draft proposal PR` |
| **SC-09** | `proto-SC-09-*.png` (kept: every later build is wrong on the same point) | BINDS lacks `request … captured`, and shows a bare dash where the spec has `none`; the stale readback's `d` isn't a chip and its key bar isn't `confirm disabled` |
| **SC-02** | `proto-SC-02-queue-merge-row-ember.png` (package build); `proto-SC-02-queue-ember-*.png` and `proto-CALM-queue-ember.png` are older | Package build: BLOCKER should read `none · 1 uncertainty`; no statusline counts; no bufferline seq or time. Older: the PROPOSALS block and legend, `rework 1/2`, card NEXT `␣ad` |

**Other differences:**
- **SC-19 (package build):** not drawn: the CHECKS line, BLOCKER `none · 1 uncertainty`, Slice columns next to the name with K.
- **SC-04 and SC-01:** older: class letters and legend, DECISION segment, bufferline seq and time.
- **SC-16 Proposals (package build):** line 2 is current; the frame is older.
- **SC-17 (settings build):** the settings view is current; the frame is older.
- **SC-10h (host restored):** the spec's copy was rewritten in plain words after this render.
- **SC-14 diagrams:** drawn by mermaid.js as a stand-in for Pele. Label sizing, and one note box in Figure 1, differ from what Pele with the Etoile measurer will produce.
- **Host segment:** older renders run it into `seq`.

| File | Screen |
|---|---|
| `colour-*.png` | The colour reference above |
| `proto-SC-01-frame-ember*.png` | SC-01 workspace frame |
| `proto-SC-02-queue-merge-row-ember.png`, `proto-SC-02-queue-ember-*.png`, `proto-CALM-queue-ember.png` | SC-02 needs-me queue, and the calm state |
| `proto-SC-03-chat-*.png` | SC-03 chat: main, expanded tool call, candidate (Soft), Light, 800 px |
| `proto-SC-04-*.png` | SC-04 review, note-here, empty notes, and Markdown (Light, cursor, breakout, code, table at 800) |
| `proto-SC-05-*.png`, `proto-SC-06-*.png`, `proto-SC-07-pass-lineage-ember.png` | SC-05 diff, SC-06 dispositions, SC-07 evidence |
| `proto-SC-08-agents-ember.png`, `proto-SC-16-agents-ember.png` | SC-08, which is the explorer's Agents tab |
| `proto-SC-09-*.png` | SC-09 decision, decision readback, approve readback (Light), stale readback |
| `proto-SC-10*.png` | SC-10 a–e and h |
| `proto-SC-11-*.png` … `proto-SC-16-*.png` | picker, which-key, hints, diagrams, reading, explorer |
| `proto-SC-17-*.png` | SC-17 project settings and a routing readback |
| `proto-SC-19-package-ember*.png` | SC-19 merge package |
