# Comparison of the independent designs

The goal is a kernel extension interface and ledger design that let each new Render project choose a workflow. Existing-project switching remains out of scope.

These are design judgments, not measured product results. The three drafts received the same [brief](alternatives/brief.md). The parent read every draft in full. A fresh `claude-opus-5-5` cross-judge read the same drafts and spot-checked source independently.

## The drafts converge on the main structure

All three recommend trusted, explicitly installed kernels, deterministic decisions, host-enveloped private state, typed host intents, and one atomic Ledger acceptance. All reject a thin decision-function selector, a kernel-owned Ledger, and a workflow-language interpreter.

The independent drafts are [Opus](alternatives/opus.md), [Astra](alternatives/astra.md), and [Sol](alternatives/sol.md). All completed. There was no missing candidate or failed model seat.

## Parent assessment

| Criterion | Opus draft | Astra draft | Sol draft |
| --- | --- | --- | --- |
| Genuinely different workflows. | Strong. Concrete host-facility table and intent contracts. | Strong. Full development path and investigation without delivery. | Strong. Different state models and a finite shared host catalogue. |
| Authority, atomicity, and recovery. | Strongest source trace. Names `RoleWork` and the writer-rebind entanglement. | Strong separation and atomic acceptance. Less specific about current rebind. | Strong ownership model. Stable host notices and explicit evidence attribution. |
| Author and maintainer burden. | Wider interface. Separate module and runtime descriptions plus kernel task definitions. | One coherent package and bounded host templates. | One coherent package and a finite host execution contract. |
| Durable and Effect fit. | Concrete feasibility gates, but its two-open bootstrap is only a hypothesis. | Good Effect composition framing. Read-only bootstrap remains unverified. | Puts bootstrap proof first and refuses a second authority as a workaround. |
| Selection, identity, and scope. | Weakest. Reuses authority epoch, lacks a creation-request receipt, and proposes optional legacy declaration. | Strong. Separate project ID and original-default receipt. | Strong. Separate identity, exact release, canonical request fingerprint, and no legacy conversion. |

## Base and grafts

The parent selected **Sol as the starting model**. Its project identity and creation protocol fit the user's central requirement directly. Its single module and finite host facilities leave less runtime extension machinery for authors to understand.

The final proposal is a parent-authored synthesis, not a pasted draft. It retains these specific contributions.

- Sol supplies separate project identity, immutable selection, stable host-result identities, retained rendered instructions, host-enveloped state, and finite host facilities.
- Opus supplies the concrete bootstrap call-order problem and the extraction of execution currency from `RoleWork`. Its writer-rebind example makes the second feasibility gate specific. The final proposal preserves host currency checks and kernel domain checks in one acceptance transaction.
- Astra supplies the clearest separation between Effect composition and the deterministic extension contract. It also avoids inventing unmeasured output budgets.

The final interface uses a single kernel module. Domain rules and recipes can be separate internal modules, but they are not independently selectable plugins.

## Where the cross-judge disagreed

The cross-judge preferred **Opus** as the base. It valued the closed intent and read catalogues, current-source trace, and explicit execution extraction most highly. It recommended grafting Sol's project identity, idempotent creation, retained instructions, and stable lifecycle IDs into that design. It also recommended Astra's Effect framing.

The parent agrees with those specific improvements. The parent disagrees that they require Opus's wider runtime interface. The final document incorporates the concrete source constraints while keeping the smaller module contract. This disagreement concerns interface burden, not whether the source constraints exist.

The cross-judge also preferred a semantic compatibility contract over exact-digest admission. That would allow code fixes when authors declare the meaning unchanged. The parent kept exact release pinning for this proposal. Permitting new code for an existing binding requires an explicit maintenance and compatibility policy. It cannot be assumed within a task limited to new-project selection.

Exact pinning is not claimed to be a complete long-term upgrade strategy. Its operational and security-update cost remains visible in the main proposal.

## Ideas intentionally excluded

- Opus's optional `declare-legacy` command would introduce existing-store conversion. The accepted scope excludes it.
- Opus's proposed two-open Harness bootstrap is an experiment candidate, not an accepted implementation mechanism.
- Opus's kernel-defined Durable tasks widen the lifecycle contract before a second kernel demonstrates that need. The first version uses host facilities.
- Sol's numeric output limits have no workload evidence. The proposal uses existing limits and requires fixture-based decisions before adding bounds.
- A universal generic UI is not demonstrated. The proposal preserves host inspection and explicit unsupported views rather than promise every kernel a complete interface from forms alone.

## What still needs proof

Every candidate leaves the same two load-bearing questions open. The host must inspect a supported binding without missing kernel code or runtime advancement. The host execution protocol must preserve interrupted writer, experiment, and review behavior after the development rules move out of Engine and `RoleWork`.

Neither cross-judgment nor agreement among drafts proves those mechanisms work. The implementation plan starts with their failure cases and disposable probes.
