# Screens: structural text grids

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). File names in code spans are relative to `docs/ui/`. Measured, looked-at and reasoned claims are separated in [`../evidence.md`](../evidence.md).

**These grids are structure, not the visual design.** They fix what each screen shows, where, in what order, and with what real content.
- **Where the rest lives:** pixel geometry in [`layout.md`](layout.md); colour, type and surfaces in `reference/visual-language.md` and `ember-tokens.json`.
- **Width:** at most 160 columns, roughly 10 px per column at 1512. Rows are not padded to a fixed width, and empty rows are left out.

**Reading rules hold even here:** prose wraps at words, paths truncate to `…/leaf`, and IDs are never cut.

## Conventions

| Mark | Means |
|---|---|
| `▓` at the start of a line | That line is the **solid coral head**: the selected row is a needs-you row. Text on it is knocked out in `surface.read` |
| `▌` at the start of a line | The **2 px coral bar** of the selected row (any other row, option or note). The row also sits on the cursor band |
| `▏` | A 2 px content bar. Text after it is content: agent-authored, or a note, never chrome |
| `[◆4] [×1] [?1]` | Count tags: solid blocks with the icon and number knocked out |
| `◆` | Needs you (coral). `◇` is the outlined diamond of an authority command in which-key or a palette row, never coral |
| `▸ ⧗ ? ✓ ↺ ◌ − ● ·` | Running, waiting, unknown, done, rework, to come, superseded, failed or quarantined, ready. The icons are in `reference/visual-language.md` §8 |
| `▮ ▯` | Track-row ticks on a proposal: integrated, not integrated. A coral `◆` tick is your move; `−` is superseded |
| `NORMAL`, `INSERT`, `COMMAND`, `READBACK`, `HINT` | The statusline mode badge |
| `␣aa`, `⏎`, `:w` | A key chip where the grid prints one. Chips are few by design (KL20) |
| `[rework · off]` | A disabled action segment: a dashed 1 px edge, `fg.muted`, no key chip, `· off` after its verb |
| `[◆ APPROVE]` | The verb tag that opens a readback |
| `━━━` | The top edge of the bottom float, which docks above the statusline |
| `»` at the start of the last line | The echo row under the statusline. It never prints a key chip |
| (no mark) | A grid can't show muting: while any float is open, chips and segments outside it are `fg.muted` and inert, and in Insert the Track row's chips and the statusline's `:w` are too |

A grid shows the tab bar, the Track row on work views, the stage, the statusline and the echo row. Floats dock above the statusline.

## The fixture

One fixture for every screen. Host time is 2026-10-27 14:03:12 unless a section says otherwise, ledger seq 18342, authority epoch `authority-7`. The device is your laptop; "the desktop" is your other device.

**Real (from the ledger, read-only, 2026-10-27):**
- the Slices and their states;
- the `execute-symbolic-calls` blocking decision Q1, obligations B1–B5 and A1–A6, findings W1 and F12–F17, commits `5712d1a`, `06500de` and `3be1f0c`, and the gate counts;
- the `simplify-adapter-launch-tests` hold;
- the downstream counts from the ledger graph (`execute-symbolic-calls` 4 direct, 25 in all; `specify-rsps-profile` 2 and 4);
- the Slice titles.

**Real (from `docs/spec-review-notes.md`):** the annotations A006 and A014–A022.

**Fixture, invented:**
- the `render-host` design workflow and its digests, `render-cli`, the coordinator transcript, the quarantine and `op9`;
- assignment IDs, ages and times;
- the `fast-full-test-suite` package: its title, intake, release, PR and seven of its eight Slice names;
- routing and policy revisions.

**Timeline** (all times on 2026-10-27 unless a date is given; every screen fits it):

| Time | Event |
|---|---|
| 10-14 11:05 | You accept the intake `K·5b20` for `skills/fast-full-test-suite` |
| 10-26 19:00 | `finish-full-suite-optimization` is integrated: the package's last Slice |
| 12:40 | `op9` (create draft proposal PR for render-host) is admitted; the forge reply is lost, so the duplicate risk starts |
| 12:51 | `fast-full-test-suite` is eligible, published as R4, and PR #44 is ready: the host asks you to merge main |
| 13:03 | You leave the Brief on the laptop. Presence needs the Brief tab focused, so "away" starts here; you keep working in other tabs and on the desktop |
| 13:11 | `as38` is quarantined |
| 13:22 | `execute-causal-scan` opens pass 2, staying in Running |
| 13:51, 13:55, 14:00 | `as46` (Watchdog r1, auto-tag-bookmarks), `as45` (Specify CMA) and `as42` (p2 candidate b) start |
| 13:52 | The coordinator starts turn t42 and asks for three p2 candidates at 13:53 |
| 13:54 | From the laptop you steer the coordinator (SC-03) |
| 13:57 | The coordinator emits `modules r2` |
| 13:59 | On the laptop you open modules r2 in tab 2 and write 2 local drafts (M3 L41–42, M4 ¶2) |
| 14:01 | The desktop saves `@7` on modules r2 (annotations v3) |
| 14:02 | The desktop saves `@8` on render-cli seams r1, a different object: modules r2 doesn't change |
| 14:03:12 | You are back on the laptop: the Brief (SC-02) |
| 14:05 | You go back to modules r2 and its 2 local drafts (SC-04) |
| 14:06:58 | You save the drafts: they become `@9` (v4) and `@10` (v5); each saved note is one annotation version |
| 14:07:10 | You approve modules r2 (the fresh readback in SC-04), so Needs you drops to 3 |
| 14:10 | You answer Q1 (SC-09) |
| 14:20:05 | Revoked or restored, in the orderings SC-10 f and h |

**The orderings of `@11`.** On the main line nothing else happens to modules r2. In four other orderings the desktop adds `@11` on M5 ¶1 (v6), at 14:07:05 unless noted, and four screens show that one event at different moments:
- the readback opens after `@11` arrived but before you saw it: STALE;
- `@11` arrives at 14:07:12, while the readback is open: CHANGED;
- the laptop hadn't received `@11` when you confirmed: the host answers `stale_basis`;
- the laptop was offline when `@11` arrived: the fresh snapshot on reconnect.

**Basis of modules r2 after the save:**

| Field | Value |
|---|---|
| request | C2 · captured s2 · human |
| emission | r2 `9f3c·a1e2` |
| manifest | `51d0·08ce` |
| annotations | v5 |
| decisions | `2a83·34a6` |
| intake | none |
| policy | pol3 |
| binding | bind1 |

Saved notes on r2 after the save: `@7 @9 @10`, so a readback carries **3 saved notes**. Note numbers count across the host, and `@8` is on render-cli, so it isn't carried.

**Host segment over time.** Backups protect seq 18340 at 14:01, 18352 at 14:06, 18374 at 14:11 and 18390 at 14:16. The segment's age and unprotected count follow from the screen's seq:

| Screen seq | Host segment |
|---|---|
| 18342 (14:03) | `homeserver · protected to seq 18340 (2 m) · +2 unprotected` |
| 18350 (14:05) | `homeserver · protected to seq 18340 (4 m) · +10 unprotected` |
| 18356–18357 (14:07) | `homeserver · protected to seq 18352 (1 m) · +4` or `+5 unprotected` |
| 18364–18366 (14:08–14:09) | `homeserver · protected to seq 18352 (2 m) · +12` or `(3 m) · +14 unprotected` |
| 18371 (14:10) | `homeserver · protected to seq 18352 (4 m) · +19 unprotected` |

**Other orderings.** Each of these leaves the main line at the time given and doesn't come back:
- **Offline** (SC-10 a, b): the laptop drops at 14:06:59, just after the save, and you write 1 draft on M5 at 14:07:30.
- **Rework** (SC-10 c, d): the laptop approves at 14:07:12 without `@11` and gets `stale_basis`. You open `@11`, then request rework with v6 at 14:09:30, and the reply is lost.
- **Revoked or restored** (SC-10 f, h): after the rework ordering, you write 1 draft replying to `@11` at 14:12.
- **Settings readbacks** (SC-17) are each cancelled with `n`.

---

## SC-01 Frame

Every screen has the same frame: the tab bar, the Track row on work views, the stage, the statusline, and the echo row under it. SC-02 shows it whole. Statusline forms:

```
NORMAL   Brief › Needs you › 1 of 4                                                       homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
INSERT   render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
READBACK STALE › approve modules r2                             basis r2 v5→v6 [!] pol3   homeserver · protected to seq 18352 (1 m) · +5 unprotected   seq 18357
COMMAND  render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
NORMAL   render-host › modules › r2   ✎ 1 not saved                    basis r2 v5 pol3   ○ offline 1 m   seq 18356 · as of 14:06:58
NORMAL   Brief › Needs you › 1 of 4                                    ◷ homeserver · unprotected since seq 18340 · 7 m   seq 18342
```

- The save chip `:w` is printed only while writes are on and no readback is open, and it is muted (inert) in Insert, in COMMAND and under any float (FC-K25, FC-M71).
- The basis token is on authority views only; `]d` is a chip unless a readback is open.
- The host segment is `fg.muted` when calm and `fg` with a mark when not (FC-M31).
- Messages go to the echo row, never into the statusline, so they don't compete with it for width (FC-L14).

Defends FC-M21, FC-M31, FC-M35, FC-K25, FC-T23, FC-K27. RQ-18, RQ-37.

---

## SC-02 The Brief

