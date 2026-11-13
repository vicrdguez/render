# Tau code architecture

## Problem

Tau must preserve delegated work and human control across disconnects and process death. The locked behavior stays unchanged. This layout gives each record one writer and each implementing agent a short path from failure list to interface. The core is store plus host. The command is a composition root outside the core.

## Usage (caller's view)

A server can run without any workflow:

```ts
import { startServer } from "tau-host";
const server = await startServer({ home, modules: {}, models, env }, context);
// POST /v1/bind, create, input. Losing a connection does not cancel the work.
await server.close();
```

A publishing tool uses the transaction it already holds:

```ts
import { request, emit } from "tau-store";
const basis = await tx.appendEntry(Design, conversation, { data: { text } });
const asked = await request(tx, {
  subject: `w1:${conversation}:design`, title: "Review design", basis,
  choices: ["approve", "revise", "abort"], conversation,
  then: designAnswer, requestedAt: api.now(),
});
await emit(tx, DesignReady, { text: "Design ready", at: api.now(), conversation });
```

A tool extension exports the locked module contract, without importing the host:

```ts
import { options } from "tau-kit";
import { obj, str } from "@earendil-works/pi-schema";
const WebsearchOptions = options("websearch", obj({
  provider: str(), apiKey: str({ format: "secret", minLength: 1 }),
}));
export { WebsearchOptions as options };
export { extension } from "./web-search.js";
// No entry. Unit 3 resolves the provider enumeration and Webfox dependency.
```

## Shape

| Package | Owns and exports |
| --- | --- |
| `tau-store` | Decision and Event. Root exports request, withdraw, emit, decision, eventLog and domain types. `/host` exports openStore, answer, watchOpen and their types. |
| `tau-host` | Projects, device authority, all 20 calls, HTTP and streams. Exports startServer, requestAdmin and configuration/module/admin types. |
| `tau-kit` | options, modelRef, prose, role and RoleSettings. Uses pi only. Helpers arrive with their first caller. |
| `tau-websearch` | extension and its options. No entry or task. |
| `tau-w2` | extension, entry, options and W2Options. Owns Book, timers, rounds and scoring. |
| `tau-w1` | extension, entry, options and W1Options. Owns Work, receipts, roles, Git plans and evidence. |
| `tau` | run and the tau executable. Sole static extension import map and server-machine wiring. |

Data structures come from the locked notes. `Decision`, `Annotation` and `EventData` are copied from [primitives.md](/Users/vr-osxs/dev/render-core/docs/core/primitives.md). `ExtensionModule` is copied from [host.md](/Users/vr-osxs/dev/render-core/docs/core/host.md). Kit signatures and role selections follow [kit.md](/Users/vr-osxs/dev/render-core/docs/core/kit.md). The protocol retains its pinned 1.5.2 values and ops, not a new view model. Work and Book encode [walk.md](/Users/vr-osxs/dev/render-core/docs/core/walk.md) stages, receipts and expected rounds. Private stored arrays accommodate pi's mutable JsonValue without changing the public readonly shapes.

`host/src/calls.ts` is the only 20-call list. Schemas infer request types. Routes, discovery and route-test cases derive from its keys. Outside data is checked with pi-schema. Domain refusals remain returned values; storage rejection remains unknown. Per boundary-discipline and single-source-of-truth, neither transport validation nor call names get a second owner.

Export maps hide internals. An AST check runs before TypeScript and enforces capability-specific package edges, including relative, type-only and dynamic imports. Core cannot import kit or extensions. Extensions can reach only the five store functions, not `/host` or host internals. These are trusted-contributor guards, not sandboxing.

Use TypeScript emit for both tests and server. Strict NodeNext packages emit to their own dist directories. Node runs ordinary ESM `.js`. Markdown is copied beside emitted modules. A real npm lock pins pi-durable at exactly 1.5.2. The flake consumes that lock and owns the Nix commands. No worker install is needed. The probe proves cross-package emit, node --test, hidden imports, choice coverage and the full sketch's strict typecheck. It does not claim Tau runs.

The host is deep because startServer hides catalogue recovery, locks, registries, device checks and watches. The store hides document names and atomic answer transitions behind its two caller-specific interfaces. A separate protocol package would expose coordination without adding capability. Per the deletion test, its files stay inside host instead.

[The sketch map](sketch/README.md) names every file, test seam and staged build. Failure lists live in `test/*.test.ts`. Implementing agents replace TODOs with failing tests before filling behavior. Store tests start with real MemoryStorage; persistence uses temporary SQLite; crash guarantees use killed children; HTTP uses fetch on port 0. No production test mode is added. Build order is store, host with protocol and command, websearch with kit options, W2 with prose/modelRef, then W1 with role. Later steps add packages and composition entries, not changes to earlier interfaces.

## Synthesis decision

Candidate 2 only. The arena owner fills this section after comparing the independent candidates.

## Tradeoffs accepted

- We accept seven small packages in exchange for compiler-visible authority and independent extension builds.
- We accept emit and asset copying in exchange for one runtime mode for tests and deployment.
- We accept an AST build check in exchange for blocking relative imports that npm exports alone cannot block.
- We accept an empty SQLite lock file per store in exchange for a process-death-safe lock without a lease or dependency. A real two-process probe verifies exclusion and SIGKILL release.
- We retain all accepted limits and deferred scope in the locked README. There is no client, sandbox, removal operation, shared secret home or model-call limiter.

## Alternatives considered

- One core package with `/host` and `/kit` subpaths hides little dependency information. The core could acquire an accidental kit dependency without any package edge changing. Separate store and host packages keep project ownership out of the store too.
- Separate protocol and extension-contract packages add public coordination types and forwarding calls. Keeping HTTP with its authority owner and using structural module exports hides that coordination instead.
- Direct TypeScript execution saves emit but makes source files the runtime distribution. This candidate tests the emitted distribution instead. The probe verifies that choice.

## Open questions and risks

- Which Webfox version, root entry point, providers and provider-fixture seam will unit 3 prove? The locked design explicitly leaves these to that step.
- Which TLS hostname and Origin should the deployment allow? Loopback binding and rejection are fixed, but the deployment values are not supplied here.
- How should W1 handle two work items whose handovers no longer fast-forward in the same repository? The locked README defers this to W1; this sketch adds no policy.
- Will the Nix agent's Linux gate reproduce the macOS Node 24 lock and package probes? Nix was not available here, so no flake result is claimed.

## Next implementation step

Turn the store failure lists into failing tests, then fill Decision and Event and rerun K1 to K6 against the real functions.
