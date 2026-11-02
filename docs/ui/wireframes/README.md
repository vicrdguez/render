# Wireframes

Three sources, in order of authority:

1. **[`layout.md`](layout.md)** is normative: the pixel layout at 1512 × 982, with regions, sizes, tokens and sample content, for every screen including SC-17 to SC-19.
2. **[`text-mocks.md`](text-mocks.md)** holds 160-column text grids for every screen. They show structure only; a text grid can't show tints, underlines or real proportions.
3. **`wireframe-*.png`**, exported from [`render-ui-wireframes.tldraw`](render-ui-wireframes.tldraw), are the drawings the user approved on 2026-10-29: the frame, SC-02, SC-03, SC-04, SC-09, SC-12, SC-14 and SC-16. **They are older than the spec, so where they differ the spec and `layout.md` win.** The main differences:
   - **Fonts:** chrome in Iosevka Etoile, prose 15/24; text columns sit at x 331–879 (chat) and 432–980 (review).
   - **Frame:** the statusline has no DECISION segment; the bufferline has a host segment and no seq or time.
   - **SC-02:** an ON THE HOST group; `RUNNING · 4 · slots 4/4`; no PROPOSALS block, which moved to the explorer's Proposals tab; the card sits below the list under a 1180 px pane.
   - **SC-03:** no per-message author bar; stronger tool tints with a 1 px `border.strong` edge and no icons; a neutral coordinator; references in Iosevka with a solid underline.
   - **SC-04:** no class letters in the outline; the class word is on the node's heading row.
   - **Breakout:** code, tables and diagrams grow right from the text column and never cover the gutter.
   - **SC-09:** the readback is grey, with only a coral top rule and verb tag, and it scrolls its target above itself.
   - **SC-16:** proposal rows have a second line; the Proposals tab carries readiness.
   - **SC-07, SC-17, SC-18, SC-19:** no drawing; use `layout.md` and `text-mocks.md`.

The [`mockups/`](../mockups/) folder has HTML-prototype renders; each caption in [`spec.md`](../spec.md) says what its render gets wrong.
