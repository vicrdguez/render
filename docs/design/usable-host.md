# Usable host

This design covers the work that turns Render v1 into the host the operator uses every day in place of pi. Owners build against the Reference part, and audits check delivered work against its rules. Nothing here is implemented. The base is `proposal/render-v1` at `eea2a7c`.

The document has two parts. **About this design** explains the goal, the settled operator decisions and the calls this document makes. **Reference** lists, piece by piece, the interface changes, the behavior rules and the verification, then the build order and what stays out of scope.

## About this design

### The goal

The operator wants to stop opening pi for everyday coding and drive Render from the Render desktop app instead. They type a prompt and the coordinator starts by itself. They chat with it as they would with pi. One host serves any number of repositories, settings are edited from the desktop, and models run through the operator's existing pi logins.

### What v1 lacks

The ten v1 Slices built authority, records and role execution. They did not build the parts a person touches first.

- No production code issues `assignTask`. The `durable-role-work` Slice excluded "full design/delivery playbooks, generic scheduler/runner", and `docs/operations.md` says "Full design/delivery playbooks are not installed".
- The coordinator never replies. `UNAVAILABLE` in `src/kernel/kernel.ts` lists `coordinator-replies`, every workflow view reports `messages.coordinator: "unavailable"`, and `postCoordinatorMessage` only retains text.
- The ordinary host has no model credentials. `Engine` reads one `apiKey` as `ANTHROPIC_API_KEY`, registers only `anthropicProvider()`, and `RolePacket.provider` is the literal `"anthropic"`. The CLI host reports `native_provider_configuration_missing`.
- Repositories are static host configuration (`OwnedChecks.repositories`, `investigations.repositories`, `ForgeConfig.repositories`), not records a human adds.
- Families, models and budgets live in `EngineConfig` and in test fixtures, so no client can edit them.
- Ledger owns the HTTP listener (`src/ledger/http.ts`), so every client-protocol change edits the authority module.

### How the pieces fit

The five modules and their authority split stay. Ledger still accepts every command, Kernel still decides legality, and Engine still schedules. Two things change. The client no longer talks to Ledger's own listener, and Engine may now start work without a human or a test issuing `assignTask`.

Transport extraction comes first because every later piece adds routes, such as the secrets route and the live chat stream, and none of them should edit Ledger. After the move, Ledger exposes a domain API and keeps principal establishment. The host transport authenticates through that seam, routes requests and maps wire frames. Engine gains one read-only method that streams a coordinator conversation's live events for a scope Ledger has authorized.

Models, projects and settings are the configuration a usable host needs before anything can run. Models reuse the operator's pi logins from `~/.pi/agent/auth.json` through a credential store that takes pi's own lock, so pi and Render can refresh the same token without overwriting each other. Projects turn repositories into Ledger records with a private mirror per project. Settings move families, model entries and role templates into immutable Ledger revisions that the human changes with an expected revision, the way policy and checkpoint settings already work.

The launcher and chat make the host usable. Engine gets a playbook table, and its reconcile becomes the only production issuer of `assignTask`. A human message to a new workflow starts the coordinator. Acceptance of an intake starts the implementer. Chat uses the coordinator's pi-durable conversation the same way pi uses its own, with Ledger commands in front so that every prompt, steer, follow-up, withdrawal and interrupt has an id and a receipt. These changes reuse the existing Kernel checks, so the launcher cannot assign anything that a legitimate human or agent action could not cause.

The CLI decision commands, a live delivery and the desktop adapter come last. Each one consumes host-authored decision bases, so no client recomputes a Kernel rule.

### Settled operator decisions

The operator decided the following. Owners implement them as stated. A change to any of them needs the operator.

**D1. Transport extraction.** HTTP, transport and the client protocol move out of Ledger into the `host` layer. Ledger keeps authority, persistence and principal establishment. The host asks Ledger to authenticate and receives an unforgeable context. Ledger exposes a domain API of `command`, `observe`, `artifact`, history and export, `receipt` and `messages`. Engine gains one read-only method that watches a conversation's live events for a scope, and the host routes. The operator's rationale is that the client protocol can evolve without changing internal modules, and internal modules can change without changing the protocol. Ledger and Engine stop facing clients. Rejected alternatives are Ledger delegating to Engine, which reverses the dependency, and an Engine HTTP listener, which opens a second authentication door.

**D2. Models through the operator's pi logins.** Render uses the native Pi AI 1.4.0 providers `anthropic` (Claude) and `openai` (ChatGPT). Pi stores the ChatGPT login under `openai`, not `openai-codex`. Both authenticate with the operator's pi logins in `~/.pi/agent/auth.json`, through a Render `CredentialStore` that follows pi's lock protocol on the same file. That protocol is a `proper-lockfile` lock, a re-read under the lock, and the token refresh inside `modify`. API keys for other providers, such as DeepSeek, live in a Render host-only secrets file. The pi-claude-bridge is not used. R2-A003 stands, amended only to record that the native Claude provider authenticates with the operator's existing pi OAuth login. Engine registers one provider per configured family, and `RolePacket.provider` stops being the literal `"anthropic"`. The 1.4.0 catalog lacks some current models, such as `gpt-6.1-terra`, so settings can add model entries. The external coupling is pi's `auth.json` format and lock protocol, and one credential-store module contains it. Billing treatment of subscription traffic is unverified, and the operator accepts that. The evidence is two live requests on 2026-11-09, kept in `/tmp/grounding-live`. One went through `openai` with `gpt-6.1-sol` and one through native `anthropic` OAuth with `claude-haiku-5-5`, and each returned "ok".

**D3. Launcher.** Engine owns a playbook table that lists, per task shape, the roles, their order and their role templates. Engine's reconcile is the only production issuer of host `assignTask`. A saved prompt starts the coordinator, whose packet carries the `fidelity` challenger request. The existing Ground investigation flow drafts Ground and the task shape, and the human confirms a classifier-proposed shape. After `acceptIntake`, reconcile starts the implementer, whose packet carries the `standards`, `contracts` and `watchdog` requests. The defaults are Claude writers and ChatGPT reviewers, because the default policy needs a different reviewer family. The launcher is automatic and has no human start command.

