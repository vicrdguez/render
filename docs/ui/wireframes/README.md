# Wireframes

Three sources, in order of authority:

1. **[`layout.md`](layout.md)** is normative. It is the pixel layout spec at 1512 × 982, with regions, sizes, tokens and sample content, kept current through the final phase:
   - prose 15/24 and the 548 px measure;
   - grow-right breakout;
   - structured rows;
   - NEEDS YOU / ON THE HOST;
   - SC-10h copy.
2. **`wireframe-*.png`**, exported from [`render-ui-wireframes.tldraw`](render-ui-wireframes.tldraw), are the drawings the user approved on 2026-10-29: the frame, SC-02, SC-03, SC-04, SC-09, SC-12, SC-14 and SC-16. **They are older than the spec** (phase 3). Where a drawing and `layout.md` disagree, `layout.md` wins. Later changes not drawn:
   - **Fonts:** chrome in Iosevka Etoile, not Plex Sans. Prose is 15/24 rather than 16/26, so text columns sit at x 331–879 (chat) and 432–980 (review).
   - **SC-03 chat:**
     - no per-message author bar;
     - stronger tool tints with a 1 px `border.strong` edge and no icons (no gutter dots);
     - the coordinator's name is neutral, not gold;
     - references are gold Iosevka with a solid underline.
   - **SC-02 queue:**
     - an ON THE HOST group under NEEDS YOU · 3;
     - `RUNNING · 4 · slots 4/4`;
     - the failed mark is an octagon;
     - downstream counts are 4 / 25.
   - **Bufferline:** host segment (`homeserver · protected to seq …`).
   - **Breakout:** code, tables and diagrams grow right from the text column and never cover the gutter.
   - **SC-09:** the readback is grey, with only a coral top rule and diamond (the drawing has a coral fill), and it scrolls its target above itself.
   - **SC-16:** proposal rows show the strip on a second line; structured side-pane rows.
3. **[`text-mocks.md`](text-mocks.md)** holds 160-column text grids for every screen, including those without a drawing (SC-01, SC-05–SC-08, SC-10 a–h, SC-11, SC-13, SC-15). They show structure only; a text grid can't show tints, underlines or faces.
