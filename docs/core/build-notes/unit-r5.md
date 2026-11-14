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
| Symlinks inside an extension | Classify the listed name or the real target. | Follow them for permissions, folders and file kinds. | A `.ts` link to a `.js` target is JavaScript. Both helper and index links must fail before import. A loop is a failure for that extension. |
| Owner of the directory itself | Admit root as for extension files, or only the server's user. | Only the server's user. | The kickoff says so. Root is admitted for extension folders and files only. |
| Absent directory | Create only the last folder, or its parents too. | `mkdir` with `recursive` and mode 0700. | `startServer` loads extensions before it creates the home, so `~/.tau` may not exist yet. |
| Shared task name message | Append to pi's error, or check before the install. | Check before the install: `Task T of extension B is already installed by extension A`. | pi's message names only the dropped extension. Built-in task names keep pi's message. |
| A direct `@earendil-works/pi-durable` import | Alias it, or let Node resolve it from the extension's folder. | No alias. It fails with `Cannot find module '@earendil-works/pi-durable'`. | Recorded by test. With its own `node_modules` it would get a second copy, as measured in `probe-report.md`. |
| Testing a missing `tau-extension` | Add an option for the lookup, or run a copy of the emitted loader from a folder with no `tau-extension` above it. | A copy, run in a child process. | No option without a production caller. The import checker forbids a nonliteral dynamic import in a test. |

| Canonical imports | Parse source during the file walk, or check during jiti's transform. | A small Babel visitor in jiti's existing transform checks literal import, re-export and dynamic import specifiers against the alias keys. | It runs before prefix aliases can traverse a target, including in transitive TypeScript. It needs no parser dependency or second entry list. Exact testing imports still reach the throwing module. |
| Integer folder names | Refuse all-digit names, or sort at host admission. | Sort module names in `loadExtensions`, whatever the source's object order. | The existing name rule permits digits. Sorting once at admission fixes the integer-key reorder for every source without changing that rule. |
| Duplicate real folders | Import twice and let shape checking decide, or keep the first sorted entry. | Record real folders before import. The second fails and names the first. | The same trusted top level must not run twice under two directory names. |

## Limits

Loaded code is trusted and is not sandboxed. A top-level `process.exit()` in an extension ends the server. A top-level `await` that never settles stops the scan and so the start. No deadline or sandbox was added.

The specifier guard checks literal module specifiers handled by jiti's transform. It is not a security boundary for computed code, absolute imports or native dependency internals. Native dependencies still resolve from the extension's own folder and need a restart when changed.

## Not tested

No honest root-owned extension fixture exists in these unit tests. Files in a temporary directory belong to the test user, not root. No owner was faked. R12 loads the sample extensions from the root-owned, read-only Nix store, and that is where root-owned deployment is covered. The independent verifier already measured a genuine Nix-store folder loading at the inherited head. This round does not claim that its root-owner mutant is killed by the unit suite.

A folder or file owned by another user who is not root is also untested. The test runs as one user and cannot create such a file.

## Repair evidence

The initial fetch and merge of `origin/render-core` returned `Already up to date.` The baseline is `c38084a0e3668495e507488445defcbce06b23ed`. The inherited R5 head is `9548c4314d512e830eacbc0d2176da6d6b885eb0`.

Tests were committed before fixes. The first directory run on the inherited implementation produced real assertion failures, not compile failures.

```text
ℹ tests 47
ℹ pass 19
ℹ fail 28
```

All 24 noncanonical spelling cases failed their assertions before the guard. The cases cover eight spellings with static import, literal dynamic import and re-export from a transitive file. The numeric task test found owner `2` instead of `10`. The duplicate folder test found both modules. The symlink test loaded both JavaScript targets. The updated catalogue-order expectation also failed before the host sort was restored.

Each mutation was applied alone, compiled, tested and restored.

| Mutation | Test that fails | Result |
| --- | --- | --- |
| Remove the chord alias | every production entry in the exports map gives the host's own values | 0 pass, 1 fail |
| Replace the repair instruction with `Unavailable.` | without tau-extension beside the host every extension fails with a repair message | 0 pass, 1 fail |
| Disable the canonical prefix check | only canonical tau-extension specifiers load, including dynamic imports and re-exports | 0 pass, 25 fail including the parent |
| Remove admission sorting | the first sorted folder owns a shared task even with integer names on every start | 0 pass, 1 fail |
| Disable duplicate real-folder refusal | a second folder with the same real target fails and names the first | 0 pass, 1 fail |
| Classify the listed suffix instead of the real target | a ts-named symlink to external JavaScript fails for helpers and index files | 0 pass, 1 fail |

Focused directory and source tests then passed, 71 of 71, in 1.63 seconds of Node test time. The full development run passed after the repair.

```text
ℹ tests 377
ℹ suites 3
ℹ pass 377
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 18613.000958
```

The exports-map identity test reads every production entry and compares every value export with native imports from the installed facade. Adding an entry needs no edit to the test. The inherited independent probe measured 36 identities. The unchanged tool, decision, HTTP answer and then-task journey still passes. The cache and second-scan freshness tests still pass.

The first fresh-checkout gate caught an incidental test-output failure. The child compared all 36 values successfully, but parsing its colored numeric stdout failed under the gate's color settings. The nonempty comparison assertion now runs inside the child beside the identity assertions. The focused test passes with `FORCE_COLOR=1`. No production change was needed.

Local logs are `/tmp/r5-red.log`, `/tmp/r5-options-red.log`, `/tmp/r5-green.log`, `/tmp/r5-mutant-*-new.log` and `/tmp/r5-after-tests.log`. Fresh-checkout gate and forced-check output for the pushed head are reported in PR 109. No other unit's source files changed.

## Test names

The before list comes from a detached checkout of `origin/render-core` after the fetch, not the inherited R5 branch. The required top-level normalization gives 295 before and 319 after. No name was removed or renamed. There are 24 added top-level tests, 19 inherited R5 tests and five in this repair. Nested spelling cases add 24 more tests. Test totals are 329 before, 348 inherited and 377 after. The missing-package test was strengthened without changing its name. The catalogue-order test kept its name and schema assertion, with the expected order changed to sorted names.

The local lists are `/tmp/r5-before.txt` and `/tmp/r5-after.txt`. The added names are:

```text
a JavaScript file outside node_modules and dot folders fails its extension
a changed file is read again on the next scan
a directory extension runs through startServer: its tool asks, an HTTP answer runs its then task
a directory path that is a file refuses the scan and says so
a directory source lists extension folders in sorted name order and skips dot entries and node_modules
a directory with mode 707 refuses the whole scan
a directory with mode 730 refuses the whole scan
a directory with mode 770 refuses the whole scan
a folder or file writable by group or others fails that extension alone
a scan writes no jiti cache to the system temporary directory or beside the host
a second folder with the same real target fails and names the first
a shared task name names the module that kept it and the one left out
a symlink to a folder elsewhere loads under the link's name
a syntax error, a top-level throw and a mismatched name are left out and the server serves
a ts-named symlink to external JavaScript fails for helpers and index files
an absent directory is created with mode 0700 and loads nothing
an entry that is not a readable folder holding index.ts fails alone and never rejects the scan
an extension outside the repository gets the host's own request, defineTask and obj
an extension that imports pi-durable directly fails to load, since no alias exists for it
an extension that imports tau-extension/testing fails with the testing message
every production entry in the exports map gives the host's own values
only canonical tau-extension specifiers load, including dynamic imports and re-exports
the first sorted folder owns a shared task even with integer names on every start
without tau-extension beside the host every extension fails with a repair message
```
