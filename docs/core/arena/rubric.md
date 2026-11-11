# Rubric for the Render core design

Written before any candidate was read. Candidates do not see this file.

Score each criterion from 1 (fails) to 5 (strong). Give one or two sentences of evidence per score, quoting the candidate.

1. **Lean core.** The core's surface is small and every core concept is justified against a stated rule. The bare agent works with zero extensions. The admission rule is checkable by a reviewer, not a slogan. Count the concepts a new maintainer must learn.

2. **Fit to the substrate.** Claims about pi-durable are correct and cited with `path:line`. The design reuses pi-durable parts and does not rebuild them. Each mechanism is possible on pi-durable as it exists. Check at least three load-bearing claims against the source yourself.

3. **Guarantees hold.** A human decision is bound to exactly what the human saw. Only a human can answer, and the design is honest about how far that holds. `answer` converges under retry, stale input, and a crash in the middle. An event exists only if the change it describes committed.

4. **Meets the owner's fixed decisions.** One server for all work, a workflow selectable per project, one client connection, a path to shared knowledge between projects, and an optional local single-project run. Strict TypeScript, no Effect, no Vite. Prose owned by the workflow. Trusted in-process extensions.

5. **Extensibility is shown, not asserted.** W1 can be built as an extension with no core change. W2 differs from W1 in ways that stress the primitives differently, and needs no external tooling or compute job. The prose answer studies real options and says whether the owner's premise holds.

6. **Candor and evidence.** The design pushes back where the evidence warrants. Claims carry labels. The "Not verified" list is honest and specific. Risks name a concrete failure, not a category.

After scoring, answer these:

- Which candidate is the best base for a maintainer to extend without breaking invariants?
- For each losing candidate, which one or two ideas are worth porting into the base?
- Where do the candidates disagree on a fact? Check the source and say who is right.
- What did all candidates miss?
