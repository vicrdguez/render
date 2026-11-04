# Independent design candidates: failure cases

Written before product changes. B1–B3 use existing explicit RolePackets and bounded
requests: common Ground/inputs, distinct instructions/model/budget conditions,
read-only candidate roles with no delegated children, own draft/result scope.
A checkpoint captures the required candidate request keys. A candidate invocation
names that checkpoint; unbound work and another checkpoint's answers cannot count.

| Case | Literal expected result | Seam |
|---|---|---|
| Missing required candidate or only one answer | `missing_candidate_evidence`; no staged emission/challenge | Kernel / Ledger |
| Same question but no distinct conditions, fewer than two packets, different common inputs | `invalid_content`; no request | Ledger |
| Candidate family not available / same-family without human direction | configuration blocker / `capability_unavailable`; no silent fallback | Engine / Ledger |
| New candidates | Different non-fork conversations; common inputs plus own instructions only; no coordinator/sibling transcript | Engine / Durable |
| Named foreign report, packet, runtime history, source or cache | refused; own allowed artifact/cache succeeds | Ledger / registered tools |
| Candidate shell/file capability | absent from read-only tool set; no source/host/sibling mount | Engine / Sandboxes boundary |
| Incomplete report | `invalid_content`; retain refusal; no completion | Ledger |
| Complete report | Exact answer, assumptions, consequences and incidental decisions retained | Ledger / export |
| Candidate tries checkpoint or winner authority | refused | Ledger |
| Canceled candidate replaced with another role or changed question | `forbidden_scope`; no substitute evidence | Kernel / Ledger |
| Valid replacement | Fresh conversation, same checkpoint/key; predecessor remains historical | Engine / Ledger |
| Required report bytes missing/corrupt | exact-ref restore request; no newer-byte substitution | Ledger |
| Restart | Same assignment context resumes; complete outputs and request bindings remain exportable | Engine / Ledger |
| All required answers complete | Synthesis may stage; exact-emission independent challenge still required | Ledger journey |
| Captured delegated routing with required candidates | Same synthesis/challenge barriers; only current coordinator may advance after exact review | Ledger journey |
| Delegated advancement with blocked/canceled required candidate | `missing_candidate_evidence`; no acceptance, even with ready exact review | Kernel with retained journey state |
| Candidate attempts delegated advancement | `forbidden_scope`; no winner authority | Ledger |

Integration regression cases above were added before resolving the checkpoint-routing merge. The delegated journey retains/export/reopens both answers as the human-routed journey does. Omitting delegated advancement from the required-evidence guard must fail the literal Kernel assertion.

Unsafe controls: allow foreign artifact reads; bypass required completion. The
assertion must detect the intended wrong behavior, not a setup/import failure.
Existing context, web-cache, role restart and container isolation checks remain
part of cumulative coverage. Scripted providers prove protocol composition, not
judgment quality. No live service, model/search trial or network-confidentiality
claim is involved.
