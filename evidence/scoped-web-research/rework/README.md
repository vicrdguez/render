# Round-one rework evidence — blocked at supported root boundary

Verifier: implementer, Node 24.21.0 on macOS, locked Webfox 4.8.0 / exa-js 2.27.0 / Tavily 0.7.14 and Pi Durable/AI/Chord 1.4.0. Actual owned HTTP fixtures and SQLite, scripted model responses; no live keys/services or Linux claim.

## Source and chronology

- Previous reviewed source: d763f8cef9fd7be79efe6756223d84e865848208.
- Preparation target (already integrated): 4044eb75986df676ade3c01e83aa674c28113dfc. No late target cutoff/merge was taken: W1 remains red before workflow step 3.
- Failure cases, literal oracles, tests and controls: 5f6af21, before product edits.
- Product fix and documentation correction: 17816f5903ef3b77a0edb28527a4aff488e77207. All logs other than initial reds/probe are on this source. Subsequent evidence-only commits do not retroactively relabel these logs as final-head runs.
- rework-red.log: four intended assertion failures, not setup errors: two missing-402-fallback cases and two missing-cancellation-uncertainty cases.
- No current-pass Audit has run. This is a needs-human pause during finding resolution, not a submission, Audit waiver, qualifying integration or merge. Once unblocked, complete tests/controls before the next product edits, then focused checks → late target integration → one current-pass Audit → final checks/seal → Watchdog.

## Outcomes

| Check | Actual result |
|---|---|
| Root status probe | exit 0: actual supported root has identical code/message/retryable errors for 402 vs 403, for both search and contents. This is proof of information loss, not a fallback pass. |
| W2 focused | 2/2 pass: cancel in-flight primary/fallback, retain CANCELLED + uncertain + possibly charged + canceled reason; no later request; owned handler can finish afterward. |
| W2 unsafe control | green baseline; intended uncertainty assertion fails; detected. |
| npm test | exit 1, 111/113 pass, 2 fail, 110.642 s. Only failures: W1 documented-402 search/contents. No skips/todos. |
| npm run typecheck | exit 0. |
| npm run lint | exit 0; 61 files, 120 warnings / 8 infos. Not warning-free. |
| npm run verify:unsafe-controls | exit 1: 36 total, 35 detected, 1 undetected; zero failedOtherwise. W1 baseline is red, so it cannot count as detection. |
| V1 | 10,000 schedules, 5/5 pass, 0.634 s. |
| V2 | 256 real-SQLite schedules, 22/22 pass, 26.531 s. |
| Extended web V3 | 218/220 pass, 2 W1 failures, 121.857 s. Exa and Tavily SIGKILL ×100 each pass, as do cancellation/timeout/current-authority, declarations/scope/retention. Overall command exits 1, not a full pass. |

Full suite also measures early bounded V9: 400 saves/two clients/100 workflows, acknowledgement p95 92.299 ms, snapshot p95 2.905 ms; V4 reattach 132 ms. Not full four-stream V9. Retention/negative V8 journey remains green within current staged capabilities. Role/web recovery package generation remains explicitly unsupported on this target. Exact retained bytes, not refetch, repair damaged references.

## W1 cause and unresolved choice

Exa's published reference (fetched during this session): https://exa.ai/docs/admin/error-codes.
Relevant literal rows:
- 401 Unauthorized: “The API key is missing or invalid.”
- 402 Payment Required: “Credits are exhausted or a spending budget was exceeded.”
- 429 Too Many Requests: “Your API key, team, or network exceeded a rate or concurrency limit.”
It identifies NO_MORE_CREDITS, API_KEY_BUDGET_EXCEEDED and TEAM_BUDGET_EXCEEDED as 402 tags. These are external documentation facts, not live-provider verification.

Pinned installed sources:
- exa-js/dist/index.js: ExaError receives response.status as statusCode.
- webfox/dist/chunk-U4BLULLV.js: asWebfoxError computes retryable from selected status values and connection errors, then drops status/tag/cause. toJSON emits only code/message/retryable.
- webfox/dist/application-types.d.ts: supported CreateWebfoxOptions exposes config/configPath/cwd/env, not a transport/error observer.
- probe-status.ts drives that public root with identical error messages and different status/tags. probe-status.log retains the complete returned documents; there is no remaining status distinction.

Do not guess eligibility from mutable error messages or admit every PROVIDER_FAILURE: that violates the required unknown/invalid/page-failure refusal. No dependency lock, SDK, global fetch, transport observer, backend or public macro interface was changed. Upstream-rejected 401 keys remain ineligible; locally absent keys still permit fallback. This limitation is explicit in docs and a self-contained source comment.

Decision requested: approve a narrowly reviewed supported dependency change exposing HTTP status (requiring explicit pin/lock review and re-verification), or explicitly authorize a request-scoped transport-status observation mechanism under the existing pin. Recommend the supported dependency route rather than silently coupling Render to transport internals. No candidate release has been selected or verified. If the fixed pin must remain with supported root-only consumption, leave W1 blocked; do not weaken B1 by calling it complete.

Live auth/quality, paid spending, Linux, full later-feature V8/V9 and human handover judgment remain unverified. This pause creates no routine approval gate for web requests.
