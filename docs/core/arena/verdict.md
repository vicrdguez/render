# Verdict

## 1. Scores

C1, C2 and C3 mean the numbered candidate directories. Length and layout earned no credit.

| Criterion | C1 | C2 | C3 |
|---|---:|---:|---:|
| Lean core | 4 | 4 | 4 |
| Fit to the substrate | 4 | 5 | 3 |
| Guarantees hold | 2 | 4 | 2 |
| Owner's fixed decisions | 4 | 5 | 5 |
| Extensibility shown | 3 | 4 | 4 |
| Candor and evidence | 4 | 5 | 4 |

**Lean core**
- **C1:** “Render adds nothing to the type” (§2) minimizes the extension interface. The four admission tests are reviewable, but the export-manifest build check adds maintenance machinery.
- **C2:** “Reject convenience wrappers and mandatory extension dependencies” (§1) is a useful rule. The additional factory interface (§2) is not shown to be necessary.
- **C3:** The admission table separates Project, Decision, Event and prose clearly. However, “needs the store's commit” does not distinguish core work from extensions that already receive `Tx`.

**Fit**
- **C1:** The document-only request and explicit continuation conversation (§3) respect important substrate constraints. The stored-instructions claim (§5) is overstated.
- **C2:** It correctly handles task ownership, submission deduplication, rendering failures and unknown storage outcomes (§§3,5,8). No runtime result is claimed.
- **C3:** Native extensions and immutable entries fit. “The ownership options for the `then` task have not been traced” leaves its central operation incomplete.

**Guarantees**
- **C1:** Its retry branch checks only “same choice and notes” before checking basis (§3). Its import restriction does not establish human-only answering.
- **C2:** Identical retries preserve the first attribution and return the continuation ID, while changed basis conflicts (§3). It also requires consequential continuations to recheck workflow state.
- **C3:** Reusing a request solely on “same basis” ignores changed choices or continuation. Retry identity and storage-failure behavior are underspecified.

**Fixed decisions**
- **C1:** The topology and extension-owned prose fit. “If the client stays its only reader, Event leaves first” (§1) reopens an agreed primitive.
- **C2:** One endpoint, optional local mode, explicit project selection, strict TypeScript and human-performed merge are all stated (§§2,4,6,8).
- **C3:** “One server hosts all projects,” W0 with no extensions, and the explicit language and tooling decisions cover the fixed requirements. Open implementation details do not negate those positions.

**Extensibility**
- **C1:** Forecasts exercise time, multiple subjects and event consumption (§6). W1 is referenced, not walked through its interface.
- **C2:** Spaced recall adds recurrence, independent answers and revision-aware timers (§6). W1 remains a sketch rather than a demonstrated transaction sequence.
- **C3:** Thesis-to-verdict distinguishes frozen protocols from observations and compares prose alternatives concretely. It explicitly admits neither workflow has been walked through the primitives.

**Candor**
- **C1:** Labels and bounded probe claims are useful; §8 admits no end-to-end workflow. The security limit is less candid than C2 or C3.
- **C2:** “Throwing from a section is not a safety gate” and the explicit power-loss limitation are valuable pushback (§§5,8). Missing acceptance evidence is specific.
- **C3:** The forged-answer discussion and unverified ownership list are honest. The topology table nevertheless overstates isolation.

## 2. Fact checks

Source prefix **D** means `/tmp/render-ground/pi/packages/durable`. Candidate paths are relative to `/tmp/arena-render-core`. These are direct source readings, not executed tests.

1. **All three: native extension reuse. Holds.** `D/src/harness/types.ts:424-444` supplies the stated contributions and task lookup. Defaults include all installed extensions at `:631-634`; duplicate task names are rejected at `D/src/harness/registry.ts:24-26`.

2. **All three: tasks cannot park on human input. Holds.** `D/src/types.ts:660-693` defines task waits and clock sleeps, not external signals.

3. **All three: immutable entry basis. Holds, within one store.** `D/src/types.ts:445-483` separates immutable application data from context edits. IDs are session-global, not host-global (`:1359-1363`).

4. **C1/C2: atomic answer plus continuation. Feasible.** `D/src/types.ts:1198-1205` defines atomic commits; `D/src/session/transaction.ts:476-505` creates a task with explicit ownership and conversation. **C3's shape is incomplete:** an unbound commit cannot infer its omitted conversation; line 489 throws.

5. **C1: document-only requests compose after table writes. Holds.** Document access avoids the table-read guard (`D/src/session/transaction.ts:611-641,1140-1156`). **C2/C3's request events impose an extra ordering constraint:** appending marks a table write (`:433-434`), after which `submit(tx)` throws (`D/src/harness/submissions.ts:76-82`). Their approach is possible, but C1 is right about this cost.

6. **C2: rendering errors retain old prose. Holds.** `D/src/harness/prompt.ts:21-46` catches ordinary errors and retains shown text. **C1's “a prose fix never reaches an existing conversation” is overstated:** changes are not automatic, but `configure()` updates existing instructions (`D/src/harness/harness.ts:126-127`; `D/src/harness/agent.ts:161`).

7. **C2: storage failure can mean unknown outcome. Holds.** `D/src/types.ts:1333-1344` says so. Its distinction from submission retries also holds: `D/src/harness/submissions.ts:231-239` checks submission type, not payload equality. **C3's “does not throw” is incomplete:** its refusal list provides no outcome for these failures.

