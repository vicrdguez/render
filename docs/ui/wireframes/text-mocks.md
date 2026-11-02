# Screens: structural wireframes

> **Supporting file of the Render UI spec** ([`../spec.md`](../spec.md)). File names in code spans are relative to `docs/ui/`. Measured, proposed and pending claims are separated in [`../evidence.md`](../evidence.md).

**These are structural wireframes, not the visual design.** They fix what each screen shows, where, in what order, and with what real content.

The visual design (Ember palette with accent roles and tool-call tints, the reading/side surface split, Iosevka for code and Iosevka Etoile for chrome and prose, Carbon icons, spacing, surfaces and motion) is specified in `reference/visual-language.md`. **Pixel layouts at 1512 × 982 are in `layout.md`.**

The text grids are 160 columns (100 for the compact variant) only because a monospace grid is a convenient way to draw structure. Every row in every block is exactly the declared width. Partial blocks say which region they replace. View with wrapping off.

**Reading rules hold even in wireframes.**
- Prose follows the client's word-wrap rules (`reference/visual-language.md` §4.2).
- Paths truncate to `…/leaf`.
- IDs are never cut.

**Content.**
- **Real, from the ledger:**
  - the slices and their states on 2026-10-27;
  - the `execute-symbolic-calls` blocking decision Q1, obligations B1–B5/A1–A6, findings W1/F12–F17, commits `5712d1a` `06500de` `69ca7f9` and the gate counts;
  - the `simplify-adapter-launch-tests` hold (10-19);
  - `work-router` (hold lifted 10-23) and `execute-causal-scan` (decided 10-21) shown as not needing you;
  - 1 eligible `native-engine` slice;
  - downstream counts computed from the ledger graph: `execute-symbolic-calls` 4 direct / 25 transitive, `execute-causal-scan` 3 / 23, `evaluate-exact-sum-with-demand` 3 / 23, `specify-rsps-profile` 2 / 4, `specify-cma-profiles` 8 / 29. Queue columns show the transitive count;
  - proposal small multiples and SC-16 counts from the host's slices scope (RQ-41): 72 open, 26 merged, 4 superseded, 63 waiting on a dependency, 3 ready.
- **Real, from `docs/spec-review-notes.md`:** the human's annotations A006/A014–A022.
- **Fixture, invented:**
  - the `render-host` design workflow and its digests, and `render-cli`;
  - assignment IDs, ages, sequence numbers and times;
  - the coordinator transcript (composed from real document text; the ledger holds no transcripts);
  - the quarantine case and `op9`;
  - pass lineage digests, the merge package at `R41`, routing and policy revisions.

**One fixture timeline**, so the screens agree with each other:
- 13:57: `modules r2` is emitted.
- 14:01: `@7` is saved (annotations v3).
- 14:03: queue (SC-02).
- 14:05: review with 2 local drafts (SC-04).
- 14:06:55: your desktop saves `@8` (v4).
- Then **either** the laptop already has v4, so the readback opens STALE before anything is sent (SC-09), **or** it has not, so the host answers `stale_basis` (SC-10 b). These are the two orderings of one race, not one sequence.
- 14:07:10: after reading `@8` and saving the 2 drafts (v5), the approve readback binds v5 (SC-09).

**Wireframe conventions:**
- `›` in column 1 = cursor row; `▌` = text cursor; `[a]` = a hint chip.
- `[N]`, `[I]` and `[◆]` = the statusline mode badge.
- Bracketed marks (`[+]`, `[!]`, `[?]`, `[×]`) and the glyphs `◆ ✗ ? ▸ # ↺ · ✓ ×` stand for the icons in `reference/visual-language.md` §8. They are also the TUI fallback. `◇` is the diamond outline, in `fg.alt`.
- Colour is not drawn in these grids (`reference/visual-language.md` §5.3). `◆` that needs you now is the coral diamond; the bufferline's `◆3 ✗1 ?1` are solid count tags (§5.4).
- A key printed as an invitation (`␣n`, `⏎ open`, `:filter clear`) is a chip in the client, which a grid can't draw (`reference/grammar.md` §18).
- The strip's five columns are equal in pixels (`layout.md` §0). In a grid they flex by a few cells, so each value prints whole in its 1512 form (`spec.md` §2.1).
- The bufferline prints no seq and no time. The statusline's right end is `seq N`, the read-basis token on workflow views, and position; when the view isn't live, `seq N · as of T`.

Each screen lists the tasks it serves (`T…`), the failures it defends (`failure-catalogue.md`) and the protocol fields it needs (`protocol-requirements.md`).

---

## SC-01 Workspace layout

The frame every screen uses (`reference/visual-language.md` §2.2):
- the bufferline (open views, attention counts including `✗`, the host segment);
- the handover strip on workflow-scoped views;
- panes with a chrome gutter;
- floats docked above the statusline;
- the statusline with SAVE, and at its right end seq, the read-basis token and position;
- the echo area.

```
 1 queue │ 2 render-host·modules r2 [+]2 │ 3 chat·render-host │ 4 execute-symbolic-calls                 ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  row 2-3: handover strip       │ same 5 cells, same order,     │ on every workflow-scoped view │ values from host fields only  │ ␣n, or its keys at the target 
                                                                                                    │                                                           
  PANE A (focused)                                                                                  │  PANE B (side pane: surface.side)                         
                                                                                                    │                                                           
  sign column: 3 cells, chrome lane                                                                 │  splits: ␣wv ␣ws · move: C-h/j/k/l                        
  │                                                                                                 │  balance: ␣w= · maximize: ␣wf                             
  ▼                                                                                                 │                                                           
M2  content lane starts after the sign column and 1 cell of padding                                 │  no pane ever moves focus by itself                       
[+] prose wraps at words; the measure (68 characters) is a maximum, the rest is margin              │  (FC-T07); host updates apply only at                     
 ◆  separators are whole cells (│); GPUI draws a 1 px rule in the cell                              │  frame boundaries (FC-T15)                                
  → continuation of a token longer than the column (URL, hash)                                      │                                                           
⟨!⟩ row contains escaped or suspicious characters                                                   │                                                           
                                                                                                    │                                                           
  focused pane: rule.focus + bold title, cursor row on surface.cursor.read                          │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
                                                                                                    │                                                           
── FLOAT ZONE (rows 37–46): which-key · peek · readback · pickers — docked, full width ─────────────────────────────────────────────────────────────────────────
  floats sit above the statusline and never cover the bufferline, statusline or echo area (FC-S08)                                                              
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
 [N]  render-host › modules › r2 › M2 · judgment   SAVE [+]2 local                                                         seq 18350 · basis r2 v3 pol3   L14   
 row 48: echo area / minibuffer: `:` command line, messages, receipts                                                                                           
```

- Host updates are applied only at frame boundaries; panes never move focus by themselves (FC-T07, FC-T15).
- **Host segment.** Calm: `homeserver · protected to seq 18340 (2 m)`. Per `hostMode`: `not accepting changes`, `catching up after a restore`, `blocked on the host`. After a restore, before pairing: `restored · pair this device again`. `K` on it shows the target, the protection and whether a restore has been verified.
- **Host time** appears only where freshness is claimed: `seq N · as of T` when the view isn't live, the readback's STATE line, stale and offline notices, and `K` on the seq.
- Tasks: all. RQ-02, RQ-18, RQ-37.

---

## SC-02 Needs-me queue (the landing view)

The andon board, shown here after one `j` from the landing position (the oldest NEEDS YOU row). Proposal progress lives in the explorer's Proposals tab (SC-16), not here.
- NEEDS YOU holds decisions and acts only you take, including the main merge. Operator remedies on the host (a quarantine) sit directly below, in **ON THE HOST**. Each group has one number everywhere it appears: its header and the bufferline (`◆3`, `✗1`) (FC-M35).
- RUNNING prints rows and slots apart, `4 · slots 4/4`, because they can differ (FC-M36). Implementation rows name the pass.
- WAITING holds what waits on anything else: dependencies, slots, the forge. A delegated checkpoint request waits here: `delegated (s3) · agent decides`, dropping `· agent decides` first and then `(s3)`, while `delegated` stays whole.
- A persistent state word leads the reason, so truncation can't remove it. The risk row's full reason is `duplicate risk · effect · forge reply lost · op9 reconciling`, with the `?` mark on the row (FC-M50).
- DONE words are `integrated into proposal`, `merged main (observed)`, `merged main (observed) · merged source differs from reviewed R7` and `modules r1 · advanced · delegated (s3)`.
- `downstream` counts slices that depend on the row transitively and are not yet integrated (RQ-12).
- Rows are stable (oldest first) and frozen while you navigate; arrivals wait in the echo area.
- **Card:** the five facts in their full forms (`spec.md` §2.1). NEXT prints `␣n`, because the queue isn't the NEXT target, and never carries the recommendation. ACTIONS are the row's own: `⏎ …`, local keys, `␣ax`.
- **Statusline:** mode, `queue › NEEDS YOU › 2 of 3`, seq, position. No group counts.
- **Calm state:** NEEDS YOU empty, and nothing reads as needs-you: no coral tag, diamond or caption.

```
 1 queue │ 2 render-host·modules r2 │ 3 chat·render-host                                                 ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 NEEDS YOU · 3                                                oldest first  waiting  downstream │ minos / native-engine / execute-symbolic-calls                
 ◆ skills …/simplify-adapter-launch-tests     direction · held by you            8d 5h        0 │ Execute symbolic Calls                        ◆ waiting 2d 4h 
›◆ minos  …/execute-symbolic-calls            decide Q1 · aliased callee Axes    2d 4h       25 │                                                               
 ◆ render render-host · modules r2            review checkpoint                     6m        — │ COMMITMENT  Contract K·40cc · B1–B5 A1–A6                     
 ON THE HOST · 1                                                                                │             accepted by you 10-03 14:32                       
 ✗ minos  …/specify-rsps-profile              operator · as38 quarantined          52m        4 │ OWNER       you · implementer as31·g2 blocked                 
                                                                                                │ EVIDENCE    pass 2 · no Watchdog on 3be1f0c [!]               
 WAITING · NOT ON YOU · 6                                                                       │ BLOCKER     F16 HARD · aliased callee Axes undefined          
 # skills design-workflow/work-router         dependency · integrate-fast-ful…      4d        2 │ NEXT        ◆ answer Q1 · 3 options              ␣n           
 # skills design-workflow/checkpoint-engine   dependency · work-router              4d        1 │                                                               
 # skills design-workflow/design-playbook     dependency · checkpoint-engine        4d        0 │ reviews 1 of 2 · downstream 4 · 25 in all · since 10-25 09:52 
 # minos  …/evaluate-exact-sum-with-demand    eligible · slot 4/4 busy             41m       23 │                                                               
 ? render render-host · op9                   duplicate risk · effect · forge …    23m        — │ QUESTION                                                      
 # render render-cli · seams r1               delegated (s3) · agent decides       15m        — │  What does a Call mean when it binds two distinct callee      
                                                                                                │  Axes to one caller Axis?                                     
 RUNNING · 4 · slots 4/4                                                                        │  coordinator recommends 1                                     
 ▸ minos  native-engine/execute-causal-scan   implementer as19·g3 · pass 2         41m       23 │  1 Accept the current dispositions   [recommended]            
 ▸ lnkr   gathering/auto-tag-bookmarks        watchdog r1 as46·g1 · fable          12m        0 │  2 Forbid aliasing                                            
 ▸ minos  …/specify-cma-profiles              implementer as45·g1 · pass 1          8m       29 │  3 Define the semantics                                       
 ▸ render render-host · p2 candidate b        experiment as42·g1                    3m        — │                                                               
                                                                                                │ ACTIONS                                                       
 DONE · LAST 24H · 3                                                             ␣fr all recent │  ⏎    open decision           ␣oe  evidence                   
 ✓ skills …/finish-full-suite-optimization    integrated into proposal             19h          │  ␣oc  implementer chat         gd   Contract K·40cc           
 ✓ minos  …/preserve-demanded-outcomes        integrated into proposal             21h          │  gk   blocker details          ␣da  all actions               
 ✓ lnkr   gathering/show-favicons             merged main (observed)               23h          │  ␣ax  ◆ cancel work                                           
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
                                                                                                │                                                               
 [N]  queue › NEEDS YOU › 2 of 3                                                                                                             seq 18342   2/17   
 incoming 1: lnkr gathering/auto-tag-bookmarks watchdog finished · the list updates when you pause                                                              
```

**The main merge selected** (replaces the top of the list and the card; package fixture). `⏎` and `␣n` both open the merge package (SC-19). An uncertainty is not a blocker.

