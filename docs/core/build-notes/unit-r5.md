# Unit R5

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Failure stages, not named in the design | One stage for every loader failure, or one per step. | `find` for an entry that is not a readable folder holding `index.ts`, `files` for a JavaScript file or a bad permission, `aliases` when `tau-extension` is not found, `import` for jiti. The host keeps `shape`, `options` and `install`. | The stage tells the owner which rule to repair. |
| The name rule | Check the folder name in the loader before import, or leave it to the host. | Leave it to the host. | R4 already checks the name and compares it with `extension.name`. A second copy of the rule has no new caller. A misnamed folder's top level runs once before the host leaves it out. |
| Finding `tau-extension` | `require.resolve`, `require.resolve.paths`, or a walk up from the host's folder. | Walk up from the loader's folder and read `node_modules/tau-extension/package.json`. | The package does not export `./package.json`, so `require.resolve` refuses it. `resolve.paths` adds global folders, which are not the installed tree. |
| Alias targets | The lexical path under `node_modules` or the real path. | The lexical path joined with each entry's `import` target. | Node takes the real path when it imports, so the host and the extension share one module. The identity test passes. |
| `tau-extension/testing` | Alias it only when the exports map has `./testing`, or always. | Always, to the host's `refused-testing.js`. | The refusal does not depend on the package keeping that entry. |
| No `tau-extension` with extensions present | Run the file checks first, or fail every entry at once. | Every visible entry fails with stage `aliases` and the repair message. | No entry can load, and the message names the one repair. |
| Failure `path` | The entry in the directory or its real path. | The entry in the directory. | It is the name the owner placed. A message that names a file gives its path inside the extension. |
| Symlinks inside an extension | Follow them or check the link. | Follow them for the permission and folder checks. The JavaScript check reads the name as listed. | `stat` sees what jiti will read. A loop ends in an error, which is a failure for that extension. |
| Owner of the directory itself | Admit root as for extension files, or only the server's user. | Only the server's user. | The kickoff says so. Root is admitted for extension folders and files only. |
| Absent directory | Create only the last folder, or its parents too. | `mkdir` with `recursive` and mode 0700. | `startServer` loads extensions before it creates the home, so `~/.tau` may not exist yet. |
| Shared task name message | Append to pi's error, or check before the install. | Check before the install: `Task T of extension B is already installed by extension A`. | pi's message names only the dropped extension. Built-in task names keep pi's message. |
| A direct `@earendil-works/pi-durable` import | Alias it, or let Node resolve it from the extension's folder. | No alias. It fails with `Cannot find module '@earendil-works/pi-durable'`. | Recorded by test. With its own `node_modules` it would get a second copy, as measured in `probe-report.md`. |
| Testing a missing `tau-extension` | Add an option for the lookup, or run a copy of the emitted loader from a folder with no `tau-extension` above it. | A copy, run in a child process. | No option without a production caller. The import checker forbids a nonliteral dynamic import in a test. |

## Not tested

A folder or file owned by another user who is not root. The test runs as one user and cannot create such a file. The check is the same `uid` comparison the directory uses.
