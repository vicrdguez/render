# Interaction grammar

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). It is copied from the design workbench (`~/dev/render-ui-design/design/`) as of the final phase.
> - **Phase tags** ("phase 3", "phase 6") mark when a rule was decided. Decision records (D…, F…, A…, challenges, evaluations) are workbench history, not requirements.
> - **File names** in code spans map like this: `visual-language.md`, `grammar.md` and `stack.md` → [`../reference/`](../reference/); `wireframes.md` → [`../wireframes/layout.md`](../wireframes/layout.md); `screens.md` → [`../wireframes/text-mocks.md`](../wireframes/text-mocks.md).
> - **Paths** under `experiments/`, `inputs/` and `evaluation-*.md` are in the workbench (`~/dev/render-ui-design/`).
> - **Measured, proposed and pending** claims are separated in [`../evidence.md`](../evidence.md).


One command language, rendered by GPUI now and by a TUI later. `keymap.toml` is the single declarative table; this document defines what the table means, how sequences resolve, and the lint rules (§15) that keep it coherent. Failure IDs (`FC-…`) refer to `failure-catalogue.md`.

Notation: `␣` = leader (Space). `⏎` = Enter. `C-x` = Ctrl-x, `M-x` = Alt/Option-x.

**Evidence.** The E-PROTO prototype implemented this grammar against the fake host. **Measured**:
- 125/125 commands reachable;
- 0 pointer events over 24 task runs;
- the checkpoint review with 3 notes and a rework request in 35 keys;
- 0 target-pinning violations in 545 runs on the v0 wire format and 245 on v0b;
- 16/16 seeded lint mutants caught (`html-proto/report.md`).

Phase 2 changed the grammar where the prototype found defects (D1–D14) and applied the cuts in `proportionality.md`. E-PROTO-2 then **measured** the phase-2 grammar: 108/108 commands reachable; 23/24 tasks within budget (T18 refused correctly because the fake host offers no decidable); review in 35 keys; 0 pinning violations in 554 runs, including the read-basis and freeze-release traps; lint passing with 13/13 mutants caught. Phase 3 adds the explorer (§7, SC-16), which is **not yet measured**.

## 1. Principles

1. **Verbs over Render objects.** vim's operator + motion/text-object model, with Render's nouns (node, annotation, hunk, finding, obligation, message, tool call, queue item) as objects.
2. **Authority is a separate dialect.** Every command that binds human authority lives under `␣a`, reads back its exact basis, and is confirmed with `y` after the readback is on screen. Nothing else can reach authority: not counts, `.`, macros, hints, links, `Esc`, `C-c` or host events.
3. **Targets are pinned at the first key, against what was painted.** Keys act on the frame the user saw (§5).
4. **You can only approve what you have been shown.** Each view keeps a read basis; changes the user has not seen make a readback stale (§13).
5. **Muscle memory carries over or fails safe.** Keys the user owns in nvim keep their meaning where Render has an analogue (§6); elsewhere they are unbound or local.
6. **Prefix-free, no timeouts.** Every sequence is prefix-free (KL2). which-key appears after 300 ms but decides nothing. The only timeout binding is Insert `jk`.
7. **Same table, two renderers.** Bindings are checked for terminal representability (KL9).

## 2. Modes

| Mode | Statusline | Entered by | Left by | What keys do |
|---|---|---|---|---|
| **Normal** | `[N]` | default; `Esc` | — | motions, operators, leader, `g`/`z`/`]`/`[` families |
| **Visual** | `[V]` / `[VL]` | `v`, `V` | `Esc`, an operator | extend a selection anchored to immutable bytes |
| **Operator-pending** | `[O]` | an operator key (`c`, `gc`, `y`) | a motion or text object, `Esc` | waits for an object |
| **Insert** | `[I]` | `i a o I A O` in editors; `c{obj}`/`cc` (opens a composer) | `Esc`, `jk` | text entry only; leader inactive |
| **Command line** | `[:]` | `:`, `␣;`, `␣.`, pickers | `⏎`, `Esc`, `C-c` | minibuffer editing and completion |
| **Hint** | `[H]` | `gs` | a label, `Esc` | every key selects a label |
| **Readback** | `[◆]` | an authority command | `y`, cancel | only confirm, cancel and inspect keys |

Mode badges are outlined chips (`visual-language.md` §13): neutral, except Insert (sage border, local editing) and Readback (coral border, the authority spark). Cursor shapes: block (Normal), bar (Insert), underline (Operator-pending), none (Readback).

## 3. Contexts

Bindings are scoped by a context tree. A command applies in the contexts it lists **and all their descendants** (its effective contexts). Inner contexts may shadow outer bindings only when they declare it.

```
global
├─ list            (queue, outline, revisions, outbox, steering queue)
│  └─ explorer     (SC-16: sidebar tabs, scope tree, filtered list, preview; includes the agents table)
│     └─ filter    (the explorer's state filter panel)
├─ reader          (read-only text; anchors on immutable bytes)
│  ├─ review       (checkpoint emission)
│  ├─ diff         (emission rN-1 → rN; anchors on the new side)
│  ├─ evidence     (reports, receipts, obligation matrix)
│  ├─ decision     (needs-human question and options)
│  ├─ chat         (transcript)
│  └─ diagram      (full-window Mermaid view)
├─ editor          (editable text; the vim subset; never authority)
│  ├─ prompt       (chat composer)
│  ├─ composer     (annotation or decision note)
│  └─ editbuf      (local edit of emission bytes)
├─ picker
├─ readback
└─ hint
```

