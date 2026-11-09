# Verification authoring failure cases

Acceptance oracles for the `verification-authoring` Slice (standalone verify-create). They are requirements written
before product changes, not run results. Behavior rules B1–B4 and commitments A1–A4 are the Slice Contract's; spec
§§8.1–8.2 and §13 V5/V8 navigate them.

Verify-create is not a new delivery shape (spec §8.1). It is an ordinary accepted change whose Slice is the selected
repository verification asset. The author is that pass's implementer: it interviews the repository in its owned Linux
workspace, writes the asset, and its captures run the authored rows through the existing catalog runner. No command,
record type, role or module is added.

## Cases

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| VA1 (B1) | Accepted change Slice whose implementer selects the absent legacy path `.skl/verify.md` in a repository with `verify-suite`, `value` and a decoy `.render/verify.md` | The selected path stays `.skl/verify.md`. Static craft-registry completeness and instruction-wording assertions are retired; the journey checks the authored asset's execution and delivery | Engine |
| VA2 (B1/B3) | The author's interview reads actual repository files, then writes `.skl/verify.md` reusing `sh verify-suite` and a journey `.skl/journeys/observe.md` | The interview output contains the repository's `printf 'SUITE OK'`. A's retained checks use the authored asset at `.skl/verify.md` (its own ladder `process, tests, static`), the journey's step exits 0 and its independent sanity exits 0, `full-suite` prints `SUITE OK`, cleanup is `complete` and the source tree is unchanged | Engine/Sandboxes/Ledger |
| VA3 (B4/A2) | The same pass hands off | Normal per-pass delivery: one Audit, preparation checks on X, a Watchdog round with its own checks, then qualifying integration. Before integration the canonical ref is still T. After it, R's `.skl/verify.md` and journey are exactly the authored bytes, the decoy `.render/verify.md` is unchanged and no other asset copy exists | Engine/Effects/Ledger |
| VA4 (B2) | Authored asset whose discovery row succeeds but whose required executed row `smoke` runs a command that does not exist | Retained checks: `discover` `completed` (discovery, no rank), `smoke` `unrun` with exit 127. A passing handoff refuses `missing_content`. When the author stops, the owner blocker reads `verification_unproven: failed observe; unrun smoke; cleanup complete`, not `role_did_not_submit` | Engine/Kernel |
| VA5 (B3) | In the same asset, the journey's step exits 0 but its independent sanity expects the wrong value | Retained checks: `observe` `failed`, step exit 0, sanity exit 1, cleanup `complete`. No handoff, no preparation, canonical ref unchanged. Successful setup is not proof | Engine/Kernel |

## Unsafe controls (must fail on their own assertion)

- `authoring-legacy-path-ignored`: capture checks the default `.render/verify.md` instead of the selected legacy path (VA2).
- `authoring-unproven-hidden`: a stopped author's blocker stays `role_did_not_submit` (VA4/VA5).

Generated/human non-proof, missing commands, failed sanity and pending cleanup refusals of the existing catalog
runner keep their own `verification-catalog` controls. Scripted authors are fixture data, not authoring quality;
live-model interviews remain unrun.
