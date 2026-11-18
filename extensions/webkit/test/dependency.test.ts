import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("an excessive content-encoding response cannot terminate the web host", () => {
	const child = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import { createServer } from 'node:net';
		import { once } from 'node:events';
		import { setTimeout } from 'node:timers/promises';
		import { Agent, fetch } from 'undici';
		const server = createServer(socket => {
			socket.once('data', () => socket.end('HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\\r\\nContent-Length: 1\\r\\nConnection: close\\r\\n\\r\\n'));
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		const agent = new Agent();
		try {
			let rejected = false;
			try { await fetch('http://127.0.0.1:' + server.address().port, { dispatcher: agent }); }
			catch { rejected = true; }
			if (!rejected) throw new Error('The invalid response must fail.');
			await setTimeout(30);
			console.log('HOST-SURVIVED-INVALID-ENCODING');
		} finally {
			await agent.destroy();
			await new Promise(resolve => server.close(resolve));
		}
	`,
		],
		{ encoding: "utf8", timeout: 5000 },
	);
	assert.equal(child.status, 0, child.stderr || String(child.error));
	assert.match(child.stdout, /HOST-SURVIVED-INVALID-ENCODING/);
});
