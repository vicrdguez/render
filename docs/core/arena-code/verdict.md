# Verdict

## Result

Use Candidate 2 as the base. Do not accept either sketch unchanged.

| Criterion | Candidate 1 | Candidate 2 |
| --- | ---: | ---: |
| Fidelity to the locked design | 3 | 3 |
| Boundaries enforced by the build | 2 | 5 |
| Depth and reader load | 3 | 3 |
| Builds unit by unit | 4 | 4 |
| Toolchain proven | 3 | 3 |
| Tests attach at honest seams | 4 | 4 |
| **Total out of 30** | **19** | **22** |

Candidate 2 wins on the constraint that matters most for these build agents. Ordinary forbidden imports fail its build. Candidate 1's guard can be bypassed by an ordinary relative import between sibling packages. No trick or hostile code is needed. Candidate 2 also keeps HTTP types private, uses the existing watch interface, carries the execution environment, and sketches stronger workflow state. Its costs are one more package, more build configuration, and a custom import checker. Take Candidate 1's concrete Decision guidance, refusal table, executable type tests, and crash-storage seam. Fix the missing host dispatch wiring and runtime-only declarations before handing the base to builders.

These scores judge the supplied artifacts, not a future merged design. The newer flake fact is an integration requirement, not evidence that choosing emit or type stripping was inherently wrong.

Repairing Candidate 1 with Candidate 2's checker is a valid smaller-package alternative. It would still need the environment path, narrower host interface, corrected workflow state, and fidelity repairs. Candidate 2 already has those parts. Its runtime declarations and dispatch context can be repaired locally, without another architectural layer.

## Reading and evidence keys

I read both design documents, all authored sketch and probe files, and all ten locked notes in full before scoring. I inspected the manifests and parsed the lock files. Installed dependencies are not treated as authored candidate code. I read the red-flag screen in full. I ran probes only in copies under the judge directory. I did not execute anything from `/tmp/render-ground/`.

Paths below use these exact prefixes:

- `C1/` means `/tmp/arena-code/candidate-1/`.
- `C2/` means `/tmp/arena-code/candidate-2/`.
- `D/` means `/Users/vr-osxs/dev/render-core/docs/core/`.
- `J/` means `/tmp/arena-code/judge/`.
- `R/` means `/Users/vr-osxs/dev/render-core/`.

A reference such as `C1/sketch/biome.json:21-25` names lines in the original file, not in the numbered reading bundles.

## Evidence for each score

### 1. Fidelity to the locked design

**Candidate 1: 3/5.** It is unusually concrete about the locked behavior. Decision's statuses, request equality, background continuation, faulted resend, and the four-field inbox appear together in `C1/sketch/packages/core/src/store/decision.ts:36-102,139-229`. The complete call registry is at `C1/sketch/packages/core/src/host/calls.ts:91-214`. ExtensionModule is structurally faithful at `C1/sketch/packages/core/src/module.ts:15-25`. However, `not_open.open` is only an OpenSlot, not the current Decision. Some invalid annotation ranges become `bad_request` before the promised `bad_annotation` check. The sketch adds a page cap and extra codes, omits environment wiring, and cannot express some W1 continuation guards with its Work type. See the fidelity ledger below.

**Candidate 2: 3/5.** The core value types are closer to the literal notes. See `C2/sketch/packages/store/src/types.ts:10-71`, `packages/host/src/index.ts:13-31`, and `packages/kit/src/index.ts:11-56`. The candidate correctly keeps `not_open.open` as a Decision. It preserves the W1 and W2 replay rules in task comments and state types. But it does not sketch the complete refusal-code/status mapping. Several critical surfaces are only broad strings or TODOs. The HTTP signature cannot supply the context its call descriptors require. Its task declarations also promise runtime exports that emit removes. Those are material handoff holes, not merely missing function bodies.

### 2. Boundaries enforced by the build

**Candidate 1: 2/5.** Export maps and the named-import restrictions work. The relevant configuration is `C1/sketch/packages/core/package.json:5-8` and `C1/sketch/biome.json:9-12,18-25,34-49,57-73`. I reproduced the advertised failures. But I also reproduced four ordinary holes on the full sketch:

- Core imports kit with `../../kit/src/model-ref.ts`.
- W2 imports W1's private Work with `../../w1/src/work.ts`.
- Store imports its own package's host entry with `tau-core/host`.
- An extension uses the type expression `import("tau-core/host").Host`.

All four pass TypeScript and Biome. Evidence: `J/boundary-audit.log:82-104`. The first two directly violate the brief. The path glob looks for directory names that normal sibling-relative imports do not contain. `noUndeclaredDependencies` is also not a permanent prohibition on core-to-kit: adding the dependency makes that named import declared. The compiler alone does not enforce these rules.

**Candidate 2: 5/5.** The supplied policy and checker reject the required wrong imports. The policy is independent of dependency declarations. Relative targets are resolved before comparing their package ownership. Literal dynamic imports and import-type expressions are checked too. See `C2/sketch/boundaries.json:1-24`, `tools/check-boundaries.mjs:42-75,97-127,134-155`, and `package.json:12-18`. I reran the supplied probe and tested the actual sketch, not just its fixture. Root `answer` fails TypeScript. `/host`, host internals, core-to-kit, sibling-relative internals, and import-type access fail the build checker. Evidence: `J/boundary-audit.log:127-181`. This is a trusted-contributor guard, not a sandbox, which is the required scope.

### 3. Depth and reader load

**Candidate 1: 3/5.** Six packages and one TypeScript program are attractive. Keeping request and answer in one knowledge-owning module is good. See `C1/design.md:91-110` and `C1/sketch/packages/core/src/store/decision.ts:1-11`. The call list derives routes, names, types, and generic test cases. The request path is HTTP, Host.call, descriptor, domain function, commit. But many conversation functions repeat the descriptor's body shape. Host publicly exports protocol replies, frames, ops, and paths. Its watch-to-Feed-to-HTTP conversion introduces another interface. See `packages/core/src/host/conversations.ts:99-154`, `host/index.ts:8-15`, `host/feed.ts:40-67`, and `protocol/stream.ts:14-20`. Those costs are real even though the host method gives tests a convenient seam.

