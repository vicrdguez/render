# Effect in Render

Render uses Effect 4 for command decisions and application orchestration. The five modules and their ownership remain unchanged. The `Effects` module is Render's private Git/Forge executor; it is not the Effect library.

## Program boundaries

- Kernel `change` and its command families return synchronous Effect programs. Refusals use the typed error channel; synchronous consumers interpret the program at their own boundary. A missing Ledger-supplied identity remains a defect.
- Ledger composes reads, Kernel decisions and record staging inside the existing Durable transaction callback. A refused command must reject that callback so staged changes roll back. Returning a failure value from the callback would commit it as a successful transaction.
- Effect programs use ordinary domain names: `perform`, `observe`, `seal`, `openHost`, and so on. There are no parallel Promise façades or `Effect`-suffixed alternatives. Effect callers compose programs directly; Promise-only consumers, including imperative test fixtures, call the native interpreter at their own boundary. Node callbacks and Durable transactions still require those interpreters.
- `src/effect.ts` adapts external Promise operations without introducing retries or cancellation. It re-exports Effect 4's native Promise interpreter, which preserves original failure and defect values. An unclassified external I/O failure stays `unknown` until its responsible module classifies it.

Small pure algorithms, domain data definitions, protocol parsing, history projection and cryptographic identity functions remain ordinary TypeScript. Effect is not useful merely as an import on every file. The independent export reader remains standalone and uses only Node built-ins.

## Failure and cleanup rules

A yielded failure is not a JavaScript exception thrown back into a generator. A JavaScript `catch` or `finally` around `yield*` does not recover that failure or guarantee cleanup. Effectful cleanup must be part of the program's failure/finalization path. Parsing-only `try/catch` blocks can remain ordinary JavaScript.

Normal cleanup and durable recovery are separate. A successfully opened host, store or sandbox must not be closed just because its acquisition program finished. A scope or finalizer cannot establish that an interrupted container stopped, a remote request was not charged, or a Git mutation did not happen.

## Authority and recovery

- Ledger still owns authentication, transaction-time scope checks, deduplication, accepted state, receipts and task intents. An admitted command finishes its commit and read-model adoption before Effect interruption can leave its program. Transport disconnect is not domain cancellation.
- Startup still takes the owner lock before opening the store, inspects retained tasks without dispatch, commits a fresh executor fence, and only then resumes.
- Pi Durable still owns retained task definitions and replay checkpoints. Effect programs do not replace those checkpoints or change replay-safe classifications.
- Sandbox admission still checks current assignment/generation/Attempt/executor authority. `Sandboxes.prepare` starts and caches admission when called; `Sandboxes.seal` fences immediately and starts or reuses the cached seal operation. Their returned programs observe those same admitted operations without cancellation or duplicate dispatch. The private Promise caches serve that ownership protocol, not a second public API. Stop and seal retain their journal, quarantine and whole-container checks.
- Git and Forge mutations still require their recorded admissions. Expected-old CAS, durable readback and explicit unknown outcomes remain necessary. No generic Effect retry or automatic interruption is permission to dispatch again.
- Schema decoding checks shape, not provenance. Ledger preserves and checks original retained bytes; re-encoding a decoded object is not an identity-preserving substitute.

TypeScript and Effect do not enforce linear ownership. Old state aliases, reusable programs and old permits remain representable. Render's runtime authority and persistence protocol enforce the relevant restrictions.
