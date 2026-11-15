# Unit R8

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Admin reply | Add another HTTP call, or extend the local socket. | The closed admin schemas accept only extension_reload with no fields and return a reload report. | The existing socket is owner-only. The client protocol does not change. |
| CLI model initialization | Import all providers for every admin command, or only when serving. | Load the model providers, execution environment and credential reader inside serve. | An admin command does not use them. The existing server and device tests cover the unchanged behavior. |
| Report shape | Repeat the report type in the admin schema, or derive it from one schema. | ReloadReport and TaskWarning have schema-derived types. | The socket validates the same shape the server produces. |
| Task diagnostics | Read terminal faults, or inspect live tasks. | Inspect every open harness after publication and once after startup opens projects. Read installed definitions from each project's registry. | An unmigratable timer still looks sleeping before it is due. No eager migration or durable report is added. |
| A stored version above installed code | Omit it until due, or warn now. | Report blocked with task_too_old, including both versions. | This code cannot reserve that version. A running old phase may still finish. |
| Error text | Serialize errors and records, or print the message. | Print the first message line and explicit identifiers. Do not read options to build reports. | Reports must not print option values, tokens, modules, task input or checkpoints. Trusted extension code can still write its own logs. |
| Partial publication and queue refusal | Say old code always runs, or distinguish the outcome. | Only preparation refusal says old code still runs. Partial publication says restart required. A closing queue returns its existing busy message. | Mixed publication is not rollback. |
| Installer build | Keep two builds, or build the temporary out-link once. | One build creates a hidden out-link in the extensions directory. Rename it over the selected link only after success. | The first no-link build becomes redundant. Any out-link build failure preserves the old entry. Files and directories remain refused. |
| GC root after rename | Assume the root follows the link, or measure it. | Register the final path with nix-store --add-root --indirect --realise after rename. | The measured indirect root records the temporary pathname. Rename alone loses root registration. No collection is run. |
| Installer report | Require an emitted CLI helper, or format the socket report directly. | The standalone installer prints the same readable lines as the CLI and follows exit codes 0, 3 and 1. | It runs without compiling the workspace. The follow-up replaces the original JSON output. |
| Installed verification | Restart after linking, or reload the same server. | The existing verify-build test links three outputs while the installed empty server runs. A second reload uses a Markdown-edited W2 copy. | This proves the installed admin command, not just startup discovery. No flake change is needed because its verify-build command already invokes this test. |
| Review tools | Spawn reviewers, or review locally. | Review locally and use gh. | The unit rules forbid subagents and playbook execution. Origin is absent. |

Model the Domain shaped the task warning schema. Laziness Protocol removed the redundant installer build and reused the socket. Test Behavior, Not Implementation shaped the child-process commands and real harness inspections. Prove It Works required the installed binary and the GC-root query.

## Test order and mutations

Tests were committed before production changes. The first red run compiled successfully. Its log is /tmp/r8-red.log.

```text
ℹ tests 94
ℹ pass 74
ℹ fail 20
```

It failed on the new admin request, the directory-file advice, the task warnings, all CLI report cases, temporary out-link creation and preservation after an out-link failure. The later tests cover ownership advice, stored versions above installed code, actual task_outdated callbacks, a real workflow retained after syntax refusal, and a secret option.

The task tests use real SQLite, sleeping tasks, registry replacement and scheduler callbacks. The no-migrate test checks the warning before due time, restarts to check startup stderr, waits for actual migration_failed blockage, checks the CLI's exit 3, then supplies a migrator and observes the task complete at version 2. The migrate case has no warnings and completes at version 2. A running task logs task_outdated after it makes durable progress under the old definition.

Each mutation was compiled, tested alone and restored. Installer mutations need no compilation.

| Mutation | Observable failure | Real result |
| --- | --- | --- |
| Compare stored and installed versions for equality instead of older-than. | No correct pre-due warning. | 0 pass, 1 fail. |
| Return exit 0 for a CLI warning. | A kept extension loses exit 3. | 0 pass, 1 fail. |
| Skip the installer's admin request. | A running home does not reload or propagate its outcome. | 0 pass, 3 fail. |
| Print work= instead of task= in onReport. | The later report lacks its task identifier. | 0 pass, 1 fail. |
| Change verify-build's first reload to an unknown subcommand. | The installed empty server never reaches the three-added assertion. | verify-build exits 1. The command exits 2 with usage text. |

