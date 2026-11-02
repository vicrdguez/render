# Recovery packages — source-specific evidence

Product **and verifier** revision: `86210e36ed3a4393178194c340cfddd429756360`.
Integrated target: `158631fc6805dca999d259d93b15997bab288d14` (fresh origin/proposal/render-v1 fetch; already an ancestor).
Platform: darwin-arm64, Node `v24.21.0`; exact dependency pins unchanged.

`red-before-implementation.txt` is the original six failing seam checks before product implementation, from the
T1 commit `0673548`: actual supported commands return `unknown_command`, not an import/compilation failure.
Later receipt-result corruption was also observed red (`receipt-result semantics must be validated beyond checksums`)
before strengthening semantic validation. Test SQL fixture field names and socket path lengths were corrected as
setup repairs, not counted as behavioral reds.

| Log | Exact invocation | Result |
|---|---|---|
| full-gate.txt | `npm test && npm run typecheck && npm run lint` | 50 tests passed, zero failed/skipped; types/lint clean. Test duration 62.574 s. |
| v2-extended.txt | `npm run verify:sqlite-command-atomicity` | 256 real-SQLite schedules; 22 checks passed; 45.311 s. |
| v3-command-extended.txt | `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery` | 100 repetitions at each before/after commit barrier; real disk-full case passed; 172.636 s. |
| v3-repair-extended.txt | `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash` | 100 repetitions at each repair-before/repair-after commit barrier; 143.409 s. Counts come from the invocation, not the one aggregate node:test row. |
| unsafe-controls.txt | `npm run verify:unsafe-controls` | 15/15 intended assertion detections, all baselines passed, zero failedOtherwise. |

The full suite executes all current named rows, including V1 10,000 schedules, V2 sampled 32, two-process owner lock,
V3 smoke, V4, V7 recovery and early V9. Separate extended jobs do not pretend to be smoke. Measurements in this gate:
reattach 134 ms; early V9 400 saves/two clients/100 workflows, p95 acknowledgement 143.596 ms and snapshot 2.523 ms.
The named recovery filters in package.json select package-clean-restore, package-origin-auth-fence, package-validation,
repair-crash and restore-newer-world from the same executed suite. Semantic mutations cover checksum-correct pointer,
receipt fact/result, device-scope shape, parent, schema, unknown entry and unknown future fact-command corruption.

## Obligation mapping and limits

- **B1:** package-clean-restore, concurrent cutoff/interrupted generation, live restart after packaging and package
  validation; exact bytes `first\r\n`, `hello`, revision:4/workflow:3/cutoff 5. SQLite snapshot pins all current content;
  no source owner exists, and the explicit empty root map is not a forged source-reconciliation pass.
- **B2:** direct copy before later revocation, old receipt/outbox refusals, malformed/missing/corrupt/traversal/symlink
  import refusal with durable admission-disable; origin-ignored unsafe control detects credential resurrection.
- **B3:** checksummed semantic corruption refuses both managed import and direct-copy repair; before/after commit
  SIGKILLs; restricted restarts preserve rotated authority/replacement enrollments and refresh executor epoch.
- **B4:** current authorization/scope precedes receipt disclosure; old namespace mismatch is distinct from missing
  post-cutoff uncertainty; current-epoch replay remains blocked. Missing-receipt unsafe control detects ordinary
  not-found. No automatic reconciliation/reissue/exit is fabricated.
- **A1–A4:** unchanged authoritative spec, five interfaces and pins; real owned fixture storage/process seams;
  Ledger-owned closed package format and repair. Operations instructions and blocked future capabilities are in
  `docs/operations.md`. No history/export owner exists in the target; existing immutable artifact/message surfaces
  remain covered, and future owners must extend this validator.
- **A5/T1–T3:** test-first commit, extended catalog and cumulative current-feature verification above. V5/V6,
  executing tasks/streams and full V8/V9 are absent, not passed. No human judgment/usability trial was run or required.

No off-host availability, physical zero-loss, private TLS, real forge reconciliation, automatic restored task/effect
replay, arbitrary unmarked rollback detection or RTO claim. The owner must provision any off-host protection separately.
All hosts/data are test-owned temporary instances; helpers remove directories and terminate processes, and the disk-full
check detaches its owned volume. Nothing targets the user's live services or uses skl's own tests.
