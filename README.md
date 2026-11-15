# Tau

Tau is a small server on pi-durable for delegated agent work. It keeps decisions, events, projects, devices, and client calls in the core and loads workflows as extensions.

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

| Directory | Contents |
| --- | --- |
| `core/` | Store, host, command, and extension helpers |
| `extensions/` | Sample extensions |
| `e2e/` | End-to-end server tests |
| `tools/` | Development commands |

```sh
/nix/var/nix/profiles/default/bin/nix develop
/nix/var/nix/profiles/default/bin/nix flake check -L
/nix/var/nix/profiles/default/bin/nix run .#tau -- --port 0
install-extension --home /tmp/tau-home w2
```

The installer uses the given Tau home. Omit `--home` to install for the server's default home. See the [documentation index](docs/README.md).