Logs are /tmp/r8-mutant-warnings.log, /tmp/r8-mutant-exit.log, /tmp/r8-mutant-installer.log, /tmp/r8-mutant-on-report.log and /tmp/r8-mutant-verify-build.log. The final restored source passed all tests.

## Real installed output

The script /tmp/r8-real.mjs builds the installed command and the three source outputs, then uses an isolated temporary home and an ephemeral loopback port. /tmp/r8-real.log records this output.

```text
empty extensions {"result":{"items":[]}}
added w1; projects: none
added w2; projects: none
added websearch; projects: none
total: 3 extensions; 0 tasks; 0 skipped projects
Markdown edit
replaced w1; projects: none
replaced w2; projects: p
replaced websearch; projects: p
total: 3 extensions; 0 tasks; 0 skipped projects
syntax refusal exit=1
tau: reload refused; old code still runs.
```

The next line names w2, its temporary path, import and ParseError: Unexpected token. The next real HTTP workflow create returns `{"result":{"conversation":14}}`, using the still-loaded W2 entry. No model call is made.

Authenticated POST /v1/extension_reload returns code unknown_call and the unchanged list of 20 calls. The admin socket mode is 600. The script sets a secret websearch option and confirms that neither server output stream contains it. The CLI integration test scans the added, replaced and refused outputs too.

The same script installs W2 over the edited link while the server runs. The installer prints Installed w2 and an applied report with all three extensions replaced, no task warning and no skipped project. Its final registered root is shown by the real nix-store query.

```text
"/tmp/nix-shell.MDbT0p/r8-real-etjVIX/.tau/extensions/w2" -> /nix/store/23lzgl2m8jrmwz0nnp6y2v9cj2a7m4ay-tau-extension-w2
server stdout/stderr contain no secret option
server exit 0
```

The separate rename probe registered a temporary out-link, renamed it, and found no root at the final path. Registering the final path then produced its root line. This is why the installer does not rely on rename alone.

The blocked-task CLI output in /tmp/r8-task-green.log is from a real server with a task stored at version 1 and installed at version 2.

```text
replaced timer; projects: p
blocked p task=18 kind=timer.due conversation=12 version=1->2 migration_failed: Task timer.due version 2 has no migration from 1
total: 1 extensions; 1 tasks; 0 skipped projects
```

Its exit code is 3. The later migration completes the same task at version 2.

## Installed verification

The new verify-build output in /tmp/r8-verify-build.log includes the same three added lines, schema checks, a W2 conversation without a model call, replaced w2; projects: p, models HTTP 200 and SIGTERM exit 0. It uses one running server for addition and replacement. Copying a read-only Nix output required making the copy's root and edited Markdown owner-writable. The original output stays unchanged.

## Inventory and runtime

The prescribed inventories are /tmp/r8-before.txt and /tmp/r8-after.txt. They contain 386 and 410 top-level names. The full suite grows from 455 to 479 passing tests. The one renamed test is:

| Removed name | Replacement | Reason |
| --- | --- | --- |
| install-extension builds an out-link, replaces it and tells the owner to restart | install-extension replaces a link atomically and reports that it loads at the next start | A running server reloads now. Without one, the output promises the next start, not a required restart. Existing replacement and permissions assertions remain. |

The 24 new names, apart from that replacement, are:

```text
a directory owned by another user asks for ownership repair, not chmod
install-extension keeps the old link when the out-link build fails
install-extension reloads a running home and returns 0
install-extension reloads a running home and returns 1
install-extension reloads a running home and returns 3
onReport logs a running task left on its old definition
reload command prints aliases and exits 1
reload command prints applied and exits 0
reload command prints blocked and exits 3
reload command prints compatibility and exits 1
reload command prints import and exits 1
reload command prints install and exits 1
reload command prints kept and exits 3
reload command prints newer stored task and exits 3
reload command prints options and exits 1
reload command prints restart and exits 1
reload command prints scan and exits 1
reload command prints shape and exits 1
reload command prints skipped and exits 3
reload command prints sleeping and exits 3
reload reports sleeping and blocked tasks and repairs them with migrate false
reload reports sleeping and blocked tasks and repairs them with migrate true
reload rereads prose, refuses syntax errors and keeps the old workflow without exposing secrets
startup reports a stored task newer than installed code
```

