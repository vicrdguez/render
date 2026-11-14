# Build notes: unit 5, W1

W1 is built in `packages/w1` as the package `tau-w1`. These rows record where the locked design was silent or loose, and what the build took. Each one can be rolled back for the other reading.

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Walk row 8, the worktree's path | Inside the repository, such as `.worktrees/<k>`. Inside `.git`. A directory beside the repository. | `<workdir>.w1-<k>`, beside the repository. | Inside the repository the designer's `git status` shows a new directory, and a project that does not ignore it can commit it. Beside it, W1 touches nothing of the project's tree. |
| Walk row 8, the plan's fields | Path, branch, base, and SHA only. Those and the repository's directory. | Those and `repo`, the designer's `cwd`. | Row 9 runs `git worktree add` in that repository. The author rule says to copy a value that an outside effect depends on into your own document. |
| Walk E3, the stuck decision's `then` task | The walk names none. | `w1.retry`, as the base sketch named it. | One task serves every stuck decision. Its input is the decision, as for the other `then` tasks. |
| "An outside effect runs twice", retry after a mismatch | Retry submits to a conversation, as E3 says. No conversation exists yet. | Retry creates `w1.prepare` again, which looks again before it acts. The stuck basis is an entry in D. | The owner clears the path and answers retry. I does not exist before row 9, so the entry goes in D. |
| Rows 11, 13, and 17, the end of a publishing run | Only row 2 says that the result sets `terminate`. | All three publishes set `terminate`. | A publish is the role's handoff. Ending the run saves a model request. A sequential round still runs every call, so a `bash` call in the same round runs, and the run goes on. |
| Events | The design names no kind. | One kind, `w1.event`, with `text`, `at`, `conversation`, `stage`, and, where they apply, `sha`, `path`, and `notActedOn`. | The `stage` field lets a client and the tests read the timeline. Row 19's handover lists the annotations not acted on there. |
| Stages | The walk names designing, building, reviewing, fixing, handed over, cancelled, and stopped. | Adds `design_review`, `preparing`, and `merge_review`. | Tools refuse by stage, and the end of a run checks the stage. Without them a publish could land while a decision on the same work is open. |
| Walk E2, "the stage moved on" | Compare the stage alone. Compare the stage and the candidate. | D owes a design in `designing`. I owes a build in `building` or `fixing` while no published build waits for review. R owes a review in `reviewing` while the candidate has none. | `publish_build` leaves the stage at `building` until row 12 sets `reviewing`. The stage alone would open a stuck decision after the run that just published. |
| Walk X1, abort on a decision W1 no longer waits on | Cancel only on the expected decision. Cancel on any abort. | Any abort cancels, unless the work is already cancelled, stopped, or handed over. | The walk says the `then` task looks for abort before anything else. A handed-over work has nothing left to stop. |
| Walk X2, "each annotation still owed" | Only the abort's own annotations. Those and the ones the next publish still owed replies to. | Both. | An approval's annotations go to the implementer, and they are owed until a build replies to them. |
| Walk row 10 and note 6, replies to an approval's annotations | Owed by every build. Owed by the first build. | The first build replies. A fix build owes none. | The rule says `publish_build` refuses until each one has a reply. Once replied, the reply is stored in that build entry. |
| Walk row 11, what `publish_build` checks in Git | A clean worktree. A clean worktree on the plan's branch. | Both, and an error result for either. | Row 19 compares the branch's head. A build from another branch could never be handed over. |
| A missing base branch in row 8 | Open a stuck decision. Let the `then` task fault. | It faults. | The design's way on after a faulted `then` task is an equal resend, which the store already runs. A test covers it. |
| Git reads in rows 8, 11, and 19 | Read before the commit, then check again inside it. Read inside the commit. | Inside the commit. `git worktree add` in row 9 runs outside, before its commit. | One commit has no gap between the check and the write. The cost is a Git read of a few milliseconds while the commit holds the store's line. |
| The input of each submission | Strings in code. Prose files with slots. | One prose file each for revise, build, review, fix, and retry, with values from people or the repository inside tags. | [Prose](../prose.md) chose Markdown files with slots, checked when the module loads. |
| Row E3, which model a retry sets | The walk says a retry sets the role's model. | The model option of the role whose conversation the retry submits to. | D, I, and R are told apart by the IDs in `Work`. |
| `Work`'s receipts | A receipt as entry and decision IDs. A receipt as the tool's result. | The result text, keyed by `api.taskId`. | The rule says a rerun returns the saved result. |
| Reviewer tools with no published build | Show the working files. Refuse. | Refuse with an error result. | The reviewer's tools read Git objects at the candidate SHA only. |
| `flake.nix`, outside this unit's paths | Skip the Git tests when Git is missing. Give the test command Git. | `pkgs.git` in the `test` command's inputs. One word. | The kickoff asks for a real repository and worktree in tests. The gate's test command had only Node and coreutils on its path. |
| Walk row 13 and note 5, Git readers | A plain two-commit diff. A diff with external drivers and text conversion disabled. | `show_diff` passes `--no-ext-diff --no-textconv`. `show_file` keeps `cat-file blob`, which does not enable either conversion. | Repository configuration, working-tree attributes, and `GIT_EXTERNAL_DIFF` must not turn an object read into a program that reads unpublished files. Both readers use argument lists and piped output, not a shell or terminal pager. Neither invokes hooks or checks working-tree status. Real reader tests also set pager and fsmonitor commands and prove no helper ran. The server environment and Git object store remain trusted, not sandboxed. |
| Walk row 19, note 6, and finding 22, approval annotations when the head moved | Carry the final approval comments into another build obligation. List them as not acted on, as on the normal final approval path. | The fixing event lists every final approval annotation in `notActedOn` and in its text. The two-SHA note and retry stay unchanged. | Note 6 assigns J1 annotations to the final approval event. Finding 22 allows listing them as not acted on. This keeps their disposition visible without creating a new reply obligation. |

