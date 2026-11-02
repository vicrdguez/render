# Decision-specific ambiguity evidence

Verifier: implementer, pi/openai/gpt-6-astra (high), macOS, Node 24.21.0. Actual locked Webfox 4.8.0 / exa-js 2.27.0 / @tavily/core 0.7.14, Durable/AI/Chord 1.4.0, real owned HTTP and SQLite with controlled external responses. No live provider request, key, paid trial, Linux run or independent review. Human-readable fixture text is controlled, not a captured live error.

Test/control source: **6d6ab6da70b572b8a8adac43b0400b75e47064dd**; only catalog/product documentation and evidence were uncommitted during these runs. Product source is unchanged from 335c74ed93de3ae2b11d1ffb69d76067147e7494, including the existing cancellation fix. This round changes no dependency, lockfile, transport, classifier or retained type.

| Command | Result | Evidence and meaning |
|---|---|---|
| `node --test test/web-error-boundary.test.ts` | exit 0, 1/1, 0.226 s | `root-boundary.log`: supported-root error objects for HTTP 400 INVALID_REQUEST_BODY and HTTP 402 NO_MORE_CREDITS are exactly equal for search and contents when message text is equal. Diagnostic success, not a B1 product pass. Page-level failure lacks retryable; local non-HTTP scheme rejects INVALID_INPUT without contact. |
| `node --test --test-name-pattern='ambiguous upstream invalid request\|documented allowance exhaustion' test/scoped-web-research.test.ts` | exit 1, 2/4, 1.149 s | `focused.log`: registered-tool invalid-request exclusions pass with both credentials configured. Both documented allowance checks still fail on the missing Tavily request. No setup reds. |
| `npm run verify:unsafe-controls` | exit 1, 36/37 detected, zero failedOtherwise | `controls.log`: new ambiguous-invalid control has green baseline and intended failure; admitting nonretryable PROVIDER_FAILURE starts forbidden fallback. Cancellation-uncertainty control still detects. Allowance control still has red baseline, not a detection. |
| `npm run verify:kernel-authority-schedules` | exit 0, 5/5, 0.667 s | `v1.log`: V1 10,000 schedules preserved. |
| `npm run verify:sqlite-command-atomicity` | exit 0, 22/22, 25.917 s | `v2.log`: V2 256 real-SQLite schedules. Two-process owner lock additionally remains covered by full suite/control. |
| `RENDER_V3_REPETITIONS=100 npm run verify:scoped-web-research` | exit 1, 220/222, 128.752 s | `web-v3.log`: primary and fallback SIGKILL each pass 100 repetitions with no charged replay. Only two allowance failures. This command is not a full pass. Negative-evidence composition, scope, declaration, exact-byte recovery refusal and cancellation remain green. |

The final Full Gate is retained separately in this round's workflow result directory, at the final paused head after committing these files. The report records its actual outcome; these earlier runs are not mislabeled final-head runs.

## Decision consequence

The latest decision permits uncertain eligibility at the supported root but explicitly requires reporting a tested collision with a forbidden category. The collision now shown is **upstream invalid-request refusal**, not just the earlier 403 feature-access case. B1 excludes invalid input; Exa documents HTTP 400 as invalid body/query/headers/options. The upstream status/tag are not available to Render. There is no supported classifier of these identical observations that admits one and refuses the other. Guessing from message wording cannot distinguish the demonstrated pair.

This does not prove that the live provider currently uses identical wording for the two cases or quantify its frequency. It does prove information loss for controlled provider responses at the pinned public API. Page-specific and local-validation categories are not being claimed indistinguishable: their measured root shapes differ.

The human question is narrowly whether the accepted ambiguity may also admit **provider-side invalid-request refusals whose category is lost at the root**, while retaining exclusions identifiable at that root and honest uncertainty. If not, allowance support stays incomplete under the current pin/root-only restriction. Dependency/transport upgrades remain unauthorized and the separately tracked robust-classification work is not a new acceptance gate. No product broadening was silently made.

Resume: retain the candidate and history, resolve this question first, write any additional decision-specific uncertainty/provenance oracles before product edits, rerun focused checks, then observe/integrate the target once and perform the normal current-pass Audit, final checks, submission and independent Watchdog. This pause happens before those phases; no historical review substitutes for them. Only a human merges.

## Retention and limits

Ordinary retained selected evidence/history/export and restart remain available; role/web recovery packages remain explicitly unsupported on this candidate. Missing/corrupt support requires exact-byte restoration, never refetch replacement. Working handles may expire/restart away. Do not force unsafe tool replay or edit SQLite to bypass recovery fences.

V1–V9 targets are unchanged. The current negative-evidence journey is bounded available V8 composition, not future checkpoint/annotation/experiment functionality or semantic model-judgment proof. Full V9 four executing attempts/four concurrent Durable transcript streams is not delivered by this candidate; the full-suite local load is the early 100-workflow/two-client measurement. No live search/model/human-handover trial is claimed. Other extended recovery/role/offhost jobs were not rerun; their cheap suites remain in the final Full Gate and earlier extended evidence retains its original sources.
