## Render
A durable, event-backed orchestration kernel built around pure domain transitions, with agents and decision models acting as external workers.

- Design authority: [docs/spec.md](docs/spec.md)
- Effect programs and ownership: [docs/effect.md](docs/effect.md)
- Host protocol: [docs/protocol.md](docs/protocol.md)
- Operating the host: [docs/operations.md](docs/operations.md)
- Verification: [.render/verify.md](.render/verify.md)
- Owned Linux check candidate and remaining blockers: [docs/owned-checks.md](docs/owned-checks.md)

```sh
npm ci --ignore-scripts
npm test                # fast functional feedback, not the full suite
npm run verify:gate     # typecheck, lint and every test selection
node src/host/main.ts serve --data ~/.render/data
```