## What the tests use that is not production

- A stand-in for codemode: a test extension with one `script` tool that makes a nested call. The refusal of the nested `publish_build` is pi-durable's own.
- A stand-in for web search in the project default, to show that the open designer gets its tool and the closed roles do not.
- A then task created a second time by the test, to show that it does nothing for a decision already handled.
- The host's `create` commit, written in the test from [Host](../host.md), since the host is built on another branch.

## What is not tested

- The real codemode. The stand-in calls `executeTool` as codemode does.
- A kill in the middle of SQLite's own write. The kills come right after a stored commit, or right before one.
- A second model provider for R. Every role runs on the faux provider, with two model IDs.
- The journey over HTTP, where a device answers through the server. A later unit adds it.
- An owner's run in R that overlaps a review dispatch. pi-durable queues the dispatch (H7 of `spikes/host.mjs`), and W1's tools read the SHA from `Work`.
- Two work items at once in one repository. That is deferred.
- The gate on Linux. It ran on macOS only.

## Closure round

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Git replacements and grafts | Trust shared replacement refs and legacy grafts, or read the actual objects. | Every W1 Git child gets `GIT_NO_REPLACE_OBJECTS=1`. The child uses an empty graft file. This includes prepare, publish and hand-over. | An implementer worktree can install a blob replacement shared with the reviewer. A SHA must name the real object. Tests cover both reader tools, publish with a replaced commit type, hand-over with a replacement or graft, and preparation with grafted ancestry. A graft alone does not change the head SHA, so that hand-over control already passed before the fix. |
| Git configuration and environment | Inherit the server's Git settings, or pin the review format. | Clear inherited `GIT_*` variables for each child. Disable system and global Git configuration. Keep local repository configuration, with command flags for text, no color, short submodule links, a/ and b/ prefixes, no renames, Myers diff, no indent heuristic, three context lines, no extra inter-hunk context, no relative paths, no function context, fixed line indicators and no configured ordering file. Pin path quoting and blank context prefixes through a fixed child configuration. | Attributes must not hide text as binary. Repository settings must not change the review format or expose nested repository content. Tests cover info attributes, an attributes file, environment configuration, format settings, submodules, and each named repository-selection environment variable. |
| Missing file errors | Return Git's error, or one fixed refusal. | Every failed `show_file` object lookup says `The path is not a file in the published commit.` | Git's own diagnostic distinguishes paths that exist on the server's disk. Tests compare disk-only, absolute, nonexistent and parent paths. |
| What stays trusted | Claim isolation from the server, or keep the design's trust limit. | Trust the server OS account, executable lookup and Git binary, filesystem, repository metadata and object database, and the stored plan and SHA. Local repository configuration is still read; it can cause failures and governs worktree creation and status beyond the pinned reader settings. Non-Git environment variables remain inherited. | This is deterministic object reading, not a sandbox against the same OS user. That user can edit refs, objects, configuration, stores or executables. Git config includes are not isolated. No new guarantee against arbitrary local configuration or repository corruption is claimed. |

