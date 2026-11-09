# Scoped confirmation

The goal is a documentation-only redesign for workflow-owned tailored execution skills and one host database with isolated projects and explicit sharing. I checked `reviews/revision-2.md` against the three named design documents in `/tmp/render-kernel-docs-publish.wwbt5S/checkout/docs/design/pluggable-kernels/`. I found no confirmed contradiction in the requested corrections.

## Correction checks

- **Staged reading.** `README.md:131` exposes a staged composer result; `README.md:160-168` shows staging as an alternative to blocking in the flow; `README.md:176` and `execution-skills.md:232-237` describe its conditions and required retrievals. The sequence diagram in `execution-skills.md` abbreviates the renderer return as skill or blocker, but does not explicitly forbid the staged result; the root flow and API specify it.
- **Ownership and purity.** `storage-and-knowledge.md:57` assigns render plans and authored content to definitions. `execution-skills.md` distinguishes those from shared composition mechanics. `README.md:135-137` makes `prepareTask` pure, denies it I/O handles and capability-grant authority, and reserves validation for the host.
- **Missing cases and compatibility.** `execution-skills.md:186-194` names the compatibility claimant, installation and selection roles, change taxonomy, and explicit `missing-procedure-case` blocker with no fallback.
- **Pins and continuation.** `README.md:211-216` pins each prepared-assignment revision and permits linked revisions for new facts. `execution-skills.md:201-214` preserves authored sources across continuation and requires refresh or explicit staging after authorized model changes, compaction, and reset.
- **Revocation.** `storage-and-knowledge.md:120-128` separates historical inspection from new adoption. Prior capture does not authorize a new assignment, and derivative reuse remains a product decision rather than an implicit permission.
- **Creation retries.** `storage-and-knowledge.md:61` identifies duplicate requests using principal, host namespace, command ID, and canonical fingerprint before resolving current defaults. Changed bytes conflict.

## Limits and operator attention

This is a scoped document comparison, not an implementation, isolation, security, or behavioral evaluation. I did not rerun Mermaid or link checks, inspect the full history, or independently verify source-spec line citations. Feasibility probes and authoring and worker-format evaluations remain explicitly unrun; that is not a confirmed bug. Product review remains necessary for sharing and derivative reuse, content-adoption rights, and production update policy. Engineering must establish shared-runtime isolation, extraction, and actual skill-to-provider binding before production. Accepted specification and Contract amendments remain separate human decisions.
