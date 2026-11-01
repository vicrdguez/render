// Stateless protocol clients (docs/protocol.md). They hold no workflow state: every view comes from the host.
import { request } from "node:http";

export const SUPPORTED_VERSION = 1;

export type Reply = { readonly status: number; readonly body: Record<string, unknown> };

export class UnsupportedFrameVersion extends Error {}

export class RenderClient {
	readonly #url: string;
	readonly #bearer: string;

	constructor(url: string, bearer: string) {
		this.#url = url;
		this.#bearer = bearer;
	}

	async request(method: string, path: string, body?: unknown): Promise<Reply> {
		const res = await fetch(new URL(path, this.#url), {
			method,
			headers: {
				authorization: `Bearer ${this.#bearer}`,
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await res.text();
		return { status: res.status, body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>) };
	}

	snapshot(): Promise<Reply> {
		return this.request("GET", `/v1/snapshot?version=${SUPPORTED_VERSION}`);
	}

	command(envelope: Record<string, unknown>): Promise<Reply> {
		return this.request("POST", "/v1/commands", envelope);
	}

	receipt(commandId: string): Promise<Reply> {
		return this.request("GET", `/v1/commands/${encodeURIComponent(commandId)}`);
	}

	artifact(revision: string): Promise<Reply> {
		return this.request("GET", `/v1/artifacts/${encodeURIComponent(revision)}`);
	}

	messages(workflow: string, cursor?: string): Promise<Reply> {
		const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
		return this.request("GET", `/v1/workflows/${encodeURIComponent(workflow)}/messages${query}`);
	}

	/**
	 * Observation frames with the protocol's client rules: refuse unknown versions, discard repeated or older
	 * sequences, and take a fresh snapshot (reconnect) on a gap or a dropped stream.
	 */
	async *observe(): AsyncGenerator<Record<string, unknown>, void, void> {
		let last: number | undefined;
		for (;;) {
			const res = await fetch(new URL(`/v1/observe?version=${SUPPORTED_VERSION}`, this.#url), {
				headers: { authorization: `Bearer ${this.#bearer}` },
			});
			if (res.status !== 200 || res.body === null) {
				const text = await res.text();
				yield { kind: "refused", httpStatus: res.status, ...(text === "" ? {} : (JSON.parse(text) as Record<string, unknown>)) };
				return;
			}
			let buffered = "";
			let gap = false;
			const decoder = new TextDecoder();
			try {
				for await (const chunk of res.body) {
					buffered += decoder.decode(chunk, { stream: true });
					let newline = buffered.indexOf("\n");
					while (newline >= 0 && !gap) {
						const frame = JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>;
						buffered = buffered.slice(newline + 1);
						newline = buffered.indexOf("\n");
						if (frame.version !== SUPPORTED_VERSION) throw new UnsupportedFrameVersion(String(frame.version));
						const sequence = Number(frame.sequence);
						if (frame.kind === "snapshot") {
							last = sequence;
						} else if (frame.kind === "change") {
							if (last !== undefined && sequence <= last) continue;
							if (frame.base !== last) {
								gap = true;
								break;
							}
							last = sequence;
						}
						yield frame;
						if (frame.kind === "end") return;
					}
					if (gap) break;
				}
			} catch (error) {
				if (error instanceof UnsupportedFrameVersion) throw error;
				// A dropped connection is not an outcome: reconnect and take a fresh snapshot.
			}
		}
	}
}

/** The local-admin route: HTTP over the data directory's Unix socket. */
export class AdminClient {
	readonly #socket: string;

	constructor(socket: string) {
		this.#socket = socket;
	}

	request(method: string, path: string, body?: unknown): Promise<Reply> {
		return new Promise((resolve, reject) => {
			const payload = body === undefined ? undefined : JSON.stringify(body);
			const req = request(
				{ socketPath: this.#socket, method, path, headers: payload === undefined ? {} : { "content-type": "application/json" } },
				(res) => {
					const chunks: Buffer[] = [];
					res.on("data", (c: Buffer) => chunks.push(c));
					res.on("end", () => {
						const text = Buffer.concat(chunks).toString("utf8");
						resolve({ status: res.statusCode ?? 0, body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>) });
					});
				},
			);
			req.on("error", reject);
			if (payload !== undefined) req.write(payload);
			req.end();
		});
	}
}