**Candidate 2: 3/5.** Its public server interface is smaller. It exposes startup, shutdown, address, and local admin operations, not the HTTP call model. It pipes the existing WatchHandle directly. See `C2/sketch/packages/host/src/index.ts:22-64` and `streams.ts:12-24`. The descriptor's typed closure is a useful way to keep parsing next to its handler: `calls.ts:45-75`. However, seven packages, seven project configs, project references, a policy map, asset copying, and a 170-line checker are substantial structure. The policy is partly duplicated in manifests and references. Splitting Decision transitions between `store/src/decisions.ts` and `store/src/host.ts` also weakens locality. The simpler alternative is to keep both transitions in decisions.ts and let host.ts expose the host-facing surface. No extra protocol package is needed in either design.

### 4. Builds unit by unit

**Candidate 1: 4/5.** Its staging table names the store, host/protocol, web search, W2, and W1 in the required order. It postpones options, prose/modelRef, and role until their first caller. See `C1/design.md:240-251` and `C1/sketch/packages/kit/src/index.ts:4-7`. Unit 1 can admit only the store files and their tests. Unit 2 adds the host export and composition root. No later unit needs a different core interface. The final tree is not itself a ready Unit 1 checkout, so the kickoff must actually omit the future imports and tests as stated.

**Candidate 2: 4/5.** The staged manifest/reference rule is explicit, and `tsc -b packages/store` gives a genuine independent store build. See `C2/sketch/README.md:80-90` and `packages/store/tsconfig.json:1-9`. Its kit arrival order is correct. The workspaces remain additive. The cost is that each addition must update package dependencies, project references, policy, and composition. The current extension ambient declarations must become actual defineTask stubs within their own unit. Host/server test access also needs an explicit permitted home before W2 and W1 acceptance work starts.

### 5. Toolchain proven

**Candidate 1: 3/5.** I reproduced source TypeScript tests across packages, the ordinary entry, the bin, and a child process on Node 24.21.0. I also reproduced the failure under a real node_modules path. See `J/c1-toolchain-rerun.log:1-24`. The full sketch typechecks and its bin reaches the intentional main stub: `J/boundary-audit.log:1-3`, `J/c1-sketch-bin.log:1-12`. This is real evidence for type stripping in a local npm workspace. It is not evidence for the merged Nix link layout. The pinned Nix Biome version rejects this configuration's `preset` key. See `J/c1-biome-pinned.log:1-28`.

**Candidate 2: 3/5.** I rebuilt the two-package emit fixture, ran its node:test case, and ran its ordinary emitted entry. I also rebuilt the sketch, checked its public request typing, and verified its copied Markdown assets. See `J/c2-rerun.log:5-39`. Emit is a valid choice for both test and server. However, the probe supplies mutable workspace links itself. It does not establish that Nix supplies them. Importing the actual emitted W2 fails with a missing runtime export before any intended stub runs: `J/c2-runtime-import.log:1-10`. The pinned Nix Biome version also requires a small import-spacing change: `J/c2-biome-pinned.log:1-27`. Both candidates need the flake integration described below.

### 6. Tests attach at honest seams

**Candidate 1: 4/5.** The store tests name MemoryStorage, temporary SQLite, and killed children. Its storage-wrapper probe demonstrates a useful seam for a function that owns its commit. See `C1/sketch/packages/core/test/store/answer.test.ts:1-28`, `crash.test.ts:1-16`, and `C1/probe/pi-facts/storage-wrap.ts:52-80`. I reran it successfully: `J/storage-wrap-rerun.log:1-2`. HTTP tests use port 0 and real backpressure, and extension tests use a real host. See `C1/design.md:217-238`. No production test switch appears. The weakness is test cost and coverage detail: the default failure list includes 15/60-second checks without a cheap timer plan, and W1 lacks several explicit replay and annotation-ending cases that Candidate 2 names.

**Candidate 2: 4/5.** Its seam and cost plan is stronger. It separates MemoryStorage checks from real Git, process death, provider compatibility, HTTP, and timer behavior. It explicitly says TODOs are not behavioral verification. See `C2/sketch/README.md:61-76`, `packages/w1/test/recovery.test.ts:4-28`, and `packages/websearch/test/search.test.ts:10-23`. The lock probe uses real processes and passes on rerun. Two issues keep this below 5. Its proposed caller-commit barrier does not explain how to stop inside answer's private commit. Also, extension tests cannot import the host or store's answer entry under the present policy. Add the complete HTTP workflow journey under tau/test, or grant a narrow public host import to extension tests. Do not solve that by exporting answer to extensions.

## Independent probes and limits

The judge scripts and full outputs are retained under `J/`.

| Check | Result | Evidence |
| --- | --- | --- |
| C1 local cross-package TypeScript runtime | Two actual tests pass. Entry, bin, and child work. A source tree physically under node_modules fails type stripping. | `J/c1-toolchain-rerun.log:1-24` |
| C1 advertised boundary fixture | Its listed wrong imports are rejected as claimed. | `J/c1-boundary-rerun.log:1-49` |
| Actual sketch import mutations | C1 has the four holes listed above. C2 rejects the corresponding required cases. | `J/boundary-audit.mjs`, `J/boundary-audit.log:5-181` |
| C2 local cross-package emitted runtime | One actual test and ordinary emitted entry pass. Full sketch strict build passes. | `J/c2-rerun.log:5-26` |
| C2 SQLite lock | Second process excluded. SIGKILL releases it. | `J/c2-rerun.log:40-60` |
| Unknown family-member read | A nominal read in tx.doc creates the member. | `J/family-read-rerun.log:1-4` |
| Commit crash seam | Kill before storage commit leaves no answer/task. Kill after leaves both. This tests the seam, not Tau's unimplemented answer. | `J/storage-wrap-rerun.log:1-2` |
| Independent request fixtures | Both lists have exactly the 20 locked names in order. Twenty valid bodies pass. Adding forged by to each fails. The probe uses valid bodies before adding the bad field. | `J/schema-audit.mjs`, `J/schema-audit.log:1-16` |
| Actual extension runtime linkage | C2's emitted W2 has no due export. C1's composition loads and reaches main's intentional stub. | `J/c2-runtime-import.log:1-10`, `J/c1-sketch-bin.log:1-12` |
| Sketch test commands | C1: 8 pass, 234 TODO, 0 fail. C2: 0 pass, 167 TODO, 0 fail. These are not 242 and 167 passing behavior tests. | `J/c1-sketch-tests.log:247-254`, `J/c2-sketch-tests.log:168-175` |
| Pinned Biome version | C1 config does not parse. C2 needs one blank line before an export. | `J/c1-biome-pinned.log`, `J/c2-biome-pinned.log` |
| Dependency-only Nix layout simulation | A dependencies-only install with the pinned lock transformation does not supply a live workspace package for either runtime strategy. | `J/nix-layout-probe.mjs`, `J/nix-layout-probe.log:1-90` |

