# Source register for pluggable kernels

This register describes the inspected source. It does not describe an implemented extension interface.

## Fixed snapshots

| Label | Source | Commit |
| --- | --- | --- |
| B | [PR #32](https://github.com/vicrdguez/render/pull/32), `proposal/render-v1`. | `3983eacad1be8196d7d67263f03ecdecb9558329` |
| E | [PR #79](https://github.com/vicrdguez/render/pull/79), `feature/kernel-effect-pilot`. | `994cbfbe9e97fd8443c01dc1d431bb9d0c81066d` |

The investigation read exported copies of these commits. It did not change branches or implementation files. Later branch changes require a fresh comparison.

## Current architecture

### S1. The accepted v1 design is narrower than this proposal.

The [accepted specification](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/docs/spec.md#L245-L301) defines five modules. Kernel decides domain legality. Ledger accepts and persists. Engine supervises execution. Sandboxes own isolated execution. Effects owns trusted Git and forge operations.

The [v1 non-goals](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/docs/spec.md#L77-L83) exclude a generic workflow plugin framework. The user's current request asks for a future design. It does not retroactively amend the accepted v1 contract.

### S2. The inspected store has no explicit project or kernel binding.

The [host composition](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/host/host.ts#L20-L34) opens one Engine and Ledger for a data directory. [Store initialization](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/startup.ts#L48-L64) identifies a fresh database.

[Meta and Workflow](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/records.ts#L19-L92) distinguish store-wide identity from workflows inside the store. Neither includes a kernel identifier. Treating one initialized store as the initial project authority is a proposed mapping, not an existing explicit product entity. `createWorkflow` is not project creation.

### S3. Ledger owns atomic acceptance.

The [command transaction](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/ledger.ts#L311-L382) rechecks identity and scope, checks a namespaced receipt, and loads state before the decision. The [decision invocation](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/ledger.ts#L920-L958) uses Ledger-resolved inputs and identities.

The baseline [write and receipt path](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/ledger/ledger.ts#L1346-L1548) stages runtime work and records acceptance in the same transaction. The proposed extension must preserve that property.

### S4. Durable documents and entries already provide two different kinds of persistence.

[Record definitions](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/records.ts#L1-L10) use Durable document families and immutable entries. [Mutable current records](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/records.ts#L19-L92) and [retained revisions and facts](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/records.ts#L229-L274) have different jobs.

The source does not establish that facts alone can reconstruct all current state. This proposal therefore does not treat Render as a replay-complete event store. It also does not assume application-owned SQL tables or database foreign keys for each workflow concept.

### S5. The current kernel is a coherent workflow, not a ready extension slot.

The baseline [kernel command and state contract](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/kernel/kernel.ts#L29-L196) includes built-in workflow concepts. [Permission and routing](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/kernel/kernel.ts#L200-L330) use a closed catalogue. [Role and assignment definitions](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/kernel/roles.ts#L56-L260) include a closed role vocabulary.

The [runtime intent mapping](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/engine/runtime.ts#L1039-L1082) and [workflow view](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/kernel/kernel.ts#L501-L615) share that vocabulary. Replacing the decision function alone cannot make those layers workflow-independent.

### S6. PR #79 preserves synchronous interpretation.

PR #79 [pins Effect 4.1.2](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/package.json#L76-L84). The [Effect decision adapter](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/kernel.ts#L523-L533) interprets a typed decision through `Effect.runSync`. The [evidence schemas](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/evidence-schema.ts#L1-L140) validate selected nested evidence. Shape validation does not establish provenance or authorization.

The [Effect 4 running-effects documentation](https://effect.website/docs/v4/getting-started/running-effects) states that the type system does not establish synchronous execution. It also states that an asynchronous effect passed to `runSync` can continue in the background after the call throws. An environment type of `never` is therefore not a synchrony or purity guarantee.

A local probe against the installed Effect 4.1.2 dependency confirmed this order. No Ledger or Render runtime was opened.

```text
synchronous boundary returned Failure
async continuation ran
```

The probe ran `Effect.runSyncExit` on a promise followed by a synchronous trace append, then observed the trace after a `setImmediate` callback. This establishes a concrete risk in interpreting arbitrary plugin Effects synchronously. It does not establish that PR #79's current pure decisions perform asynchronous work.

The [Effect 4 runtime documentation](https://effect.website/docs/v4/runtime) explains runtime dependency composition. It is background material, not a claim that Render already has kernel Layers. The proposal must use the repository's actual Effect version when implemented.

### S7. Startup compatibility comes before dispatch.

[Startup inspection](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/startup.ts#L76-L120) blocks unsupported task definitions and uncertain execution. [The startup fence](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/startup.ts#L144-L193) precedes resume. [Runtime task staging](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/engine/runtime.ts#L98-L107) already accepts the enclosing transaction.

The [accepted version policy](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/docs/spec.md#L1247-L1254) preserves task meaning and historical records. Selecting a different installed default cannot substitute for a missing kernel implementation.

### S8. Transport and export require deliberate extension work.

The [envelope decoder](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/envelope.ts#L61-L104) and [command router](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/kernel.ts#L225-L340) assume the built-in catalogue. [Snapshots](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/ledger.ts#L2257-L2307) expose built-in views and settings.

The [history protocol](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/history.ts#L5-L81) lists unavailable kinds and exclusions. The [independent export reader](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/client/read-export.ts#L23-L103) validates a bounded format. Neither is a generic kernel archive today.

### S9. Host protections currently pass through the built-in kernel.

The [current command catalogue](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/kernel.ts#L252-L294) classifies `enrollDevice` and `revokeDevice` as local-admin commands and `recordStartup` as recovery maintenance. Their [handlers](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/kernel.ts#L491-L521) live in today's kernel. Moving these protections to host-only routes is required extraction work, not a property the extension interface already has.

[Startup initialization and policy import](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/ledger/startup.ts#L126-L175) currently initialize Meta and may seed checkpoint settings from a file. Explicit new-project creation must replace these implicit behaviors. Reopen cannot retain them while claiming to leave project selection and captured policy unchanged.

The current [admission call](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/engine/runtime.ts#L2035-L2050) submits `admitEffect`, whose [kernel handler](https://github.com/vicrdguez/render/blob/994cbfbe9e97fd8443c01dc1d431bb9d0c81066d/src/kernel/integration.ts#L355-L365) rechecks eligibility. A pluggable design needs an explicit host-to-kernel input for that decision, not an Engine branch that knows a particular kernel's command names.

The baseline [fatal command reply](https://github.com/vicrdguez/render/blob/3983eacad1be8196d7d67263f03ecdecb9558329/src/ledger/ledger.ts#L289-L298) maps every non-`Abort` throw from acceptance to `outcome_unknown` and says storage failed. A distinct known kernel-defect reply is proposed extraction work. It does not exist in that baseline.

## Evidence limits

This investigation used source reading and targeted source probes. It did not execute Render's product tests, open a live ledger, or prove an extension implementation. It did not inspect Durable's entire physical storage implementation. Proposed interfaces, compatibility rules, and failure outcomes remain design claims until implementation tests establish them.
