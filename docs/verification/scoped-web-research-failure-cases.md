# Scoped web research: preimplementation oracles

Written before product changes. Tests use real Engine/Durable/Ledger/SQLite and Webfox 4.8.0 root calls against owned HTTP fixtures, never live keys/services. These are behavioral expectations, not observed passes.

- B1: Exa success (including zero results) is final. A batch containing success, page failure and service refusal retains original order/identity; only classified unavailable/allowance inputs get one sequential Tavily request. Unknown, invalid and extraction failures never trigger fallback. No SDK or transport retry/fanout.
- B2: abort/revocation/overall expiry before fallback admits no request. A primary timeout with unconfirmed underlying settlement remains uncertain/possibly charged and cannot fall back. Unsafe Durable replay at interruption starts neither provider again. Later explicit invocation has new identity/time.
- B3: committed `output` contains substantive text, actual provider, primary failure and fallback not-attempted reasons. Identical bytes on later observations have equal digests but different identities. Bounded previews label omissions; own paging reads exact tail without network. Configured secrets cannot enter outputs/errors/cache/evidence.
- B4: expiry/restart makes the old working handle unavailable without network; committed output and selected immutable evidence remain. Selection retains exact passage/context, negative/conflicting disposition, claim, source/final URL, request, provider/version, observation/time/digest/completeness and assignment. Missing/corrupt declared support refuses report reliance; history/export retains exact prior evidence.
- B5: known foreign handle, stale generation, arbitrary host path/config/provider arguments refuse before disclosure/request. Secrets are explicit trusted config only. Web text is inert data, not instructions.

Targeted unsafe controls must detect: both-provider fanout; fallback after cancellation; erased primary failure; digest-only observation identity; cleanup deleting retained evidence. Import/setup reds are recorded separately and are not sensitivity evidence.

Existing V1–V9 checks remain applicable. Extend V3 interruption at each provider; V5 scope/secret canaries; V7 expiry versus durable retention; V8 negative evidence → declared support → report → reopen/export. Decision/checkpoint APIs unavailable in the current source must continue to refuse rather than waive evidence. Live auth/quality, Linux behavior and human judgment are not established by fixtures.