```
 NEEDS YOU · 3                                                oldest first  waiting  downstream │ minos / native-engine                                         
 ◆ skills …/simplify-adapter-launch-tests     direction · held by you            8d 5h        0 │ merge main                                       ◆ waiting 2m 
›◆ minos  native-engine                       merge main · on the forge             2m        — │                                                               
 ◆ render render-host · modules r2            review checkpoint                     6m        — │ COMMITMENT  intake K·7d21 · 41 Slices                         
 ON THE HOST · 1                                                                                │             accepted by you 10-03 14:32                       
 ✗ minos  …/specify-rsps-profile              operator · as38 quarantined          52m        4 │ OWNER       you · main merge                                  
                                                                                                │ EVIDENCE    R41 published #135 · 41/41 Watchdog pass          
                                                                                                │ BLOCKER     none · 1 uncertainty                              
                                                                                                │ NEXT        ◆ merge main · on the forge          ␣n           
                                                                                                │                                                               
                                                                                                │ READINESS                                                     
                                                                                                │  ELIGIBLE      eligible · 41/41 integrated                    
                                                                                                │  PUBLISHED     R41                                            
                                                                                                │  PROMOTION     observed for R41                               
                                                                                                │  ON THE FORGE  ready #135 · observed 2m ago                   
                                                                                                │ since 10-27 14:01                                             
                                                                                                │                                                               
                                                                                                │ ACTIONS                                                       
                                                                                                │  ⏎    open package                                            
```

**A delegated request's card** adds one line after the facts: the host's sentence `notes you save must be answered before it advances`, then the chip `␣ax` and `cancels the request`.

**Compact.** Under a 1180 px pane the card moves under the list, and groups other than NEEDS YOU and ON THE HOST collapse to their headers.

```
 1 queue │ 2 modules r2 │ 3 chat             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 NEEDS YOU · 3                                                                              waiting 
 ◆ skills …/simplify-adapter-launch-tests       direction · held by you                   8d 5h     
›◆ minos  native-engine/execute-symbolic-calls  decide Q1 · aliased callee Axes           2d 4h     
 ◆ render render-host · modules r2              review checkpoint                            6m     
 ON THE HOST · 1                                                                                    
 ✗ minos  …/specify-rsps-profile                operator · as38 quarantined                 52m     
                                                                                                    
 WAITING · 6    RUNNING · 4 · slots 4/4    DONE 24H · 3                                   za expand 
                                                                                                    
── minos / native-engine / execute-symbolic-calls ──────────────────────────────────────────────────
 COMMITMENT  Contract K·40cc · B1–B5 A1–A6 · accepted by you 10-03 14:32                            
 OWNER       you · implementer as31·g2 blocked                                                      
 EVIDENCE    pass 2 · no Watchdog on 3be1f0c [!]                                                    
 BLOCKER     F16 HARD · aliased callee Axes undefined                                               
 NEXT        ◆ answer Q1 · 3 options                              ␣n                                
                                                                                                    
  ⏎ open decision   ␣oe evidence   gk blocker   ␣ax ◆ cancel work   ␣da all actions                 
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
 [N]  queue › NEEDS YOU › 2 of 3                                                   seq 18342   2/17 
                                                                                                    
```

- Tasks: T01, T02, T23, T25. Defends FC-M10, FC-M13, FC-M21, FC-M24, FC-M45, FC-M50, FC-M51, FC-R01, FC-R02, FC-R05, FC-R06, FC-T01–T03, FC-T21, FC-Q03.
- RQ-01, RQ-03, RQ-04, RQ-12, RQ-15, RQ-25, RQ-27, RQ-28, RQ-47.

---

## SC-03 Chat reader with modal prompt and steering

- Authors come from host metadata in the gutter and header band, never from message text (FC-S10).
- Prose wraps at words within the 68 ch measure.
- Tool calls fold to one line. They have no icon: the tint shows the outcome, and the outcome word starts a fixed column (bold for failed and unknown; `reference/visual-language.md` §5.5). A text grid cannot draw tints, so `[ok tint]` marks them.
- References in the host's index (`A020`, `A021`, `M3`) render in salmon Iosevka with a solid underline, which a text grid cannot show either (`reference/visual-language.md` §5.9). Code blocks are syntax-highlighted (§5.10).
- Steering excerpts are `prose.small` on the content bar, clamped to 3 lines. Side-pane rows are structured: key · role · state · time.
- The prompt header says **before** you send whether `⏎` prompts or steers.
- A steer that arrives after the turn ended is refused with `turn_ended`, kept as a draft, and offered as a follow-up (RQ-09).

```
 1 queue │ 2 render-host·modules r1 │ 3 chat·render-host                                                 ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  seams r3 · by you             │ coordinator as27·g1 · drafting│ challenger r1: 4/4 answered   │ none                          │ nothing for you yet           
hst ── modules r1 · rework requested by you · annotations v2 · 10-26 18:40 ──                          │ CONVERSATION                                           
                                                                                                       │  coordinator as27·g1 · opus-5.5 · render-host          
you you · laptop · 10-26 18:41 · rcpt …R2D8                                                            │  turn t42 running · 4m 10s · 3 tools · 9.4k tok out    
    A020 needs a real comparison of storage, not the SQLite default. Keep one                          │  FOLLOW on · any upward motion pauses, G resumes       
    authoritative host and say what each option costs.                                                 │                                                        
                                                                                                       │ STEERING QUEUE · ␣cq                                   
crd coordinator · opus-5.5 · as27·g1 · turn t42 · 13:52                                                │  #1 13:54 delivered after request_role                 
    I'll answer A020 with an experiment rather than argument. Protocol p2 compares                     │  #2 13:55 on host, not yet delivered                   
    three layouts against the same fixtures:                                                           │  ▏ Keep history exportable for evals…                  
                                                                                                       │  if the turn ends first: kept as a draft · ␣cf sends it
      1. SQLite-held immutable document revisions                                                      │                                                        
      2. SQLite plus content-addressed files for large bytes                                           │ ARTIFACTS IN THIS TURN                                 
      3. SQLite metadata plus Git-backed documents, where the document history                         │  p2 protocol · accepted                                
         is the Git history and the database keeps only references                                     │  modules r2 · drafting                                 
                                                                                                       │                                                        
    Falsifier: a layout fails if a clean-host restore from backup cannot read every                    │ OTHER CONVERSATIONS · render-host                      
    accepted revision, whatever its speed. Speed and size are reported but decide                      │  a · candidate · queued · 16m                          
    nothing on their own.                                                                              │  b · candidate · running · 3m                          
    read_artifact  docs/spec.md §5.4           ok · 6.1 KB · 0.2 s               [ok tint]             │  c · candidate · queued · 16m                          
    bash  rg -n 'blocksCount' host/            exit 1 · no matches · 0.1 s       [fail tint, word bold]│  as33·g1 · challenger · r1 done · 2h                   
    request_role  experiment-candidate ×3 · p2 ok · 0.4 s                        [ok tint]             │                                                        
        a as41·g1 queued (waits for a slot) · b as42·g1 running · c as43·g1 queued                     │ OUTLINE · ]m [m messages · ]t [t tools                 
    web_search  "aliased callee axes"          ok · Tavily · Exa failed · 2.4 s  [ok tint]             │  10-26 18:40  rework requested       hst               
                                                                                                       │  10-26 18:41  you                                      
you you · laptop · 13:54 · steer #1 · delivered after request_role · rcpt …P0Z3                        │  13:52        coordinator t42        crd               
    Don't let M3 pick a worker topology yet; A021 is still open.                                       │  13:54        you · steer #1                           
                                                                                                       │  13:55        coordinator (streaming)                  
crd coordinator · continuing t42 · streaming                                                           │                                                        
    Understood: M3 will keep both strategies from A021 open. While p2 runs I'm                         │                                                        
    revising M2 so it depends only on immutable revision references, not on a                          │                                                        
    document backend, and M4 now allows outbound network (A006) with host                              │                                                        
    credentials still unmounted.▌                                                                      │                                                        
                                                                                                       │                                                        
                                                                                                       │                                                        
                                                                                                       │                                                        
── PROMPT → steer (turn t42 running) · delivers after the current tool call ───────────────────────────│                                                        
[+] Also: M4 should list which credentials stay host-only now that workers get                         │                                                        
  ▏ network (A006).▌                                                                                   │                                                        
                                                                                                       │                                                        
    Normal: ⏎ send as steer · M-⏎ queue as follow-up · ␣cx interrupt turn · Esc/jk leave Insert        │                                                        
                                                                                                       │                                                        
 [I]  chat › render-host › coordinator as27·g1   PROMPT [+] local draft · → steer                                    seq 18311 · basis r1 v2 pol3   msg 31/31   
 steer #2 queued on host · rcpt …M7XA · delivers after the current tool call                                                                                    
```

**Web tool calls, expanded with `za`** (replaces the tool rows). The detail is `<provider> · <primary> <primary outcome> · <duration>`, with the primary's outcome in bold.
- `<primary outcome>` is `failed` for a classified failure, or `timed out` for a per-attempt timeout, which the server spec calls uncertain and possibly charged (S§6.6 L768). The primary's failure shows even when the fallback succeeds (S§6.6 L767).
- **Drop order:** the duration, then the fallback provider's name. The outcome word and the primary's phrase never drop, at any block width. Below a 480 px block the arguments drop first and the tool name then truncates.
- `K` and `za` give the class: `failed: allowance`, or `timeout · outcome uncertain · may have been charged`.
- Outcomes in `za` rows are `ok`, `partial`, `failed: <class>`, `timed out`, `cancelled`, `interrupted`, `not attempted`. A missing digest reads `none`. A refetch of identical bytes shows as a new observation over the same digest (S§6.6 L774, L782).

```
    web_search  "aliased callee axes"          ok · Tavily · Exa failed · 2.4 s  [ok tint]                                                                      
      provider  obs  outcome            completeness  digest      time                                                                                          
      Exa       o1   failed: allowance  none          none        09:30:58                                                                                      
      Tavily    o2   ok                 partial       9f2c·4e1a   09:31:00                                                                                      
      full result expired · the committed output above stays · a new fetch is a new observation                                                                 
                                                                                                                                                                
    web_fetch  spec.example.org/calls          ok · Tavily · Exa timed out · 8.1 s [ok tint]                                                                    
      provider  obs  outcome    completeness  digest      time                                                                                                  
      Exa       o3   timed out  none          none        09:40:12                                                                                              
      Tavily    o4   ok         complete      41bc·77d0   09:40:14                                                                                              
```

- Tasks: T03–T07, T26, T31. Defends FC-L01–L04, FC-M11, FC-M52, FC-M53, FC-M56, FC-S10, FC-S19, FC-T08, FC-T09, FC-Q01, FC-Q02.
- RQ-09, RQ-10, RQ-24, RQ-30, RQ-46.

---

## SC-04 Checkpoint review and annotation

- Outline of manifest nodes, the immutable emission, and notes for this emission.
- **The outline grid is ID, title, notes.** The title gets the full width (125 px, less any note), and a cut title ends in `…` (FC-Q27). There are no class letters and no legend.
- **The class word** (`observable`, `judgment`, `product`) sits on the node's heading row, at the right end of the heading rule. The sticky band repeats it, and the breadcrumb's tail names it for the cursor's node.
- **The header line** says whose decision it is, from the request's capture: `your review · captured s2`, or the delegated form below with its levers. A settings change never changes this line (S§6.4 L694).
- `c{motion}`/`gc{motion}`/`␣mn` opens a composer anchored to bytes of `r2`. It wraps inside its frame (FC-Q05), and `Esc Esc` keeps the note as a local draft.
- `␣ax` works in review. Outline fields drop or wrap instead of clipping into the separator (FC-Q03).