The test runner was inspected before execution. The focused host and command run passed 209 tests in 6686.591584 ms. The later installer run passed 14 tests in 6326.312584 ms. The final cumulative run passed 479 tests in 18152.466792 ms. These are test-budget observations, not speed comparisons. Node reports test execution time, excluding the preceding typecheck. Real-process CLI cases and two one-second timers account for most new work. No fault loop or real model call was added. Lint also passed.

Fresh-checkout acceptance and forced flake checks are recorded in the PR at the pushed head. Three earlier gate attempts at f48e0d5 hit existing journey timeouts under host load between 16 and 28. The last had 477 passes, zero assertion failures and two cancellations. All four non-test checks passed forced rebuilds at that head. No assertion or deadline was weakened. No spikes or concurrent R10 files changed.

## Follow-up after independent verification

Merged origin/render-core at b39de49 with a merge commit, not a rebase. The Commands conflict keeps R10's typecheck and source-test lines and R8's installer and verify-build lines. R8's journeys already load extension src folders. No emitted extension test assumption remains. The full suite includes R10's source runner and crash tests.

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Refused installation | Leave the new link, or restore the previous link. | Save the old target, create the rollback symlink under the temporary name, rename it over the final link, and register that final root again. With no previous link, unlink the new entry. | A reboot must load the last accepted install. Refusal prints its reason and the previous-version outcome, never Installed. |
| Applied warnings | Roll back every nonzero exit, or distinguish warnings. | Keep the new link for applied exit 3. | The running server has already published the new code. |
| Installer interruption | Synchronous build, or let Node process signals during the build. | Spawn the build asynchronously. SIGTERM and SIGINT kill the child and unlink the temporary root. | The synchronous build prevented prompt cleanup. |
| Stale output | Delete dot entries, or match only generated names. | Remove symbolic links whose name is exactly a known extension plus a UUID, on every invocation. | Other hidden files and links belong to the owner. The loader's dot-entry test includes a dangling installer link. |
| Readable reports | Depend on emitted workspace code, or format the standalone report. | Keep a small direct formatter in the installer. | The installer runs before typecheck. Shipping a shared emitted helper would require unrelated packaging work. |
| Sleeping task | Label a predicted failure as migration_failed, or describe the next wake. | Print will block when it next wakes and the missing migration versions. | It is not blocked yet. The wire schema stays unchanged. |
| Kept extension | Report only newly published projects, or include projects still served. | List every open project selecting the kept extension. | Kept code is still installed there. |
| Directory failure | Give every error permission advice, or show the specific cause. | Remove the blanket permissions preamble. Only the writable-mode error advises chmod. | A file must be replaced by a folder, not chmodded. |

### Test-first evidence

Tests landed in 493e754 before fixes in e1b61dd. The focused red run compiled and showed 104 pass, 10 fail, 114 total. Failures covered rollback with and without an old link, both signals, stale cleanup, installer JSON, sleeping wording, kept projects and the not-a-folder preamble. The fixed focused run showed 114 pass, 0 fail in 9445.846042 ms. Logs are /tmp/r8-followup-red.log and /tmp/r8-followup-green.log.

Root registration and all-project inspection were already correct, so their new tests initially passed. Mutating them establishes the missing regression protection.

| Broken line | Result | Log |
| --- | --- | --- |
| Remove registerRoot for the final link. | Atomic-install test fails, 0 pass and 1 fail. | /tmp/r8-followup-mutant-roots.log |
| Inspect only projects.all().slice(0, 1). | Two-project inspection fails, 0 pass and 1 fail. | /tmp/r8-followup-mutant-projects.log |
| Remove signal unlinkSync. | SIGTERM and SIGINT tests fail, 0 pass and 2 fail. | /tmp/r8-followup-mutant-signal.log |