Nix is not on PATH here. I do not claim `nix flake check` passed or that I ran a Nix derivation. The last check is an npm-level reproduction informed by the pinned nixpkgs implementation. The six design spikes were not rerun by this judge. They are not deciding evidence for the package choice. No real Tau behavior, remote deployment, real Webfox provider, Linux lock behavior, or power-loss guarantee was verified.

## Fidelity sample

This is a hard sample of 26 locked shapes and rules. Passing means the sketch preserves the shape or clearly instructs its stub to preserve the rule. It does not mean the behavior is implemented.

### 1. Annotation

Locked: `text: string; range?: { start: number; end: number }`. UTF-16 slice coordinates. See `D/primitives.md:25-29,90-95`.

- C1 copies the type at `sketch/packages/core/src/store/decision.ts:36-39`.
- C2 copies it at `sketch/packages/store/src/types.ts:10-13`.
- C1 narrows the incoming range to nonnegative integers at `packages/core/src/host/calls.ts:84-87`. A negative numeric range therefore gets `bad_request` before answer can return `bad_annotation`. C2 admits the numeric shape and places the semantic check in answer. See `C2/sketch/packages/host/src/calls.ts:83-86`, `packages/store/src/host.ts:43-48`, and `J/schema-audit.log:5-6,13-14`.

### 2. Decision record

Locked: all fields and the four statuses at `D/primitives.md:31-52`.

- C1 matches the fields and statuses, except `subject: string` becomes `subject: Subject`. Subject is a template type. DeviceId is branded. See `C1/sketch/packages/core/src/store/decision.ts:20-62`.
- C2 copies the fields literally, with a template DecisionId alias and string DeviceId. See `C2/sketch/packages/store/src/types.ts:8-35`.
- The ID aliases make the stated ID format more explicit. They are not new durable fields. C1's subject narrowing is disclosed, but it is still not a character-for-character copy of the locked public type.

### 3. Request draft and equality table

Locked: typed text-bearing basis, a continuation accepting every choice, documents only, equality except requestedAt, supersede otherwise. See `D/primitives.md:107-128`.

- C1 spells out the table and comparison fields at `sketch/packages/core/src/store/decision.ts:83-102,139-161`. Its ThenTask is a structural projection of a task, not pi-durable's whole Task type.
- C2 uses Task and NoInfer at `sketch/packages/store/src/decisions.ts:8-36`. Its comments preserve the same table.
- Both continuation coverage probes reject an insufficient choice set. C1 keeps those type cases in the sketch. C2 keeps its cases only in probe/public-types.ts.

### 4. Answer signature and refusal payloads

Locked operation: `answer(id, { basis, choice, annotations }, device)`. Conflict carries the record. Not-open carries the subject's open Decision if present. See `D/primitives.md:130-145` and `D/protocol.md:80-85`.

- Both preserve the input fields and source device from the trusted call path. A store handle and, in C2, Context are reasonable code-level binding parameters.
- C1 changes `not_open.open` to the four-field OpenSlot at `sketch/packages/core/src/store/decision.ts:192-197,212-213`.
- C2 correctly uses `open?: Decision` at `sketch/packages/store/src/types.ts:57-71`.

### 5. Answer retry and task ownership

Locked: equal resend preserves the first device; only faulted recreates the continuation; task is owned by the decision conversation and background. See `D/primitives.md:137-175`.

- C1 preserves the rules at `sketch/packages/core/src/store/decision.ts:214-229` and `test/store/answer.test.ts:10-27`.
- C2 preserves them at `sketch/packages/store/src/host.ts:43-48` and `test/decision.test.ts:15-43`.
- Neither adds an automatic retry loop or a general task restart call.

### 6. Read-only decision lookup

Locked: decision is a document read and neither of the two extension read helpers writes. See `D/primitives.md:264-280`.

- C1 measures the tx.doc trap and proposes a counter existence check at `sketch/packages/core/src/store/decision.ts:125-135,170-176`.
- C2 leaves decision's body and document definitions unspecified at `sketch/packages/store/src/decisions.ts:42-46` and `documents.ts:1-7`.
- C1's answer TODO still reads Decisions[id] directly. Its openStore TODO also does not initialize the OpenList that watchOpen says already exists. These instructions need to be reconciled before Unit 1. See `C1/sketch/packages/core/src/store/decision.ts:212,253-258` and `store.ts:32-36`.

### 7. EventData and emit

Locked: `EventData` and `emit<D extends EventData>(tx, kind, data): Promise<EntryId>`. See `D/primitives.md:214-231`.

- Both preserve EventData and the ownerless per-store event log rule.
- C1 adds `& JsonObject` to the public generic constraint at `sketch/packages/core/src/store/event.ts:36`. That is a needless narrowing of the literal public signature. C2 demonstrates that the locked signature typechecks at `sketch/packages/store/src/events.ts:10-14`.
- Both keep request free of event emission.

### 8. ExtensionModule

Locked: extension, optional entry, optional schema/get/set. No lifecycle or sandbox member. See `D/host.md:128-140` and `D/extensions.md:13-25`.

- C1 matches structurally at `sketch/packages/core/src/module.ts:15-25`.
- C2 matches at `sketch/packages/host/src/index.ts:13-21`.
- Neither changes the definition of a workflow or wraps pi-durable Extension.