**D4. Projects.** Kernel and Ledger gain a `Project` record with a name, a remote, a default branch and a check image. Only a human adds or edits a project, and a host has any number of them. `createWorkflow` names its project, and the project never changes for that workflow. Effects keeps a private bare mirror per project and fetches into it before preparation. Work runs locally, and GitHub serves only presentation, the human's merge and backup. Engine resolves project facts from Ledger and passes them in Effects operations, and Effects never reads Ledger. The forge target comes from the project remote. Device workflow scoping hides other projects, and export includes projects.

**D5. Settings.** Non-secret settings are immutable Ledger revisions that the human changes with expected-revision commands, the same pattern as checkpoint settings and policy. They cover role templates, model entries, families, the per-project check image and policy. Engine reads the current revision when it renders a packet, and packets keep pinning values. Secrets, meaning API keys and the GitHub token, live in a host-only `0600` file. The human sets them from the desktop through an authenticated route, and nobody reads them back.

**D6. Chat.** Human prompt, steer, follow-up and interrupt are Ledger commands with ids and receipts. Engine submits a message to the coordinator's pi-durable conversation with `requestId` equal to the command id, `whenBusy` equal to the mode the client pinned, and the entry `{kind: "render.human", data: {device, commandId}}`. Withdrawal is `abortSubmission`. Interrupt is `conversation.abort`, not `cancelWork`, so role tasks survive. Live events come from Engine's watch through the host transport. The committed transcript stays in pi-durable storage, and Ledger reads it for history and export. Three runtime changes follow. The role-work round, which today waits for one submission, must allow human-driven runs. Human-started runs count against the four executing slots. The coordinator "unavailable" marker goes away. A late steer follows Pi and arrives as the start of the next run. The UI specification will be updated to match.

