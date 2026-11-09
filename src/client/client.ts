// Stateless protocol clients (docs/protocol.md). They hold no workflow state: every view comes from the host.
import { type IncomingMessage, request } from "node:http";
import * as Effect from "effect/Effect";
import { fromPromise, runPromise } from "../effect.ts";

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

	#fetch(method: string, path: string, body?: unknown): Effect.Effect<Response, unknown> {
		return fromPromise(() =>
			fetch(new URL(path, this.#url), {
				method,
				headers: {
					authorization: `Bearer ${this.#bearer}`,
					...(body === undefined ? {} : { "content-type": "application/json" }),
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	}

	request(method: string, path: string, body?: unknown): Effect.Effect<Reply, unknown> {
		const response = this.#fetch(method, path, body);
		return Effect.gen(function* () {
			const res = yield* response;
			const text = yield* fromPromise(() => res.text());
			return { status: res.status, body: parseBody(text) };
		});
	}

	snapshot(): Effect.Effect<Reply, unknown> {
		return this.request("GET", `/v1/snapshot?version=${SUPPORTED_VERSION}`);
	}

	command(envelope: Record<string, unknown>): Effect.Effect<Reply, unknown> {
		return this.request("POST", "/v1/commands", envelope);
	}

	receipt(commandId: string): Effect.Effect<Reply, unknown> {
		return this.request("GET", `/v1/commands/${encodeURIComponent(commandId)}`);
	}

	artifact(revision: string): Effect.Effect<Reply, unknown> {
		return this.request("GET", `/v1/artifacts/${encodeURIComponent(revision)}`);
	}

	messages(workflow: string, cursor?: string): Effect.Effect<Reply, unknown> {
		const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
		return this.request("GET", `/v1/workflows/${encodeURIComponent(workflow)}/messages${query}`);
	}

	/** Live chat frames of one workflow until the host ends the stream; a refusal is yielded as one `refused` frame. */
	async *chat(workflow: string): AsyncGenerator<Record<string, unknown>, void, void> {
		const res = await runPromise(this.#fetch("GET", `/v1/workflows/${encodeURIComponent(workflow)}/chat?version=${SUPPORTED_VERSION}`));
		if (res.status !== 200 || res.body === null) {
			yield { kind: "refused", httpStatus: res.status, ...parseBody(await res.text()) };
			return;
		}
		let buffered = "";
		const decoder = new TextDecoder();
		for await (const chunk of res.body) {
			buffered += decoder.decode(chunk, { stream: true });
			for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
				const frame = JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>;
				buffered = buffered.slice(newline + 1);
				if (frame.version !== SUPPORTED_VERSION) throw new UnsupportedFrameVersion(String(frame.version));
				yield frame;
			}
		}
	}

	/**
	 * Observation frames with the protocol's client rules: refuse unknown versions, discard repeated or older
	 * sequences, and take a fresh snapshot (reconnect) on a gap or a dropped stream.
	 */
	async *observe(): AsyncGenerator<Record<string, unknown>, void, void> {
		let last: number | undefined;
		for (;;) {
			const response = this.#fetch("GET", `/v1/observe?version=${SUPPORTED_VERSION}`);
			const observation = await runPromise(
				Effect.gen(function* () {
					const res = yield* response;
					if (res.status === 200 && res.body !== null) return { kind: "stream" as const, body: res.body };
					const text = yield* fromPromise(() => res.text());
					return { kind: "refused" as const, frame: { kind: "refused", httpStatus: res.status, ...parseBody(text) } };
				}),
			);
			if (observation.kind === "refused") {
				yield observation.frame;
				return;
			}
			let buffered = "";
			let gap = false;
			const decoder = new TextDecoder();
			try {
				for await (const chunk of observation.body) {
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

function parseBody(text: string): Record<string, unknown> {
	return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
}

/** The local-admin route: HTTP over the data directory's Unix socket. */
export class AdminClient {
	readonly #socket: string;

	constructor(socket: string) {
		this.#socket = socket;
	}

	request(method: string, path: string, body?: unknown): Effect.Effect<Reply, unknown> {
		const socketPath = this.#socket;
		return Effect.gen(function* () {
			const payload = body === undefined ? undefined : JSON.stringify(body);
			const res = yield* fromPromise(
				() =>
					new Promise<IncomingMessage>((resolve, reject) => {
						const req = request(
							{ socketPath, method, path, headers: payload === undefined ? {} : { "content-type": "application/json" } },
							resolve,
						);
						req.on("error", reject);
						if (payload !== undefined) req.write(payload);
						req.end();
					}),
			);
			const text = yield* fromPromise(async () => {
				const chunks: Buffer[] = [];
				for await (const chunk of res) chunks.push(chunk as Buffer);
				return Buffer.concat(chunks).toString("utf8");
			});
			return { status: res.statusCode ?? 0, body: parseBody(text) };
		});
	}
}
