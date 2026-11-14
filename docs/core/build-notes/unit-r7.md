# Unit R7

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Server method result | Throw for every refusal, or return a report. | `Server.reload` returns the structural queue's Outcome with a ReloadReport result. The report status is applied, refused, or restart_required. A closing server uses the existing busy refusal. | R8 can distinguish preparation refusal from partial publication without parsing an error. No HTTP call or protocol code changes. |
| Failure shutdown in a library | Exit the entire process, or close the server and reject close. | Start close immediately, catch and print its failure internally, and retain the rejected close promise for callers. | startServer does not own the process. Reload returns the reached project and extension. close releases stores, sockets and locks before rejecting with a restart instruction. R8 owns command exit behavior. |
| A source that throws instead of returning failures | Reject the method, or report preparation refusal. | Report a scan failure under name `*`. | The directory source rejects for an unsafe root. It must leave old code running on reload. Startup behavior stays unchanged. |
| Existing preparation boundary | Add another checker, or reuse startup admission. | Call the source once inside the queue. Merge its modules with the current catalogue. Pass that proposal and source failures through loadExtensions and its scratch registry. Return its failures to reload as well as printing them. | Shape, schema and installation checks stay in one place. No author entry, options accessor or migrator is called during preparation. |
| Retained names | Reimport absent code, or keep the current module. | Keep the current module and include it in scratch validation. Rebuild its Options validator with the proposed catalogue. | No second source call or uninstall. Modules and options still publish as one snapshot. A kept status is the warning R8 can print. |
| Skipped projects later bound | Always repeat startup skipped entries, or omit entries now open. | Omit those now open. | The verdict explicitly warns against stale skipped reports. Reload does not reopen a skipped store. |
| Publication order | Scan order, or project selection order. | Sort open projects by name and install found modules in each Project's stored extension order. Rebuild defaults, then replace the catalogue. | Project selection order still resolves tool collisions. The task-deletion veto prevents a task transfer from breaking an intermediate install. |
| Literal template imports | Check after jiti transforms them, or before. | Check import template arguments with no substitutions in Babel pre. Keep ordinary literal imports, re-exports and require checks in the existing visitor. | A measured AST trace shows jiti wraps template imports in an IIFE before normal visitors. The old callee.type Import branch was dead and is removed. No parser dependency is added. |
| Review tools | Delegate review, or review locally. | Review the actual diff locally. | The kickoff forbids subagents and playbook execution. gh is used because Origin is absent. |

Model the Domain shaped the typed report and paired catalogue. Laziness Protocol kept startup admission and the structural queue as the existing boundaries. Test Behavior, Not Implementation shaped real HTTP replies, SQLite tasks and live stream checks.

## Publication

Projects.publish is a non-async method returning a map from extension names to the projects where installation completed. It installs through the same registries and updates the same default-selection objects. It neither opens stores nor replaces harnesses, locks or streams. Catalogue assignment is last. A callback records the attempted project and extension before each install because a subscriber may throw after pi has changed that registry. No rollback or subsequent install follows a throw.

A TypeScript AST walk over the actual method reports:

```text
Projects.publish is synchronous and contains 0 AwaitExpression nodes.
```

The inspected calls are synchronous all, catalogue.get, registry.install, catalogue.defaults, and the synchronous reach callback. Server.reload enters structural.run before scanning. On partial failure, calling close sets the queue's closing flag before its first await. The reload callback does not await close, so draining the queue cannot wait on itself.

Reload adds no persistence call or generation record. Trusted source and import side effects are not transactional. The inherited directory source can create its absent scan directory. Scheduler work triggered by a registry install can write task progress. The no-write claim is not a claim that all project files remain byte-identical while ordinary work runs.

## Tests and evidence

Tests were committed before production code in b673b84. The new server tests initially failed at the missing reload operation, not compilation or setup. The loader template cases and allowed dependency case failed their assertions on the old implementation. The require traversal case already passed and now holds its branch. The first red command left a failed test's server open and reached the command timeout. The recorded complete red run uses node --test --test-force-exit. Normal passing runs use the repository command without that flag.