The landing view. The cursor lands on the oldest needs-you entry (T01, 0 keys).
- A needs-you entry's head is a move built from host fields: `next.actionKind`, `target`, `why`, `options`.
- The ask under it is a content-typed host field shown as content on the content bar (FC-S25), or a labelled host value.
- Rows that changed since your return have a strong title (FC-M67). `Review Modules r2` is the one new for you.
- The Running rows print `lastActivity` as content: one `prose.small` line on the 2 px content bar (`▏`), because the agent reports it (RQ-50). Its host time stays in chrome at the right (FC-M69, RQ-33).

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]

    Needs you 4                                                                              Running 4 ▬▬▬▬                                  slots 4/4
    ◷ Since 13:03 on this device · away 1 h · 1 new for you · 1 on the host · 3 started      ▸ Execute causal Scan  minos                          41m
                                                                                                implementer · pass 2
  ▓ ◆ Direction on Q1 · held by you                                            8d 5h ⏎ ▓        ▏ rework: Contract IR 0.3.0 · editing evalu…   1 m ago
      Reduce adapter and launch test runtime while preserving regression protection  skills  ▸ auto-tag-bookmarks  lnkr                             12m
      ▏ authorized one-token production fix in ledger/merge.go awaits direction                 Watchdog r1
    ─────────────────────────────────────────────────────────────────────────────────────       ▏ reading integrated diff                     20 s ago
    ◆ Answer Q1 · 3 options                                                           2d 4h  ▸ Specify CMA and its foundational Processors  minos  8m
      Execute symbolic Calls  minos / native-engine                                             implementer · pass 1
      ▏ What does a Call mean when it binds two distinct callee Axes to one caller Axis?        ▏ writing plan.md                              3 m ago
      ✓ Contract — ↺ Pass 1 — ◆ Pass 2 — ◌ Integrated                            blocks 25   ▸ render-host · p2 candidate b  render                  3m
    ─────────────────────────────────────────────────────────────────────────────────────       experiment candidate
    ◆ Merge main · on the forge                                                      1h 12m     ▏ fixture: sqlite + files                     40 s ago
      Fast full test suite  skills / fast-full-test-suite
      blocker none · 1 uncertainty                                                           › Done, last 24 h 3
      ▮▮−▮▮▮▮▮ 8 Slices · 7 integrated
    ─────────────────────────────────────────────────────────────────────────────────────
    ◆ Review Modules r2 · 6 dispositions                                                 6m
      Render host design  render
      ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record

    On the host 1
    ● as38 quarantined · Specify RSPS behavior                                          52m
      still running after grace · inspect or restart the sandbox runtime  minos / native-evaluation   blocks 4

    Waiting, not on you 6
    ⧗ Route a prompt by task shape into a single-slice Proposal   dependency · integrate-fast-full-test-suite     4d
    ⧗ Record design checkpoints, annotations and experiments in…  dependency · work-router                        4d
    ⧗ Replace explore and propose with the design playbook        dependency · checkpoint-engine                  4d
    ⧗ Evaluate exact Sum with shared demand handling              slot 4/4 busy                                  41m
    ? create draft proposal PR · render-host                      duplicate risk · effect · forge reply lost · …  1h 23m
    ⧗ render-cli · seams r1                                       delegated (s3) · agent decides                 15m

NORMAL   Brief › Needs you › 1 of 4                                                       homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» incoming 1: auto-tag-bookmarks Watchdog finished · the list updates when you pause
```

**Notes on this grid:**
- `Review Modules r2` changed since 13:03 (it joined Needs you at 13:57), so its title is drawn in `ui.strong`. A grid can't show weight.
- The tags `◆4 ×1 ?1` equal the group counts: 4 needs-you entries, 1 on the host, 1 unknown (`op9`) (FC-M35).
- `Running 4` is followed by pips coloured by role (sage, mauve, sage, sage) and `slots 4/4`. A cancelled run holding its slot draws an outlined pip and adds `· 1 held by a cancelled run` (FC-M36).
- The merge entry's line is a host value, so it keeps its label `blocker` (FC-R08).
- `execute-causal-scan` is not among the 3 started: it never left Running (pass 2 opened inside it at 13:22).

**Cursor on a Waiting row.** The band, and the 2 px bar on its left edge (`▌`). No coral anywhere else.

```
  ▌ ⧗ Evaluate exact Sum with shared demand handling              slot 4/4 busy                                  41m
NORMAL   Brief › Waiting › 4 of 6                                                         homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
```

**`K` on Answer Q1: the handover float.** It has its own key set: `j`/`k` move the cursor and the float follows, `⏎` opens, `␣n` opens next, `K`/`q`/`Esc` close; every other key is inert. The list keeps the cursor row above the float (FC-T19). It replaces the strip and card of earlier designs (FC-R02).

```
    ◆ Answer Q1 · 3 options                                                           2d 4h   (the cursor entry stays above the float)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Execute symbolic Calls  minos / native-engine / execute-symbolic-calls                       reviews 1 of 2 · since 10-25 09:52 · blocks 4 direct, 25 in all
    ⚑ commitment                  ☺ owner                     ⎘ evidence                    ● blocker                         ◆ next
    Contract K·40cc · B1–B5 A1–A6 you · implementer as31·g2   pass 2 · no Watchdog on       F16 HARD · aliased callee Axes    Answer Q1 · 3 options
    accepted by you 10-03 14:32   blocked                     3be1f0c                       undefined
                                                              ◷ not yet shown to you        §8.4
    j k move    ⏎ opens    ␣n opens next    K closes
NORMAL   Brief › Needs you › 2 of 4                                                       homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**`za` on the since line.** It lists exactly the rows the line counts, with old → new group (FC-M67).

```
    ◷ Since 13:03 on this device · away 1 h · 1 new for you · 1 on the host · 3 started
  ▌ ◆ Review Modules r2                                  not on the Brief → Needs you        6m
    ● as38 quarantined · Specify RSPS behavior           Running → On the host              52m
    ▸ auto-tag-bookmarks                                 Waiting → Running                  12m
    ▸ Specify CMA and its foundational Processors        Waiting → Running                   8m
    ▸ render-host · p2 candidate b                       not on the Brief → Running          3m
NORMAL   Brief › Since you left › 1 of 5                                                  homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
```

**`za` on Done.** The collapsed `› Done, last 24 h 3` opens in place. `show-favicons` is a single-Slice proposal, archived after its merge, so the Proposals list (8 not archived) leaves it out.

```
                                                                                       ⌄ Done, last 24 h 3
                                                                                       ✓ finish-full-suite-optimization  skills / fast-full-test-suite    19h
                                                                                         integrated into proposal
                                                                                       ✓ preserve-demanded-outcomes  minos / native-engine                21h
                                                                                         integrated into proposal
                                                                                       ✓ show-favicons  lnkr                                              23h
                                                                                         merged main (observed)
```

**Variants of the since line:**
- **Offline:** `Since 13:38 on this device · offline 25 m · …`.
- **After a restore:** `Since 13:03 on this device · the host was restored · rows as they stand now`, with no counts and no strong titles (FC-M70).
- **Away, nothing changed:** `Since 13:03 on this device · away 1 h · nothing changed`, with no strong titles.
- **You never left** (presence never ended): no line, and the first group sits 16 px under the title (FC-M68).

**Calm** (a different moment: nothing needs you, nothing on the host). No coral fill anywhere. The `?` tag stays while `op9` is unresolved.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review │ 3 ▢ render-host · chat │                                                                [?1]

    Nothing needs you                                                                      Running 4 ▬▬▬▬                                  slots 4/4
    Waiting, not on you 6                                                                  ▸ Execute causal Scan  minos                          41m
  ▌ ⧗ Route a prompt by task shape into a single-slice…  dependency · integrate-fast-…     4d     implementer · pass 2
                                                                                                  ▏ rework: Contract IR 0.3.0 · editing evalu…   1 m ago
    ⧗ Record design checkpoints, annotations and exper…  dependency · work-router          4d   ▸ auto-tag-bookmarks  lnkr                             12m
NORMAL   Brief › Waiting › 1 of 6                                                         homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
```

**Heavy day** (30 waiting): the column ends on `↓ 15 more below · the list scrolls as the cursor moves`.

**800 px:** one column in `j` order (Needs you, On the host, Waiting, Running, Done); inactive tabs show number and icon.

Tasks: T01, T02, T23, T25. Defends FC-M10, FC-M13, FC-M21, FC-M24, FC-M35, FC-M36, FC-M45, FC-M50, FC-M51, FC-M64, FC-M66, FC-M67, FC-M68, FC-M69, FC-M70, FC-R01, FC-R02, FC-R05, FC-R08, FC-S25, FC-T01–T03. RQ-01, RQ-03, RQ-04, RQ-12, RQ-15, RQ-27, RQ-29, RQ-30, RQ-33, RQ-47.

---

## SC-03 Chat

The render-host coordinator, turn t42, while you are away from the review.
- Authors come only from host metadata (FC-S10).
- Tool calls are host records on an outcome tint, with the outcome word at a fixed x, bold when failed or unknown (FC-M29). Two or more adjacent `ok` calls fold.
- The composer says before you send whether `⏎` steers or prompts (FC-T20).
- The streaming tail is `fg.muted`, never coral (FC-S24).

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]
                ✓ Ground — ✓ Seams — ◆ Modules r2 awaiting you — ◌ Proposal — ◌ Record   turn t42 running · 11 m · 5 tools              ◆ ␣n Modules r2
                render-host                          ☺ you  laptop  10-26 18:41
              ▌ ☰ coordinator  turn t42      11m       A020 needs a real comparison of storage, not the SQLite default. Keep one authoritative host and
                a candidate     queued       10m       say what each option costs.
                b candidate     running       3m
                c candidate     queued       10m     ☰ coordinator  turn t42  13:52                                         in this turn
                ☰ challenger r2 done          9m       I'll answer A020 with an experiment rather than argument. Protocol p2 ✓ p2-protocol  accepted
                                                       compares three layouts against the same fixtures:
                                                         1. SQLite-held immutable document revisions
                                                         2. SQLite plus content-addressed files for large bytes
                                                         3. SQLite metadata plus Git-backed documents, where the document
                                                            history is the Git history and the database keeps only references
                                                       Falsifier: a layout fails if a clean-host restore from backup cannot
                                                       read every accepted revision, whatever its speed. Speed and size are
                                                       reported but decide nothing on their own.
                                                       › 2 tool calls                      ok · read_artifact ×2 · 0.3 s        [ok tint]
                                                       bash  rg -n 'blocksCount' host/     exit 1 · no matches · 0.1 s          [failed tint, word bold]
                                                       request_role  experiment-candidate ×3 · p2   ok · 0.4 s                  [ok tint]
                                                         a as41·g1 queued (waits for a slot) · b as42·g1 running · c as43·g1 queued
                                                       web_search  "aliased callee axes"   ok · Tavily · Exa failed · 2.4 s     [ok tint]
                                                     ☺ you  laptop  13:54  steer #1 · delivered after request_role
                                                       Don't let M3 pick a worker topology yet; A021 is still open.
                                                     ☰ coordinator  continuing t42  13:58  streaming                          ◆ modules r2  awaiting your review
                                                       Understood: M3 keeps both strategies from A021 open. Modules r2 is with
                                                       you for review: M2 now depends only on immutable revision references,
                                                       not on a document backend, and M4 allows █
                                                       ⇢ #2 13:55 · on host, not yet delivered
                                                       ▏ Keep history exportable for evals…
                                                     ┌──────────────────────────────────────────────────────────────────────┐
                                                     │ → steer · turn t42 running · delivers after the current tool call     │
                                                     │ steer the coordinator                                                │
                                                     └──────────────────────────────────────────────────────────────────────┘
NORMAL   render-host › coordinator › t42                                                  homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» follow on · any upward motion pauses
```

**Notes on this grid:**
- The human message (`you`) sits on the steel human band, which only a host `human` role produces.
- References (`A020`, `M3`, `p2`) come from the host's reference index and are drawn salmon with a solid underline (RQ-42).
- `█` is the streaming tail, in `fg.muted`.
- The right margin's `◆ modules r2 awaiting your review` is chrome: an artifact row from host fields, beside the message that produced it.

**Steering in Insert** (`i`). The badge is `INSERT` with the sage edge, and the composer footer prints its keys. There is no pencil icon.