### 9. The 20 calls

Locked list: `D/host.md:29-50`.

- Both contain exactly those names and no removal, unbind, delete, or restart-task call.
- C1: `sketch/packages/core/src/host/calls.ts:91-214`.
- C2: `sketch/packages/host/src/calls.ts:88-294`.
- The judge compared actual registry keys to an independent locked list, not just to a count. See `J/schema-audit.log:1,9`.

### 10. Call bodies and pages

Locked: request fields, `{ items, next? }`, empty Done result, and timeline after rather than cursor. See `D/protocol.md:93-119`.

- Both preserve the named fields and page shape.
- C1 invents `limit <= 500` at `sketch/packages/core/src/host/calls.ts:82`. There is no such cap in the locked notes.
- C1 makes input.whenBusy optional. C2 makes it required. See `C1/sketch/packages/core/src/host/calls.ts:143-151` and `C2/sketch/packages/host/src/calls.ts:199-207`. Host's row says the client sends steer or follow-up, and the wire example sends it. The notes do not explicitly specify omission or a default. This disagreement needs an explicit resolution, not two supposed exact copies.
- Both initially accept arbitrary thinkingLevel strings. C2 explicitly schedules validation against pi-ai values at `packages/host/src/calls.ts:228-231`; C1 does not sketch that validation beside its handler.

### 11. Reply bodies

Locked: exactly result, refused, or unknown. Storage rejection is unknown/storage_failed. See `D/protocol.md:38-60`.

- C1 preserves the envelopes at `sketch/packages/core/src/host/host.ts:34-38,87-93`.
- C2 preserves them at `sketch/packages/host/src/http.ts:5-9,24-25`.
- C1 additionally names unknown code `failed`. This is not in the locked code list. Protocol versioning permits later code additions, but that is not owner approval for this one.

### 12. Refusal codes and status mapping

Locked codes: bad_request, bad_cursor, unauthorized, unknown_call, unknown_project, unknown_conversation, unknown_decision, too_large, conflict, not_open, stale_basis, unknown_choice, bad_annotation, extension_not_loaded, bad_options, options_invalid, not_a_workflow, unknown_model, busy, idle, event_log. See `D/protocol.md:52-62`.

- C1 lists all of them with the correct listed statuses at `sketch/packages/core/src/host/refusals.ts:11-35`.
- It also installs bad_code and unknown_extension. `C1/design.md:304-313` asks the owner about them, but the sketch and a test already assume the answer. Devices also introduces local device_exists at `sketch/packages/core/src/host/devices.ts:27`. That local result is not a new HTTP call, but its name is new.
- C2 has no complete code/status list. `code: string` and a comment that cites the notes are not that sketch. See `sketch/packages/host/src/http.ts:5,25`. The seven answer codes do appear in `packages/store/src/types.ts:57-68`.
- Neither candidate resolves Host/Origin refusal coding with evidence from the locked notes. C1 properly raises that as a question. Keep it a question until decided.

### 13. Project and startup

Locked: Project holds `{ project, workdir, extensions }`; project name regex; absolute workdir; catalogue is directories; lock before open; empty registry; install then resume. See `D/host.md:69-82,106-116`.

- Both preserve the order and name regex. C1 sketches the actual document at `sketch/packages/core/src/host/project.ts:18-30,53-68`. C2 supplies the exact public Project type and ownership comments at `sketch/packages/host/src/projects.ts:7-40`.
- C1 uses optional project/workdir and an empty initial sentinel internally. This is not the stored bound Project shape. It must never be returned as a valid Project.
- C1 adds a top-level skipped array to the projects response at `packages/core/src/host/project.ts:98-102`. Reporting skipped stores is required, but the protocol only fixes items for that call. The new wire field is a disclosed design choice here, not part of the locked response.
- C2 leaves the actual Project document token unspecified. That is a sketch omission, not permission to move it into the store package.

### 14. Default extension selection

Locked: coding-tools, then available non-workflows. Closed roles do not change. See `D/extensions.md:35-76`.

- C1 preserves this at `sketch/packages/core/src/host/project.ts:107-114` and `extensions/w1/src/roles.ts:31-54`.
- C2 preserves it at `sketch/packages/host/src/projects.ts:27-31,43-48` and `packages/w1/src/roles.ts:30-42`.
- Neither silently installs all workflows into bare conversations.

### 15. Options contract and secrets

Locked: schema/get/set, only explicit keys stored, null deletes, defaults used for checking, ignore missing only during patches, secret returned as true. See `D/host.md:147-159,184-190` and `D/extensions.md:95-107`.

- C1 matches at `sketch/packages/core/src/host/options.ts:24-69`.
- C2 matches at `sketch/packages/host/src/options.ts:5-40` and `calls.ts:151-157`.
- Neither adds a shared secrets store or rejects bare create for unset search options.

### 16. Kit helpers

Locked signatures: RoleSettings and role at `D/kit.md:17-24`; options and modelRef at `D/kit.md:113-125`.

- C1 matches at `sketch/packages/kit/src/role.ts:12-25`, `options.ts:13-24`, and `model-ref.ts:7-10`.
- C2 matches at `sketch/packages/kit/src/index.ts:11-44`.
- Both correctly place options in Unit 3, prose/modelRef in Unit 4, and role in Unit 5. Neither makes W2 use role.

### 17. Fault

Locked exact fields: task, kind, conversation, error, optional endedAt and decision. Scan installed kinds and keep only an exact continuation link. See `D/host.md:203-225`.

- Both copy the fields and preserve the scan rule. C1: `sketch/packages/core/src/host/faults.ts:15-29`. C2: `sketch/packages/host/src/faults.ts:6-25`.
- Neither persists a fault table or offers a fault restart/cleanup call.

### 18. Stream shapes and timing

Locked: two frames, seven Chord ops, first replacement, 50/100 entry window, 15-second heartbeat, 60-second drain cutoff, three end reasons. See `D/protocol.md:123-172`.

