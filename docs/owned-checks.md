# Owned Linux check candidate

This slice adds trusted literal source retention and an opt-in owned-check path. **It is not acceptance-complete.**
Do not enable it for uncontrolled workloads until execution-time workspace storage containment and the outstanding
critical-point/unsafe-control evidence have been resolved. Collection bounds are not a filesystem quota.

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
The ordinary CLI does not enable this experimental configuration.

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
unsupported modes, and bounds fail closed. Worker ignores never govern collection. Exclusions overlapping the base
refuse; nonempty extra excluded paths also refuse because no delivered generated-output declaration can establish that
they contain no intended deliverables. Only encountered exclusions are in the capture manifest. Empty directories are
not Git content; they still count toward traversal bounds.

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
There is not yet a complete supported local-admin quarantine repair/cleanup command. Missing/uninspectable runtimes
remain blocked. The current implementation conservatively keeps the original writer's ownership/capacity when it
cannot confirm stop. No capacity is released merely because a timer elapsed.

Trusted source objects live under the configured private root and are pinned by `refs/render/sources/<commit>` before
Ledger receipts. A crash before the SQL reference may leave harmless unreferenced roots; they convey no authority.
`Effects.reconcile` verifies exact roots/tree/blobs and refuses missing/corrupt/different objects. Restore exact bytes,
never substitute another revision. Keep this directory with the authority store; no off-host source backup is claimed.

Historical reads and export retain the immutable receipt with trusted assignment provenance and the original cutoff.
History export explicitly excludes `private_git_source_objects`; its `complete` flag means complete selected history,
not a recoverable source package. Source objects remain privately rooted for the later package capability. That
capability is absent in the inherited host, so package validation/restore and source-aware admin recovery are not
claimed complete here.

## Verification and remaining work

Preimplementation cases: `docs/verification/owned-source-check-failure-cases.md`.

- `verify:linux-profile-owned-check`: owned real services, scope/profile refusals, containment observations and actual Linux execution; receipt/history/reopen.
- `verify:literal-source-roundtrip`: literal attributes/CRLF/symlink/executable bytes, actual deletion, hardlink bytes, FIFO/sparse/name/exclusion refusals; unsafe archive comparison.
- `verify:whole-container-quiescence`: background writer stopped, new execute refused, durable missing-runtime quarantine and no reuse.
- `verify:source-root-crash`: SIGKILL immediately before/after source rooting, no accepted output before return, exact retained retry and wrong-source refusal. `RENDER_V3_REPETITIONS=100` is a separate extended job, not the default smoke run.

Not yet evidenced: the full unusual-name/collision corpus, aggregate execution-time disk quotas, freeze/SQL-reference
SIGKILL barriers, 100 repetitions at every critical point, all requested unsafe controls (especially malicious
follow-symlink/host-fallback/hidden-base/early-reuse mutations), complete source package/admin recovery, and full
later-feature V8/V9. These are gaps, not passed rows or added dependency edges. No human usability, native Mac,
physical second-device, live-model, private-route confinement or physical power-loss trial has been run.

Checks create only owned temp repositories/containers/services and remove their own runtime identities and data.
Product journals/source roots are retained indefinitely pending the later supported retention/cleanup surface; no
worker can grant itself permission to delete them.