**D7. Desktop.** The desktop gets an HTTP adapter over the host transport. The host authors the decision bases for `acceptIntake`, `approveCheckpoint` and `cancelWork`. The restore and backup UI is removed, because disaster recovery is deferred (#49).

### Design calls made here

This document makes the following calls that the operator did not decide. Each one names the alternative the operator could choose instead.

**X1. A project's remote never changes.** `editProject` changes the name, default branch, check image and principles path, not the remote. Open proposals publish to the remote they started with, so a changed remote would move their forge target under them. A different remote is a new project. The operator could instead allow remote edits that apply only to workflows created afterwards.

**X2. The pi login file is named explicitly.** `render serve --pi-auth <path>` names the file, and without the flag every `pi-login` family blocks with `native_provider_configuration_missing`. The spec forbids ambient home and configuration discovery by host libraries (§6.6), and an explicit flag keeps that rule. The operator could instead have the host default to `~/.pi/agent/auth.json`.

**X3. Render depends on `proper-lockfile` 4.1.2.** This is the version that pi-coding-agent 1.5.0 pins and uses for `auth.json`. Using the same library is the cheapest way to take a lock that pi honors. The alternative is to reimplement its directory lock and stale detection, which leaves two implementations to keep in step.

**X4. A chat coordinator has an `idle` state and a per-run turn budget.** Between runs, the coordinator holds its conversation and no executing slot. Today a role that ends a round without submitting becomes blocked with `role_did_not_submit`, and `maxTurns` counts provider requests over the whole assignment. For a chat coordinator, `maxTurns` bounds the provider requests of one run. The alternative is a fixed lifetime budget, which would end a chat after a set number of turns.

**X5. The coordinator reads source through three host tools.** `list_source`, `read_source` and `grep_source` read literal Git objects of one pinned commit through Effects, with no checkout and no shell. The spec gives the coordinator read-only source and no coding shell (§6.2), and the investigation packet's host-chosen paths cannot serve a chat that starts from an arbitrary prompt. The operator could instead give the coordinator a read-only Linux container with `rg`, at the cost of a container per chat.

**X6. The coordinator proposes Ground as a draft.** The catalogued but unavailable `saveDraft` command becomes available for one document, the coordinator's Ground proposal. The human confirms it by saving `ground` with the proposed bytes and `shape.confirmed: true`, which keeps Ground human-authored. The operator could instead have the human write Ground from scratch.

**X7. Live chat frames carry pi-durable 1.4.0 `AgentEvent` batches.** The host transport removes the same two fields that export already redacts, `hidden_reasoning` and `opaque_provider_fields`, and frame `version: 1` pins the event schema to pi-durable 1.4.0. A runtime upgrade that changes `AgentEvent` bumps the chat frame version. The alternative is a Render-owned event vocabulary that the transport maps to, which costs a translation layer and its tests.

**X8. Secrets stay out of Ledger entirely.** No command, receipt or record names a secret's value or digest. `GET /v1/secrets` lists names and whether each is set. The alternative is a Ledger receipt for each replacement, which gives attribution at the cost of an ordering problem between the file write and the commit.

**X9. Instruction prose stays in Engine, and principles come from the project.** Settings choose the model, thinking level and budgets per role template. The instruction text stays the Engine's built-in text until #59 designs agent prose. A packet's principles are the literal bytes of the project's principles file (default `AGENTS.md`) at the pinned commit. A missing file is retained as an explicit "no principle statements at `<path>`" document, not a blocker. The operator could instead put instruction text into settings now, ahead of #59.

**X10. Check images are pinned by digest.** `checkImage` must have the form `<name>@sha256:<64 hex>`. Sandboxes records the image as part of source and verifier identity, and a tag can move. The operator could instead accept tags and have the host resolve and record the digest at use.

**X11. The launcher does not start experiments.** An `experiment` shape blocks with `playbook_unavailable: experiment`. An experiment needs a prewritten protocol and per-candidate packets (§8.1) that one delivery does not need. The operator could instead ask for an experiment playbook as a separate piece.

## Reference

### Module boundaries after this design

| Module | Gains | Loses |
|---|---|---|
| Host (`src/host`, composition root and transport, not a sixth module) | HTTP device listener and admin socket, route table, wire frames, chat stream route, secrets route, `src/host/secrets.ts` | |
| Ledger | `Principals` seam handed only to the host, `observe(context, {conversation})`, `Project`, `EngineSettings`, chat message records | `src/ledger/http.ts`, `Ledger.authenticate` |
| Kernel | Project, settings and chat commands, `idle` assignment state | `UNAVAILABLE` entry `coordinator-replies` |
| Engine | Playbook table and launcher in `reconcile`, `watch`, provider table, credential store, source tools, message delivery | `EngineConfig.apiKey`, `EngineConfig.families`, repository maps |
| Effects | Project mirror and `fetch`, `ProjectFacts` in operations, forge target from the remote | `repositories` maps in its constructor and in `ForgeConfig` |
| Sandboxes | Image from the project's `checkImage` | |

A lint rule enforces the boundary. Biome `noRestrictedImports` fails when a file under `src/ledger`, `src/kernel`, `src/engine`, `src/effects` or `src/sandboxes` imports `node:http`, `node:net` or anything under `src/host`. It also fails when a file outside `src/ledger` imports `mintContext`.

### Piece 1. Transport extraction (Wave 1)

The move is behavior-identical. Every route, status code, body, frame and refusal stays byte-for-byte the same.

#### Changes

- `src/ledger/http.ts` moves to `src/host/transport.ts`. The file keeps `STATUS`, body limits, NDJSON observation and the slow-observer bound.
- `Ledger.authenticate` and the admin route's direct `mintContext` call move behind a `Principals` seam that `openLedger` returns. The composition root hands `principals` to the transport only. Engine never receives it.
- Tests that import `deviceServer` or `adminServer` from `src/ledger/http.ts` change only their import path and pass `principals`.

```ts
// src/ledger/principals.ts
export type Principals = {
	/** Device bearer from an Authorization header. Undefined when missing, unknown or revoked. */
	device(authorization: string | undefined): AuthenticatedContext | undefined;
	/** The OS owner who reached the 0600 admin socket. */
	localAdmin(): AuthenticatedContext;
	/** A current human with project-wide scope: an all-workflow device or the local admin. */
	projectWideHuman(context: AuthenticatedContext): boolean;
};

// src/ledger/startup.ts
export type OpenedLedger = { readonly ledger: Ledger; readonly principals: Principals /* existing fields unchanged */ };

// src/host/transport.ts
export function deviceServer(api: HostApi, principals: Principals): Server;
export function adminServer(api: HostApi, principals: Principals, socketPath: string): Effect.Effect<Server, unknown>;
export type HostApi = { readonly ledger: Ledger }; // Piece 6 adds `engine`
```

The Ledger domain API keeps its current signatures.

```ts
command(raw: unknown, context: AuthenticatedContext): Effect.Effect<CommandReply, unknown>;
snapshot(context: AuthenticatedContext): Frame | LedgerRefusal;
observe(context: AuthenticatedContext, sink: { send(frame: Frame): void; end(frame: Frame): void }): Effect.Effect<{ snapshot: Frame; stop(): void } | LedgerRefusal>;
observe(context: AuthenticatedContext, request: { history: HistoryQuery }): Effect.Effect<HistoryPage | LedgerRefusal, unknown>;
artifact(context: AuthenticatedContext, request: { read: string } | { upload: unknown }): Effect.Effect<Artifact | LedgerRefusal, unknown>;
artifact(context: AuthenticatedContext, request: { export: HistoryQuery }): Effect.Effect<HistoryExport | LedgerRefusal, unknown>;
receipt(context: AuthenticatedContext, commandId: string): Effect.Effect<ReceiptBody | LedgerRefusal, unknown>;
messages(context: AuthenticatedContext, workflow: string, cursor: number | undefined, limit: number): Effect.Effect<MessagePage | LedgerRefusal, unknown>;
status(): HostStatus;
```

#### Rules

- **T1.** Given any request the current protocol tests send, when the extracted host serves it, then the status, headers and body equal what `src/ledger/http.ts` returned.
- **T2.** Given a file under `src/ledger`, `src/kernel`, `src/engine`, `src/effects` or `src/sandboxes`, when it imports `node:http`, `node:net` or `src/host`, then `npm run lint` fails.
- **T3.** Given a context object that `Principals` did not mint, when a caller passes it to any Ledger method, then Ledger refuses with `untrusted_context`.
- **T4.** Given a revoked device, when its next request arrives, then the transport answers `401 unauthorized` and Ledger closes its observation streams, as today.

#### Verification

Before code, owners write failure cases for a route that answers differently, a refusal whose status changes, an admin socket that mints a context without `Principals`, and a module that imports `node:http`. The evidence is `npm run verify:gate` passing with only import-path changes in `test/`, so `git diff -- test` shows no assertion changes. One lint fixture imports `node:http` from `src/ledger` and must fail.

### Piece 2. Models and logins (Wave 1)

#### Changes

```ts
// src/engine/providers.ts: the providers Render can register, from pinned Pi AI 1.4.0
export const PROVIDERS = { anthropic: anthropicProvider, openai: openaiProvider, deepseek: deepseekProvider } as const;
export type ProviderId = keyof typeof PROVIDERS;
export type Family = { readonly name: string; readonly provider: ProviderId; readonly auth: "pi-login" | "api-key" };

// src/engine/credentials.ts: the only module that knows pi's auth.json format and lock protocol
export function credentialStore(options: {
	readonly piAuth: string | undefined;
	readonly secrets: SecretsFile;
	readonly families: () => readonly Family[];
}): CredentialStore;

// src/kernel/roles.ts
export type RolePacket = { /* unchanged fields */ provider: ProviderId };
```

- `credentialStore.read(provider)` reads `auth.json` fresh on every call for a `pi-login` family, and `secrets.apiKeys[provider]` for an `api-key` family. It never caches.
- `modify(provider, fn)` applies to `pi-login` providers only. It takes `proper-lockfile` `lock(piAuth, {realpath: false, retries: 0, stale: 30000, onCompromised})`, retries with backoff for up to 30 seconds, re-reads the file under the lock, runs `fn`, writes the whole file with mode `0600` when the result changed, and releases the lock. Pi AI's `Models.getAuth()` already runs OAuth refresh inside `modify`.
- `delete` refuses. Render never logs the operator out.
- `list` returns provider names and credential types, never values.
- `Engine` calls `createModels({credentials, authContext: {env: async () => undefined, fileExists: async () => false}})`, so no environment variable or file outside the store supplies a credential.
- Engine registers `PROVIDERS[family.provider]()` for each configured family. The existing `streamSimple` admission guard wraps every registered provider, not only Anthropic.
- `EngineConfig.apiKey` is deleted. `#configurationBlocker` drops `native_provider_required` and reports `native_provider_configuration_missing: <provider>` when the store has no credential for the packet's provider.
- `render serve` gains `--pi-auth <path>` (X2). The secrets file is `<data>/secrets.json` (Piece 4).
- Until Piece 4 lands, `EngineConfig.families` supplies the family table. Piece 4 moves it into settings and deletes the field.

The auth file shape Render relies on is `{[provider]: {type: "oauth", access, refresh, expires, ...} | {type: "api_key", key}}`. The operator's file has `openai` and `anthropic` OAuth entries.

#### Rules

- **M1.** Given an `auth.json` with an `openai` OAuth login and a role whose model is `openai/gpt-6.1-sol`, when the role runs, then its request authenticates with that login, and no token appears in Ledger records, packets, receipts, exports or logs.
- **M2.** Given an expired `anthropic` token and pi refreshing it at the same moment, when Render needs the credential, then exactly one refresh writes the file, and both pi and Render end with the same valid token.
- **M3.** Given pi holding the `auth.json` lock, when Render calls `modify`, then Render waits for the lock up to 30 seconds and never writes the file while pi holds it.
- **M4.** Given a family whose credential is absent, when Engine checks a packet that uses it, then the assignment blocks with `native_provider_configuration_missing: <provider>` and no provider request is made.
- **M5.** Given an `api-key` family for `deepseek` with a key in the secrets file, when a role uses it, then the request carries that key, and the key appears nowhere else.
- **M6.** Given a packet whose model the 1.4.0 catalog lacks and settings do not add, when Engine checks it, then it blocks with `required_model_unavailable`.

#### Verification

Before code, owners write failure cases for a stale read that overwrites a newer token, two processes that refresh at once, a write that leaves a mode other than `0600`, an environment variable that supplies a credential, and a token that leaks into a record. Tests run the real `proper-lockfile` against a temporary `auth.json`, with a second process holding the lock through pi-coding-agent 1.5.0's `AuthStorage` as a test-only dependency. The scripted provider at Engine's existing provider seam stands in for the network. The last check is one live request each through `openai` and `anthropic` with the operator's login. The implementation report keeps its commands and results, outside source.

### Piece 3. Projects (Wave 1)

#### Changes

```ts
// Kernel state and snapshot
export type Project = {
	readonly id: string; // "project:<n>"
	readonly revision: number;
	readonly name: string; // 1 to 100 characters
	readonly remote: string; // immutable (X1)
	readonly defaultBranch: string;
	readonly checkImage: string; // "<name>@sha256:<64 hex>" (X10)
	readonly principles: string; // repository path, default "AGENTS.md" (X9)
	readonly createdAtSequence: number;
};
export type ProjectFacts = { readonly id: string; readonly remote: string; readonly defaultBranch: string };

// Commands, family "human-decision", project-wide human (all-workflow device or local admin)
| { type: "addProject"; name: string; remote: string; defaultBranch: string; checkImage: string; principles?: string }
| { type: "editProject"; project: string; expectedRevision: number; name: string; defaultBranch: string; checkImage: string; principles: string }
// Changed: project is required and never changes
| { type: "createWorkflow"; title: string; project: string }
```

- Ledger retains every project revision as canonical JSON with digest and length, like policy payloads. A narrow device sees only the projects of its visible workflows. History and export gain the `project` kind.
- Effects keeps one bare mirror per project at `<data>/effects/projects/<project-id>.git`. The existing private proposal refs live in the same store. A new operation `{type: "fetch", project: ProjectFacts}` fetches `+refs/heads/<defaultBranch>:refs/render/upstream/<defaultBranch>` and returns `{project, branch, commit}`. Private HTTPS remotes authenticate with the `github-token` secret through a credential helper, never in a URL, argument or log.
- Every Effects operation that named `repository: string` names `project: ProjectFacts` instead. The `Effects` constructor and `ForgeConfig` lose `repositories`. `OwnedChecks.repositories` and `investigations.repositories` are deleted.
- Engine fetches before the coordinator's first run, to pin its source commit, and before each target preparation, to observe T.
- The forge target is `{owner, name, base: defaultBranch}`, parsed from `https://github.com/<owner>/<name>(.git)` or `git@github.com:<owner>/<name>(.git)`. Another remote works for local work, and its publication reports `unsupported`.
- Sandboxes takes `LinuxProfile.image` from `checkImage`.

#### Rules

- **P1.** Given a project-wide human, when they send `addProject`, then Ledger returns a receipt with the new project id. Given an assignment agent, the host or a narrow device, the same command refuses `forbidden_principal` or `forbidden_scope`.
- **P2.** Given `createWorkflow` without `project`, or naming an unknown project, then Ledger refuses `invalid_content` or `not_found`. No command changes a workflow's project.
- **P3.** Given `editProject` with a stale `expectedRevision`, then Ledger refuses `stale_basis` and names the current revision.
- **P4.** Given a remote whose default branch moved forward, when Engine prepares a handoff, then Effects fetches first and T is the fetched commit.
- **P5.** Given an unreachable remote, when the fetch fails, then preparation blocks with `project_fetch_failed: <reason>`, no stale T is used, and implementation that does not need T continues.
- **P6.** Given a device scoped to a workflow of project A, when it takes a snapshot or exports history, then project B is absent.
- **P7.** Given two projects with open proposals, when both publish, then each PR opens on its own remote's repository.

#### Verification

Before code, owners write failure cases for a fetch that uses a stale ref, a token that lands in a URL or log, a narrow device that sees another project, two projects that share a mirror, and publication that targets the wrong repository. Tests use local bare repositories as `file://` remotes, advance them between steps, and keep the existing fake forge for publication.

### Piece 4. Settings and secrets (Wave 1)

#### Changes

```ts
export type ModelEntry = {
	readonly provider: ProviderId;
	readonly id: string;
	readonly family: string;
	/** Present when the pinned catalog lacks `id`: the catalog model whose API and limits this entry copies. */
	readonly base?: string;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
};
export type RoleTemplate = {
	readonly model: { readonly provider: ProviderId; readonly id: string };
	readonly thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	readonly maxInputBytes: number;
	readonly maxOutputTokens: number;
	readonly maxTurns: number;
};
export type EngineSettings = {
	readonly schema: 1;
	readonly families: readonly Family[];
	readonly models: readonly ModelEntry[];
	readonly roles: Readonly<Record<Role, RoleTemplate>>;
	readonly forge: { readonly actor: string | null };
};

// Command, family "human-decision", project-wide human
| { type: "changeEngineSettings"; expectedRevision: number; settings: EngineSettings }
```

- Revision 1 is the default. Families are `claude` (`anthropic`, `pi-login`) and `chatgpt` (`openai`, `pi-login`). The writer roles, `coordinator`, `implementer`, `candidate`, `experiment-candidate` and `experiment-parent`, use `anthropic/claude-opus-5-5`. The reviewer roles, `challenger`, `audit-standards`, `audit-contracts` and `watchdog`, use `openai/gpt-6.1-sol`. Both ids are in the 1.4.0 catalog. Only `gpt-6.1-sol` has a live request on record.
- Kernel refuses settings in which a role's model has no matching `ModelEntry` or catalog model, a family names a provider outside `PROVIDERS`, or a `base` is absent from the catalog.
- Engine wraps each registered provider's `getModels()` to add the current revision's entries, each copied from its `base` with the entry's `id` and limits.
- Engine reads the current settings revision when it builds a packet. The packet copies the model, family, thinking and budgets, and records `settingsRevision`. A later revision never changes an existing packet.
- `EngineConfig.families` is deleted.
- Policy and checkpoint modes keep their existing revisioned commands, `changePolicy` and `changeCheckpointSettings`. The per-project check image is a field of the `Project` revision and changes through `editProject`. The desktop settings screen uses all four commands.
- The snapshot carries `settings: {revision, value}` for project-wide humans.

Secrets live in `<data>/secrets.json`, mode `0600`, outside the store, outside export and outside every packet. The names form a closed set: `github-token`, `exa`, `tavily` and `api-key:<provider>` for each `ProviderId`.

```text
PUT /v1/secrets/<name>   body {"value": string}   -> {"name", "set": true, "updatedAt"}
GET /v1/secrets                                   -> {"secrets": [{"name", "set", "updatedAt"}]}
```

`src/host/secrets.ts` serves both routes. It admits a request only when `principals.projectWideHuman(context)` is true. It writes a temporary file with mode `0600`, syncs it and renames it over `secrets.json`. Engine and Effects read the file on every use, so a new value applies to the next request.

#### Rules

- **S1.** Given settings at revision 3, when the human sends `changeEngineSettings` with `expectedRevision: 2`, then Ledger refuses `stale_basis` and names revision 3.
- **S2.** Given a queued assignment whose packet was built under revision 3, when revision 4 changes its role template, then the packet keeps the revision-3 values, and the next new assignment of that role uses revision 4.
- **S3.** Given an added entry `openai/gpt-6.1-terra` with `base: "gpt-6.1-sol"`, when a role template names it, then Engine resolves the model and Kernel accepts the settings.
- **S4.** Given an assignment agent or the host, when it sends `changeEngineSettings`, then Ledger refuses `forbidden_principal`.
- **S5.** Given a project-wide human, when they `PUT /v1/secrets/github-token`, then `GET /v1/secrets` shows `set: true` with no value, the file mode is `0600`, and the value is absent from every record and export.
- **S6.** Given a narrow device or an unauthenticated request, when it calls either secrets route, then the host answers `403 forbidden_scope` or `401 unauthorized` and the file is unchanged.

#### Verification

Before code, owners write failure cases for a stale change that applies, a running packet that changes, a secret that appears in a receipt or export, a world-readable secrets file, and a narrow device that writes a secret. Protocol tests over the host transport cover S1 to S6. A test scans the store and an export for a known secret value and must find nothing.

### Piece 5. Launcher (Wave 2)

#### Changes

```ts
// src/engine/playbooks.ts
type Shape = "investigation" | "bug" | "performance" | "change" | "design" | "experiment";
type Step =
	| { readonly at: "message"; readonly role: "coordinator"; readonly requests: readonly ["fidelity"] }
	| { readonly at: "intake-accepted"; readonly role: "implementer"; readonly requests: readonly ["standards", "contracts", "watchdog"] };
const MESSAGE: Step = { at: "message", role: "coordinator", requests: ["fidelity"] };
const IMPLEMENT: Step = { at: "intake-accepted", role: "implementer", requests: ["standards", "contracts", "watchdog"] };
export const PLAYBOOKS: Readonly<Record<Shape, readonly Step[] | "unavailable">> = {
	investigation: [MESSAGE],
	bug: [MESSAGE, IMPLEMENT],
	performance: [MESSAGE, IMPLEMENT],
	change: [MESSAGE, IMPLEMENT],
	design: [MESSAGE, IMPLEMENT],
	experiment: "unavailable",
};
```

The coordinator starts before the shape is known, so every shape begins with the same `MESSAGE` step. The shape selects whether `IMPLEMENT` follows.

- `Engine.reconcile` gains a launcher step. It reads workflows, assignments, accepted intakes and the current settings from the Ledger snapshot. It issues `assignTask` only for steps whose trigger holds and whose role has no current assignment for that workflow or Slice.
- `MESSAGE` triggers when a workflow has an accepted human message and no coordinator assignment. Engine fetches the project, pins the commit, retains packet documents and assigns the coordinator with `delivery: false`, `slice` set to the workflow id, the template from settings and one `fidelity` request for a read-only challenger in the reviewer family.
- `IMPLEMENT` triggers per accepted Slice whose current Contract has no delivery owner and no unmet dependency. Engine assigns an implementer with `delivery: true`, a `linux-writer` profile on the project's `checkImage`, the `verification` selection derived from the Contract's verification mapping and the project's verification asset path, and three requests, `standards` (`audit-standards`), `contracts` (`audit-contracts`) and `watchdog`. A Contract without a verification mapping blocks with `playbook_verification_unmapped`.
- The coordinator gets three source tools (X5). `list_source {path}`, `read_source {path}` and `grep_source {pattern, paths?}` read literal Git objects of the pinned commit through new Effects operations `{type: "list" | "show" | "grep", project, commit, ...}`. Patterns and paths are passed as separate arguments after `--`, with fixed output and time bounds. Each result that the coordinator cites is retained as investigation source is today.
- `saveDraft {workflow, document: "ground", content}` becomes available to the current coordinator, for that one document (X6). Ledger retains it as `draft/<assignment>/ground`. The workflow view's `nextHumanAction` becomes `{type: "confirmGround", workflow, draft, expected, content}`, where `content` is the draft with `shape.confirmed: true`. The human confirms with `saveDocument ground`, and the existing shape rule then admits checkpoint and intake work.
- A new scheduling command `retainHostDocument {workflow, document, text}` retains the host-authored packet documents under `host/`. They are the instruction text for each role, the profile, and the principles file read from the pinned commit (X9). Ledger deduplicates by digest, so a restart adds no revision.
- An `experiment` shape blocks the coordinator's next request with `playbook_unavailable: experiment` (X11).

#### Rules

- **L1.** Given a new workflow and the human's first accepted message, when reconcile runs, then exactly one coordinator assignment exists, with one `fidelity` request. Repeated reconciles and a host restart add none.
- **L2.** Given an unconfirmed classifier shape, when the coordinator requests a checkpoint or stages an intake, then Kernel refuses `shape_confirmation_required`, and `nextHumanAction` is `confirmGround`.
- **L3.** Given an accepted intake with two independent Slices, when reconcile runs, then each Slice gets one implementer with `standards`, `contracts` and `watchdog` requests, with no human start command.
- **L4.** Given a Slice that depends on another Slice's integration, when reconcile runs, then that Slice stays unassigned until the prerequisite's qualifying integration is recorded.
- **L5.** Given default settings and default policy, when Engine builds a reviewer packet, then the reviewer family differs from the writer family. Given settings that put both in one family without a recorded human policy direction, then the request refuses as it does today.
- **L6.** Given four executing attempts, when a new implementer is assigned, then it stays `queued`, and its view shows that it waits for capacity.
- **L7.** Given production source, when anything other than `Engine.reconcile` constructs an `assignTask` command, then a source check in `npm run lint` fails.

#### Verification

Before code, owners write failure cases for a second coordinator after restart, an implementer before acceptance, a dependent Slice that starts early, a same-family reviewer, a packet that lacks a required request, and a source tool that reads outside the pinned commit or follows a symlink. The scripted provider at the existing seam drives the coordinator through `saveDraft`, `stageIntake` and `requestIntakeReview`. The test then confirms Ground and accepts the intake as the human, and asserts the implementer's packet. A crash barrier between `assignTask` acceptance and reconcile settlement proves L1 across restart.

### Piece 6. Chat (Wave 2)

#### Changes

```ts
// Kernel workflow state
type CoordinatorMessage = {
	readonly commandId: string;
	readonly device: string | null; // null for the local admin
	readonly whenBusy: "steer" | "followUp";
	readonly sequence: number;
	readonly text: string; // retained as today's MessageEntry, with digest and length
	readonly submission: { readonly id: number; readonly assignment: string; readonly generation: number } | null;
	readonly withdrawal: { readonly outcome: "aborted" | "already_placed" | "settled" | "not_found" | "requested"; readonly sequence: number } | null;
};
type Chat = { readonly messages: readonly CoordinatorMessage[]; readonly interrupts: { readonly requested: number; readonly handled: number } };

// RoleAssignment.status gains "idle" (X4)
status: "queued" | "running" | "idle" | "blocked" | "submitted" | "canceling" | "canceled";

// Human commands
| { type: "postCoordinatorMessage"; workflow: string; text: string; whenBusy: "steer" | "followUp" } // whenBusy is new and required
| { type: "withdrawCoordinatorMessage"; workflow: string; message: string } // message: the original commandId
| { type: "interruptCoordinator"; workflow: string }
// Scheduling commands
| { type: "recordMessageSubmission"; workflow: string; message: string; submission: number }
| { type: "recordMessageWithdrawal"; workflow: string; message: string; outcome: "aborted" | "already_placed" | "settled" | "not_found" }
| { type: "recordInterrupt"; workflow: string; interrupt: number }

// Ledger: authorizes a watch and signals its end
observe(context: AuthenticatedContext, request: { conversation: string /* workflow */ }): Effect.Effect<
	| { readonly conversation: number; readonly assignment: string; readonly generation: number; readonly ended: Promise<"credential_revoked" | "host_closing" | "coordinator_replaced"> }
	| LedgerRefusal
>;

// Engine
watch(context: AuthenticatedContext, workflow: string): Effect.Effect<CoordinatorWatch | LedgerRefusal, unknown>;
type CoordinatorWatch = {
	readonly snapshot: SnapshotEvent; // pi-durable 1.4.0
	readonly inbox: readonly { readonly commandId: string; readonly whenBusy: "steer" | "followUp"; readonly status: "accepted" | "queued" | "pending" }[];
	start(listener: (events: readonly AgentEvent[]) => void): void;
	stop(): Promise<void>;
	readonly ended: Promise<"credential_revoked" | "host_closing" | "coordinator_replaced">;
};
```

A prompt is a message sent while the coordinator is idle. Pi starts a run for any input to an idle conversation, so the pinned `whenBusy` matters only when a run is already in progress.

Delivery runs inside Engine's serialized `reconcile`.

1. For each accepted message without a submission or withdrawal, Engine checks the coordinator. If it is `running`, Engine submits at once. If it is `idle` and a slot is free, Engine issues `stageTask`, which now admits `idle` as well as `queued`, then submits. Otherwise the message waits and the view shows `awaiting_capacity`.
2. The submission is `conversation.submit({type: "input", requestId: commandId, content: text, whenBusy, entry: {kind: "render.human", data: {device, commandId}}})`. Engine then records `recordMessageSubmission`. Pi-durable admits a `requestId` once, so a crash between the submit and the record leads to one submission.
3. Engine releases the slot only when the conversation is idle and every submitted message's pi-durable submission has settled. Release is `recordQuiescence`, which moves a chat coordinator that has no report to `idle`, not to `blocked` with `role_did_not_submit`.
4. For a requested withdrawal, Engine calls `harness.abortSubmission(id, ctx, conversation)` and records the outcome. A withdrawal of a message that has no submission yet completes in Ledger as `aborted` without Engine.
5. For `interrupts.requested > interrupts.handled`, Engine calls `conversation.abort(ctx)` without `background` and records `recordInterrupt`. An abort of an idle conversation does nothing, so a replay is harmless.

Other runtime changes:

- The `render.role-work` `wait` phase waits for the coordinator conversation to be idle with no unsettled submission, not for one round's submission.
- The provider admission guard counts `maxTurns` per run for a chat coordinator, keyed by the run's first input submission.
- The coordinator template's `maxInputBytes` leaves room for native blocking compaction to run first. A long chat fails the bound only when compaction fails, and the failure is shown.
- `UNAVAILABLE` drops `coordinator-replies`. The workflow view's `messages` becomes `{count, coordinator: {assignment, generation, state: "none" | "idle" | "running" | "awaiting_capacity"} | null, inbox}`.
- `messages(context, workflow, cursor, limit)` returns the coordinator transcript in order, with human messages and coordinator entries read from pi-durable storage, and with export's two redactions. History and export read the same committed entries at their cutoff. Chat runs add no `recordRuntimeHistory` snapshots.

Wire additions in the host transport:

```text
GET /v1/workflows/<workflow>/chat?version=1    NDJSON
{"version":1,"kind":"chat-snapshot","workflow","coordinator":{"assignment","generation"},"snapshot","inbox"}
{"version":1,"kind":"chat-events","workflow","events":[AgentEvent, ...]}
{"version":1,"kind":"chat-inbox","workflow","items":[...]}
{"version":1,"kind":"end","reason":"credential_revoked"|"host_closing"|"coordinator_replaced"|"backlog"}
```

The transport drops a consumer whose backlog exceeds the existing bound. Pi-durable's own overflow replaces undelivered batches with a fresh snapshot event. Closing the stream never stops a run.

#### Rules

- **C1.** Given an idle coordinator and a free slot, when the human posts a message, then the receipt returns after the commit, a run starts, and the transcript shows the input as a `render.human` entry with the device and command id.
- **C2.** Given a retried command id with the same payload, when Ledger and Engine process it, then one receipt and one submission exist.
- **C3.** Given a host crash after Ledger accepted a message and before Engine submitted it, when the host restarts, then Engine submits it exactly once.
- **C4.** Given a running coordinator, when the human posts with `whenBusy: "steer"`, then the message enters the current run at its next turn boundary. Given that the run ends before placement, then the message starts the next run, and the slot stays held until that run settles.
- **C5.** Given a running coordinator, when the human posts with `whenBusy: "followUp"`, then the message starts a run after the current one ends.
- **C6.** Given a submitted message that is still queued, when the human withdraws it, then the outcome is `aborted` and the message never enters the transcript. Given a message already placed, then the outcome is `already_placed`. Given a withdrawal that commits while Engine is submitting, then Engine still records the submission and then aborts it.
- **C7.** Given a running coordinator with a challenger running, when the human interrupts, then the coordinator's run stops, the challenger keeps running, and the coordinator becomes `idle` after quiescence.
- **C8.** Given four executing attempts, when the human posts to an idle coordinator, then the message is accepted, its view shows `awaiting_capacity`, and it is delivered when a slot frees.
- **C9.** Given a device scoped to workflow A, when it opens the chat stream of workflow B, then the host answers `404 not_found`. Given a revoked device, then its open chat stream ends with `credential_revoked`.
- **C10.** Given a completed chat, when the human exports the workflow, then the export contains the committed coordinator transcript with `hidden_reasoning` and `opaque_provider_fields` redacted.
- **C11.** Given a coordinator run that ends without `submit_role_result`, then the coordinator is `idle` with no blocker.

#### Verification

Before code, owners write failure cases for a duplicate submission after a retry or crash, a slot released while a late steer is pending, an interrupt that cancels role tasks, a withdrawal that leaves a message in the transcript, a chat stream that outlives revocation, and an unredacted thinking block in a frame. The scripted provider at the existing seam must be able to hold a stream open across turns so that steer and follow-up timing is observable. The existing barrier injection in `src/ledger/barrier.ts` covers C3. Whether a non-background `conversation.abort` leaves queued inputs queued is observed against pinned pi-durable 1.4.0 in a test, not assumed.

### Piece 7. CLI decision commands (Wave 3)

#### Changes

- The workflow view's `nextHumanAction` carries the exact host-authored basis.

```ts
| { type: "reviewCheckpoint"; request: string; emission: string | null; annotations: number;
	basis: { request: string; emission: string; manifest: string; annotations: number; policyBinding: string };
	decisions: readonly { node: string; alternatives: readonly string[] }[]; concerns: readonly string[] }
| { type: "reviewIntake"; intake: string; annotations: number;
	basis: { intake: string; review: string; annotations: number; policyBinding: string };
	decisions: readonly { node: string; alternatives: readonly string[] }[] }
| { type: "cancelWork"; workflow: string; assignment: string; generation: number; attempt: string; reason: string }
| { type: "confirmGround"; workflow: string; draft: string; expected: string | null; content: string }
```

- `src/client/cli.ts` gains `approve`, `accept-intake`, `cancel`, `confirm-ground`, `send --steer|--follow-up`, `withdraw`, `interrupt`, `chat`, `add-project`, `edit-project`, `settings` and `secret set`. Each decision command copies the basis from the current snapshot and asks the human only for the `decisions` and `nonbinding` choices.

#### Rules

- **K1.** Given a pending checkpoint, when the human runs `approve`, then the CLI sends the snapshot's `basis` unchanged with the human's decisions and computes no basis field itself.
- **K2.** Given that the basis changed between the snapshot and the command, when Ledger refuses `stale_basis`, then the CLI prints the new basis and exits nonzero without retrying.
- **K3.** Given a timeout, when the human reruns the same command with the same `--command-id`, then the CLI shows the original receipt.

#### Verification

Protocol tests drive the CLI against a real host with the scripted provider. A test asserts that `src/client` imports nothing from `src/kernel`.

### Piece 8. Live delivery (Wave 3)

This is the acceptance run for Waves 1 and 2, not new code. On the operator's host, the operator adds `vicrdguez/render-design` as a project, types one prompt and follows the chat. They confirm Ground and accept the intake with the CLI. Render then delivers through Audit, preparation, Watchdog and integration to a published draft PR on `vicrdguez/render-design`.

- **V1.** Given the default settings and the operator's pi logins, when the operator types one prompt for a small change, then a draft PR opens on `vicrdguez/render-design`. No person issues a scheduling command or edits a file in the data directory, and the only human commands are the project setup, the chat, the Ground confirmation and the intake acceptance.

The implementation report records the commands, receipts, PR URL, models used and limits, outside source. Ready promotion and the human's merge are observed if they happen. They are not required for V1.

### Piece 9. Desktop adapter and screens (Wave 3)

Desktop code stays in `desktop/` with no host-source import, as #52 requires.

- `desktop/crates/render-host` gains `HttpAdapter`, an implementation of the existing `HostAdapter` trait over the host transport. It uses bearer authentication, `POST /v1/commands`, receipt lookup, `/v1/observe`, `/v1/workflows/<workflow>/chat` and `/v1/workflows/<workflow>/messages`.
- The screens are project list and add, settings (families, models, role templates, policy, checkpoint modes and write-only secrets), chat with a pinned steer or follow-up mode, interrupt and withdraw, Ground confirmation, and decisions built from the host-authored bases.
- The restore and backup UI is removed.
- The UI specification on `main` (`docs/ui/spec.md`) changes so that a late steer starts the next run, as in Pi.

- **U1.** Given a decision screen, when the human confirms, then the adapter sends the host-authored basis unchanged.
- **U2.** Given a dropped connection, when the adapter reconnects, then it takes a fresh snapshot and a fresh chat snapshot and replays no frame.
- **U3.** Given a secret field, when the human saves it, then the screen shows only "set" afterwards and never the value.

Verification uses the desktop's own tests against a recorded host session, plus one manual run against the operator's host.

### Build order

Each piece is one PR against the proposal branch, with its own failure list written before code and its own verification. A wave starts when the previous wave's PRs pass `npm run verify:gate`.

**Wave 1.** Piece 1, transport extraction, lands first and stays behavior-identical. Pieces 2 (models and logins) and 3 (projects) follow and can proceed in parallel. Piece 4, settings and secrets, lands last in the wave. It moves the family table out of `EngineConfig` into Ledger revisions and deletes `EngineConfig.families`. Repository maps are already gone after Piece 3.

**Wave 2.** Piece 5, the launcher, then Piece 6, chat. The launcher's trigger is an accepted `postCoordinatorMessage`, which exists today. Chat then makes that message reach the coordinator.

**Wave 3.** Piece 7, CLI decision commands, then Piece 8, the live delivery on `vicrdguez/render-design` from a typed prompt to a published draft PR, then Piece 9, the desktop adapter and screens.

### Out of scope

- The rest of #52, including search, a reference index and aggregate views beyond what one delivery needs.
- Disaster recovery, packages, restore and backup (#49).
- The design of agent prose and project principles (#59). This design reads principles from a project file only until #59 lands.
- Launching experiments (X11).
- Verification of how providers bill subscription traffic. The operator accepts this as unverified.
- Forges other than GitHub, and multi-host or multi-user operation.
- Tailscale Serve provisioning, which stays operator setup.

### Spec amendments in this PR

- Usable-host amendment notice after the disaster-recovery amendment.
- §1 settled decisions, R2-A003 note.
- §4 module table and the paragraph after it, plus Figure 3.
- §5.2 and §5.2.1, transport owned by the host.
- §6.4, projects and settings.
- §6.6, R2-A003 note.
- `docs/protocol.md`, the `untrusted_context` row.