Real red output from /tmp/r7-red-final.log:

```text
ℹ tests 79
ℹ pass 50
ℹ fail 29
```

Real focused green output from /tmp/r7-green.log:

```text
ℹ tests 79
ℹ pass 79
ℹ fail 0
ℹ duration_ms 1454.279709
```

Seven refusal tests compare the exact catalogue reference, every open registry snapshot, the extensions reply, and stored options views. Each proposal also contains a valid new extension, so partial acceptance is observable. A subsequent bare agent uses the old default tool and code. Other tests cover old tool completion, task phase handover, timer wakeup, late tasks, running agents, saved instructions, fresh rendered prose, schemas, retained names, skipped stores, FIFO scans and bind ordering. A held setOptions test queues reload and a second patch. The second patch must use the replacement schema. A real synchronous subscriber throw proves that p changed, q did not, another reload is busy, close rejects with restart required, and a restart opens both stores on the same home.

While a scan is held, real HTTP input and answer finish, a held tool completes, its conversation returns idle, and an existing stream advances without closing.

Each mutation was compiled, tested alone, and restored:

| Mutation | Selected behavior | Real result |
| --- | --- | --- |
| Permit a dropped task kind. | Dropped-kind refusal. | 0 pass, 1 fail. Actual applied instead of refused. |
| Skip already installed names during publication. | Next task phases. | 0 pass, 2 fail. Both histories contain label old instead of new. |
| Read the catalogue before entering the structural queue. | Second setOptions behind reload. | 0 pass, 1 fail. The old schema accepted the forbidden patch. |
| Bypass the structural queue for reload. | FIFO reload scans. | 0 pass, 1 fail. Three scans entered while the first reload scan was still held, instead of two including startup. |
| Skip the literal-template check. | Canonical specifiers. | 28 pass, 8 fail including the parent. |

The replacement-skip mutant survived the bare-agent tool test alone because refreshed defaults already carry new tool objects. The task tests kill it through registry task resolution. This is why both seams remain. Logs are /tmp/r7-mutant-*.log. The snapshot mutant is the R6 verifier's requested probe.

Real full-suite output from /tmp/r7-after-output.txt:

```text
ℹ tests 442
ℹ suites 3
ℹ pass 442
ℹ fail 0
ℹ duration_ms 15539.252083
```

## Inventory and runtime

The prescribed inventories are /tmp/r7-before.txt and /tmp/r7-after.txt. They contain 352 and 373 top-level names. comm -23 prints nothing. No top-level name was removed or renamed. The total test count rises from 410 to 442.

Three nested invalid-import cases named import, dynamic and export tau-extension-extra were replaced by `a dependency whose name starts with tau-extension is allowed`. The old expectation was the R5 defect, not protection to retain. Fourteen nested cases were added for require and template forms across the seven invalid spellings. The canonical parent test kept its name.

The 21 new top-level names are:

```text
a dependency whose name starts with tau-extension is allowed
a newly found extension wakes a listed task and reaches a running agent only in selected projects
a subscriber throw stops publication and requires restart on the same home
a task version rise is allowed with migrate false
a task version rise is allowed with migrate true
input answer streams and a running tool proceed during an affected reload scan
new prose reaches new conversations and rendered inputs but not saved instructions
reload hands a first task to the new next phase
reload hands a sleep task to the new next phase
reload keeps absent names and names skipped stores but not stores since bound
reload refreshes schemas for extensions options setOptions and create
reload refuses a bad module shape without changing any project
reload refuses a dropped task kind without changing any project
reload refuses a lower task version without changing any project
reload refuses a phase removed at the same version without changing any project
reload refuses a rejected scan without changing any project
reload refuses a shared task name without changing any project
reload refuses an import failure without changing any project
reload replaces a tool while its old call completes and streams stay open
setOptions captures its catalogue inside the queue after reload
two reloads scan in order and a bind waits for the new catalogue
```

