# Accepted Contract intake

The shared checkpoint tool now stages Contract intake and requests fresh fidelity work. Final acceptance is always an authenticated human Ledger command. A saved document, edited concern, clean structural lint, model report, assignment, pass or PR flag is not acceptance or qualifying integration.

## Retained basis

Use an existing workflow and exact human `ground` revision. Ground's JSON includes `shape:{value:"design"|"bug"|"performance"|"change",origin:"human"|"classifier",confirmed:boolean}`. A classifier proposal requires human confirmation. Existing-seam paths also name `approvedSources:[revisionRef,...]` in human Ground; these are the applicable approved source/rationale documents, not an agent's claimed approval. The existing human save route retains their exact bytes and actor. Source applicability and adequacy remain fidelity/human judgments.

Bug Ground also retains `reproduction:{trigger,observed}` and the independent `expected` correction. The bug manifest carries `reproduction:{obligation,observed,expected}`: the behavior obligation that is the reproduction, with Ground's observed and expected text verbatim. Before product code the implementer writes the mapped regression check and calls `implementation_reproduce`, which captures the pre-fix source and runs its catalog in owned Linux (`recordImplementationSource` kind `reproduction`, host Effects only, before Audit A). It is red-on-the-bug only when a mapped regression row fails and its own output contains the observed text. A launch failure (exit 126/127), a failure without that text or a passing row is retained as `not-reproduced` with its reason, and Audit A stays refused until some pass of the Contract has a red reproduction. Successor passes keep that rule satisfied and still need their own Audit.

The coordinator's packet explicitly includes Ground, source and selected catalog. Its own applicable approved checkpoints expand to their exact decision/emission/typed-manifest/review/evidence refs within that Ground scope, allowing ordinary continuation into intake without a replacement coordinator. No extra build dependency mandates a Seams/Modules round. Bug/performance intake is one compact Slice; change and design retain a bounded breakdown. Design cites current approved Seams and Modules; Modules based on superseded Seams cannot authorize intake. Required experiments/new consequential decisions are not waived: retain them as unresolved blockers and obtain their proper decision/evidence before acceptance.

`stageIntake` takes `expected` (latest draft ref or null), complete UTF-8 `text`, and a manifest:

- `schema:1`, `shape`, exact `ground`, `sources`, `decisions`, `catalog` refs, and `breakdown` (null for compact work).
- `slices:[{id,title,record,delegated,forbidden,obligations:[{id,kind:"behavior"|"architecture"|"manual",text,sources:[{ref,node}]}]}]`.
- Architectural sources cite approved emission + real node ID. Shortened paths may use a Ground-approved existing-seam source with `node:null`. Experiment evidence can be retained through its actual approved decision node; this host does not fabricate the later protocol-experiment capability.
- `checks:[{id,row,kind,rank,new,run,expectations}]`. Existing rows must match the exact retained catalog. A `new:true` executed/journey row names a future deliverable; it need not exist or pass yet. Generated/human rows have no proof rank. Inspection may substantiate architecture, never behavior.
- `mapping:[{slice,obligation,checks:[checkId,...]}]` covers every obligation, many-to-many. Behavioral rows must be executed/journey kind at the selected project's minimum rank. Kind describes the required check, not an observed successful execution.
- `dependencies:[{slice,requires,kind:"integration"|"record"}]`; Record edges name Record Slices. IDs are unique, endpoints exist and graphs are acyclic.
- `responses:[{concern,disposition:"acted-on"|"considered"|"dismissed",reason,resulting:"slice/obligation"}]` and `unresolved:[{kind:"technical"|"product",question}]`.

Staging retains separate immutable Markdown and manifest revisions. Lint checks structure/provenance/references, not prose truth. No four-file Contract layout is required.

## Review, concerns and human acceptance

`requestIntakeReview:{intake,key}` selects an explicitly configured read-only challenger template. Ledger atomically retains its workflow-owned packet/task; Engine renders exact Ground, intake, manifest, sources, decisions and saved concerns in a fresh context. Same-family work needs the existing explicit human policy direction, not a fallback. Replacing canceled fidelity work preserves the reviewed basis and inputs.

