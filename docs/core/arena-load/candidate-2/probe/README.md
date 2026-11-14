# Candidate 2 measurements

Checkout: detached origin/render-core at b6bc81457f230f9480c96bf2ccb6e27f0289bf62.
Location during execution: /tmp/arena-load/candidate-2/probe/checkout.
Fetched origin from /Users/vr-osxs/dev/render-core before adding that worktree.
Node came from `/nix/var/nix/profiles/default/bin/nix develop -c ...` throughout.
Node v24.22.1, darwin/arm64, installed pi packages exactly 1.5.2.

`run.sh` is the reproducible runner. Its commands were executed in stages during design. It creates and removes the detached worktree and records the individual outputs alongside the scripts. No model provider, real login, real search provider, or persistent user home was used. The baseline suite makes its own temporary homes. The registry probe uses MemoryStorage and a controlled clock, not SQLite.

## Results

- `setup.log`: focused build/typecheck of the unchanged checkout passed, including workspace lock and import checks.
- `registry.mjs` / `registry.log`: PASS. A task-name collision threw while retaining the exact prior registry snapshot. A synchronous registry subscriber that threw did so after the replacement had become current. This disproves rollback-on-any-install-throw.
- The same probe created a real sleeping task through Harness, installed version 2 with no migrator and inspected it. Before due time it still inspected as sleeping. After controlled time reached due time it inspected as blocked/migration_failed with the error message. Replacing version 2 with a migrator resumed the same task, called migrate once, persisted version 2 and completed it. The diagnostic design therefore needs both current blockage inspection and an ahead-of-reservation warning. It must not announce all work migrated at install time.
- `inventory.mjs` / `inventory.log`: static named-import inventory of the four current author-facing packages, including tests. It records origin subpaths and whether each imported name was a value or type. It does not prove a proposed facade or package layout works.
- `baseline-tests.log`: the unchanged existing suite passed 283 tests, 3 suites, 0 failures, 0 skipped. Node reported 13171.214875 ms. This is baseline evidence, not evidence that the proposed restructure, reload command, new facade or new flake checks have been implemented.

The supplied `/tmp/arena-load/probe-report.md` remains the evidence for jiti alias identity, native JavaScript alias/cache limits, external dependencies, live replacement, and prose persistence. Those experiments were not repeated here.

No new crash-in-publication, renamed-phase, concurrent-reload, Linux or Nix-sandbox guarantee was measured. The design specifies refusal/serialization/recovery rules and requires their checks before implementation. It deliberately does not claim transactional rollback across registries.

The original worktree had six deleted docs plus untracked .agents and skills-lock.json at the beginning. Those remained unchanged. The detached checkout had empty porcelain status before removal. See cleanup.log. No source edit, commit or push was made. The untrusted pi loader was read, not executed.
