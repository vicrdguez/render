# Unit R9

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Journey source locations | Resolve extension packages through dev dependencies, or locate the repository source from the emitted test folder. | `extensionSource` resolves `../../../<name>/src` from `packages/tau/dist/test`. No extension dependency remains in tau. | These are repository journeys. Their existing emitted layout already supplies a stable location. R10 will change this helper when it moves tests to source. |
| Local search fixture | Copy the extension, or write an entry that imports its real source constructor and options. | Generate only `websearch/index.ts`, with absolute paths to the real TypeScript constructor and options. | jiti imports those files with the same aliases. Webfox resolves from its real source location. This avoids a copied extension and removes the unused testing export. |
| Duplicate import-map test | Keep a map utility, or test the directory boundary. | Replace it with a repeated real-folder test. | Folder names cannot repeat in one directory. Two links to the same folder are the remaining duplication case, and the loader reports it. |
| Core install tree | Copy all workspace files, or install only the four core-side manifests and emitted `src` folders. | Install tau, host, store and tau-extension. | Tests and sample source must not ship in the command. The facade is linked in the node_modules folder above the host. |
| External dependency cache | Prune the shared cache, or retain the existing Nix dependency cache. | Keep the shared cache and existing linker. | The design defers lock projection. The installed workspace tree contains no extension code or Markdown. External npm packages and shared metadata are not sample extensions. |
| Installed verifier | Ship journey tests with tau, or run the verifier from the checkout. | `verify-build` typechecks the checkout and runs its emitted verifier with the installed command and three source outputs. | The installed command must contain no extension references in tests. The verifier imports no journey helper. |
| Installer catalogue | Repeat the names in JavaScript, or pass the flake's extension output names. | The flake passes its extension attribute names as JSON to the script. | One list defines the outputs and the command's accepted names. |
| Installer home | Treat `--home` as a user home or a Tau home. | It is the Tau home. The default is `~/.tau`. | The link goes under `<home>/extensions`, matching the host API. Tests supply a temporary Tau home or set HOME to a temporary directory. |
| Installer untracked warning | Include ignored build output or use Git's normal untracked list. | `git ls-files --others --exclude-standard` under the selected package. | Ignored emitted output is not deployed. New untracked source gets a warning with `git add` advice. |

No extension source change was needed. Relative `.js` imports remain for R10. No host source changed, and no loader workaround was needed.

## Test disposition

Baseline is `215a56674ef61f0d4270913070b4154a84e22739`.

The full development run had 410 tests before and 416 after. The normalized top-level name lists have 352 before and 358 after. They are `/tmp/r9-before.txt` and `/tmp/r9-after.txt`. Only these two names were replaced.

| Removed from modules.test.ts | Replacement in directory.test.ts | Reason |
| --- | --- | --- |
| the import map refuses a repeated extension name instead of dropping code | the directory loader reports a repeated extension folder instead of importing it twice | The map is deleted. The directory grammar prevents duplicate logical names, and duplicate real targets still fail. |
| extensions reports the name, workflow flag and options schema of every real import-map entry | extensions reports the name, workflow flag and options schema of every real directory entry | The same exact schema assertions now cover the real source loader. |

Six added tests:

- tau starts empty and discovers only the extensions placed in its home
- install-extension lists repository extensions and marks an installed link
- install-extension builds an out-link, replaces it and tells the owner to restart
- install-extension refuses unknown names and malformed arguments without building
- install-extension warns that untracked extension files are excluded by the flake
- install-extension reports a failed build without claiming installation or replacing the old link

The existing journeys retained their names and assertions. The missing-extension journey removes and restores the W2 symlink. No journey supplies a real-extension module map.

## Evidence before acceptance

Tests were committed before the command, packaging and installer changes. The command test failed because the empty home listed the three static extensions. The new installed verifier failed because the old output contained w1, w2 and websearch. Installer tests initially failed because the command script did not exist. Their behavioral assertions passed after implementation and caught the validation mutation below. Logs are `/tmp/r9-command-red.log`, `/tmp/r9-build-red.log`, `/tmp/r9-install-red.log` and their green counterparts.

Each mutation ran alone and was restored.

| Mutation | Observed failure | Log |
| --- | --- | --- |
| Command scans `wrong-extensions` | The home fixture was not listed. Exit 1. | `/tmp/r9-mutant-command.log` |
| Installer skips its name whitelist | Unknown-name test received success instead of exit 2. | `/tmp/r9-mutant-installer.log` |
| Journey helper omits W2's link | W2 journey failed. Exit 1. | `/tmp/r9-mutant-w2.log` |
| Unlink W2 in the running W2 journey's home, then restart | W2 options were unavailable. Exit 1. | `/tmp/r9-mutant-unlink-w2.log` |
| Leave tau-extension out of the installed core tree | Installed package-list assertion failed. | `/tmp/r9-mutant-facade.log` |
| Delete W2 agent.md from its extension output | Verifier reported ENOENT for the installed Markdown. | `/tmp/r9-mutant-markdown.log` |
| Leave Webfox out of websearch's output | Loader reported `Cannot find module 'webfox'`; catalogue assertion failed. | `/tmp/r9-mutant-webfox.log` |

The restored full test run printed:

```text
ℹ tests 416
ℹ suites 3
ℹ pass 416
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17720.004917
```

