# Contracts Audit

Audited source: d33f3159d6c4dfedd209668d88346d10e6c69954; target 0c36b60aad07c6e67846396832739434c370dc56.
Fixed point and comparison: previous reviewed ancestor 3f249c1e26e5ae70632b04671cd6a6dd19574997; `git diff 3f249c1...HEAD`; commit list in Standards report. Both accepted slice contracts retrieved with skl; spec §§5.3.1, 5.4, 10, 13 and audit acceptance.md applied. Standards completed before this sequential self-review fallback; no fresh-context reviewer available.

## Findings

No new findings.

- B1: snapshot-derived identity/cutoff, exact revision/message bytes, offline-only marker, raw-key exclusion and durable publication survive composition. Empty role indexes now validate; nonempty assignments/bindings/tasks/submissions and role-provenance revisions explicitly refuse rather than disappear. This selects the decision's authorized “cover ... or explicitly refuse” alternative, not task restoration or migration. Package-only restore, concurrent later saves, interruption and preservation of prior good generation execute.
- B2: startup keeps marker/schema/file-fence checks before admission and Engine resume. Every successful restricted start rotates executorEpoch without hooks or rebinding. Real marked role copies deny backed-up assignment reads, refuse repair and retain diagnostic history. Supported older packages do not authorize newer-world agents. Existing HTTP bearer/outbox fencing, malformed import, direct-copy and nonclean-store preservation checks pass.
- B3: original atomic credential/epoch/cursor rotation and restricted-mode transition remain. All semantic corruption rows, including unsupported role provenance, refuse managed import and direct repair. Empty/backed-up-key signatures over a current repaired cursor body are rejected; genuine cursors survive restart. New unsafe control distinguishes omission of rotation. Extended repair and command SIGKILLs cover 100 repetitions per barrier.
- B4: current authorization precedes disclosure; hidden/absent receipt equality and missing-history uncertainty persist. Restored history/export declares cutoff/unreconciled newer world before and after repair. Role packets remain exact diagnostic documents with provenance. No process quiescence, assignment rebind, task replay or recovery exit is invented.
- A1–A3: authoritative spec, interfaces, dependency edges, lockfile/pins unchanged; implementation remains at Ledger/Engine composition boundaries.
- A4/T1: 603d3d5 failure matrix/rows precede merge; role-provenance intended red predates guard. Retained reds are honest working-tree evidence; two inherited unavailable assertions and a dropped npm script were corrected, not presented as product detections.
- A5/T2–T3: final integrated gate PASS, 85/85; all eleven named suites and 22/22 unsafe controls pass. Extended V2 256, command/repair/role-tool replay 100 per point, and history load pass on identical product/verifier source 791bee2; d33f315 changes only Markdown boundaries. V5/V6/full V8/full four-stream V9, off-host availability, physical loss guarantees and authorized live/human trials remain absent/unrun, explicitly limited.

Gate: audit-full-gate.txt PASS; types clean; Biome exit 0, 54 nonfatal warnings, no errors. HARD 0; JUDGEMENT 0; worst issue none. F1 stays fixed; W1–W4 preserved; W5–W7 resolved within accepted limits.
