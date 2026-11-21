# Nix workflow design

Tau has two execution modes. Checkout commands validate files as you edit them. Nix derivations build artifacts and validate a tracked source snapshot. The full acceptance gate combines the isolated checks.

## Responsibility and dependency direction

- `flake.nix` assembles the supported systems and public outputs.
- `workspace.nix` owns the shared npm dependency tree, workspace discovery, and validation source inputs.
- `packages.nix` builds the executable, private server runtime, and extension artifacts.
- `image.nix` owns the Linux container image and its runtime filesystem.
- `standalone.nix` makes a portable archive from the installed core runtime and an official Node binary.
- `launchagent.nix` installs the built `tau` package as a macOS login service.
- `dev.nix` owns checkout preparation and developer commands.
- `checks.nix` owns isolated acceptance and installed-artifact verification.
- `runtime-check.nix` and `image-check.nix` inspect the installed runtime and image archive.

Packages do not depend on checks. Check derivations do not call checkout wrappers or invoke another Nix build. Workspace acceptance and local lint share the lint action, without sharing checkout preparation.

The extension list comes from workspace records in the lockfile. Packages, extension checks, and named test commands use that list. The installed verifier explicitly covers W1, W2, and webkit. Adding another extension must also account for installed verification.

## Artifact builds

The Tau package compiles core, including its test sources, but runs no tests. Installation includes only the runtime emit, manifests, dependency links, and the Node wrapper. Core does not depend on extension package outputs.

Extension packages contain TypeScript source and Markdown. They do not compile or execute tests. Their external runtime dependencies link to the shared npm tree. Tau supplies the public extension interface at runtime.

The development npm derivation serves the workspace. It uses root manifests and lock records, not application source. This avoids reinstalling dependencies for ordinary source edits. Public `tau` keeps this broader dependency tree, including `lib/tau/node_modules/.bin/tsc` for extension testing.

`workspace.runtimeModules` installs a separate production tree from core's runtime dependency fields and the existing version 3 lockfile. npm selects dependencies with `--omit=dev`. The synthetic root has no workspaces, development dependencies, or executable entry. Workspace-local nested dependency records are rejected rather than relocated. Dependency source files, declarations, and runtime executable links remain intact. Hidden npm locks are removed so their build-time archive paths do not enter the runtime closure.

The private `packages.tauRuntime` copies compiled core and manifests from `tau`, links the production tree, and wraps slim Node 24. Copying core prevents Node's realpath resolution from reaching the public package's development dependencies. Nix rejects references to public `tau`, the development dependency tree, or full Node in the private runtime closure. Compilation still happens only in `tau`.

`nix build .#standalone` archives the compiled core and production dependencies from `tauRuntime`. It uses an official Node 24 binary with a pinned checksum instead of the Nix-built Node and wrapper. It replaces the Nix Node shebangs in dependency commands, and Nix rejects store references in the unpacked tree before archiving it. The users who download the archive do not need Nix. Release runners verify the extracted archive outside the Nix sandbox.

## Run Tau directly from a flake

From a checkout, either command starts the installed server without checkout preparation.

```sh
nix run . -- --port 6283
nix run .#tau -- --port 6283
```

Without a checkout, use the repository flake.

```sh
nix run github:vicrdguez/tau#tau -- --port 6283
```

These commands use the public package, not the private image runtime. They do not run a development shell or link checkout dependencies. Nix needs flakes enabled and may fetch or build the package on first use.

Tau listens on `127.0.0.1`. Server state, devices, projects, extensions, and the admin socket live under `$HOME/.tau`. Provider credentials live in `$HOME/.pi/agent/auth.json`, or under `PI_CODING_AGENT_DIR` when set. Keep the credential directory writable for token refresh. Run admin commands with the same home as the server.

```sh
nix run .#tau -- device pair phone
nix run .#tau -- device list
```

Extensions are optional and are not installed by `nix run`. An empty extension directory starts an empty server. Use the existing extension installation workflow when needed. The CLI prints usage and exits 2 for `--help`.

On Apple Silicon macOS, `nix run .#install-launchagent` puts the already-built `tau` package in a dedicated `tau-launchagent` Nix profile. The LaunchAgent points to that profile. Rerun the command after pulling updates to switch the profile and restart the service. The command does not build anything after it starts and does not write to the checkout.

## Build and run the Linux image

