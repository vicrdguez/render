# Build notes: coordinator

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Code layout, not in the design | Candidate 1: one core package, Node strips types. Candidate 2: separate store and host packages, an emit step, an import checker. | Candidate 2 | It scored 22 against 19, and the owner said to take the highest score. See [Code arena](../arena-code.md). |
| `bind` with an extension name the server has no code for | Candidate 1 refused it with a new code, `unknown_extension`. The design records it in `missing` and does not refuse. | The design | [Extensions](../extensions.md) says a missing extension is left out with no error. |
| A pairing code that fails | Candidate 1 added `bad_code`, as `spikes/wire.mjs` does. The design's code list has `unauthorized`. | `unauthorized` | The list in [Protocol](../protocol.md) is the locked one. A spike's own name does not add to it. |
| Unit 0 | One unit, as first planned. Or two: the Nix base first, then workspaces and TypeScript once the layout was chosen. | Two | The layout was not designed, and the owner's rule sends such a choice through an arena. |
| When a kit helper is built | With the first unit that calls it, as first planned. Or all four helpers as one unit before the extensions. | One kit unit | Web search, W2, and W1 can then be built at the same time. Every helper has a caller in the same night's build, so the kit's rule on callers still holds. |
| Who may import `answer` | The arena's base let no extension package import `tau-store/host`, tests included. The judge flagged that a workflow's tests then cannot answer a decision. | Code under `src/` may not. A test under `test/` may. | A test acts as the human. Without it a workflow's `then` task cannot be tested on real store behaviour. |
