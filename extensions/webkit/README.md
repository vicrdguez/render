# Webkit

`tau-webkit` provides the `webkit` extension for Tau. It adapts retained search and extraction behavior from pi-web-access 0.46.0 into project-scoped configuration and conversation-scoped durable results. It does not use Webfox or run a Pi extension inside Tau.

## Tools

| Tool | Behavior |
| --- | --- |
| `web_search` | Search one query or a bounded batch. Return source URLs, titles, snippets, available metadata, and the actual provider. |
| `fetch_content` | Read public HTTP or HTTPS URLs as readable content or raw text. Handle local PDF text and public GitHub repositories, files, issues, and pull requests. |
| `get_search_content` | Read more of a stored result or find passages without repeating the network request. |
| `source_check` | Gather sources and passages relevant to a claim. Return unassessed evidence, not a truth verdict. |

HTML extraction uses Mozilla Readability with Turndown. When that produces no article or too little content, extraction tries embedded React Server Components data and then Defuddle. Defuddle is a fallback, not a replacement for HTTP fetching or a browser that executes JavaScript.

PDF extraction reads an existing text layer. It does not perform OCR. Authenticated pages, private GitHub access, browser cookies, video, YouTube, model-assisted summaries and answers, structured field extraction, and multi-provider fan-out are outside this port.

## Configuration

No provider key is required. With no project configuration, search uses Exa's hosted anonymous MCP service and page reading uses direct HTTP. Anonymous Exa access is rate-limited and requires a direct IPv4 connection. Configured proxies are never bypassed to obtain anonymous access. A key improves available account limits but does not make the provider unlimited or guarantee availability.

Set options through Tau's project options interface. Provider keys come from project options, not environment variables or a user's Pi configuration.

| Option | Meaning |
| --- | --- |
| `provider` | `auto`, `exa-mcp`, `exa`, or `tavily`. The default is `auto`. |
| `exaApiKey` | Optional secret for Exa REST search and hosted extraction. |
| `tavilyApiKey` | Optional secret for Tavily REST search. |
| `fallbackProviders` | Optional ordered comma-separated transport list. The default is empty. |
| `hostedExtraction` | Allow Exa to read a page when direct extraction fails. Off by default and requires an Exa key. |
| `proxy` | Optional secret HTTP, HTTPS or SOCKS proxy URL for this project's requests. SOCKS uses the declared curl transport. |
| `curlCommand` | Optional curl-compatible executable path. No shell command or automatic binary download is used. |
| `timeoutMs` | Request deadline in milliseconds. The default is 60000. |
| `maxResponseBytes` | Maximum normal page response size. The default is 5242880 bytes. Readable PDF downloads have a separate 20 MiB limit. |

Auto selection prefers a configured Exa key, then a configured Tavily key, then anonymous Exa. Additional providers are tried only when you configure fallback. Cancellation, authentication errors, configuration errors, and unsupported requests do not trigger fallback. Explicit provider selection is strict. Filters are not silently rewritten into query hints.

Secrets are masked in host replies. Tau stores project options and their backups in plain text, not a separate credential vault.

## Results and privacy

Search sends queries to the selected provider. Direct page reading connects from the Tau server to the target website. Hosted extraction sends the target URL to Exa and may consume account credits. Provider attribution and content origin remain visible in results.

Replies contain bounded previews and a response ID. Stored source text remains available after server restart. Storage is bounded, oversized content is marked truncated, and old results can be evicted. An evicted result returns a missing-result error rather than silently fetching it again. GitHub checkout paths are temporary local files, not durable substitutes for stored source text. A conversation and its forks share a checkout. Any branch can remove it when it evicts that result, and the operating system can clear temporary files. Otherwise, the extension does not reclaim retained checkouts. Fetch the GitHub URL again when you need a new local copy.

Network tools are replay-unsafe. If a server interruption leaves a request uncertain, Tau reports interruption rather than automatically repeating a potentially billed operation. Stored-result retrieval performs no network request.

Webkit replaces the former `websearch` sample. Existing projects must select `webkit` instead. Set `exaApiKey` or `tavilyApiKey` if you want keyed search. Old project options are not migrated automatically.

## Install and verify

Use the [extension installation workflow](../../docs/extensions.md#install-an-extension) with the name `webkit`. To try the extension without changing your normal Tau home, pass a temporary directory with `install-extension --home`.

Run focused checks with `/nix/var/nix/profiles/default/bin/nix develop -c env test webkit e2e/test/webkit.test.ts`. Verify installed artifacts with `/nix/var/nix/profiles/default/bin/nix run .#verify-build`. Extension-only changes do not require core tests or the full workspace gate. Packaging alone does not validate the extension.

The installed artifact includes declared Git and curl paths. A configured curl executable can supply browser-style request behavior, but it does not guarantee access to bot-protected sites.

## Upstream ownership

Read [the upstream review guide](src/UPSTREAM.md) before evaluating changes. [The source map](src/upstream.json) records the frozen source revision, retained modules, intentional differences, and review cursor. [The MIT notice](src/LICENSE) applies to upstream-derived code.

This is an owned, trimmed derivative. Upstream releases are sources of candidate fixes and improvements, not an automatic upgrade schedule. The [port decisions](PORT.md) record the runtime boundaries, security exception, and deliberate limits.
