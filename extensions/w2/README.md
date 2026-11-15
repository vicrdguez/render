# W2 forecasts

W2 is a sample workflow for testing Tau's core, not a product. It records forecasts, asks a human to resolve them, and reports calibration.

| Option | Meaning |
| --- | --- |
| `model` | Model for the forecasting agent, in `provider/modelId` form |

| Kind | Name | Purpose |
| --- | --- | --- |
| Tool | `record_forecast` | Record a probability, resolution time, and rule |
| Tool | `revise_forecast` | Replace an unsettled forecast |
| Tool | `calibration` | Summarize scored and replaced forecasts across the project |
| Task | `w2.due` | Wait until the forecast is due and request a decision |
| Task | `w2.score` | Apply the human answer |
| Decision | Resolve forecast | Choose `yes`, `no`, `void`, or `not yet` |

1. The agent records a forecast and W2 schedules a background task.
2. When it is due, W2 asks the human to resolve it.
3. A yes or no answer records a Brier score. Void records no score. Not yet schedules another request seven days after the answer.

To try it, install `w2` with the [installer](../../docs/extensions.md#install-an-extension), start a local server, and add it to a project. Set its model through a client, create a conversation with W2, and ask for a forecast. See [Host](../../docs/host.md) for project calls.
