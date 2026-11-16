# Review upstream changes for webkit

Use this guide when asked to review fixes or improvements from pi-web-access. Propose changes before editing the extension unless the request explicitly authorizes implementation.

## Establish the comparison

1. Read `upstream.json`, the package README, and the relevant local source and tests.
2. Keep `4af1a7f7757d450ba0afefe2d98737384dc9a9b4`, tagged `v0.46.0`, as the original source revision. Do not replace that provenance with the latest reviewed revision.
3. Fetch the original repository into a temporary directory. Do not execute its package scripts or install its dependencies to inspect a diff.
4. Resolve the requested target tag or commit. Compare it with `reviewedThrough.commit` in `upstream.json`. If only part of the retained functionality was previously reviewed, include the unreviewed changes.

## Select relevant changes

Use release notes to locate candidates. Inspect each candidate's actual patch, callers, and regression tests before recommending it.

Classify each change as an applicable correctness fix, an applicable security fix, a useful feature improvement, or irrelevant to retained functionality. A changed provider or feature that this port removed does not require a local change.

Check the source map in `upstream.json`. Account for Tau's intentional differences before copying a patch. Global configuration, Pi session storage, process-global fetch changes, and Pi UI code must not return through an upstream patch.

Keep Readability with Turndown, RSC recovery, and Defuddle fallback unless a separate behavior change is justified with representative pages. Do not treat a different extractor as equivalent without checking it.

For dependency changes, identify the concrete fix we need. Inspect the resolved lockfile delta, runtime dependency and install-script changes, applicable advisories, and the affected execution paths. State the review coverage. Do not claim a full transitive audit from an advisory scan or release notes alone.

## Return a proposed plan

For each recommendation, give the upstream commit or PR, the user-visible failure or benefit, the local files affected, the proposed adaptation, and the tests required. Separate source-verified findings from release-note claims and untested assumptions.

List significant declined changes with a reason. Do not recommend an update merely because a newer release exists. A credible security issue affecting retained code does not need to wait for a periodic feature review.

## Port an approved change

1. Write the regression cases before changing production logic. Reuse relevant upstream fixtures where their license and behavior fit.
2. Apply the smallest change that preserves Tau's project isolation, secret handling, cancellation, snapshots, and replay policy.
3. Run focused package tests. Add real-server or installed-artifact checks when the changed guarantee crosses those boundaries.
4. Verify the affected extension tests and installed artifacts on the final tracked candidate. Run core tests or the full workspace gate only when the change also affects core behavior.
5. Update the source map if files moved. Record incorporated fixes and significant declined changes. Advance `reviewedThrough.commit` only after the declared retained scope has been reviewed.

Preserve `LICENSE` and source attribution. Keep the original source revision separate from the review cursor and local change history. Do not merge upstream wholesale or configure automatic upgrades.
