import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { openHost } from "../src/host/host.ts";
import { sourceFixture } from "./support/source.ts";

// All services belong to this fixture; no probe touches a user's live service.
test("linux-profile-owned-check: nonroot, absent secrets/socket, authenticated Render and honest host networking", async (t) => {
	const f = await sourceFixture();
	const host = await Effect.runPromise(openHost({ data: `${f.root}/authority`, hostname: "0.0.0.0" }));
	const server = createServer((_req, res) => res.end("owned-host-canary"));
	await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
	let handle: Effect.Success<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		for (const override of [{ privileged: true }, { mounts: [f.root] }, { network: "host" }, { env: { SECRET: "leak" } }])
			await assert.rejects(Effect.runPromise(f.sandboxes.prepare(f.scope, { ...f.profile, ...override }, base)), /profile|forbidden/i);
		handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const port = (server.address() as AddressInfo).port;
		const renderPort = new URL(host.url).port;
		const script = `
const fs = require('fs');
if (process.getuid() === 0) throw Error('root worker');
for (const p of ['/var/run/docker.sock', '/run/docker.sock', '/authority/render.db', '/root/.ssh', ${JSON.stringify(f.root)}]) if (fs.existsSync(p)) throw Error('forbidden mount');
for (const k of Object.keys(process.env)) if (/API_KEY|TOKEN|SSH_AUTH|AWS_|GITHUB|ANTHROPIC/.test(k)) throw Error('credential leak');
(async () => {
 const canary = await fetch('http://host.docker.internal:${port}');
 if (await canary.text() !== 'owned-host-canary') throw Error('wrong fixture');
 const r = await fetch('http://host.docker.internal:${renderPort}/snapshot');
 if (r.status !== 401) throw Error('unauthenticated authority');
 console.log(JSON.stringify({network:'owned host reachable; not route confinement', uid:process.getuid(), platform:process.platform, arch:process.arch}));
})();`;
		const result = await Effect.runPromise(f.sandboxes.execute(handle, { scope: f.scope, argv: ["node", "-e", script], timeoutMs: 10000 }));
		assert.equal(result.exitCode, 0, result.stderr);
		assert.match(result.stdout, /owned host reachable/);
		assert.equal(result.platform.os, "linux");
		t.diagnostic(result.stdout);
		f.fence();
		await assert.rejects(
			Effect.runPromise(f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "echo forbidden"], timeoutMs: 1000 })),
			/scope|fenc|author/i,
		);
	} finally {
		if (handle) await Effect.runPromise(f.sandboxes.stop(handle)).catch(() => {});
		await Effect.runPromise(host.close());
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await f.close();
	}
});
