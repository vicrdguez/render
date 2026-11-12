# Rationale

1. **W1.** I chose explicit, ownerless role conversations with workflow membership and cancellation records. A permanently waiting supervisor would blur the design's rule that work asking a human ends. Task-owned conversations are good for bounded subagents, but complicate reusing the designer across separate human answers. I rejected combining role creation and submission: the substrate forbids it. I placed the worst crash at the Git/store seam rather than inside answer, because it exposes a promise that a database transaction cannot supply. I did not pretend shell retries or prose alone prove provenance.

2. **W2.** I kept absolute deadlines, an active-timer pointer, and immutable forecast revisions. Cancelling every stale timer is unnecessary when its wake commit can reject an obsolete pointer. Scoring only by decision ID would miss the late-continuation problem; scoring also checks current forecast/round. Reporting superseded forecasts avoids presenting survivor-only results as complete calibration. I rejected letting “not yet” move the truth cutoff.

3. **Roles.** The helper only joins conversation creation to AgentChange configuration. Retry ownership stays with the workflow's existing document, avoiding a second registry, role schema, or hidden submission mechanism. Standard-library admission needs useful repeated callers, not two unrelated workflows. This keeps role and prose helpers together without making either mandatory.

4. **Annotations.** I chose a structured answer list over notes encoding and independently saved entries. The former cannot serve an unaware client; the latter adds draft synchronization and another authenticated write contract, which the owner explicitly permits deferring. Generic raw-string selection avoids inventing a core document renderer. Workflow dispositions enforce coverage, not semantic agreement.

5. **Shortfalls.** I separated new core data contracts from workflow obligations and already accepted limits. In particular, neither generic cancellation hooks nor a universal exactly-once service earns admission from these examples. A public log pointer completes Event's existing promise without a service locator.

6. **Evidence.** I read source at the supplied paths rather than inheriting the docs' measurements. I rejected an executable probe for this pass: its narrow success could not establish the missing cross-commit workflow contracts. The walk therefore marks runtime/crash behavior as unverified instead of presenting paper transitions as test results.
