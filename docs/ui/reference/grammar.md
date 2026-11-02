# Interaction grammar

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)), which condenses it. File names in code spans are relative to `docs/ui/`. Measured, proposed and pending claims are separated in [`../evidence.md`](../evidence.md).

One command language, rendered by GPUI now and by a TUI later. `keymap.toml` is the single declarative table; this document defines what the table means, how sequences resolve, and the lint rules (§15) that keep it coherent. `FC-…` refers to `failure-catalogue.md`, `RQ-…` to `protocol-requirements.md`, `T…` to tasks, `Q…` to `open-questions.md` and `S§… L…` to the accepted server spec.

Notation: `␣` = leader (Space). `⏎` = Enter. `C-x` = Ctrl-x, `M-x` = Alt/Option-x.

**Evidence.** The HTML prototype implemented this grammar against a scripted fake host ([`../evidence.md`](../evidence.md) §1.1). **Measured:**
- every command reachable by keys, with 0 pointer events (121/121 on the settings build);
- task budgets met, 25/25;
- the checkpoint review with 3 notes and a rework request in 35 keys, against a budget of 40;
- 0 target-pinning violations in 587 + 287 runs, including the list-authority, scroll-past-stale, epoch-readback and mode-pin traps;
- 15/15 seeded lint mutants caught.

## 1. Principles

1. **Verbs over Render objects.** vim's operator + motion/text-object model, with Render's nouns (node, annotation, hunk, finding, obligation, message, tool call, queue item) as objects.
2. **Authority is a separate dialect.** Every command that binds human authority lives under `␣a`, reads back its exact basis, and is confirmed with `y` after the readback is on screen. Nothing else can reach authority: not counts, `.`, macros, hints, links, `Esc`, `C-c` or host events.
3. **Targets are pinned at the first key, against what was painted.** Keys act on the frame the user saw (§5).
4. **You can only approve what you have been shown.** Each view keeps a read basis; changes the user has not seen make a readback stale (§13).
5. **Muscle memory carries over or fails safe.** Keys the user owns in nvim keep their meaning where Render has an analogue (§6); elsewhere they are unbound or local.
6. **Prefix-free, no timeouts.** Every sequence is prefix-free (KL2). which-key appears after 300 ms but decides nothing. The only timeout binding is Insert `jk`.
7. **Same table, two renderers.** Bindings are checked for terminal representability (KL9).
8. **A printed key works where it is printed.** A key printed as an invitation to press it is a chip, and it resolves in the context that is active there (§18).

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

