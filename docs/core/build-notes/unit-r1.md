# Unit R1

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Shared answer logic | Extract another function or call the existing internal function. | The testing entry imports `answer` from `decisions.ts`. The host keeps its existing re-export. | Both paths call the same implementation. No host code or signature changes. |
| Optional context | Require a context like the host or supply a default. | Default to `BACKGROUND_CONTEXT`. Forward an explicit context unchanged. | The kickoff specifies `context?`. Tests cover omission and caller cancellation. |
| Identity constant | Export a constant or use the literal. | Keep `!test` in the wrapper. Tests compare to the literal. | No caller needs a constant. The assertion remains independent of the implementation. |
| Boundary checker | Add a special rule or change the existing policy. | Change `boundaries.json` and its regression fixtures. Leave `tools/check-boundaries.mjs` unchanged. | The checker already enforces test-only subpaths. The new cases passed without another mechanism. |
| Store self-imports | Ban the host entry in store tests too or preserve internal coverage. | Store tests retain real `answer`. Extension tests use only the testing entry. | The kickoff explicitly preserves the store's real-device tests. |
| W1 row 6 name | Keep the phone wording or describe the remaining test. | Rename it to describe the stale answer without a device. | The test now uses the fixed faux identity. Real-device coverage remains below. |

## Implementation

`packages/store/src/host.ts` is unchanged and re-exports `answer` from `decisions.ts`.
The new entry calls that function directly.

```ts
return answer(store, id, input, "!test", context);
```

No new dependency, identity override, constant export, or answer implementation was added.
The existing package dependencies cover the imports. The lock is unchanged.

The pairing test uses the admin socket to reject `!test`.
It also bypasses admin validation in a separate `Devices` instance to make a token with a matching stored secret.
Authentication still refuses it. This distinguishes token syntax rejection from a missing device record.
All files and sockets belong to the existing temporary fixture.

## Test disposition

The prescribed top-level name lists are `/tmp/r1-before.txt` and `/tmp/r1-after.txt`.
They contain 249 and 262 lines. The full logs contain 283 and 296 tests because the prescribed filter excludes indented subtests.
A second comparison included indented names.

Every removed name has a replacement.

| Removed | Replacement | Reason |
| --- | --- | --- |
| `tau-w1 test import of tau-store/host is allowed` | `tau-w1 test import of tau-store/host is forbidden` | Remove the privileged test allowance. |
| `tau-w2 test import of tau-store/host is allowed` | `tau-w2 test import of tau-store/host is forbidden` | Remove the privileged test allowance. |
| `tau-websearch test import of tau-store/host is allowed` | `tau-websearch test import of tau-store/host is forbidden` | Remove the privileged test allowance. |
| `row 6: the phone that still shows V1 answers A1 and gets conflict; the open decision is A2` | `row 6: an answer to A1 still showing V1 gets conflict; the open decision is A2` | Keep the stale-answer conflict assertion without claiming a phone identity. |

New tests, apart from those replacements, are listed here.

- `the testing entry exports only fauxAnswer and the same openStore`.
- `fauxAnswer records !test and runs the continuation without a context argument`.
- `fauxAnswer preserves refusals and equal resends without extra writes`.
- `fauxAnswer forwards caller cancellation without answering`.
- `!test cannot pair or authenticate as a device`.
- For each of `tau-w1`, `tau-w2`, and `tau-websearch`, `test import of tau-store/testing is allowed` and `src import of tau-store/testing is forbidden`.
- For `tau-kit`, both `test import of tau-store/testing is forbidden` and `src import of tau-store/testing is forbidden`.

The compile-only cases also reject a device argument to `fauxAnswer`.
The relative test-helper fixtures now re-export the testing entry and retain their source-import refusal assertions.

W1 rows 6 and 7 used phone and laptop identities to cover a stale answer from another device and preservation of the first answer on resend.
The following unchanged store tests still cover those facts.

- `an equal resend repeats the record without a write and keeps the first device and time`.
- `a resend that differs in basis, choice, or annotations is refused with conflict and the record`.
- `two answers at once: one lands, the other is refused or repeated, and one task exists`.

The unchanged HTTP journey `W1: two devices answer at once, faults show the dead continuation, and an equal resend recovers it` covers authenticated device attribution, conflict, and resend after a fault.
The annotated-design W1 journey also answers from phone and laptop and reads back both identities.

## Recorded evidence

Baseline command was `nix develop -c env test`, using `/nix/var/nix/profiles/default/bin/nix`.

```text
ℹ tests 283
ℹ pass 283
ℹ fail 0
ℹ duration_ms 16324.276416
```

Tests were committed before implementation. The missing entry failed in emitted JavaScript as well as TypeScript.
The six changed boundary expectations failed under the old policy.
The device test passed before implementation because device rejection is existing behavior.

```text
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './testing' is not defined by "exports"
ℹ tests 57
ℹ pass 51
ℹ fail 6
```

Logs are `/tmp/r1-red-store.log`, `/tmp/r1-red-types.log`, and `/tmp/r1-red-boundaries.log`.
An invalid numeric entry ID in the new test was corrected to an actual second basis entry after the missing export no longer masked its type error.

Focused checks after implementation passed.

```text
ℹ tests 15
ℹ pass 15
ℹ fail 0
ℹ duration_ms 226.66025
ℹ tests 205
ℹ pass 205
ℹ fail 0
ℹ duration_ms 13720.449875
```

The first run selected the new store checks and device tests.
The second selected store, W1, W2, websearch, and workspace tools, including crash recovery.
The new faux tests took 23.582, 5.389, and 3.803 ms in the focused run.
The new export assertion took 1.171 ms and the device test took 10.619 ms.
Boundary fixtures use the existing checker subprocess seam. Eight added cases add eight such subprocesses.
These are recorded test durations, not a speedup claim.

Three different lines of the new entry were mutated independently. Each compiled, then failed a runtime assertion.

| Mutation | Failing test | Log |
| --- | --- | --- |
| Forward `phone` instead of `!test`. | `fauxAnswer records !test and runs the continuation without a context argument`. | `/tmp/r1-mutant-identity.log` |
| Default to an aborted context. | The same default-context test rejected with `mutant default`. | `/tmp/r1-mutant-default-context.log` |
| Export `watchOpen` as `openStore`. | `the testing entry exports only fauxAnswer and the same openStore`. | `/tmp/r1-mutant-open-store.log` |

Each run reported `pass 2`, `fail 1`, and exit 1.
A fourth mutation changed `by: device` to `by: "mutant"` in the shared implementation.

```text
✖ an answer records the choice, notes, device, and time, creates the then task, and clears the slot
✖ rows 7 to 17: approve A2, then build, review, fix, and review again
'mutant' !== '!test'
```

That run is `/tmp/r1-mutant-shared-answer.log`. Later W1 failures were consequences of its sequential walk stopping at row 7.
All mutations were restored. The selected store and W1 walk checks then passed 50 tests in `/tmp/r1-restored.log`.

Emitted package imports printed the following.

```text
tau-store ["decision","emit","eventLog","request","withdraw"]
tau-store/host ["answer","openStore","watchOpen"]
tau-store/testing ["fauxAnswer","openStore"]
```

The final development-shell suite is `/tmp/r1-after.log`.

```text
ℹ tests 296
ℹ suites 3
ℹ pass 296
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18374.601917
```

Fresh-checkout acceptance results belong to the PR evidence and unit report, so they can identify the exact pushed head without a self-referential documentation commit.
Linux and hostile-code isolation are not tested by this unit. The import rule prevents mistakes and is not a sandbox.
