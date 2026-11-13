# Verdict

**Use `candidate-2` as the base, with corrections before acceptance.** It gives the fullest legal lane walk and the clearest admission checks. Its lead is narrow. No candidate is ready unchanged.

Scores are equally weighted, 1 to 5.

| Criterion | candidate-1 | candidate-2 | candidate-3 |
| --- | ---: | ---: | ---: |
| 1. Extension unit and small model | 5 | 4 | 4 |
| 2. Legal on pi-durable | 4 | 4 | 3 |
| 3. Extension script | 3 | 4 | 4 |
| 4. Honest Lane verdict | 4 | 5 | 4 |
| 5. Lane walk | 3 | 4 | 2 |
| 6. Candor and evidence | 4 | 3 | 3 |
| **Total / 30** | **23** | **24** | **20** |

## Scope and checks

I read the brief, rubric, all candidate files, and the core docs. I did not read `picker/`. Source was read, never executed. Runs used the installed 1.5.2 package from the judge directory.

`wc -w` gives design/rationale counts of **3779/399**, **3744/318**, and **3789/394**, in path order. All pass. All seven required main sections appear in order. Candidate-3 also has subsections.

Both supplied probes exited 0, with no failed checks:

- `candidate-1`: last line, `ok: checks E1-E6 passed`.
- `candidate-3`: last line, `ok: checks X1-X11 passed`.
- `candidate-2` supplied no probe.

My `probe.mjs` exited 0: `ok: judge checks J1-J4 passed`. J4 deliberately caught `ReadAfterWrite`. Logs are beside this verdict. These are faux-model checks, not live provider tests or killed-process tests. The brief permits “measured” for source reads; I did not count such reads as runs.

## Evidence for each score

### candidate-1

1. **5:** “A workflow is an extension whose module exports `entry`.” One list and one getter give websearch a home without pretending it is a workflow. Exact selections protect restricted roles; all three selection choices are compared.
2. **4:** “table reads, at most one `submit(tx, draft)`, then table writes” is sound. E1 to E6 give real evidence for defaults, missing code, queues, and compaction hooks. They do not test actual codemode or the proposed dispatch sequence.
3. **3:** “The key is plain text in the store” states the main exposure. The reviewer stays closed. But “I from its creation” gives the implementer codemode without guarding publishing against nested calls. A sequential publish no longer excludes a simultaneous shell call.
4. **4:** “I recommend no lane, for now” follows a fair notes-only comparison and nine marked checks. However, “Hearing back needs a task that waits and reports” is too strong. Passive writes need neither a waiting task nor a model acknowledgement.
5. **3:** “k3 waits, and `conversations` no longer shows L as failed” honestly finds a lost-work signal. Yet step 8 becomes “the other branch” rather than the requested overlap, and replacement rehydrates “Every `Work`” without a clear bounded dispatch plan.
6. **4:** “It replaces the Decided line” properly seeks owner consent. “No lane row ran beyond E5 and E6” is candid. The broad two-request cost claim and omitted nested-call hazard keep this below 5. Its rule edit and core rename also lack full five-check reviews.

### candidate-2

1. **4:** “Installation makes code available. Selection determines which agent uses it” is clear and small. Websearch needs no workflow state. But the designer “excludes `write` and `edit`” only, thereby exposing W1's other role and lane tools too.
2. **4:** “content is saved before dispatch” and separate worker-start and notice tasks respect commit order. Ownership and replay claims check out. No runtime check accompanies this design, so it earns less confidence than tested mechanics would.
3. **4:** “including backups” and “Provider errors must be scrubbed” give the best key-risk account. W2 gains search only after project selection and configuration. Exact workers avoid codemode's publish race, but the designer's broad W1 filter still needs correction.
4. **5:** “Several work items are not separate call sites” applies the library rule well. All nine checks have evidence. “Fresh workers reading a notes document” remains the baseline; the private trial is conditional, not a back door into the core.
5. **4:** “The lane's run owns no worker” and saved notice targets make failure and replacement understandable. The overlapping fix, manual continue, and reset are walked. The full sequence is still unrun, and replacement needs the owner to redispatch pending work.
6. **3:** “No probe, tests, provider calls, Git commands, or Tau implementation ran” is honest. Core and library checks are unusually complete. But inherited bare-agent defaults silently replace a **Decided** selection rule, while only the Proposed “No live work changes” sentence is flagged.

