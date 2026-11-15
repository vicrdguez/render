# What the owner should look at first

**Reported.** A reviewer on another model family (`gpt-6-astra`) read the decision trail, every build note, the pull requests, and parts of the coordinator's transcript on 2026-11-14. It changed nothing. This file is what it flagged, in the coordinator's words. Each choice below can be rolled back for the alternative.

## The owner's answer

**Decided.** On 2026-11-14 the owner accepted every choice in the "taken" column below, with one exception. The type of `then` is rolled back: the task's choices and the request's choices are the same set. No caller used the wider allowance, and a shared handler across requests with different choice lists no longer compiles. Of the three rows under "Found last", the owner asked for the first to be fixed. The other two stay as they are, on purpose: W1 and W2 are samples for testing, and those two gaps are failure cases worth having in a sample.

## Choices that are not small

| Choice | Where | What the design says | What was taken | The alternative |
| --- | --- | --- | --- | --- |
| How `Host` and `Origin` are checked | `unit-2-host.md`, `packages/host/src/http.ts:30-68` | [Protocol](../protocol.md) requires both checks. It gives no rule for what is allowed. | Only host names are compared. Any allowed host name passes as an `Origin`, whatever its scheme or port. | A list of allowed origins, kept apart from the proxy's host names. This is a security rule, so the owner should choose it. |
| Flags on the `tau` command | `unit-2-host.md`, `packages/tau/src/command.ts` | The default is `127.0.0.1:6283`. No flag is named. | `--port` and a repeatable `--allow-host`. | Settings in the server's configuration file. |
| Model logins | `unit-2-host.md`, `unit-6-integration.md`, `packages/tau/src/credentials.ts` | [Host](../host.md) says to use the owner's pi logins. It names no store and no write rule. | Tau reads and writes pi's `auth.json` under pi's own lock, with `proper-lockfile` 4.1.2, and queues its own reads. | Read the logins and never write a refreshed one back. Do not go back to the first, unlocked write. It could erase another provider's login. |
| A resent answer after a fault, when the task's code is gone | `unit-1-store.md`, `packages/store/src/decisions.ts:245-256` | The `answer` table promises that an equal resend repeats, and creates the task again after a fault. `extension_not_loaded` is listed only for an open decision. | The resend is refused with `extension_not_loaded` and writes nothing. | Return the answered record as repeated and leave the fault visible. |
| A counter per subject | `unit-1-store.md` | [Primitives](../primitives.md) names the decision family and the open list. | A third stored document, `tau.decision.next`. It also keeps a read of a made-up ID from creating a document. | Another index. The arena's judge had asked for the check. |
| The type of `then` | `unit-1-store.md` | TypeScript checks that the task accepts every offered choice. | **Rolled back by the owner.** It was a new exported type, `ThenTask<C>`, that let a task accept more choices than offered. It is now pi-durable's own `Task`, which requires the same set. | None. This is the owner's choice. |
| How much of a leaked key counts | `unit-3-websearch.md` | A secret stays out of results, entries, errors, and logs. | A field that holds the first four characters of the key is replaced whole. One to three leading characters can still appear, and ordinary text that happens to match is lost. | Refuse a response that looks like it holds the key. |
| Two transport limits of web search | `unit-3-websearch.md` | A key belongs to one project. | Tavily's library reads proxy settings from the server's environment, and a proxy would carry the key. Exa's key header follows a redirect to another origin. Both are behaviours of the libraries. | Limit the supported provider, or fix them upstream. |
| Where W1 puts its worktree | `unit-5-w1.md`, `packages/w1/src/tasks.ts:203` | The walk stores a path. It chooses no place. | `<workdir>.w1-<conversation>`, beside the repository. | A configured root, or a directory under the repository's Git data. |
| Approval comments when the head moved | `unit-5-w1.md`, `packages/w1/src/tasks.ts:426-457` | Finding 22 allows carrying a comment forward or listing it as not acted on. | Listed as not acted on, although another build follows. | Carry them into the next build, which then owes a reply to each. |
| Revising a settled forecast | `unit-4-w2.md`, `packages/w2/src/forecast.ts:30-43` | The walk allows a revision. It does not forbid one after the score. | A revision needs an unsettled forecast, and a record needs a new key. | Allow a new version after the score and keep the old score. |
| A test-only export of web search | `unit-6-integration.md` | An extension module has `extension`, `options`, and `entry`. | `tau-websearch/testing` exports the constructor that takes a provider address. Only tests of `tau` may import it. | Test at a lower seam with no export. |

## Found last

**Reported.** The verifier of the last fix round (PR 102) passed it and listed these. The owner had the first one fixed and accepted the other two as they are.

