# Selected project verification catalogs

Catalog use composes the existing Engine, Ledger, Kernel, Effects and Sandboxes interfaces. It is not a new runtime stage or a verify-create/maintain service. The existing trusted composition root authorizes execution; the ordinary CLI does not provision workers or enable arbitrary repository execution.

## Selecting one asset

A retained role packet may carry `verification`:

```json
{
  "repository": "operator-registered-name",
  "commit": "FULL_EXACT_COMMIT_ID",
  "path": ".render/verify.md",
  "digest": "SHA256_OF_EXACT_CATALOG_BYTES",
  "contract": "revision:EXACT_RETAINED_CONTRACT",
  "rows": ["behavior-check", "full-suite", "typecheck", "lint"],
  "behavioralRows": ["behavior-check"],
  "receipts": []
}
```

Use `.render/verify.md` and `.render/journeys/` for new projects; explicit `.skl/verify.md` / `.skl/journeys/` paths work identically. There is no discovery or fallback to a second asset. Repository/commit are resolved through trusted Effects. The Contract and receipt references are ordinary immutable, scope-checked Ledger inputs. Engine renders the selected asset bytes/digest/source, required rows (including literal table lines), journey bytes/digests, ordered ranks and prerequisites into the effective packet. It refuses missing/different files, unknown rows and invalid ladders rather than mixing project ranks with a built-in ladder. Channels remain descriptive, not ordinal.

For owned execution use `execution: "linux-writer"`. The operator's existing `ownedChecks.checks[packet.profile]` entry supplies `repository`, `commit`, `profile`, `timeoutMs` and `catalog: true` in place of `argv`/`verifierRevision`. Repository/commit must match the packet. Only commands from the selected source asset run. Legacy noncatalog owned checks remain available but cannot discharge catalog completion. This authorizes repository shell commands inside the existing nonroot owned Linux sandbox, never on the host. Profile/image/network/source limitations in [owned-checks.md](owned-checks.md) still apply.

## Markdown conventions

The supported thin asset is ordinary Markdown with these level-two headings: Ranks, Launch, Doctor, Channels, Catalog, Cleanup, Extend, Traps. Extra headings (such as Render's Selections) remain retained. Ranks use numbered lines beginning with a code-spanned rank name, strongest first. Catalog columns are exactly Name, Channel, Kind, Run, Expectations, Rank. Names are unique. Escaped pipes are supported in cells.

- `executed`: Run starts with one inline code-spanned shell command; trailing explanatory text is retained. Its rank belongs to this project's ladder.
- `generated`: same execution convention, but discovery/indexing only. Rank is `-`, never behavioral proof.
- `journey`: Run names a literal repository file. That file's `## Steps` contains numbered inline code-spanned shell commands, and `## Sanity` contains one independent inline code-spanned shell predicate. Steps and sanity execute separately and retain separate results. Rank belongs to the selected ladder.
- `human`: advisory text; never executed or accepted as required behavioral proof. Rank is `-`.

Every selection includes the project's `full-suite`, `typecheck`, and `lint` rows as well as the required cited rows. These stable names identify project-owned commands, not a second command registry. `behavioralRows` explicitly identifies required behavioral evidence within the selected `rows`. All mandatory gates must succeed, but weaker static gates do not cap the rank of stronger behavioral evidence. Selected discovery/advisory context does not become a readiness requirement; generated/human rows cannot discharge a behavioral requirement. Select all Contract-required behavioral evidence; architecture-only inspection remains a separate justified report and cannot discharge these rows.

Catalog Cleanup can contain `sh` fenced blocks. They run inside the same owned sandbox after decisive row results have been retained. Authors must stop their owned services and preserve required raw artifacts before removing fixture resources. No general service-ownership inference is possible from arbitrary shell text. Cleanup commands must not borrow/delete a user's service. The product never deletes retained source roots/journals: inherited whole-container seal/stop confirms quiescence before collecting source and releasing capacity. Failed cleanup is visible as `pending`, never a lower-rank success. Exit-zero cleanup records process completion; model assessment must still judge the adequacy of the project expectations and ownership procedure.

## Execution is not judgment

Each catalog receipt retains source/Contract/asset identity, exact rows and expectations, actual commands/results, Linux OS/CPU/image/profile, independent journey sanity, cleanup results and sealed source. Each actual invocation is journaled and retained through the existing diagnostic path before subsequent cleanup. The selected-catalog/result aggregate is also retained before cleanup. Command failure or missing executable remains `failed`/`unrun`; a modified result is `source_changed`. All-green execution is only `needs_assessment`.

A separate read-only role assignment cites the same selection and exact runner receipt(s) in `verification.receipts`. The role uses the existing `submit_role_result` tool with an additional declaration:

```json
{
  "text": "Adequacy reasoning and findings",
  "supports": [],
  "verification": {
    "outcome": "pass",
    "rank": "PROJECT_RANK",
    "reason": "Why these independent expectations establish this Contract"
  }
}
```

`non-pass` with a reason and null rank is available for honest gaps. Kernel admits pass only with a trusted same-role runner receipt matching exact source, Contract and verifier, all required rows executed successfully, unchanged sealed source and completed cleanup. It rejects generated/human substitution, stronger-than-weakest required behavioral rank and below-minimum behavioral evidence. Human policy may name a project rank; membership is checked against the selected ladder, not hardcoded at policy ingress. Implementer evidence cannot satisfy Watchdog: Watchdog runs its own owned assignment on its exact source and makes its own assessment. No model quality is inferred from scripted fixtures or exit status.

This uses the existing assignment/report boundary. It does not implement later accepted-intake, per-pass preparation, Watchdog scheduling or qualifying-integration transitions. Those unavailable capabilities remain explicit; no report here independently grants later readiness/integration authority.

## Retention and recovery

Receipts, selected inputs, diagnostics, assessment declarations and packet references use existing atomic Ledger records and scoped history/export. Reads and submission verify retained bytes; no refetch replaces a missing required receipt. Restart uses the existing source/journal recovery path without replaying interrupted commands. Runtime uncertainty remains blocked; failed commands and incomplete cleanup are retained. History export still excludes private Git source objects and is not a recoverable package. Role/source-bearing package generation/restore remains explicitly unavailable rather than dropping catalog records. Supported role-free packages continue unchanged.

## Verification and limits

Preimplementation cases: [verification-catalog-failure-cases.md](verification/verification-catalog-failure-cases.md).
`npm run verify:verification-catalog` exercises actual selected legacy assets, literal Linux command/sanity/cleanup results, rank and identity refusals, missing executables, source mutation, scoped export/reopen and unsupported package refusal. Fast Git/SQLite checks add about four seconds serial; container checks about thirty seconds on the development host. Three mutation controls target discovery substitution, stale-source acceptance and verifier-digest mismatch. Full Gate remains `npm run verify:gate`; extended jobs and unsafe controls are separate.

No live-model adequacy/human handover, deployed off-host protection, native Mac execution, complete V8 lifecycle or slice19 four-stream V9 result is claimed. Commands do not authorize live service use, provisioning or paid probes. Missing native prerequisites remain unrun/blocked, never host-shell fallback.
