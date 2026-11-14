# Unit 3 web search

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Webfox version and entry | Keep v1's 4.8.0 or use the published 4.11.0 root library. Use the Durable adapter or own the one tool. | Pin `webfox` 4.11.0 and import `createWebfox` from its root. | npm publishes a root export and an optional pi-durable peer of `^1.0.0`. The root returns documents without the adapter's transcript mapping. Exa now uses HTTP directly rather than exa-js. |
| Providers | v1 had Exa first and Tavily fallback with two keys. The locked Tau schema has one provider and one key. | Require `provider` to be `exa` or `tavily`. Call only that provider. No default and no fallback. | This preserves the locked schema and needs no extra credential or policy. |
| Provider fixture | A fake result, a transport replacement, or Webfox's normal base URL setting. | A private extension constructor accepts provider base URLs. The public module exports the ordinary extension and options only. | Tests exercise the same tool through real Webfox and HTTP on 127.0.0.1. A model cannot change the endpoint. |
| Replay | A repeat is a harmless read, or a repeat may cost money. | Declare `replay: "unsafe"`. | A crash must not silently repeat a potentially charged request. A later explicit call is allowed. |
| Tool callers and execution | Publishing tools need sequential execution and model-only callers. Search does not publish. | Leave the normal parallel and nested caller defaults. | Search changes no outside state beyond a provider charge. No publishing restriction applies. |
| Result surface | Return Webfox's whole document or select useful search fields. | Validate the root document with pi-schema. Return provider, title, URL and snippet in ordinary tool output. | Content reaches the transcript. Provider metadata and error messages need not cross the boundary. |
| Secret echoes | Trust Webfox's whole-key redaction, replace each prefix, or discard a field with a matching prefix. | Replace a title, URL or snippet with `[redacted]` when it contains the first four characters of the project key. For keys shorter than four characters, match the whole key. Keep fixed errors and no progress or logs. | Webfox cuts snippets before removing secrets. A cut key evades its whole-key match. Dropping the field is simpler than replacing every possible prefix and cannot leave the rest of the fragment behind. Four characters catches the reported cuts without suppressing every common one-letter or two-letter match. Innocent text with the same prefix is also hidden. |
| Runtime configuration | Inherit Webfox environment and files, or provide all configuration explicitly. | Explicit config, empty environment, literal cwd `/`, no retries, five results, Webfox's normal timeout. | There is one project key. Ambient configuration must not select credentials, commands or another provider. Five is Webfox's search default. |
| Workspace dependency installation | Keep the duplicate root pin, or give npm the workspace manifests. | Remove the root Webfox pin. Include package manifests in the dependency source and copy them before npm runs. Remove its broken workspace links after install. | The package now owns its dependency version. Source files do not enter the dependency input. The workspace regression test checks that each declared dependency is installed at its exact version. A clean checkout is needed to expose the old omission because managed links can retain an older external dependency. |
| Package registration | Add a boundary row or reuse the existing one. | Reuse `tau-websearch` in `boundaries.json`. Add a root TypeScript reference and lock entry. | The base already grants this package the required kit and test-only store imports. |

## Failure list and tests written before implementation

All tests are in `packages/websearch/test/search.test.ts`.

| Failure | Test |
| --- | --- |
| Crash repeats a charged search | interrupted unsafe search returns an interruption after SIGKILL without repeating the provider call |
| Wrong module exports, tool declarations or options schema | module exports only extension and options and fits ExtensionModule |
| Open role misses search or closed role gains it | project default reaches bare and open roles, never closed roles, including the next request of a running agent |
| Missing options prevent unrelated creation or contact the provider | unset or invalid project options return a safe tool error and do not prevent conversation creation |
| Root adapter loses content or caches old credentials | exa root Webfox content survives real pi-durable serialization and options are read at each call; tavily counterpart |
| Empty result triggers fallback or malformed content is accepted | empty search succeeds without fallback and malformed provider results become safe errors |
| Key escapes through provider echo, result, transcript, event, section, error or log | provider errors and echoed keys never reach results, entries, events, sections, errors or logs |
| Model chooses credentials or endpoint, or a project borrows another key | model cannot set provider, key or base URL and another project cannot borrow its key |
| Nonpublishing search cannot be nested or adds an unguarded section | search is callable by another tool and introduces no sections to closed tool selections |
| Missing code destroys options on restart | missing code on reopen leaves options intact and search returns when code is installed |
| A cut key escapes in a title, URL or snippet | Eight subtests of provider errors and echoed keys cover both providers with all but one, all but two, half, and four leading characters. Each checks the result, entries and next model request. |
| Webfox errors reach the model | The echo test requires the fixed error text and its presence in the next request. |
| Provider score, metadata or Tavily answer reaches the model | Each provider requests five hits and returns only titles URLs and snippets. Exact result shape and private markers are checked. |
| Webfox inherits the server environment | search does not read the server environment for Webfox configuration. A throwing environment getter makes a read visible while the real provider request still succeeds. This is an access test, not a claim about SDK proxy isolation. |
| Search count changes | Both provider requests must ask for five results and return five of six fixture hits. |
| A package-only dependency is missing | `tools/workspace.test.mjs` checks every declared workspace dependency is installed at its declared version. |

