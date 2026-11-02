# Indistinguishable refusal fallback evidence

Verifier: implementer, Claude Code / claude-opus-5-5, macOS, Node 24.21.0. Actual locked Webfox 4.8.0 / exa-js 2.27.0 / @tavily/core 0.7.14, Durable/AI/Chord 1.4.0, real owned HTTP and SQLite, controlled external responses and model fixtures. No live provider request, key, paid trial, Linux run or independent review.

Failure cases: `docs/verification/scoped-web-research-decision.md`, committed with the tests in c2be65a0e5b7f147788eb88bee929bc7e64fdce0 before the classifier change in c365c3a7c1b185c1fb95d69d62a9f06f1c238ee2. On c2be65a ten of the nineteen selected scenarios failed on their intended assertions, not on setup.

| Command | Source | Result | Log |
|---|---|---|---|
| `npm run verify:unsafe-controls` | 1df7ebd906621b764d7e83ac8d2318697f278f2a | exit 0, 44 controls, 44 detected, 0 undetected | `controls.log` |
| `RENDER_V3_REPETITIONS=100 npm run verify:scoped-web-research` | 1df7ebd | exit 0, 229/229, SIGKILL at each provider 100 times after an HTTP 402 primary | `web-v3.log` |
| `node --test test/web-error-boundary.test.ts` | 1df7ebd | exit 0, 1/1. Diagnosis of the root collision, not a fallback check | `root-boundary.log` |
| `npm run verify:kernel-authority-schedules` | 66a2f7d3e1f821543b823ad718b459ae0cfda0bb | exit 0, 5/5, 10,000 schedules | `v1.log` |
| `npm run verify:sqlite-command-atomicity` | 66a2f7d | exit 0, 22/22, 256 schedules | `v2.log` |

Between 66a2f7d and 1df7ebd, product source changed only by renaming one private function in `src/engine/web.ts`; V1 and V2 do not exercise it. The controls first ran on 66a2f7d and four baselines failed there, because merged target tests predated the mandatory `supports` declaration. f1201ca359b695110cc46318f08ee8351172bb56 added the declaration to those tests, and the rerun detected all 44.

Fixture bodies are controlled responses, not captured live errors. This evidence does not measure how often a fallback is unnecessary, and does not prove live Exa/Tavily auth, quality or spending, Linux behavior, full future V8/V9 or model judgment. Other extended role, recovery and off-host jobs were not rerun; their cheap suites run in the Full Gate.
