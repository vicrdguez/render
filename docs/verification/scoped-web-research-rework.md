# Scoped web research — round-one rework, before product edits

Prior reviewed head: d763f8cef9fd7be79efe6756223d84e865848208.
Contract: B1–B5/A1–A4; W1 BLOCK and W2 NOTE retain their review identities.

## Failure cases and independent expected outcomes

1. Exa HTTP 402 (documented credits/key/team budget exhaustion) must admit exactly one sequential Tavily request for search and contents. Native output preserves Exa's failed observation and Tavily's actual result; no retry/fanout. A missing fallback key is explicit. A failing Tavily stays failed without another provider. HTTP 429 is rate limiting, not the documented allowance-exhaustion response.
2. Exa HTTP 400/403/404/418 remain ineligible, even with the same error text as 402. Do not classify unknown/page/invalid failures by free text. Existing invalid/success/partial/cancellation/overall-deadline tests remain.
3. HTTP 401 represents an upstream-rejected key, distinct from a locally absent key. Current behavior refuses fallback for 401; record that limitation rather than silently broaden the classifier.
4. Abort an actual in-flight Exa or Tavily request while its owned server handler remains blocked. Output must identify CANCELLED, outcome uncertain, settlement unconfirmed/possibly charged, and fallback reason canceled. A second input starts no request. Release the owned handler after the operation returns: upstream completion remains possible and is not claimed canceled/refunded.

## Discriminating evidence and controls

- Registered Engine/Durable/real-SQLite scenarios use actual Webfox 4.8.0 + locked SDKs against owned HTTP fixtures. Literal request paths and provider/outcome tuples distinguish W1.
- In-flight cancellation output is observed at Engine's research adapter seam: Ledger cancellation fences the role, so a revoked role cannot be relied upon to commit/consume a final tool result. No Engine/internal collaborator is mocked.
- Control web-allowance-refusal disables the existing eligible-failure classifier; its baseline must be green before detection can count. Until W1 is fixed, a red baseline is explicitly not sensitivity proof.
- Control web-cancel-uncertainty removes cancellation uncertainty; it must fail the specific possibly-charged assertion.

## Dependency boundary diagnosis

Exa's published error-code reference: https://exa.ai/docs/admin/error-codes.
402 is credits/budget exhaustion; 401 is invalid/missing key; 429 is rate/concurrency limiting.
Locked exa-js 2.27.0 creates ExaError with HTTP statusCode. Webfox 4.8.0 asWebfoxError reduces it to code/message/retryable, discarding status, tag and cause; 402 and 403 both become nonretryable PROVIDER_FAILURE. Its supported CreateWebfoxOptions has config/configPath/cwd/env, no transport/error hook. A root fixture probe must confirm equal observable errors for identical bodies with different HTTP status before declaring this blocked.

No text heuristic, global-fetch replacement, SDK patch, fork, private import, new provider framework or dependency update is authorized by this diagnosis. If the supported root does not expose enough information, retain W1 as incomplete and seek an explicit dependency/transport-boundary decision. W2 is independently repairable without that decision.