One run's journey durations, reported by Node during that full suite, were W0 3172 ms, search 2298 ms, W2 3314 ms, missing extension 998 ms, W1 approval 1934 ms, W1 answer race 781 ms, W1 moved head 739 ms, and W1 SIGKILL 3238 ms. These include setup and cleanup, with test files running concurrently. They are test-budget observations, not a performance comparison. Every timed journey passed its HTTP, persistence and workflow assertions.

The installed verifier printed:

```text
empty extensions []
models HTTP 200; paired device listed
SIGTERM exit 0
extension source and Markdown installed
loaded w1, w2, websearch with options schemas
project missing []; W2 conversation created without a model call
models HTTP 200; paired device listed
SIGTERM exit 0
```

All three extension outputs had uid 0 and mode 0555. They loaded through the unchanged root-owner rule. Searches for `tau-w1|tau-w2|tau-websearch` found no match in tau source, host, store, or the installed tau tree. The verifier also rejects Markdown in the installed core workspace tree.

The real installer was driven with `/tmp/r9-install.1HOFHy` as its Tau home. The list was `w1`, `w2`, `websearch`. Installation and a second installation both succeeded. The next list marked `w2 (installed)`. A wrong name exited 2. Both `nix run .#install-extension` and the dev-shell command were exercised. The actual store target and root were:

```text
/nix/store/23lzgl2m8jrmwz0nnp6y2v9cj2a7m4ay-tau-extension-w2
"/tmp/r9-install.1HOFHy/extensions/w2" -> /nix/store/23lzgl2m8jrmwz0nnp6y2v9cj2a7m4ay-tau-extension-w2
```

The second line came from `nix-store --gc --print-roots`. No collection was requested. Full output is `/tmp/r9-install-real.log`. Isolated installer tests substitute only the Nix process to check arguments and failed-build behavior. That real run established store-link replacement and root registration only. It did not establish replacement of a hand-made or dangling link. The fake Nix incorrectly removed those links. The follow-up below corrects both the implementation and that evidence gap.

The first local gate found six import-order errors. Biome fixed only the changed tau tests. Acceptance is rerun from a fresh checkout of the pushed head and recorded in the PR.

## Verifier follow-up

The branch merged `origin/render-core` at `f2f9fc7` before these fixes. Logs and normalized name lists are in `/tmp/r9-finish/`.

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Replacing links | Let Nix replace any link, or build before removing a symlink ourselves. | Build with `--no-link`, unlink only a symbolic link after success, then create the out-link with Nix. | Real Nix refuses non-store links. A failed build must preserve the old link. Files and directories are refused with their kind and path. |
| Relative home | Resolve from the repository root or the caller directory. | Use the wrapper's existing `TAU_INVOCATION_DIR`, with cwd for direct execution. | The caller chooses the relative location. No new wrapper mechanism is needed. |
| Installed-tree scan | Scan workspace packages or the whole output. | Scan the whole output except node_modules; reject Markdown and non-declaration TypeScript. | Extension source can be copied outside packages or inside emitted folders. |

The corrected fake Nix refuses existing non-store links, including dangling ones. Before the fix the installer suite had 5 passes and 5 failures: replacement, dangling replacement, relative home, file refusal message and directory refusal message. After the fix all 10 pass. The default-home test sets HOME to its own temporary directory, with no `--home`. Changing `.tau` to `.wrong` fails it. Skipping the build status guard and skipping unlink each fail the suite independently. Each mutation was restored.

Both installed-layout mutants wrongly passed the old verifier (exit 0). With the new assertions, copying W2 TypeScript to `lib/tau/packages/tau/dist/src/w2` fails with `core ships TypeScript source: lib/tau/packages/tau/dist/src/w2/book.ts`; copying its source and Markdown to `lib/tau/w2` fails with `core ships prose: lib/tau/w2/agent.md`. The unchanged installed output passes the complete verifier.

Real `nix run .#install-extension -- --home <temporary-home> w2` results, recorded in `real.log`:

```text
checkout link: exit=0; Installed w2; Restart tau
 dangling link: exit=0; Installed w2; Restart tau
store link: exit=0; Installed w2; Restart tau
regular file: exit=1; Refusing to replace file at <home>/extensions/w2.
real directory: exit=1; Refusing to replace directory at <home>/extensions/w2.
```

Each successful target is `/nix/store/23lzgl2m8jrmwz0nnp6y2v9cj2a7m4ay-tau-extension-w2`. The regular file still contains `keep`; the directory remains a directory. These runs establish replacement of all three link kinds, not just store links.

The fresh `origin/render-core` baseline has 410 passing tests and 352 normalized top-level names. The candidate has 421 passing tests and 363 names. The only two removed names have the directory-test replacements listed above. Apart from those replacements, 11 names were added: the six listed above plus default HOME, relative home, dangling link, file refusal and directory refusal. No test was lost. The full run took 17.3 seconds, including concurrent setup and cleanup; this is a test-budget observation, not a speed comparison.

Fresh-checkout gate and all five forced checks are recorded in the PR comment at the pushed head. No host source was changed. Linux and real provider calls remain outside this evidence.

## Limits

Linux execution is not measured. No real model or external search provider is called. Reload and its CLI are outside R9. No destructive garbage collection is run; the registered root is inspected. Native dependency updates still require a restart. The shared external npm dependency cache is not pruned.
