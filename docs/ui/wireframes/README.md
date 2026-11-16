# Wireframes

The wireframes for the Brief design. Three sources, in order of authority:

1. **[`layout.md`](layout.md)** is normative. It holds the pixel geometry of the Brief frame at 1512 × 982 and of every screen, with notes for an 800 px window.
2. **[`text-mocks.md`](text-mocks.md)** holds structure and copy. It has one 160-column text grid for each state that matters, all on one fixture and one timeline. A text grid can't show tints, weight or real proportions.
3. **The wire renders, `wire-*.png`,** are the drawings. They are greyscale renders of the prototype (`~/dev/render-ui-design/experiments/e10-modern/proto/`, `node build.mjs --wire`). Each frame region is outlined and labelled with its name and its x, y, w and h in px.

| Render | Screens |
|---|---|
| `wire-brief-landing.png` | SC-01 frame, SC-02 the Brief on landing |
| `wire-frame-cmdline.png` | SC-01 frame with the command line, SC-11 palette |
| `wire-chat-steer.png` | SC-03 Chat, steering a running turn |
| `wire-review-notes.png` | SC-04 Review with margin notes |
| `wire-decision-readback.png` | SC-09 Decision with its readback open |
| `wire-list-slices.png` | SC-16 Slices list with the peek |

**The text wins over any image.** Where a render differs from `layout.md` or `text-mocks.md`, follow the text. The renders come from the prototype's own data, so their numbers and copy may lag the fixture in `text-mocks.md`. Screens without a render (SC-07, SC-08, SC-10, SC-12 to SC-15, SC-17 to SC-19) are specified by the two text files alone.

**Old drawings.** The tldraw file and its `wireframe-*.png` exports showed the retired design (the queue, the strip and the bufferline). They are removed; they survive in git history at `fd270d7`. The colour renders of the Brief are in [`../mockups/`](../mockups/).
