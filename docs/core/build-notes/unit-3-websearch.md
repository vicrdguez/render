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
| Secret echoes | Trust provider text or redact the configured key. | Redact the key from each returned string. Use fixed error messages. Do not emit progress or logs. | Providers can echo credentials in successful text or failures. |
| Runtime configuration | Inherit Webfox environment and files, or provide all configuration explicitly. | Explicit config, empty environment, literal cwd `/`, no retries, five results, Webfox's normal timeout. | There is one project key. Ambient configuration must not select credentials, commands or another provider. Five is Webfox's search default. |
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

The initial stub run compiled. It had 11 tests, four passes and seven behavioral failures. The failures included missing content, no provider request, missing setup errors and failed nested search. The failure output is retained in the unit owner's `/tmp/tau-u3-red.log`.

## Limits

No live provider call is authorized or tested. Fixture tests do not establish provider authentication, relevance, billing or upstream cancellation. Host HTTP redaction, the module import map and missing-code reporting belong to the host and composition units. This package tests its schema and secret-free tool surfaces, not a stand-in host response.