The new reader and head regressions failed before the production fix. The original combined run reported 17 failures across W1, host and tools. A later focused run also failed the new publish regression. After the fixes, the four focused test files passed all 95 tests in 8647.506 ms. That is one test-runner sample including the tool fixtures, not a speed comparison. Removing replacement protection again made the reader, publish and hand-over regressions fail. The mutant was reverted. The first full gate failed the existing HTTP crash test because its Git wrapper requires the subcommand first. The final implementation uses the permitted environment alternative instead of global flags, so that crash test can still pause the continuation.

## Owner merge command

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Walk row 19, the owner's merge | Refuse any shared replace ref, or give the owner a command that ignores replacements. | The hand-over says `git --no-replace-objects merge --ff-only <sha>`. | The owner checks out the same objects the reviewer read. This needs no new refusal or decision, and also ignores a replacement installed after hand-over. |

A real Git test runs W1 through review, adds a blob replacement from the implementer's worktree before final approval, and executes the command in the hand-over text in the owner's repository. The owner's Git environment has no `GIT_NO_REPLACE_OBJECTS`. Before the fix, the checked-out file was `MALICIOUS` instead of `REVIEWED`.

The package runs passed 65 W1 tests in 3302.830792 ms and 24 Tau tests in 5022.320167 ms. These are test-runner durations, not speed comparisons. Three temporary mutants failed and were reverted. Removing the command's replacement flag checked out `MALICIOUS`. Handing over the base SHA checked out the old CSV file. Reversing the head comparison failed both the new test and the moved-head test.

| Failure | Test | File |
| --- | --- | --- |
| The owner's merge uses a shared blob replacement instead of the reviewed file. | `row 19: the owner's hand-over command checks out the reviewed blob despite a shared replacement` | `packages/w1/test/failures.test.ts` |
| The hand-over prints the old command. | `rows 18 and 19: approve hands over S2 and lists the annotation as not acted on, and nothing merged` and the HTTP W1 journey | `packages/w1/test/walk.test.ts`, `packages/tau/test/w1.test.ts` |

This does not make the owner's merge safe from the implementer's shell. The merge still runs with whatever hooks and configuration are in the shared `.git`. A `post-merge` hook through `core.hooksPath` is as cheap as a replace ref. The design trusts the implementer's shell in that repository. It is not sandboxed.

## Closure verification

`nix flake check -L` passed all five named checks on macOS. The test check reported 282 tests, 282 passes and zero failures. All six unchanged design spikes and the installed executable check passed. `nix develop -c check` also exited zero in 25.0 seconds wall time. These are single runtime samples, not performance comparisons.

Package-only emitted test runs passed 64 W1 tests in 3168.942 ms, 51 host tests in 2682.766 ms, and 24 web search tests in 685.596 ms. The two revoke fault cases are included in the host count. No live model or search service was called.

Three temporary mutants failed and were reverted. Removing the final replacement environment setting failed the reader, publish and hand-over regressions. Deleting a prior revocation during rollback failed the repeated-revoke regression. Changing the emitted key filter to three characters failed both provider regressions. The source filter was not changed.
