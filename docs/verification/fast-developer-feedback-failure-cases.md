# Fast developer feedback: failure cases and independent expectations

Written before remediation (AGENTS.md rules, T1). The historical test audit is a starting investigation; each case was revalidated against integrated source `306c801`. Source-specific dispositions and measurements belong in implementation/review reports; raw output stays outside the source tree.

## Selection and gates (B1, B2, B6)

- S1: `npm test` runs a load, repeated-fault, disk-image or container workload. Expected: inspected selection contains none, and it passes with Docker stopped.
- S2: a retained test file leaves `npm test` and joins no other command. Expected: every retained case belongs to the fast, integration or performance selection. Deliberately retired dependency, registry, shape, prompt and configuration checks are no longer part of that inventory.
- S3: a catalog row, script or unsafe control names a moved file or case and silently selects nothing. Expected: every `verify:*` script runs at least one test, and every unsafe control's baseline passes on its targeted check.
- S4: a fast pass is reported as the full gate. Expected: the catalog, README and guidance state that `npm test` is not cumulative, and the gate commands are distinct.
- S5: a failure in a broader check is hidden by the chain or a cached result. Expected: the gate exits nonzero when any selected check fails, and the failed name is visible. Checked by making a real selected check fail in a temporary copy.
- S6: a missing prerequisite reads as a pass. Expected: Docker-backed checks still fail visibly without Docker or the image; the disk-full case still reports `skipped`, never pass.
- S7: extended counts are replaced by smoke. Expected: V1 10,000, initial V2 256 and two-process ownership, and V3 2 repetitions per named critical point (operator decision, replacing the spec target of 100) remain selectable; `test:extended` requests them explicitly.

## Harness and setup (B2, B3)

- H1: the disk-full check clears its deadline by dropping the deadline, so a host that never stops passes or hangs. Expected: a host that stays up after storage failure fails with `host must stop after a storage failure`. Unsafe control.
- H2: the disk-full timer still holds the test process open after a prompt exit. Expected: file duration falls to about the sum of its test bodies.
- H3: replacing the stalled-observer sleep loses the disconnect oracle. Expected: `slow-consumer-kept` still fails with `the stalled stream must have been disconnected by the host`, after the same 1,500 commits and real paused socket.
- H4: a role-wait regression is reduced below its trigger. Expected: R11 still performs eight unclean kills for both modes; no ordinary-restart check is substituted.
- H5: idle observation is treated as waste. Expected: R10 keeps its settle and observation windows, zero idle WAL writes and the separate-process watchdog.
- H7: a web status moved to `research` loses the supported root. Expected: real Webfox 4.8.0 and owned HTTP, one request per status, literal fallback and uncertainty results; a registered-tool journey remains for wiring and provenance.
- H8: Git-only refusals keep requiring Docker, or Git semantics are mocked. Expected: refusal cases pass with Docker stopped using real `git`; materialization, execution and quiescence keep actual containers.
- H9: fast concurrency shares state or starves a timing assertion. Expected: repeated runs pass with no leftover temp stores or owned processes; latency-bearing checks stay serial and out of the fast selection.

## Weak witnesses (B4)

Each strengthened check must reject the intended wrong behavior for its own reason. An import, setup or unrelated failure is not evidence.

- W1 same-family review: the parent must reach `request_role`, receive `capability_unavailable` naming recorded human policy direction, and create no child. Wrong behavior: the role never ran, or was refused for another reason.
- W2 capability refusal: literal blockers `native_provider_configuration_missing`, `required_model_family_unavailable`, `sandbox_capability_unavailable`, `required_inputs_do_not_fit`. Zero provider calls only count in rows where the provider is installed. Wrong behavior: any other blocker satisfies a row.
- W3 web host configuration: each forbidden argument must be refused by tool validation naming the forbidden property, with zero HTTP calls. Wrong behavior: an unrelated early failure, or the argument being accepted and ignored.
- W4 child non-execution: no parent-process variable is presented as observing a child. The durable record stays `pending` with no abort request after the refused start.
- W5 unused backup copy: removed. The title claims compatible reopen, not restore from backup, and the catalog says so.
- W6 pending-policy title: names the pending-packet behavior it establishes. Completed-review preservation stays with the completed Watchdog case.
- W7 V1 generated decisions: every generated step is compared with an expected decision derived from the literal matrix and test-owned model. Wrong behavior: an eligible command refused for an ordinary reason, or a refusal with the wrong ordinary code. Reachability counts and 10,000 schedules stay.
- W8 workflow-task-survival R02: the scoped submission is actually accepted, retrying its command returns the same receipt as a duplicate, a new submission call is rechecked and refused, and a stale worker is refused and learns no receipt. Wrong behavior: a retried submission gets a second report or a second call is accepted.

## Timing (B5)

- T1: a single run, or a mixed-source pair, is presented as before/after. Expected: repeated runs per selection, with source, command, environment and method named.
- T2: 15 seconds is claimed without a measurement supporting it. Expected: actual timings and residual costs are reported whether or not the objective is met.