```
 1 queue │ 2 render-host·modules r2 [+]2 │ 3 chat·render-host                                            ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  seams r3 · by you             │ you · modules r2 awaiting     │ challenger r2: 4/4 answered   │ none · p2 running (advisory)  │ ◆ decide modules r2  ␣aa ␣ar  
 MODULES r2 9f3c·a1e2       │M2  ## Ledger ──────────────────────────────────────────────────────────── judgment │ NOTES ON r2 · set v3                         
 emitted 13:57              │    command(envelope, ctx) → receipt · observe(scope, cursor?) → snapshot           │ 1 saved · 2 local · ]a [a                    
 by as27·g1                 │    artifact(read | upload) → content | ref                                         │                                              
 your review · captured s2  │                                                                                    │  @7  M2 ¶3 · saved v3 · 14:01                
                            │    Ledger accepts authorized commands, invokes Kernel with resolved values and     │  ▏   Name the off-host backup and restore    
   M0 Context               │    atomically records accepted state, immutable facts, receipts, references and the│  ▏   obligation here too (A020, A022: RPO    
   M1 Kernel                │    next durable task. Principal establishment is an internal seam with two         │  ▏   over RTO).                              
   M2 Ledger             @7 │    adapters: enrolled device sessions and server-bound Durable conversations.      │                                              
   M3 Engine            [+] │                                                                                    │ [+]  M3 L41–42 · local                       
 › M4 Sandboxes         [+] │@7▏ Storage is backend-neutral in this revision. Ledger depends only on immutable   │  ▏   Lanes vs fresh workers is still my      
   M5 Effects               │  ▏ revision references; whether document bytes live in SQLite, content-addressed   │  ▏   open question…                          
   C  Contested           6 │  ▏ files or Git is decided by experiment p2 (A020).                                │                                              
                            │                                                                                    │ [+]  M4 ¶2 · local · editing                 
 REVISIONS ␣u               │M3  ## Engine ──────────────────────────────────────────────────────────── judgment │  ▏   Still reads over-engineered on a        
   r2 13:57 ◆ awaiting      │    reconcile(workflow) → progress | blockage · render(assignment) → packet         │  ▏   first pass…                             
   r1 10-26 ↺ rework        │                                                                                    │                                              
                            │    Engine schedules eligible work under a bounded policy, renders assignment       │ ␣mn note this paragraph · c{motion} any range
 EXPERIMENTS                │[+] packets and supervises Durable tasks. Worker topology is not fixed here:        │                                              
   p2 storage ▸ 1/3         │[+] fresh-context workers and durable lanes (A021) both remain candidates.          │ CHALLENGER r2 · as33·g1 · fable              
   gd opens protocol        │      ╴ local note: "Lanes vs fresh workers is still my open…" · i edit · dd drop   │  4 objections · 4 dispositions               
                            │                                                                                    │                                              
                            │M4  ## Sandboxes ─────────────────────────────────────────────────────── observable │ PREVIOUS ROUND r1 → r2                       
                            │    prepare · execute · seal · stop                                                 │  6 notes · 4 acted on                        
                            │                                                                                    │  1 considered · 1 dismissed                  
                            │[+] The baseline profile now permits outbound network for dependency downloads and  │  0 unanswered · ␣om dispositions             
                            │[+] documentation (A006). Host credentials, host Git metadata and control sockets   │                                              
                            │[+] stay unmounted; literal ingress and sealed egress are unchanged.                │ ACTIONS                                      
                            │    ┌ note on M4 ¶2 · local ────────────────────────────────────────────────────┐   │  :w ␣ms  save 2 local                        
                            │    │ Still reads over-engineered on a first pass (A017). What is the smallest  │   │  ␣ar ◆ rework      ␣aa ◆ approve             
                            │    │ profile that still passes V5, and which of the six collection steps would │   │  ␣ax ◆ cancel work                           
                            │    │ a first version actually need?▌                                           │   │  ␣md diff r1       ␣me edit bytes            
                            │    └ Esc Esc done · :w saves · ␣ar sends with rework ──────────────────────────┘   │                                              
                            │                                                                                    │                                              
                            │    Containment stays separate from Effects so shell execution never shares a       │                                              
                            │    process with forge credentials.                                                 │                                              
                            │                                                                                    │                                              
                            │M5  ## Effects ─────────────────────────────────────────────────────────── judgment │                                              
                            │                                                                                    │                                              
                            │                                                                                    │                                              
                            │                                                                                    │                                              
                            │                                                                                    │                                              
                            │                                                                                    │                                              
                            │                                                                                    │                                              
 [I]  render-host › modules › r2 › M4 · observable   SAVE [+]2 local                                                       seq 18350 · basis r2 v3 pol3   L58   
 -- INSERT -- note on M4 ¶2 stays on this device until :w                                                                                                       
```

**A delegated request's header** (replaces the top of the outline). The sentence is the host's; `K` shows the agreed scope reference.

```
 MODULES r1 7c10·3e9a       │                                                                                                                                   
 emitted 14:02              │                                                                                                                                   
 by as27·g1                 │                                                                                                                                   
 delegated (s3)             │                                                                                                                                   
 agent decides              │                                                                                                                                   
 notes you save must be     │                                                                                                                                   
 answered before it advances│                                                                                                                                   
 ␣ax cancels the request    │                                                                                                                                   
```

- Tasks: T10–T12, T29, T31, then T14/T15. Defends FC-M01, FC-M02, FC-M06, FC-M38, FC-M45, FC-L05, FC-T09, FC-S01–S04, FC-Q01–Q06, FC-Q27.
- RQ-05, RQ-11, RQ-13, RQ-23, RQ-31, RQ-47.

---

## SC-05 Emission diff r1 → r2

- Prose diffs wrap per side; only the first line of each source line carries its sign.
- Hunk labels are the client's own; the host cites nodes and byte ranges (RQ-32).
- NEXT prints `␣n`: the NEXT target is the review, which `␣n` opens.
- When the source changes `.gitattributes` or `.gitmodules`, a chrome notice from a host flag says so: `this source changes .gitattributes · inert on the host` (S§7.2 L829).

```
 1 queue │ 2 render-host·diff r1→r2 │ 3 chat·render-host                                                 ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  seams r3 · by you             │ you · modules r2 awaiting     │ challenger r2: 4/4 answered   │ none · p2 running (advisory)  │ ◆ decide modules r2  ␣n       
    r1 4be0·77c1 · 10-26 18:12 · as27·g1                                       │    r2 9f3c·a1e2 · 10-27 13:57 · 9 hunks · notes anchor on this side            
───────────────────────────────────────────────────────────────────────────────│────────────────────────────────────────────────────────────────────────────────
  - M1 ## Commitments                                                          │h1+ M1 ## Kernel                                                                
                                                                               │                                                                                
  - M2 ## Record                                                               │h2+ M2 ## Ledger                                                                
                                                                               │                                                                                
  - Small checkpoint documents, protocols, reports and receipts belong in the  │h3+ Storage is backend-neutral in this revision. Ledger depends only on         
    store. Large retained snapshots and logs use host-owned immutable          │    immutable revision references; whether document bytes live in SQLite,       
    content-addressed files.                                                   │    content-addressed files or Git is decided by experiment p2 (A020).          
                                                                               │                                                                                
  - M3 ## Work                                                                 │h4+ M3 ## Engine                                                                
                                                                               │                                                                                
  - Work is a bounded ordinary-code scheduler. It selects legal work, renders  │h5+ Engine schedules eligible work under a bounded policy, renders assignment   
    a packet, starts or reconciles a task, and suspends on durable waits.      │    packets and supervises Durable tasks. Worker topology is not fixed here:    
                                                                               │    fresh-context workers and durable lanes (A021) both remain candidates.      
                                                                               │                                                                                
    M4 ## Sandboxes                                                            │    M4 ## Sandboxes                                                             
                                                                               │                                                                                
  - Baseline profile: pinned Linux image digest; `--network none`; read-only   │h6+ Baseline profile: pinned Linux image digest; outbound network for           
    root filesystem; non-root identity; all capabilities dropped.              │    dependencies and documentation (A006); read-only root filesystem; non-root  
    Network-required work blocks until a separately authorized and verified    │    identity; all capabilities dropped.                                         
    profile exists.                                                            │                                                                                
                                                                               │                                                                                
    ⋯ 3 more hunks (h7 M4, h8 M5, h9 Contested) · ]h                           │    ⋯ 3 more hunks (h7 M4, h8 M5, h9 Contested) · ]h                            
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
                                                                               │                                                                                
 [N]  render-host › diff r1→r2 › h6 (M4)   SAVE [+]2 local                                                                seq 18352 · basis r2 v3 pol3   h6/9   
 prose diffs wrap per side, the sign starts each source line · c{motion} annotates the r2 side · ␣md back                                                       
```

- Tasks: T09, T11. Defends FC-M01, FC-L05, FC-Q01, FC-S20.
- RQ-11, RQ-14, RQ-23, RQ-32.

---

## SC-06 Annotation disposition map

The host enforces completeness (I11). The CHECK column maps the cited byte ranges to this client's diff hunks, and flags dismissals and product questions by their words (`dismissal: read the reason`, `product question`), with no icon and no flag. Host objection text is shown as sent (`C: incidental choice · four executing attempts`), and `C` stays as the authored node ID (FC-M57). Approving and rework happen on the review, which the strip's `␣n` opens.

```
 1 queue │ 2 render-host·dispositions r1→r2 │ 3 chat·render-host                                         ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  seams r3 · by you             │ you · modules r2 awaiting     │ challenger r2: 4/4 answered   │ none · p2 running (advisory)  │ ◆ decide modules r2  ␣n       
 DISPOSITIONS · modules r1 → r2 · your annotation set v2 (6 notes) · answered by coordinator as27·g1 in r2's manifest                                           
 Host checks completeness (every note answered); you judge adequacy. CHECK maps the cited byte ranges to this client's diff hunks.                              
                                                                                                                                                                
 note your note on r1 (anchor)                         answer      reason · resulting reference in r2                            check                          
 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 @1   M1 heading · rename Commitments → Kernel         acted on    renamed throughout · r2 M1 heading                            ✓ change in M1 (h1)            
 @2   M2 heading · rename Record → Ledger              acted on    module renamed; the Record stage keeps its name · r2 M2       ✓ change in M2 (h2)            
 @3   M3 heading · rename Work → Engine                acted on    renamed · r2 M3 heading                                       ✓ change in M3 (h4)            
 @4   M4 ¶1 · workers routinely need internet (A006)   acted on    baseline profile allows outbound network · r2 M4 ¶2           ✓ change in M4 (h6, h7)        
 @5   M2 ¶4 · storage trade-offs not thought through   considered  protocol p2 compares 3 layouts; M2 now backend-neutral        ? change in M2 (h3);           
        (A020)                                                       · r2 M2 ¶3 · experiment p2                                    p2 still running             
 @6   M4 ¶3 · "over-engineered? reminds me of orbs"    dismissed   "observation, not an instruction; no mechanism named.         dismissal: read                
        (A017)                                                       Asks you which complexity to cut." · no change                the reason                   
                                                                                                                                                                
 6 notes · 4 acted on · 1 considered · 1 dismissed · 0 unanswered          completeness ✓ enforced by host (I11)                                                
                                                                                                                                                                
 CHALLENGER r2 · as33·g1 · fable · objections on the r2 draft (before emission)                                                                                 
 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── 
 X1   M2: backend-neutral wording hides a choice       acted on    M2 now names p2 as the decider · r2 M2 ¶3                     ✓ change in M2 (h3)            
 X2   M3: "start/resume/fence" leaks lane design       acted on    removed; Engine interface unchanged · r2 M3 ¶2                ✓ change in M3 (h5)            
 X3   M4: network egress widens exfiltration path      considered  provider privacy policy is separate (§7.1); flagged           product                        
                                                                     for you as product question C3                                question                     
 X4   C: incidental choice · four executing attempts   acted on    disclosed in Contested C4 · default kept                      ✓ in C                         
                                                                                                                                                                
                                                                                                                                                                
 ⏎ the note on r1 · gd the reference on r2                                                                                                                      
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
 [N]  render-host › dispositions r1→r2 › @6                                                                               seq 18352 · basis r2 v3 pol3   @6/6   
 @6 dismissed: the coordinator asks you to name which complexity to cut (A017)                                                                                  
```

- Tasks: T13. RQ-11, RQ-13, RQ-32.

---

## SC-07 Evidence and receipts

- **The PASS block comes first.** The record says what each role saw (S§6.2.1 L632). The Audit line carries no staleness word or mark, ever: A differing from the submitted source is expected, and no re-Audit follows.
- The pass line names its cause: Watchdog rework, a preparation conflict, or source/verifier repair. Deterministic retries keep the pass (S§6.2.1 L624). Preparation attempts sit on the `prepared` line and are never drawn or counted as reviews.
- The letters A, B and X appear only in `K`.
- Obligation cells are host summaries (`K` gives the full text). Finding↔obligation links appear only where the report records one (RQ-14).
- **FINDINGS** print the host's disposition word: fixed, considered, dismissed, needs-human.
- **REPORTS** are grouped by pass: `pass 2 current`, then `pass 1 historical`, which collapses to its header and its Watchdog rounds, because they still count. Each round shows its verdict and a counted mark (`Watchdog r2 · pass · drift · counted`).
- **Catalog rows** carry their kind (`executed`, `journey`, `generated · no proof rank`, `human · advisory`), and a maintenance report's `clean`, `changed` or `blocked` per row.
- **Web evidence** is an item of its own; the passage is content on the content bar (FC-S19).
- **Native checks** that can't run on Linux read `unrun on Linux · see local prompt` with the chip `␣ol`. They are advisory: never passed, never a readiness gap. The advisory line reads `local check (advisory) · prompt 3 for R7` with `␣ol`, or `not available yet: <what is missing>`.
- The attribute notice shows when the host flags the source (S§7.2 L829; FC-S20).
- At 800 px REPORTS sits under the main column.