The challenger submits JSON with `schema:1,intake,manifest,annotations,checks:{omitted,weakened,strengthened,contradictory,invented},findings:[{kind,reason}]`. Checks contain reasoned comparison text; any finding blocks acceptance. Transcription repair needs restaging and fresh review. Technical decisions require revised approval; product/Contract changes require human direction. Scripted report tests demonstrate routing and binding, not judgment quality.

Humans may submit `saveIntakeConcern:{intake,text}` with complete edited bytes, including an empty edit. Every concern remains an immutable revision with stable identity. A coordinator cannot read concerns from another Ground scope or propagate them into a child; continuation across those scopes requires their originating Ground refs as explicit inputs. No concern is silently dropped to make continuation possible. Saving never approves. It invalidates the unaccepted annotation basis; the next draft must map every concern. Saves against accepted intake are change requests, never edits to its obligations.

Human `acceptIntake:{intake,review,annotations,policyBinding,decisions}` binds the exact displayed latest draft, independently reviewed manifest, current decisions, all annotation dispositions and current policy binding. There is no agent acceptance route or implicit acceptance. Ledger atomically stores each immutable `contract:<sequence>:<index>`, acceptance record, provenance, receipt and facts. Contract records retain original text, typed obligations, manifest/review/decision basis and predecessor links. Snapshot `commitment.acceptedIntake` names the actual acceptance, not a guessed completion.

## Consumption, amendments and dependencies

Assignments to an accepted Slice must include its current Contract ref. This applies even if `delivery:false`: a packet flag cannot bypass accepted obligations. Assignment and `everAssigned:true` commit atomically. Cancellation/release and normal restart never thaw the Contract. Pre-intake role fixtures/design work remain possible, but initial acceptance cannot retroactively attach a Contract to an already-used Slice identity. Full source-delivery orchestration remains a later capability.

Before first assignment, human `amendContract` takes the acceptance basis above plus `slice` and `expected` current Contract. The reviewed draft replaces exactly that one Slice; the prior revision stays readable. After consumption, use `supersedeContract` with a reviewed fresh replacement intake, old `slice`/`expected`, and `dispositions:[{slice:dependent,replacement:newOrEligibleSlice}]`. Release active work first and confirm quiescence, including assignments whose delivery flag is false. Every direct dependent needs an explicit eligible redirect; claimed dependents and cyclic/invalid graphs refuse. Retired work remains `superseded`, never completed, and its partial work/history remain retained.

Human `amendDependencies:{expected:currentIntakeStateRevision,dependencies,reason}` replaces the explicit graph only at the exact state basis, with eligible unclaimed consumers and cycle/Record validation. It changes dependency direction, not immutable obligation bytes.

There is deliberately **no qualifying integration command** in this host. Every required integration/Record edge remains blocking, visibly naming the prerequisite and unavailable qualifying-integration capability. A file, review pass, planned assignment or readiness flag cannot clear it. Unrelated eligible accepted work remains assignable. Later Effects/delivery owners must supply actual qualification facts through normal reviewed delivery, not a partial bypass here.

## Continuation and history

Reopen the same data directory with the compatible pinned executable. Read the scoped snapshot, exact intake/Contract refs, child assignment status, blocker and next human action. Continue existing durable fidelity work, or fence/quiesce and explicitly replace a failed child using the existing role protocol; do not invent another acceptance from chat. Policy adoption or changed decisions/annotations require current restaging/review. Retry an uncertain acknowledged command using its original command ID and bytes.

All introduced content uses the existing immutable `document` history/export path and trusted revision provenance. Acceptance and consumption records are retained documents, not a separate store. Missing/corrupt/unsupported required bytes block the affected command with the exact ref; newer bytes are not substitutes. No disaster package, migration or repair API is introduced.

`npm run verify:accepted-contracts` exercises pure legality and real SQLite/Engine/two-device journeys. The existing full gate, process durability/history/load rows and unsafe controls remain cumulative. Full source delivery, full V9 and separately authorized live-model/human-quality trials are not claimed.