- C1 copies the seven ops and end reasons at `sketch/packages/core/src/host/feed.ts:18-35` and timings at `protocol/stream.ts:9-12`. Its conversation comment does not state the full 50/100 window rule, relying on pi's view.
- C2 uses the pinned Chord Op rather than copying a second union. It explicitly preserves 50/100 and timing at `sketch/packages/host/src/streams.ts:1-24`.
- Neither introduces replay or SSE event IDs. Neither builds a client. The client's 45-second liveness and reconnect backoff therefore stay in the notes, correctly.

### 19. Inbox

Locked: `{ project: { subject: { id, title, requestedAt, conversation } } }`; newly bound project arrives; any failed store watch fails the merged stream. See `D/protocol.md:162-166`.

- C1 preserves it at `sketch/packages/core/src/host/inbox.ts:1-7` and `store/decision.ts:68-74`.
- C2 preserves it at `sketch/packages/store/src/types.ts:41-49`, `packages/host/src/projects.ts:56-59`, and `streams.ts:7`.
- The inbox shape is not a substitute for the Decision required in not_open.

### 20. Token, pairing, and network

Locked: `tau.<device>.<secret>`, regex `^[a-z][a-z0-9-]{0,31}$`, 32 random bytes, SHA-256, one use, 8 characters, 10 minutes, five wrong codes, admin.sock, 127.0.0.1:6283. See `D/protocol.md:174-196`.

- C1 retains these at `sketch/packages/core/src/host/devices.ts:1-41`, `host/admin.ts:1-24`, `cli.ts:4-24`, and `protocol/http.ts:17-27`.
- C2 retains them at `sketch/packages/host/src/devices.ts:14-43`, `index.ts:23-43`, and `packages/tau/src/command.ts:2-6`.
- Both add deployment configuration for allowed hosts. C1 also proposes an allow-host CLI flag. These are implementation proposals, not locked flag names. C2 additionally exposes allowedOrigins. Neither configures a remote listener or a client token store.

### 21. Device-scoped submission IDs and event-log protection

Locked: `client:<device>:<requestId>` and refusal of input, continue, stop, setModel on the log. See `D/host.md:54-58` and `D/protocol.md:87-91`.

- C1 retains both at `sketch/packages/core/src/host/conversations.ts:4-6,99-101` and its tests at `test/host/conversations.test.ts:14-21`.
- C2 retains both at `sketch/packages/host/src/calls.ts:208-216` and `test/protocol.test.ts:13-23`.
- Both correctly say a second stop can stop a new run.

### 22. W1 evidence, cancellation, and annotations

Locked: accepted design -> build SHA -> review SHA -> merge basis; moved head returns to review; annotation obligations continue; cancellation commits before stops; then-task dedup is by decision. See `D/walk.md:62-92,134-147`.

- C1 sketches the evidence entries and tools, but its WorkState lacks an expected design/merge/stuck decision and a handled-decision record. See `sketch/extensions/w1/src/work.ts:23-33` against its task promise at `tasks.ts:1-4`. The tool/task comments also omit explicit approval-annotation reply checking in publish_build and final handover/abort annotation handling. Its W1 test list does not fill these gaps.
- C2 explicitly sketches those fields and obligations at `sketch/packages/w1/src/work.ts:40-87`, `tasks.ts:17-19,54-65,78-95`, and `tools.ts:45-49`. This is worth keeping.
- C1's test title at `sketch/extensions/w1/test/w1.test.ts:13` calls A1 superseded while expecting conflict. In the locked walk A1 was answered. A truly superseded decision returns not_open. Fix the title before it becomes an implementation example.

### 23. W2 timer and score

Locked: background timer, latest forecast and live timer checks, immediate withdrawal on revision, stored answer time plus seven days, Brier score, event-log calibration. See `D/walk.md:171-202`.

- Both retain the main rules. C1: `sketch/extensions/w2/src/tasks.ts:14-58`. C2: `sketch/packages/w2/src/tasks.ts:17-40`.
- C1 gives each conversation its own Book but requests subject `w2:<key>`, with a model-supplied key. Two conversations can use the same key and share the core's one open slot. See `C1/sketch/extensions/w2/src/book.ts:1-19`, `tools.ts:11-17`, and `tasks.ts:17`. This needs a project-wide key rule or conversation qualification.
- C2 explicitly uses `w2:<F>:<key>` and a scored-by-decision map at `sketch/packages/w2/src/forecast.ts:47-53`. That satisfies the general extension:key subject format without cross-conversation collisions.
- C1's calibration comment only keeps Resolved entries, although the locked row reports replaced forecasts too. See `C1/sketch/extensions/w2/src/tools.ts:49-51` versus `D/walk.md:195`. C2 also reads Revised at `packages/w2/src/forecast.ts:88`.

### 24. Prose, accepted limits, and deferred work

Locked prose rules: module-load validation, declared slots, one-pass substitution, no template language. See `D/prose.md:66-80`. Deferred and dropped scope: `D/README.md:188-218`.

- Both preserve the prose rules in their kit sketches and keep Markdown with its workflow.
- Both leave out a client, sandboxing, removal, unbinding, conversation deletion, shared secrets, model-call limits, and a read-only store viewer.
- Both defer the Webfox version and real provider seam. C1 copies the illustrative exa/tavily enumeration. C2 leaves provider as a string pending Unit 3. This is an explicit permitted deferral in `D/extensions.md:109-123`, not an unauthorized redesign.
- Neither claims to solve power loss, malicious same-user shells, workflow upgrades, or concurrent W1 handovers. Keep those limits visible.

### 25. Substrate ordering, ownership, and replay

Locked: table reads precede table writes, at most one submit per commit, host-created tasks name a conversation, and replay-safe tools can run twice. See `D/primitives.md:13-19`.

- C1 names the order in `sketch/packages/core/src/store/decision.ts:9-11,211-229` and `store/event.ts:31-38`. W1 prepare deliberately separates conversation creation from its first submission at `sketch/extensions/w1/src/tasks.ts:38-49`. Tool receipts are required at `sketch/extensions/w1/src/tools.ts:1-4` and `extensions/w2/src/tools.ts:1-5`.
- C2 names the answer ownership/order rules at `sketch/packages/store/src/host.ts:43-48`, event order at `events.ts:9-15`, and W1's one-submit and two-phase prepare at `sketch/packages/w1/src/tasks.ts:17-30`. Its Work and Book both have receipts and decision-keyed continuation deduplication.
- Both preserve these rules in their pseudocode. C1's Work type still lacks the state its continuation-deduplication comment promises, as row 22 records. Neither has implemented evidence for the rules yet.

