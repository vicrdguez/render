# Indistinguishable refusal fallback — failure cases before product changes

Source before this round: 57967ea553b86ff1d7cbe01fd46741a4282b32be.
Human decision: a settled provider error indistinguishable from Exa allowance exhaustion at the supported Webfox boundary is eligible for one best-effort sequential Tavily fallback, even when a controlled test shows the underlying response could have been an invalid-request refusal. The human accepts that this can produce an unnecessary, potentially charged request. It supersedes the invalid-request exclusion recorded in `scoped-web-research-ambiguity.md`, only for refusals whose category Webfox has erased.

"Indistinguishable" means `{code: "PROVIDER_FAILURE", retryable: false}`. The message is not a classifier: it is provider-controlled text and the root diagnostic shows equal text for different categories.

## Failure cases and literal outcomes

1. Exa HTTP 402 NO_MORE_CREDITS and HTTP 400 INVALID_REQUEST_BODY, search and contents, both keys configured. Literal requests: `/exa/search` then `/tavily/search`, or `/exa/contents` then `/tavily/extract`. Observations: Exa `error`/`PROVIDER_FAILURE`, Tavily `success`. Input fallback: `completed`.
2. The Exa observation in 1 says `Fallback eligibility uncertain`. It never claims a status or reason: no `400`/`402` in the uncertainty, no provider tag or message anywhere in the observation. The Tavily observation carries no eligibility uncertainty.
3. Exa HTTP 400/401/403/404/418 with no Tavily key: one request, fallback `credentials_missing`, eligibility uncertain. HTTP 503 with no Tavily key: one request, `credentials_missing`, no eligibility uncertainty, because Webfox marks it retryable. HTTP 429 fallback is likewise not uncertain.
4. Exa HTTP 402, Tavily HTTP 402: exactly two requests, fallback `failed`, both observations `error`, no third provider, no retry, no eligibility uncertainty on Tavily.
5. Page failure identifiable at the root (Exa HTTP 200 with a `CRAWL_NOT_FOUND` status, no `retryable` field), both keys configured: only `/exa/contents`, fallback `ineligible`, no eligibility uncertainty.
6. Input Webfox rejects locally (`file:///private/example` at `research`), both keys configured: zero requests, `INVALID_INPUT`, fallback `ineligible`, no eligibility uncertainty.
7. Mixed contents batch with success, usable partial, page failure and HTTP 402, with Tavily refusing: `/exa/contents` four times then one `/tavily/extract`. Only the 402 input reaches Tavily. Partial stays final; the page input stays `ineligible`.
8. Safeguards hold after an uncertain refusal, not only after 429. Overall deadline expired after Exa HTTP 402: one request, fallback `overall_timeout`. Remaining time: two requests, `completed`. Cancellation during Exa HTTP 402: one request. SIGKILL at Tavily after Exa HTTP 402, then restart: two requests in total, startup refuses with `uncertain_execution`.
9. Fallback evidence retained after Exa HTTP 402 keeps the Exa failure and the eligibility uncertainty in the exact retained revision.

## Controls

- `web-allowance-refusal` restores the former retryable-only rule. The documented-allowance check must fail on its request assertion.
- `web-page-failure-fallback` admits every `PROVIDER_FAILURE`. The page-failure check must fail on its no-fallback assertion.
- `web-eligibility-uncertainty-erased` removes the uncertainty. The documented-allowance check must fail on its uncertainty assertion.

`web-ambiguous-invalid-fallback` is removed: the behavior it treated as wrong is now the decided behavior. `web-fallback-after-cancel` and `web-expired-deadline` now also run against the HTTP 402 scenarios.

## Limits

Fixture bodies are controlled responses, not captured live errors. Any settled request-level failure Webfox reports as nonretryable takes this path, including invalid-key refusals, feature refusals and SDK errors that have no HTTP status. No live Exa/Tavily auth, quality, frequency of unnecessary fallback, spending or Linux behavior is proved. The robust classification is tracked separately in https://github.com/vicrdguez/render/issues/41 and is not part of this slice.