The initial stub run compiled. It had 11 tests, four passes and seven behavioral failures. The failures included missing content, no provider request, missing setup errors and failed nested search. The failure output is retained in the unit owner's `/tmp/tau-u3-red.log`. The Tavily HTTP fixture initially omitted its required `images` array. Adding the array repaired fixture fidelity, without adding a test after implementation.

## npm facts

`npm view webfox version exports peerDependencies dependencies --json` reported 4.11.0. Its exports are `.`, `./pi`, `./durable`, and `./config.schema.json`. Root types and JavaScript are `dist/index.d.ts` and `dist/index.js`. Its Node requirement is `>=22.0.0`; the flake supplies Node 24.22.1.

The peers are `typebox: *`, `@earendil-works/pi-durable: ^1.0.0`, `@earendil-works/pi-tui: *`, and `@earendil-works/pi-coding-agent: *`. All but typebox are optional. Neither coding-agent nor tui entered the lock. pi-durable and its siblings remain at 1.5.2.

The lock adds 39 external package entries and two workspace entries. Webfox's direct dependency closure pins `@perplexity-ai/perplexity_ai` 0.41.0, `@tavily/core` 0.7.14, `cloudflare` 7.3.0, `commander` 14.0.3, `openai` 7.56.0 nested under Webfox, `parallel-web` 1.3.7, `picocolors` 1.1.1, `valyu-js` 2.11.5, and `yaml` 2.9.1. The required peer adds typebox 1.4.7. Other added entries are their HTTP and utility dependencies. The root library does not import the optional Pi adapters.

## Verification

The focused command is `nix develop -c env test tau-websearch`. The cumulative command is `nix develop -c check`. Use `/nix/var/nix/profiles/default/bin/nix` on this machine.

Three mutations compiled and failed their focused test. Each was reverted before the cumulative check.

| Change | Focused test | Observed failure |
| --- | --- | --- |
| Append apiKey to serialized output | provider errors and echoed keys | `exa 200 leaked in result` |
| Replace the snippet with an empty string | exa root Webfox content | Missing `EXA-CONTENT-END` |
| Permit an empty provider URL | empty search succeeds | `false !== true` for the expected tool error |

Before the upstream merge, the cumulative check passed 89 tests and all six unchanged design spikes. It included the real store's K1 to K6 checks and this package's SIGKILL check. One measured run took 17.68 seconds wall time. That includes command setup, lint, compile, all tests and spikes. It is a runtime sample, not a comparative performance claim. Logs are `/tmp/tau-u3-check.log` and `/tmp/tau-u3-mutation-{secret,content,validation}.log` on the unit owner's machine.

The package-only emitted test run passed all 11 tests in 577.583 milliseconds. This is one Node test-runner sample. It includes real localhost HTTP, one killed child, SQLite reopen and MemoryStorage harnesses. It excludes compilation. The failed-run count was zero and both providers' expected content markers were present.

A fresh checkout of the implementation commit passed `nix flake check -L`. This Nix version rejects `flake check --rebuild`, so all four check outputs were then forced through `nix build -L --no-link --rebuild .#checks.aarch64-darwin.lint .#checks.aarch64-darwin.typecheck .#checks.aarch64-darwin.test .#checks.aarch64-darwin.spikes`. Both commands exited zero. The coordinator then requested the verified store and kit merge. Final source-specific results after that merge are in the PR and unit report.