### 26. Project isolation and eager reopening

Locked: one store, harness, and registry per project. Open and resume every project at server start, not only on first use. See `D/topology.md:3-5,65-77`.

- C1 preserves this in `sketch/packages/core/src/host/project.ts:53-61` and `host/host.ts:75-85`. Its process-wide maps index distinct OpenProject values.
- C2 preserves it in `sketch/packages/host/src/projects.ts:13-17,27-32`. The host owns lifecycle; each Store owns a harness over its own storage.
- Neither introduces one global durable store, one shared extension registry, a second scheduler, or a persistent cross-project ledger.

## Additional deviations and handoff holes

### Candidate 1

1. **Execution environment is missing.** HostConfig and StoreOptions have models, clock, and reporting, but no env. See `C1/sketch/packages/core/src/host/host.ts:21-32` and `store/store.ts:12-19`. The host must wire the execution environment into the harness. That is fixed by `D/README.md:65,109` and `D/primitives.md:200-208`. Adding the ordinary pi env parameter is not designing sandboxing.
2. **New projections need a decision.** `conversations.owner` is reduced to ConversationId at `packages/core/src/host/conversations.ts:45-48`. pi-durable 1.5.2's owner is `{ conversationId, taskId }`. Its installed declaration is `/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works/pi-durable/dist/types.d.ts:387-399`. ThenState also collapses live execution states to `live` at `packages/core/src/store/decision.ts:234-239`. The notes do not give a literal TypeScript declaration for these two result members, so these are unsupported projections to resolve, not claims of a character-level mismatch with a nonexistent declaration. C2 retains the substrate shapes.
3. **Extra restrictions are not locked behavior.** Besides the page cap, W2's key regex and 40-character limit appear at `extensions/w2/src/tools.ts:11-17`. W1 requires replies arrays and nonempty publication text even for initial versions at `extensions/w1/src/tools.ts:22,36`. The tool argument schemas are not fully fixed by the notes, but these choices should be identified as choices rather than copied invariants.
4. **External parsing is uneven.** HTTP call schemas are concrete. Device-file and admin-message parsing are not sketched with pi-schema, and websearch does not state provider-response validation. See `packages/core/src/host/devices.ts:38-41`, `host/admin.ts:21-30`, and `extensions/websearch/src/search.ts:26-33`. C2 is clearer about these entry seams.
5. **The sketch implements some behavior.** modelRef, deviceId, encodeCursor, and the sleep phase already have real bodies. The brief asked for signatures and not-implemented bodies. Keep safe module-loading declarations, but do not silently treat these helpers as accepted implementation. See `packages/kit/src/model-ref.ts:8-10`, `packages/core/src/host/devices.ts:14-16`, `host/cursor.ts:15-16`, and `extensions/w2/src/tasks.ts:29-30`.

### Candidate 2

1. **HTTP dispatch lacks its dependencies.** `serve` takes request, response, calls, devices, and a Chord Context at `C2/sketch/packages/host/src/http.ts:10-16`. A descriptor needs Projects, ServerOptions, DeviceId, and Context at `packages/host/src/calls.ts:37-42,53-56`. The static call object captures none of them. Supply an already-bound dispatcher or a private host context. Do not make each route rediscover state.
2. **Ambient values disappear at runtime.** W2 due/score and all W1 tasks/hooks use `export declare const`, then other modules import them as values. See `packages/w2/src/tasks.ts:17-20`, `forecast.ts:9,93-96`, `packages/w1/src/tasks.ts:16-96`, and `tools.ts:7-17,87-100`. The emitted W2 import fails with SyntaxError. The task file explicitly says these declarations will be replaced later. That is an acknowledged sketch shortcut, but it prevents a composition linkage check now. Use real defineTask stubs, not declarations that only satisfy TypeScript.
3. **The code/status surface is incomplete.** A generic Refusal with code:string and the instruction to use the table do not fulfill the brief's public type sketch. Add the locked list without C1's speculative codes.
4. **The human-answer workflow acceptance seam has no declared home.** `boundaries.json:7-18` permits neither tau-host nor tau-store/host in extension tests, and the checker scans test as well as src at `tools/check-boundaries.mjs:151-155`. Its primary extension seam is a pi harness. That is good for local workflow rules, but the complete request/answer/recovery journey needs a permitted host seam. tau/test already has the composition dependencies and is a simple home.
5. **The crash barrier instruction is incomplete.** `packages/store/test/spikes/PLAN.md:3` proposes barriers at a caller's commit. answer owns its commit and gives its caller no callback. Use the normal Storage input to place the barrier, as C1 demonstrates. Do not add a production fault hook.
6. **The request registry probe is too weak about unknown fields.** `probe/run.mjs:45-47` tests `{ by: "forged" }` alone. For most calls it can fail because required fields are absent even if extra fields are accepted. The judge reran a stronger version with independently supplied valid bodies before adding by. It passes. Keep that stronger test.
7. **The module map repeats names.** `C2/sketch/packages/host/src/index.ts:24` accepts a string-keyed structural map. Its type checks module members but cannot check map keys against extension.name. The startup TODO says to validate static modules, but does not name this equality. Validate it there or derive keys from the modules, as C1 does.
8. **Acceptance spike replacement is not compatible with the merged gate.** `sketch/README.md:59` and `tools/spikes.mjs:5-9` replace the six existing design spikes with only future real-function crash spikes. The existing six must remain a separate required gate. Add real-function recovery checks rather than deleting design/toolchain evidence.

## Red-flag screen

The screen is `R/.agents/skills/architect/references/design-red-flags.md`. Every flag is covered below. A risk describes the proposed shape, not an assertion that unimplemented code already has divergent behavior.