```
                                                     ┌──────────────────────────────────────────────────────────────────────┐
                                                     │ → steer · turn t42 running · delivers after the current tool call     │
                                                     │ Also: M4 should list which credentials stay host-only now that       │
                                                     │ workers get network (A006).▌                                         │
                                                     │ Esc jk leave Insert · ⌘⏎ sends · M-⏎ queue as follow-up              │
                                                     └──────────────────────────────────────────────────────────────────────┘
INSERT   render-host › coordinator › t42   local draft → steer                            homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» steer #3 queued on host · delivers after the current tool call
```

**Prompt mode** (later, once turn t42 has ended). The header changes before you send:

```
                                                     │ → prompt · turn t42 ended · sending starts a new turn                │
```

A steer that arrives after the turn ended is refused with `turn_ended`, kept as a draft and offered as a follow-up (`␣cf`).

**Tool calls in later states, and web calls expanded (`za`):**

```
                                                       web_fetch  spec.example.org/calls   unknown · timed out · 8.1 s          [unknown tint, word bold]
                                                       read_artifact  p2 · candidate b log running · 40 s                       [running tint]
                                                       web_search  "aliased callee axes"   ok · Tavily · Exa failed · 2.4 s     [ok tint]
                                                         provider  obs  outcome            completeness  digest      time
                                                         Exa       o1   failed: allowance  none          none        09:30:58
                                                         Tavily    o2   ok                 partial       9f2c·4e1a   09:31:00
                                                         full result expired · the committed output above stays · a new fetch is a new observation
```

`may have been charged` for a timed-out primary is on `K` and `za`, not on the row (FC-M56).

**`37 new ↓`:** shown at the column foot when you scroll up while the turn streams; `G` resumes (FC-T08).

Tasks: T03–T07, T26, T31. Defends FC-L01–L04, FC-M11, FC-M29, FC-M52, FC-M53, FC-M56, FC-S10, FC-S14, FC-S19, FC-S24, FC-T08, FC-T09, FC-T20, FC-Q01, FC-Q02. RQ-09, RQ-10, RQ-24, RQ-30, RQ-42, RQ-46.

---

## SC-04 Review (with the compare and disposition lenses)

Modules r2 at 14:05, with 2 local drafts. SC-04 absorbs the old SC-05 (emission diff) and SC-06 (disposition map); they are now the lenses `␣md` and `␣om`.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]
  ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record   your review · captured s2                        ␣ar rework   ␣aa approve
  modules r2                        M2  Ledger ─────────────────────────────────────── judgment
  9f3c·a1e2 · emitted 13:57             command(envelope, ctx) → receipt · observe(scope, cursor?) → snapshot
                                        artifact(read | upload) → content | ref
  M0  Context                           Ledger accepts authorized commands, invokes Kernel with resolved          @7 M2 ¶3 · saved v3 · 14:01 (desktop)
  M1  Kernel                            values and atomically records accepted state, immutable facts,            ▏ Name the off-host backup and restore
  M2  Ledger                 @7         receipts, references and the next durable task.                           ▏ obligation here too (A020, A022: RPO
  M3  Engine                 ✎        │ Storage is backend-neutral in this revision. Ledger depends only on        ▏ over RTO).
▌ M4  Sandboxes              ✎        │ immutable revision references; whether document bytes live in SQLite,
  M5  Effects                         │ content-addressed files or Git is decided by experiment p2 (A020).
  C   Contested                     M3  Engine ─────────────────────────────────────── judgment
                                        reconcile(workflow) → progress | blockage · render(assignment) → packet
  Previous round r1                   │ Engine schedules eligible work under a bounded policy, renders            ✎ M3 L41–42 · not saved
  6 notes · 4 acted on                │ assignment packets and supervises Durable tasks. Worker topology is      ▏ Lanes vs fresh workers is still my
  1 considered · 1 dismissed          │ not fixed here: fresh-context workers and durable lanes (A021) both      ▏ open question.
  0 unanswered                          remain candidates.
                                    M4  Sandboxes ──────────────────────────────────── observable
  Challenger r2                         prepare(assignment, profile, inputs) → handle · execute(handle, authorizedToolCall) → result · seal(han…
  4 objections · 4 dispositions                                                                                ↑ M4 · challenger X3 · product question
  1 product question                ▌ █The baseline profile now permits outbound network for dependency       ✎ M4 ¶2 · not saved ↑
                                      │ downloads and documentation (A006). Host credentials, host Git metadata ▏ Still reads over-engineered on a first
  p2 storage  1/3                     │ and control sockets stay unmounted; literal ingress and sealed egress   ▏ pass (A017). What is the smallest profile
                                        are unchanged.                                                            ▏ that still passes V5, and which of the six
                                        Containment stays separate from Effects so shell execution never        ▏ collection steps would a first version
                                        shares a process with forge credentials.                                  ▏ actually need?
                                                                                                                  ↑ M4 ¶3 · r1 @6 · dismissed · read the reason
NORMAL   render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
»
```

**Notes on this grid:**
- `│` in the gutter is a change bar: host byte ranges, `fg.muted`, stepped with `]h`.
- The cursor paragraph has the full-width band, the 2 px gutter bar (`▌`) and the block caret (`█`).
- **Margin stacking:**
  - The note under the cursor (`M4 ¶2`) stays full.
  - The challenger's X3 and the dismissed `@6` were pushed more than two lines from their anchors, so they collapse to their header line with `↑` (FC-Q28). They expand when the cursor reaches their anchor.
- The wide M4 signature runs into the margin, so it is an obstacle for the stack.
- **The emission's own heading** sits above this view: `Five deep modules with local reasons to change`, as content `h1` 20/28 rose with its rule, then `modules r2 · emitted 13:57 by the coordinator · answers 6 notes from r1`.

**Writing a note** (`c` or `␣mn` on M4 ¶2). The composer opens in the margin at the anchor.

```
                                    ▌ █The baseline profile now permits outbound network for dependency       ┌─────────────────────────────────────┐
                                      │ downloads and documentation (A006). …                                   │ ✎ note on M4 ¶2 · local · editing    │
                                                                                                                  │ Still reads over-engineered on a     │
                                                                                                                  │ first pass (A017). …▌                │
                                                                                                                  │ Esc jk leave Insert                  │
                                                                                                                  │ stays on this device until you save  │
                                                                                                                  └─────────────────────────────────────┘