Importing the emitted package printed `[ 'extension', 'options' ]`. The retained type assignment checks the structural `ExtensionModule` contract without importing the unfinished host.

## Fix-round evidence

The new tests were committed before the tool and flake fixes. The first package run failed all eight cut-key subtests. It reported 13 passes and 9 failures including the parent test. After the tool fix it reported 22 passes, no failures, in 647.027 milliseconds. These are single Node test-runner samples including the local HTTP and crash tests, not a speed comparison.

Four temporary mutants compiled and failed, then were reverted. Passing Webfox's error document through failed the fixed-message assertion. Returning whole hits failed on Exa's score and Tavily's score and answer metadata. Passing `process.env` failed the environment access test. Asking for six hits failed both providers with `6 !== 5`. The abort-signal mutant was not run because Tavily ignores the signal. Changing the closed-role fixture to an open selection also failed on the extra `coding-tools` and `websearch` extensions, even with its own exact tool list.

Removing the root pin with the old flake failed the new workspace check in a clean checkout. The existing worktree first passed because it retained an old external dependency link. The clean checkout, not that stale directory, is the regression evidence. With the flake fix, the check passed and `import.meta.resolve("webfox")` returned the Nix-store entry while the root manifest had no Webfox dependency. A source-only edit followed by `nix develop -c typecheck` kept the same dependency store path and built no dependency derivation. Full command output and final pushed-head gate evidence are attached to PR 95.

## Limits

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Short key fragments | Hide every one-character match or start at four characters. | A cut key with only one, two or three leading characters can still appear in returned text. A whole key shorter than four characters is matched. | Single-character and very short matches would erase ordinary results. This is a stated limit, not a claim of complete fragment secrecy. |
| Tavily environment | The empty Webfox environment isolates everything, or its SDK reads the process environment itself. | `@tavily/core` reads `TAVILY_HTTP_PROXY`, `TAVILY_HTTPS_PROXY`, `TAVILY_PROJECT`, and `TAVILY_ORG_ID` from the server environment whatever the tool passes. A proxy set there would carry the key. | The empty environment applies to Webfox, not these SDK reads. Do not set an untrusted proxy on the server. |
| Exa redirects | The API key stays at the first origin, or fetch forwards its custom header. | On a redirect to another origin Exa's `x-api-key` header goes along. | The adapter uses fetch without a redirect restriction. This fix does not replace its transport. |
| Live service | Fixture evidence proves provider authentication, or only the local integration. | No live provider call was made. | No live key was used. The gate only calls local providers. |

No live provider call is authorized or tested. Fixture tests do not establish provider authentication, relevance, billing or upstream cancellation. Host HTTP redaction, the module import map and missing-code reporting belong to the host and composition units. This package tests its schema and secret-free tool surfaces, not a stand-in host response.

## Closure round

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Three-character prefix | Hide three leading characters, or retain the four-character rule. | Keep the implementation unchanged. Both provider tests return a snippet with only three matching characters unchanged and replace a snippet with four matching characters. | The new tests pass the starting code. Changing the emitted filter from four to three made both tests fail. The mutation was reverted. |
| Split provider echoes | Match across every field and result, or filter each field. | A key split across two fields or across two results can get through when no single field contains the matched prefix. | The filter sees each title, URL and snippet alone. This round documents the limit and does not join unrelated fields to chase provider transformations. |
| Transformed provider echoes | Decode or normalize arbitrary provider output, or match literal text. | Another letter case, URL encoding and base64 can get through. | Each requires the provider to transform the key. The literal filter cannot recognize arbitrary transformations. No code change tries to chase them. |
| Common key prefixes | Match common prefixes or special-case them. | A key that starts with common text, such as `https` or a year, can make the filter replace nearly every field. | Four-character matching trades false positives for hiding cut keys. It is not a complete secret filter. |
| Removed external dependencies in a reused worktree | Keep old external links, or remove links absent from the current dependency set. | Remove stale symlinks in the managed `node_modules` directory, whether they point to workspace packages or external dependencies. | The old dependency can otherwise mask a missing declaration locally. Two tests cover scoped and unscoped links with a new external directory. Both failed before the link-tool fix and passed after it. The fresh checkout and gate were not affected by the stale-link bug. |
