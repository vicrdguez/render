# Unit R3

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Extension classification | Infer extensions from their names, or mark their policy rows. | Add `extension: true` to the three rows in `boundaries.json`. | The checker already reads this table. New extensions can use the same rule without changing its code. |
| Package declarations | Check only dependencies and devDependencies, or all dependency fields. | Also check peerDependencies and optionalDependencies. | Each field declares a dependency. Moving a banned name between fields must not evade the rule. |
| Canonical imports | Trust any configured capability, or enforce the four production entries and the testing exception. | Enforce the canonical entries before the general capability check. | A permissive policy row must not enable a raw pi import or a deep facade import. |
| Environment and SQLite names | The arena places them in testing. R2 exports them from durable. | Use the existing `tau-extension/durable` exports. | R3 consumes the R2 entries and may only add missing names. Both names are already present. No facade name was added. |
| Kit boundary fixtures | Keep tests of a deleted package, or test its former consumers. | Replace three kit-owner cases with extension imports of the removed kit. | The replacement protects the prohibition after the kit no longer has a policy row. |
| Lock update | Enter the changed shell, or use the committed shell to update the current lock. | Use `nix develop` pinned to the tests-first commit for the lock-only npm command. | The changed shell could not build while the old lock still referred to the deleted kit. No dependencies were installed by npm. |

## Test disposition

The complete requested top-level name lists are `/tmp/r3-before.txt` and `/tmp/r3-after.txt`. Full output is in the corresponding `.log` files. Baseline has 329 tests. The candidate has 349 tests. Extension test names and assertions are unchanged.

These six tooling names changed. No other existing name disappeared.

| Previous name | Replacement name | Reason |
| --- | --- | --- |
| tau-websearch test import of tau-store/testing is allowed | tau-websearch test import of tau-extension/testing is allowed | The testing entry moved to the author package. |
| tau-w2 test import of tau-store/testing is allowed | tau-w2 test import of tau-extension/testing is allowed | The testing entry moved to the author package. |
| tau-w1 test import of tau-store/testing is allowed | tau-w1 test import of tau-extension/testing is allowed | The testing entry moved to the author package. |
| tau-kit src import of tau-store/testing is forbidden | tau-websearch src import of tau-kit is forbidden | The kit was deleted. |
| tau-kit test import of tau-store/testing is forbidden | tau-websearch test import of tau-kit is forbidden | The kit was deleted. |
| tau-kit test import of tau-store/host is forbidden | tau-w2 test import of tau-kit is forbidden | The kit was deleted. |

Twenty new tooling tests are separate from those replacements.

- Twelve names have the form `extension imports reject <specifier> even when declared and permitted`. The specifiers are `@earendil-works/pi-durable/tools`, `@earendil-works/pi-schema`, `@earendil-works/chord/context`, `@earendil-works/pi-ai/providers/faux`, `@earendil-works/future`, `tau-store`, `tau-store/testing`, `tau-host`, `tau`, `tau-kit`, `tau-w1`, and `tau-w2`. Each checks source and test imports.
- Six names have the form `extension manifests reject <name> without an import`. The names are `tau-store`, `tau-host`, `tau`, `tau-kit`, `tau-w1`, and `@earendil-works/pi-durable`. Each checks all four dependency fields.
- `extensions accept only canonical facade entries with testing limited to tests` covers the allowed imports, test-only entry, deep imports, and noncanonical subpaths.
- `extensions require declared runtime dependencies and reserve devDependencies for tests` preserves the existing dependency rule.

## Evidence before the acceptance gate

Tests were committed before implementation. The focused command was `nix develop -c node --test --test-name-pattern='^extensions? (imports|manifests|accept|require)' tools/workspace.test.mjs`.

```text
Before implementation
ℹ tests 20
ℹ pass 1
ℹ fail 19

After implementation and restoring mutations
ℹ tests 20
ℹ pass 20
ℹ fail 0
ℹ duration_ms 586.571292

Full candidate suite
ℹ tests 349
ℹ pass 349
ℹ fail 0
ℹ duration_ms 20166.533542
```

The passing case before implementation preserves the existing undeclared-dependency rule. The new cases call the checker's existing exported `check` function against temporary workspaces. They do not spawn one Node process per assertion.

Three independent mutations each failed the focused tests. Each mutation was restored before the next run.

| Mutation | Result | Log |
| --- | --- | --- |
| Disable the pi-scope guard. | 6 failed, 14 passed. | `/tmp/r3-mutation-pi-scope.log` |
| Permit testing in source. | 1 failed, 19 passed. | `/tmp/r3-mutation-testing-source.log` |
| Disable the manifest guard. | 6 failed, 14 passed. | `/tmp/r3-mutation-manifest.log` |

Throwaway files in the real W2 source and test directories made `nix flake check -L` fail in its typecheck check. The output named all twelve forbidden import cases and the deep and noncanonical facade paths. Production also rejected the testing entry. The files were removed after the probe. The full output is `/tmp/r3-probe-gate.log`.

```text
tau-typecheck> packages/w2/src/r3-boundary-probe.ts: @earendil-works/pi-durable/tools: forbidden extension import; use tau-extension/durable
tau-typecheck> packages/w2/src/r3-boundary-probe.ts: tau-extension/testing: forbidden extension import; use tau-extension/testing in test/ only
tau-typecheck> packages/w2/test/r3-boundary-probe.ts: tau-kit: forbidden extension import; use tau-extension
```

The real W2 manifest also rejected each of the six forbidden dependency names in each of the four fields. Each probe temporarily updated its matching lock row and ran `typecheck` from the committed development shell. This avoided installing forbidden dependencies. All four runs printed `workspace lock: pass` before the boundary failures. The manifest and lock were restored. Logs are `/tmp/r3-probe-dependencies.log`, `/tmp/r3-probe-devDependencies.log`, `/tmp/r3-probe-peerDependencies.log`, and `/tmp/r3-probe-optionalDependencies.log`.

```text
workspace lock: pass
tau-w2: forbidden dependency tau-store; use tau-extension
tau-w2: forbidden dependency tau-host; use tau-extension
tau-w2: forbidden dependency tau; use tau-extension
tau-w2: forbidden dependency tau-kit; use tau-extension
tau-w2: forbidden dependency tau-w1; use tau-extension
tau-w2: forbidden dependency @earendil-works/pi-durable; use tau-extension/durable
```

No real model was called. No loader or reload behavior was added. The command still imports all three extensions. The websearch testing export is unchanged. The final report records the fresh-checkout gate and forced rebuilds on the pushed head.
