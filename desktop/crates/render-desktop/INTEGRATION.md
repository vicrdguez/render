# Native app integration and handoff

## Status

The native application is runnable, but **UI-spec acceptance is not complete**. All application work stays under `desktop/`; no host implementation, production endpoint, commit, PR or deployment is implied. The original command audit in `desktop/.audit/command-audit.md` records the earlier baseline, not the present completion state.

## Run

From the repository root:

```sh
mise exec rust@1.99.1 -- cargo run --manifest-path desktop/Cargo.toml -p render-desktop
mise exec rust@1.99.1 -- cargo run --manifest-path desktop/Cargo.toml -p render-desktop -- --demo
mise exec rust@1.99.1 -- cargo run --manifest-path desktop/Cargo.toml -p render-desktop -- --scene review --size 1200x982 --tree desktop/.audit/review.json --snap desktop/.audit/review.png
```

Default is unconfigured/disconnected. Demo and named scenes are explicitly labelled. Scenes select their own fixture directly; they do not misuse contextual navigation to find unrelated objects. Available scenes: brief, review, chat, decision, evidence, slices, proposals, agents, settings, proposal, operation, local-prompt, offline, revoked, unsupported, readback. `unsupported` currently demonstrates protocol-too-old, not the unsupported-object fixture.

Default stores are `desktop/.state/live` and `desktop/.state/demo`. `--store PATH` is an explicit override; callers must keep overridden live/demo roots separate.

## Boundaries and implemented integration

- `render-core` owns typed host facts, durable device data, read bases, drafts, outbox and session authority. Views do not consume production wire DTOs.
- `controller.rs` binds presented target, option and settings-field identities to command sequences. Readback confirmation requires a fresh actual draw and a physical, nonrepeat `y` with native input timing. Missing timing fails closed; clicking confirm cannot authorize.
- `persistence.rs` prepares exact adapter bytes, persists before transmission, and revalidates connection/epoch at dispatch. Retry uses stored bytes after a fresh core retry check. Receipt queries and reconnect do not imply replay.
- `cache.rs` persists private device-cache facts separately from local state. Restored facts are read-only: process-local host clocks are discarded and cached scopes require fresh snapshots. Merely reconnecting cannot authorize cached targets. Revoked/too-old states are retained.
- Picker sessions freeze identities and labels, support smartcase fuzzy queries, resume, preview paging and local Results export. Changed source invalidates frozen line offsets; identical tabs have distinct local identities. Results and per-tab outlines survive restart.
- Open tabs, selected tab, structured/byte cursors, scroll metadata, filters and display preferences are persisted. Byte restoration waits for the matching object revision. This is not a claim that every native scroll container's physical offset is restored.
- Native close flushes local state. With Rune `keep_running`, a failed flush preserves the in-memory session; reopening through the Dock restores the window. Transient write failures can be retried; an unreadable device record is never installed as a writable store.
- `presentation.rs` freezes list order/membership during input and applies pending layout after 1.5 seconds idle, independently of an unfinished prefix. Removed/regrouped entries remain inert tombstones instead of changing the selected command target.
- `reader.rs` uses immutable UTF-8 byte coordinates and separate semantic record identities. Operators use shared-editor ranges; streaming message ranges are refused. Navigation uses parser-derived source targets, not label/URL substring guesses. Historical jumps never silently show an unrelated latest revision.
- Policy drafts are typed, retain raw incomplete editor input, and require explicit three-way rebase. Conflicts and invalid source block safe edits. Stale acknowledgement closes readback; reissue and a new draw are required.
- Save-close and save-first continuations track command IDs independently of core's cleared draft links. They wait for accepted/duplicate receipts and required scoped observation; save-first additionally waits for a new presented frame and never confirms automatically.
- Composer paste/space/angle-bracket input, Ctrl-Enter, exact note editing, generations and consumed-draft reconciliation are wired. Native shaped clusters determine caret, selection and IME rectangle. Preedit is display-only until commit. The composer grows to eight rows and then scrolls.
- Mono prose, measure, Mermaid source and source-number toggles affect rendering. Outlines are per tab. Semantic record highlights/reveal, conditional Chat following, visible hints, diagram pan/zoom and bounded line-level comparisons are implemented.
- `presence.rs` queries main-thread AppKit key-window/visibility and the actual screen's CoreGraphics awake state. Presence also requires Brief focus and recent input. Its device-local return summary uses host timestamps and exact changed IDs; unknown signals fail closed. This is an OS-state implementation, not proof of human reading.

The binary registers actual post-draw, IME, focus and close callbacks. Public seams include `AppState`, `app_spec`, `view`, `on_key`, `poll`, `initialize`, `on_frame_drawn`, `on_ime`, `on_focus`, `on_close` and `Screen`.

## Evidence at this checkpoint

Focused parent-run checks passed after integration:

- `session_restart`: cached facts, local views and exact reader position survive restart without transmission.
- `cache_restart`: four tests for the real demo graph, structured scope serialization, read-only restoration and terminal states.
- `reader_navigation`: eight tests, including a demonstrated then fixed inline-code reference activation failure.
- `transmit_boundary`: four tests covering queued revocation/retry, failed quit flush and known-unsent preparation refusal.
- `presence_integration`: two tests for signal gating and native rendering of frozen return deltas.
- `persistence_recovery`: two tests for native-close flush retry and unreadable-record protection.
- `ime_outline`: three native Runtime tests for per-tab outline and transient shaped preedit.
- `screens` and `readback_copy`: named scene identity and native readback labels. The contextual-navigation scene regression was observed before its correction.

The cumulative workspace test, strict-clippy, formatting and boundary gate has passed; command logs and the source hash manifest are under `desktop/.audit/checkpoint-*`. All seven real-store/demo-adapter save lifecycle scenarios pass after three observed integration failures were fixed. Native captures also exposed an offscreen annotation editor on narrow long reviews; a failing Runtime regression preceded its reveal fix.

Current native captures cover sixteen scenes at four widths in all three themes (192 images/trees), with geometry checks. Representative Brief, Review and Readback images were inspected, not every pixel of every image. Actual window creation was observed at 1482×962 in `desktop/.audit/window-current/`; Accessibility and Screen Recording preflights remain false. The process logged a display-link warning and slow debug startup, and integration tests emitted occasional main-thread IO timing warnings. No latency or performance acceptance is claimed.

## Still required

1. Re-audit the 115-command catalogue against behavior. Known follow-ups include richer draft undo/counts, per-object lowercase marks and automatic marks, Design creation submission, accepted-basis/finding evidence/footnote landing, shipped scope/filter behavior, structural hint coverage, and unsupported adoption/recovery arguments. Do not count generic unavailable responses as feature completion.
2. Exact rendered Markdown glyph selection and inline hint placement remain incomplete; current selection includes an exact-byte source preview. Computed-diff/new-side reader anchors also require further work.
3. Complete visual and interaction acceptance, including full affordance/accessibility inspection and readable basis metadata. Geometry checks and selected screenshots do not establish full specification parity.
4. Physical timing, pointer/keyboard usability, screen sleep/lock transitions, real IME and accessibility usability remain uncertified. Native window creation and synthetic input are narrower evidence.
5. Large-document virtualization, incremental parsing, synchronous persistence costs and resource/performance acceptance remain unresolved. Preserve the required source-specific gate after subsequent fixes.

Production host interoperability cannot be certified before the public protocol exists. Demo-only unsupported creation/adoption/prompt-generation operations explicitly refuse. No backup, recovery protection, disaster-restore status or successful production write is invented.
