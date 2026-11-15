# Web search

Web search is a sample extension for testing Tau's core, not a product. It gives an agent a web search tool backed by Exa or Tavily.

| Option | Meaning |
| --- | --- |
| `provider` | `exa` or `tavily` |
| `apiKey` | Nonempty secret for the provider |

| Kind | Name | Purpose |
| --- | --- | --- |
| Tool | `web_search` | Search for a query and return up to five results |
| Task | None | |
| Decision | None | |

To try it, install `websearch` with the [installer](../../docs/extensions.md#install-an-extension), start a local server, and add the extension to a project. Set its options through a client and ask an agent to search. See [Host](../../docs/host.md) for project calls.
