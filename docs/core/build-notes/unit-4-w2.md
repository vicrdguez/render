# Build notes for unit 4

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Forecast keys | Project keys or conversation-local keys. | The subject is `w2:<conversation>:<key>`. The Book map uses the full subject. | Candidate 2 and verdict item 23 require conversation qualification. The timer carries the same key it looks up. |
| Book state | Keep a timer and round in every state or keep only the live reference. | A waiting forecast has a timer. An open forecast has a round. A settled forecast has neither. | The union prevents stale references from looking live. The latest entry remains in every state. |
| Book history and forks | The walk names a conversation document but gives no history settings. | `history: "latest"` and `fork: "current"`. | Candidate 1 supplies the required pi-durable settings. This build does not design forked workflow behavior. |
| Tool arguments | The notes fix the forecast data but not its tool schema. | Use candidate 2's key, text, probability, integer epoch deadline and rule. No key regex or length cap. | It avoids candidate 1's extra limits. pi-schema rejects probabilities outside zero to one, unknown fields and noninteger dates. |
| Record and revision state | Replace any key or refuse accidental duplicate records and settled revisions. | Record needs a new key. Revise needs an existing unsettled forecast. | A settled forecast has immutable scoring history. A new claim can use another key. The tools enforce this without trusting prose. |
| Human basis text | Store only the claim or include the facts that the human resolves. | Append the probability's agent attribution, deadline and rule to the claim text. | A generic client reads only text. The walk requires the entry to say whose estimate it is. |
| Publishing result | Continue the model after publishing or end the run. | Both publishing tools return `terminate: true`. | A stored receipt can finish an interrupted publication without a model call. The human sees the durable forecast and event. |
| Receipt reads | Return the document draft or copy its saved result. | Copy the forecast ID while inside the commit. | pi-durable closes the draft overlay at commit end. Returning that proxy broke the killed-tool tests with `Cannot use a settled overlay`. |
| Event names beyond resolved and voided | The walk requires events but leaves their names open. | Use candidate 1's recorded, revised, asked and rescheduled names under `w2.`. | They name the commits a generic client needs to show. Revised also supplies the replaced count in calibration. |
| Brier score precision | Round to an unstated precision or retain JavaScript arithmetic. | Store `(p - outcome) ** 2` without rounding. | The design names the formula, not a rounding policy. Tests compare the locked examples with a small numeric tolerance. |
| Calibration output | A count only or a comparison of probabilities and outcomes. | Count scored and replaced forecasts, then report mean Brier score, mean stated probability and observed yes rate. | The tool answers the workflow's comparison question from the full project event log. Empty history reports no scores. |
| Extension module type | Import the parallel host package or check the structural contract. | Export extension, entry, options and W2Options only. Print and inspect the emitted module. | The locked ExtensionModule is structural. This unit must not import the host. |
| Package registration | Add another boundary entry or reuse the existing one. | Add the package manifest, root TypeScript reference and lock entry. Keep boundaries unchanged. | The base already registers tau-w2 and its test-only store authority. |

## Failure coverage

| Failure | Test | File |
| --- | --- | --- |
| Forecast, timer or event is absent, or the probability has no attribution | walk rows 1 to 15 | packages/w2/test/forecast.test.ts |
| Timer calls a model or asks about the wrong basis or choices | walk rows 1 to 15 | packages/w2/test/forecast.test.ts |
| Not yet uses execution time rather than stored answer time | walk rows 1 to 15 | packages/w2/test/forecast.test.ts |
| Replaced timer asks or emits | walk rows 1 to 15; SQLite SIGKILL stale | packages/w2/test/forecast.test.ts; packages/w2/test/recovery.test.ts |
| Revision leaves a decision open | revision withdraws an open round at once | packages/w2/test/forecast.test.ts |
| A wrong timer or obsolete score acts | revision withdraws an open round at once | packages/w2/test/forecast.test.ts |
| Yes or no has a wrong Brier score | walk rows 1 to 15; no settles once | packages/w2/test/forecast.test.ts |
| Void emits a score | void settles once | packages/w2/test/forecast.test.ts |
| A recreated score or equal answer repeats an effect | no settles once; void settles once; SQLite SIGKILL score-before and score-after | packages/w2/test/forecast.test.ts; packages/w2/test/recovery.test.ts |
| Stop aborts a timer or conversation keys collide | Stop leaves background timers alive | packages/w2/test/forecast.test.ts |
| Calibration misses later pages, other conversations or replacements | calibration pages all project events; walk rows 1 to 15 | packages/w2/test/forecast.test.ts |
| Entry ignores changed options or exposes other tools | entry reads current options | packages/w2/test/forecast.test.ts |
| Invalid tool data, duplicate record or missing revision writes | tool boundaries reject invalid probabilities and dates | packages/w2/test/forecast.test.ts |
| Tool replay loses its receipt or duplicates a forecast or revision | SQLite SIGKILL record and revise | packages/w2/test/recovery.test.ts |
| Overdue timer never asks after process death | SQLite SIGKILL overdue | packages/w2/test/recovery.test.ts |
| Score commit does not recover atomically | SQLite SIGKILL score-before and score-after | packages/w2/test/recovery.test.ts |

## W2 walk coverage

| Rows | Test | Storage |
| --- | --- | --- |
| 1, 2 | walk rows 1 to 15 | MemoryStorage |
| 3, 4 | walk rows 1 to 15; SQLite SIGKILL overdue | MemoryStorage and killed SQLite child |
| 5, 6 | walk rows 1 to 15 | MemoryStorage |
| 7, 8 | walk rows 1 to 15; revision withdraws an open round at once | MemoryStorage |
| 9, 10 | walk rows 1 to 15; SQLite SIGKILL stale | MemoryStorage and killed SQLite child |
| 11, 12, 13 | walk rows 1 to 15; SQLite SIGKILL score-before and score-after | MemoryStorage and killed SQLite child |
| 14, 15 | walk rows 1 to 15; calibration pages all project events | MemoryStorage |

## Limits

No real model call, network provider, HTTP host journey, workflow upgrade, forked workflow, power loss or week of real time is tested. The package uses the real pi-durable harness, store, SQLite and process death. The human-answer tests call the host-only store export through the existing test-only boundary allowance. The store owns recovery of a faulted continuation on an equal answer. W2 tests recreate its score task directly and kill it before and after its scoring commit.
