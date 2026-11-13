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
| Secret echoes | Add a second redactor or use Webfox's existing outward boundary. | Use Webfox's credential redaction, select only search fields, and return fixed error messages. Do not emit progress or logs. | Published 4.11.0 `ExecutionRuntime.execute` returns `outward.value`. Removing our duplicate redactor left the echo test passing. The duplicate was deleted. A separate mutation that actually appended apiKey to output failed the test. |
| Runtime configuration | Inherit Webfox environment and files, or provide all configuration explicitly. | Explicit config, empty environment, literal cwd `/`, no retries, five results, Webfox's normal timeout. | There is one project key. Ambient configuration must not select credentials, commands or another provider. Five is Webfox's search default. |
| Workspace dependency installation | The flake feeds only root manifests to npm. Webfox in a workspace alone was fetched but absent from the built node_modules. Change the flake or add a root pin. | Add `webfox: 4.11.0` to root `package.json` as well. This is a scope exception. | Typecheck failed with TS2307. Listing the Nix dependency output confirmed Webfox was missing. The root pin is the smallest repair and leaves the flake and package boundaries unchanged. |
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

## Limits

No live provider call is authorized or tested. Fixture tests do not establish provider authentication, relevance, billing or upstream cancellation. Host HTTP redaction, the module import map and missing-code reporting belong to the host and composition units. This package tests its schema and secret-free tool surfaces, not a stand-in host response.
