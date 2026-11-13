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