| What | Where | Why it matters | The smallest fix |
| --- | --- | --- | --- |
| A replace ref can swap content after the review | `packages/w1/src/tasks.ts`, the hand-over text | **Fixed for the merge itself (PR 104).** The hand-over now says `git --no-replace-objects merge --ff-only <sha>`, and that checks out the reviewed content. The replace ref itself stays in the repository. A later ordinary command that rewrites the file, such as a stash, a checkout of another commit and back, or a pull, writes the swapped content (reported, the verifier's run on real Git). | Check `git for-each-ref refs/replace` after a hand-over and delete what is there with `git replace -d`. W1 does not say so. It is a sample. |
| W1 now ignores the server account's global Git configuration | `packages/w1/src/git.ts:15` | With a global `core.excludesFile`, the owner's `git status` is clean and W1 still refuses the publish as dirty. A global `safe.directory` is dropped too. Neither is set on this machine today. | Pass the global `core.excludesFile` to `status`, or keep global configuration for `status` and `worktree add`. |
| The key filter only looks for the first four characters | `packages/websearch/src/web-search.ts:89-90` | An echo of the key without its first four characters gets through, for example the key without its `sk-` start. | Record it, or match more than the start. |

Two smaller ones: `{ cwd, ...entry }` lets a workflow's `entry` replace the project's working directory, as the example in [Host](../host.md) is written; and W1 stores three stage names the walk does not have.

## Merges without a fresh verdict

The coordinator set itself the rule that each unit merges on an independent pass at its head. Seven merges broke it. Each had an independent FAIL on an earlier head, then a fix round, then a merge on the coordinator's own reading of the fix: PR 90, 93, 94, 95, 96, 97, and 98. PR 89 and PR 99 merged on an independent pass. The fix diffs were between 26 and 210 lines of the unit's own code.

After the reviewer flagged this, two more verifiers gave the missing verdicts on `render-core`. PR 90, 93, 95, 96, and 98 passed. PR 94 and PR 97 failed, each on one real defect. PR 101 and PR 102 fixed those, and both merged on an independent pass.

## Where the trail is weaker than it reads

- Some of the coordinator's "gate green" lines came from `nix flake check | tail`, which reports the exit status of `tail`. They do not show a failure, and the pull requests hold separate forced runs.
- One check reused a cached result and reran nothing.
- The row that says seven mutants failed names five in the pull request.
- The row that says nothing ran overnight is wrong in one point: the host's first verifier finished 14 minutes after the coordinator stopped.

## Not proven

A real model call and a real login refresh. A live search provider. A running pi beside Tau. A second machine, a phone, or a TLS proxy. Linux. The Nix sandbox on. Power loss. Two servers started in the same instant on an empty home. A workflow upgrade with a decision open. A login refresh that hangs.

## After the restructure

**Decided and reported.** On 2026-11-14 the owner changed the layout and how extensions load. [Layout, loading, and reload](../load.md) has those decisions. The restructure ran as twelve units, R1 to R12. Each merged on an independent pass at the merged head. This section lists what the owner should know from it. Nothing here blocks use.

| What | Where | What it means |
| --- | --- | --- |
| An unsafe extensions folder stops the server | `core/src/host/loader.ts` | If `~/.tau/extensions/` is writable by group or others, is owned by another user, or is not a folder, `tau` refuses to start and says how to fix it. The coordinator specified this. The owner's decision covered one broken extension, not the folder itself. The alternative is to start with nothing loaded. |
| Loaded code is trusted | `unit-r5.md`, limits | An extension whose top level calls `process.exit()` ends the server. One whose top level waits for ever stops the start. There is no sandbox and no deadline. |
| A refused install rolls back | `tools/install-extension.mjs` | When a running server refuses the reload, `install-extension` puts the previous store link back, so a restart still loads the last version that worked. |
| A flake sees only tracked files | `install-extension` | A new file in an extension is left out of an install until it is `git add`ed. The command warns. |
| Only TypeScript, and only `.ts` relative imports | `AGENTS.md` | An extension cannot hold a `.js` file, use an `enum`, or import a relative `.json` file. |
| Two links to one folder | `unit-r5.md` | The second name, in sorted order, is refused. A link that sorts before the real folder takes its place and then fails its name check, so neither loads. |
| Journeys under very heavy load | `unit-r12.md` | At a load average of 50 to 60, three W1 journeys failed inside the sandboxed check with a reset connection after 17 to 36 seconds. At 36 to 45 they passed. The cause was not found, and no retry was added. |
| The key filter, the same tool name twice, a schema that drops a secret marking | [Layout, loading, and reload](../load.md) | Accepted by the owner as they are. |

A second review of the trail, by `gpt-6-astra`, confirmed that all twelve merges had an independent pass at the merged head. It added these choices from the build notes as ones the owner may want to make:

| Choice | Where | The alternative |
| --- | --- | --- |
| `tau-extension/durable` also exports the names only tests use, such as the SQLite storage opener and the Node execution environment | `unit-r3.md` | Put them in `tau-extension/testing`. |
| A change to an extension's own npm dependency needs a restart, not a reload | `unit-r5.md` | Refuse to reload an extension that has dependencies of its own. |
| On shutdown the server finishes the structural call that is running and refuses the ones that wait, with `busy` | `unit-r6.md` | Let the waiting ones run too before closing. |
| The test-only export of web search was removed. The search journey writes a small entry file instead. | `unit-r9.md` | Keep the export the owner had accepted. |
| `tau/testing` has `fauxAnswer` and `openStore` and no `watchOpen` | `unit-r11.md` | Export `watchOpen` too, as the arena's design did. |
| The journeys' time limits went from 15 and 20 seconds to 180, with waits of up to 60 seconds on each event | `unit-r12.md` | Keep short limits and accept failures on a loaded machine. |

One window is still open in `install-extension`. If the process is killed with `SIGKILL` in the fraction of a second between placing a new link and learning that the server refused it, the refused version stays linked, and the next start does not load that extension. The link itself is never missing.

**Not proven by the restructure:** Linux; the Nix sandbox turned on; a real model or search provider; a real garbage collection while an install runs; a kill between two arbitrary instructions of a reload's publish step (it was killed while held inside one).