Authority commands must not list `global`, because `global` makes `editor` effective (D1).

## 4. Formal grammar

```ebnf
sequence     = [ count ] , ( motion | operation | command | markop )
             | ":" , exname , [ " " , args ] , "⏎" ;
count        = digit19 , { digit } ;
operation    = operator , ( motion | textobject | operator ) ;     (* doubled operator = linewise: cc, gcc, yy *)
operator     = "c" | "gc" | "y" ;                                  (* readers: c/gc annotate, y yank; editors: vim meanings *)
motion       = basic | objmotion | "/" , pattern , "⏎" | "?" , pattern , "⏎" | "n" | "N" | "*" | "#" ;
basic        = "h" | "j" | "k" | "l" | "w" | "b" | "e" | "0" | "$" | "gg" | "G"
             | "{" | "}" | "(" | ")" | "H" | "M" | "L" | "C-d" | "C-u" | "C-f" | "C-b" | "zl" | "zh" ;
objmotion    = ( "]" | "[" ) , objchar ;                           (* lower = next/prev; UPPER = last/first *)
objchar      = "n" | "N" | "a" | "A" | "h" | "H" | "c" | "f" | "F" | "o" | "O" | "m" | "M" | "t" | "d" | "q" ;
textobject   = ( "i" | "a" ) , tochar ;
tochar       = "w" | "s" | "p" | "n" | "h" | "m" ;                 (* Render objects in readers *)
markop       = ( "m" | "'" | "`" ) , markchar ;
command      = (* any literal sequence declared in keymap.toml for this mode and context *) ;
```

Editors use vim's and mini.ai's own text objects (`iq` quote, `ib` bracket and so on). Those are a separate lexicon, scoped to editor contexts, so `]q` (needs-me item, global) and `iq` (quote, editors only) do not collide (D3, KL12).

### 4.1 Lexicon

**Verbs**

| Key | Reader meaning | Editor meaning | Tier |
|---|---|---|---|
| `c{obj}`, `cc` | annotate the range (opens a composer); review and diff only | change (vim) | local (draft) |
| `gc{obj}`, `gcc` | alias of `c` (the user's mini.comment habit) | comment toggle | local |
| `y{obj}`, `yy` | yank text | yank | local |
| `␣y{obj}` | yank to the system clipboard (the user's `␣y`) | same | local |
| `gy` | yank the stable reference of the object or selection (`render-host/modules@r2#M2:L14-16`; the user's mini.files `gy`) | — | local |
| `dd` | discard the **local draft** under the cursor (undo with `u`) | delete line | local |
| `gd` / `gi` / `gD` | go to definition / evidence for this / the accepted basis it binds | — | local |
| `K` | peek: the reference under the cursor, the full value of a truncated field, or a code block or table at full width | — | local |
| `gk` | blocker details (the user's `gk` diagnostic float) | — | local |
| `gx` | open an external link (shows the full URL, then confirm) | — | local |
| `gs` | hint mode, focused pane | — | local |
| `⏎`, `l` | open (on a diagram: full view) | — | local |
| `-` | go to the parent object (the user's mini.files/oil `-`) | — | local |

**Objects** (motions `]x`/`[x`, first/last with capitals; text objects where meaningful)

| Char | Object | Motion | Text object | Where |
|---|---|---|---|---|
| `n` | design node (`S3`, `M2`, `P4`) | `]n [n ]N [N` | `in` (body) / `an` (with heading) | review, diff |
| `a` | unresolved annotation (draft, or saved this round) | `]a [a ]A [A` | — | review, diff, dispositions |
| `h` (alias `c`) | diff hunk (the user's mini.diff `]h`; vim's `]c`) | `]h [h ]H [H` | `ih` / `ah` | diff |
| `f` | finding (`W1`, `F16`) | `]f [f ]F [F` | — | evidence |
| `o` | obligation (`B1`, `A3`, `M1`) | `]o [o ]O [O` | — | evidence, decision |
| `m` | chat message | `]m [m ]M [M` | `im` / `am` | chat |
| `t` | tool call | `]t [t` | — | chat |
| `d` | problem mark in view: stale, unknown, blocked, conflict, `⟨!⟩` (the user's `]d` diagnostics) | `]d [d` | — | all |
| `q` | needs-me item, from anywhere (the user's quickfix habit) | `]q [q` | — | global |
| `g` | group in a list (a proposal group in the explorer or queue) | `]g [g` | — | list |
| `p s w` | paragraph, sentence, word | `{ } ( ) w b` | `ip ap is as iw aw` | readers |

**Section semantics (D7).** `]x` moves to the start of the next object. `[x` moves to the start of the object the cursor is in, or, if the cursor is already at that start, to the start of the previous object (vim's `[[`). Node starts are heading rows, because a heading is a valid annotation target (notes like "rename this module" anchor on it).

`]x` motions do not enter the jumplist (vim behaviour); `]q`, `gd`, `gi`, `gs`, searches, `gg`/`G` and mark jumps do.

### 4.2 Identifier display forms (D12)

Display forms are namespaced so lookalikes cannot collide (FC-S04, FC-M19). They are **display only**. Every row, link and pin carries the host's object ID (`workflowId`, `assignmentId`, …); the client never matches objects by parsing a displayed path (D12: queue rows showed `render/render-host` while the workflow ID was `render-host`).

| Object | Display form | Example |
|---|---|---|
| emission revision | `r<n>` | `r2` |
| annotation-set revision | `v<n>` | `v3` |
| policy revision | `pol<n>` | `pol3` |
| workflow-policy-binding revision | `bind<n>` | `bind1` |
| authority epoch | as sent by the host | `authority-8` |
| Contract revision | `K·<hex4>` | `K·40cc` |
| digest | `<hex4>·<hex4>`, widened to 8·8 on a collision in scope | `9f3c·a1e2` |
| assignment · generation | `as<n>·g<n>` | `as31·g2` |
| obligation, finding, node | as authored, ASCII only | `B3` `F16` `M2` |
| annotation | `@<n>` | `@7` |
| decision question | `Q<n>` | `Q1` |
| operation | `op<n>` | `op9` |
| source commit | 7 hex | `5712d1a` |
| command or receipt | `…` + last 4 of the ULID | `cmd …7Q4K` |

All display forms are atomic tokens for wrapping (`visual-language.md` §4.2).

## 5. Sequence resolution, frame boundaries and pinning

```text
on frame boundary:
  apply all queued host messages (snapshots, updates, stream deltas)       # never mid-frame
  if no sequence pending or 1.5 s since the last key: apply deferred layout changes
  paint

on key(e):                         # handled immediately, against the last painted frame
  if mode == Readback: return readback_key(e)
  if mode == Hint:     return hint_key(e)
  if pending.empty:
      pending.pin = capture(focused_pane, last_painted_frame)
  pending.keys += e
  r = trie[mode][context_chain(pending.pin)].match(pending.keys)
  if r.exact:      dispatch(r.command, pending); clear()
  elif r.operator: mode = OperatorPending        # resolved in the pinned layout
  elif r.prefix:   whichkey.schedule(300 ms)     # display only
  else:            echo("no binding: " + keys); clear()

dispatch(cmd, p):
  if p.count and not cmd.countable: refuse("count not allowed")
  target = resolve(p.pin)               # by object ID and revision, never by row index
  if target is None: echo("target gone: " + p.pin.label); return
  match cmd.tier:
    local:  run(cmd, target)
    write:  outbox.send(envelope(cmd, target, expected = p.pin.basis))
    decide: open_readback(cmd, target, p.pin)
```

**Pin** = `{pane, viewKind, object ID, revision, the view's read basis (§13), anchor {blockId, byteOffset} or rowId, selection anchors, layoutEpoch, ledgerSeq, t0}`.

Rules:
- **Host messages are applied at frame boundaries only; keys are handled immediately.** So the state a key meets is exactly what the last painted frame showed. E-PROTO found a real violation when an update landed between paint and keystroke, and this rule fixed it (FC-T15).
- **Layout freeze.** Inserts, reorders and removals in lists are deferred while keys keep arriving, and applied after 1.5 s without a key, **even if a prefix is still pending** (D14). A pending prefix never freezes the screen indefinitely. Targets stay safe through the pin, and the cursor follows its object.
- The cursor is attached to an object ID. A streamed insert above it scrolls the viewport, never the cursor's object (FC-T01).
- A removed row becomes a tombstone (`resolved elsewhere`) that keeps the cursor until the next unfreeze (FC-T03).
- Counts, motions and text objects resolve against the pinned layout (FC-T04).
- Visual selections and yanks cannot start or end inside a block that is still streaming (FC-T09).
- The `expected` basis in an envelope is the pinned read basis, never re-read at dispatch (FC-M01).
- Commands resolve against the focused pane only. No host event moves focus, opens a modal or opens a readback (FC-T07, FC-T13).

## 6. Leader tree (grounded in `~/.config/nvim`)

From the user's config:
- `mapleader = " "`, `maplocalleader = " "`, `timeoutlen = 300`;
- `C-h/j/k/l` pane moves and the `␣w*` window group;
- the fzf-lua leaders and the mini.* plugins;
- `]d`/`[d`, `gd gr gi gD gk K`, and Insert `jk`.

No which-key plugin is installed, so the popup style comes from Doom Emacs.

| Key | Render meaning | User's nvim meaning | Carry-over |
|---|---|---|---|
| `␣␣` | switch open views | fzf buffers | same |
| `␣.` | find any object; a typed prefix filters by kind (`slice:`, `doc:`, `agent:`, `proposal:`) | fzf files | analogue |
| `␣/` | fuzzy lines in the current view | fzf grep_curbuf | same |
| `␣;` | command palette | fzf commands | same |
| `␣:` | command history | fzf command_history | same |
| `␣'` | resume the last picker | fzf resume | same |
| `␣q` | **needs-me queue** | diagnostic quickfix list | analogue |
| `␣u` | revision history of the object (emissions, annotation sets, Contract revisions) | undotree | analogue |
| `␣y` | yank to the clipboard | `"+y` | same |
| `␣w` + `h j k l v s c = f` | window: move, split, close, balance, maximize | identical | same |
| `␣f` + `r` | recent objects | `␣fr` recent files | same |
| `␣s` + `g` | search everything | `␣sg` live grep | same (bare `␣s` dropped, KL2) |
| `␣h` + `h k t` | help, keys cheat sheet, theme | help_tags, keymaps, colorschemes | same |
| `␣d` + `a` | actions available on this object | none: your `␣d` is delete-to-void (`"_d`) and code actions are `␣dA` | new (challenge 23) |
| `␣m` | local commands for this view (localleader) | buffer-local markdown; Doom's `SPC m` | analogue |
| `␣a` | **◆ authorize** (all authority) | unused | new |
| `␣c` | chat: open, prompt, follow-up, interrupt, steering queue, new workflow | unused | new |
| `␣o` | open views: overview, chat, evidence, dispositions; `␣os` slice explorer, `␣oa` its Agents tab | unused (Doom `SPC o`) | Doom |
| `␣r` | recover: refresh, outbox, receipt, retry, reconnect | buffer-local markdown helpers | new |
| `␣t` | toggles: follow, measure, prose font, Mermaid source | unused (Doom `SPC t`) | Doom |

which-key root (SC-12):

```
a ◆authorize  c +chat  d +diagnose  f +find  h +help  m +local  o +open  r +recover  s +search  t +toggle  w +window
␣ views  . find  / lines  ; commands  : history  ' resume  q needs-me  u history  y clipboard
```

Authority group `␣a`: one tier, readback + `y`:

| Keys | Command | Readback emphasis |
|---|---|---|
| `␣aa` | approve checkpoint emission (says when saved notes ride along as non-binding) | basis, notes carried, what is not approved |
| `␣ar` | request rework | basis, rework budget |
| `␣ad` | answer a decision (option + note) | question, answer, effect |
| `␣as` | confirm task shape (Ground) | prompt, shape |
| `␣ac` | accept intake, Contract or amendment | intake, the work it starts, freeze rule |
| `␣ax` | cancel an assignment | generation, admitted effects in flight |

**Where the keys work (phase 5, challenge 2).** `␣aa`, `␣ar`, `␣ad` and `␣ac` work only in views that show the basis: review, diff, decision and evidence. On a list row they echo `open it first · ⏎` and do nothing. `␣ax` also works from lists, chat and evidence, because its readback (assignment, generation, effects in flight) is the whole object. No task budget used the list path: T14 is `⏎ ␣aa y`, T16 `⏎ … ␣ad y`.

Deferred in v1, with their keys reserved: delegation changes (host config, per A003), effect reissue and risk resolution (until machine publication exists), device revocation from the client (Q16). See `proportionality.md`.

## 7. Normal mode by context (summary)

- **Global:** `j k gg G C-d C-u` (centred, like the user's `zz` remaps), `C-o C-i`, `m{x} '{x}`, `/ ? n N * #`, `:`, `gs`, `C-h/j/k/l` and `C-w h/j/k/l`, `q` closes the top float, `K`, `gk`, `-`.
- **List:** `l`/`⏎` open, `h`/`-` up, `za` expand row, `]q [q`.
- **Reader:** `j`/`k` without a count move by **visual** (wrapped) line, as your `j`→`gj` mapping does; with a count they move by logical line (challenge 23). Operators `c gc y`; `gy`; `]n ]a ]h ]f ]o ]m ]t ]d`; `zz zt zb za zo zc zR zM`; `zl zh` to scroll a code block or table horizontally. Tool-call bodies are folded by default; everything else is open, matching the user's "no folding just because".
  - **References and links** (`visual-language.md` §5.9, §4.8):
    - `gd` opens the host-resolved reference under the cursor, `K` peeks it, and `C-o` returns. On a dangling reference `gd` stays put and the echo area gives the host's reason.
    - Text that only looks like an ID is not a target.
    - `gx` opens an external link after a confirm that shows the full URL (FC-S05).
    - `gd` on a footnote marker jumps to its note.
    - `za` on collapsed frontmatter expands it.
- **Review** (localleader `␣m`): `␣mn` **note on this paragraph** (or on the selection in Visual), `␣ms` save annotations (= `:w`), `␣me` edit emission bytes, `␣md` diff with the previous emission, `␣mo` outline toggle.
  - **Making a note** (phase 6, trial c, FC-K19). The trial's one checkpoint review took 264 command keys against 35 scripted, because nothing on the screen named `c`. The entry is now visible in three places:
    - which-key under `␣m` shows `n  note on paragraph or selection`;
    - the NOTES panel's footer and its empty state read `␣mn note this paragraph · c{motion} any range · V…c a selection`;
    - the composer's footer reads `Esc Esc done · :w saves · ␣ar sends with rework`.
  - **`c` stays the annotate operator.** It is the user's vim "change" habit (Q04) and the only way to note any motion (`c2j`, `ci"`), and `gc` (mini.comment) stays as its alias. `␣mn` is the discoverable alias for the common case, a paragraph or a selection; it takes no motion, so it can be listed in which-key, which an operator-pending `c` cannot.
- **Chat:** `i`/`a`/`o` focus the prompt in Insert; `G` resumes follow; `␣cx` interrupt turn; `␣cf` queue a follow-up; `␣cq` steering queue; `␣cn` new workflow from an idea.
- **Prompt** (editor, Normal): `⏎` sends (a prompt if the coordinator is idle, a steer if it is running; the prompt header says which before you send). `M-⏎` queues a follow-up (Pi's convention); the TUI alternate is `␣cf`.
- **Diagram** (full view, a float): `h j k l` pan; `+ - =` zoom in, zoom out and reset. Zoom runs from fit-to-window up to 200 %, and labels are never shown below 12 px (`visual-language.md` §11). **`q`, `Esc` or `⏎` leaves** the full view and restores the panes and cursor; `-` stays zoom-out inside it (challenge 18, FC-K08).
- **Explorer** (SC-16; contexts `explorer` and `filter`):
  - **Open:** `␣os` opens the Slices tab with this device's last filter; `␣oa` opens the Agents tab (the old agents view).
  - **Tabs:** `gt`/`gT` cycle Slices · Proposals · Agents (vim's tab keys).
  - **Panes:** `C-h`/`C-l` move between sidebar, list and preview; `C-j`/`C-k` between the scope tree and the state filter inside the sidebar.
  - **Scope tree:** `j k`; `l`/`⏎` scopes the list to the node (all, a project, a proposal) and expands it; `h` collapses; `za` toggles.
  - **State filter:** `x` toggles the state under the cursor (`x` again undoes); `X` shows only that state; `⏎` on a saved filter applies it. No states selected means all open states.
  - **Filter command:** `:filter needs-human,awaiting-review` sets; `+rework` adds; `-merged` removes; `clear`; `save <name>`; `<name>` applies; `forget <name>`. Saved filters are device-local; `review-queue` (needs human + awaiting review) ships as the default.
  - **List:** the usual list keys; `]g`/`[g` move between proposal groups; `]q` still means the next needs-me item anywhere; `⏎` opens the slice's NEXT view (its decision, review or evidence); `K` peeks; `gd` goes to its Contract.
  - **Pinning:** the list follows the layout-freeze rules (§5). A filter change is a deliberate layout change, so the cursor stays on the same slice if it is still visible, and otherwise moves to the first row (FC-T17).

## 8. Minibuffer

The bottom row is Emacs's echo area and vim's command line in one.

- **Command line** `:` takes ex names from the table (`:approve`, `:w`, `:diff r1 r2`, `:set measure=100`). Tab completes; Up/Down walk the history.
- **Palette** `␣;` lists every command as `desc · :ex · keys · ◆ if authority`. Choosing an authority command opens its readback.
- **Pickers** (`␣.`, `␣␣`, `␣fr`, `␣sg`) follow the user's fzf-lua layout: bottom-docked, full width, borderless, 30 % of the height, preview at 50 %. Keys come from the user's fzf/blink config: `C-j`/`C-k` move, `C-n`/`C-p` page the preview, `⏎` opens, `C-v`/`C-s` open in a vsplit/split, `C-l` sends the results to the explorer as a `picker: <query>` scope (the fzf quickfix habit), `Esc`/`C-c` cancel. Results freeze once the user moves (FC-K17). Picker rows truncate under `visual-language.md` §4.4.
- **Echo area**: the last message, errors in `state.blocked`, and receipts (`APPROVED … receipt …7Q4K · seq 1285`). `:messages` keeps the history.
- Search uses smartcase everywhere (the user's `ignorecase` + `smartcase`).

## 9. which-key

After 300 ms on any proper prefix (`␣`, `␣a`, `g`, `]`, `z`, `Z`), a non-modal panel opens above the statusline: full width, at most 12 rows, in columns of `key desc`. Group names end in `+`. Authority leaves carry `◆`, and the `␣a` panel's header reads `authorize — every command reads back its exact basis before it binds`. That sentence appears once, in the header; the panel has no footer (evaluation-2 §4). The panel never consumes a key (FC-T12).

## 10. Hint mode

`gs` labels every actionable target visible in the focused pane: rows, references, links, nodes, annotations, options and the NEXT cell. Labels use the home row `a s d f g h j k l`, extended to prefix-free two-letter labels when there are more than nine targets. They are chrome chips placed at the start of each target's text, after its state icon so they never cover it (A3), shifted right to avoid overlaps (`visual-language.md` §12; FC-S12, FC-T16), and frozen when `gs` is pressed (FC-T10). Selecting a label **moves the cursor** and records a jump; it never opens or executes anything. `⏎` then opens.

## 11. Jumplist and marks

- **Jumplist:** one per device, 100 entries of `{object, revision, anchor}`. `C-o`/`C-i` move through it; `:jumps` lists it. Landing on an entry whose object has a newer revision shows the **recorded** revision, with a stale mark and `␣md` to diff (FC-T11).
- **Marks:** `m{a-z}` within an object, `m{A-Z}` across objects, persisted per device. Automatic marks: `''` (previous jump), `'.` (last saved annotation), `'^` (last Insert position). `:marks` lists them.

## 12. Editors (Insert surfaces)

The prompt, annotation composer, decision note and edit buffer share one modal controller (`stack.md` §3).

- **Subset:** `h j k l w b e W B E 0 ^ $ gg G f t F T ; ,`, the operators `d c y` with `iw aw ip ap is as` and mini.ai's `i" a" i( a( i[ a[ i{ a{ iq aq ib ab`, then `dd yy cc D C x p P J u C-r .`, `v V`, `i a I A o O`, `jk`/`Esc`, and Insert `C-w C-u`.
- **Markdown habits from the user's bullets.vim:** `⏎` continues a list item, `C-⏎` inserts a plain newline, `C-t`/`C-d` demote and promote.
- **Completion** of references (`@`, `#`) uses the user's blink keys: `C-j`/`C-k` select, `C-f` accept, `C-n`/`C-p` scroll the docs.
- **Composers** open inline under their range, in Insert, and wrap their text inside their frame (`visual-language.md` §4.5). The first `Esc` returns to the composer's Normal mode; a second `Esc` (or `q`) returns to the reader with the note kept as a local draft `[+]`. This is the same for every composer, including the decision note (D5 kept the rule and corrected the budget instead). `i`/`⏎` on a draft reopens it; `dd` discards it.
- Editors never host authority commands (KL4), and leaving an editor never sends anything.

## 13. Authority: read basis and readback

**Tiers.** `local` (no host effect), `write` (a host write without human authority: `:w`, send, steer, interrupt, retry the original ID) and `decide` (human authority: everything under `␣a`). Phase 1 had a fourth tier, `bind`, confirmed by typing a two-character code; it is cut in v1 (`proportionality.md` P1, Q05).

**Read basis (D11).** Each open view keeps the basis it has shown the user: per field, the revision and digest of every field the host's basis names. The read basis is set when the view opens. **A field advances only on an explicit act** (phase 5, challenge 3):
- `]d` landing on the change;
- `d` in a STALE readback (the stale panel);
- opening the stale diff (SC-10b).

Scrolling no longer counts. Viewport tracking was wrong both ways: a change scrolled past in 80 ms counted as read, and a change fully visible in another pane counted as unread (FC-M32). The cost: when the user did read a change by scrolling, the readback opens STALE once, and `d` acknowledges it in one key.

Until then the change is **unacknowledged**. It is marked `[!]` in the sign column and the strip, counted in the statusline, and reachable with `]d`.

**Readback rules:**
- The readback binds the pinned **read basis** and renders **every field of the host's `Basis.fields`**, known or not, by name, revision and digest (FC-M33). The keymap no longer lists fields (challenge 4). If the host's current basis differs in any field, the readback opens **STALE**, lists each unacknowledged change as `annotations v4 not yet acknowledged · d shows it` (never "you saw v3"), and disables `y`. `d` shows the changes and acknowledges them; the user then issues the command again.
- **The target stays in view** (challenge 10, FC-T19). When the readback opens, the focused pane scrolls so the pinned target sits fully above the float: the option row with its body, the node heading, the assignment row. A taller target puts its first line at the pane top. The scroll is local and never changes the pin.
- **Authority epoch** (challenge 1, FC-W12). A pin records the `authorityEpoch` it was taken under. A frame with a new epoch voids open readbacks and pins, and the readback closes with `the host was restored; open this again when it has caught up`.
- Keys timestamped before the readback frame was presented are discarded (FC-T06). Auto-repeat never confirms (FC-K15). `⏎` never confirms. An arming delay is an open question (Q06).
- If any basis field changes while the readback is open, it re-renders as `CHANGED` and `y` is disabled (FC-T05).
- If the target has unsaved local drafts, `␣aa`/`␣ar` first offer `save 3 drafts (v3→v4)? y/n`. The readback appears only after the save receipt, so it binds `v4` exactly.
- Every authority command needs a **host decidable** with a basis digest and EFFECT/NOT text (RQ-05, RQ-06). The client never derives a basis or invents consequences. Without a host decidable the action is shown as unavailable, with the reason (D13).
- **Decision notes** are local drafts until `␣ad y` sends them in `recordDecision`. `:w` does not apply in the decision view; the echo reads `local draft · sent with ␣ad` (challenge 13).
- On confirm, the client sends the envelope, carrying a fresh command ID and the pinned `authorityEpoch`, and echoes `◆ approving … [sent]`. The receipt shows as `APPROVED … receipt …7Q4K · seq 1285`. A timeout becomes `[?]` in the outbox, never "failed" (FC-M04).

**Template** (EFFECT and NOT come from the host; everything else from the pin):

```
◆ <VERB> <object path>
  BINDS   <field> <revision> <digest 4·4> · <field> … every field of the host's Basis.fields, in the host's order, wrapped
  CARRIES <what rides along, e.g. 4 saved notes as NON-BINDING>   (when applicable)
  EFFECT  <consequence>
  NOT     <explicit non-effects>
  STATE   fresh · seq <n> · host <hh:mm:ss> (<age>)     | STALE: <field> <rev> not yet acknowledged · d shows it
  y confirm · n Esc q cancel · K full basis
```

## 14. Recovery verbs

`␣rr` refresh (fresh snapshot) · `␣ru` outbox (pending and unknown commands) · `␣rq` query a receipt without executing (RQ-08) · `␣rt` retry with the original ID (wire `resend`: the stored envelope, byte-identical, which the host deduplicates) · `␣rc` reconnect now.

**BINDS form** (E-PROTO-5 defect 4, evaluation-5 §3):
- Entries wrap in one block instead of taking a line each, so an approve readback with seven fields fits.
- A field with a digest but no revision shows the digest alone: `decisions 2a83·34a6`. A field with no value shows `none`: `intake none`. Never a bare dash.
- The float grows to fit its content, up to 40 % of the window, and the target-scroll rule keeps the pinned target above it.

**Re-pairing after a restore** (E-PROTO-5 defect 6). Re-pairing is the first-enrolment flow, run by the host's local admin (spec §5.1). It is not a client command.
- While the credential is refused, the client keeps its normal reconnect schedule, re-reading its credential store on each attempt.
- `␣rc` tries at once.
- The first accepted connection carries the new epoch, and the rules below apply.

**After a host restore** (phase 5, challenge 1; spec r2 §5.3.1):
- Every outbox entry sent under the old `authorityEpoch` becomes `unknown after restore`.
- `␣rt` on such an entry is refused locally with plain words: "This request can't be sent again as it was. Open the object and ask again if you still need to." The cause is that the host lost its record of pre-restore requests. `␣rq` still asks the host, and a missing receipt is `outcome unknown after restore`, never "not sent".
- Reissue needs an explicit recovery decision on the host. In the client, the user opens the object and acts afresh on its current basis once `hostMode` is `active` (FC-L12).
- While `hostMode` is not `active`, every write and authority key echoes `Saving and deciding are paused while the host catches up`. The `hostMode` name stays in `K` only. Drafts keep working locally.

## 15. The keymap table and its lint rules

`keymap.toml` holds `[meta]`, `[contexts]`, `[groups]`, `[builtin]` and one `[[command]]` per command:

```toml
[[command]]
id = "auth.approve"          # unique
ex = "approve"               # unique; every command is reachable from ":" and the palette
desc = "◆ approve emission"  # which-key/palette text, ≤ 32 chars
tier = "decide"              # local | write | decide
kind = "command"             # command | operator | motion | textobject | prefixarg | modal
ctx = ["review", "diff"]      # not "list": the basis must be on screen (challenge 2)
wire = ["approveCheckpoint"] # wire command types (write/decide); the readback renders the host's Basis.fields
keys = [{ mode = "n", ctx = "global", seq = "<leader>aa" }]   # optional: tui = "kitty", tui_alt = "…"
```

Optional **command-level** fields: `countable`, `repeatable` (both default `false`), `confirm_local` (a local confirm, e.g. `gx`), `effect = "discard"` with `local_only`, `object` and `jump` (motions), `chars` (text objects), `ex_aliases`, `note`. **Binding-level** fields (inside `keys`): `mode`, `ctx`, `seq`, and optionally `alias_of`, `shadows`, `tui`, `tui_alt`. `shadows` exists only at binding level (F8), and its one value is `"parent"`: the binding deliberately overrides the same sequence in an ancestor context, e.g. `-` zoom-out in the diagram float over `-` go-up in readers (E-PROTO-5 defect 11). Any other field, at either level, is a schema error.

Lint rules, implemented in E-PROTO `tools/lint.py` (real keymap passes; 13/13 mutants caught, phase 2); each kept rule has a seeded bad keymap that must fail it. Phase 2 merged four rules into a schema check and folded KL6 into KL5. Numbers are kept for traceability with E-PROTO's mutants.

- **KL0 Schema** (absorbs KL3, KL11, KL13; KL15 dropped). Only known fields are allowed. Key sequences parse (`<C-x> <M-x> <S-x> <CR> <Esc> <Tab> <BS> <leader>` or printable; the placeholder `<label>` only in `kind = "modal"`). Every referenced context exists and the tree is acyclic. There is no host-trigger field, so no command can be invoked by a host event. Every command has `id`, `ex`, `desc`, `tier`, `kind` and `ctx`.
- **KL1 Reachability.** `id` and `ex` are unique, and every non-local command appears in the palette.
- **KL2 Prefix-freedom.** For each mode and each pair of bindings with overlapping effective contexts, neither sequence equals or is a proper prefix of the other unless the inner binding declares `shadows`. An operator or prefix-arg key `o` reserves every `o·x` in overlapping contexts. Builtin sets count as bindings. The single exception is Insert `jk`.
- **KL4 Authority.** For tier `decide`:
  - every Normal/Visual binding starts with `<leader>a`;
  - no binding exists in Insert, Operator-pending, Hint, Readback or Picker;
  - no `readback` field: the host's `Basis.fields` is the only source for what the readback shows (phase 5, challenge 4);
  - every command except `auth.cancel` is absent from `list` contexts, because its readback needs the basis on screen (KL4f, challenge 2);
  - `countable` and `repeatable` are not true;
  - no effective context is `editor` or one of its children;
  - `wire` names exactly the command types of host decidables.
  Conversely, nothing under `<leader>a` is below `decide`.
- **KL5 Reserved and trap keys** (absorbs KL6). `<Esc> <C-c> <C-[> q u <C-r> .`, Insert `jk`, `dd D x X s S r R p P @ ZQ` and ex `q! qa` bind only `local` commands. `ZZ` and ex `w`, `wq`, `x` bind at most `write`. Any `effect = "discard"` command declares `local_only = true`.
- **KL7 Wire coverage.** Every `wire` type appears in `protocol-requirements.md` §4, including `resend` for the retry (D2).
- **KL8 which-key.** Every proper prefix of a leader binding has a `[groups]` label, and `desc` is at most 32 characters and unique within its group.
- **KL9 Terminal representability.** Each binding is `legacy`, `kitty` or `none`. `<C-h>` (=BS), `<C-i>` (=Tab), `<C-m>` (=CR), `<C-[>` (=Esc), any `<M-…>` (Esc prefix), `<C-CR>`, `<S-CR>` and `<C-S-…>` are not `legacy`. They need `tui_alt`, another legacy binding, or a declared resolution (`tui = "legacy-as-tab"` for `<C-i>`).
- **KL10 Docs drift.** The generated cheat sheet equals the committed one.
- **KL12 Render objects** (scoped, D3). Within reader and global contexts, one object char means one object in both `]x` motions and Render text objects. Editor text objects (`[builtin].editor_textobjects`) are vim's and mini.ai's lexicon and are exempt.
- **KL14 Insert whitelist.** Insert bindings are editing, completion, `<Esc>`, `jk`, `<C-CR>` and `<M-CR>`, with no leader.
- **KL16 Aliases.** `alias_of` names a command of the same tier with overlapping context.

## 16. TUI mapping check (no TUI layout)

The GPUI visual language is no longer cell-based. The TUI renders the same structure, grammar and marks with the one-line fallbacks in `visual-language.md` §14. Keys that do not survive legacy terminal encoding (KL9):

| Binding | Problem in a legacy terminal | TUI resolution |
|---|---|---|
| `C-h` (pane left) | arrives as Backspace | kitty protocol; else `␣wh` / `C-w h` |
| `C-i` (jump forward) | arrives as Tab | as in vim: Tab = `C-i` (Tab is otherwise unbound) |
| `M-⏎` (follow-up) | `Esc ⏎`, indistinguishable from "leave Insert, then send" | kitty protocol; else `␣cf` |
| `C-⏎` (plain newline in editors) | not encodable | kitty; else unavailable (Enter list continuation still works) |

The mouse is never required, so terminals without mouse reporting lose nothing.

## 17. Keystroke budgets

All budgets count **keystrokes**: a chord such as `C-o` is one, `␣oc` is three, and text typed into editors is excluded (D5). "Measured" is E-PROTO on the phase-1 grammar (`html-proto/results/coverage.json`). Phase-2 changes that alter a count are marked.

| Task | Path | Phase-1 statement | Measured | Phase-2 budget |
|---|---|---|---|---|
| Review with 3 notes + rework | `⏎` · per note: node motion, line motion, `c{obj}`, text, `Esc Esc` · `␣ar y y` | 30 | **35** | **≤ 40** (target); 35 expected |
| T08 obligation → evidence | `]o` `gi` from the evidence view, plus opening the view | 3 | 4 | **4** |
| T11 annotate a paragraph | `cip` text `Esc Esc` (or `␣mn` text `Esc Esc`, the discoverable path, 6 keys) | 6 | 5 | **5** |
| T14 approve | `⏎ ␣aa y` | 4 | 4 | **4** |
| T15 rework | `␣ar y` (+`y` to save drafts first) | 5 | 4 | **4–5** |
| T16 answer a decision (from the queue) | `⏎ j o` text `Esc Esc ␣ad y` | 8 | **9** | **9**: the shared composer rule (`Esc Esc`) is kept for consistency |
| T17 accept intake | `⏎ ␣ac y` | 6 (code) | 6 | **5**. The code was removed (P1), and since phase 5 the intake is opened first: authority keys don't work from list rows (FC-T18, E-PROTO-5 defect 5) |
| T18 cancel assignment | `␣ax y` | 6 (code) | 6 | **4** (code removed, P1) |
| T32 explore slices by state (needs human + awaiting review) | `␣os`, `C-j`, `x`, `3j`, `x` · or `:filter review-queue⏎` | — | not yet | **8** · or 2 + name |
| T23 follow a reference and back | `gd` `C-o` | 2 | **3** (`g`, `d`, `C-o`) | **3** |
| T24 find any object | `␣.` query `⏎` | 2 | **3** | **3** + query |
| T03, T07, T09, T12, T13, T19, T20, T25 | as before | 3–4 | met | unchanged |

The three overruns (T16, T23, T24) were budget arithmetic, not grammar defects (D5). No grammar change is made for them.

**First-try discovery paths** (top 10, which-key only; human trial pending):
- T01: none (the landing view).
- T03: `␣` → `c +chat` → `c`.
- T05: the prompt header reads `i to write`.
- T08: `␣` → `o +open` → `e`.
- T09: `␣` → `m +local` → `d`.
- T11: `␣` → `m +local` → `n` (phase 6), plus the NOTES panel hint and the review statusline hint `␣mn note · c{motion}`. Trial (c) showed the statusline hint alone was not enough: the phase-3 build did not render it, and nothing else named `c`.
- T12: `␣` → `m` → `s`.
- T14, T15, T16: `␣` → `a ◆authorize` → `a`, `r` or `d`.
- The NEXT cell prints the key.