All mutations were restored. The fake nix-store records every argument. Assertions require --add-root, the final link, --indirect, --realise and the target, including the previous target after rollback. A separate naming regression first failed with 0 pass and 1 fail, then passed after matching the exact generated name. Its test commit is fc5e756 and fix is 6f50f38. Logs are /tmp/r8-stale-naming-red.log and /tmp/r8-installer-final.log. The final installer suite has 18 passing tests.

### Installed restart evidence

The real run is /tmp/r8-followup-real.mjs with output /tmp/r8-followup-real.log. It starts the installed tau in a temporary HOME on an ephemeral port, then runs the actual installer against Nix outputs while that server runs.

```text
GOOD INSTALL
added w2; projects: none
total: 1 extensions; 0 tasks; 0 skipped projects
Installed w2 at /tmp/nix-shell.0uYLRO/r8-rollback-real-T8E0gF/.tau/extensions/w2.
PROSE EDIT INSTALL
replaced w2; projects: p
total: 1 extensions; 0 tasks; 0 skipped projects
link before syntax /nix/store/jmqggyd9fibdhf394k3c4xagbdri9m1a-tau-extension-w2
SYNTAX ERROR INSTALL
exit=1
tau: reload refused; old code still runs.
tau: w2 /tmp/nix-shell.0uYLRO/r8-rollback-real-T8E0gF/.tau/extensions/w2 import: ParseError: Unexpected token
Install refused; the previous version is still installed.
link after refusal /nix/store/jmqggyd9fibdhf394k3c4xagbdri9m1a-tau-extension-w2
"/tmp/nix-shell.0uYLRO/r8-rollback-real-T8E0gF/.tau/extensions/w2" -> /nix/store/jmqggyd9fibdhf394k3c4xagbdri9m1a-tau-extension-w2
old workflow {"result":{"conversation":13}}
restarted workflow {"result":{"conversation":19}}
```

The root line comes from nix-store --gc --print-roots filtered by the temporary home. No collection was requested. After SIGTERM and restart the extensions response still lists w2 with workflow true and its model schema. The admin socket is 600. HTTP POST /v1/extension_reload still returns unknown_call. Both edited tracked source files were restored byte for byte.

### Inventory and acceptance

The new baseline is origin/render-core b39de49, not the old R8 baseline. It passes 473 tests in 18873.18575 ms. The final local run passes 502 with zero failures or cancellations in 21612.894375 ms. These are test-budget observations, not speed claims. The normalized inventories /tmp/r8-before.txt and /tmp/r8-after.txt contain 404 and 433 unique top-level names. One name is replaced and 29 are new. The removed name is install-extension builds an out-link, replaces it and tells the owner to restart. Its replacement is install-extension replaces a link atomically and reports that it loads at the next start, retaining the link and permission assertions.

The 29 new names include the original R8 additions listed above and five follow-up names. They are the two signal cases, exact stale cleanup, rollback/root restoration, and inspection of every open project. The already-existing loader dot-entry test now includes an installer-named dangling link.

The first fresh-checkout gate caught one import-order error in the installer tests. Fixed in 025f9bf. Fresh-checkout nix flake check -L --max-jobs 1 then passed. All five checks were forced sequentially with nix build --rebuild --no-link -L --max-jobs 1. Test output is 502 pass, 0 fail, 0 cancelled. verify-build prints the three added lines, replaced w2; projects: p and SIGTERM exit 0. Final-head acceptance is repeated after this notes update and recorded on PR 114. Logs are /tmp/r8-fresh-gate.log and /tmp/r8-forced-{lint,typecheck,test,spikes,verify-build}.log.

The branch diff stays within the allowed paths. The spikes diff is empty. No Linux execution, destructive collection or real model call was performed.

## Limits

Linux is not measured. No real model or external search provider is called. Directory ownership advice uses a substituted process UID, not privileged chown. No destructive garbage collection is run. Native dependency updates still require restart. The command does not repair terminal faults or undo task effects. It does not claim that all tasks migrated.
