# Evidence for execute-symbolic-calls

This is a labelled design fixture. Its outcomes illustrate the client presentation, not checks performed on this desktop implementation.

## Contract K·8a2f

Symbolic calls preserve exact values and distinguish an unsupported expression from a failed calculation.

## Prepared source

Pass 2 prepared source `X2 7f2c815`. The source used by a check belongs to that check. A later source does not inherit its result.

| Obligation | Evidence | Outcome |
| --- | --- | --- |
| Preserve exact rationals | Unit-test receipt on X2 | pass |
| Report unsupported calls | Contract examples on X2 | pass |
| macOS framework behavior | Human check suggested | not run · advisory |

## Watchdog

Round 1 completed on X2. One finding was fixed. No later round is implied by the current pass number.

## Finding F9

The slow-test list is hard-coded. A new slow test could land in the fast lane.

## Uncertainty U1

Required forge checks were listed before publication. They have not been read again since.

Findings, uncertainty, unintegrated work, and unpublished source remain separate kinds. They are not pooled into one reassuring number.