### candidate-3

1. **4:** “The owner decides for the project, and a role decides for itself” explains selection well. But “A workflow is an extension that owns conversations” is an extra restriction. Helper conversations need not turn an otherwise ordinary tool extension into a workflow.
2. **3:** X1 to X11 provide the most runtime evidence, including nested calls and restart recovery. Yet “Rows 13 and 17 start with `N.submit(write, requestId: R)`” needs the review entry ID before that same commit creates it. The paper sequence is not legal as written.
3. **4:** “publishing tools also declare `callers: ["model"]`” is an important tested safeguard. Missing code and plaintext keys are covered. Real provider failures and credential-safe diagnostics remain untested.
4. **4:** “keep N only if a run of the same items shows that the briefs do better” makes the private trial fair. All nine checks are present. Calling generic “Worker” and “brief” forbidden workflow concepts overstates the rule; the four-option summary also drops its own library check-4 failure.
5. **2:** “The chain of evidence holds” is premature given the review-ID ordering defect. Exact tool filters also do not hide `w1_notes` from the reviewer. The probe's section has no role guard. Reset and live-note mechanics work, but do not repair these gaps.
6. **3:** “X4 and X9 closed the store cleanly” correctly limits restart evidence. However, “X6 to X11 ran the moves they lean on” leaves out the crucial same-commit review notice. X7 uses a prechosen `R1` string, not an ID minted by the review commit. “The renames ... add no shape” skips required five-check reviews; the options change lacks a full four-check account.

## Source audit

Paths here start at `/tmp/render-ground/pi/packages/durable/`. I checked at least three load-bearing claims for each candidate:

- **candidate-1:** exact/default selection and missing-name skipping, `src/harness/agent.ts:351-370`; missing versus interrupted tools, `src/harness/tool.ts:148-222`; model-free supplied summaries, `src/harness/compaction.ts:142-147`. All hold.
- **candidate-2:** ownerless versus copied agents, `src/harness/agent.ts:204-215`; submission order and reused IDs, `src/harness/submissions.ts:75-82,232-239`; passive writes, `src/harness/types.ts:72-99` and `submissions.ts:209-221`. All hold.
- **candidate-3:** nested calls ignore sequential mode, `src/harness/types.ts:324-325`; summary limits and omissions, `src/harness/compaction.ts:153-156,398-425`; review-ID ordering, `src/session/transaction.ts:433-438` and `src/harness/submissions.ts:75-82`. The first two hold; the third refutes its review-notice row.

## Disagreements and rulings

- **Dispatch cost:** candidate-2 is right that one request can suffice. J1 dispatched two queued items in two requests with `terminate`, losing neither follow-up. Candidate-1 and candidate-3 measured two-request versions, not a substrate minimum. Candidate-3's concern about a steer joining the same run is a different case.
- **Reports:** candidate-2 and candidate-3 are right that passive writes cost no model request, confirmed by J2. But candidate-2's separate notice task avoids candidate-3's forward reference. J4 confirms that appending R first then submitting throws.
- **Codemode:** candidate-3 is right about nested publishing. Its X5 rerun shows overlap and refusal with `callers: ["model"]`. Mere tool filtering does not supply sequential execution.
- **W2 after addition:** this is a design choice, not a substrate dispute. Candidate-1 and candidate-3 retain exact selections. Candidate-2 changes entry settings. Old stored arrays do not change just because entry code changes.
- **Sections:** J3 confirms that exact `[W1]` plus exact reviewer tools still includes an unfiltered W1 notes section.

## Base, ports, and the shared omission

Use **candidate-2**. From **candidate-1**, port the notes-first baseline and explicit flags for changes to Decided lines. From **candidate-3**, port model-only publishing guards and the build's link to its stored lane brief.

**All three miss the second item's merge cost.** Two worktrees can start from the same base while item 1 is still in review. After its handover is merged, item 2's reviewed sibling SHA cannot be merged with the promised `--ff-only` command. My isolated Git check confirmed this: the second merge exited 128. Each SHA's evidence can remain valid while the advertised handover fails. None walks the extra integration and review work. This matters more than saving one lane request.