Mode badges are outlined chips (`layout.md` §0): neutral, except Insert (sage border, local editing) and Readback (coral border, the authority spark). Cursor shapes: block (Normal), bar (Insert), underline (Operator-pending), none (Readback).

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
│  ├─ diagram      (full-window Mermaid view)
│  └─ settings     (SC-17 project settings)
├─ editor          (editable text; the vim subset; never authority)
│  ├─ prompt       (chat composer)
│  ├─ composer     (annotation, decision note or policy draft)
│  └─ editbuf      (local edit of emission bytes)
├─ picker
├─ readback
└─ hint
```

Authority commands must not list `global`, because `global` makes `editor` effective.

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

Editors use vim's and mini.ai's own text objects (`iq` quote, `ib` bracket and so on). Those are a separate lexicon, scoped to editor contexts, so `]q` (needs-me item, global) and `iq` (quote, editors only) do not collide (KL12).

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
| `␣n` | go to NEXT: the NEXT target of this workflow, or of the cursor row when a card is showing (§18) | — | local |

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

**Section semantics.** `]x` moves to the start of the next object. `[x` moves to the start of the object the cursor is in, or, if the cursor is already at that start, to the start of the previous object (vim's `[[`). Node starts are heading rows, because a heading is a valid annotation target (notes like "rename this module" anchor on it).

`]x` motions do not enter the jumplist (vim behaviour); `]q`, `␣n`, `gd`, `gi`, `gs`, searches, `gg`/`G` and mark jumps do.

### 4.2 Identifier display forms

Display forms are namespaced so lookalikes cannot collide (FC-S04, FC-M19). They are **display only**. Every row, link and pin carries the host's object ID (`workflowId`, `assignmentId`, …); the client never matches objects by parsing a displayed path.

| Object | Display form | Example |
|---|---|---|
| emission revision | `r<n>` | `r2` |
| annotation-set revision | `v<n>` | `v3` |
| policy revision | `pol<n>` | `pol3` |
| workflow-policy-binding revision | `bind<n>` | `bind1` |
| checkpoint settings revision | `s<n>` | `s3` |
| checkpoint request | `C<n>` | `C1` |
| canonical proposal revision | `R<n>` | `R7` |
| implementation pass | `pass <n>` | `pass 2` |
| web observation | a host short label | `o2` |
| PR | `#<n>` | `#41` |
| authority epoch | as sent by the host | `authority-8` |
| Contract revision | `K·<hex4>` | `K·40cc` |
| digest | `<hex4>·<hex4>`, widened to 8·8 on a collision in scope | `9f3c·a1e2` |
| assignment · generation | `as<n>·g<n>` | `as31·g2` |
| obligation, finding, node | as authored, ASCII only | `B3` `F16` `M2` `C` |
| annotation | `@<n>` | `@7` |
| decision question | `Q<n>` | `Q1` |
| operation | `op<n>` | `op9` |
| source commit | 7 hex | `5712d1a` |
| command or receipt | `…` + last 4 of the ULID | `cmd …7Q4K` |

All display forms are atomic tokens for wrapping (`reference/visual-language.md` §4.2).

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

**Pin** = `{pane, viewKind, object ID, revision, the view's read basis (§13), anchor {blockId, byteOffset} or rowId, selection anchors, layoutEpoch, ledgerSeq, authorityEpoch, t0}`.

Rules:
- **Host messages are applied at frame boundaries only; keys are handled immediately.** So the state a key meets is exactly what the last painted frame showed (FC-T15).
- **Layout freeze.** Inserts, reorders and removals in lists are deferred while keys keep arriving, and applied after 1.5 s without a key, **even if a prefix is still pending**. A pending prefix never freezes the screen indefinitely. Targets stay safe through the pin, and the cursor follows its object.
- The cursor is attached to an object ID. A streamed insert above it scrolls the viewport, never the cursor's object (FC-T01).
- A removed row becomes a tombstone (`resolved elsewhere`) that keeps the cursor until the next unfreeze (FC-T03).
- Counts, motions and text objects resolve against the pinned layout (FC-T04).
- Visual selections and yanks cannot start or end inside a block that is still streaming (FC-T09).
- The `expected` basis in an envelope is the pinned read basis, never re-read at dispatch (FC-M01).
- **The send mode is pinned.** A prompt or steer decided in the frame the user saw travels in the envelope, and a mismatch is refused (`turn_state_changed`); the draft is kept (FC-T20).
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
| `␣n` | **next action** (§18) | unused | new |
| `␣q` | **needs-me queue** | diagnostic quickfix list | analogue |
| `␣u` | revision history of the object (emissions, annotation sets, Contract revisions) | undotree | analogue |
| `␣y` | yank to the clipboard | `"+y` | same |
| `␣w` + `h j k l v s c = f` | window: move, split, close, balance, maximize | identical | same |
| `␣f` + `r` | recent objects | `␣fr` recent files | same |
| `␣s` + `g` | search everything | `␣sg` live grep | same (bare `␣s` dropped, KL2) |
| `␣h` + `h k t` | help, keys cheat sheet, theme | help_tags, keymaps, colorschemes | same |
| `␣d` + `a` | actions available on this object | none: your `␣d` is delete-to-void (`"_d`) and code actions are `␣dA` | new |
| `␣m` | local commands for this view (localleader) | buffer-local markdown; Doom's `SPC m` | analogue |
| `␣a` | **◆ authorize** (all authority) | unused | new |
| `␣c` | chat: open, prompt, follow-up, interrupt, steering queue, new workflow | unused | new |
| `␣o` | open views: overview, chat, evidence, dispositions; `␣os` slice explorer, `␣oa` its Agents tab; `␣op` project settings (SC-17); `␣ol` local-verification prompt (SC-18) | unused (Doom `SPC o`) | Doom |
| `␣r` | recover: refresh, outbox, receipt, retry, reconnect | buffer-local markdown helpers | new |
| `␣t` | toggles: follow, measure, prose font, Mermaid source | unused (Doom `SPC t`) | Doom |

which-key root (SC-12):

```
a ◆authorize  c +chat  d +diagnose  f +find  h +help  m +local  o +open  r +recover  s +search  t +toggle  w +window
␣ views  . find  / lines  ; commands  : history  ' resume  n next action  q needs-me  u history  y clipboard
```

Authority group `␣a`: one tier, readback + `y`:

| Keys | Command | Works in | Readback emphasis |
|---|---|---|---|
| `␣aa` | approve checkpoint emission (saved notes ride along as non-binding) | review, diff | basis, notes carried, what is not approved |
| `␣ar` | request rework | review, diff | basis, `reviews N of L` |
| `␣ad` | answer a decision (option + note) | decision | question, answer, effect |
| `␣as` | confirm task shape (Ground) | decision, review | prompt, shape |
| `␣ac` | accept intake, Contract or amendment | review, evidence | intake, the work it starts, freeze rule |
| `␣ax` | cancel work (wire `cancelWork`): an assignment, or a pending checkpoint request | lists, chat, evidence, review | the work, its generation, admitted effects in flight |
| `␣at` | change checkpoint routing (SC-17) | settings | the field, the settings revision shown, pending requests that keep their capture |
| `␣ap` | review policy: save a new default, or adopt a revision for a workflow (SC-17) | settings | old → new (`CHANGES`), or the workflow and the decisions that go stale |

**Where the keys work.** Authority keys work only in views that show the basis. From a list row, `␣aa ␣ar ␣ad ␣ac` echo `open it first · ⏎` and do nothing. `␣ax` also works from lists, because its readback (the work, its generation, effects in flight) is the whole object. `␣at` and `␣ap` work only in `settings`. No task budget uses the list path: T14 is `⏎ ␣aa y`, T16 `⏎ … ␣ad y`.

Checkpoint routing, policy changes, recovery decisions and resolving a duplicate risk are all in v1 (§14, SC-09, SC-10d, SC-17). Only device revocation from a client stays deferred, with no key (Q16).

## 7. Normal mode by context (summary)

- **Global:** `j k gg G C-d C-u` (centred, like the user's `zz` remaps), `C-o C-i`, `m{x} '{x}`, `/ ? n N * #`, `:`, `gs`, `C-h/j/k/l` and `C-w h/j/k/l`, `q` closes the top float, `K`, `gk`, `-`.
- **List:** `l`/`⏎` open, `h`/`-` up, `za` expand row, `]q [q`.
- **Reader:** `j`/`k` without a count move by **visual** (wrapped) line, as your `j`→`gj` mapping does; with a count they move by logical line. Operators `c gc y`; `gy`; `]n ]a ]h ]f ]o ]m ]t ]d`; `zz zt zb za zo zc zR zM`; `zl zh` to scroll a code block or table horizontally. Tool-call bodies are folded by default; everything else is open, matching the user's "no folding just because".
  - **References and links** (`reference/visual-language.md` §5.9, §4.8):
    - `gd` opens the host-resolved reference under the cursor, `K` peeks it, and `C-o` returns. On a dangling reference `gd` stays put and the echo area gives the host's reason.
    - Text that only looks like an ID is not a target.
    - `gx` opens an external link after a confirm that shows the full URL (FC-S05).
    - `gd` on a footnote marker jumps to its note.
    - `za` on collapsed frontmatter expands it.
- **Review** (localleader `␣m`): `␣mn` **note on this paragraph** (or on the selection in Visual), `␣ms` save annotations (= `:w`), `␣me` edit emission bytes, `␣md` diff with the previous emission, `␣mo` outline toggle.
  - **Making a note** (FC-K19). In a human trial a checkpoint review took 264 command keys against 35 scripted, because nothing on the screen named `c`. The entry is visible in three places:
    - which-key under `␣m` shows `n  note on paragraph or selection`;
    - the NOTES pane ends with `␣mn note this paragraph · c{motion} any range`, and its empty state reads `No notes on r2 yet` with the same key line and `V…c notes a selection`;
    - the composer's footer reads `Esc Esc done · :w saves · ␣ar sends with rework`.
  - **`c` stays the annotate operator.** It is the user's vim "change" habit (Q04) and the only way to note any motion (`c2j`, `ci"`), and `gc` (mini.comment) stays as its alias. `␣mn` is the discoverable alias for the common case, a paragraph or a selection; it takes no motion, so it can be listed in which-key, which an operator-pending `c` cannot.
- **Chat:** `i`/`a`/`o` focus the prompt in Insert; `G` resumes follow; `␣cx` interrupt turn; `␣cf` queue a follow-up; `␣cq` steering queue; `␣cn` new workflow from an idea.
- **Prompt** (editor, Normal): `⏎` sends (a prompt if the coordinator is idle, a steer if it is running; the prompt header says which before you send). `M-⏎` queues a follow-up (Pi's convention); the TUI alternate is `␣cf`.
- **Diagram** (full view, a float): `h j k l` pan; `+ - =` zoom in, zoom out and reset. Zoom runs from fit-to-window up to 200 %, and labels are never shown below 12 px (`reference/visual-language.md` §11). **`q`, `Esc` or `⏎` leaves** the full view and restores the panes and cursor; `-` stays zoom-out inside it (FC-K08).
- **Explorer** (SC-16; contexts `explorer` and `filter`):
  - **Open:** `␣os` opens the Slices tab with this device's last filter; `␣oa` opens the Agents tab; `␣oe` from the Proposals tab opens the merge package (SC-19).
  - **Tabs:** `gt`/`gT` cycle Slices · Proposals · Agents (vim's tab keys).
  - **Panes:** `C-h`/`C-l` move between sidebar, list and preview; `C-j`/`C-k` between the scope tree and the state filter inside the sidebar.
  - **Scope tree:** `j k`; `l`/`⏎` scopes the list to the node (all, a project, a proposal) and expands it; `h` collapses; `za` toggles.
  - **State filter:** `x` toggles the state under the cursor (`x` again undoes); `X` shows only that state; `⏎` on a saved filter applies it. No states selected means all open states.
  - **Filter command:** `:filter needs-human,awaiting-review` sets; `+rework` adds; `-merged` removes; `clear`; `save <name>`; `<name>` applies; `forget <name>`. Saved filters are device-local; `review-queue` (needs human + awaiting review) ships as the default. The hint line and the empty state print the chip `:filter clear`, which works from the list; `x` and `X` work only in the state filter.
  - **List:** the usual list keys; `]g`/`[g` move between proposal groups; `]q` still means the next needs-me item anywhere; `⏎` opens the slice (its decision, review or evidence); `␣n` goes to NEXT of the cursor row; `K` peeks; `gd` goes to its Contract.
  - **Pinning:** the list follows the layout-freeze rules (§5). A filter change is a deliberate layout change, so the cursor stays on the same slice if it is still visible, and otherwise moves to the first row (FC-T17).
- **Settings** (SC-17; context `settings`): the view always opens on `seams`. `j`/`k` step field by field, and the field under the cursor is bold. `␣at` toggles `seams` or `modules`; `proposal` is always human, so the key echoes `the proposal field is not editable · final acceptance is always yours`. `␣ap` on REVIEW POLICY opens the policy as a local draft in the editor, and `␣ap` again reads it back; `␣ap` on a WORKFLOWS row adopts the current default for that workflow; `:policy adopt pol2` adopts another revision.
- **Local-verification prompt** (SC-18): `␣ol` opens the newest prompt for the current proposal in the reader. `gg␣yG` copies its source bytes. `:request-prompt` (write tier) makes a new one for the current source; it has no key and no readback, because it binds no authority.

## 8. Minibuffer

The bottom row is Emacs's echo area and vim's command line in one.

- **Command line** `:` takes ex names from the table (`:approve`, `:w`, `:diff r1 r2`, `:set measure=100`). Tab completes; Up/Down walk the history.
- **Palette** `␣;` lists every command as `desc · :ex · keys · ◆ if authority`. Choosing an authority command opens its readback.
- **Pickers** (`␣.`, `␣␣`, `␣fr`, `␣sg`) follow the user's fzf-lua layout: bottom-docked, full width, borderless, 30 % of the height, preview at 50 %. Keys come from the user's fzf/blink config: `C-j`/`C-k` move, `C-n`/`C-p` page the preview, `⏎` opens, `C-v`/`C-s` open in a vsplit/split, `C-l` sends the results to the explorer as a `picker: <query>` scope (the fzf quickfix habit), `Esc`/`C-c` cancel. Results freeze once the user moves (FC-K17). Picker rows truncate under `reference/visual-language.md` §4.4.
- **Echo area**: the last message, errors in `state.blocked`, and receipts (`APPROVED … receipt …7Q4K · seq 1285`). `:messages` keeps the history.
- Search uses smartcase everywhere (the user's `ignorecase` + `smartcase`).

## 9. which-key

After 300 ms on any proper prefix (`␣`, `␣a`, `g`, `]`, `z`, `Z`), a non-modal panel opens above the statusline: full width, at most 12 rows, in columns of `key desc`. Group names end in `+`. Authority leaves carry `◆` in `fg.alt`, never coral, and the `␣a` panel's header reads `authorize — every command reads back its exact basis before it binds`. That sentence appears once, in the header; the panel has no footer. The root's head reads `display only · decides nothing`, then the chip `Esc` `closes`. Entries are chips, and `Esc` cancels the pending prefix. The panel never consumes any other key (FC-T12).

## 10. Hint mode

`gs` labels every actionable target visible in the focused pane: rows, references, links, nodes, annotations, options and the NEXT cell. Labels use the home row `a s d f g h j k l`, extended to prefix-free two-letter labels when there are more than nine targets. They are chrome chips in context `hint`, placed at the start of each target's text, after its state icon so they never cover it, shifted right to avoid overlaps (`reference/visual-language.md` §12; FC-S12, FC-T16), and frozen when `gs` is pressed (FC-T10). The echo prints the chip `Esc` `cancels`. Selecting a label **moves the cursor** and records a jump; it never opens or executes anything. `⏎` then opens.

## 11. Jumplist and marks

- **Jumplist:** one per device, 100 entries of `{object, revision, anchor}`. `C-o`/`C-i` move through it; `:jumps` lists it. Landing on an entry whose object has a newer revision shows the **recorded** revision, with a stale mark and `␣md` to diff (FC-T11).
- **Marks:** `m{a-z}` within an object, `m{A-Z}` across objects, persisted per device. Automatic marks: `''` (previous jump), `'.` (last saved annotation), `'^` (last Insert position). `:marks` lists them.

## 12. Editors (Insert surfaces)

The prompt, annotation composer, decision note, edit buffer and policy draft share one modal controller (`reference/stack.md` §3).

- **Subset:** `h j k l w b e W B E 0 ^ $ gg G f t F T ; ,`, the operators `d c y` with `iw aw ip ap is as` and mini.ai's `i" a" i( a( i[ a[ i{ a{ iq aq ib ab`, then `dd yy cc D C x p P J u C-r .`, `v V`, `i a I A o O`, `jk`/`Esc`, and Insert `C-w C-u`.
- **Markdown habits from the user's bullets.vim:** `⏎` continues a list item, `C-⏎` inserts a plain newline, `C-t`/`C-d` demote and promote.
- **Completion** of references (`@`, `#`) uses the user's blink keys: `C-j`/`C-k` select, `C-f` accept, `C-n`/`C-p` scroll the docs.
- **Composers** open inline under their range, in Insert, and wrap their text inside their frame (`reference/visual-language.md` §4.5). The first `Esc` returns to the composer's Normal mode; a second `Esc` (or `q`) returns to the reader with the note kept as a local draft `[+]`. This is the same for every composer, including the decision note. `i`/`⏎` on a draft reopens it; `dd` discards it.
- **IME.** `Esc` always leaves Insert; the first `Esc` ends a composition. `jk` is unavailable while an IME composes (FC-K21). No Option + printable key binds in an `editor` context, because GPUI routes those to an input method (KL9, FC-K22).
- Editors never host authority commands (KL4), and leaving an editor never sends anything.

## 13. Authority: read basis and readback

**Tiers.** `local` (no host effect), `write` (a host write without human authority: `:w`, send, steer, interrupt, retry the original ID, `:request-prompt`) and `decide` (human authority: everything under `␣a`). There is one authority tier: readback, then `y` (Q05).

**Read basis.** Each open view keeps the basis it has shown the user: per field, the revision and digest of every field the host's basis names. The read basis is set when the view opens. **A field advances only on an explicit act:**
- `]d` landing on the change;
- `d` in a STALE readback (the stale panel);
- opening the stale diff (SC-10b).

Scrolling does not count. Viewport tracking is wrong both ways: a change scrolled past in 80 ms would count as read, and a change fully visible in another pane as unread (FC-M32). The cost: when the user did read a change by scrolling, the readback opens STALE once, and `d` acknowledges it in one key.

Until then the change is **not yet acknowledged**. It is marked `[!]` in the sign column and the strip, shown in the statusline's basis token (`basis r2 v3→v4 [!] pol3 ]d`, with `]d` a chip), and reachable with `]d`. While a readback is open the token omits `]d`; the STALE line's `d` chip is the invitation there.

**Readback rules:**
- The readback binds the pinned **read basis** and renders **every field of the host's `Basis.fields`**, known or not, by name, revision and digest (FC-M33). The keymap lists no fields.
- **The basis names the request and its captured settings**, never the current dial: changing checkpoint settings alone stales nothing (S§5.3 L473; FC-M38). An approve's BINDS starts `request C2 · captured s2 · human`.
- **BINDS form.**
  - Entries wrap in one block instead of taking a line each, so an approve readback with eight fields fits.
  - A field with a digest but no revision shows the digest alone: `decisions 2a83·34a6`. A field with no value shows `none`: `intake none`. Never a dash.
  - The float grows to fit its content, up to 40 % of the window, and the target-scroll rule keeps the pinned target above it.
- **STALE.** If the host's current basis differs in any field, the readback opens STALE and lists each unacknowledged change as `annotations v4 not yet acknowledged · d shows it` (never "you saw v3"), with `d` a chip. `y` is disabled, and the key bar reads `confirm disabled`, never `y does nothing`. `d` shows the changes and acknowledges them; the user then issues the command again. In a policy readback, `d` also rebases the draft field by field (SC-17, FC-L13).
- **CHANGED.** If any basis field changes while the readback is open, it re-renders as `CHANGED`, `y` is disabled, and the key bar reads the same (FC-T05).
- **Modal.** While a readback is open, chips outside it draw dimmed (`fg.muted`) and do nothing. KL17 judges only the modal's surfaces.
- **The target stays in view** (FC-T19). When the readback opens, the focused pane scrolls so the pinned target sits fully above the float: the option row with its body, the node heading, the assignment row. A taller target puts its first line at the pane top. The scroll is local and never changes the pin.
- **Authority epoch** (FC-W12). A pin records the `authorityEpoch` it was taken under. A frame with a new epoch voids open readbacks and pins, and the readback closes with `the host was restored; open this again when it has caught up`.
- Keys timestamped before the readback frame was presented are discarded (FC-T06). Auto-repeat never confirms (FC-K15). `⏎` never confirms. An arming delay is an open question (Q06).
- If the target has unsaved local drafts, `␣aa`/`␣ar` first offer `save 3 drafts (v3→v4)? y/n`. The readback appears only after the save receipt, so it binds `v4` exactly.
- Every authority command needs a **host decidable** with a basis digest and EFFECT/NOT text (RQ-05, RQ-06). The client never derives a basis or invents consequences. Without a host decidable the action is shown as unavailable, with the host's reason. NOT is a fixed set per command type and option kind, and host text never names a client key.
- **Decision notes** are local drafts until `␣ad y` sends them in `recordDecision`. `:w` does not apply in the decision view; the echo reads `local draft · sent with your answer`.
- **Recovery decisions** use the same view and readback. For an uncertain external effect the host offers a decision (`kind: recovery`) with options such as recheck, associate a verified object, authorize another attempt, or accept a stated remaining risk. BINDS includes the observations, and each option kind has its own fixed NOT text (SC-09, SC-10d).
- On confirm, the client sends the envelope, carrying a fresh command ID and the pinned `authorityEpoch`, and echoes `◆ approving … [sent]`. The receipt shows as `APPROVED … receipt …7Q4K · seq 1285`. A timeout becomes `[?]` in the outbox, never "failed" (FC-M04).

**Template** (EFFECT and NOT come from the host; everything else from the pin):

```
◆ <VERB> <object path>
  BINDS   <field> <revision> <digest 4·4> · <field> … every field of the host's Basis.fields, in the host's order, wrapped in one block
  CARRIES <what rides along, e.g. 4 saved notes as non-binding>   (when applicable)
  EFFECT  <host text>
  NOT     <host text, fixed per command type and option kind>
  STATE   fresh · seq <n> · host <hh:mm:ss> (<age>) · every basis field acknowledged
  y confirm · n Esc q cancel · K full basis
```

- **Stale or changed:** a `STALE <field> <rev> not yet acknowledged · d shows it` line, and the key bar reads `confirm disabled · n Esc q cancel · K full basis`.
- **Extra rows by command:** `ANSWER` for `␣ad`, `PENDING` for `␣at`, `CHANGES` for a `␣ap` save.

## 14. Recovery verbs

`␣rr` refresh (fresh snapshot) · `␣ru` outbox (pending and unknown commands) · `␣rq` query a receipt without executing (RQ-08) · `␣rt` retry with the original ID (wire `resend`: the stored envelope, byte-identical, which the host deduplicates) · `␣rc` reconnect now.

**An uncertain external effect** is a different thing: an operation with a host recovery decision, not a command in the outbox. Its operation view (SC-10d) opens the decision in SC-09 with `⏎`, and a sticky duplicate risk stays until the host records a resolution.

**Pairing again after a restore.** It is the first-enrolment flow, run by the host's local admin (S§5.1 L315, S§5.3.1 L507). It is not a client command.
- While the credential is refused, the client keeps its normal reconnect schedule, re-reading its credential store on each attempt.
- `␣rc` tries at once.
- The first accepted connection carries the new epoch, and the rules below apply.

**After a host restore** (S§5.3.1 L509):
- Every outbox entry sent under the old `authorityEpoch` becomes `unknown after restore`.
- `␣rt` on such an entry is refused locally with plain words: "This request can't be sent again as it was. Open the object and ask again if you still need to." The cause is that the host lost its record of pre-restore requests, so an identical retry would become a new command. `␣rq` still asks the host, and a missing receipt is `outcome unknown after restore`, never "not sent".
- The user opens the object and acts afresh on its current basis once `hostMode` is `active` (FC-L12).
- While `hostMode` is not `active`, every write and authority key echoes why, in plain words per mode: `Saving and deciding are paused while the host catches up` (recovery-reconciling), `… while the host isn't accepting changes` (admission-disabled), `… while the host is blocked` (blocked). The `hostMode` name stays in `K` only. Drafts keep working locally.

## 15. The keymap table and its lint rules

`keymap.toml` holds `[meta]`, `[contexts]`, `[groups]`, `[builtin]` and one `[[command]]` per command: 122 commands and 189 bindings, lint-clean.

```toml
[[command]]
id = "auth.approve"          # unique
ex = "approve"               # unique; every command is reachable from ":" and the palette
desc = "◆ approve emission"  # which-key/palette text, ≤ 32 chars
tier = "decide"              # local | write | decide
kind = "command"             # command | operator | motion | textobject | prefixarg | modal
ctx = ["review", "diff"]      # not "list": the basis must be on screen
wire = ["approveCheckpoint"] # wire command types (write/decide); the readback renders the host's Basis.fields
keys = [{ mode = "n", ctx = "global", seq = "<leader>aa" }]   # optional: tui = "kitty", tui_alt = "…"
```

Optional **command-level** fields: `countable`, `repeatable` (both default `false`), `confirm_local` (a local confirm, e.g. `gx`), `effect = "discard"` with `local_only`, `object` and `jump` (motions), `chars` (text objects), `ex_aliases`, `note`. **Binding-level** fields (inside `keys`): `mode`, `ctx`, `seq`, and optionally `alias_of`, `shadows`, `tui`, `tui_alt`. `shadows` exists only at binding level, and its one value is `"parent"`: the binding deliberately overrides the same sequence in an ancestor context, e.g. `-` zoom-out in the diagram float over `-` go-up in readers. Any other field, at either level, is a schema error.

Each lint rule has a seeded bad keymap that must fail it. Rule numbers have gaps, because merged rules kept their numbers.

- **KL0 Schema.** Only known fields are allowed. Key sequences parse (`<C-x> <M-x> <S-x> <CR> <Esc> <Tab> <BS> <leader>` or printable; the placeholder `<label>` only in `kind = "modal"`). Every referenced context exists and the tree is acyclic. There is no host-trigger field, so no command can be invoked by a host event. Every command has `id`, `ex`, `desc`, `tier`, `kind` and `ctx`.
- **KL1 Reachability.** `id` and `ex` are unique, and every non-local command appears in the palette.
- **KL2 Prefix-freedom.** For each mode and each pair of bindings with overlapping effective contexts, neither sequence equals or is a proper prefix of the other unless the inner binding declares `shadows`. An operator or prefix-arg key `o` reserves every `o·x` in overlapping contexts. Builtin sets count as bindings. The single exception is Insert `jk`.
- **KL4 Authority.** For tier `decide`:
  - every Normal/Visual binding starts with `<leader>a`;
  - no binding exists in Insert, Operator-pending, Hint, Readback or Picker;
  - no `readback` field: the host's `Basis.fields` is the only source for what the readback shows;
  - every command except `auth.cancel` is absent from `list` contexts, because its readback needs the basis on screen;
  - `auth.routing` and `auth.policy` bind only in `settings`;
  - `countable` and `repeatable` are not true;
  - no effective context is `editor` or one of its children;
  - `wire` names exactly the command types of host decidables.
  Conversely, nothing under `<leader>a` is below `decide`.
- **KL5 Reserved and trap keys.** `<Esc> <C-c> <C-[> q u <C-r> .`, Insert `jk`, `dd D x X s S r R p P @ ZQ` and ex `q! qa` bind only `local` commands. `ZZ` and ex `w`, `wq`, `x` bind at most `write`. Any `effect = "discard"` command declares `local_only = true`.
- **KL7 Wire coverage.** Every `wire` type appears in `protocol-requirements.md` §4, including `resend` for the retry.
- **KL8 which-key.** Every proper prefix of a leader binding has a `[groups]` label, and `desc` is at most 32 characters and unique within its group.
- **KL9 Terminal representability.** Each binding is `legacy`, `kitty` or `none`. `<C-h>` (=BS), `<C-i>` (=Tab), `<C-m>` (=CR), `<C-[>` (=Esc), any `<M-…>` (Esc prefix), `<C-CR>`, `<S-CR>` and `<C-S-…>` are not `legacy`. They need `tui_alt`, another legacy binding, or a declared resolution (`tui = "legacy-as-tab"` for `<C-i>`). No Option + printable key binds in an `editor` context, because GPUI routes those to an input method.
- **KL10 Docs drift.** The generated cheat sheet equals the committed one.
- **KL12 Render objects** (scoped). Within reader and global contexts, one object char means one object in both `]x` motions and Render text objects. Editor text objects (`[builtin].editor_textobjects`) are vim's and mini.ai's lexicon and are exempt.
- **KL14 Insert whitelist.** Insert bindings are editing, completion, `<Esc>`, `jk`, `<C-CR>` and `<M-CR>`, with no leader.
- **KL16 Aliases.** `alias_of` names a command of the same tier with overlapping context.
- **KL17 Printed chips** (render-time, in the screens suite). Every printed chip resolves in its active context. Chips are collected from what the renderer prints across every screen fixture; a view template with no fixture fails. While a modal is open, only its surfaces are judged.
- **KL18 Vim built-ins.** No Vim built-in (`gn gN gv gJ gu gU g~ g? gq gw g; g,`) is bound to another meaning.
- **KL19 Chrome copy.** Over the chrome copy table: a key display form (`␣…`, `C-…`, `M-…`, `⏎`, `Esc`, `:name`) outside a chip slot fails; `(^|· )[A-Za-z]( \w|$)` is flagged for human review.

## 16. TUI mapping check (no TUI layout)

The GPUI visual language is not cell-based. The TUI renders the same structure, grammar and marks with the one-line fallbacks in `reference/visual-language.md` §14. Keys that do not survive legacy terminal encoding (KL9):

| Binding | Problem in a legacy terminal | TUI resolution |
|---|---|---|
| `C-h` (pane left) | arrives as Backspace | kitty protocol; else `␣wh` / `C-w h` |
| `C-i` (jump forward) | arrives as Tab | as in vim: Tab = `C-i` (Tab is otherwise unbound) |
| `M-⏎` (follow-up) | `Esc ⏎`, indistinguishable from "leave Insert, then send" | kitty protocol; else `␣cf` |
| `C-⏎` (plain newline in editors) | not encodable | kitty; else unavailable (Enter list continuation still works) |

The mouse is never required, so terminals without mouse reporting lose nothing.

## 17. Keystroke budgets

All budgets count **keystrokes**: a chord such as `C-o` is one, `␣oc` is three, and text typed into editors is excluded. Measured on the HTML prototype ([`../evidence.md`](../evidence.md) §1.1; `met` means within budget with no separate count).

| Task | Path | Budget | Measured |
|---|---|---|---|
| Review with 3 notes + rework | `⏎` · per note: node motion, line motion, `c{obj}`, text, `Esc Esc` · `␣ar y y` | **≤ 40** | **35** |
| T08 obligation → evidence | `]o` `gi` from the evidence view, plus opening the view | **4** | 4 |
| T11 annotate a paragraph | `cip` text `Esc Esc` (or `␣mn` text `Esc Esc`, the discoverable path, 6 keys) | **5** | 5 |
| T14 approve | `⏎ ␣aa y` | **4** | 4 |
| T15 rework | `␣ar y` (+`y` to save drafts first) | **4–5** | 4 |
| T16 answer a decision (from the queue) | `⏎ j o` text `Esc Esc ␣ad y` | **9**: the shared composer rule (`Esc Esc`) applies | 9 |
| T17 accept intake | `⏎ ␣ac y`: the intake is opened first, because authority keys don't work from list rows (FC-T18) | **5** | met |
| T18 cancel work | `␣ax y` | **4** | met |
| T32 explore slices by state (needs human + awaiting review) | `␣os`, `C-j`, `x`, `3j`, `x` · or `:filter review-queue⏎` | **8** · or 2 + name | not yet |
| T23 follow a reference and back | `gd` `C-o` | **3** (`g`, `d`, `C-o`) | 3 |
| T24 find any object | `␣.` query `⏎` | **3** + query | 3 |
| T27 change checkpoint routing | `␣op j ␣at y` (SC-17 always opens on `seams`) | **≤ 8** | 8 |
| T27b policy save and adopt | `␣op 3j`, then save and adopt in 16 command keys, plus typed values | **≤ 21** command keys | 21 |
| T03, T07, T09, T12, T13, T19, T20, T25 | as listed in the screens | 3–4 | met |

**First-try discovery paths** (top 10, which-key only; human trial pending):
- T01: none (the landing view).
- T03: `␣` → `c +chat` → `c`.
- T05: the prompt header reads `i to write`.
- T08: `␣` → `o +open` → `e`.
- T09: `␣` → `m +local` → `d`.
- T11: `␣` → `m +local` → `n`, plus the NOTES pane's key line.
- T12: `␣` → `m` → `s`.
- T14, T15, T16: `␣` → `a ◆authorize` → `a`, `r` or `d`.
- The NEXT cell prints its key (§18).

## 18. Printed keys and NEXT

**The rule: a key printed as an invitation to press it must work where it is printed.** An invitation is chrome text that tells the user to press a key, or pairs a key with what pressing it does. It is written `<keys> <action>`, with the keys in chips. KL17 and KL19 guard this (FC-K20, FC-K25). Any other mention of a key in chrome is phrased without the key. The keys view (`␣hk`) comes from the keymap and replayed echoes are records, so neither is chrome copy. **Host text never names a client key;** where a line needs a key, the host's sentence and the client's chip are separate.

**NEXT** (strip and card) prints the authority key or keys **only when the current view is the NEXT target and the keys resolve there**. Everywhere else it prints **`␣n`**.

**`␣n`** (`next.go`, local, a jump, so `C-o` returns) opens the NEXT target of the current workflow, or of the cursor row when a card is showing (FC-T21). The package's NEXT has a target outside Render, so there `␣n` opens the URL confirm (SC-19). `⏎` acts on the row under the cursor and never stands in for NEXT. `␣n` lives under the leader because `gn` is a Vim built-in that a user of `/` search and `c` would reach for (KL18, FC-K24).

**List ACTIONS** (the queue's card, the explorer's preview) hold only the row's own actions: `⏎ …`, local keys and `␣ax`. They never print `␣ad`, `␣aa` or another key that refuses from a row.

**Key lines** (key bars, footers, hint lines, chip lines; one row each) drop whole parts from the end until they fit inside the pane's content box. The written order is the order. The first part never drops, a chip is never cut or touching a border, and nothing wraps. Grids (`ACTIONS`, which-key) wrap by cell; their chips are never cut either.