```
 1 queue │ 2 execute-symbolic-calls·evidence │ 3 decision Q1                                             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT               │ OWNER                             │ EVIDENCE                            │ BLOCKER                    │ NEXT                        
  Contract K·40cc · by you │ you · implementer as31·g2 blocked │ pass 2 · no Watchdog on 3be1f0c [!] │ F16 HARD · aliased callee… │ ◆ answer Q1 · 3 options  ␣n 
 PASS 2 · opened by Watchdog r1 rework · Audit done                                                       │ FINDINGS · ]f [f                                    
   Audit examined   a6dcb53   standards ✓ · contracts ✓ · 6 findings: 4 fixed, 1 considered, 1 needs you  │ W1  BLOCK  integration conflicts with b4d9a44       
   submitted        5712d1a   after fixes and rechecks                                                    │            fixed 029f917 · not independently checked
   prepared         3be1f0c   = 5712d1a + target 06500de · checks pass · attempt 2 (target moved once)    │ F12 judge  duplicate Unsupported · fixed 5712d1a    
   Watchdog         none yet on 3be1f0c                                                reviews 1 of 2     │ F13 judge  third finding stanza · fixed 5712d1a     
 this source changes .gitattributes · inert on the host                                                   │ F14 judge  README scope sentence · fixed 5712d1a    
                                                                                                          │ F15 judge  whole-Time filter comment · fixed 5712d1a
 OBLIGATIONS · Contract K·40cc · ]o [o · gi evidence for row · gD the Contract revision                   │ F16 HARD   aliased callee Axes undefined            
 id  obligation (summary · K full)       implementer @5712d1a             audit @a6dcb53   watchdog r1    │            needs-human · → decision Q1              
 B1  definition errors and recursion     ✓ call_test · 2 corpus PASS      none             not assessed   │ F17 judge  generator skips whole-Time · considered  
 B2  callee Axis meaning, constraints    ✓ validator + engine tests       none             not assessed   │                                                     
 B3  every Callable checked statically   ✓ failing + passing bindings     none             not assessed   │ REPORTS · ⏎ opens                                   
 B4  Call results equal hand-inlined     ✓ 128 seeds × 8 bindings         none             not assessed   │ pass 2 current                                      
 B5  whole-Time reaches through Calls    ✓ whole_time_reaches_through…    F8 F11 cleared   not assessed   │   implement r1 · needs_human · 10-25 09:52          
 A1  unsupported list only shrinks       ✓ aliasing rejected · F16 ◆      F16 HARD open    not assessed   │     standards audit · fable · 13 tools · 2m15s      
 A2  all rules in the shared validator   ✓ cli.sh fixtures                none             not assessed   │     contracts audit · fable · 20 tools · 2m30s      
 A3  Calls inlined only in planning      ✓                                none             not assessed   │   Watchdog none yet                                 
 A4  expected values hand-derived        ✓ bit-identical comparisons      none             not assessed   │ pass 1 historical                                   
 A5  demand, provenance via Calls        ✓ partial: no host/Regions yet   none             not assessed   │   Watchdog r1 · rework · counted · 69ca7f9          
 A6  Call targets name Definitions       ✓                                none             not assessed   │                                                     
 M   manual checks                       none · advisory only                                             │ INTEGRATION                                         
                                                                                                          │ Needs a Watchdog pass on the prepared source        
 GATE RECEIPT                                                                                             │ 3be1f0c, then a guarded proposal-ref update. Not    
 ✓ mise run gate @5712d1a · run by implementer as31·g2 in its sandbox · 10-25 09:40 · pass                │ merge-ready. The main merge is yours.               
   json_input 6 · ir 15 · json_ir 13 · validator 31 · engine 59 · store, CLI pass                         │                                                     
   corpus 38 pass · 109 unsupported · 0 fail · git diff --check clean                                     │                                                     
                                                                                                          │                                                     
 CATALOG · kind · maintenance report                                                                      │                                                     
   call_test                executed                     clean                                            │                                                     
   corpus replay            journey                      changed                                          │                                                     
   case generator           generated · no proof rank    clean                                            │                                                     
   manual example walk      human · advisory             blocked                                          │                                                     
                                                                                                          │                                                     
 WEB PASSAGE retained for F16                                                                             │                                                     
   partial · Tavily · obs o2 · 10-25 09:31 · 9f2c·4e1a                                                    │                                                     
   https://spec.example.org/calls#aliasing → https://spec.example.org/v3/calls.html#aliasing              │                                                     
   ▏ A Call may bind two callee Axes to one argument only when both                                       │                                                     
   ▏ Axes share one Domain.                                                                               │                                                     
                                                                                                          │                                                     
 NATIVE CHECKS                                                                                            │                                                     
   macOS framework behaviour   unrun on Linux · see local prompt   ␣ol                                    │                                                     
   local check (advisory) · prompt 3 for R7   ␣ol                                                         │                                                     
                                                                                                          │                                                     
 RANK                                                                                                     │                                                     
 Implementer-run evidence only. Integration needs an independent Watchdog pass on the                     │                                                     
 prepared source 3be1f0c. Nothing here authorizes integration.                                            │                                                     
                                                                                                          │                                                     
 LIMITATIONS (from the report)                                                                            │                                                     
 generator never binds a whole-Time argument to a Call Input (Debt Marker)                                │                                                     
 Call instances still enumerated per Call path (existing debt)                                            │                                                     
 [N]  execute-symbolic-calls › evidence › A1                                                                  seq 18371 · basis K·40cc 5712d1a pol3   A1 6/12   
 gi on A1: 1 test, 1 corpus case, audit F16 · K on a row shows the full obligation text                                                                         
```

- Tasks: T08, T28. Defends FC-M10, FC-M15, FC-M40–M43, FC-M46, FC-S19, FC-S20. RQ-14, RQ-26, RQ-44, RQ-45, RQ-46.

---

## SC-08 Assignments and agents (the explorer's Agents tab)

This table is the main list of SC-16's **Agents** tab (`␣oa`). The sidebar's scope tree scopes it by project, and the state filter selects assignment states.

- Groups: `EXECUTING · 4 · slots 4/4`; ON THE HOST, holding the quarantine and any `orphaned · cleanup unresolved` (S§6.3 L640); HELD (ownership kept, no slot); QUEUED.
- **Each row:** icon, slot, assignment, workflow path, role, state, since. Model and last activity move to the preview, which also holds the lifecycle list.
- **State** is the host's execution fact (planned, starting, running, submitted, blocked, recovering; S§6.1 L590) plus its cancellation state (cancel-requested, quiescing, canceled, quarantined). "Idle between turns" is a conversation state and shows in chat only.
- The statusline reads `4 executing · slots 4/4`, never a bare ratio.
- QUEUED shows the one eligible `native-engine` slice, with its planned assignment `as62·g1`. Across all proposals the graph has 3 eligible slices; the explorer's `ready` state shows all three.

```
 1 queue │ 2 explorer·agents                                                                             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 Slices │ Proposals │ Agents  │ EXECUTING · 4 · slots 4/4 · retained workspaces 7 · 2.3 of 20 GiB                          │ as38·g1 · implementer              
──────────────────────────────│   slot assign.  workflow                         role        state                  since  │ minos / native-evaluation /        
                              │ ▸ 1    as19·g3  …/execute-causal-scan            implementer running                  41m  │ specify-rsps-profile               
 SCOPE · counts match filter  │ ▸ 2    as46·g1  gathering/auto-tag-bookmarks     watchdog r1 running                  12m  │ canceled · quarantined · 52m       
›All                       10 │ ▸ 3    as45·g1  …/specify-cma-profiles           implementer running                   8m  │ model opus-5.5                     
   skills                   0 │ ▸ 4    as42·g1  render-host · p2 candidate b     candidate   running                   3m  │ last: process alive after grace    
   lnkr                     1 │                                                                                            │ canceled by you 13:20 · rcpt …C8VN 
   minos                    6 │ ON THE HOST · 1                                                                            │                                    
   render                   3 │›✗ —    as38·g1  …/specify-rsps-profile           implementer canceled · quarantined   52m  │ LIFECYCLE                          
                              │                                                                                            │ 13:20:02 cancel-requested · fence  
──────────────────────────────│ HELD · ownership kept, no execution slot                                                   │   committed: no new tool starts or 
 STATES · counts in scope     │ ◆ —    as31·g2  …/execute-symbolic-calls         implementer blocked                2d 4h  │   effect admissions for g1         
[ ] ▸ executing             4 │ ◆ —    as27·g1  render-host                      coordinator blocked                  15m  │ 13:20:04 stop requested for the    
[ ] ✗ on the host           1 │                                                                                            │   whole container · 30 s grace ·   
[ ] ◇ held                  2 │ QUEUED · eligible, waiting for a slot                                                      │   forced stop 13:20:34             
[ ] · queued                3 │ · —    as62·g1  …/evaluate-exact-sum-with-demand implementer planned                  41m  │ 13:20:41 quiescence NOT confirmed: 
[ ] ✗ quarantined           1 │ · —    as41·g1  render-host · p2 candidate a     candidate   planned                  16m  │   runtime reports 1 process        
[ ] × canceled              1 │ · —    as43·g1  render-host · p2 candidate c     candidate   planned                  16m  │   (pid 4121) · workspace           
 x toggle · X only · :filter  │                                                                                            │   quarantined, reuse refused       
                              │                                                                                            │ admitted effects before fence: 0   
                              │                                                                                            │ late output retained as quarantined
                              │                                                                                            │   evidence (2 files)               
                              │                                                                                            │ your move, on the host: inspect or 
                              │                                                                                            │   restart the sandbox runtime · a  
                              │                                                                                            │   replacement needs a new          
                              │                                                                                            │   generation                       
                              │                                                                                            │                                    
                              │                                                                                            │ ACTIONS                            
                              │                                                                                            │  ⏎   open its conversation         
                              │                                                                                            │  gd  its slice                     
                              │                                                                                            │  ␣cx interrupt a running turn      
                              │                                                                                            │  ␣ax ◆ cancel work                 
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
                              │                                                                                            │                                    
 [N]  explorer › agents › all   4 executing · slots 4/4                                                                                      seq 18380   5/10   
 as38·g1 has stayed quarantined for 52m · a stuck workspace is never reused silently                                                                            
```

- Tasks: T25, T18. Defends FC-M16, FC-M21, FC-M55. RQ-15, RQ-33.

---

## SC-09 Decisions and authority readback

**Needs-Human decision with the readback open.** The readback binds what you saw at the first key, states EFFECT and NOT in host-authored words, and reports the read basis as current. Options are the host's `{n, title, body, recommended}` (ledger text; options 2 and 3 are shortened here to fit). The title sits on its own line, the cursor option has the bar, and the recommended option has an outlined chip, not a diamond (`reference/visual-language.md` §5.4).
- This view is the NEXT target, so the strip's NEXT prints `␣ad`. While a readback is open, chips outside it draw dimmed (`fg.muted`) and do nothing.
- The note is `local draft · sent with your answer`: `:w` doesn't apply here.

```
 1 queue │ 2 execute-symbolic-calls·evidence │ 3 decision Q1 [+]                                         ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT               │ OWNER                             │ EVIDENCE                            │ BLOCKER                    │ NEXT                        
  Contract K·40cc · by you │ you · implementer as31·g2 blocked │ pass 2 · no Watchdog on 3be1f0c [!] │ F16 HARD · aliased callee… │ ◆ answer Q1 · 3 options  ␣ad
    BLOCKING DECISION · Q1 · from implement report r1 · 10-25 09:52                                           │ CONTEXT                                         
                                                                                                              │  implementer as31·g2 · blocked                  
    What does a Call mean when it binds two distinct callee Axes to one caller Axis?                          │  reviews 1 of 2 · pass 2                        
    Specifically, when the callee holds a Value over both and reduces it along one                            │  waiting 2d 4h · downstream 4 · 25 in all       
    of them, and when a callee Output is over both?                                                           │                                                 
                                                                                                              │ RELATED · gd opens                              
    EVIDENCE                                                                                                  │  F16 contracts audit finding                    
    · §8.4 says inherited Axes "retain the caller's identity"; it neither forbids                             │  F7 earlier fix (one identity)                  
      nor defines two callee Axes sharing one caller Axis.                                                    │  §8.4 specification                             
    · The previous round (F7, accepted) read this as one identity: Values over both                           │  A1 unsupported-list obligation                 
      evaluate elementwise; an Output over both is a definition error.                                        │                                                 
    · Integrated reductions expose the gap: in spread(a over L, b over K), max over                           │ HISTORY ON THIS SLICE · ␣u                      
      L (a*b) has callee type [K]; one identity removes both Axes.                                            │  10-24 watchdog r1 · rework (W1)                
                                                                                                              │  10-25 implement r1 · needs_human               
    OPTIONS · j k move · ␣ad answers with the option under the cursor                                         │  10-25 asked you Q1                             
 ›  1  Accept the current dispositions   [recommended]                                                        │                                                 
  ▏    One identity, an Output over both is a definition error, a reduction over                              │                                                 
  ▏    one aliased Axis is unsupported. This needs no code change. It records a                               │                                                 
  ▏    permanent "unsupported" for a form with no owning Slice until the                                      │                                                 
  ▏    specification is clarified.                                                                            │                                                 
    2  Forbid aliasing                                                                                        │                                                 
       Amend the specification so that distinct callee Axes must bind distinct                                │                                                 
       caller Axes, as a definition error. This is simplest and removes both the                              │                                                 
       F7 special case and the unsupported rejection.                                                         │                                                 
    3  Define the semantics                                                                                   │                                                 
       Amend §8.4 with a rule for reductions and Outputs over aliased Axes, for                               │                                                 
       example keeping the callee Axes distinct within the Call instance.                                     │                                                 
                                                                                                              │                                                 
    YOUR ANSWER · local draft · sent with your answer · o edits the note                                      │                                                 
[+] Option 1 for this Slice. Open the §8.4 clarification as a follow-up and link it                           │                                                 
[+] from the unsupported entry so it is not forgotten.                                                        │                                                 
                                                                                                              │                                                 
                                                                                                              │                                                 
                                                                                                              │                                                 
                                                                                                              │                                                 
── ◆ READBACK · answer decision ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 DECIDE   minos / native-engine / execute-symbolic-calls · Q1 (blocking decision in implement report 40cc0cf)                                                   
 ANSWER   option 1 · accept the current dispositions · your note (2 lines, sent with the answer)                                                                
 BINDS    report 40cc·0cf2 · Contract K·40cc · source 5712d1a · audit a6dcb53 · policy pol3                                                                     
 EFFECT   F16 closes as decided; as31·g2 resumes as a fresh attempt after quiescence; independent review follows                                                
 NOT      does not amend the Contract or spec                                                                                                                   
 STATE    fresh · seq 18371 · host 14:10:04 (1 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                      pinned 14:10:03 at Q1, option 1 
 [◆]  readback › answer Q1 › execute-symbolic-calls                                                                seq 18371 · basis K·40cc 5712d1a pol3   Q1   
 keys typed before this readback appeared were discarded                                                                                                        
```

