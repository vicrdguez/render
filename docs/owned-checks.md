# Owned Linux check candidate

This slice adds trusted literal source retention and an opt-in owned-check path. Ingress and collection bounds are
not filesystem quotas: workspace writes during execution have no aggregate per-assignment bound. The recorded slice
decision excludes execution-time quota/provisioning work; availability/recovery risks are tracked separately in
[render#39](https://github.com/vicrdguez/render/issues/39), not as a dependency or acceptance gate here.

## Configuration and ownership

The trusted composition root can pass `ownedChecks` to `openHost`, or to `new Engine({ ownedChecks })`:

```ts
{
  root: "/operator-private/render-owned",
  repositories: { project: "/operator-private/project.git" },
  checks: {
    "revision:EXACT_RETAINED_PROFILE": {
      repository: "project",
      commit: "FULL_EXACT_COMMIT_ID",
      profile: {
        image: "sha256:IMMUTABLE_LOCAL_LINUX_IMAGE_ID",
        exclusions: [".git"],
        maxBytes: 67108864,
        maxEntries: 10000
      },
      argv: ["node", "--test"],
      timeoutMs: 60000,
      verifierRevision: "EXACT_VERIFIER_REVISION"
    }
  }
}
```

This is operator configuration, never a model-selected path/mount/runtime option. The check is selected only by the
assignment's exact retained profile ref. The existing `assignTask` packet uses `execution: "linux-writer"`; all other
packet inputs are retained/read as before. This bounded path executes the configured owned command, not an arbitrary
coding agent. No provider credential or model assertion is required to run it. Unconfigured writers remain blocked.
The ordinary CLI does not enable this operator-owned configuration.

Prerequisites: Node 24.21.0, the existing pinned Pi/Chord 1.4.0 dependencies, Git 2.43+ (locally 2.54.0 Apple Git), and
an actual Docker Linux runtime with the immutable local image already installed. The image must contain Node,
`/usr/bin/env`, and the configured check tools. There is no implicit image pull, submodule fetch, native Mac worker,
or host-shell fallback. Inputs must come from operator-registered trusted bare repositories, not linked worktrees.
Git uses private metadata/empty cwd, disabled global/system config, hooks and attributes, `core.fsync=all` and
explicit `core.fsyncMethod=fsync` (not macOS's default writeout-only). Parent directory names are synchronized as well.
These settings and process-kill checks do not prove physical power-loss survival or off-host protection.

## Meaning of evidence

Receipts retain exact input/result commit/tree/object format and roots, literal manifests, actual exclusions,
byte/entry counts, deletions, whole-container stop identity/generation, command/exit/output, immutable image,
Linux OS/CPU and configured verifier revision. Attribute/module changes are flagged prominently, never activated
by host Git. Git diffs disable external diff and textconv. The source is retained even if the check exits nonzero.
A changed result records `verification.status: "source_changed"`, not a pass inherited from the input. Verification
on that result requires a fresh check against its exact retained source. `passed` means the owned command exited zero
and the sealed tree matches the input, not a claim that the verifier's judgment or code is infallible.

Worker environment is cleared to PATH/HOME/LANG for both the idle process and tool calls. The worker is nonroot,
capabilities are dropped, privilege escalation is disabled, root is read-only and memory/CPU/process/tmp limits are
recorded in the implementation. Only its private workspace is writable from the host filesystem; no authority DB,
private Git, home/keychain/SSH/provider/forge/admin credentials or runtime socket is mounted. Ordinary bridge networking
can reach host/LAN/tailnet: the owned canary check actually reached the host. Reachability is not authorization;
the owned Render fixture returned unauthorized without credentials. No private-route or exfiltration guarantee exists.

Collection is bounded to at most 64 MiB and 10,000 entries. Sparse files count by literal length; hardlinks become
independent blobs. Special files, non-UTF8/non-NFC names, reserved/trailing-dot names, case-fold collisions, gitlinks,
unsupported modes, and bounds fail closed. Worker ignores never govern collection. The host-owned profile explicitly
declares disposable generated/dependency/cache paths (for example `.git`, `node_modules`, `.pytest_cache`). Collection
skips those exact encountered paths without following symlinks or traversing excluded trees, and records each skipped
root in the receipt's exclusion manifest. Absent exclusions are not reported as encountered. Exclusions overlapping
accepted-base files refuse before preparation. Intended deliverables belong outside declared disposable paths; correct
a conflicting host profile rather than hiding source or granting authority to worker ignores. Unexcluded new files
remain source. Empty collected directories are not Git content but still count toward traversal bounds.

## Interruption, quarantine and recovery limits

Seal synchronously closes execute admission, waits for admitted preparation, stops the entire container (one-second
TERM grace, then runtime force), confirms runtime identity/not-running and collects without restarting a writer.
Failure to inspect/stop or unsupported capture retains `state.json` with a quarantine reason. A timeout kills no
capacity claim: new execution/workspace reuse remains fenced. A new process loads the same journal, not worker Git.
Startup stops known interrupted writers before explicit runtime resume; interrupted work is blocked rather than
silently rerun. Cancellation fences the generation first; source work already admitted can still finish, with late
evidence quarantined rather than inheriting current authority.

Do not delete a journal or container to manufacture quiescence. Preserve its scope/runtime identity and diagnostics;
confirm the original runtime is stopped and reconcile the exact retained source before arranging a new assignment.
To reconcile a transient runtime outage, restore the same runtime service and restart Render with the same private
root and owned-check configuration. Before task resume, Engine retries `Sandboxes.stop` for the exact original
scope/runtime, imports journaled command diagnostics, records blockage for interrupted source work, and releases
capacity only after confirmed stop and evidence retention. Trusted compositions can also retry `Sandboxes.stop(handle)`
directly; its result includes original source, executions and the retained quarantine reason. This never restarts
execution or reuses the workspace. `seal(handle)` may then collect the stopped original workspace; invalid content
still refuses. Quarantine reasons remain in the private journal after successful containment.

A fresh check refused during trusted-source resolution or input/profile/authorization validation before allocation
retains its actionable blocker and records an absent environment through Ledger, releasing executing capacity. This
committed state survives reopen; cancellation then releases Slice writer ownership so a corrected assignment can proceed.
The proof is the observed refusal before allocation in that invocation, not a missing journal. If a process dies before
committing quiescence, recovery still treats an unjournaled executing scope as uncertain, never infers absence or reruns it.
A cancellation landing while trusted resolve is still running, before prepare, currently stays canceling and quarantined:
it holds capacity and Slice writer ownership even though nothing was allocated. The human slice decision waives this as a
gate; the behavior is tracked separately in [render#43](https://github.com/vicrdguez/render/issues/43).

Policy adoption while an owned command runs holds capacity until confirmed stop and refuses the pass receipt on the old
basis. The complete collected evidence stays retained as an unaccepted `owned-check-diagnostic` with its source roots,
manifests and configuration warning. The blocker keeps the adoption cause. Cancel, wait for quiescence, then schedule a
fresh check on the current binding.

Preparation journals whether runtime creation may have been issued. After preparation settles under a stop fence,
an explicit durable never-issued record confirms absence: a missing image, failed materialization or cancellation
before create releases execution capacity without permitting workspace reuse. Cancellation can then release Slice
writer ownership. The original failure remains recorded, and there is no execution/source-pass receipt. A possible
create is recorded durably before dispatch; lost responses and older journals without this marker remain uncertain.
Missing/uninspectable or identity-mismatched possibly-created runtimes remain blocked; do not replace them by name
or delete the journal. No supported operation declares an unknown runtime dead. Keep its ownership/capacity until exact containment can be
established. No capacity is released merely because a timer elapsed. Automated deletion/retention is not introduced.

Trusted source objects live under the configured private root and are pinned by `refs/render/sources/<commit>` before
Ledger receipts. A crash before the SQL reference may leave harmless unreferenced roots; they convey no authority.
`Effects.reconcile` verifies exact roots/tree/blobs and refuses missing/corrupt/different objects. Restore exact bytes,
never substitute another revision. Keep this directory with the authority store; no off-host source backup is claimed.

Each admitted command has a durable private execution journal before dispatch, updated with its actual result before
source rooting. Engine also retains immutable `owned-check-diagnostic` documents through Ledger before collection/rooting;
these identify the original scope, input, command/output/exit/platform and verifier, but explicitly say `unaccepted`.
They cannot submit work or grant a source pass. A killed in-flight command records an interrupted invocation, never an
inferred exit result or verifier. On restart completed journaled diagnostics are imported without rerunning the command.
If Ledger storage is unavailable, the private journal remains and recovery stays blocked until retention succeeds.

Historical reads and export retain the immutable receipt and diagnostics with trusted assignment provenance and the original cutoff.
History export explicitly excludes `private_git_source_objects`; its `complete` flag means complete selected history,
not a recoverable source package. Source objects remain privately rooted for ordinary execution durability. Keep private source roots/journals with the original authority store; history export is not backup. Disaster recovery is deferred after v1, without restricting runtime records to a package format.

## Verification and remaining work

Preimplementation cases: `docs/verification/owned-source-check-failure-cases.md`.

- `verify:linux-profile-owned-check`: owned services, scope/profile refusals, containment and actual Linux execution; receipt/history/reopen, unchanged-source `passed`/`failed` with declared caches, failure diagnostics, pre-create capacity/writer release.
- `verify:literal-source-roundtrip`: literal attributes/CRLF/symlink/executable/unusual-name bytes, actual deletion, hardlinks, FIFO/sparse/mode/representation/collision/entry/exclusion refusals; unsafe archive comparison and source-control oracles.
- `verify:whole-container-quiescence`: background writer stopped, new execute refused, missing-runtime quarantine/no reuse, never-issued create absence (including stop racing prepare and reopen), transient outage reconciliation, and cancellation while a rooted source effect remains admitted.
- `verify:source-root-crash`: SIGKILL before/after source rooting, after freeze and before/after Ledger receipt commit; actual diagnostics survive, missing receipts block, committed receipts survive, exact retry and wrong-source refusal.

Each named critical-point scenario runs once in the integration selection. The source-mutation runner and duplicate extended crash jobs were removed; historical mutation and repetition results are not current gate claims. Full later-feature V8/V9 remain unavailable; disaster recovery is deferred, not a v1 completion gate.
No human usability, native Mac, physical second-device, live-model, private-route confinement or physical power-loss
trial is claimed. Execution-time workspace quotas are outside this slice, not an unrun acceptance requirement.

Checks create only owned temp repositories/containers/services and remove their own runtime identities and data.
Product journals/source roots are retained indefinitely pending the later supported retention/cleanup surface; no
worker can grant itself permission to delete them.
