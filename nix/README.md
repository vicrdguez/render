# Nix workflow design

Tau has two execution modes. Checkout commands validate files as you edit them. Nix derivations build artifacts and validate a tracked source snapshot. The full acceptance gate combines the isolated checks.

## Responsibility and dependency direction

- `flake.nix` assembles the supported systems and public outputs.
- `workspace.nix` owns the shared npm dependency tree, workspace discovery, and validation source inputs.
- `packages.nix` builds the executable and extension artifacts.
- `dev.nix` owns checkout preparation and developer commands.
- `checks.nix` owns isolated acceptance and installed-artifact verification.

Packages do not depend on checks. Check derivations do not call checkout wrappers or invoke another Nix build. Workspace acceptance and local lint share the lint action, without sharing checkout preparation.

The extension list comes from workspace records in the lockfile. Packages, extension checks, and named test commands use that list. The installed verifier explicitly covers W1, W2, and websearch. Adding another extension must also account for installed verification.

## Artifact builds

The Tau package compiles core, including its test sources, but runs no tests. Installation includes only the runtime emit, manifests, dependency links, and the Node wrapper. Core does not depend on extension package outputs.

Extension packages contain TypeScript source and Markdown. They do not compile or execute tests. Their external runtime dependencies link to the shared npm tree. Tau supplies the public extension interface at runtime.

One npm derivation serves the workspace. It uses root manifests and lock records, not application source. This avoids reinstalling dependencies for ordinary source edits. It also means core's dependency closure is broader than a runtime-only core installation.

## Checkout feedback

Each command finds the repository root and preserves the original physical invocation directory. That lets selectors resolve files from subdirectories. Commands link Nix dependencies into managed `node_modules` while workspace links point at the checkout. An unmanaged directory causes an error rather than replacement.

Typechecking validates the lock and selected import boundaries before invoking TypeScript. Tests perform the same preparation, then execute the selected tests. Core tests run emitted JavaScript. Extension and E2E tests run TypeScript source. Markdown accompanies emitted modules because TypeScript does not copy it.

The command prepares dependencies once. Linking has a 60-second timeout. The action has a 600-second timeout. Both allow a 10-second kill grace. Compiler state stays in the checkout for later commands.

Help and package listing do not link dependencies into the checkout or compile source. Named test apps select one package. The generic command retains package, directory, and individual-file selectors.

## Acceptance and source inputs

`nix flake check -L` includes the following checks for the selected system.

| Check | Guarantee |
| --- | --- |
| `workspace` | Lock consistency, import boundaries, Biome, Nix formatting, and development-tool tests. |
| `core` | Core compilation, emitted assets, and core tests. |
| `extension-w1`, `extension-w2`, `extension-websearch` | Core dependency compilation and the selected extension's typechecking and tests. |
| `e2e` | Typechecking and real-server tests, including restart and extension-loading behavior. |
| `verify-build` | Actual installed executable and extension artifact verification. |

Workspace lint needs the whole tracked tree. Other checks include selected package inputs and explicit runner files, not arbitrary root files or the whole tools directory. Core's export tests read `core/README.md`, so that README remains a real input. E2E loads the extension source trees at runtime, even though its TypeScript project references only core.

Individual package checks do not repeat workspace lint. They therefore do not replace the full acceptance gate. Source copies are writable within private build directories. Checks retain the existing 660-second outer timeout and Darwin local-network permission.

Successful checks produce cacheable markers. They do not publish compiler outputs to other checks. Core compilation still repeats between independently invalidated checks and the package build. Sharing emitted artifacts is a separate design decision, not part of this split.

Artifact verification receives package store paths from the current flake evaluation. The app works without checkout preparation. It is not installed in the development shell because a shell can outlive source edits.

## Platforms and cache reuse

Supported systems are `x86_64-linux`, `aarch64-linux`, and `aarch64-darwin`. A plain acceptance run selects the host system. Evaluation on another system does not prove that its tests execute successfully. CI cache reuse requires a persistent store or binary cache. Declaring a cacheable check alone does not distribute its result.