| Red flag | Candidate 1 | Candidate 2 |
| --- | --- | --- |
| Shallow module | **Revise.** Host.call hides substantial behavior, but it exports the protocol model and adds Feed. Store is deep. See `host/host.ts:40-58`, `host/index.ts:8-15`, `host/feed.ts:40-67`. | **Mostly clear.** startServer hides lifecycle and transport. Projects and Devices own policy, not mere steps. Store exposes Harness and HarnessOptions, so callers still coordinate its paused-start lifecycle. See `host/src/index.ts:22-44`, `store/src/host.ts:18-30`. |
| Information leakage | **Present.** Public Frame, Op, Path, Reply, and CallBody re-exports are precisely the wire-type leakage the screen warns about. See `packages/core/src/host/index.ts:8-15`. | **Clear at the public host surface.** Wire types stay internal. Domain Decision is legitimately shared. Avoid exposing more HarnessOptions than the host/store seam needs. See `packages/host/src/index.ts:13-64`, `http.ts:5-9`, `store/src/host.ts:18-21`. |
| Temporal decomposition | **Mostly clear.** Stores, projects, devices, options, and conversations own knowledge. W1 phase splits are required durable checkpoints, not arbitrary load/validate/save layers. See `extensions/w1/src/tasks.ts:38-61`. | **Risk.** Moving answer into host.ts separates mutations of the same Decision by caller role. Move its implementation beside request. Durable prepare phases themselves are correct. See `store/src/decisions.ts:23-46`, `store/src/host.ts:33-49`. |
| Pass-through method | **Some cost.** Many descriptor lambdas pass body fields to another function with nearly the same shape. Keep the domain function only where it owns validation, namespace policy, or a commit. See `packages/core/src/host/calls.ts:104-168` and `conversations.ts:99-154`. | **Mostly clear.** Dispatch is justified by validation and type closure. requestAdmin adapts the Unix socket, not a redundant host call. Some Projects forwarding remains to be assessed once filled. See `host/src/calls.ts:45-75`, `host/src/index.ts:59-64`. |
| Split ownership | **Good store locality, workflow gaps.** request/answer own the same private documents in one module. HostState publicly shares mutable maps among private handlers, so ownership is a convention inside core. See `store/decision.ts:104-135`, `host/host.ts:61-73`. | **Revise Decision locality.** One package owns the records, but two source modules will mutate them. Projects owns catalogue and inbox joins together. Devices owns revocation and stream registration together. See `store/src/decisions.ts`, `store/src/host.ts`, `host/src/projects.ts:20-59`, `devices.ts:22-38`. |
| Two ways to do one task | **Risk.** HTTP and public Host.call are two entry seams, though they promise the same dispatcher. model parsing and default overlay are duplicated across core and kit, explicitly. That duplication is justified by the locked import rule, not a reason to move kit into core. See `C1/design.md:277-281`. | **Mostly clear.** One emitted runtime and one HTTP client seam. Local admin is a different authority, not a second client protocol. Do not add source-runtime export conditions. See `C2/sketch/README.md:53-59`. |
| Importable internals | **Present.** The sibling-relative examples compile and lint. The claim that all package internals are unreachable is false. See `J/boundary-audit.log:82-104`. | **Clear for the required import forms.** Export maps plus resolved package ownership and capability checks reject them. See `J/boundary-audit.log:129-181`. No claim of protection from eval or same-user shell access is made. |
| Hand-synced list | **Mostly clear for calls.** The runtime list is single-source. The independent expected list in a test is good regression protection, not a second routing owner. Body shapes in conversation functions still duplicate schemas. See `host/calls.ts:207-214`, `test/protocol/calls.test.ts:12-50`. | **Clear for calls, risk in tooling metadata.** Call names derive from descriptors. Manifests, references, boundaries.json, and composition repeat package relationships. The checker rejects forbidden dependencies but does not ensure every allowed workspace import is declared, or prove reference parity. See `tools/check-boundaries.mjs:64-75,134-141`. |

For the shorter references in the table, Candidate 1 paths start at `C1/sketch/packages/core/src/` unless otherwise named. Candidate 2 paths start at `C2/sketch/packages/`.

## The merged Nix flake

### What is fixed now

`R/flake.nix:20-23` builds dependency modules from the root lock. `flake.nix:107` links that output as one node_modules symlink. Biome comes from nixpkgs at `flake.nix:33,45,98`. The six named design spikes remain at `flake.nix:54-61`. Current check and flake checks only run lint and spikes at `flake.nix:64-85`; they do not yet run either candidate's TypeScript or tests.

The pinned nixpkgs revision is `ac588ef1c914865dad517b337ea0eb9694a4021c`. I fetched its importNpmLock and Biome definitions for inspection. Copies are at `J/nixpkgs-import-npm-lock.nix`, `J/nixpkgs-npm-config-hook.sh`, and `J/nixpkgs-biome.nix`. The remote source is `https://github.com/NixOS/nixpkgs/tree/ac588ef1c914865dad517b337ea0eb9694a4021c/pkgs/build-support/node/import-npm-lock`.

buildNodeModules does not unpack the workspace source. It starts from package.json and package-lock.json. Its import step rewrites resolved sources and removes the lock's link marker. See `J/nixpkgs-import-npm-lock.nix:78-81,135-137,199-213,227-240`. An ordinary npm workspace install beside source is therefore not a faithful probe of that layout. The judge's small reproduction leaves the workspace package absent for both choices. It is not a full Nix build, but it is enough to reject the assumption that the current flake automatically gives live workspace links.

The pinned Biome version is 2.4.15, not either npm-pinned candidate version. See `J/nixpkgs-biome.nix:12-14`. I used the published 2.4.15 binary for compatibility checks. That is a version/configuration check, not a claim to have executed the Nix-built binary.

### Changes both layouts need

