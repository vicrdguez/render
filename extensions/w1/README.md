# W1 development workflow

W1 is a sample workflow for testing Tau's core, not a product. It uses designer, implementer, and reviewer agents to carry work through design, implementation, review, and human handoff.

| Option | Meaning |
| --- | --- |
| `designer` | Designer model |
| `implementer` | Implementer model |
| `reviewer` | Reviewer model |
| `base` | Git base branch, default `main` |

Models use `provider/modelId` form.

| Kind | Name | Purpose |
| --- | --- | --- |
| Tool | `publish_design` | Submit a design for human review |
| Tool | `publish_build` | Submit an implementation for review |
| Tool | `show_diff`, `show_file` | Let the reviewer inspect the work |
| Tool | `publish_review` | Submit a review verdict |
| Tasks | `w1.design_answer`, `w1.prepare`, `w1.review_start`, `w1.fix_start` | Continue design, preparation, and review |
| Tasks | `w1.handoff`, `w1.retry`, `w1.stop`, `w1.ensure_handoff` | Handle handoff, retry, stop, and missing handoffs |
| Decision | Design | Approve, revise, or abort |
| Decision | Merge | Approve or abort |
| Decision | Stuck | Retry or abort |

1. The designer publishes a design for the human to approve or revise.
2. On approval, W1 prepares a Git worktree and starts an implementer.
3. The implementer publishes a build. A reviewer inspects it and can send it back for fixes.
4. A passing review leads to a human merge decision. W1 hands over the work rather than merging it.

To try it, install `w1` with the [installer](../../docs/extensions.md#install-an-extension), start a local server, and add it to a project bound to a Git repository. Set the three models through a client, create a W1 conversation, and give the designer work. See [Host](../../docs/host.md) for project calls.
