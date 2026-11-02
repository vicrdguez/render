# Decision-specific fallback verification — before product changes

Source before this round: 335c74ed93de3ae2b11d1ffb69d76067147e7494.
Decision: ledger 8eb4de475c30c4d9bf12100138725ac2b12bf532, scoped-web-research/decision.md.

The decision accepts uncertain eligibility at the supported Webfox boundary, prohibits a dependency upgrade/transport interception/provider framework for this ambiguity, and explicitly requires reporting a tested collision with a category B1 excludes. It does not authorize silently removing invalid-input, unsupported-semantics or page-specific exclusions.

## Failure cases and literal outcomes

1. HTTP 402 allowance refusal must admit exactly one sequential Tavily attempt for search and contents. Keep the existing registered-tool regressions and unsafe control. Preserve the Exa failure; any new broad classifier must report eligibility uncertainty, not claim a known HTTP status or exhausted credits. Existing cancellation, authority, deadline and unsettled-request checks remain required.
2. A provider HTTP 400 INVALID_REQUEST_BODY refusal is an invalid request, explicitly excluded by B1. With both keys configured, registered web_search/web_contents must make only the Exa request, retain its error, and return fallback=ineligible. The fixture's human-readable message is generic; the provider status and tag carry the classification. This tests information loss, not a claim that a live service currently emits this exact text.
3. Use actual locked Webfox and SDKs against an owned HTTP server to compare 400 INVALID_REQUEST_BODY and 402 NO_MORE_CREDITS with equal human-readable messages. Observe the entire public root error, not just Render's code mapping. Literal predicted error in each case: {code: PROVIDER_FAILURE, message: Request rejected, retryable: false}. If equal, report the specific invalid-request collision required by the decision, not a product pass.
4. Probe documented HTTP-200 contents statuses/CRAWL_NOT_FOUND separately. Expect a failed root result, with message No content returned for this URL. and no retryable field. Do not falsely equate this to the nonretryable request-level error.
5. Probe unsupported local URL scheme at the supported root, expecting no HTTP request and INVALID_INPUT. This distinguishes an observable excluded category from a lost upstream distinction.

## Targeted control and evidence semantics

Add web-ambiguous-invalid-fallback to the existing unsafe-control harness. In a disposable source copy only, admit nonretryable PROVIDER_FAILURE as well as retryable failures. The registered-tool invalid-request check must fail on the explicit no-fallback assertion with a green baseline. Keep web-allowance-refusal: its existing red baseline is not detection.

B1/A1/decision: root collision diagnostic plus registered refusal and broadening control. B2/B3/B5: existing deadline/cancellation/provenance/scope checks. B4/A2: unchanged retained evidence/history checks. A3/T1: these cases, tests and control precede any product edits. A4/T2/T3: if collision blocks the classifier, pause before target integration/Audit/Watchdog rather than claiming completion.

No live provider credentials, paid requests, model judgment, Linux behavior or full future V8/V9 are proved. Provider semantics reference: https://exa.ai/docs/admin/error-codes (400 invalid body/query/options, 402 credits/budget, 200 contents statuses are page-level failures), retrieved this session.
