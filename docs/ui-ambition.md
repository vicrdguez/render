# Render UI: ambition

## ALTITUDE: what you're actually after

Render's central promise is in spec §1: *leave, reconnect and resume without reconstructing state or wondering what was authorized.* The server makes that promise and the client is where it pays off or fails. So the real outcome isn't "a nice keyboard UI". It's this:

1. **Re-entry in seconds.** You open the client cold and know within about 10 seconds what needs you, what's running and what's blocked, without reading chat. Those are the spec's five handover facts: accepted commitment, active owner, latest evidence, blocker and next human action.
2. **Authority you can't misread.** Saving is not approving. A local draft is not a host-acknowledged save. A `stale_basis` reply is a diff to read, not a toast to dismiss. An approval always shows the exact revision it binds. A UI that makes you approve the wrong bytes undoes the server's careful guarantees.
3. **Review fast enough that you aren't the bottleneck.** Checkpoint review, annotation and the decide/rework loop are where your time goes. That loop should be the most efficient path in the app.
4. **A shared command vocabulary.** The rune client and the future TUI should use the same keys, modes and command names, rendered twice. You design it once and both clients feel the same.
5. **Pressure on the wire format.** The protocol isn't settled (A012). Every screen forces the question "which fields do I need, and from which message?" The design should hand that back as concrete requirements, not quietly assume them.

**The reframed task:** design Render's client interaction model and visual language as a stack-independent spec, rune first. Prove it with a keyboard-driveable prototype running against a scripted fake host. Measure it against numeric targets, and deliver the protocol requirements it implies.

**What I'd need to do this and check it without you:**

| Need | Why | Status |
|---|---|---|
| Read access to `~/.config/nvim` (Doom Emacs is UI inspiration only; its config is not read) | Match your leader key, which-key tree, motions, font and colours so muscle memory carries over | Present on this machine |
| Real content: skl ledger docs, Contracts, long agent transcripts with tool calls, Mermaid designs, annotated checkpoints | Design against real density, not lorem ipsum | `~/skl-ledger`, **read-only** |
| A scripted fake host emitting the §5.3 snapshot/update/receipt shapes, with scenario scripts H1–H9 (stale approval, unknown outcome, sequence gap, revocation, streaming firehose) | Deterministic states to design and test against | No existing fixture host is provided; I'd build my own in `~/dev/render-ui-design`, behind a thin adapter so wire changes stay local |
| Rust + rune building on this Mac (Rust installed via `mise`); screen capture permission | Spike the risky parts and take screenshots for verification | rune builds here; the E-RUNE-1 spike ran headless on 2026-11-06 |
| The browser pane | Drive and measure an HTML interaction prototype automatically | Available |
| Two short sessions of your time | Only you can judge "feels like home"; handover timing needs a real human | To schedule |

## DEPTH: what a top practitioner would add

**Raw material first:**
- A **task inventory with frequencies**: how often you triage, read, steer, interrupt, review, annotate, approve, cancel and recover. Frequency × cost decides who gets the short keys. That's frequency-weighted allocation, Huffman coding applied to a keymap.
- **Real screens of data**: actual snapshot JSON, actual 2,000-message transcripts.
- A **failure catalogue written before any mockup**, per your CLAUDE.md rule.

**Methods and tools:**
- **Grammar before pixels.** Use vim's verb + object model with Render's own objects: checkpoint, annotation, hunk, assignment, slice, evidence. For example, select a range in Visual mode and press `c` to comment, `]a`/`[a` to jump between unresolved annotations, `]c` to jump between diff hunks. Modes are Normal/Insert/Visual plus a **minibuffer** (`:`, `SPC SPC`) with which-key discovery on the leader key.
- **Navigation that works like vim:** a jumplist (`C-o`/`C-i`), marks, `/` search in every pane, `C-w hjkl` between panes, and a quickfix-style list of what needs you.
- **Avy/vimium-style hint mode** so every visible target is reachable by keyboard, not just the ones that got a binding.
- **The keymap as data.** One declarative table shared by the rune client and the TUI, with lint rules: no prefix conflicts, no authority action on a single unmodified key, and every command reachable. The cheat sheet is generated from it.
- **Target pinning.** A key sequence acts on the item that was under the cursor when the sequence *started*. A streaming update inserting a row must never redirect your `a` (approve).
- **Visual system:**
  - a character-cell grid
  - 1px rules
  - 0–2px corner radius
  - a base16-style palette where colour means state, not decoration
  - explicit marks for local/saved/stale/unknown, like vim's `[+]`