INSERT   render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
» note on M4 ¶2 stays on this device until you save
```

**First-note hint.** Until 3 notes are written on this device, a ghost `+ note c` sits in the margin on the cursor line (FC-K19).

**Approve readback** (14:07:10, after saving the drafts as `@9` and `@10`; on the main line the desktop adds nothing more). Everything outside the float is dimmed and inert (FC-M72).

```
                ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record   your review · captured s2                        ␣ar rework   ␣aa approve   (dimmed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [◆ APPROVE] render-host · modules r2                                            fresh · every basis field acknowledged · seq 18356 · host 14:07:10 (0 s ago)
    binds                                                carries  3 saved notes as non-binding
    request      C2 · captured s2 · human                effect   modules approved by you; the Proposal phase starts drafting (coordinator as27·g1)
    emission     r2  9f3c·a1e2                           not      edited draft not approved · no Contract accepted
    manifest     51d0·08ce
    annotations  v5                                      y confirm   n Esc q cancel   K full basis                                 pinned 14:07:09 at modules r2
    decisions    2a83·34a6
    intake       none
    policy       pol3
    binding      bind1
READBACK approve modules r2                                            basis r2 v5 pol3   homeserver · protected to seq 18352 (1 m) · +4 unprotected   seq 18356
» keys typed before this readback appeared were discarded
```

**Rework readback.**
- `effect` and `not` are the host's text, fixed per command type (RQ-06). The wording below is an example until the host supplies it.
- `carries` is client copy from the count of saved notes.

```
    [◆ REWORK] render-host · modules r2                                             fresh · every basis field acknowledged · seq 18356 · host 14:07:10 (0 s ago)
    binds   (as approve)                                 carries  3 saved notes, each to be answered in r3
                                                         effect   modules r2 goes back to the coordinator (as27·g1), which drafts r3 against your notes
                                                         not      nothing approved · the Proposal phase does not start                                   
                                                         y confirm   n Esc q cancel   K full basis                                 pinned 14:07:09 at modules r2
READBACK rework modules r2                                             basis r2 v5 pol3   homeserver · protected to seq 18352 (1 m) · +4 unprotected   seq 18356
```

**STALE readback** (`@11` arrived at 14:07:05, and you pressed `␣aa` at 14:07:07 without having seen it). `y` is disabled (FC-M01, FC-M32).

```
    [◆ APPROVE] render-host · modules r2                                                                             stale · seq 18357 · host 14:07:08 (0 s ago)
    binds                                                stale    annotations v6 not yet acknowledged · d shows it
    …            (as above)                                       @11 added on M5 ¶1 from your desktop at 14:07:05, after your save
    annotations  v5 [!]
    …                                             confirm disabled   n Esc q cancel   K full basis                                 pinned 14:07:07 at modules r2
READBACK STALE › approve modules r2                             basis r2 v5→v6 [!] pol3   homeserver · protected to seq 18352 (1 m) · +5 unprotected   seq 18357
» keys typed before this readback appeared were discarded
```

**CHANGED readback.** The same `@11` arrives at 14:07:12 while the readback is open: `changed · annotations moved to v6 while this was open · d shows it`, and confirm is disabled (FC-T05). After `d`, a new readback binds v6 and carries 4 saved notes.

**A delegated request** (`render-cli · seams r1`). The Track row names the machine route. The stage's mark is the `bot` icon, never the coral diamond (FC-M09, FC-M45).

```
                ✓ Ground — ⚙ Seams — ◌ Modules — ◌ Proposal — ◌ Record   delegated (s3) · agent decides · saved notes must be answered first   ␣ax cancel
```

**Compare lens (`␣md`).** r1 and r2 side by side over the stage, hunks aligned. A chrome notice appears when the source changes `.gitattributes` or `.gitmodules` (FC-S20).

```
    r1  10-26 18:12  7c10·3e9a                                         │ r2  13:57  9f3c·a1e2
    M2 Ledger                                                          │ M2 Ledger
  − Storage keeps document bytes in SQLite rows next to the            │ + Storage is backend-neutral in this revision. Ledger depends
  − ledger tables.                                                     │ + only on immutable revision references; …
NORMAL   render-host › modules › r1 → r2 › hunk 3 of 7                basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
```

**Disposition lens (`␣om`).** Every r1 note with the host's disposition and where it went. The host enforces completeness.

```
    @1  M1 ¶2   acted on     → M1 ¶2 (r2)          "Kernel must not read the clock"
    @3  M2 ¶1   acted on     → M2 ¶3 (r2)          "storage choice is premature (A020)"
    @5  M4 ¶1   considered   → M4 (r2)             "network for downloads" · C: incidental choice · four executing attempts
  ▌ @6  M4 ¶3   dismissed    read the reason       "over-engineered? reminds me of orbs" (A017)
    ⏎ the note on r1 · gd the reference on r2
```

**Offline on this view:** see SC-10 a.

**800 px:** the left margin hides; notes fold inline under their paragraph; a wide block clips with the fade, edge rule and `›` (FC-Q19).

Tasks: T09–T15, T29, T31. Defends FC-M01, FC-M02, FC-M06, FC-M07, FC-M08, FC-M09, FC-M32, FC-M38, FC-M45, FC-M72, FC-L05, FC-K19, FC-T05, FC-T06, FC-T19, FC-T22, FC-S01–S04, FC-S20, FC-S23, FC-Q01–Q06, FC-Q19, FC-Q27, FC-Q28. RQ-05, RQ-06, RQ-07, RQ-11, RQ-13, RQ-23, RQ-31, RQ-32, RQ-39, RQ-47.

---

## SC-05, SC-06

No longer screens. They are the compare lens (`␣md`) and the disposition lens (`␣om`) of SC-04.

---

## SC-07 Evidence

`execute-symbolic-calls`, pass 2. The proof chain says what each role saw. The Audit node never carries a staleness mark (FC-M40).

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ⎘ Execute symbolic Calls · evidence │              [◆4] [×1] [?1]
                ✓ Contract — ↺ Pass 1 — ◆ Pass 2 — ◌ Integrated   ● F16 HARD · aliased callee Axes undefined                         ◆ ␣n Answer Q1
                Evidence                              Execute symbolic Calls
                minos / native-engine · K·40cc        pass 2 · opened by Watchdog r1 rework · Audit done
                                                    ✓ Audit examined  a6dcb53
                Passes                              │ standards ✓ · contracts ✓ · 6 findings: 4 fixed, 1 considered, 1 needs you
              ▌ ⌄ pass 2                  current   ✓ submitted  5712d1a
                  implement r1        needs_human   │ after fixes and rechecks
                  standards audit          2m15s  ▌ ✓ prepared  3be1f0c
                  contracts audit          2m30s    │ = 5712d1a + target 06500de · checks pass · attempt 2 (target moved once)
                  Watchdog              none yet    ◌ Watchdog                                                                    reviews 1 of 2
                › pass 1               historical     none yet on 3be1f0c
                  Watchdog r1   rework · counted    ⓘ this source changes .gitattributes · inert on the host
                                                    Implementer-run evidence only. Integration needs an independent Watchdog pass on the
                Obligations 12                      prepared source 3be1f0c. Nothing here authorizes integration.
                B1–B5 · A1–A6 · M manual
                A1 has F16 open                     Findings                                     Audit 6 · Watchdog r1 1 · the host's disposition words
                                                    W1   BLOCK  integration conflicts with b4d9a44                                        fixed
                Findings 7                                      fixed 029f917 · not independently checked
                Audit 6 · Watchdog r1 1             F12  judge  duplicate Unsupported                                                     fixed
                5 fixed · 1 considered              F13  judge  third finding stanza                                                      fixed
                1 needs you · decision Q1           F14  judge  README scope sentence                                                     fixed
                                                    F15  judge  whole-Time filter comment                                                 fixed
                                                    F16  HARD   aliased callee Axes undefined → decision Q1                         ◆ needs-human
                                                    F17  judge  generator skips whole-Time                                           considered
NORMAL   execute-symbolic-calls › evidence › prepared         basis K·40cc 5712d1a pol3   homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**The obligation matrix.** It grows right into the margin; `K` gives the full text. The Watchdog column says `none yet`, so pass 1's round is not named on pass 2 (FC-M41).

```
                                            Obligations                                                                    Contract K·40cc
                                            id   obligation · summary, K full text   implementer @5712d1a              Audit @a6dcb53     Watchdog · none yet
                                            B1   definition errors and recursion     ✓ call_test · 2 corpus PASS       none               not assessed
                                            B5   whole-Time reaches through Calls    ✓ whole_time_reaches_through…     F8 F11 cleared     not assessed
                                          ▌ A1   unsupported list only shrinks       ✓ aliasing rejected · F16 ◆       ● F16 HARD open    not assessed
                                            M    manual checks                       none · advisory only
```

**Below the matrix:**
- **Gate receipt:** `✓ mise run gate @5712d1a · run by implementer as31·g2 in its sandbox · 10-25 09:40 · pass`.
- **Catalog:** rows with their kind and maintenance word, e.g. `corpus replay · journey · changed`.
- **Web passage:** chrome provenance `partial · Tavily · obs o2 · 10-25 09:31 · 9f2c·4e1a`, then the passage as content on the content bar (FC-S19).
- **Native checks:** `macOS framework behaviour · unrun on Linux · see local prompt ␣ol`. Advisory only, never a gap.

Tasks: T08, T28. Defends FC-M10, FC-M40–M43, FC-M52, FC-M53, FC-S19, FC-S20. RQ-14, RQ-44, RQ-45, RQ-46.

---

## SC-08 Agents list

`␣oa`. The cursor is on the quarantine. The peek shows its lifecycle; `K` opens the same in the bottom float.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ⚇ Agents │                                         [◆4] [×1] [?1]
    Agents 10                                                                     all projects     as38·g1 · implementer  specify-rsps-profile
      slot assignment workflow                          role          state            since        canceled · quarantined · 52m · model opus-5.5
    Executing 4 ▬▬▬▬                  slots 4/4 · retained workspaces 7 · 2.3 of 20 GiB             last
    ▸ 1  as19·g3  …/execute-causal-scan                 implementer   running            41m       process alive after grace
    ▸ 2  as46·g1  gathering/auto-tag-bookmarks          Watchdog r1   running            12m       canceled by you 13:20 · rcpt …C8VN
    ▸ 3  as45·g1  …/specify-cma-profiles                implementer   running             8m
    ▸ 4  as42·g1  render-host · p2 candidate b          candidate     running             3m       lifecycle
    On the host 1                                                                                  13:20:02 cancel-requested · fence effect admissions for g1
  ▌ ● —  as38·g1  …/specify-rsps-profile                implementer   canceled · quarantined  52m  13:20:04 stop requested for the whole container · 30 s
    Held 2                                                     ownership kept, no execution slot     grace · forced stop 13:20:34
    ◆ —  as31·g2  …/execute-symbolic-calls              implementer   blocked          2d 4h       13:20:41 quiescence NOT confirmed: runtime reports
    ☰ —  as27·g1  render-host                           coordinator   running · no slot  11m         1 process (pid 4121) · workspace quarantined
    Queued 3                                                        eligible, waiting for a slot     admitted effects before fence: 0 · late output
    ◌ —  as62·g1  …/evaluate-exact-sum-with-demand      implementer   planned            41m         retained as quarantined evidence (2 files)
    ◌ —  as41·g1  render-host · p2 candidate a          candidate     planned            10m
    ◌ —  as43·g1  render-host · p2 candidate c          candidate     planned            10m       ● your move, on the host
                                                                                                   inspect or restart the sandbox runtime · a replacement
                                                                                                   needs a new generation
NORMAL   Agents › all › On the host › 1 of 1                                              homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» 4 executing · slots 4/4
```

**Notes on this grid:**
- The coordinator holds no execution slot. It runs turn t42 in the host and shows `running · no slot`.
- "Idle between turns" is a conversation state, shown in Chat only.
- State words are the host's execution fact plus its cancellation state (FC-M16, FC-M55).
- `␣ax` works from this list; its readback is the whole assignment (FC-T18).

Tasks: T18, T25. Defends FC-M16, FC-M21, FC-M36, FC-M55, FC-T18. RQ-15, RQ-33.

---

## SC-09 Decision and readback

Decision Q1 on `execute-symbolic-calls` at 14:10, after you approved modules r2, so Needs you is 3.
- The question is content `h1` with its rule. Then the lede, the provenance, the evidence, and the options under `coordinator recommends 1`.
- Options are the host's `{n, title, body, recommended}` (ledger text). The recommended option has a square outlined `recommended` tag, not a diamond.
- The Track row's primary names the act: `◆ ␣ad Answer Q1`. The option travels in the readback.
- `:w` doesn't apply: the answer is a local draft sent with the answer.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review │ 3 ▢ render-host · chat │ 4 ▤ Decision Q1 │                                         [◆3] [×1] [?1]
                ✓ Contract — ↺ Pass 1 — ◆ Pass 2 — ◌ Integrated   ● F16 HARD · aliased callee Axes undefined                         ◆ ␣ad Answer Q1
                This Slice                          What does a Call mean when it binds two distinct
                Execute symbolic Calls              callee Axes to one caller Axis?
                minos / native-engine               ────────────────────────────────────────────────────────────
                implementer as31·g2 · blocked       Specifically, when the callee holds a Value over both and reduces
                                                    it along one of them, and when a callee Output is over both?
                History                             blocking decision Q1 · from implement report r1 · 10-25 09:52
                10-24  Watchdog r1 · rework (W1)    waiting 2d 4h · blocks 25 · reviews 1 of 2
                10-25  implement r1 · needs_human
                10-25  asked you Q1                 Evidence                                                            related · gd opens
                                                    – §8.4 says inherited Axes "retain the caller's identity"; it        F16   contracts audit finding
                                                      neither forbids nor defines two callee Axes sharing one caller     F7    earlier fix (one identity)
                                                      Axis.                                                              §8.4  specification
                                                    – The previous round (F7, accepted) read this as one identity:       A1    unsupported-list obligation
                                                      Values over both evaluate elementwise; an Output over both is
                                                      a definition error.
                                                    – Integrated reductions expose the gap: in spread(a over L, b over
                                                      K), max over L (a*b) has callee type [K]; one identity removes
                                                      both Axes.

                                                    Options                                         coordinator recommends 1
                                                 ▌ 1  Accept the current dispositions  [recommended]
                                                      One identity, an Output over both is a definition error, a
                                                      reduction over one aliased Axis is unsupported. This needs no
                                                      code change. It records a permanent "unsupported" for a form
                                                      with no owning Slice until the specification is clarified.
                                                   2  Forbid aliasing
                                                      Amend the specification so that distinct callee Axes must bind
                                                      distinct caller Axes, as a definition error. This is simplest
                                                      and removes both the F7 special case and the unsupported rejection.
                                                   3  Define the semantics
                                                      Amend §8.4 with a rule for reductions and Outputs over aliased
                                                      Axes, for example keeping the callee Axes distinct within the
                                                      Call instance.

                                                    Your answer                          local draft · sent with your answer
                                                  ▏ Option 1 for this Slice. Open the §8.4 clarification as a
                                                  ▏ follow-up and link it from the unsupported entry so it is not
                                                  ▏ forgotten.
NORMAL   execute-symbolic-calls › decision Q1 › option 1   basis K·40cc 5712d1a pol3   homeserver · protected to seq 18352 (4 m) · +19 unprotected   seq 18371
»
```

**Notes on this grid:**
- `F16`, `F7`, `§8.4` and `A1` are references from the host's index, drawn salmon and underlined.
- Your answer at rest sits on a 2 px sage bar (the `▏` here), because a human wrote it.

**Writing the answer** (`i` on Your answer). The composer has no pencil; its header and footer say where the text lives.

```
                                                    ┌────────────────────────────────────────────────────────────────┐
                                                    │ your answer · local · editing                                   │
                                                    │ Option 1 for this Slice. Open the §8.4 clarification as a       │
                                                    │ follow-up and link it from the unsupported entry so it is not   │
                                                    │ forgotten.▌                                                     │
                                                    │ Esc jk leave Insert · stays on this device until you answer     │
                                                    │                                                                 │
                                                    └────────────────────────────────────────────────────────────────┘
INSERT   execute-symbolic-calls › Q1 › your answer   basis K·40cc 5712d1a pol3   homeserver · protected to seq 18352 (4 m) · +19 unprotected   seq 18371
»
```

**Answer readback** (`␣ad` on option 1). Everything outside the float is dimmed and inert, the Track row included. The pane scrolls so the cursor option's title and body sit above the float.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [◆ ANSWER] execute-symbolic-calls · Q1                                          fresh · every basis field acknowledged · seq 18371 · host 14:10:04 (1 s ago)
    binds                                                answer   option 1 · accept the current dispositions · your note, sent with the answer
    report       40cc·0cf2                               effect   F16 closes as decided; as31·g2 resumes as a fresh attempt after quiescence;
    Contract     K·40cc                                           independent review follows
    source       5712d1a                                 not      does not amend the Contract or the specification
    audit        a6dcb53
    policy       pol3                                   y confirm   n Esc q cancel   K full basis                                pinned 14:10:03 at Q1, option 1
READBACK answer Q1                                   basis K·40cc 5712d1a pol3   homeserver · protected to seq 18352 (4 m) · +19 unprotected   seq 18371
» keys typed before this readback appeared were discarded
```

**Recovery readback** (`kind: recovery`, from the op9 view in SC-10 e, at 14:03:30; cancelled with `n`). Binds include the observations, and each option kind has its own fixed `not` text.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [◆ ANSWER] render-host · op9 · recovery decision                                fresh · every basis field acknowledged · seq 18342 · host 14:03:30 (0 s ago)
    binds                                                answer   option 1 · recheck now · no note
    operation     op9                                    effect   the host lists the forge again and records what it observes
    payload       861a·8cf1                              not      does not create or change a PR · does not clear the duplicate risk
    attempt       1
    observations  12:45, 13:02                           y confirm   n Esc q cancel   K full basis                              pinned 14:03:29 at op9, option 1
    policy        pol3
READBACK answer recovery › op9                                  basis op9 pol3   homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» keys typed before this readback appeared were discarded
```

Tasks: T14–T18, T30. Defends FC-M01, FC-M07, FC-M08, FC-M22, FC-M23, FC-M38, FC-M72, FC-T05, FC-T06, FC-T22, FC-K10, FC-K15, FC-K27, FC-S23. RQ-04, RQ-05, RQ-06, RQ-29, RQ-39.

---

## SC-10 States

Each state is drawn at the moment its ordering reaches it (see "Other orderings" above).

**a. Offline** (14:08:00, in the offline ordering). One notice band and no per-cell mark. Segments that need the host are off; there is no `:w` chip and no offline queue.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎1 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]
                ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record   your review · captured s2           [rework · off]   [approve · off]
    ○ Offline since 14:06:59 · showing seq 18356 · 1 local draft safe · saving and deciding are off                                         ␣rc retry
                modules r2                        M5  Effects ──────────────────────────────────────── judgment
                9f3c·a1e2 · emitted 13:57             Host-private proposal-ref integration and credentialed      ✎ M5 ¶1 · not saved
                                                      Git/GitHub publication, exact identities/heads, admission   ▏ Does Effects own the forge adapter,
                                                      permits, operation reconciliation, bounded latest-view      ▏ or only call it?
                                                      updates and refusal of unauthorized integration.
NORMAL   render-host › modules › r2 › M5 · judgment   ✎ 1 not saved      basis r2 v5 pol3   ○ offline 1 m   seq 18356 · as of 14:06:58
» not sent, offline · your draft stays on this device · save again after reconnecting (there is no offline queue)
```

**b. Fresh snapshot** (reconnected at 14:08:21). One echo, the basis token and a gutter `[!]` on the paragraph that changed. Changes stay unacknowledged until `]d` or `d` shows them.

```
                                                  M5  Effects ──────────────────────────────────────── judgment
                                              [!]     Host-private proposal-ref integration and credentialed      ✎ M5 ¶1 · not saved
                                                      Git/GitHub publication, …                                   ▏ Does Effects own the forge adapter, …
NORMAL   render-host › r2 › M5   ✎ 1 not saved :w   basis r2 v5→v6 [!] pol3 ]d   homeserver · protected to seq 18352 (2 m) · +12 unprotected   seq 18364
» reconnected after 1m22s → fresh snapshot at seq 18364 · drafts, marks, jumplist and pins kept
```

After a sequence gap the echo reads `sequence gap → fresh snapshot at seq 18366 · drafts, marks, jumplist and pins kept`. `]d` opens the list of what changed, which ends with `complete through seq N` or `partial · more on the host`:

```
    what changed since seq 18356                                                                                           complete through seq 18364
    annotations v5 → v6 · 1 added · @11 on M5 ¶1 · you, desktop · 14:07:05
```

**c. `stale_basis` from the host** (rework ordering: the laptop approved at 14:07:12 without having received `@11`). The reply is on the bottom float, in three columns.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Your approval was NOT recorded. Nothing was approved.                                                                    [stale_basis] cmd …H2QK
    you sent                              host has                              what changed
    approve modules r2                    request C2 · captured s2 · human      annotations v5 → v6 · 1 added, 0 changed
    request C2 · captured s2 · human      emission r2 9f3c·a1e2                 @11  M5 ¶1 · you, desktop · 14:07:05
    emission r2 9f3c·a1e2                 annotations v6                      ▏ Effects must name the forge adapter as a decoupled
    annotations v5                        policy pol3                         ▏ submodule (A018), not a sixth module.
    policy pol3                           changed at seq 18357 · 14:07:05
    14:07:12 · laptop                     by you (desktop)                      ⏎ open @11 (acknowledges it)
                                                                                then approve or rework again, after you read @11
NORMAL   render-host › modules › r2   basis r2 v5→v6 [!] pol3 ]d   homeserver · protected to seq 18352 (1 m) · +5 unprotected   seq 18357
» stale_basis · cmd …H2QK · no state changed · the receipt is kept in :messages
```

**d. Unknown outcome** (rework ordering: rework with v6 sent at 14:09:30, no reply). The Track-row slot names it, and `␣ru` opens the outbox float. `not_found` is not proof the command wasn't accepted.

```
                ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record   ? rework request · no reply since 14:09:30     [rework · off]   [approve · off]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Outbox · commands from this device that are not settled                                                         1 unknown · 1 waiting · 2 refused
  ▌ ?  …9XQ4  requestRework    render-host · modules r2 · annotations v6 · pol3      sent 14:09:30
              no reply · the host may have accepted it · other decisions on modules r2 are off until this settles
              ␣rq query the receipt (never executes) · ␣rt retry with the same ID and bytes · K envelope
    ◌  …4D1J  sendMessage      render-host · coordinator t42 · steer #3               sent 14:09:31 · waiting
    ×  …1MBA  sendMessage      minos · as19·g3 conversation                           refused 13:50:10 · turn_ended
              The turn ended before your steer arrived. The text is kept as a draft in its chat, to send as a follow-up.
    ×  …8PTW  recordDecision   execute-symbolic-calls · Q1                            refused 13:48:02 · command_conflict
              the host already has a different request under this ID · nothing new was done · open the object and act again
