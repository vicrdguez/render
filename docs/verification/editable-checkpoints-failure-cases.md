# Editable checkpoints: preimplementation oracles

Tests are authored before product changes. Observe Kernel.change/view, Ledger.command/observe/artifact over real SQLite, and Engine/Durable with a scripted external provider. No model-quality or human-handover observation is inferred from scripts.

| Case | Failure trigger | Independent expected outcome | Obligations |
|---|---|---|---|
| C01 | Another command ID/principal requests pending stage | Original request remains alone; role request refuses; human/host cannot impersonate coordinator | B1/I2/I12 |
| C02 | Markdown identity frontmatter edited | Complete original and edit retained; identity unchanged; edit cannot be approved | B1/B3 |
| C03 | Missing manifest nodes, alternatives, evidence, verification strategy or disposition | Structural refusal, no advancement | B1/B2/I15 |
| C04 | Required candidate or experiment capability absent | Named capability blocker before synthesis/challenge, never waived | B1 |
| C05 | No exact challenger; old review on revised draft; same-family without policy | Refused; only fresh non-fork exact-input challenger under configured family policy qualifies | B1/A1 |
| C06 | Two acknowledged complete edits from same base | Two immutable submissions, stable concern IDs and explicit conflict, survive reopen/export | B2/A2 |
| C07 | Save then approve old annotation basis | stale_basis with current request/annotation revision; save is never consent | B3 |
| C08 | Approve then save | Original acceptance unchanged; saved edit marked change request | B3 |
| C09 | Approve with notes | Only original emitted bytes accepted; every concern explicitly nonbinding | B3 |
| C10 | Rework without saved edit/reason; partial concern map | Refused; all concern IDs need disposition, reason and resulting node/ref | B2 |
| C11 | Unrelated evidence save versus policy adoption | Evidence does not stale approval; applicable policy binding change does | B3 |
| C12 | Missing/corrupt exact input or review | Refuse affected work naming exact missing ref; do not substitute latest bytes | A2 |
| C13 | Modules reference absent/stale seams; revised seams requested | Block affected work, preserve original approvals/history; new human decision exposed | B4 |
| C14 | Human cancels pending request with stale/current basis | Stale refuses; checked cancellation resolves identity; successor allowed, history retained | B1 |
| C15 | Restart/reattach and historical export | All acknowledged bytes, manifests, reviews, concerns, dispositions and decisions recoverable; fresh five-field handover | A2/V4/V8 |
| C16 | Authorization/scoped read, fenced coordinator or challenger | No new authority, disclosure or dedup bypass | A1 |

Unsafe controls must specifically detect approving edited bytes, dropping an acknowledged concern and accepting stale challenge. Setup failures are not detections. Existing 10,000 V1 schedules, V2 real-SQLite/process-lock coverage, V3 named barriers, V4 reattachment, V9 baseline and full gate remain cumulative. Candidate/experiment-required paths and future Contract acceptance/implementation are reported blocked, not a completed full design delivery. Later owners must compose these checkpoints into those journeys without skipping their evidence requirements.
