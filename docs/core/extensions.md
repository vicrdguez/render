# Extensions

**Decided.** The extension is the main unit. A workflow is one kind of extension, the kind that Tau names and supports. Other extensions do other jobs. Web search is the first one planned, and sandboxing may follow.

**Decided.** Everything else in this file, too. The owner locked the design on 2026-11-13. It comes from the fourth arena, and [Extension arena](arena-ext.md) says which part came from where. The moves it leans on ran in `spikes/ext.mjs`, checks E1 to E12, with stand-ins for the host. No Tau code exists.

The earlier notes were written around workflows. This file corrects that, and [Host](host.md), [Primitives](primitives.md), and [Kit](kit.md) now use its names.

## What an extension is

An extension is a pi-durable `Extension` with no wrapper: a name with optional tools, prompt sections, hooks, wraps, and tasks (measured, `src/harness/types.ts:424-433`). The host knows one module for each name, from an import map that is code.

```ts
type ExtensionModule = {
	readonly extension: Extension;
	readonly options?: { schema: JsonSchema; get(tx: Tx): Promise<JsonObject>; set(tx: Tx, value: JsonObject): Promise<void> };
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
};
```

This is the `WorkflowModule` of the host pass under its right name. The host still never reads a key of an option and never decides which conversation an extension governs.

**A workflow is an extension whose module exports `entry`.** That is the whole difference. `entry` lets a client create a conversation of it, so `create` takes only such a name and refuses any other with `not_a_workflow`. Decision, Event, tasks, and options are open to every extension.

All three designs of the arena reached this definition. One added that a workflow "owns conversations". The judge was right that this is an extra rule: a tool extension may create a helper conversation without becoming a workflow.

## What a project selects

A project selects extension names. `Project` becomes `{ project, workdir, extensions }`, `bind` takes `extensions`, and `addExtensions` adds to the list. `coding-tools` is installed in every project and is not in the list.

Installing makes the code available. It does not decide which agent uses it. That is the next section.

## How an agent gets an extension's tools

pi-durable has two forms of selection on a conversation, and a third when there is none (measured, `src/harness/agent.ts:351-371`, E1 and E5):

- An exact list selects exactly those extensions.
- `{ add, remove }` starts from the harness's default, `settings.extensions`, and edits it.
- No selection follows the default. With no default, that means every installed extension.

Three designs were weighed.

| | Every conversation names its extensions. This was the design. | A project default that a conversation edits | An extension turns itself on for every agent |
| --- | --- | --- | --- |
| The bare agent and W1's designer can search | Only if the host copies the project's list and W1 names `websearch` | Yes | Yes |
| W1's reviewer cannot search | Yes | Yes, with an exact list | Only if W1 knows `websearch` and removes it |
| An extension added later reaches open conversations | Never | Those that follow the default, from their next model request | All, the reviewer too |
| New parts | A call that edits each conversation | One getter | A field that pi-durable's `Extension` does not have |

**The project default is the design.** All three candidates chose it. The owner decides for the project, and a role decides for itself.

The host passes each project's harness a getter for `settings.extensions`. pi-durable reads the settings at every use (measured, `src/harness/types.ts:630-633`). The default is `coding-tools`, then each extension in the project's list that has no `entry` and that the server has code for. A workflow is never in the default, so the walk's finding stays closed: a plain conversation does not carry W1's tools.

| Conversation | Selection | Gets |
| --- | --- | --- |
| The bare agent | None. The host stores `{ cwd, model }`. | The default: the coding tools, and `web_search` in a project that has `websearch` |
| W1's designer, an open role | `{ add: [W1] }`, and a tool filter that removes `write`, `edit`, and W1's other roles' tools | The default and `publish_design` |
| W1's implementer, a closed role | `[CodingTools, W1]` and its own tools, exactly | The coding tools and `publish_build` |
| W1's reviewer, a closed role | `[W1]` and its three tools, exactly | `show_diff`, `show_file`, `publish_review` |
| W2's agent, a closed role | `[W2]`, exactly | W2's three tools |

- **A closed role names its extensions and its tools exactly.** That is the rule for any role whose promise rests on what it cannot do. The reviewer cannot search, even if you ask it to in a chat, and no change to the project reaches it.
- **An open role removes its own extension's other tools by name.** `{ add: [W1] }` brings every tool of W1. The judge caught one design that removed only `write` and `edit` and so handed the designer the reviewer's tools.
- **The owner cannot open a closed role from a client.** In a project with W2 and `websearch`, a bare conversation can search and W2's agent cannot. That is the cost of this design, and the right default for a role whose tools are evidence.

### This changed a Decided line

The owner had ruled that the bare agent selects `coding-tools`. Under this design it follows the project default, which always starts with `coding-tools` and then holds what the owner added to the project. In a project with no other extension the two are the same. **Decided.** The owner agreed to the change: "makes sense in order to allow things like websearch".

### When the project's list grows

`addExtensions` writes `Project` in one commit, installs the code, and rebuilds the default.

- A conversation that follows the default is offered the new tools from its next model request, also in the middle of a run. The request in flight keeps the tools it had (measured, E2).
- A conversation with an exact list sees nothing (measured, E2, and H11 of `spikes/host.mjs`).
- A workflow that is added reaches no conversation, because no workflow is in the default.

So "no live work changes" in [Host](host.md) holds for workflows and for closed roles. It does not hold for a tool extension and an open conversation, and that is the point of adding one.

### When the server no longer has an extension

