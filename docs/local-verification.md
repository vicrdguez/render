# Copyable advisory local verification

An authenticated human can request grounded Markdown through the existing command and artifact interfaces. Render does not launch a model, local agent, worker or verification task for this request.

1. Observe a fresh snapshot. Choose an exact source ref from this workflow's retained `assignments`: an `investigationSource` observation, or a trusted owned-check `report`. Human/agent prose and branch names are not source observations.
2. Send the ordinary command envelope with `workflow`, a new `commandId`, and:

```json
{
  "type": "requestLocalVerificationPrompt",
  "source": "revision:42",
  "expectedSequence": 57
}
```

The numbers above illustrate refs, not a usable request. `expectedSequence` is the snapshot sequence, not a source commit. It deliberately binds the entire retained snapshot, including current authority, Contracts, decisions, findings and input selection. Any intervening acknowledged command (even in another workflow) can make a new request stale. Observe again rather than reusing the old sequence. An older source observation may be explicitly selected with a fresh snapshot; this does not make its Linux evidence current for some newer source.

3. The accepted receipt's `result.textArtifact` names immutable Markdown; `source` and `basisSequence` identify the request basis. Read it through the existing artifact interface. Copy it to a human-chosen local environment if desired. On an uncertain/lost reply, retry the **original envelope and command ID**, not a new request. Same-human authorized devices recover the original receipt even after inputs change; revoked or out-of-scope devices cannot.

Every new request retains a new document and receipt. History/export includes the original bytes, explicit input refs/digests, policy binding and source identity. There is no mutable latest-prompt pointer or completion record. Retention uses the ordinary atomic SQLite commit and same-store restart semantics; missing/corrupt/unsupported inputs block with exact restoration information. The source, workflow authority, assignments and check outcomes remain unchanged.

## Grounding and limits

Ledger resolves scoped current documents, existing role inputs/source observations/results, accepted intake/Contract sources, checkpoint decisions/concerns and coordinator messages. Engine renders those immutable inputs without I/O. Source observations and trusted runner receipts are distinguished from unverified human/agent assertions. An accepted Contract is identified by retained acceptance state, not by interpreting prose. Source documents, findings and messages remain inert quoted data; instructions inside them do not grant authority.

Investigation observations contain only the paths that investigation actually retained. Owned-check receipts contain exact manifests and, for catalog checks, selected catalog tasks/results; they do not contain arbitrary repository bytes. The prompt never reads Git, discovers new files, contacts a Forge or infers missing setup. Missing commands, signing credentials, fixtures, permissions or provenance require a local stop/report. Known task/receipt fields are quoted rather than interpreted as a successful setup or a macOS pass.

There is no publication/release-observation producer in this host version. Publication availability and verified release/source mappings are explicitly unknown. A release offer saved in a scoped document retains its version/platform/architecture/digest claims as **unverified assertions**, not a verified mapping or exact-source pass. No source/publication dependency is added to requesting advice.

Actual Linux OS/CPU/source/verifier results apply only to their cited inputs. Same CPU does not imply Linux-binary portability to macOS. Native dependency/framework behavior, packaging/signing/install, UI and accessibility remain unrun unless the human/local agent actually checks them. The brief requests identity verification first, a non-live clone/installation, available project tasks/tools, expected-versus-observed reporting, failures/unrun checks and optional evidence with secrets removed. Only a human merges main.

Findings may be pasted into an existing coordinator message/document. There is no automatic import, attestation, laptop enrollment or remote-control protocol. Unperformed advice never gates ready promotion or invalidates human merge; the missing delivery/readiness capabilities are not implemented or simulated by this slice.

## Verification and handover

`npm run verify:local-verification-prompt` covers real Git/SQLite input capture, two authenticated HTTP clients, refusals/replay, immutable regeneration, integrity failures, export/reopen, and actual Linux catalog evidence. It is not a live model, Forge, human-judgment or native-Mac trial. Unsafe controls target stale acceptance, false Linux/Mac equivalence and an introduced advisory-completion blocker.

The available shortened V8 chain is source investigation → retained finding → human prompt → pasted feedback → regenerated prompt → exact historical export/reopen. The full design/delivery chain still needs the later experiment, Record, verification-authoring/maintenance, rework, integration/publication/ready and human-merge producers. Do not concatenate independent successes into a full-product pass. The existing handover answers (commitment, owner, evidence, blocker, next human action) do not change on generation. The separately authorized ≤2-minute human judgment trial is unrun; optional physical second-device and Mac/UI observations are nonblocking.