NORMAL   outbox › 1 of 4                                                                homeserver · protected to seq 18352 (3 m) · +14 unprotected   seq 18366
» not_found: the host has no record yet · that is not proof it wasn't accepted · the safe step is the identical retry
```

**e. Uncertain external effect: the operation view** (`op9`, at 14:03:20). A work view with the operation's Track. The kind reads `create draft proposal PR`, `update PR summary`, `publish source` or `mark proposal ready`. A sticky duplicate risk stays here and leads the row elsewhere; only a host-recorded resolution clears it. `⏎` on Decide opens the recovery decision (readback in SC-09).

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ? op9 │                                           [◆4] [×1] [?1]
                ✓ admitted 12:40 — ? outcome unknown — ◌ resolved   ? duplicate risk since 12:40 · auto-recheck 14:15
                Blocks                              Create draft proposal PR
                publishing                          ────────────────────────────────────────────────────────────
                ready promotion                     op9 · render-host → vicrdguez/render

                Continues                           Operation
                local work                          kind          create draft proposal PR · payload 861a·8cf1
                integration                                       source canonical head 3c2f9a1
                                                    attempt 1     admitted 12:40 · executor epoch e7 · permit consumed once
                                                                  outcome unknown: the forge reply was lost
                                                                  (connection reset after the request was written)
                                                    observed      12:45 listing: 0 matching PRs · 13:02 listing: 0 matching PRs
                                                                  a listing is not a verified association
                                                    risk          ? duplicate risk · since 12:40 · stays until the host records a resolution

                                                    Safe choices
                                                    auto-recheck 14:15 · recheck now · inspect attempt 1 · associate a verified object

                                                    Decide
                                                  ▌ ◇ recovery · 4 choices: recheck now, associate a verified object,           ⏎ open
                                                      authorize another attempt, accept the stated remaining risk
NORMAL   render-host › effects › op9                                                     homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**f. Revoked** (14:20:05). The client stops retrying, drafts stay on the device, and the view is frozen.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎1 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]
                ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record   ? rework request · no reply since 14:09:30     [rework · off]   [approve · off]
    ✗ This device's enrollment was revoked on the host at 14:20:05. The client will not retry. Your local draft stays on this device and comes
      back when it is enrolled again from the host's admin interface. Everything you see is frozen at seq 18402.
NORMAL   revoked · view frozen · 1 draft kept on this device                                         ✗ revoked 14:20:05   seq 18402 · as of 14:20:05
» revocation is deliberate: enrollment never expires on its own
```

**g. Unsupported.** Unknown resource kinds show as metadata, with decisions on that object off and never a guess (FC-M17). An unknown *basis field name* never disables a command. A protocol frame version the client can't read gives one whole-client state, with no resnapshot loop (FC-W13). A host-side unsupported task keeps its ownership and evidence (RQ-35).

```
    ✗ unsupported by this client (v0.3): artifact kind "canvas-v2" on render-host · seams r3 · shown as metadata only · decisions on it are off
      the host reports clients ≥ 0.4 understand it

    ✗ this client (v0.3) is too old for the host's protocol · update it

    ✗ as9·g1 · minos native-evaluation/check-ir-structure · blocked: task definition assignment-v1 is missing after the host upgrade
      ownership and evidence retained · nothing was reset · recovery (operator): restore the old handler, or run the recorded migration
```

