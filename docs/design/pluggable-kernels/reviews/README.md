# Review dispositions

The goal is a reviewable design for kernels selected only when a new Render project is created. These reviews challenged the saved proposal before its protocol corrections. They do not establish runtime correctness.

The [ledger review](ledger.md) and [runtime review](runtime.md) used fresh agents. The [comment review](comments.md) found no comments inside the documentation sketches. The parent reran the source and structural probes before accepting the findings.

## Accepted corrections

| Finding | Disposition in the revised proposal |
| --- | --- |
| The relationship diagram made project state and configuration depend on a workflow. | Workflow scope is now optional for state and retained records. Project ownership remains explicit. Operations no longer require an originating agent execution. |
| Read planning depended on state loaded only afterward. | Ledger preloads project and target workflow state before `needs`. One round plans additional reads. Ledger compares expected host resource revisions. Kernel checks domain legality. |
| Host lifecycle, rebind, and admission checks lacked an input protocol. | `KernelInput` now distinguishes commands, host notices, and host decision requests. Rebind and operation admission have matching authorization outputs. Only trusted host routes can construct those inputs. Both reviewers found this same gap. |
| The design claimed unilateral host protections while routing everything through the kernel. | A closed host catalogue handles startup fencing, enrollment, revocation, and other host-only protections. The acceptance diagram has a separate host-only branch. The source register lists current extraction work. |
| The design promised a defect block without its storage or clearing policy. | The proposal now uses the existing fatal-error approach and explicitly claims no durable quarantine. Restart is an operator action. Automatic restart needs a separate policy before deployment. |
| Creation named a nonexistent route. | The proposal now names the existing authenticated `local-admin` route for the OS owner. |

The defect decision is a simplification. A new durable quarantine would require a record, recovery behavior, and a clearing protocol. The current scope does not justify that mechanism. Fail-stop ends current project dispatch. The proposal openly states that restarting unchanged code may encounter the same defect.

## Source-backed concerns clarified

- Explicit creation replaces today's implicit Meta initialization and startup checkpoint-settings import. Reopen does neither.
- The host envelope carries scope, identity, command ID, expected basis, and a body discriminator independently of kernel decoding. Ledger computes its fingerprint.
- The creation diagram now distinguishes uninitialized reopen, legacy unbound stores, and a selected but unavailable kernel.
- Verified host observations survive independently of kernel progression. Existing Durable facilities stage their notice delivery. A refused notice cannot erase the observation or advance dependent work.
- Expected domain refusals and defects remain different. The design does not claim that stopping a process retracts an external effect.

## Trail review

The ledger reviewer checked the active session transcript. It confirmed the user scope, configured candidate model selectors, the Effect probe, and the cited principle reads. It flagged missing decision rows and incomplete in-progress checklists. Those records are completed at handoff rather than treated as evidence that review never ran.

The cross-judge is a different model family from the parent, not from every candidate. The chosen draft uses the same configured model selector as the parent in a fresh context. The cross-judge preferred another base. [comparison.md](../comparison.md) preserves that disagreement and the parent's rationale. Agreement is not claimed.

Model names elsewhere in this dossier denote the configured Agent selectors. The ledger report self-identifies a different model name at its end. Tool results did not independently establish that self-identification. The requested selector was `claude-opus-5-5`. The runtime reviewer was requested as `gpt-6-astra`. The ledger reviewer reached its turn limit after producing its report. Its review is bounded, not an exhaustive audit.

## Post-correction review

A fresh [correction review](revision.md), requested on `claude-opus-5-5`, found no remaining verified document contradiction within its stated correction scope. It checked the six corrected contracts and the host observation path. It did not establish runtime correctness. It reached its turn limit after writing the report.

Its attention notes led to final clarifications.

- Known kernel defects need a distinct `kernel_defect` reply rather than the baseline's storage-failure retry message.
- Host admission and rebind derive scope from their authoritative host records before base-state loading.
- A refused notice retains a blocked delivery checkpoint. Explicit authorized retry reuses its input identity. This is not a project-wide quarantine.
- A deterministic defect can trap an exact-pinned project. The main proposal now requires an accepted maintenance policy before production use rather than defer that limitation indefinitely.

The parent checked the source and final wording for these clarifications. They did not receive another full model review. The separate document checks cover the final saved artifacts.

## Remaining attention

- Kernel-free bootstrap remains unproven on the pinned Durable version.
- Execution extraction remains unproven for interrupted writer, experiment, and review paths.
- Exact release pinning can trap a project on a deterministic defect. A maintenance and security-update policy is required before production use. Existing-project updates remain outside this proposal.
- A universal rich client is not demonstrated. Unsupported views and actions must remain explicit.
- The design review establishes no product tests, implemented kernels, or live changes. Later publication of the documentation does not change those limits.