**Approve readback** (replaces rows 39–48). Notes ride along as non-binding; the drafts were saved first, so it binds v5 exactly. **BINDS renders every field of the host's basis, in the host's order, wrapped in one block.** The basis names the request and its captured settings, never the current dial (S§5.3 L473). A missing value reads `none`; a digest without a revision shows the digest alone.

```
── ◆ READBACK · approve checkpoint ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 APPROVE  render-host · modules r2                                                                                                                              
 BINDS    request C2 · captured s2 · human · emission r2 9f3c·a1e2 · manifest 51d0·08ce · annotations v5 · decisions 2a83·34a6 · intake none ·                  
          policy pol3 · binding bind1                                                                                                                           
 CARRIES  4 saved notes as non-binding                                                                                                                          
 EFFECT   modules approved by you; the Proposal phase starts drafting (coordinator as27·g1)                                                                     
 NOT      edited draft not approved · no Contract accepted                                                                                                      
 STATE    fresh · seq 18356 · host 14:07:10 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                        pinned 14:07:09 at modules r2 
 [◆]  readback › approve modules r2                                                                                         seq 18356 · basis r2 v5 pol3   M0   
 keys typed before this readback appeared were discarded                                                                                                        
```

**Accept-intake readback.** One confirmation style for every authority command: readback, then `y` (Q05). The fresh fidelity review's verdict is a row before `␣ac` (S§8 Proposal L945).

```
── ◆ READBACK · accept intake ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ACCEPT   render-host · proposal r1 · intake I·c41e·9a07 · 6 Slices · 31 obligations · 14 dependency edges                                                      
 BINDS    request C5 · captured s3 · human · emission r1 77a2·e510 · manifest 0b9d·4f11 · annotations v6 · decisions 4c10·e2b7 · intake c41e·9a07 ·             
          fidelity review pass · policy pol3 · binding bind1                                                                                                    
 EFFECT   creates 6 Contract revisions; 2 eligible Slices (record-adrs, kernel-core) start as slots free                                                        
 NOT      Contracts freeze once assigned · amendments need a new acceptance · merging into main stays yours                                                     
 STATE    fresh · seq 18402 · host 16:41:55 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                       pinned 16:41:54 at proposal r1 
                                                                                                                                                                
 [◆]  readback › accept intake I·c41e·9a07                                                                                  seq 18402 · basis r1 v6 pol3   P0   
 keys typed before this readback appeared were discarded                                                                                                        
```

**Readback on a change not yet acknowledged.** The view has not shown you `@8`. `d` is a chip, and the key bar reads `confirm disabled`. While a readback is open the statusline's token omits `]d`. **CHANGED** (a field moves while the readback is open) looks the same, with `y` disabled.

```
── ◆ READBACK · approve checkpoint · STALE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 APPROVE  render-host · modules r2                                                                                                                              
 BINDS    request C2 · captured s2 · human · emission r2 9f3c·a1e2 · manifest 51d0·08ce · annotations v3 [!] · decisions 2a83·34a6 · intake none ·              
          policy pol3 · binding bind1                                                                                                                           
 STALE    annotations v4 not yet acknowledged · d shows it                                                                                                      
          @8 added on M5 ¶1 from your desktop at 14:06:55                                                                                                       
 STATE    stale · seq 18357 · host 14:07:01 (0 s ago)                                                                                                           
 confirm disabled · n Esc q cancel · K full basis                                                                                 pinned 14:07:00 at modules r2 
 [◆]  readback › STALE › approve modules r2                                                                          seq 18357 · basis r2 v3→v4 [!] pol3   M0   
 nothing was sent                                                                                                                                               
```

**Recovery decision** (`kind: recovery`). For an uncertain external effect the host offers options such as recheck, associate a verified object, authorize another attempt, or accept a stated remaining risk. The header names the operation, the side pane holds its facts, BINDS includes the observations, and each option kind has its own fixed NOT text.

```
── ◆ READBACK · answer recovery decision ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 DECIDE   render-host · op9 · create draft proposal PR · recovery decision                                                                                      
 ANSWER   option 1 · recheck now · no note                                                                                                                      
 BINDS    operation op9 · payload 861a·8cf1 · attempt 1 · observations 13:45, 14:02 · policy pol3                                                               
 EFFECT   the host lists the forge again and records what it observes                                                                                           
 NOT      does not create or change a PR · does not clear the duplicate risk                                                                                    
 STATE    fresh · seq 18342 · host 14:03:12 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                     pinned 14:03:11 at op9, option 1 
 [◆]  readback › recovery › op9                                                                                              seq 18342 · basis op9 pol3   1/4   
 keys typed before this readback appeared were discarded                                                                                                        
```

- Tasks: T14–T18, T30. Defends FC-M01, FC-M07, FC-M08, FC-M22, FC-M23, FC-M38, FC-T05, FC-T06, FC-K10, FC-K15.
- RQ-04, RQ-05, RQ-06, RQ-29, RQ-39.

---

## SC-10 Reconnect, stale and unknown-outcome states

**a. Offline with local drafts.** One notice, and no per-cell mark. `:w` is not sent, and there is no offline queue.

```
 1 queue │ 2 render-host·modules r2 [+]2 │ 3 chat·render-host                                                                           ◆3 ✗1 ?1   ○ offline 2m 
  COMMITMENT                    │ OWNER                         │ EVIDENCE                      │ BLOCKER                       │ NEXT                          
  seams r3 · by you             │ you · modules r2 awaiting     │ challenger r2: 4/4 answered   │ none · p2 running (advisory)  │ ◆ decide modules r2  ␣n       
 OFFLINE since 14:07:40 · showing seq 18350 · 2 local drafts safe · host writes and decisions disabled   ␣rc retry                                              
   ⋮  (panes unchanged)                                                                                                                                         
 [N]  render-host › modules › r2 › M4 · observable   SAVE [+]2 local                                      seq 18350 · as of 14:05:31 · basis r2 v3 pol3   L58   
 :w not sent, offline · your drafts stay on this device · run :w again after reconnecting (there is no offline queue)                                           
```

**a′. Fresh snapshot.** After a reconnect or a sequence gap, one echo: `<cause> → fresh snapshot at seq N · drafts, marks, jumplist and pins kept`. Changes stay not yet acknowledged until `]d` or `d` shows them.

```
 1 queue │ 2 render-host·modules r2 [+]2 │ 3 chat·render-host                                            ◆3 ✗1 ?1   ● homeserver · protected to seq 18350 (3 m) 
   ⋮                                                                                                                                                            
 [N]  render-host › modules › r2 › M4 · observable   SAVE [+]2 local                                             seq 18364 · basis r2 v3→v4 [!] pol3 ]d   L58   
 reconnected after 1m22s → fresh snapshot at seq 18364 · drafts, marks, jumplist and pins kept                                                                  
```

The same echo after a sequence gap (echo area only):

```
 sequence gap → fresh snapshot at seq 18366 · drafts, marks, jumplist and pins kept                                                                             
```

The "what changed" list ends with `complete through seq N` or `partial · more on the host`:

```
── what changed since seq 18350 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 annotations v3 → v4 · 1 added · @8 on M5 ¶1 · you, desktop · 14:06:55                                                                                          
 complete through seq 18364                                                                                                                                     
```

