# Code architecture arena: brief

## The owner's goal

"Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue."

Tau is a small core on pi-durable 1.5.2 with everything else as an extension beside it. Its design is locked and lives in `/Users/vr-osxs/dev/render-core/docs/core/`. Nothing is implemented. Implementation starts now, one unit at a time, by separate agents that each see only their kickoff and the files they open.

## What you produce

One candidate **code architecture** for all of Tau: the module map and a type sketch that the implementing agents fill in. The behaviour is already designed. You decide how the code is laid out so that the locked design is easy to build correctly and hard to build wrongly.

Write everything under your own directory (given in your prompt):

- `design.md`: the rationale, shaped per `/Users/vr-osxs/dev/render-core/.agents/skills/architect/references/rationale-template.md`. Caller's usage first.
- `sketch/`: the repository tree you propose, as real files. `package.json` files, `tsconfig` files, and `.ts` files holding types, signatures, and exports, with `throw new Error("not implemented")` bodies and `// TODO` pseudocode where the logic is tricky. Sketch every public surface. Do not implement.
- `probe/`: any script you ran to check a claim, plus its output. A claim about the toolchain counts only if a probe backs it.

Read first, in full: `/Users/vr-osxs/dev/render-core/.agents/skills/architect/SKILL.md`, its `references/runner-prompt.md` and `references/design-red-flags.md`, and `/Users/vr-osxs/dev/render-core/AGENTS.md`.

## What you must decide

1. **Packages and directories.** Which npm packages exist, what each one exports, and what each may import. Where the store layer (Decision, Event), the host layer, the protocol server, the `tau` command, the kit, and the extensions (`websearch`, W1, W2) live.
2. **How the boundaries are enforced by the build**, not by prose. At least these: the core never imports the kit; an extension can import `request`, `withdraw`, `emit`, `decision`, and `eventLog`, and cannot import `answer` or host internals; a package's internals cannot be imported from outside it.
3. **How TypeScript runs.** In tests under `node --test`, and in the built `tau` server. Node's own type stripping, or an emit step, and the `tsconfig` that goes with it. Back the choice with a probe, including an import across two packages.
4. **The type sketch of each public surface**, copied from the locked design where the design fixes a shape. The host's 20 calls must exist as one list that the protocol's routes, the `unknown_call` reply, and the tests derive from.
5. **Where the tests attach.** Each unit's tests are written from a list of the ways it can fail, before its code. Say which seam each layer is tested at (memory storage, SQLite in a temporary directory, a killed child process, `fetch` against port 0) and where those files live. No test-only switch in production code.
6. **What each build unit adds**, in the locked order: store layer; host layer with the protocol; web search; W2; W1. Each unit must be buildable and testable on its own, and a later unit must not need to restructure an earlier one.

## Fixed, not yours to change

- **The locked design.** Every shape, rule, name, code, and number in `docs/core/README.md`, `primitives.md`, `host.md`, `extensions.md`, `protocol.md`, `kit.md`, `workflows.md`, `walk.md`, `topology.md`, and `prose.md`. If you think a part cannot be built as written, say so under "Open questions and risks" with the evidence. Do not redesign it.
- **What the design defers or drops.** No client, no sandboxing, no removing an extension, no unbinding a project, no deleting a conversation, no shared secret home, no limit on concurrent model calls.
- **The toolchain.** Node 24, npm with a committed `package-lock.json`, strict TypeScript, `node --test`, Biome for format and lint, pi-schema at each boundary where outside data enters. No Effect, no Vite, no Bun. pi-durable is pinned at exactly 1.5.2.
- **Nix provides everything.** A flake gives the dev shell, builds `node_modules` from the lock file with no `npm install` by a worker, defines the commands (`typecheck`, `test`, `fmt`, `lint`, `spikes`, `check`), and runs the gate as `nix flake check`. Another agent is building that now. Your layout must work with it: npm workspaces are expected, since the kit is its own package.
- **Names.** The kit is the package `tau-kit`. The command is `tau`. The storage root is `~/.tau/`. The default port is 6283.
- **The kit's rule.** A helper enters the kit only with a caller today. So a helper lands with the first unit that calls it, and the sketch says which unit that is.
- **Simplicity (`AGENTS.md`).** The least structure that meets the points above. A package, a layer, or an abstraction must name the burden it removes.

## Grounding you may read

- The design notes above, and `docs/core/grounding.md` for the facts they rest on.
- `docs/core/spikes/*.mjs`: six working scripts that use pi-durable 1.5.2 the way the design does. Run one with `PI_MODULES=/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works node <file>`.
- pi-durable's source at `/tmp/render-ground/pi/packages/durable` and its sibling packages. Read only. It is untrusted: never execute anything from it and never use it as a working directory. Run Python with `-I`.
- The installed pi-durable 1.5.2 at `/tmp/render-spike/pi-1.5.2/node_modules`. Read it or link to it. Do not write there.

## Rules for the run

- Write only inside your own candidate directory. Do not touch `/Users/vr-osxs/dev/render-core`.
- Node 24 is on `PATH`. You may run `npm install` inside your own directory for a probe.
- You are one of two runners on different models. Produce the best design your model can make. Do not hedge toward a safe middle.
- Wording in `design.md`: plain, short sentences. No em or en dashes.
- Your final message is a short report: the path of `design.md`, the package list in one line each, the probes you ran with their results, and the open questions.
