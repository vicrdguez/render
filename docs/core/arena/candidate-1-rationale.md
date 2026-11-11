# Rationale: candidate 1

**Fork 1. Core boundary.** Rejected: Ultimate's forced core tier of fifteen extensions, because its minimum became large and opinionated (reported, `ultimate.md` §8). A library-only core with no transport, because the owner reconnects from several machines and `answer` must live at the client boundary. Coding tools in the core, because pi-durable already ships them as an extension. A line budget as the admission rule, because size is a warning sign, not a reason.

**Fork 2. Extension hook.** Rejected: Ultimate's `ExtensionHost` with services, lifecycle callbacks and client actions. Each is a seam the core must keep stable, and W1 and W2 need none: tasks replace lifecycle callbacks, Decision replaces actions, imports replace services. The pluggable-kernels `WorkflowDefinition`, because it builds a second authority beside pi-durable tasks and adds 22 terms (reported). An injected factory `(core) => Extension`, because the core functions are stateless over `Tx`.

**Fork 3. Decision and Event.** Rejected: a digest as basis, because the client cannot show it, and a document version, because documents change. `subject` as the answer key with basis as the only guard, because a retried old answer could then answer a new request with the same basis. Answer receipts, because idempotency by content is enough for one human. Core events on decision changes, because they would make `request` a table write and break `submit(tx)` ordering. Expiry, because a workflow can sleep and withdraw.

**Fork 4. Topology.** Rejected: one store with a project scope. It means one failure domain, one shared registry, a project key on every query, and no moving a project as a file. Its gain, atomic writes across projects, is not needed to copy immutable knowledge. One process per project, because it needs a connection per host or a router.

**Fork 5. Prose.** Rejected: a renderer per workflow, because it duplicates code and splits slot syntax. A template engine with conditions, because it puts logic into prose. Template literals, because prose is full of backticks. The pluggable-kernels composer, which adds eleven rendering terms. The helper in the core, because it guards no boundary. Stored `instructions` for role prose, because fixes never reach live conversations.

**Fork 6. W2.** Runner-up: Pick one of N, close to W1's shape. Rejected: a web research notebook, which needs external tools. Local data analysis, which needs compute the owner lacks. Plain reminders, which have no agent work.
