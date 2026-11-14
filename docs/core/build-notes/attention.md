# What the owner should look at first

**Reported.** A reviewer on another model family (`gpt-6-astra`) read the decision trail, every build note, the pull requests, and parts of the coordinator's transcript on 2026-11-14. It changed nothing. This file is what it flagged, in the coordinator's words. Each choice below can be rolled back for the alternative.

## Choices that are not small

| Choice | Where | What the design says | What was taken | The alternative |
| --- | --- | --- | --- | --- |
| How `Host` and `Origin` are checked | `unit-2-host.md`, `packages/host/src/http.ts:30-68` | [Protocol](../protocol.md) requires both checks. It gives no rule for what is allowed. | Only host names are compared. Any allowed host name passes as an `Origin`, whatever its scheme or port. | A list of allowed origins, kept apart from the proxy's host names. This is a security rule, so the owner should choose it. |
| Flags on the `tau` command | `unit-2-host.md`, `packages/tau/src/command.ts` | The default is `127.0.0.1:6283`. No flag is named. | `--port` and a repeatable `--allow-host`. | Settings in the server's configuration file. |
| Model logins | `unit-2-host.md`, `unit-6-integration.md`, `packages/tau/src/credentials.ts` | [Host](../host.md) says to use the owner's pi logins. It names no store and no write rule. | Tau reads and writes pi's `auth.json` under pi's own lock, with `proper-lockfile` 4.1.2, and queues its own reads. | Read the logins and never write a refreshed one back. Do not go back to the first, unlocked write. It could erase another provider's login. |
| A resent answer after a fault, when the task's code is gone | `unit-1-store.md`, `packages/store/src/decisions.ts:245-256` | The `answer` table promises that an equal resend repeats, and creates the task again after a fault. `extension_not_loaded` is listed only for an open decision. | The resend is refused with `extension_not_loaded` and writes nothing. | Return the answered record as repeated and leave the fault visible. |
| A counter per subject | `unit-1-store.md` | [Primitives](../primitives.md) names the decision family and the open list. | A third stored document, `tau.decision.next`. It also keeps a read of a made-up ID from creating a document. | Another index. The arena's judge had asked for the check. |
| The type of `then` | `unit-1-store.md` | TypeScript checks that the task accepts every offered choice. | A new exported type, `ThenTask<C>`, that checks only the task's name and its first input. | Another type that allows a task to accept more than is offered. pi-durable's own `Task` type refuses that. |
| How much of a leaked key counts | `unit-3-websearch.md` | A secret stays out of results, entries, errors, and logs. | A field that holds the first four characters of the key is replaced whole. One to three leading characters can still appear, and ordinary text that happens to match is lost. | Refuse a response that looks like it holds the key. |
| Two transport limits of web search | `unit-3-websearch.md` | A key belongs to one project. | Tavily's library reads proxy settings from the server's environment, and a proxy would carry the key. Exa's key header follows a redirect to another origin. Both are behaviours of the libraries. | Limit the supported provider, or fix them upstream. |
| Where W1 puts its worktree | `unit-5-w1.md`, `packages/w1/src/tasks.ts:203` | The walk stores a path. It chooses no place. | `<workdir>.w1-<conversation>`, beside the repository. | A configured root, or a directory under the repository's Git data. |
| Approval comments when the head moved | `unit-5-w1.md`, `packages/w1/src/tasks.ts:426-457` | Finding 22 allows carrying a comment forward or listing it as not acted on. | Listed as not acted on, although another build follows. | Carry them into the next build, which then owes a reply to each. |
| Revising a settled forecast | `unit-4-w2.md`, `packages/w2/src/forecast.ts:30-43` | The walk allows a revision. It does not forbid one after the score. | A revision needs an unsettled forecast, and a record needs a new key. | Allow a new version after the score and keep the old score. |
| A test-only export of web search | `unit-6-integration.md` | An extension module has `extension`, `options`, and `entry`. | `tau-websearch/testing` exports the constructor that takes a provider address. Only tests of `tau` may import it. | Test at a lower seam with no export. |

Two smaller ones: `{ cwd, ...entry }` lets a workflow's `entry` replace the project's working directory, as the example in [Host](../host.md) is written; and W1 stores three stage names the walk does not have.

## Merges without a fresh verdict

The coordinator set itself the rule that each unit merges on an independent pass at its head. Seven merges broke it. Each had an independent FAIL on an earlier head, then a fix round, then a merge on the coordinator's own reading of the fix: PR 90, 93, 94, 95, 96, 97, and 98. PR 89 and PR 99 merged on an independent pass. The fix diffs were between 26 and 210 lines of the unit's own code.

After the reviewer flagged this, two more verifiers were asked for the missing verdicts on today's `render-core`. Their results are in `../build-log.tsv`.

## Where the trail is weaker than it reads

- Some of the coordinator's "gate green" lines came from `nix flake check | tail`, which reports the exit status of `tail`. They do not show a failure, and the pull requests hold separate forced runs.
- One check reused a cached result and reran nothing.
- The row that says seven mutants failed names five in the pull request.
- The row that says nothing ran overnight is wrong in one point: the host's first verifier finished 14 minutes after the coordinator stopped.

## Not proven

A real model call and a real login refresh. A live search provider. A running pi beside Tau. A second machine, a phone, or a TLS proxy. Linux. The Nix sandbox on. Power loss. Two servers started in the same instant on an empty home. A workflow upgrade with a decision open. A login refresh that hangs.