`docker-image` is available on `x86_64-linux` and `aarch64-linux`. On a native Linux host, build and load its cached Docker archive.

```sh
nix build .#docker-image
docker load < result
```

The image is named `tau:local`. `dockerTools.buildLayeredImage` uses deterministic timestamps and its normal store-path layers. There is no separate base image or Dockerfile.

The image includes Tau, slim Node, Bash, coreutils, and CA certificates. It has no extensions, Git, npm, compiler, Nix executable, or project-specific tools. A `/nix/store` directory holds runtime files but does not provide a Nix installation. The process runs as `1000:1000`, with `HOME` and the working directory set to `/home/tau`. `/tmp` has mode `1777`. The exec-form entrypoint is `/bin/tau`.

Use a named volume for the whole home. Docker initializes a fresh volume from the image's home directory, which belongs to UID and GID 1000. Existing volumes and bind mounts must already be writable by that user.

```sh
docker volume create tau-home
docker run -d --name tau --init --network host \
  --mount source=tau-home,target=/home/tau \
  tau:local --port 6283
docker logs tau
docker exec tau tau device pair phone
docker exec tau tau device list
docker restart tau
docker stop tau
```

`--init` forwards signals and reaps child processes. Reuse `tau-home` when replacing the container to retain state and credentials. Supply credentials at runtime through the writable home or another writable mount with `PI_CODING_AGENT_DIR`. Do not put secrets in the image. Mount project directories separately when the server needs access to them.

The host-network command is for native Linux. Tau still accepts connections only on host loopback. Plain Docker `-p` cannot reach Tau because it binds to container loopback, not the container's network-interface address. For remote access, use a TLS proxy in Tau's network namespace, such as a proxy container with `--network container:tau`. With a bridge-network Tau container, publish the proxy's listening port on the Tau container when creating it. Configure the proxy upstream as `127.0.0.1:6283` and pass Tau `--allow-host` for the public hostname. The image does not change Tau's listener or add a forwarding process.

Darwin does not expose a native `docker-image` output. Use a Linux Nix builder or run the build inside a Linux VM. With a configured ARM64 Linux builder, select `.#packages.aarch64-linux.docker-image` explicitly. Evaluating that output on Darwin alone does not build or test the image. Docker Desktop host networking is not assumed by these instructions.

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
| `extension-w1`, `extension-w2`, `extension-webkit` | Core dependency compilation and the selected extension's typechecking and tests. |
| `e2e` | Typechecking and real-server tests, including restart and extension-loading behavior. |
| `verify-build` | Actual public installed executable and extension artifact verification. |
| `verify-runtime` | The same real-server verifier against the private runtime and all extension artifacts. |
| `runtime-content` | Runtime closure excludes public Tau, development dependencies, full Node, archives, hidden npm locks, TypeScript, and selected unrelated provider dependencies. |
| `standalone-archive` | Builds the standalone archive and rejects Nix store references in its unpacked tree. |
| `docker-image`, Linux only | Archive architecture, layers, entrypoint, user, home volume and ownership, temporary-directory mode, CA configuration, and runtime contents. |

Workspace lint needs the whole tracked tree. Other checks include selected package inputs and explicit runner files, not arbitrary root files or the whole tools directory. Core's export tests read `core/README.md`, so that README remains a real input. E2E loads the extension source trees at runtime, even though its TypeScript project references only core.

The image archive check does not need a Docker daemon. It does not prove container startup, fresh-volume writability, networking, persistence, or signal handling. Exercise those behaviors with the built image outside the Nix sandbox before accepting image changes.

Individual package checks do not repeat workspace lint. They therefore do not replace the full acceptance gate. Source copies are writable within private build directories. Checks retain the existing 660-second outer timeout and Darwin local-network permission.

Successful checks produce cacheable markers. They do not publish compiler outputs to other checks. Core compilation still repeats between independently invalidated checks and the package build. Sharing emitted artifacts is a separate design decision, not part of this split.

Artifact verification receives package store paths from the current flake evaluation. The app works without checkout preparation. It is not installed in the development shell because a shell can outlive source edits.

## Platforms and cache reuse

Supported systems are `x86_64-linux`, `aarch64-linux`, and `aarch64-darwin`. A plain acceptance run selects the host system. Evaluation on another system does not prove that its tests execute successfully. CI cache reuse requires a persistent store or binary cache. Declaring a cacheable check alone does not distribute its result.