The project still opens. A selected name with no code is left out with no error, and comes back when the code does (measured, `src/harness/agent.ts:365-368`, E3). `projects` reports the name as missing. Its options stay stored. A call to its tool that a restart cut off gets an error result (measured, `src/harness/tool.ts:148-155,200-226`). A task of its own waits as `missing_task`.

## Options and secrets

Options work for any extension as they do for a workflow: `options(extension, schema)` in [Kit](kit.md), a document named `<extension>.options` in the project's store, and `setOptions` from a client.

```ts
export const WebsearchOptions = options(
	"websearch",
	obj({ provider: oneOf(["exa", "tavily"]), apiKey: str({ format: "secret", minLength: 1 }) }),
);
```

The host knows a second format name beside `model`: **`secret`**.

- `options` and `setOptions` reply `true` for a secret that is set, and never its value (measured with a stand-in, E4). A client shows a field that hides its input.
- The tool reads the key in the commit that uses it. The extension keeps it out of results, entries, events, sections, errors, and logs. After a search, no entry of the conversation held the key (measured, E4).
- **The key is plain text in the project's store, and in every backup of it.** An agent's shell that runs as the server's OS user can read it. This is the accepted limit on "only a human answers", applied to a secret.
- The key is per project. One key for all projects would sit in the server's configuration beside the model logins, which no client call sets today. Two candidates said that home may be the better one once two projects share an account. It is not designed.
- An unset option does not refuse a conversation. `create` checks only the options of the workflow it creates. A tool whose option is unset returns an error result that says so.

Three homes for the key were weighed: the server's environment, which no client can set and which `bash` passes to every command (measured, `src/tools/bash.ts:84-86`); a secrets store of the host for all projects, which needs a store, two calls, and a new module member; and the options document, which needs one format name.

- **Checks 1 and 2.** After `setOptions`, the `options` call would return the API key to every device that asks. pi-durable knows no secret.
- **Checks 3 and 4.** Only the host writes the reply to a client. It passes on the client clause alone, since `websearch` is the one extension with a key.
- **Check 5.** One format name. No vault and no new call.

## Web search, the first extension that is not a workflow

**Decided.** `websearch` joins W0, W1, and W2 as a proving case. It has one tool, `web_search`, its options, no task, and no `entry`.

**It is built on Webfox.** The owner chose that. Render v1 used Webfox's root library with Exa first and Tavily as the fallback, and found that Webfox's own adapter for pi-durable lost result content on pi-durable 1.4.0 (reported, the Web entries of `docs/spec.md` in this repository). Which Webfox version and entry point fit pi-durable 1.5.2, and which providers and keys the options name, is settled when the extension is built.

| It stresses | Where |
| --- | --- |
| A project binds an extension that is not a workflow | `bind` and `addExtensions` |
| An agent gets a tool that no workflow named | The project default |
| A closed role stays closed | W1's reviewer and W2's agent |
| A secret among the options | The `secret` format |
| The code goes missing | The start order in [Host](host.md) |

Whether its tool declares `replay: "safe"` is the extension's choice. A search changes nothing outside, and a repeat costs one more provider call. Two candidates disagreed, and neither is wrong.

## Rules for extension authors

These join the rules in [Proving workflows](workflows.md).

| Rule | Without it | Evidence |
| --- | --- | --- |
| A role whose promise rests on what it cannot do names its extensions and its tools exactly. | An extension the owner adds to the project reaches the role. | E1, E2 |
| An open role removes its extension's other tools by name. | The designer holds the reviewer's tools. | The judge, on candidate 2 |
| A tool that publishes outside state declares `callers: ["model"]` as well as `executionMode: "sequential"`. | A script tool such as codemode makes nested calls, and a nested call ignores `sequential`. A shell call can then overlap the publish. | `src/harness/types.ts:324-325,372-376`, E6 |
| A section checks who it is for. | A tool list does not hide a section. A closed role with exact tools still got its extension's section. | E7 |
| An extension keeps a secret out of results, entries, events, sections, errors, and logs. | The key reaches a transcript, and from there a client or a model. | E4 |

## The changes, by the admission rule

**The project default.** Host wiring.

- **Checks 1 and 2.** The bare agent cannot search in a project that has `websearch`. pi-durable has the setting and does not choose its value.
- **Checks 3 and 4.** Only the host opens a harness and passes its settings. The bare agent and W1's designer both follow the default.
- **Check 5.** One getter over a document the host already owns.

**Selecting extensions.** Host wiring. `ExtensionModule`, `Project.extensions`, and the renamed calls.

- **Checks 1 and 2.** `bind` cannot take `websearch`. pi-durable has no project.
- **Checks 3 and 4.** No extension runs before its registry exists. `websearch`, W1, W2, and every client need it.
- **Check 5.** One list in a document that exists, and new names for calls that exist.

**Check 4 of the admission rule** spoke of "two workflows". It now reads: "Two extensions that do different jobs use it with the same meaning, or a client that knows no extension cannot work without it." **Decided.** The owner agreed. W1 and W2 still count as two. Two search providers do not.

## Not verified

- `spikes/ext.mjs` used stand-in extensions, a faux model, and no search provider. It closed its stores cleanly and killed nothing.
- The real codemode did not run. E6 used a stand-in tool that makes two nested calls.
- A `web_search` call that a restart cuts off was read in the source, not run.
- The `secret` format ran as a check on the schema's `format` in a stand-in. pi-schema did not check it.
- The getter was not measured with many projects.
- Sandboxing is not designed. pi-durable takes an execution environment for the whole harness, not from an extension (measured, `test/examples/28-sandbox-per-conversation.ts:49`), so it will need a new member on the module.