**b. `stale_basis` from the host** (the ordering where the desktop's save wins), in display forms.

```
── stale_basis · your approval was NOT recorded · nothing was approved ─────────────────────────────────────────────────────────────────────────────────────────
 YOU SENT      APPROVE modules r2 · request C2 · emission r2 9f3c·a1e2 · annotations v3 · policy pol3      cmd …H2QK · 14:07:12 (laptop)                        
 HOST HAS      request C2 · emission r2 9f3c·a1e2 · annotations v4 · policy pol3                           changed at seq 18357 · 14:06:55 by you (desktop)     
 WHAT CHANGED  annotations v3 → v4 · 1 added, 0 changed                                                                                                         
                                                                                                                                                                
    @8  M5 ¶1 · you, desktop · 14:06:55                                                                                                                         
  ▏ Effects must name the forge adapter as a decoupled submodule (A018), not a sixth module.                                                                    
                                                                                                                                                                
 PERMITTED NOW ⏎ open @8 in the emission (acknowledges it) · ␣aa ◆ approve with v4 (new readback) · ␣ar ◆ rework with v4                                        
 [N]  render-host › modules › r2                                                                                  seq 18357 · basis r2 v3→v4 [!] pol3 ]d   @8   
 stale_basis · cmd …H2QK · no state changed · the receipt is kept in :messages                                                                                  
```

**c. Unknown outcome** (the outbox, `␣ru`), with `turn_ended` and `command_conflict`. `not_found` is not proof it wasn't accepted.

```
── OUTBOX · commands from this device that are not settled ─────────────────────────────────────────────────────────────────────────────────────────────────────
                                                                                                                                                                
 [?] cmd …9XQ4  requestRework  render-host · modules r2 · annotations v5 · pol3   sent 14:09:30                                                                 
       no reply · the host may have accepted it · other decisions on modules r2 are disabled until this settles                                                 
       ␣rq query the receipt (never executes) · ␣rt retry with the same ID and bytes · K envelope                                                               
                                                                                                                                                                
 […] cmd …4D1J  saveAnnotations  execute-symbolic-calls · decision Q1 note   sent 14:09:31 · waiting                                                            
                                                                                                                                                                
 [×] cmd …1MBA  sendMessage  minos · as19·g3 conversation   refused 14:02:10 · turn_ended                                                                       
       The turn ended before your steer arrived. The text is kept as a draft in its chat, to send as a follow-up                                                
                                                                                                                                                                
 [×] cmd …8PTW  recordDecision  execute-symbolic-calls · Q1   refused 14:01:02 · command_conflict                                                               
       the host already has a different request under this ID · nothing new was done · open the object and act again                                            
                                                                                                                                                                
 [N]  outbox   1 unknown · 1 pending · 2 refused                                                                                              seq 18366   1/4   
 not_found: the host has no record yet · that is not proof it wasn't accepted · the safe step is the identical retry                                            
```

**d. Uncertain external effect: the operation view.** The kind reads `create draft proposal PR`, `update PR summary`, `publish source` or `mark proposal ready`. `⏎` on the `DECIDE` line opens the host's recovery decision in SC-09. A sticky duplicate risk stays here and leads the row elsewhere; only a host-recorded resolution clears it.

```
── ? op9 · create draft proposal PR · render-host → vicrdguez/render ───────────────────────────────────────────────────────────────────────────────────────────
                                                                                                                                                                
   OPERATION                                                                                                                                                    
   kind          create draft proposal PR · payload 861a·8cf1 · source canonical head 3c2f9a1                                                                   
   attempt 1     admitted 13:40 · executor epoch e7 · permit consumed once · outcome unknown: the forge reply was lost                                          
                 (connection reset after the request was written)                                                                                               
   observed      13:45 listing: 0 matching PRs · 14:02 listing: 0 matching PRs · a listing is not a verified association                                        
   blocks        publishing and ready promotion for this proposal · local work and integration continue                                                         
   risk          ? duplicate risk · since 13:40 · stays until the host records a resolution                                                                     
                                                                                                                                                                
   SAFE CHOICES  auto-recheck 14:15 · recheck now · inspect attempt 1 · associate a verified object                                                             
                                                                                                                                                                
   DECIDE                                                                                                                                                       
 › ◇ recovery · 4 choices: recheck now, associate a verified object, authorize another attempt, accept the stated remaining risk   ⏎ open                       
                                                                                                                                                                
 [N]  render-host › effects › op9   ? unknown since 13:40                                                                                     seq 18342   op9   
                                                                                                                                                                
```

**e. Revoked device.** The client stops retrying; drafts are kept on the device; the view is frozen.

```
 1 queue │ 2 render-host·modules r2 [+]2                                                                                                     ✗ revoked 14:20:05 
✗   This device's enrollment was revoked on the host at 14:20:05. The client will not retry. Your 2 local drafts stay on this device and come back              
    when it is enrolled again from the host's admin interface. Everything you see is frozen at seq 18402.                                                       
 [N]  revoked · view frozen · drafts kept on this device                                                                           seq 18402 · as of 14:20:05   
 revocation is deliberate: enrollment never expires on its own                                                                                                  
```

**f. Unsupported.** Unknown resource kinds show as metadata, with decisions on that object disabled and never a guess (FC-M17). An unknown *basis field name* never disables a command. A protocol frame version the client can't read gives one whole-client state, with no resnapshot loop (FC-W13). A host-side unsupported task keeps its ownership and evidence (RQ-35).

```
✗   unsupported by this client (v0.3): artifact kind "canvas-v2" on render-host · seams r3 · shown as metadata only · decisions on this object are disabled     
    the host reports clients ≥ 0.4 understand it                                                                                                                
                                                                                                                                                                
✗   this client (v0.3) is too old for the host's protocol · update it                                                                                           
                                                                                                                                                                
✗   as9·g1 · minos native-evaluation/check-ir-structure · blocked: task definition assignment-v1 is missing after the host upgrade                              
    ownership and evidence retained · nothing was reset · recovery (operator): restore the old handler, or run the recorded migration                           
```

**h. Host restored from a backup** (S§5.3, S§5.3.1).
- First, backed-up credentials are refused, and the device needs pairing again by a local admin.
- After pairing, the snapshot carries a new `authorityEpoch` and an older sequence. The client accepts it, voids old pins and readbacks, and marks old outbox entries `unknown after restore` with retry refused. The entry's note reads `can't be sent again after a restore`.
- The bufferline's host segment names the state until `hostMode` is `active` again (FC-W12, FC-L12, FC-M31).
- Copy: plain words with no internal terms (epoch, deduplication, cutoff), each line within the measure, and the message in one place, never repeated in the echo line.

```
 1 queue │ 2 render-host·modules r2 [+]2                                                                     [!] homeserver · restored · pair this device again 
    The host was restored from a backup and no longer knows this device.                                                                                        
    Ask the host's admin to pair it again. It reconnects by itself after that.                                                                                  
    Nothing on this device is lost: your 2 drafts and 1 unsent request stay here.                                                                               
 [N]  host restored · waiting to be paired again                                                                                   seq 18402 · as of 14:20:05   
 ␣rc try now                                                                                                                                                    
```

```
 1 queue │ 2 render-host·modules r2 [+]2                                                                ◆3 ✗1 ?1   [!] homeserver · catching up after a restore 
    The host was restored from a backup, so recent changes may be missing.                                                                                      
    It is catching up. Until it finishes you can read and draft,                                                                                                
    but not save or decide.                                                                                                                                     
                                                                                                                                                                
── OUTBOX ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 [?] request rework · modules r2 · sent 14:09:30 · can't be sent again after a restore                                                                          
     This request may or may not have reached the host before the restore.                                                                                      
     It can't be sent again as it was. When the host is ready, open modules r2                                                                                  
     and ask again if you still need to.                                                                                                                        
 [N]  outbox   1 request with an unknown outcome                                                                                   seq 18214 · as of 14:21:40   
 ␣rq asks the host about it                                                                                                                                     
```

**i. Can't show this.** A read's outcome, shown where the content would be. Decisions on it are disabled, and it never falls back to another revision (S§5.3.1 L497; S§10 L1246; FC-M39).

```
    content missing on the host · modules r1 4be0·77c1                                                                                                          
                                                                                                                                                                
    the host can't read this record's format (schema 7)                                                                                                         
                                                                                                                                                                
    not visible to this device                                                                                                                                  
```

- RQ-02, RQ-07, RQ-08, RQ-16, RQ-18, RQ-20, RQ-24, RQ-35, RQ-36, RQ-37.

---

## SC-11 Picker (`␣.` find any object)

The user's fzf-lua layout. A typed prefix (`slice:`, `doc:`, `agent:`) filters by kind.

```
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 FIND › ledger rec▌                                                            │ PREVIEW · render-host · modules r2 · M2 Ledger                                 
                                                                               │                                                                                
› node        render-host · modules r2 · M2 Ledger                  ◆ awaiting │ Ledger accepts authorized commands, invokes Kernel with resolved               
  note        render-host · modules r2 · @7 backup and restore        saved v3 │ values and atomically records accepted state, immutable facts,                 
  node        render-host · modules r1 · M2 Record (superseded)           ↺ r1 │ receipts, references and the next durable task.                                
  message     chat·render-host · t42 "…revision references…"             13:55 │                                                                                
  obligation  minos · native-engine · record-engine-baselines B2       · ready │                                                                                
  report      skills · contract-lint · watchdog r1 (ledger cites)       ✓ pass │                                                                                
  decision    skills · …/simplify-adapter-launch-tests                    ◆ 8d │                                                                                
  proposal    skills · design-workflow (ledger lint)                     ✓3 #3 │                                                                                
                                                                               │                                                                                
 8 of 1,107 · kind: filters (slice: doc: agent:) · C-j/k move · ⏎ open         │                                                                                
 [:]  find   query "ledger rec" · smartcase · objects, notes, messages, decisions                                                          seq 18342   8/1107   
                                                                                                                                                                
```

- RQ-21, RQ-25.

---

## SC-12 which-key

Display-only. The authority group shows the diamond **outline** in `fg.alt`: the coral diamond means "needs you now", not "this command is authority". The basis sentence appears once, in the `␣a` header; there is no footer. The root's head reads `display only · decides nothing`, then the chip `Esc` `closes`.

```
── ␣  leader · display only · decides nothing · Esc closes ─────────────────────────────────────────────────────────────────────────────────────────────────────
  a  ◇ authorize       c  +chat            d  +diagnose        f  +find            h  +help            m  +local           o  +open                             
  r  +recover          s  +search          t  +toggle          w  +window          y  yank → clipboard                                                          
  ␣  switch view       .  find object      /  lines in view    ;  commands         :  command history  '  resume picker    n  next action                       
  q  needs-me queue    u  revision history                                                                                                                      
── ␣a  ◇ authorize — every command reads back its exact basis before it binds ──────────────────────────────────────────────────────────────────────────────────
  a  ◇ approve emission          r  ◇ request rework       d  ◇ answer decision            s  ◇ confirm task shape                                              
  c  ◇ accept intake / Contract  t  ◇ checkpoint routing   p  ◇ review policy: save / adopt  x  ◇ cancel work                                                   
```

---

## SC-13 Hint mode (`gs`)

Chips sit at the start of each target's text, after its state icon, and shift right to avoid overlap (FC-T16). Labels are chips in context `hint`, frozen at `gs`; a label moves the cursor and never acts. The echo prints the chip `Esc` `cancels`.

```
 NEEDS YOU · 3                                                oldest first  waiting  downstream │ minos / native-engine / execute-symbolic-calls                
[a]skills …/simplify-adapter-launch-tests     direction · held by you            8d 5h        0 │ Execute symbolic Calls                        ◆ waiting 2d 4h 
›◆ minos  …/execute-symbolic-calls            decide Q1 · aliased callee Axes    2d 4h       25 │                                                               
[s]render render-host · modules r2            review checkpoint                     6m        — │ COMMITMENT  [j]ontract K·40cc · B1–B5 A1–A6                   
 ON THE HOST · 1                                                                                │ OWNER       you · implementer [k]31·g2 blocked                
[d]minos  …/specify-rsps-profile              operator · as38 quarantined          52m        4 │ EVIDENCE    pass 2 · no Watchdog on [la]e1f0c [!]             
 WAITING · NOT ON YOU · 6                                                                       │ NEXT        answer [ls] · 3 options              ␣n           
[f]skills design-workflow/work-router         dependency · integrate-fast-ful…      4d        2 │                                                               
[g]skills design-workflow/checkpoint-engine   dependency · work-router              4d        1 │                                                               
[h]skills design-workflow/design-playbook     dependency · checkpoint-engine        4d        0 │                                                               
 [H]  hints · 10 targets · a label moves there and never acts                                                                              seq 18342   frozen   
 Esc cancels                                                                                                                                                    
```

---

## SC-14 Mermaid and the canvas boundary

- Natural size when it fits the width from the text column to the pane's right edge. Otherwise it is scaled down while every label stays at 12 px or more (the caption adds the scale), and beyond that it shows a "wider than view" panel with `⏎ full view`. Never clipped (`reference/visual-language.md` §11).
- Parse errors show the source with the location.

```
M0  ## Context ───────────────────────────────────────────────────────────── judgment                                                                           
    ┌───────────────────────────────────────────────────────────────────────────────── natural size ─┐                                                          
    │ ┌──────────────────────┐  CALL command / observe  ┌───────────────────────┐                     │                                                         
    │ │ Human clients        │ ───────────────────────▶ │ Ledger                │                     │                                                         
    │ │ no writable authority│ ◀─────────────────────── │ principal, auth, tx   │                     │                                                         
    │ └──────────────────────┘  DATA receipts and views └──────────┬────────────┘                     │                                                         
    │                                       CALL change with values │ ▲ DATA decision                 │                                                         
    │                                                    ┌──────────▼─┴──────────┐                    │                                                         
    │                                                    │ Kernel                │                    │                                                         
    └ Figure 3 · Modules and authority · ␣tm source ──────────────────────────────────────────────────┘                                                         
                                                                                                                                                                
    ┌ Figure 10 · state diagram · 1,335 px natural ─────────────────────────────────────── wider than view ┐                                                    
    │   labels would be 10 px here · 8 states · 12 transitions                               ⏎ full view   │                                                    
    └──────────────────────────────────────────────────────────────────────────────────────────────────────┘                                                    
                                                                                                                                                                
 ✗  Figure 5 · parse error at line 4, column 12: unexpected token "->>>" · source shown · notes anchor on these bytes                                           
  ▏ ```mermaid                                                                                                                                                  
  ▏ sequenceDiagram                                                                                                                                             
  ▏     participant A as Trusted client                                                                                                                         
  ▏     A->>>R: CALL command                                                                                                                                    
                                                                                                                                                                
    canvas · excalidraw · seams-sketch r3 · 41 shapes · not editable in this client · za lists labels                                                           
```

- RQ-22, RQ-23.

---

## SC-15 Reading layout

The reading rules, drawn on one paragraph:
- the measure as a maximum, centred in a wide pane;
- word wrapping with atomic IDs;
- the only legitimate in-token break: a URL longer than the measure, with a continuation mark;
- a clipped code block;
- a truncated path.

```
── maximised reader (prose column centred) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
                                                ## Ledger                                                                                                       
                                                Ledger accepts authorized commands, invokes Kernel with resolved                                                
                                                values and atomically records accepted state, immutable facts,                                                  
                                                receipts, references and the next durable task for assignment                                                   
                                                as31·g2 on emission 9f3c·a1e2. The probe output lives at                                                        
                                                https://example.invalid/render/experiments/fake-host/results/                                                   
  →                                             firehose-4x2k-seed1-measurements.json                                                                           
                                                and nothing in this paragraph may break inside a word.                                                          
                                                                                                                                                                
── pane 60 ch wide ─────────────────────────────────────────│                                                                                                   
    Ledger accepts authorized commands, invokes Kernel with │ Rules shown (reference/visual-language.md §4):                                                    
    resolved values and atomically records accepted state,  │                                                                                                   
    immutable facts, receipts, references and the next      │  · measure is a maximum: 68 ch, centred in wide panes                                             
    durable task for assignment as31·g2 on emission         │  · words never split; IDs (as31·g2, 9f3c·a1e2) are atomic                                         
    9f3c·a1e2. The probe output lives at                    │  · only a token longer than the measure breaks, after                                             
    https://example.invalid/render/experiments/fake-host/   │    / - _ . ·, with a continuation mark in the gutter                                              
  → results/firehose-4x2k-seed1-measurements.json           │  · code keeps its lines: clipped edge, zl/zh, K                                                   
    and nothing in this paragraph may break inside a word.  │  · paths truncate to …/leaf; IDs are never cut                                                    
                                                            │                                                                                                   
    ```rust (clipped, zl/zh scroll, K full width)           │ Checks: WRAP · MEASURE · FIT · TRUNC · HIER · CHROME                                              
    fn reconcile(workflow: &Workflow) -> Result<Progress, B→│                                                                                                   
        let eligible = workflow.slices().filter(|s| s.el→   │                                                                                                   
```

- Tasks: T31. Defends FC-Q01–Q04, FC-Q08, FC-Q10.

---

## SC-16 Slice explorer

A multi-tab sidebar: **Slices** · Proposals · Agents.
- **Scope tree.** Projects and proposals, with small multiples. Its counts match the active filter.
- **SAVED** filters, kept on this device.
- **STATES.** A multi-select state filter; its counts are for the current scope.
- **Main list.** The filtered slices, grouped by proposal, with the queue's row anatomy and marks.
- **Hint line.** `69 open slices hidden by the filter`, then the chip `:filter clear` `shows them`, then the chip `]g` `next group`. It is a key line: `]g next group` drops first.
- **Preview.** The queue's handover card.

Sample: the user's own example, "awaiting review" plus "needs human", across all open slices. Every count is the host's (RQ-41). The two needs-human slices and the awaiting-review slice are ledger facts. The host's 72 open and 26 merged include two fixture slices that are merged in the ledger: `specify-rsps-profile`, shown as failed (the quarantine), and `specify-cma-profiles`, shown as implementing. The 3 ready slices are `evaluate-exact-sum-with-demand`, `integrate-fast-full-test-suite` and `administer-users`; the queue lists only the first, the one with a queued assignment (as62·g1).

```
 1 queue │ 2 explorer·slices                                                                             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 Slices │ Proposals │ Agents  │ Slices · all open · 3 of 72                                     dependency order │ minos / native-engine                        
