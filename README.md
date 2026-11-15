# Tau

Tau is a small server on pi-durable for delegated agent work. It keeps decisions, events, projects, devices, and client calls in the core and loads workflows as extensions.

| Directory | Contents |
| --- | --- |
| `core/` | Store, host, command, and extension helpers |
| `extensions/` | [Sample extensions](docs/README.md) |
| `e2e/` | End-to-end server tests |
| `tools/` | Development commands |

## Build and test

These examples use `nix` from your PATH. On this development machine, its full path is `/nix/var/nix/profiles/default/bin/nix`.

| Task | Command |
| --- | --- |
| Build the core executable without extension packages | `nix build .#tau` |
| Run the core executable | `nix run .#tau -- --port 0` |
| Package one extension's TypeScript and Markdown | `nix build .#extension-w2` |
| Test core from the working checkout | `nix run .#test-core` |
| Test one extension from the working checkout | `nix run .#test-w2` |
| Run the real-server tests | `nix run .#test-e2e` |
| Test the development tools | `nix run .#test-tools` |
| Select a test file | `nix run .#test -- core/test/store/exports.test.ts` |
| Discover selectors and package names | `nix run .#test -- --help` or `nix run .#test -- --list` |
| Run one isolated, cacheable check | `nix build .#checks.aarch64-darwin.extension-w2` |
| Verify the installed executable and extension artifacts | `nix run .#verify-build` |
| Run the full acceptance gate | `nix flake check -L` |

`test-w1` and `test-websearch` select the other extensions. `nix flake show` lists the available apps and checks. Replace `aarch64-darwin` with your system for individual checks.

Use `nix develop` for an interactive shell. It provides `fmt`, `lint`, `typecheck`, `test`, and the named test commands. In an interactive shell, use `env test` to avoid the shell builtin.

Checkout tests typecheck the selected package and its core dependency before execution. They retain incremental compiler output and include untracked source files. Named test commands accept no selectors. Use the generic `test` command for file and directory selection.

Artifact builds and acceptance checks use the flake's tracked source snapshot. Add new files with Git before using them. A cached check can succeed without executing again. Packaging an extension does not typecheck or test it. The shared npm dependency tree covers the whole workspace, even when you build only core.

Tau loads extensions from its home at runtime. `nix run .#tau` uses `~/.tau` by default, but does not build extension packages.

The full acceptance gate replaces the old local `check` command. Use `nix run .#verify-build` for current artifacts, not a verifier pinned into a long-lived development shell.

See [the Nix workflow design](nix/README.md), the [documentation index](docs/README.md), and [install an extension](docs/extensions.md#install-an-extension).
