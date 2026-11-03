# Ground and read-only source investigation

Investigation is an ordinary coordinator playbook, not a Slice, Contract or approval checkpoint.
It retains a cited finding or actionable escalation. No implementation, Audit, Watchdog, source mutation
or publication follows a finding. This is separate from the normal review process used to deliver Render itself.

## Inputs and configuration

The human saves `ground` with the existing `saveDocument` command and `expected.document` revision.
Original and revised bytes, clarifications and author provenance remain in ordinary scoped history/export.
Old prose Ground is still readable; executing this playbook requires this structured JSON content:

```json
{
  "schema": 1,
  "goal": "Investigate why zero is rejected; do not change source.",
  "constraints": ["Read-only"],
  "clarifications": [],
  "shape": {"value": "investigation", "origin": "human", "confirmed": false},
  "donePredicate": "Identify the exact zero branch and report cited facts and limits."
}
```

`origin: human` needs no redundant shape vote. `origin: classifier` remains a suggestion until the human
saves an exact-basis revision with `confirmed: true`. This confirms the task shape only, never an
implementation commitment. Record assistant-proposed changes as suggestions/escalations, not human Ground.

The trusted composition root supplies Engine's existing model/family configuration and
`investigations: {root, repositories: {repositoryIdentity: trustedRepositoryLocation}}`. This is programmatic
host configuration, not a model-selected path, a new CLI command or automatic environment discovery.
The existing CLI host does not provision model credentials or launch investigations by itself.
Missing provisioning is an explicit blocker; no live-provider operation is implied by a test fixture.

Host scheduling uses the existing `assignTask` command with `delivery: false`, `slice` set to the workflow
identity (a role-work grouping key, not a newly created Slice), and an explicit coordinator RolePacket:

```json
{
  "investigation": {
    "ground": "revision:4",
    "repository": "owned",
    "commit": "0000000000000000000000000000000000000000",
    "paths": ["src/boundary.ts", "CONTEXT.md", "docs/adr/zero.md", ".render/verify.md"]
  }
}
```

This is an illustrative packet fragment: use actual retained Ground/source identities and the complete
existing RolePacket fields. Packet `principles`, `instructions`, `policy`, `profile` and `inputs` name exact
retained revisions, including full relevant principles. Choose the affected source, context, ADRs and verifier
instructions explicitly within scope. Selection cannot prove semantic relevance; a coordinator must report
missing context or insufficient evidence rather than invent a conclusion. No implicit Seams/Modules traversal.

The playbook refuses writer profiles, delivery ownership, child roles and replacement into another shape.
The coordinator receives only existing scoped artifact/web/Ledger tools; no coding shell or Forge capability.
Before provider work, Engine uses Effects.resolve to read literal Git objects from trusted private storage and
retains complete selected UTF-8 text with repository/commit/tree/blob/mode and assignment provenance. Symlinks
are literal target text, never followed. Consumer source and refs are untouched. Unselected files are not
included in the packet. Missing paths, binary/non-UTF-8 input, unavailable source configuration, bounds or
oversized complete inputs block visibly; nothing is truncated to fit. Existing source collection bounds apply.

## Outcomes and continuation

`submit_role_result` keeps its existing `text` and `supports` arguments. For investigation, `text` is JSON:

```json
{
  "schema": 1,
  "outcome": "finding",
  "summary": "The strict positive predicate excludes zero.",
  "facts": [{"text": "Zero is rejected by x > 0.", "citations": [{"ref": "revision:6", "path": "src/boundary.ts"}]}],
  "uncertainties": ["Whether zero should be accepted is a product question."],
  "limits": ["Source inspection only; no verifier executed."],
  "next": null
}
```

Citations must reference the exact retained source observation plus a selected file path, or another exact
packet input/declared retained web support without a path. Whole-file bytes and exact blob identity are retained;
line-number interpretation or a mutable repository URL is not the evidence. Every fact needs a citation, and
at least one source citation is required. Required inputs/supports are integrity-checked again at submission.
The report remains an attributable **model claim**, distinct from the host source observation and runner evidence.
Structural validity cannot establish prose truth or prove model judgment.

For a new seam/product question, requested code change or required experiment, use `outcome: escalation` and
`next: {playbook, reason, question}`. Playbook is `design`, `experiment`, `change`, `bug` or `performance`.
These continuation capabilities are not implemented by this Slice. The retained assignment is **blocked** with
`playbook_unavailable:<shape>`, the reason and precise next human question; report/facts/source/ownership remain.
No follow-up role is scheduled and rebind cannot waive the blocker. Later capability owners consume these exact
records; neither a report nor an assistant-proposed shape change grants source-change authorization.

A finding settles the coordinator assignment. The outcome, task and receipt use the existing atomic Ledger
commit. A fresh client reads Ground (investigation-only commitment), assignment (owner), report/source refs
(evidence), status/blocker and `next.question` (next human action) without reconstructing the original chat.

## Normal durability versus disaster recovery

Normal restart retains Ground, role assignment/task/execution, exact source observation, report and provenance.
Committed tool results replay by their existing host-derived identity; no partial result is acknowledged.
An interrupted compatible task resumes under current authority. A blocked task retains ownership and facts;
use existing checked cancellation/replacement for a new bounded investigation, never edit storage manually.
Missing/corrupt inputs name the exact restoration ref and block affected reads/work; a later source observation
or newer Ground is not a replacement for missing historical bytes.

Disaster recovery is deferred after v1. Normal restart/history/export does not imply host-loss recovery. Retain all necessary runtime records, citations and source observations without package-representability constraints.

## Verification and limits

`npm run verify:ground-investigation` runs the direct Kernel/real SQLite/Git/scripted-Durable journeys and
before/after-result-commit SIGKILL tests. `RENDER_V3_REPETITIONS=100 npm run verify:investigation-crash` is the
separate extended fault job. The existing Full Gate and unsafe-control runner include the new scenarios.
Preimplementation expectations are in `verification/ground-investigation-failure-cases.md`.

Scripted provider assertions establish plumbing, authority, byte retention and continuation—not live model
quality, a human's two-minute comprehension, actual consumer test results, future delivery playbooks or full V9.
No live provider/search or separately authorized human trial ran as part of these fixtures.