──────────────────────────────│ [◆ needs human ×] [▸ awaiting review ×]  saved: review-queue                     │ Execute symbolic Calls                       
                              │                                                                                  │                                              
 SCOPE · counts match filter  │   SLICE                             STATUS                    WAITING DOWNSTREAM │ COMMITMENT  Contract K·40cc · B1–B5 A1–A6    
›All open                   3 │ SKILLS · REDUCE-TEST-RUNTIME  1                                                  │             accepted by you 10-03 14:32      
   skills                   1 │ ◆ simplify-adapter-launch-tests     direction · held by you     8d 5h          0 │ OWNER       you · implementer as31·g2 blocked
     design-workflow        0 │                                                                                  │ EVIDENCE    pass 2 · no Watchdog on          
       ✓·✓✓###                │ LNKR · GATHERING  1                                                              │             3be1f0c [!]                      
     reduce-test-runtime    1 │ ▸ auto-tag-bookmarks                awaiting review · watch…      12m          0 │ BLOCKER     F16 HARD · aliased callee Axes   
       ◆                      │                                                                                  │             undefined                        
     fast-full-test-suite   0 │ MINOS · NATIVE-ENGINE  1                                                         │ NEXT        ◆ answer Q1 · 3 options  ␣n      
       ✓✓×✓✓✓✓✓               │›◆ execute-symbolic-calls            decide Q1 · aliased cal…    2d 4h         25 │                                              
   lnkr                     1 │                                                                                  │ reviews 1 of 2 · downstream 4 · 25 in all    
     gathering              1 │   69 open slices hidden by the filter · :filter clear shows them · ]g next group │                                              
       ▸✓✓✓                   │                                                                                  │ CONTRACT    B1–B5 A1–A6 · 0 manual           
     multi-tenant           0 │                                                                                  │ LATEST      implement r1 · needs_human       
       ✓·##                   │                                                                                  │             10-25 09:52 · F12–F17            
   minos                    1 │                                                                                  │                                              
     native-engine          1 │                                                                                  │ ACTIONS                                      
       ×✓✓✓✓✓✓✓✓✓×✓↺◆✓#·#+25  │                                                                                  │  ⏎   open decision      ␣oe evidence         
     native-evaluation      0 │                                                                                  │  gd  Contract           ␣ax ◆ cancel work    
       ✓×################+17  │                                                                                  │                                              
   render                   — │                                                                                  │                                              
     render-host   design   — │                                                                                  │                                              
                              │                                                                                  │                                              
──────────────────────────────│                                                                                  │                                              
 SAVED                        │                                                                                  │                                              
   review-queue      2 states │                                                                                  │                                              
                              │                                                                                  │                                              
 STATES · counts in scope     │                                                                                  │                                              
[x] ◆ needs human           2 │                                                                                  │                                              
[ ] ✗ failed                1 │                                                                                  │                                              
[ ] ? unknown               0 │                                                                                  │                                              
[x] ▸ awaiting review       1 │                                                                                  │                                              
[ ] ▸ implementing          1 │                                                                                  │                                              
[ ] ↺ rework                1 │                                                                                  │                                              
[ ] # waiting on dep.      63 │                                                                                  │                                              
[ ] · ready                 3 │                                                                                  │                                              
[ ] ✓ merged               26 │                                                                                  │                                              
[ ] × superseded            4 │                                                                                  │                                              
 x toggle · X only · :filter  │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
 [N]  explorer › slices › all open   filter: needs human + awaiting review · 3 of 72                                                          seq 18342   3/3   
 filter saved on this device · ␣os reopens it                                                                                                                   
```

**Empty state.** The filter matches nothing in the scope. The empty state names the scope and filter, shows what matches elsewhere, prints the chip `:filter clear`, and keeps the needs-you count. The bufferline count never follows a filter (FC-R07).

```
 1 queue │ 2 explorer·slices                                                                             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 Slices │ Proposals │ Agents  │ Slices · minos / native-evaluation · 0 of 33                    dependency order │ (the preview is empty when                   
──────────────────────────────│ [▸ awaiting review ×]                                                            │  the list is empty)                          
                              │                                                                                  │                                              
 SCOPE · counts match filter  │                                                                                  │                                              
 All open                   1 │                                                                                  │                                              
   skills                   0 │      No slice in minos / native-evaluation is awaiting review.                   │                                              
     design-workflow        0 │                                                                                  │                                              
       ✓·✓✓###                │      1 match elsewhere: lnkr gathering/auto-tag-bookmarks                        │                                              
     reduce-test-runtime    0 │      :filter clear shows them                                                    │                                              
       ◆                      │                                                                                  │                                              
     fast-full-test-suite   0 │      2 slices need you in other scopes                                           │                                              
       ✓✓×✓✓✓✓✓               │                                                                                  │                                              
   lnkr                     1 │                                                                                  │                                              
     gathering              1 │                                                                                  │                                              
       ▸✓✓✓                   │                                                                                  │                                              
     multi-tenant           0 │                                                                                  │                                              
       ✓·##                   │                                                                                  │                                              
   minos                    0 │                                                                                  │                                              
     native-engine          0 │                                                                                  │                                              
       ×✓✓✓✓✓✓✓✓✓×✓↺◆✓#·#+25  │                                                                                  │                                              
›    native-evaluation      0 │                                                                                  │                                              
       ✓×################+17  │                                                                                  │                                              
   render                   — │                                                                                  │                                              
     render-host   design   — │                                                                                  │                                              
                              │                                                                                  │                                              
──────────────────────────────│                                                                                  │                                              
 SAVED                        │                                                                                  │                                              
   review-queue      2 states │                                                                                  │                                              
                              │                                                                                  │                                              
 STATES · counts in scope     │                                                                                  │                                              
[ ] ◆ needs human           0 │                                                                                  │                                              
[ ] ✗ failed                1 │                                                                                  │                                              
[ ] ? unknown               0 │                                                                                  │                                              
[x] ▸ awaiting review       0 │                                                                                  │                                              
[ ] ▸ implementing          1 │                                                                                  │                                              
[ ] ↺ rework                0 │                                                                                  │                                              
[ ] # waiting on dep.      31 │                                                                                  │                                              
[ ] · ready                 0 │                                                                                  │                                              
[ ] ✓ merged                1 │                                                                                  │                                              
[ ] × superseded            1 │                                                                                  │                                              
 x toggle · X only · :filter  │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
 [N]  explorer › slices › minos/native-evaluation   filter: awaiting review · 0 of 33                                                               seq 18342   
                                                                                                                                                                
```

**Proposals tab: the one home for proposal progress.** Rows are exactly two lines at every width (FC-Q26).
- **Line 1:** name, progress strip, counts, status. The progress strip is the slice small multiples or, for a workflow with phases, the shape word and the host's path: `design · Ground ✓ Seams ✓ Modules ◆ Proposal · Record ·`, `bug · Ground ✓ Contract ◆ Implement · Review ·`. Phases come only from the host's path, so a shortened path shows no Seams or Modules (FC-M54). When the full strip doesn't fit it becomes `design · Modules ◆ · 3 of 5`. It is never cut.
- **Line 2, readiness:** `[? duplicate risk · ]ready: <eligibility>[ (<first blocker>)] · forge: <state>`.
  - `ready:` is eligibility only: `not eligible`, `eligible`, `eligible (promotion unsupported)` (FC-M59).
  - `<first blocker>` is the first of the host's ordered gaps, at most 18 characters: `29 not integrated`, `◷ diverged`, `R12 unpublished`, `PR unknown`, `evidence missing`, `evidence stale`.
  - `forge:` carries promotion and the observed forge: `none`, `draft #41`, `draft #41 · promoting`, `draft #41 · promotion unknown`, `ready #41`, `ready #41 (for R5)`, `open #41` (a non-draft PR on a no-draft forge; never `ready`), `closed #41`, `PR unknown`. A state on an older basis keeps its qualifier on the same line (FC-M48).
  - After an observed main merge, the line is `merged main (observed)`, plus `· merged source differs from reviewed R7` when it does.
  - Narrow widths drop whole parts, in order: the forge field while it agrees with eligibility; the blocker; the `ready:` label. The sticky risk, the eligibility word, the merge line and a disagreeing forge field never drop. The line never wraps.
- **Legend,** under the rows: the small-multiple marks in words, one row. Its diamond is `fg.alt`, never coral.
- **Card READINESS holds the four views,** one labelled field each, with every gap, the lag and the host's free text (FC-M49):
  - **ELIGIBLE:** `eligible · 41/41 integrated`, or every gap;
  - **PUBLISHED:** `R5 of R7 · 12m behind`, or `diverged: the remote moved`;
  - **PROMOTION:** `none`, `pending for R7`, `unknown`, `observed for R41`, `unsupported`;
  - **ON THE FORGE:** `ready #135 · observed 2m ago`, or `not observed yet`.

```
 1 queue │ 2 explorer·proposals                                                                          ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 Slices │ Proposals │ Agents  │ Proposals · 8 not archived                                 host dependency order │ Owned native Engine                          
──────────────────────────────│                                                                                  │ minos/native-engine · proposal               
                              │ skills / design-workflow      ✓·✓✓###         ◇0 ✗0 ▸0 1 ready, waits for a slot │ accepted 10-03 14:32                         
 SCOPE · counts match filter  │ ready: not eligible (R7 unpublished) · forge: draft #41                          │                                              
›All open                  72 │                                                                                  │ READINESS                                    
   skills                   5 │ skills / reduce-test-runtime  ◆               ◆1 ✗0 ▸0 1 needs you               │ ELIGIBLE     not eligible · 8/8 integrated   
   lnkr                     4 │ ready: not eligible (R7 unpublished) · forge: ready #41 (for R5)                 │              R8 unpublished                  
   minos                   63 │                                                                                  │ PUBLISHED    R7 of R8 · 9m behind            
   render                   — │ skills / fast-full-test-suite ✓✓×✓✓✓✓✓        ◇0 ✗0 ▸0 nothing for you           │ PROMOTION    pending for R7                  
                              │ ready: eligible · forge: draft #41 · promotion unknown                           │ ON THE FORGE draft #41 · observed 2m ago     
                              │                                                                                  │                                              
                              │ lnkr / gathering              ▸✓✓✓            ◇0 ✗0 ▸1 awaiting review           │ NEEDS HUMAN  1        READY       1          
                              │ ready: eligible (promotion unsupported) · forge: open #41                        │ REWORK       1        MERGED     11          
                              │                                                                                  │ WAITING ON   27       SUPERSEDED  2          
                              │ lnkr / multi-tenant           ✓·##            ◇0 ✗0 ▸0 1 ready, waits for a slot │ DEPENDENCY                                   
                              │ ready: not eligible (◷ diverged) · forge: draft #41                              │                                              
                              │                                                                                  │ ␣oe final package                            
                              │›minos / native-engine         ×✓✓✓✓✓✓✓✓✓×+32  ◆1 ✗0 ▸1 1 needs you               │                                              
                              │ ready: not eligible (R8 unpublished) · forge: draft #41 · promoting (for R7)     │                                              
                              │                                                                                  │                                              
                              │ minos / native-evaluation     ✓×########+25   ◇0 ✗1 ▸1 1 failed                  │                                              
                              │ ready: not eligible (33 not integrated) · forge: draft #36                       │                                              
                              │                                                                                  │                                              
                              │ render / render-host  design · Ground ✓ Seams ✓ Modules ◆ Proposal · Record ·    │                                              
                              │ ? duplicate risk · ready: not eligible (PR unknown) · forge: PR unknown          │                                              
                              │                                                                                  │                                              
                              │ ◆ you  ✗ failed  ? unknown  ▸ running  # waiting  ↺ rework  ✓ done  · ready  × su│                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
                              │                                                                                  │                                              
 [N]  explorer › proposals › all open   8 proposals                                                                                           seq 18353   6/8   
                                                                                                                                                                
```

**Agents tab:** SC-08.

- Tasks: T32. Defends FC-R07, FC-T17, FC-M48, FC-M49, FC-M54, FC-M59, FC-Q26. RQ-26, RQ-27, RQ-33, RQ-41.

---

## SC-17 Project settings

One reader view per project (`␣op`, context `settings`). It holds checkpoint routing and review policy, and it shows the basis before any authority key.
- The view always opens on `seams`. `j`/`k` step field by field. The field under the cursor is bold.
- **`␣at`** on `seams` or `modules` toggles human ↔ delegated. `proposal` is always human, so the key echoes `the proposal field is not editable · final acceptance is always yours`.
- **`␣ap`** on REVIEW POLICY opens the policy as a local draft in the editor (`Esc Esc` keeps it). `␣ap` again reads back old → new in a CHANGES row and saves a new default revision.
- **`␣ap`** on a WORKFLOWS entry adopts the current default for that workflow. `:policy adopt pol2` adopts another revision.
- **Key budgets:** T27 (routing) ≤ 8 keys, `␣op j ␣at y`. T27b (policy save and adopt) ≤ 21 command keys from anywhere.