1. Provide package-name resolution to the actual working checkout, including newly emitted output. Use a generated local link directory or per-package link overlay. Keep external dependencies read-only in `/nix/store`. Do not ask workers to npm install. The existing one-link shellHook is insufficient as stated.
2. Prove edit visibility. Change a workspace source export, run a cross-package test, and show the changed value is used without rebuilding dependencies. Do the same with emitted output for Candidate 2. Neither current probe establishes this Nix property.
3. Remove npm Biome from the normal dependency toolchain and use the flake's version. Adapt C1's configuration from preset to the supported rules form. Apply C2's small spacing fix. Re-run the negative import checks using the actual supplied Biome.
4. Add typecheck and test commands to the flake and to its cumulative check. Include the import gate. Test the actual candidate source, not a frozen dependency snapshot.
5. Run source-dependent checks from a writable build copy with the required dependency links. The current `cd ${self}` is read-only. Candidate 2 must emit JS, declarations, build info, and Markdown. Even Candidate 1 needs a place to construct the correct workspace links.
6. Preserve the six existing design spikes under spikes. Add real-function crash tests at the implementation boundary. For Darwin test derivations that open real sockets, grant the same local-network allowance that spikes has now.

### Choice-specific requirements

**Candidate 1:** Keep the source package tree outside every physical node_modules directory. Merely pointing exports to .ts is not enough. Its own T2 and the judge rerun show the Node restriction. A final server wrapper can run a source tree under `$out/lib/tau`, with suitable links to external dependencies and sibling packages. There is no TypeScript emit or Markdown copy step.

**Candidate 2:** Keep writable dist output in the live checkout or writable verification copy. Link workspace names to those package directories. Build before running emitted tests or the bin. Install JS and its copied Markdown together. An immutable npm dependency output built before emit cannot be assumed to contain or resolve the later dist files.

These are requirements for the flake agent, not instructions to modify the candidates during this arena.

## Worthwhile grafts

### From Candidate 1 into the recommended Candidate 2 base

1. **One Decision implementation owner.** Put request, withdraw, decision, and answer logic beside each other. Keep the separate host export as an authority seam. Take `C1/sketch/packages/core/src/store/decision.ts:1-11,139-229`, but retain C2's correct not_open payload and literal public types.
2. **The refusal/status table.** Take the single table and answer-code inclusion check from `C1/sketch/packages/core/src/host/refusals.ts:11-58`. Remove the unapproved extra codes. Keep it private to host transport.
3. **The measured read-only lookup trap and Storage crash seam.** Take `C1/probe/pi-facts/family-read.ts` and `storage-wrap.ts`. Make read-only lookup tests and killed-answer tests exercise the actual public functions. Initialize the necessary store documents explicitly.
4. **Checked type and export contracts in the normal gate.** Take the pattern of `C1/sketch/packages/core/test/types.test.ts:25-45` and `exports.test.ts:10-17`. C2's public-types probe should become retained type coverage. Also retain an independent expected 20-call contract and valid-body-plus-extra-field tests.
5. **Runtime-safe task skeletons.** Use actual defineTask objects with not-implemented handlers as C1 does. Do not emit phantom exports. A composition-import smoke check should fail on missing exports before implementation begins.
6. **Module-name derivation.** C1's array indexed by extension.name avoids a second handwritten module name in the import map. See `C1/sketch/apps/tau/src/extensions.ts:2-14` and `packages/core/src/host/host.ts:24-25,82`.

### What Candidate 2 has that Candidate 1 lacks

These remain valuable even if the owner chooses Candidate 1 instead.

1. The resolved-path capability checker, including type-import expressions and forbidden declared dependencies.
2. A narrow public server interface and direct WatchHandle-to-HTTP streaming, without public wire exports or a new Feed abstraction.
3. The probed process-death-safe SQLite lock. Keep the real two-process test and add it to host lifecycle verification. Do not mistake the lock-file probe for complete startup/close correctness.
4. Environment passthrough through the ordinary pi HarnessOptions seam.
5. W1's expected-decision and handled-decision state, plus explicit approval and terminal annotation tests.
6. W2's conversation-qualified subjects and replaced-forecast calibration plan.
7. A more deliberate test-cost plan, real-Git seam, and a provider-content compatibility check rather than a fake provider result.
8. The emitted-distribution and Markdown asset plan, if emit is selected. It is not a mandatory graft onto a repaired type-stripping layout.

## Parts to reject

- Reject C1's claim that its globs make all package internals unreachable. Replace the enforcement, not just the wording.
- Reject C1's shortened not_open payload, invented page cap, premature extra refusal codes, and bad-request classification of semantic annotation-range errors.
- Reject C1's missing env path, unqualified per-conversation W2 keys, and W1 state that cannot hold its promised continuation guards.
- Reject C1's public re-exports of wire types and the new Feed layer unless a concrete need survives comparison with the existing watch interface.
- Reject C2's ambient task and hook values. They compile but are not runtime values.
- Reject C2's generic code:string as a substitute for sketching the locked code/status surface.
- Reject C2's incomplete dispatch context and unspecified human-answer integration-test home.
- Reject replacing the six design spikes with only real-function K checks. Keep both kinds of evidence at their proper gates.
- Reject both claims of flake readiness based on ordinary npm workspace links and npm Biome.
- Reject treating TODO counts, asset-file copying alone, or a successful generic two-package fixture as proof that the complete Tau composition runs.

## What both got wrong or left out

- Neither proves live workspace resolution under the merged immutable dependency layout.
- Neither currently passes the pinned Biome check unchanged.
- Neither integrates typecheck and tests into the actual merged flake. That work is still required.
- Neither settles the exact handling of an omitted input.whenBusy. They silently choose different contracts.
- Neither supplies a fully sketched closed pi-schema value for pairing/admin messages alongside the main 20-call registry. C2 states the requirement more clearly, but the concrete schemas are still missing.
- Neither has a complete executable composition check that can remain useful as each helper becomes real. C1 currently loads because helper stubs defer work. C2 does not link its workflow tasks at all.
- Neither has implemented behavioral evidence. The failure lists are useful work plans, not accepted behavior. Real-function K1 to K6, HTTP recovery, W0 across devices, Webfox compatibility, W2, and W1 remain to be built and verified in order.

The next step is a small architecture repair pass on the Candidate 2 base. Resolve the listed contract questions with the owner. Repair the interfaces and retain the decisive negative probes. Then hand Unit 1 its failure list and its isolated store files. Only a human merges.
