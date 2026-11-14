# Candidate 1 probes

Checkout: `git worktree add --detach /tmp/c1-probe.kDWNfm/checkout origin/render-core` at `b6bc814`, built with
`nix develop -c typecheck`. Node v24.22.1, TypeScript 5.9.3, jiti 2.7.0 (installed in `/tmp/c1-probe.kDWNfm/p`),
pi-durable 1.5.2. Every command ran as `/nix/var/nix/profiles/default/bin/nix develop -c …` from the checkout.
Nothing in the repository changed. The worktree was removed afterwards. Each `.log` is the full output of its script.

These cover only what `probe-report.md` does not.

| Script | Claim it measures | Result |
| --- | --- | --- |
| `a-setup.mjs` | Builds a stand-in `tau-extension` (a package whose `exports` map is the one alias list) and target-shaped copies of the real W1, W2 and websearch: every import through `tau-extension`, relative specifiers ending in `.ts`, a root `index.ts`, `~/.tau/extensions/<name>` as symlinks. | 57 specifiers rewritten. |
| `a-load.mjs` | The loader's call on the real sources: aliases derived from the exports map minus `./testing`; load time with `fsCache` off and on; re-import; webfox from the real path; identity; the scratch registry as a dry run. | All three load. `fsCache: false`: W1 63 ms, W2 22 ms, websearch 7 ms first (plus 196 ms once for Webfox's own graph); re-import 44, 13, 6 ms. Warm private cache: 3, 2, 1 ms. `request` and `CodingTools` identical to the host's. A module whose task name collides is refused by `install` and the registry is unchanged. |
| `a-extra.mjs` | An alias for `tau-extension/testing` that points at a throwing module; an unaliased pi import from an extension with no `node_modules`; whether `fsCache: false` writes anything. | The testing import fails the load with the stub's message as an ordinary `Error`. The direct pi import fails with `Cannot find module`. `fsCache: false` wrote nothing to `TMPDIR` or beside the loader. |
| `a-default-cache.mjs` | Where jiti writes with its default `fsCache`. | `$TMPDIR/jiti`, mode 755, five transformed files for W2. |
| `b-setup.mjs`, `b-run.sh` | The extension side's toolchain: `tsc -b` on a `noEmit` leaf with `allowImportingTsExtensions` and `erasableSyntaxOnly` that references a composite package; the real W2 tests run from source with `node --test`; what each check catches. | `tsc -b` exit 0, nothing emitted. All 17 W2 tests pass from source (6 spawn a `.ts` child and SIGKILL it), no warning printed. A type error and an enum each fail `tsc` (exit 1). A relative `./forecast.js` left in source passes `tsc` and fails at run time with `ERR_MODULE_NOT_FOUND`, so the import check must refuse it. |
| `c-inspect.mjs` | What `harness.inspect()` says right after a replacement, before a stored task is due; and a same-version replacement that drops the phase a sleeping task is checkpointed at. | Before due, a v1 task under a v2 definition without `migrate` shows `sleeping`; it blocks `migration_failed` only when due. With `migrate` it completes as v2. A same-version definition without the phase ends the task `faulted` ("phases[checkpoint.phase] is not a function"), which is final. |
| `c-install-writes.mjs` | Whether `registry.install` of a replacement writes to storage (SQLite, `commit` counted through a proxy), with two sleeping tasks. | 0 commits during install and the next 100 ms, for same version, v2 with and without `migrate`. Install took 0.03 to 0.19 ms. |

Not measured: two reloads at once, a process killed during a reload, memory over many reloads, Linux, the Nix build
of the new layout.
