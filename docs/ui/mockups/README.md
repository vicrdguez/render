# Mockups: HTML-prototype renders, not GPUI

Every image here is a **render of the HTML prototype**, not of the GPUI client:
- **Source:** the E-PROTO-5 pass (workbench `experiments/html-proto/`, branch `phase5`, `results/screenshots-phase5/`), against the scripted fake host.
- **Size:** 1512 × 982 logical px (a maximised 14″ MacBook Pro window), unless the name ends in `-800` (an 800 px wide window).
- **Variant:** `ember` (dark, the default) unless the name says `-soft` or `-light`.

They show layout, type, colour and copy as specified. They do not show GPUI's text rendering, real fonts at native hinting, or GPUI performance.

**Differences from the final spec:**
- **SC-10h (host restored):** the spec's copy was rewritten in plain words after this render (`spec.md` SC-10h).
- **SC-14 diagrams:** drawn by mermaid.js as a stand-in for Pele. Label sizing, and one note box in Figure 1, differ from what Pele with the Etoile measurer will produce.
- **Readback BINDS row:** these renders still show a bare dash for empty fields; the spec shows `none`.
- **Host segment:** these renders run it into `seq` with no separator; the spec adds a 16 px gap and a rule.

| File | Screen |
|---|---|
| `proto-SC-01-frame-ember*.png` | SC-01 workspace frame |
| `proto-SC-02-queue-ember*.png`, `proto-CALM-queue-ember.png` | SC-02 needs-me queue, and the calm state |
| `proto-SC-03-chat-*.png` | SC-03 chat: main, expanded tool call, candidate (Soft), Light, 800 px |
| `proto-SC-04-*.png` | SC-04 review, note-here, empty notes, and Markdown (Light, cursor, breakout, code, table at 800) |
| `proto-SC-05-*.png`, `proto-SC-06-*.png`, `proto-SC-07-*.png` | SC-05 diff, SC-06 dispositions, SC-07 evidence |
| `proto-SC-08-agents-ember.png`, `proto-SC-16-agents-ember.png` | SC-08, which is the explorer's Agents tab |
| `proto-SC-09-*.png` | SC-09 decision, decision readback, approve readback (Light), stale readback |
| `proto-SC-10*.png` | SC-10 a–e and h |
| `proto-SC-11-*.png` … `proto-SC-16-*.png` | picker, which-key, hints, diagrams, reading, explorer |