- **Speed instruments:** event→frame timestamps logged in-app, Instruments on macOS, and a synthetic stream firehose from the fake host. Behaviour checks use rune's test `Runtime` (scripted keys and IME, element tree) and browser automation for the HTML prototype.
- **Check the transcript's framework claims.** Things like GPUI Kit v0.8.0 WebView and `gpui_web` maturity are after my knowledge cutoff, so I can't vouch for them. I'd confirm them against current sources before relying on any.

**A target that sounds unreasonably high but is achievable:**
> **100% of commands reachable by keyboard, checked by script.** Answer all five handover questions from a cold reconnect in **≤10 s** (the spec's V8 target is ≤2 min). A full checkpoint review with 3 annotations and a rework request takes **zero pointer events and ≤40 keystrokes** after reading. Keystroke-to-frame **p99 ≤ 8 ms** (one 120 Hz frame). Smooth scrolling of a 10k-message transcript while 4 agents stream at 2k tokens/s. You complete your top 10 tasks **on the first try using only which-key discovery**.

## RANGE

**As verbs**, the client must let you: **triage, orient, read, follow, steer, interrupt, inspect, compare, review, annotate, decide, cancel, recover, jump, find.** "Chat view, status panel, document viewer" are nouns that hide most of these.

| Field | Technique I'll actually apply |
|---|---|
| **Aviation cockpit design** | **"Dark cockpit":** normal states stay visually quiet, and colour and contrast are reserved for things that are abnormal or need you. **ATC-style readback:** every authority command echoes its exact binding (checkpoint revision, annotation-set revision, basis hash) in the minibuffer before it commits. |
| **Editorial typography** | A **baseline grid and a fixed line length** (about 72–80 characters) for chat and documents, with hierarchy from weight, case and indentation instead of boxes and size jumps. Checked by reading trials on long real transcripts. |
| **Linguistics / formal grammars** | Write the command language as a **small formal grammar** (lexicon of verbs, objects and modifiers) and machine-check it for ambiguity and prefix conflicts per mode. That's how "composable like vim" stays coherent at 150 commands. |
| **Cartography** | **Semantic zoom with consistent generalisation:** overview → proposal → slice → artifact, each level with a fixed "legend" (the same glyphs and colours mean the same state at every zoom). Plus small multiples for many slices' status. |
| **Lean operations (andon boards)** | The "needs me" queue is an **andon board**: work in progress, waits and blockers are visible at a glance, and waiting on a human is shown separately from waiting on models or CI. |

**Adversarial perspective: a red-teamer trying to make you approve the wrong thing.** Attacks:
- **Focus theft:** a stream update moves the cursor so a keystroke lands on a different item.
- **Chrome spoofing:** agent-authored Markdown, Unicode or bidi text that imitates a status line or an "approved" badge.
- **Muscle-memory traps:** `dd`, `:q`, `ZZ` or `.`-repeat doing something destructive in a Render context.
- **Stale screens:** approving a view the host has already moved past.
- **Lost outcomes:** disconnecting mid-command and assuming it failed.

There's a second adversary to the whole design: **"I'd rather just use nvim plus a TUI."** If the rune client isn't measurably better than a terminal baseline for reading and reviewing, it has failed. That's tested, not argued.

## VERIFICATION: evidence other than my judgment

1. **Keymap lint (CI-able):** every registered command has a binding or a minibuffer entry. No prefix conflicts within a mode. No authority or destructive action on a bare key. The cheat sheet regenerates from the table.
2. **Keyboard-only coverage run:** scripted runs of the top tasks with the pointer disabled. Fails if any task needs a mouse, and records keystroke counts per task.
3. **Target-pinning and spoofing traps:** fixture scenarios inject list changes mid-sequence and hostile content. The assertion is that no command hits an item other than the one displayed at the start, and no agent content renders in chrome styles.
4. **Protocol conformance on recorded fixtures:** duplicate or older sequence numbers are discarded, a gap triggers a fresh snapshot, an unknown outcome retries with the original ID, and `stale_basis` renders a diff. The TUI reuses these fixtures later.
5. **Performance measurements:** event→frame p50/p99, firehose frame drops, 10k-message scroll and cold start. Measured numbers in a table, not estimates.
6. **Human trials (your time, timed by log):** a 5-second test on status screens, the five handover questions on randomised fixture states, and a timed checkpoint review. Compared against your current baseline, nvim plus the review TUI.
7. **Dogfood telemetry:** pointer-event counts and minibuffer queries that matched nothing. Those misses are a direct list of missing commands.
8. **Contrast:** computed WCAG AA for the palette in both themes.

## Open decisions (my defaults in bold)

1. **Prototype medium:** **an HTML interaction prototype** (fast, driveable by my browser tools) **plus a narrow rune spike** for the risky parts: streaming Markdown, virtualised chat, a modal prompt editor and input latency. Alternatives are rune only, or static mockups only.
2. **Prose font:** **mono chrome plus mono prose by default, with a proportional reading font as a tested option.** The reading trials decide; your taste isn't overridden.
3. **Canvas (tldraw/Excalidraw):** **design only the boundary in this pass.** Mermaid renders natively in v1, and interactive canvas editing comes later.
4. **TUI:** **share the grammar and keymap table and check that they map to the terminal**, but don't lay out the TUI screens.

## Rewritten prompt

> **Design Render's client as a keyboard-native, stateless interface to the Render host, and prove the design with measurements, not taste.**
>
> Work in `/Users/vrod/dev/render`. Use `~/dev/render-ui-design` for all experiments and design work. Read `docs/spec.md` (WIP), `docs/spec-review-notes.md` (A001–A023 take precedence over the draft: Kernel/Ledger/Engine naming, no web client, no descriptive issues, non-expiring enrollment, server-only spec) and `docs/ambition.md`, plus the GPUI/TUI brainstorming transcript. Verify any framework capability claims from the transcript against current sources before relying on them. Read my `~/.config/nvim` config and match my leader key, motions, which-key style, font and colours. Doom Emacs is UI inspiration only; don't read its config. Real content is in the skl ledger at `~/skl-ledger`, which is **read-only**: never write to it. No fixture or scripted host is provided; build your own. Install Rust through `mise` when needed.
>
> **Outcome:** I can open the client cold and within 10 seconds know what needs me. I can read agent chats comfortably, review and annotate designs, and make explicit decisions without ever doubting what an action binds to, all without touching the mouse. It should feel like neovim/Doom Emacs: modal, composable, minibuffer-driven, compact, sharp lines, no big rounded corners or big buttons, clean information hierarchy. A personal self-hosted tool, not an enterprise product.
>
> **Treat the wire format as unsettled.** The client consumes a client-side view model through a thin protocol adapter, so wire changes touch only the adapter. Don't edit the server spec. Instead, deliver a list of view and command requirements, and gaps against §5.3, as feedback for it.
>
> **Write the failure catalogue before any mockup or code:** ways the UI could mislead (stale views, focus theft, chrome spoofing by agent content, muscle-memory traps, unknown outcomes, local vs saved confusion), lose input, or block keyboard use.
>
> Deliver:
> 1. A task inventory with estimated frequencies, and the five handover facts mapped to screens.
> 2. The failure catalogue.
> 3. The interaction grammar: modes, leader/which-key tree, minibuffer, motions and text objects over Render objects, hint mode, jumplist, target pinning, and authority-command readback. The keymap is a single declarative table with lint rules, shared by the rune client and a future TUI (mapping check only for the TUI).
> 4. The visual language: cell grid, type, line length, semantic palette tokens (dark and light), borders/radius, density, and the state marks for local/saved/stale/unknown/blocked.
> 5. Screen designs: workspace layout, "needs me" queue/overview, chat reader with modal prompt and steering, checkpoint review and annotation, emission diff, annotation disposition map, evidence/receipts, assignments/agents, decision confirmation, and reconnect/stale/unknown-outcome states. Mermaid renders natively; the canvas is a boundary only.
> 6. A scripted fake host emitting the spec's proposed shapes, with scenarios H1–H9 and a streaming firehose.
> 7. An HTML keyboard-driveable interaction prototype on the fake host, plus a narrow rune spike for streaming Markdown, a virtualised 10k-message chat, the modal prompt editor and input latency.
> 8. The client→protocol requirements list.
> 9. A verification report.
>
> **Verify with checks, not opinion:** keymap lint; a keyboard-only scripted coverage run with keystroke counts; target-pinning and spoofing trap fixtures; conformance on recorded sequences (dedup, gap resnapshot, unknown-outcome retry, stale-basis diff); measured event→frame p50/p99, firehose frame drops, 10k-message scroll and cold start; WCAG AA contrast; and timed human trials with me (5-second test, the five handover questions, a checkpoint review) against my nvim + TUI baseline.
>
> **Targets:** 100% keyboard reachability; handover answers in ≤10 s; checkpoint review with 3 annotations and a rework request in ≤40 keystrokes and zero pointer events; keystroke→frame p99 ≤ 8 ms; smooth 10k-message scroll with 4 agents streaming at 2k tokens/s; top 10 tasks completed first try using only which-key discovery.
>
> **Defaults:** decisions 1–4 as listed above. **Out of scope:** server spec edits, TUI screen layout, interactive canvas editing, enterprise features (multi-user, RBAC, SSO). Keep measured results, proposed targets and remaining uncertainty clearly separate. The prototype is disposable evidence, not the production client.
