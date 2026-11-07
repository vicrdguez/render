# render-host

The adapter boundary between typed `render-core` commands/events and a future host transport.
**No final Render host protocol has been accepted.** This crate does not guess endpoints,
authentication, HTTP behavior, or public wire formats.

## Adapters

`HostAdapter` exposes `format`, `connect`, `poll`, `prepare`, `transmit`,
`query_receipt`, `subscribe`, and `fetch`. Errors are typed `AdapterError` values
implementing `Display` and `std::error::Error`.

- `DisconnectedAdapter::default()` is unconfigured: all operations except `format`
  and `poll` return `MissingProtocol`; polling yields no fake live state or receipts.
- `DemoAdapter::new(initial: Vec<Inbound>)` is an explicitly local simulator. Pass
  `demo_data::snapshots()` as the initial frames. Connecting emits Connecting, a
  labelled local-demo Live event, then the supplied frames unchanged. It does not
  send commands, perform host work, open URLs, or merge anything. Connecting again
  is idempotent. No network or filesystem I/O occurs in either adapter.

The demo owns a typed `HostSnapshot`, updated through `reduce_host`, and an event
queue. `fetch` and `subscribe` reconstruct full *current* scoped snapshots, including
objects, index resources, references, and unsupported-resource notes. Missing scopes
are errors; subscription validation is all-or-nothing.

## Private demo envelope

The only demo format is `render-desktop-demo/1`. `prepare` encodes a JSON object with
`format`, numeric `version: 1`, and a typed `intent`. Core supplies command IDs.
Format, version, ID and command/body agreement are checked at transmission. This is
not a public Render protocol and is not suitable for a real host.

Persist the returned `PreparedCommand` before transmitting. Retries transmit its
original bytes, never a re-encoded intent. The simulator retains those exact bytes
alongside the first outcome. An identical accepted retry returns `Duplicate` with
the original ledger sequence; different bytes under that ID return
`CommandConflict` without changing state. Queries return the original receipt or
`NotFound`, never execute a command, and never establish that an unknown command
was safely unsent. Demo receipts and state live only for the adapter's lifetime.

## Simulated writes and limitations

Writes check connection/admission, epoch, target and envelope scope. Authority also
checks the exact expected basis, subject, option and action availability. Mutations
are staged on an object clone so a refusal cannot partially change domain facts.
Accepted writes emit a matching object-scope update before the receipt; its ledger
cursor reaches the receipt sequence, allowing core draft settling.

Supported local effects:

- Replace annotation sets on the exact emission and annotation-set revision.
- Append chat prompts/follow-ups or pending steers; interrupt an exact running turn.
  Changed/ended turns produce the corresponding non-acceptance receipt. No model
  responds and pending steers are not falsely marked delivered.
- Review approval/rework records an explicitly demo-only review status, consumes
  the matching decidable and removes its Needs-you row. It does not advance work.
- Decision answers retain the selected option as a demo-only answer.
- Routing edits accept existing editable route names and `human`/`delegated` values.
- Policy revision edits change existing policy fields and the local demo default;
  workflow bindings are not adopted. These settings effects consume their decidable.

Other effects explicitly return `Refused`, including CreateDesign, adoption,
verification-prompt generation and edited-byte saves. `Review.text` is immutable
emission content, and the current model has no separate saved edited-concern field;
the adapter must not overwrite the emission or fake acceptance. Missing expected
bases are refused; changed supplied authority bases return `StaleBasis`. Ordinary
annotation revision mismatches have a named refusal. Unmarked/user-provided free
text is stored as `Text::Content`, not host-authored chrome.

The simulator is not an authority or durability implementation. Review simulation
uses the model's fidelity/status field rather than inventing workflow execution.
It provides no real authentication, scheduling, publication or integration.

## Focused verification

From `desktop/`: `cargo test -p render-host --test adapter`.
The adapter tests are independent of the production demo fixture catalog. They
cover disconnected refusal, connection/frame preservation, envelope validation,
exact-byte duplicate/conflict behavior, pure receipt queries, current snapshots,
stale authority bases, and draft-safe chat turn refusal/update ordering.