**h. Host restored from a backup** (14:20:05; the host comes back at its 14:16 backup, seq 18390, epoch `authority-8`).
- First, backed-up credentials are refused, and the device needs pairing again by a local admin.
- After pairing, the snapshot carries the new epoch and an older sequence. The client accepts it, voids old pins and readbacks, and marks old outbox entries `can't be sent again after a restore`, with retry refused.
- The host segment names the state until the host is active again, and the restored line sits under it. The Brief's since line reads `Since 13:03 on this device · the host was restored · rows as they stand now` (FC-M70).
- Copy: plain words with no internal terms (epoch, deduplication, cutoff), and the message in one place, never repeated in the echo row.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎1 │                                                                                [◆4] [×1] [?1]
    The host was restored from a backup and no longer knows this device.
    Ask the host's admin to pair it again. It reconnects by itself after that.
    Nothing on this device is lost: your 1 draft and 1 unsent request stay here.                                                       ␣rc try now
NORMAL   host restored · waiting to be paired again                    [!] homeserver · restored · pair this device again   seq 18402 · as of 14:20:05
»
```

```
    The host was restored from a backup, so recent changes may be missing.
    It is catching up. Until it finishes you can read and draft, but not save or decide.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Outbox
  ▌ ?  request rework · modules r2 · sent 14:09:30 · can't be sent again after a restore
       This request may or may not have reached the host before the restore. It can't be sent again as it was.
       When the host is ready, open modules r2 and ask again if you still need to.
       ␣rq asks the host about it (never executes)
NORMAL   outbox › 1 request with an unknown outcome                 [!] homeserver · catching up after a restore   seq 18390 · as of 14:21:40
»
```

**i. Can't show this.** A read's outcome, shown in the text column where the content would be, on `surface.side`. Decisions on it are off, and it never falls back to another revision (FC-M39).

```
    ⊘ content missing on the host · modules r1 4be0·77c1

    ⊘ the host can't read this record's format (schema 7)

    ⊘ not visible to this device
```

Defends FC-M17, FC-M31, FC-M39, FC-M70, FC-M71, FC-W12, FC-W13, FC-L12, FC-L14. RQ-02, RQ-07, RQ-08, RQ-16, RQ-18, RQ-20, RQ-24, RQ-35, RQ-36, RQ-37.

---

## SC-11 Palette and pickers

**The palette (`:`).** It lists all 109 commands, including the ones unavailable here, each with its reason. Results grow upward from the input; the selected row sits nearest it. On modules r2 at 14:05, with 2 drafts:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    repeat      repeat last local op                                          .   │ ◇ request rework
    redo        redo draft change            nothing to redo                C-r   │ On render-host · modules r2. Opens a readback of the exact basis;
    reconnect   reconnect now                already connected              ␣rc   │ nothing is sent until you confirm it.
    retry       retry with original ID       nothing in the outbox          ␣rt   │ 2 local notes are not saved yet. Rework sends them with the request.
    receipt     query receipt (no execute)   nothing in the outbox          ␣rq   │
    refresh     fresh snapshot                                              ␣rr   │ authority · readback, then confirm
  ▌ rework      ◇ request rework                                            ␣ar   │
    :re█                                                       7 of 109 commands  │
COMMAND  render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
»
```

**Find any object (`␣.`).** The same float. A typed prefix (`slice:`, `doc:`, `agent:`) filters by kind.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    decision    skills · …/simplify-adapter-launch-tests                    ◆ 8d 5h   │ M2  Ledger
    report      skills · contract-lint · Watchdog r1 (ledger cites)          ✓ pass   │ Ledger accepts authorized commands, invokes Kernel with resolved
    obligation  minos · native-engine · record-engine-baselines B2            ready   │ values and atomically records accepted state, immutable facts,
    message     render-host · coordinator t42 "…revision references…"         13:58   │ receipts, references and the next durable task.
    node        render-host · modules r1 · M2 Record (superseded)              ↺ r1   │
    note        render-host · modules r2 · @7 backup and restore           saved v3   │ render-host · modules r2 · emitted 13:57
  ▌ node        render-host · modules r2 · M2 Ledger                    ◆ awaiting   │
    ledger rec█                                       6 of 1,107 · kind: filters   │
COMMAND  render-host › modules › r2 › M4   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
»
```

Tasks: T24. Defends FC-K12, FC-K19, FC-K26. RQ-21, RQ-25.

---

## SC-12 which-key

Display only. The root's head reads `display only · decides nothing`, then `Esc closes`. Groups are drawn in `fg`, leaves in `fg.alt`. The authority group shows the **outlined** diamond: the coral diamond means "needs you now", not "this command is authority".

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ␣  display only · decides nothing                                                                                                    Esc closes
    a  ◇ authorize            c  chat                   d  diagnose               f  find                   h  help
    m  local                  o  open                   r  recover                s  search                 t  toggle
    ␣  views                  n  next action            q  the Brief              u  revision history       y  clipboard
    .  find anything          /  lines                  ;  commands               :  command history        '  resume
NORMAL   render-host › modules › r2 › M4   ␣   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
»
```

**`␣a`, the authority group,** lists all eight commands from `keymap.toml`. A command that can't run here is `fg.muted` and ends with its reason: a context reason (`settings only`, `not on this view`) or the host's reason.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ␣a  authorize   every command reads back its exact basis before it binds                                                             Esc closes
    a  ◇ approve emission                               r  ◇ request rework                           d  ◇ answer decision · not on this view
    s  ◇ confirm task shape · no task shape to confirm  c  ◇ accept / supersede Contract · nothing to accept on modules r2
    t  ◇ checkpoint routing · settings only             p  ◇ review policy: save / adopt · settings only   x  ◇ cancel work
NORMAL   render-host › modules › r2 › M4   ␣a   ✎ 2 not saved :w   basis r2 v3 pol3   homeserver · protected to seq 18340 (4 m) · +10 unprotected   seq 18350
»
```

Defends FC-K05, FC-K12, FC-K19, FC-M71. RQ-25.

---

## SC-13 Hint mode (`gs`)

On the Brief. Labels are chips in context `hint`, frozen at `gs`. They sit at the start of each target's text, after its state icon, and shift right to avoid overlap (FC-T16). A label moves the cursor and never acts. Bylines and asks are as in SC-02 and are left out here.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │                                                    [◆4] [×1] [?1]
    Needs you 4                                                                            Running 4 ▬▬▬▬                                  slots 4/4
  ▓ ◆ [a]Direction on Q1 · held by you                                         8d 5h ⏎ ▓   ▸ [r]Execute causal Scan  minos                       41m
    ◆ [s]Answer Q1 · 3 options                                                        2d 4h   ▸ [w]auto-tag-bookmarks  lnkr                          12m
    ◆ [d]Merge main · on the forge                                                   1h 12m   ▸ [q]Specify CMA and its foundational Processors       8m
    ◆ [f]Review Modules r2 · 6 dispositions                                              6m   ▸ [u]render-host · p2 candidate b  render              3m
    On the host 1                                                                             › [i]Done, last 24 h 3
    ● [g]as38 quarantined · Specify RSPS behavior                                       52m
    Waiting, not on you 6
    ⧗ [h]Route a prompt by task shape into a single-slice Proposal                       4d
    ⧗ [j]Record design checkpoints, annotations and experiments in…                      4d
    ⧗ [k]Replace explore and propose with the design playbook                            4d
    ⧗ [l]Evaluate exact Sum with shared demand handling                                 41m
    ? [;]create draft proposal PR · render-host                                      1h 23m
    ⧗ [e]render-cli · seams r1                                                          15m
HINT     hints · 16 targets · a label moves there and never acts                          homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

Defends FC-T16.

---

## SC-14 Diagrams and the canvas boundary

In the review document. A diagram:
- **Fits:** natural size, when it fits the width from the text column to the pane's right edge. It is an obstacle for the margin stack, like the wide M4 signature in SC-04.
- **Too wide:** scaled down while every label stays at 12 px or more; the caption adds the scale.
- **Wider still:** a "wider than view" panel with `⏎ full view`. Never clipped.
- **Parse error:** the source shows with the location.

```
                                                  M0  Context ───────────────────────────────────────── judgment
                                                      ┌──────────────────────────────────────────────────────────────────────── natural size ─┐
                                                      │ ┌──────────────────────┐  CALL command / observe  ┌───────────────────────┐            │
                                                      │ │ Human clients        │ ───────────────────────▶ │ Ledger                │            │
                                                      │ │ no writable authority│ ◀─────────────────────── │ principal, auth, tx   │            │
                                                      │ └──────────────────────┘  DATA receipts and views └──────────┬────────────┘            │
                                                      │                                       CALL change with values │ ▲ DATA decision        │
                                                      │                                                    ┌──────────▼─┴──────────┐           │
                                                      │                                                    │ Kernel                │           │
                                                      └ Figure 3 · Modules and authority · ␣tm source ─────────────────────────────────────────┘

                                                      ┌ Figure 10 · state diagram · 1,335 px natural ─────────────────────── wider than view ┐
                                                      │   labels would be 10 px here · 8 states · 12 transitions               ⏎ full view   │
                                                      └──────────────────────────────────────────────────────────────────────────────────────┘

                                                      ✗ Figure 5 · parse error at line 4, column 12: unexpected token "->>>"
                                                        source shown · notes anchor on these bytes
                                                      ▏ ```mermaid
                                                      ▏ sequenceDiagram
                                                      ▏     participant A as Trusted client
                                                      ▏     A->>>R: CALL command

                                                      canvas · excalidraw · seams-sketch r3 · 41 shapes · not editable in this client · za lists labels
```

Defends FC-Q05, FC-Q06. RQ-22, RQ-23.

---

## SC-15 Reading

The reading rules on one paragraph, at 1512 (text column x 436, 600 px) and at 800 (x 100):
- the measure: 600 px, 60–78 characters per full line;
- word wrapping, with IDs atomic;
- the only legitimate in-token break: a URL longer than the measure, with a continuation mark in the gutter;
- a clipped code block;
- a truncated path.

