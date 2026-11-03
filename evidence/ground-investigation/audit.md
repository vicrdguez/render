## Standards

Reviewed integrated A `69932ee807fbfa388fa182449410e84129f393f0` against fixed point
`f9fe9de73ed3bd7912173b13dbea251e4c0f023c`, using `git diff <fixed-point>...HEAD` and its
three-commit list. Read AGENTS.md, testing guidance/examples/mocking, verification selections,
smell baseline and acceptance criteria; inspected affected Kernel/Ledger/Engine callers, source resolution,
role retention/export and package refusal. No fresh-context agent tool is available in this session;
this is the authorized sequential self-review fallback, Standards completed before Contracts.

**F1 — JUDGEMENT — test/support/investigation.ts:30; test/ground-investigation.test.ts:169;
test/support/investigation-crash-worker.ts:31.** The preimplementation fixture casts
`as Partial<RolePacket>` and `as ConstructorParameters<typeof Engine>[0]` remain after their
new typed fields exist. They suppress the useful excess-property check on the exact configuration
being tested. Simpler alternative: pass the now-typed object literals directly and use the actual
`RoleAssignment.investigationSource` field rather than an intersection re-declaration. This removes
fixture-only type escape hatches, preserves the same setup/observations, and lets typecheck catch
misnamed future configuration. No new test abstraction is needed.

No other mandatory-standard violation or concrete baseline smell found. The internal investigation
content parser keeps one concern together rather than introducing a sixth module, registry or task system.
The explicit read-only Effects configuration avoids requiring a writer profile to investigate source.
Initial executable failure cases/unsafe controls precede product commit; the later runner-substitution
assertion was red before its corresponding fix. Existing authority-matrix expectations were updated for
the newly available host source command, not weakened to accept unauthorized principals.

Full Gate on A: `npm run verify:gate` exit 0; typecheck/lint succeeded (363 lint warnings),
243 tests passed, 0 failed, 0 skipped; test selection 263470.187125 ms. Extended jobs and controls
are separate results, not implied by this gate.

Counts: **HARD 0, JUDGEMENT 1**. Worst issue: unnecessary fixture casts mask configuration mistakes.

## Contracts

Reviewed the complete implementation on A `69932ee807fbfa388fa182449410e84129f393f0` against
fixed point `f9fe9de73ed3bd7912173b13dbea251e4c0f023c`, the supplied B1–B3/A1–A4/T1–T3 Contract,
and decision.md at ledger `81ebd7ddb9d88df64c66cda53dbee8e79f7e278a`. Acceptance criteria retrieved.
Sequential self-review fallback follows the completed Standards report; no independent/fresh-context
reviewer is claimed.

**F2 — HARD — src/kernel/roles.ts:229.** The new `if (c.delivery && c.packet.investigation)`
precedes the existing `!c.packet` validation. Calling the public pure `change` interface with
`{type:'assignTask', workflow:'workflow:2', slice:'workflow:2', delivery:true}` now throws
`TypeError: Cannot read properties of undefined (reading 'investigation')`, instead of its prior
`invalid_content` refusal. Reproduced directly on A with host/scheduling principal and an existing
workflow. This violates A1's “Preserve all five interfaces unchanged” and the retained invalid-content
boundary; the seeded driver generates missing packets but not this delivery=true combination, so its
pass does not distinguish the regression. Move investigation-specific access after existing validation
and protect the literal refusal before changing the guard. No new protocol or scope choice is required.

Otherwise B1 is represented by immutable human Ground/proposed-versus-supplied shape checks and
G01/G02/G03; B2 by scoped literal Effects input, coordinator-only execution, citation validation,
trusted source versus model-report provenance, G04–G06/G08 and the read-only Git canary. B3 is represented
by retained blocked escalation/question and refusal of delivery, child requests, replacement widening
and unsupported rebind (G07/G09). Kernel cannot establish natural-language truth; docs correctly limit
scripted provider evidence.

A1/A2: five boundaries/dependency pins and recovery validator remain unchanged; optional packet/state
fields reuse current tasks, revisions, artifacts and scoped history/export. G10/G11 and G12 cover exact
normal reopen, damaged source and result crash/replay. Decision.md explicitly permits inherited package
refusal; issue #47 is not silently implemented or waived. Programmatic host provisioning remains required,
as for predecessor role/catalog work; no CLI/live provisioning claim is made.

A3/T1–T3: failure matrix/scenarios/controls precede product implementation; additional runner-substitution
assertion was red before its correction. Full Gate on A passed: 243/243, zero skips; V1 10,000 schedules;
V2 separate 256 schedules passed; new result-crash extended 100 per point (200 tests, 201043.62725 ms)
passed; all 61 unsafe controls detected their named wrong behaviors. Full V8 future delivery and full V9,
live judgment/search and human comprehension remain unclaimed.

A4: one current-pass Audit on retained A, target cutoff pinned; F2 must be fixed/rechecked and the Full Gate
rerun on final B before submission. No same-pass re-Audit, Watchdog substitution or human merge.

Counts: **HARD 1, JUDGEMENT 0**. Worst issue: invalid-packet refusal regresses to an exception.

## Same-pass dispositions

- F1 (Standards, JUDGEMENT): fixed. Removed obsolete packet/Engine configuration assertions and the redeclared source field type; configurations now receive ordinary excess-property checks. No behavioral assertion removed.
- F2 (Contracts, HARD): fixed. Added a literal malformed-delivery oracle and observed the exception before moving the new investigation guard after the existing missing-packet check. Refusal is restored without changing valid investigation or delivery semantics.

The current pass has one Audit only. Post-Audit typecheck and the investigation/V1 selection pass. Final Full Gate, extended result-crash, V2 and unsafe-control results are recorded on the submitted head in the implementation report, not attributed to this pre-fix Audit snapshot.

Axis totals at Audit: Standards 0 HARD / 1 JUDGEMENT; Contracts 1 HARD / 0 JUDGEMENT. Both findings fixed; no outstanding human choice or debt disposition. Gate on A was green despite the uncovered malformed-input case.
