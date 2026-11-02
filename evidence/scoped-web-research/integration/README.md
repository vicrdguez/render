# Current-target integration evidence

Verifier: implementer, Claude Code / claude-opus-5-5, macOS, Node 24.21.0. Actual locked Webfox 4.8.0 and Durable/AI/Chord 1.4.0, real owned HTTP and SQLite, controlled external responses and model fixtures, real Docker with a local `node:24-alpine` fixture image for the owned-source rows.

Source for every row: `cf3e0f5407d2fbe8818802a3dc96f3af8c242106`, the merge of target `d4ff78afebee5e4f77d3db5cb8fd261835428068` plus formatting of one merged type. Later commits change only `docs/protocol.md` wording and this retained evidence.

| Command | Result | Log |
|---|---|---|
| `npm run verify:unsafe-controls` | exit 0, 49 controls, 49 detected, 0 undetected | `controls.log` |
| `RENDER_V3_REPETITIONS=100 npm run verify:scoped-web-research` | exit 0, 229/229 | `web-v3.log` |
| `npm run verify:kernel-authority-schedules` | exit 0, 5/5, 10,000 schedules | `v1.log` |
| `npm run verify:sqlite-command-atomicity` | exit 0, 22/22, 256 schedules | `v2.log` |
| `npm run verify:linux-profile-owned-check` | exit 0, 14/14 | `owned-profile.log` |
| `npm run verify:literal-source-roundtrip` | exit 0, 22/22 | `owned-literal.log` |
| `npm run verify:whole-container-quiescence` | exit 0, 17/17 | `owned-quiescence.log` |
| `npm run verify:source-root-crash` | exit 0, 7/7, default repetitions | `owned-crash.log` |
| `node --test test/web-error-boundary.test.ts` | exit 0, 1/1. Diagnosis of the root collision, not a fallback check | `root-boundary.log` |
| `npm run verify:web-negative-journey` | exit 0, 1/1 | `journey.log` |

Not run: `verify:source-root-crash` at `RENDER_V3_REPETITIONS=100`, and the other extended role, command-crash, recovery and off-host jobs. Their ordinary suites run in `npm test`. Nothing here proves live Exa or Tavily auth, quality or spending, Linux host behavior beyond the Docker fixture, full future V8/V9 or model judgment.