8. **C3: topology isolation. Overstated.** `D/src/harness/harness.ts:601` constructs another harness, not another process or sandbox. Its “cannot read another project without a handle” is only true of the supplied transaction, not trusted code. Its crash-loop table also conflates task faults with process crashes: `D/src/harness/types.ts:660-667,752-757` bounds restarts and distinguishes task faults from session failure. C1/C2 are right that process crashes affect all projects.

9. **C1: import checks establish no agent path to answer. Overstated.** Native shell execution delegates to the environment and inherits environment variables by default (`D/src/tools/bash.ts:82-115`). Import checks cannot stop a same-account shell reading credentials or accessing the store. C2/C3 correctly acknowledge this limit.

10. **Decision contract defects, checked against candidate text:** C1's answered branch precedes basis validation (`candidate-1/design.md:69-75`), so a conflicting basis can receive success. Its request equality also omits the target conversation (`:67`). C3 reuses an open request despite changed choices or task (`candidate-3/design.md:154`). Neither defect comes from pi-durable.

11. **All: one writer and a host-owned lock. Holds.** `D/README.md:894` supplies no cross-process lock. C3's read-only harness option exists (`D/src/harness/types.ts:759-765`), but that alone proves no live cross-process viewing protocol.

12. **C2: interrupted tools and folded watches. Holds.** `D/src/harness/tool.ts:200-230` distinguishes safe replay from interruption. `D/src/harness/types.ts:886-892` describes folded structural updates. Its process-crash versus power-loss warning is correct (`D/README.md:869-870`).

13. **C1: coding tools are supplied, not mandatory. Holds.** `D/src/tools/index.ts:27-36` explicitly says nothing installs them automatically. All three correctly reuse native prompt sections (`D/src/harness/types.ts:395-414`) and the injectable clock (`:729-732`).

14. **C3: Ultimate's event construction is precedent. Holds.** `/tmp/render-ground/ultimate/server/events.ts:105-127` creates an ownerless log conversation and appends through the caller's transaction.

**Probe assessment.** I read, but did not run, C1's `probe.mjs`. Its assertions cover the advertised two-store reopen, answer-shaped commit, read ordering, event persistence and timer wake. Lines 174-176 perform clean closes and advance a clock. They do not test crash atomicity, concurrent answers, authentication, or the proposed decision-family implementation. Registry-selection isolation is not directly asserted. The reported successful run remains unverified here.

## 3. Disagreements between candidates

**Core boundary**
- C1: Project host, primitives and transport belong to core.
- C2: Core similarly contains three modules.
- C3: A separate multi-project host wraps a one-store core.
**Strongest: C3's packaging seam.** All must still count host maintenance.

**Extension hook**
- C1: Native objects and imported functions.
- C2: Native objects or injected factories.
- C3: Native objects and three imported functions.
**Strongest: C1/C3.** The transaction already determines the store.

**Decision and Event**
- C1: Document-only requests; no automatic decision events.
- C2: Event-derived IDs, continuation receipts and full retry comparisons.
- C3: Basis-only request reuse and a human-readable event envelope.
**Strongest: C2's answer contract; C1's request composition.**

**Topology**
- C1: One process, per-project stores, later knowledge copies.
- C2: The same topology; sharing protocol explicitly deferred.
- C3: The same topology; copies or a library store.
**Strongest: C2.** It is most precise about isolation and future costs.

**Prose**
- C1: Checked Markdown files beside core; live sections.
- C2: Optional substitution over supplied text; preparation must fail safely.
- C3: Checked Markdown files; explicit pinned versus live prose.
**Strongest: C2's failure semantics.** All correctly reuse native sections.

**Second proving workflow**
- C1: Forecasts, with pick-one-of-N as runner-up.
- C2: Spaced recall, with a claim notebook as runner-up.
- C3: Thesis-to-verdict, with panel-to-pick as runner-up.
**Strongest: C2.** Recurrence and obsolete timers add distinct failures without external tools. C1 has the clearest direct event consumer.

## 4. Recommended base

**Candidate 2.** It leaves the fewest dangerous decisions implicit. The durable target conversation, saved continuation receipt, full retry comparison, workflow-state recheck and honest security limits make it easier to extend without breaking invariants. Its larger extension interface is removable; C1/C3's missing guarantees are more consequential than that extra seam.

## 5. Grafts and removals

- **From C1:** Port the native-`Extension`, `Tx`-only function interface. Preserve its document-only request alternative for the composition review.
- **From C3:** Port `Decision.title` for the generic inbox and its explicit distinction between pinned instructions and live sections.
- **Remove from C2:** The requirement for factory injection without a demonstrated consumer. Reconsider mandatory decision-transition events, but do not delete them casually: C2 currently derives decision identity from the request event.

## 6. What all three missed

- **No executable human-authority separation.** C2/C3 acknowledge this, but none specifies the actual execution arrangement. A shell with host credentials or store access can forge an answer or bypass the merge gate.
- **No compatibility contract for open decisions across same-name task upgrades.** The continuation does not exist until answer. Creation uses the currently installed definition and version (`D/src/session/transaction.ts:492-505`), so native migration of existing tasks cannot protect that approval. New code can reinterpret an old decision.
- **No complete W1 transaction walkthrough.** None demonstrates how approved design, implemented source, review result and final merge candidate stay linked through revision and retry. A workflow can otherwise present valid approval for the wrong source revision.
