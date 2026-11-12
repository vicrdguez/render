# Rationale, candidate 1

## W1 walk

- **Detecting a missing handoff:** an `afterRun` hook against a driver task waiting on `Submission.wait()`. The hook never fires after a failure (`README.md:709`), so I chose the driver and ran the pattern (P5). Its cost, restart counting, became the worst crash point.
- **Receiving the first message:** I rejected a "front desk" agent that creates the designer, because it adds a model hop that can fail. Host wiring applies the workflow's entry role instead.
- **Implementer and reviewer ownership:** I rejected task ownership. The owning `then` task would sit `completing` for hours, and its abort would cascade. They are ownerless and recorded in the W1 document.
- **Worst crash point:**
  - I rejected the worktree gap, which the brief covers separately.
  - I rejected the gap before `answer`'s reply, which a retry covers.
  - The long wait wins: crashes land there, and it alone ends in a silent stall.

## W2 walk

- I kept letting a stale timer wake and end, as `workflows.md` does, rather than aborting it on revision.
- I added a withdraw on revision, after the walk showed the gap.
- Calibration reads events, as the brief asks. I noted that W2's own document would serve.

## `role()`

I rejected:

- a helper that also creates the conversation, because ownership and idempotency belong to the caller's commit;
- Ultimate's login fallback, because that is host work;
- a role as an `Extension`, because a role is settings, not code.

That leaves a pure builder.

## Annotation

- **Notes only:** rejected, because it fails W1 step 3.
- **Entries saved before the answer:** rejected. It needs a second client write path, and a stale phone leaves orphan comments.
- **A list stored with the answer:** chosen.

I rejected folding `notes` into annotations, which would force W2 to answer every note. Dispositions stay out of the core, per the owner's ruling.

## What fell short

- **Faults:** I rejected letting each workflow catch its own faults, because a runtime fault such as `restartLimit` never reaches workflow code.
- **Upgrades:** I rejected a version check on answers. Upgrades stay an accepted limit.
- **`requestedAt`:** I rejected making callers memoize it, because that fixes one call site, not the rule.

## Ran

- `probe.mjs` (P1 to P5) on 1.5.2. All passed.
- The repository's `substrate.mjs` on 1.5.2. All passed.
