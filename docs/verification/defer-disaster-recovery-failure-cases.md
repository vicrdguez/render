# Disaster-recovery deferral: retained-v1 failure cases

Established before product edits against integrated Ground source `d6e06b9b69e331c2804ef0681e7e1ce5d669a395`. CONTEXT.md is absent.

## Responsibility trace

- Remove Ledger recovery.ts, backup.ts, backup-state.ts and offhost.ts; their management paths in startup, Ledger, HTTP and host CLI; protection fields in records/history; exclusive barriers, package/receiver tests and controls.
- Preserve owner lock, persistence readback, schema/task-definition checks, unsafe/orphaned-task refusal, startup executor fence and Engine resume ordering. `recordRecoveryState`, host `recovery` scope and `recovery_required` role refusals also serve ordinary late-result quarantine/continuation and are NOT disaster-only.
- Preserve all workflow/role/task/policy/Ground/source records and history/export. Mixed owned-check-history and verification-catalog journeys lose only their package calls; their independent receipt/export/reopen assertions remain.
- Dedicated recovery-packages, recovery-package-semantics, recovery-policy, recovery-role-work and offhost-protection tests exercise package creation/import/restricted restore/repair only. Ordinary policy, role, scope and startup behavior is independently covered by the retained tests below.

## Independent expected outcomes and verification

| Failure | Required consequence | Existing or prewritten check |
|---|---|---|
| Removal loses accepted ownership, task identity, committed cited results or Ground | Same live SQLite store reopens with original identities and exact cited bytes; continuation follows current rules | ground-investigation, investigation-crash, workflow-task-survival, context-continuation-independence, role-wait-restart |
| Obsolete executor resumes or uncertain external effect repeats | Fresh executor fences old permits; unsafe/orphaned work refuses; incompatible task meaning is preserved, not migrated | cancellation-capacity, role-recovery-startup, task-version-recovery, durable-tool-replay; retained unsafe controls |
| Commit/reply interruption loses or duplicates acceptance | Before commit no accepted state; after commit exact replay receipt and identity | command-crash-recovery, sqlite-command-atomicity/schedules (extended 256), kernel-authority-schedules (10,000) |
| Package operations or bookkeeping survive removal | Removed commands are unknown and normal snapshot/status/history contain no recovery/protection fields | Source/command/catalog inspection only; dedicated command-registry and field-absence assertions are retired |
| Ordinary restart loses identity or bytes | Authority stays fixed, executor rotates and the retained document returns exact bytes | defer-disaster-recovery.test.ts |
| Host retains disaster-specific startup/CLI routes | CLI rejects removed verbs/options; ordinary startup reaches ready and stops | defer-disaster-recovery.integration.ts; no backup-configuration read or legacy-store compatibility claim |
| Removal weakens historical scope or missing-byte safety | Exact immutable export survives reopen; foreign scope and missing/corrupt content remain precise refusals | history-cutoff-export, history-missing-data, role-history, independent-export-reader, owned-check-history, verification-catalog |
| Scratch returns or archive loses the old implementation | Both current and archive trees omit evidence/; archive retains original disaster code/tests; ignore/guidance prohibit raw run output | git tree/ref inspection; exact archive commit recorded in implementation report |

Before deleting the implementation, remove evidence/ and commit an archive basis retaining the disaster code/tests. Existing history is sufficient; do not relocate scratch. New removal checks must fail on the pre-removal behavior, not merely broken imports. Existing negative controls remain except disaster-only mutations. Full Gate, extended retained critical points and unsafe controls run on candidate source; measured commands/results/limits belong in phase reports, with raw output outside source.
