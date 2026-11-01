## Render
A durable, event-backed orchestration kernel built around pure domain transitions, with agents and decision models acting as external workers.

- Design authority: [docs/spec.md](docs/spec.md)
- Host protocol: [docs/protocol.md](docs/protocol.md)
- Operating the host: [docs/operations.md](docs/operations.md)
- Verification: [.render/verify.md](.render/verify.md)

```sh
npm ci --ignore-scripts
npm test && npm run typecheck && npm run lint
node src/host/main.ts serve --data ~/.render/data
```
