// Owned HTTP responses standing in for the external web providers, with the requests each one received.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export async function webHttpFixture(
	handler: (
		path: string,
		body: Record<string, unknown>,
	) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>,
) {
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	const server = createServer(async (req, res) => {
		let text = "";
		for await (const chunk of req) text += String(chunk);
		const call = { path: req.url!, body: JSON.parse(text) as Record<string, unknown> };
		calls.push(call);
		const response = await handler(call.path, call.body);
		res.writeHead(response.status ?? 200, { "content-type": "application/json" });
		res.end(JSON.stringify(response.body));
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	return {
		calls,
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		close: () =>
			new Promise<void>((r) => {
				server.closeAllConnections();
				server.close(() => r());
			}),
	};
}
