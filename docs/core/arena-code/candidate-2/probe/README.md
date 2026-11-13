# Architecture probes

Run from this directory: `npm ci --ignore-scripts`, then `node run.mjs`. Installation is a probe-only exception in the brief. Production workers use the Nix-built node_modules and never run npm install.

`setup-links.mjs` links the allowed published pi-durable 1.5.2 installation read-only and links the sketch workspaces inside this candidate directory. It never executes or writes the untrusted source tree. Node v24.21.0, npm 11.19.0 and TypeScript 5.9.3 were used.

`run.mjs` records everything in `output.txt` when invoked with stdout/stderr redirection. It checks an emitted ESM import across two npm packages under both node --test and an ordinary built entry. It also typechecks every sketch package, proves the request continuation covers every choice, proves the five helpers are available and answer is not, checks hidden subpaths in TypeScript and Node, and tests the AST import gate against seven forbidden forms. It loads the one host registry, counts its 20 entries and checks every closed pi-schema rejects forged by. It verifies the four Markdown assets are copied beside emitted modules. Biome check also passes with warnings for deliberately unused stub parameters and imports; no rules are disabled.

`lock.test.mjs` starts real OS children with Node's published node:sqlite. One holds BEGIN EXCLUSIVE on an empty lock file. A second gets database is locked. Killing the holder releases the lock and a third acquires it. All lock-state files are under this probe directory. This is a toolchain claim, not evidence that Tau's eventual project lock lifecycle is implemented.

`lock-output.txt` records the direct fixture run. An earlier helper exited after sending ready, so its connection no longer held the lock. The final fixture keeps IPC referenced, and `output.txt` records the passing exclusion/SIGKILL check. No lease or stale-file timer was introduced.

The typecheck-initial/second/third/fourth logs preserve sketch adjustments to the actual 1.5.2 exports and pi-schema union builder. The final output is the current evidence. The sketch's TODO tests do not prove Tau behavior. K1 to K6, HTTP recovery, W0, real Webfox, W2 and W1 remain implementation acceptance work. Nix was not available on PATH here, so no Nix result is claimed.
