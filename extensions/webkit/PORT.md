# Frozen web access port decisions

The goal is to preserve the useful pi-web-access search and extraction workflow in a native Tau extension. This port owns a trimmed v0.46.0 snapshot rather than tracking upstream releases.

The source revision and module map are in [upstream.json](src/upstream.json). The [upstream review guide](src/UPSTREAM.md) defines how to propose later changes.

## Runtime and storage

Operations return normalized search, fetch, or unassessed evidence results. Source documents contain text and provenance rather than provider response objects. The Tau adapter is the only persistence writer. It advertises a response ID only after the transaction succeeds.

One conversation document stores immutable snapshots. Results survive restarts and current forks. Each snapshot is limited to 2 MiB. The whole serialized result collection, including entry and order metadata, is limited to 8 MiB. Admission trims document text at UTF-8 boundaries and evicts the oldest results first.

A storage service and a process-global cache were rejected. Tau already supplies the transaction, conversation, and fork boundaries. Adding another owner would duplicate that state.

Transaction overlays cannot escape their commit. Evicted clone documents are copied before the commit returns, and cleanup runs afterward. A regression test observed the checkout on disk before and after eviction.

## Credentials and provider routing

Only project options configure provider keys and proxies. No ambient Pi credentials, browser cookies, Git credentials, or proxy environment variables configure this extension.

Automatic search prefers a configured Exa key, then a configured Tavily key, then anonymous Exa MCP. Extra fallback requires an explicit ordered operator list. Authentication, configuration, unsupported requests, and cancellation never trigger fallback. Explicit provider selection remains strict.

Keys are scrubbed before storage and output. Redaction masks matched spans rather than whole documents. Partial key matches must end at a token boundary, so ordinary SDK examples and embedded commit hashes remain readable. Search content expansion rejects key-bearing result URLs before fetching them.

## Extraction and dependency exceptions

Readability with Turndown remains the primary HTML extractor. RSC recovery and Defuddle remain fallbacks. Replacing the pipeline with one extractor would not preserve the accepted workflow.

RSC extraction has fixed work, depth, and generated-text budgets. Exceeding a budget declines RSC extraction and leaves the existing fallback available. Repeated references, table expansion, and malformed tag scans have child-process regressions that cannot hang the test runner.

Undici is pinned to 8.12.2 instead of the snapshot's 8.11.2. An excessive-content-encoding response followed by early close reproduced an unhandled stream error that crashed the old host. The regression passes on 8.12.2. The selected version also contains the applicable TLS renegotiation fix. No new runtime dependencies or install hooks appeared in the compared manifests. This was a targeted patch and manifest review, not a full transitive or bundled-parser audit.

## Deliberate limits

- GitHub checkout paths are temporary and shared by conversation forks. Eviction in any branch can remove a checkout. Stored source text remains durable. A global reference-counting or cleanup service is outside this port.
- GitHub's advertised repository size and the request timeout bound ordinary clones. When public metadata is unavailable, there is no independent disk quota for a clone.
- HTTP and remote-resolution SOCKS proxies resolve target names themselves. Their DNS is trusted. Direct connections and locally resolving SOCKS transports pin the validated addresses.
- Network and native subprocess cancellation is real. Synchronous HTML and PDF parsers are not preemptible in the middle of a parse. RSC's explicit work limits do not establish a hard deadline for every parser.
- A hard host kill can leave a detached native process or private temporary transport files until process exit or operating-system cleanup.
- Source evidence is unassessed. No authority score or truth verdict is implied.

## Verification

Behavioral and failure cases preceded production changes. Tests cover routing, extraction, limits, project isolation, durable retrieval, secret handling, cancellation, and unsafe replay. Real-server tests exercise the four-tool integration through Tau. Installed verification loads the extension, checks its schemas and notices, exercises installed HTML extraction and lazy dependency resolution, and runs the declared Git and curl paths.

A live installed-artifact smoke check fetched a public page through the direct transport and returned three anonymous Exa MCP search hits without credentials. The short example page also triggered the extractor's incompleteness warning. This is a workflow check, not an extraction-quality benchmark or an availability guarantee.

Extension-only changes use focused package tests, affected extension integration checks, and installed-artifact verification. Core tests and the full workspace gate are for changes that also affect core behavior. Packaging alone is not validation. Current verification results belong in the pull request, not as a permanent claim that a future tree has passed.
