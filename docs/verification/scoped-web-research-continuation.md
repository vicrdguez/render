# Scoped web research continuation: test-first oracles

This continuation follows the recorded human decision. Earlier late-test history is unchanged; it is not retroactively test-first. This document and the continuation tests/controls precede the next product edits.

## Explicit report declaration

Use the existing `supports` list, made mandatory. `supports: []` explicitly declares no web reliance; a nonempty list declares the exact promoted revisions required by the report. Omission is not a declaration and must refuse at the registered tool, Ledger parser and pure Kernel boundary. This avoids a second flag that could contradict the list. It does not automatically judge prose truth or selection sufficiency. Reports must list every relied-on source, including relevant negative/conflicting passages; a source not yet retained must be promoted first. Historical reports remain unchanged and must not acquire a retrospective declaration.

Literal oracles, through owned interfaces:
- Kernel omission: `invalid_content`, no writes; empty explicit list: accepted, report result `webEvidence: none`; retained own ref: accepted, `webEvidence: retained`, `support0` exact ref. Unknown/foreign refs: `missing_content`.
- Registered submission omission: tool error and no report; corrected `supports: []` accepts. Ledger omission/null/string/oversized list: `malformed_envelope`. Valid empty list works without any web call.
- Real retained evidence: a working handle or unrelated revision refuses `missing_content`; deleted or corrupted evidence refuses `content_corrupt` with the exact restoration ref in its reason, never auto-refetch. Restoring the original bytes permits the original explicit support list. Export/reopen keeps the declaration, report bytes and support refs. Unknown historical declarations are not defaulted.

## Remaining web permutations

- One four-input contents batch: complete success, usable bounded partial text, page error, allowance error. Literal provider order is Exa, Exa, Exa, Exa, Tavily; input identities/order remain; successful/partial inputs are never topped up. Final result partial and both failed provider observations remain when Tavily fails.
- Missing primary key: explicit primary-not-attempted reason; one Tavily request. Missing both keys: no request. No secrets appear even when owned HTTP content echoes them.
- Fake Date clock advanced at the controlled primary response: expired overall deadline means no fallback; remaining time after a settled allowance failure permits one fallback. This is not a settled-timeout assertion: pinned Webfox exposes no SDK settlement signal, so all timeout outcomes remain uncertain and prohibit fallback, with or without remaining overall time.
- Explicit caller abort/current revocation already has an actual registered-tool cancellation check; primary and fallback SIGKILL checks each exercise their named boundary once. Extend timeout to both remaining-time cases and assert later inputs are not attempted.
- Negative evidence journey additionally observes original native committed output after working expiry/reopen. Retained selection must include the working envelope's completeness/omission qualifications, not just the selected text.

Unsafe controls: omission accepted by Kernel, support-integrity verification bypassed, fallback after overall expiry, partial success topped up, plus the existing fanout/cancel/provenance/identity/cache-deletion controls. Require green baseline then intended assertion failure; setup errors never count.

Verification uses actual Webfox 4.8.0, Durable 1.4.0 and SQLite with owned HTTP/model fixtures. Run cumulative V1 (10,000), targeted SQLite V2 (256), V3 primary/fallback interruptions (one per named cut), existing role and command interruption checks, scoped history/export/load/reattach and current V8 negative journey. Future complete V8/V9, live auth/quality/Linux and human judgment remain explicitly outside these observed passes.