```
                                                  ## Ledger
                                                  Ledger accepts authorized commands, invokes Kernel with
                                                  resolved values and atomically records accepted state,
                                                  immutable facts, receipts, references and the next durable
                                                  task for assignment as31·g2 on emission 9f3c·a1e2. The probe
                                                  output lives at
                                                  https://example.invalid/render/experiments/fake-host/
                                               →  results/firehose-4x2k-seed1-measurements.json
                                                  and nothing in this paragraph may break inside a word.

                                                  ```rust                                         clipped · zl zh scroll · K full width
                                                  fn reconcile(workflow: &Workflow) -> Result<Progress, Bl›
                                                      let eligible = workflow.slices().filter(|s| s.eli›

                                                  …/native-engine/execute-symbolic-calls   paths truncate to …/leaf; IDs are never cut
```

At 800 px the column starts at x 100 and the margins hide; a wide block clips with the fade, the edge rule and `›` (FC-Q19).

Tasks: T31. Defends FC-Q01–Q04, FC-Q08, FC-Q10, FC-Q19.

---

## SC-16 Slices and Proposals lists

No Track row. The list column is on the left and the peek on the right (on by default at 1180 px and up). `K` on a row opens the same handover in the bottom float, and the peek gives way while it's open.

**Slices** (`␣os`), filtered to the user's own example, "needs human" plus "awaiting review", across all open Slices. Every count is the host's (RQ-41).
- The two needs-human Slices and the awaiting-review Slice are ledger facts.
- The host's 72 open and 26 merged include two fixture Slices that are merged in the ledger: `specify-rsps-profile`, shown as failed (the quarantine), and `specify-cma-profiles`, shown as implementing.
- The 3 ready Slices are `evaluate-exact-sum-with-demand`, `integrate-fast-full-test-suite` and `administer-users`. The Brief lists only the first, the one with a queued assignment (as62·g1).

The cursor is on a needs-you Slice, so the row is the solid coral head with `⏎`.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ☰ Slices │                                         [◆4] [×1] [?1]
    Slices 3 of 72                                                                    Filter    Execute symbolic Calls
    all open   needs human ×  ·  awaiting review ×   saved: review-queue      dependency order    minos / native-engine / execute-symbolic-calls
                                                                                                  reviews 1 of 2 · since 10-25 · blocks 4 direct, 25 in all
        slice                          status                                   waiting  blocks
    skills / reduce-test-runtime 1                                                                ⚑ commitment
    ◆ simplify-adapter-launch-tests    direction · held by you                    8d 5h       0   Contract K·40cc · B1–B5 A1–A6
    lnkr / gathering 1                                                                            accepted by you 10-03 14:32
    ▸ auto-tag-bookmarks               awaiting review · Watchdog r1 running        12m       0   ☺ owner
    minos / native-engine 1                                                                       you · implementer as31·g2 blocked
  ▓ ◆ execute-symbolic-calls           decide Q1 · aliased callee Axes            2d 4h      25 ⏎ ⎘ evidence
    69 open slices hidden by the filter · :filter clear shows them · ]g next group                pass 2 · no Watchdog on 3be1f0c
                                                                                                  ◷ not yet shown to you
                                                                                                  ● blocker
                                                                                                  F16 HARD · aliased callee Axes undefined  §8.4
                                                                                                  ◆ next
                                                                                                  Answer Q1 · 3 options
NORMAL   Slices › all open › 3 of 3                                                       homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» filter: needs human + awaiting review · 3 of 72
```

**The filter float** (`␣sf`; `Filter` in the head shows the key in its tooltip). Scope tree with small multiples, states with counts in scope, and saved filters. `x` and `X` work inside it; `C-j` keeps its pane meaning.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ⧩ Filter   counts match the filter                                                                     x toggle   X only   :filter   Esc closes
    Scope                                                    States · counts in scope           Saved · on this device
    All open                                          3      ☑ ◆ needs human          2         review-queue   2 states
      skills                                          1      ☐ ● failed               1
        design-workflow        ✓·✓✓⧗⧗⧗                0      ☐ ? unknown              0
        reduce-test-runtime    ◆                      1    ▌ ☑ ▸ awaiting review      1
        fast-full-test-suite   ✓✓−✓✓✓✓✓               0      ☐ ▸ implementing         1
      lnkr                                            1      ☐ ↺ rework               1
        gathering              ▸✓✓✓                   1      ☐ ⧗ waiting on dep.     63
        multi-tenant           ✓·⧗⧗                   0      ☐ · ready                3
      minos                                           1      ☐ ✓ merged              26
        native-engine          −✓✓✓✓✓✓✓✓✓−✓↺◆✓⧗·⧗+25   1      ☐ − superseded           4
        native-evaluation      ✓−●▸⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗+17   0
      render                                          —
        render-host  design                           —
NORMAL   Slices › all open › filter › awaiting review                                     homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**Empty state.** The filter matches nothing in the scope. It names the scope and filter, shows what matches elsewhere, prints `:filter clear`, and keeps the needs-you count. The tab bar's count never follows a filter (FC-R07). The peek is empty, so it is hidden.

```
    Slices 0 of 33                                                                    Filter
    minos / native-evaluation   awaiting review ×                         dependency order

          No slice in minos / native-evaluation is awaiting review.
          1 match elsewhere: lnkr gathering/auto-tag-bookmarks
          :filter clear shows them
          ◆ 2 slices need you in other scopes
NORMAL   Slices › minos/native-evaluation › 0 of 33                                       homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» filter: awaiting review · 0 of 33
```

**Proposals** (`␣oP`): the one home for proposal progress. Rows are exactly two lines at every width (FC-Q26).
- **Line 1:** name, progress strip, counts (printed only when non-zero), status. The strip is the Slice small multiples, superseded drawn `−`. A workflow with phases shows its shape word and the host's path instead. Phases come only from the host's path (FC-M54). When the full strip doesn't fit it becomes `design · Modules ◆ · 3 of 5`, never cut.
- **Line 2, readiness:** `[? duplicate risk · ]ready: <eligibility>[ (<first blocker>)] · forge: <state>`.
  - `ready:` is eligibility only (FC-M59).
  - `forge:` carries promotion and the observed forge; a state on an older basis keeps its qualifier on the same line (FC-M48).
  - After an observed main merge, the line is `merged main (observed)`.
  - Narrow widths drop whole parts, in order: the forge field while it agrees with eligibility, the blocker, the `ready:` label. The sticky risk, the eligibility word, the merge line and a disagreeing forge field never drop. The line never wraps.
- **The peek's readiness** holds the four views, one labelled row each, with every gap and the lag (FC-M49).

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ☰ Proposals │                                      [◆4] [×1] [?1]
    Proposals 8                                          not archived · host dependency order     Owned native Engine
                                                                                                  minos / native-engine · proposal · accepted by you 10-03 14:32
    skills / design-workflow        ✓·✓✓⧗⧗⧗                         1 ready, waits for a slot
    ready: not eligible (4 not integrated) · forge: none                                          readiness
    skills / reduce-test-runtime    ◆                      ◆1       1 needs you                   eligible       not eligible · 11/41 integrated
    ready: not eligible (1 not integrated) · forge: none                                                         R8 unpublished
    skills / fast-full-test-suite   ✓✓−✓✓✓✓✓               ◆1       merge main · on the forge     published      R7 of R8 · 9m behind
    ready: eligible · forge: ready #44                                                            promotion      pending for R7
    lnkr / gathering                ▸✓✓✓                   ▸1       awaiting review               on the forge   draft #41 · observed 2m ago
    ready: not eligible (1 not integrated) · forge: none
    lnkr / multi-tenant             ✓·⧗⧗                            1 ready, waits for a slot     slices
    ready: not eligible (3 not integrated) · forge: none                                          needs human 1 · ready 1 · rework 1
  ▌ minos / native-engine           −✓✓✓✓✓✓✓✓✓−✓↺◆✓⧗·⧗+25  ◆1 ▸1    1 needs you                   waiting on dependency 27 · merged 11
    ready: not eligible (R8 unpublished) · forge: draft #41 · promoting (for R7)                  superseded 2
    minos / native-evaluation       ✓−●▸⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗⧗+17  ●1 ▸1    1 failed
    ready: not eligible (33 not integrated) · forge: draft #36
    render / render-host            design · ✓ Ground — ✓ Seams — ◆ Modules — ◌ Proposal — ◌ Record
    ? duplicate risk · ready: not eligible (PR unknown) · forge: PR unknown
    ◆ you  ● failed  ? unknown  ▸ running  ⧗ waiting  ↺ rework  ✓ done  · ready  − superseded
NORMAL   Proposals › all › 6 of 8                                                         homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**Notes on this grid:**
- The legend's diamond is `fg.alt`, never coral.
- The ◆ counts on rows add up to 3. render-host's needs-you is the `◆ Modules` in its path, so the tag says 4.
- `K` on any row of either list opens the same body in the bottom float.
- **Which Proposals rows are needs-you.** A row is needs-you only when it is an eligible package whose merge you owe. native-engine's `◆1` counts a Slice inside it that needs you (Q1); the proposal itself isn't eligible, so its cursor row takes the band and the 2 px bar (`▌`). With the cursor on fast-full-test-suite, the row takes the solid head:

```
  ▓ skills / fast-full-test-suite   ✓✓−✓✓✓✓✓               ◆1       merge main · on the forge  ⏎ ▓
    ready: eligible · forge: ready #44
NORMAL   Proposals › all › 3 of 8                                                         homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
```

- **On Agents**, a row is needs-you when the assignment waits on you; **on Slices**, when its wait class is `human`.

**Agents:** SC-08.

Tasks: T32. Defends FC-R07, FC-T17, FC-M48, FC-M49, FC-M54, FC-M59, FC-M73, FC-K05, FC-K12, FC-Q26. RQ-26, RQ-27, RQ-33, RQ-41.

---

## SC-17 Project settings

One reader per project (`␣op`, context `settings`). It holds checkpoint routing and review policy, and shows the basis before any authority key.
- The view opens on `seams`; `j`/`k` step field by field. The Track row carries the segment for the field under the cursor.
- **`␣at`** on `seams` or `modules` toggles human ↔ delegated. `proposal` is always human: the key echoes `the proposal field is not editable · final acceptance is always yours`.
- **`␣ap`** on Review policy opens the policy as a local draft (`Esc Esc` keeps it); `␣ap` again, after `Esc Esc` returns to settings, reads back old → new and saves a new default revision. On a workflow it adopts the current default; `:policy adopt pol2` adopts another revision.
- **Key budgets:** T27 (routing) ≤ 8 keys, `␣op j ␣at y`. T27b (policy save and adopt) ≤ 21 command keys from anywhere.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ⚙ Settings · render │                              [◆4] [×1] [?1]
                render · settings                                                                                              ◇ ␣at routing
                Checkpoint routing                  Settings · render
                Review policy
                History                             Checkpoint routing                                     s3 · by you 10-21 09:12
                                                  ▌ seams       delegated
                                                    modules     delegated
                                                    proposal    human · always
                                                                applies to new checkpoint requests · pending ones keep what they captured
                                                    pending     render-host modules C2 · captured s2 · human
                                                                render-cli seams C3 · captured s3 · delegated

                                                    Review policy                                          default pol3 · for new workflows
                                                    limit       2 completed reviews
                                                    evidence    minimum rank tests
                                                    reviewers   different family
                                                    workflows   render-host pol3 (bind1) · minos/native-engine pol3 (bind2)

                                                    History
                                                    s3 by you 10-21 · pol3 by you 10-20 · s2 by local admin import 10-12
NORMAL   settings › render › seams                       basis s3 pol3   homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**Routing readback** (`␣at` on seams, 14:03:40; cancelled). Binds name the settings revision shown and the field; `pending` lists the requests that keep their capture.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [◆ ROUTE] render · checkpoint routing                                           fresh · every basis field acknowledged · seq 18342 · host 14:03:40 (0 s ago)
    binds                                                change   seams delegated → human
    settings     s3                                      pending  render-host modules C2 · captured s2 · human
    field        seams                                            render-cli seams C3 · captured s3 · delegated
                                                         effect   new Seams requests capture human
                                                         not      does not reroute pending requests · final acceptance stays yours
                                                         y confirm   n Esc q cancel   K full basis                                      pinned 14:03:40 at seams
READBACK routing › render                                       basis s3 pol3   homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
» keys typed before this readback appeared were discarded
```

**Saving a policy** reads back old → new; **adopting** names the pending decisions that go stale in the host's `effect`. Both cancelled:

```
    [◆ SAVE] render · review policy · new default from pol3                         fresh · every basis field acknowledged · seq 18342 · host 14:03:50 (0 s ago)
    binds                                                changes  completed-review limit 2 → 3
    policy       pol3                                    effect   pol4 becomes the default for new workflows
                                                         not      active workflows keep their binding until you adopt · counts and findings stay

    [◆ ADOPT] render-host · review policy pol4 (now pol3)                           fresh · every basis field acknowledged · seq 18342 · host 14:03:55 (0 s ago)
    binds                                                effect   render-host binds pol4 · 1 pending decision goes stale: modules r2
    workflow     render-host                             not      counts and findings stay
    policy       pol3
    binding      bind1
```

**Stale or concurrent changes** refuse through the SC-10 c panel, and the draft is kept. **`d` on a STALE policy readback** (here, pol4 was saved from your desktop first) shows the change, acknowledges it and rebases the draft field by field. Fields you edited keep your values; others take the new revision's. A field both changed shows `[≠]` with both values, and `y` stays disabled until you edit it.

```
    [◆ SAVE] render · review policy · new default from pol3                                                         stale · seq 18343 · host 14:04:10 (0 s ago)
    binds                                                stale    policy pol4 not yet acknowledged · d shows it
    policy       pol3 [!]                                confirm disabled   n Esc q cancel   K full basis                    pinned 14:04:09 at Review policy
    after d: the draft is rebased, and a field both changed waits for your edit
    limit       [≠] yours 3 · pol4 4
    evidence    minimum rank tests
    reviewers   different family
```

Tasks: T27, T27b. Defends FC-M09, FC-M38, FC-M44, FC-M45, FC-M72, FC-L13. RQ-47, RQ-48.

---

## SC-18 Local-verification prompt

An advisory text artifact for a human's local agent. `␣ol` opens the newest prompt for the current proposal in a reader with no notes. A chrome header from the artifact's fields sits above the body, which renders as content.
- `gg␣yG` copies the artifact's source bytes, never rendered text (FC-M47).
- **`:request-prompt`** (write tier) sends the proposal, source and basis shown. It has no readback, because it binds no authority. A stale basis refuses through SC-10 c.
- **Regeneration creates a new artifact.** An older prompt says `for an older source (R5) · current is R7`. Before publication the source line reads `not yet published`.
- **Advisory:** never a Needs-you entry, a blocker or a flag. Results come back as ordinary messages; there is no import or attestation (FC-M46).
- **Where it is announced:** one advisory line on SC-07 and SC-19.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ▤ native-engine · local prompt │                    [◆4] [×1] [?1]
                −▮▮▮▮▮▮▮▮▮−▮▯◆▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯  43 Slices · 11 integrated     advisory · nothing waits on this
                Local check prompt 3                Local check prompt 3 · advisory
                minos / native-engine               source    R7 7f2c815 · published as PR #41 head
                                                    gaps      macOS framework behaviour · desktop interaction
                History                             missing   documented macOS signing prerequisite
                prompt 2 · for an older source      gg␣yG copies it · :request-prompt makes a new one for the current source
                (R5) · current is R7
                                                    Verify R7 on this Mac
                                                    ────────────────────────────────────────────────────────────
                                                    Check out 7f2c815 from PR #41 and build it the way the
                                                    repository says. The Linux evidence covers the engine; it does
                                                    not cover the macOS framework behaviour or the desktop
                                                    interaction, so run those here and report what you see as an
                                                    ordinary message.
NORMAL   minos/native-engine › local prompt 3 › L1          basis R7 7f2c815   homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

Defends FC-M46, FC-M47. RQ-45.

---

## SC-19 Proposal page

The human's last read before the only irreversible act. `⏎` and `␣n` on the Brief's merge entry open it; so does `⏎` on a Proposals row. `C-o` returns.
- **Order of the body:** what could stop you first, counted by kind and never pooled into one number; then source and checks, readiness in four rows, advisory, and the Slices last.
- **Advisory checks** carry no stale, failed or coral mark, aren't counted with findings or uncertainties, and are never a gap.
- **Slice rows:** `name K·xxxx pass N Watchdog rN pass on <digest> N fixed`. The columns sit next to the name and a name is never cut. `⏎` opens that Slice's SC-07.
- **The primary** names the act. When eligible: solid coral `◆ ␣n Merge main · on the forge ↗`, which opens the URL confirm with the host's `url`. No machine merges main.
- **After the host observes the merge,** the primary reads `nothing for you yet`, and a merged source that differs from the reviewed one adds an evidence-gap row to Source.
- The statusline has no basis token here, because the page binds no authority.

**Eligible: `skills/fast-full-test-suite`.** The title, intake, release, PR and seven of the eight Slice names are fixture; `finish-full-suite-optimization` is real.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ◇ Fast full test suite │                            [◆4] [×1] [?1]
                ▮▮−▮▮▮▮▮  8 Slices · 7 integrated                                                               ◆ ␣n Merge main · on the forge ↗
                What could stop you               Fast full test suite
                Source and checks                 ────────────────────────────────────────────────────────────
                Readiness                         skills / fast-full-test-suite · intake K·5b20 · 8 Slices
                Advisory                          accepted by you 10-14 11:05
                Slices
                                                  What could stop you                                 findings 1 · uncertainty 1
                Merging                             F9   minor   split-slow-integration-tests
                you merge main on the forge              the slow-test list is hard-coded; a new slow test lands in the fast lane
                no machine merges main            ? U1   uncertainty
                                                         required forge checks were listed before R4 was published; not read again since

                                                  Source and checks
                                                  source      R4 2c91e07 canonical · published · PR #44 ready
                                                  checks      7/7 Slices · required checks pass on their prepared source
                                                              weakest rank tests (minimum tests)

                                                  Readiness
                                                  eligible       eligible · 7/7 integrated · 1 superseded
                                                  published      R4
                                                  promotion      observed for R4
                                                  on the forge   ready #44 · observed 2m ago

                                                  Advisory                                                nothing waits on these
                                                  none suggested for this proposal

                                                  Slices 8 · intake K·5b20
                                                  measure-suite-runtime            K·3e71  pass 1  Watchdog r1 pass on 4f09c2a  0 fixed
                                                  split-slow-integration-tests     K·a90d  pass 2  Watchdog r2 pass on 7c3e118  2 fixed
                                                − retry-flaky-network-tests        K·61b4  superseded by cache-mise-tool-installs
                                                  cache-mise-tool-installs         K·0c5e  pass 1  Watchdog r1 pass on d2a7f40  0 fixed
                                                  parallelize-adapter-fixtures     K·b47a  pass 1  Watchdog r1 pass on 18e6b9d  1 fixed
                                                  trim-snapshot-fixtures           K·5d22  pass 1  Watchdog r1 pass on e07a3c5  0 fixed
                                                  shard-native-gate                K·9f18  pass 1  Watchdog r1 pass on 2b8d4e6  0 fixed
                                                  finish-full-suite-optimization   K·c3a0  pass 2  Watchdog r2 pass on 6a1f5b7  1 fixed
NORMAL   skills/fast-full-test-suite › proposal › What could stop you                     homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**URL confirm** (`␣n`). `y` opens the PR in your browser; `n` and `Esc` don't.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ↗ Open PR #44 on the forge
    open https://github.com/vicrdguez/skills/pull/44 ? y/n
    y opens it in your browser · n Esc doesn't
NORMAL   skills/fast-full-test-suite › proposal › open PR #44                             homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**Not eligible: `minos/native-engine`.** The gaps lead, in the host's order. The primary is the proposal's next move for you, drawn neutral because its target is another view: `◆ ␣n Answer Q1` opens SC-09. The R7 and R8 digests are fixture.

```
●●● ⊞ ⧉ ⚇ ⌕ │ 1 ☷ Brief │ 2 ▤ Modules r2 · review ✎2 │ 3 ▢ render-host · chat │ 4 ◇ Owned native Engine │                             [◆4] [×1] [?1]
                −▮▮▮▮▮▮▮▮▮−▮▯◆▮▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯▯  43 Slices · 11 integrated                                  ◆ ␣n Answer Q1
                What could stop you               Owned native Engine
                Source and checks                 ────────────────────────────────────────────────────────────
                Readiness                         minos / native-engine · intake K·7d21 · 43 Slices
                Advisory                          accepted by you 10-03 14:32
                Slices
                                                  What could stop you                     unpublished source 1 · not integrated 30
                                                    R8 unpublished
                                                         the canonical source R8 is 9m ahead of the published R7
                                                  ◆ execute-symbolic-calls · not integrated
                                                         decision Q1 is yours · blocks 25
                                                  · evaluate-exact-sum-with-demand · not integrated
                                                         ready, waits for a slot · as62·g1 planned
                                                    28 more not integrated: 27 waiting on a dependency · 1 in rework

                                                  Source and checks
                                                  source      canonical R8 a41e9d2 · published R7 7f2c815 · PR #41 draft
                                                  checks      11/41 Slices · required checks pass on their prepared source
                                                              weakest rank tests (minimum tests)

                                                  Readiness
                                                  eligible       not eligible · 11/41 integrated · 2 superseded
                                                                 R8 unpublished
                                                  published      R7 of R8 · 9m behind
                                                  promotion      pending for R7
                                                  on the forge   draft #41 · promoting (for R7) · observed 2m ago

                                                  Advisory                                                nothing waits on these
                                                  macOS framework behaviour     suggested · not run
                                                  desktop interaction           suggested · not run
                                                  local check · prompt 3 for R7   ␣ol
NORMAL   minos/native-engine › proposal › What could stop you                             homeserver · protected to seq 18340 (2 m) · +2 unprotected   seq 18342
»
```

**800 px:** one column at x 100; the left margin hides; the Track row keeps the ticks' count and the primary; Slice rows keep every column and scroll right with `zl`, never cutting a name.

Tasks: T28. Defends FC-M48, FC-M58, FC-M60, FC-M64, FC-M73. RQ-04, RQ-26, RQ-45, RQ-49.