```
 1 queue │ 2 settings·render                                                                             ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
 CHECKPOINT ROUTING · render · s3 · by you 10-31 09:12                                                                                                          
›  seams      delegated        modules   delegated        proposal  human · always                                                                              
   applies to new checkpoint requests · pending ones keep what they captured                                                                                    
   PENDING   seams C1 · captured s2 · human                                                                                                                     
                                                                                                                                                                
 REVIEW POLICY · default pol3 · for new workflows                                                                                                               
   completed-review limit 2 · minimum evidence rank tests · reviewer diversity different family                                                                 
   WORKFLOWS   render-host  pol2 (bind1)          minos/native-engine  pol3 (bind2)                                                                             
                                                                                                                                                                
 HISTORY  s3 by you 10-31 · pol3 by you 10-30 · s2 by local admin import 10-20                                                                                  
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
 [N]  settings › render › seams                                                                                               seq 18342 · basis s3 pol3   1/6   
                                                                                                                                                                
```

**Routing readback** (from s2). BINDS names the settings revision shown and the field. PENDING lists the requests that keep their capture.

```
── ◆ READBACK · change checkpoint routing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ROUTE    render · checkpoint routing · modules human → delegated                                                                                               
 BINDS    settings s2 · field modules human → delegated                                                                                                         
 PENDING  seams C1 · captured s2 · human · seams C3 · captured s1 · delegated · modules C4 · captured s2 · human                                                
 EFFECT   new Modules requests capture delegated                                                                                                                
 NOT      does not reroute pending requests · final acceptance stays yours                                                                                      
 STATE    fresh · seq 18343 · host 14:03:12 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                           pinned 14:03:12 at modules 
 [◆]  readback › routing › render                                                                                         seq 18343 · basis s2 pol2   modules   
 keys typed before this readback appeared were discarded                                                                                                        
```

**Saving a policy** reads back old → new in CHANGES.

```
── ◆ READBACK · save review policy ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 SAVE     render · review policy · new default from pol3                                                                                                        
 BINDS    policy pol3                                                                                                                                           
 CHANGES  completed-review limit 2 → 3                                                                                                                          
 EFFECT   pol4 becomes the default for new workflows                                                                                                            
 NOT      active workflows keep their binding until you adopt · counts and findings stay                                                                        
 STATE    fresh · seq 18344 · host 14:04:02 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                     pinned 14:04:01 at REVIEW POLICY 
```

**Adopting** names the pending decisions that go stale in the host's EFFECT.

```
── ◆ READBACK · adopt review policy ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ADOPT    render-host · review policy pol3 (now pol2)                                                                                                           
 BINDS    workflow render-host · policy pol3 · binding bind1                                                                                                    
 EFFECT   render-host binds pol3 · 1 pending decision goes stale: modules r2                                                                                    
 NOT      counts and findings stay                                                                                                                              
 STATE    fresh · seq 18345 · host 14:04:40 (0 s ago) · every basis field acknowledged                                                                          
 y confirm · n Esc q cancel · K full basis                                                                                       pinned 14:04:39 at render-host 
```

**Stale or concurrent changes** refuse through the SC-10 b panel; the draft is kept. **`d` on a STALE policy readback** shows the change, acknowledges it and rebases the draft field by field: fields you edited keep your values, others take the new revision's, and a field both changed shows `[≠]` with both values. `y` stays disabled until you edit that field. The readback then reads back old → new.

```
── ◆ READBACK · save review policy · STALE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 SAVE     render · review policy · new default from pol3                                                                                                        
 BINDS    policy pol3 [!]                                                                                                                                       
 STALE    policy pol4 not yet acknowledged · d shows it                                                                                                         
 STATE    stale · seq 18346 · host 14:05:10 (0 s ago)                                                                                                           
 confirm disabled · n Esc q cancel · K full basis                                                                              pinned 14:05:09 at REVIEW POLICY 
                                                                                                                                                                
── after d: the draft is rebased, and a field both changed waits for your edit ─────────────────────────────────────────────────────────────────────────────────
 completed-review limit: [≠] yours 3 · pol4 4                                                                                                                   
 minimum evidence rank: tests                                                                                                                                   
 reviewer diversity: different family                                                                                                                           
```

- Tasks: T27, T27b. Defends FC-M09, FC-M38, FC-M44, FC-M45, FC-L13. RQ-47, RQ-48.

---

## SC-18 Local-verification prompt

An advisory text artifact for a human's local agent (S§5.2.2 L357–386). `␣ol` opens the newest prompt for the current proposal in the reader, with no notes pane. Its body renders as content; the chrome header comes from the artifact's fields.
- `gg␣yG` copies the artifact's source bytes, never rendered text (FC-M47).
- **`:request-prompt`** (write tier) sends the proposal, source and basis shown. It has no readback, because it binds no authority. A stale basis refuses through SC-10 b.
- **Regeneration creates a new artifact.** An older prompt says `for an older source (R5) · current is R7`, and older prompts are listed under HISTORY. Before publication the source line reads `not yet published`.
- **Advisory:** it is never a NEEDS YOU row, a blocker or a flag. Results come back as ordinary messages; there is no import or attestation (FC-M46).
- **Where it is announced:** one advisory line on SC-07, SC-19 and the proposal card.

```
 1 queue │ 2 native-engine·local prompt                                                                  ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT               │ OWNER                        │ EVIDENCE                               │ BLOCKER                   │ NEXT                           
  intake K·7d21 · by you   │ no owner · waits for a slot  │ R7 published #41 · 8/8 Watchdog pass   │ none                      │ nothing for you yet            
                                                                                                                                                                
                                              LOCAL CHECK PROMPT 3 · advisory · nothing waits on this                                                           
                                                source   R7 3be1f0c · published as PR #41 head                                                                  
                                                gaps     macOS framework behaviour · desktop interaction                                                        
                                                missing  documented macOS signing prerequisite                                                                  
                                              gg␣yG copies it · :request-prompt makes a new one for the current source                                          
                                                                                                                                                                
                                              # Verify R7 on this Mac                                                                                           
                                              Check out 3be1f0c from PR #41 and build it the way the repository says.                                           
                                              The Linux evidence below covers the engine; it does not cover the macOS                                           
                                              framework behaviour or the desktop interaction, so run those here and                                             
                                              report what you see as an ordinary message.                                                                       
                                                                                                                                                                
                                              HISTORY                                                                                                           
                                                prompt 2 · for an older source (R5) · current is R7                                                             
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
 [N]  minos/native-engine › local prompt 3 › L1                                                                             seq 18342 · basis R7 3be1f0c   L1   
                                                                                                                                                                
```

- RQ-45.

---

## SC-19 Merge package

The human's last read before the only irreversible act (S§9.3 L1136; Fig. 11 L1167–1168). `⏎` and `␣n` on the `merge main · on the forge` row open it; so does `␣oe` from the Proposals tab. `C-o` returns.
- What could stop you comes first, the Slices last. All sections above SLICES are on the first screen at 1512 and 800.
- **ADVISORY CHECKS** carry no stale, failed or coral mark and aren't counted among findings or uncertainties. Missing advisory observations are never a gap.
- **Slice rows:** columns sit next to the name, sized to the longest name, not at the pane's right edge. A name is never cut. K is on the row, because mapping commitments to source is the package's first duty. Per-Slice R is not on the row: its tree is exactly the reviewed source the row already prints (S§9.3 L1122). It is in that Slice's SC-07 and in `K`. If a pane can't hold the row, `Audit examined …` drops whole first. `⏎` opens that Slice's SC-07 and `C-o` returns.
- **NEXT** prints `◆ merge main · on the forge` with the chip `␣n`. Here `␣n` opens the URL confirm with the host's `url` (`open https://… ? y/n`): `y` opens it, `n` doesn't. No machine merges main.
- **After the host observes the merge,** NEXT reads `nothing for you yet`, and a merged source that differs from the reviewed one adds an evidence-gap row to SOURCE (S§9.2 L1072).
- The statusline has no read-basis token here, because the package binds no authority.

```
 1 queue │ 2 native-engine·package                                                                       ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT               │ OWNER                │ EVIDENCE                                   │ BLOCKER                   │ NEXT                               
  intake K·7d21 · by you   │ you · main merge     │ R41 published #135 · 41/41 Watchdog pass   │ none · 1 uncertainty      │ ◆ merge main · on the forge  ␣n    
 SOURCE      canonical R41 58b3c69 · published R41 58b3c69 · PR #135 ready                                                                                      
 CHECKS      41/41 Slices · required checks pass on their prepared source · weakest rank tests (minimum tests)                                                  
                                                                                                                                                                
 READINESS                                                                                                                                                      
 ELIGIBLE      eligible · 41/41 integrated                                                                                                                      
 PUBLISHED     R41                                                                                                                                              
 PROMOTION     observed for R41                                                                                                                                 
 ON THE FORGE  ready #135 · observed 2m ago                                                                                                                     
                                                                                                                                                                
 REMAINING FINDINGS 2                                                                                                                                           
 F31 [MINOR] preserve-demanded-outcomes  the cache key ignores binding order; two equal subgraphs can miss the cache                                            
 F34 [NIT]   ship-equity-processor       the error for an empty sum names the IR node, not the source span                                                      
                                                                                                                                                                
 DEVIATIONS 1                                                                                                                                                   
 D1  report-engine-checkpoint  B3 is met by a checked error, not the fallback the Contract named; recorded in pass 3                                            
                                                                                                                                                                
 UNCERTAINTIES 1                                                                                                                                                
?U1  required forge checks were listed before R41 was published; not read again since                                                                           
                                                                                                                                                                
 ADVISORY CHECKS 3                                                                                                                                              
 macOS native test suite    suggested · not run                                                                                                                 
 macOS sanitizer run        suggested · not run                                                                                                                 
 manual example walkthrough suggested · not run                                                                                                                 
 local check (advisory) · prompt 3 for R41   ␣ol                                                                                                                
                                                                                                                                                                
 SLICES 41 · intake K·7d21                                                                                                                                      
 construct-native-ir               K·1a04  pass 1  Audit examined 2690f37  Watchdog r1 pass on 8b1d973  0 fixed                                                 
 decouple-native-construction      K·77e2  pass 1  Audit examined f84dfc0  Watchdog r1 pass on d88534e  0 fixed                                                 
 evaluate-basic-outputs            K·03bd  pass 1  Audit examined 1598ee5  Watchdog r1 pass on 37f7275  0 fixed                                                 
 run-gate-through-mise             K·40cc  pass 2  Audit examined 7bf2606  Watchdog r2 pass on 4026042  2 fixed                                                 
 bind-datasets-from-snapshots      K·c91f  pass 1  Audit examined 42af55a  Watchdog r1 pass on b97cc80  0 fixed                                                 
 evaluate-conditional-expressions  K·5d10  pass 1  Audit examined 5e0985f  Watchdog r1 pass on cf47033  0 fixed                                                 
 evaluate-numeric-expressions      K·e6a2  pass 1  Audit examined 115a07a  Watchdog r1 pass on 0688e4b  0 fixed                                                 
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
                                                                                                                                                                
 [N]  minos/native-engine › package                                                                                                     seq 18343   41 Slices   
                                                                                                                                                                
```

**Compact, 800 px.** The strip drops down its ladders, and the Slice rows drop `Audit examined …`.

```
 1 queue │ 2 package                         ◆3 ✗1 ?1   ● homeserver · protected to seq 18340 (2 m) 
  COMMITMENT      │ OWNER              │ EVIDENCE           │ BLOCKER        │ NEXT                 
  K·7d21          │ you · main merge   │ R41 · 41/41 pass   │ none           │ ◆ merge main  ␣n     
 SOURCE      canonical R41 58b3c69 · published R41 58b3c69 · PR #135 ready                          
 CHECKS      41/41 Slices · required checks pass on their prepared source ·                         
             weakest rank tests (minimum tests)                                                     
                                                                                                    
 READINESS                                                                                          
 ELIGIBLE      eligible · 41/41 integrated                                                          
 PUBLISHED     R41                                                                                  
 PROMOTION     observed for R41                                                                     
 ON THE FORGE  ready #135 · observed 2m ago                                                         
                                                                                                    
   ⋮  REMAINING FINDINGS, DEVIATIONS, UNCERTAINTIES, ADVISORY CHECKS, wrapping at words             
                                                                                                    
 SLICES 41 · intake K·7d21                                                                          
 construct-native-ir               K·1a04  pass 1  Watchdog r1 pass on 8b1d973  0 fixed             
 decouple-native-construction      K·77e2  pass 1  Watchdog r1 pass on d88534e  0 fixed             
 evaluate-basic-outputs            K·03bd  pass 1  Watchdog r1 pass on 37f7275  0 fixed             
 run-gate-through-mise             K·40cc  pass 2  Watchdog r2 pass on 4026042  2 fixed             
 [N]  minos/native-engine › package                                           seq 18343   41 Slices 
                                                                                                    
```

- Tasks: T28. Defends FC-M48, FC-M58, FC-M60. RQ-04, RQ-26, RQ-45, RQ-49.