One host run before passed 134 tests in 2782.225542 ms. One after passed 166 in 3117.457209 ms. Node times the test process, not the preceding TypeScript build. Both runs include real process-restart tests. The new timer case waits about one second but runs beside other files. These are suite runtime observations, not a performance comparison. At inspection this 12-CPU machine had load averages 3.85, 5.64 and 5.90. The test runner was read before reporting the numbers.

## Verifier follow-up

The follow-up merged origin/render-core at f2f9fc7 before editing. Its baseline is that commit, not the earlier inventory. Tests were committed first in abf319f.

Publication now returns `Map<string, string[]>`. Each successful registry installation records its project under the extension name. Reload builds the report from that result, not from project listings. A retained extension has no installations in this reload, so its projects list is empty. The attempted-install callback still identifies a subscriber throw. The catalogue assignment stays last.

The successful reload test opens p and q listing demo and r not listing it. It checks each registry and default selection. The report test temporarily limits only publication's project enumeration to p, then restores enumeration before reporting. It requires projects `["p"]`, not `["p", "q"]`. This exercises the real publisher, registries, stores and report without adding a production test hook.

The subscriber-throw test now checks exact old catalogue identity. Unsafe-directory tests require the startup consequence and chmod 700 instruction. Startup behavior is unchanged.

Real pre-fix output in /tmp/r7-review-red.log:

```text
ℹ tests 76
ℹ pass 71
ℹ fail 5
```

The report test and retained-name test failed on inaccurate project lists. Three directory-mode cases failed on the old message. Real focused green output in /tmp/r7-review-green.log:

```text
ℹ tests 76
ℹ pass 76
ℹ fail 0
```

Each mutation was compiled, run and reverted:

| Mutation | Test | Real output |
| --- | --- | --- |
| Limit publish to this.all().slice(0, 1). | reload installs in every listed project and leaves unlisted projects untouched | 1 fail. q still has the old module. The report test passes and reports only p. |
| Move catalogue assignment to the top of publish. | a subscriber throw stops publication and requires restart on the same home | 1 fail. Catalogue objects are not reference-equal. |
| Derive reported projects from listings instead of the publication result. | reload reports only the projects publication installed in | 1 fail. The report falsely includes q. |

Logs are /tmp/r7-review-mutant-reach.log, /tmp/r7-review-mutant-order.log and /tmp/r7-review-mutant-report.log. The first command runs two tests and yields 1 pass and 1 fail. The other commands each run one test and yield 0 pass and 1 fail.

The fresh origin/render-core inventory is /tmp/r7-review-before.txt. It has 352 top-level names and 410 tests. The final inventory is /tmp/r7-review-after.txt. It has 375 top-level names and 444 tests. No top-level name was removed or renamed. The 21 earlier additions above remain, with two more:

```text
reload installs in every listed project and leaves unlisted projects untouched
reload reports only the projects publication installed in
```

The nested canonical-import replacements remain as accounted for above. Full-suite output is /tmp/r7-review-before-output.txt and /tmp/r7-review-after-output.txt:

```text
before: tests 410, pass 410, fail 0, duration_ms 16896.820916
after:  tests 444, pass 444, fail 0, duration_ms 17354.009
```

Host-only runs are /tmp/r7-review-host-before.log and /tmp/r7-review-host-after.log:

```text
before: tests 134, pass 134, fail 0, duration_ms 3656.254375
after:  tests 168, pass 168, fail 0, duration_ms 3804.829459
```

These are single-run test-process observations, not a performance comparison. The two host runs ran concurrently. A fresh TypeScript AST walk reports `Projects.publish AwaitExpression nodes: 0 async: false`. Fresh-checkout acceptance and all five forced-check results for the pushed head are recorded on PR 112.

## Limits

No real model call, external network, Linux run, process kill during synchronous publication, admin reload command, blocked-task report, later pi report logging, or eager migration is claimed. The subscriber-failure and same-home restart test establishes the specified partial-publication recovery path, not transactional rollback. R8 owns the admin command and task diagnostics. Nix acceptance and forced rebuild output for the final pushed head belong in the PR and final report.
