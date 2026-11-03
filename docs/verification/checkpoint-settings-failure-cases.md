# Checkpoint settings — preimplementation failure cases

Literal outcomes below are written before product changes. Tests use Kernel.change, Ledger command/snapshot/artifact over real SQLite, owned HTTP clients, and ordinary startup; scripted challengers test structure and provenance, not judgment.

| Case | Obligation | Trigger | Expected outcome |
|---|---|---|---|
| S01 | B1/A2 | Initial empty store with settings file; client edit then restart with old/malformed file | Initial file seeds once; latest accepted revision survives; later file ignored |
| S02 | B1 | Two clients submit same expectedRevision; stale local-admin import | Exactly one accepted change; stale_basis on loser/import; attributable history survives reopen/export |
| S03 | B1/A1 | Agent, scoped device or host changes settings; device imports; invalid mode (including array-to-string coercion) or delegated Proposal | forbidden_principal/forbidden_scope or invalid content; no settings change |
| S04 | B2/B4 | Capture human, change delegated, rework/retry/duplicate ID/new coordinator; resolve then Modules | Same pending identity/capture; duplicate request refused; later request uses latest settings without policy adoption |
| S05 | B2/B4 | Capture delegated, change human, then advance; checked cancellation/replacement | Pending delegated stays delegated; canceled request cannot advance; successor captures human |
| S06 | B3 | Missing/stale exact review, annotation or decision basis; author labels new product choice technical | Common exact validator refuses; challenger unresolved-product/scope-change flags block advancement even when author claims technical |
| S06-shape | B3/A1 | Existing classifier-proposed Ground shape not confirmed | shape_confirmation_required; human-origin shape and confirmed classifier shape need no extra approval |
| S07 | B3 | Already human-decided product node with exact human evidence and clear challenge | Delegated decision allowed and retained as machine/settings/scope/review provenance, never human signature |
| S08 | B3 | Agent acceptIntake or human approval tool impersonation | forbidden_principal; no Contract acceptance |
| S09 | B4 | Policy defaults/adoption while pending; canceled coordinator | Routing unchanged; policy basis stales; counts/history remain; revoked assignment cannot advance |
| S10 | A2 | Missing/corrupt exact settings source, Ground, review or evidence | Affected operation refuses naming exact missing source; no newer substitution |
| S11 | B2/A3 | 10,000 seeded schedules, both routing directions, all principal kinds | Capture immutable, at most one pending per workflow/stage, no unauthorized settings writes |

Retain existing checkpoint edit/approval, V1 schedules, V2 256 and real lock, V3 critical-point, V4 reattach, V8 scripted journeys and V9 workloads. Full Gate is verify:gate; expensive extended jobs and unsafe controls are separate. Add targeted mutations for second pending identity, restart file overwrite, delegated product bypass and agent intake acceptance. Setup/import failures are not mutation detection. Final intake/candidates/experiments and full source-delivery load remain unavailable capabilities, not claims established by these tests.
