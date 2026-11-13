import { chmod, unlink } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
	arr,
	compile,
	lit,
	num,
	obj,
	opt,
	type Static,
	str,
	union,
} from "@earendil-works/pi-schema";
import { DEVICE, type Devices } from "./devices.js";

const Request = union([
	obj({ command: lit("pair"), device: str({ pattern: DEVICE }) }),
	obj({ command: lit("revoke"), device: str() }),
	obj({ command: lit("list") }),
]);
const Result = union([
	obj({ code: str(), expiresAt: num() }),
	obj({
		devices: arr(
			obj({ device: str(), pairedAt: num(), revokedAt: opt(num()) }),
		),
	}),
	obj({ done: lit(true) }),
	obj({ error: str() }),
]);
export type AdminRequest =
	| { command: "pair"; device: string }
	| { command: "revoke"; device: string }
	| { command: "list" };
export type AdminResult = Static<typeof Result>;
const checkRequest = compile(Request);
const checkResult = compile(Result);
const LINE_LIMIT = 64 * 1024;

export const adminSocket = (home: string) => path.join(home, "admin.sock");

function exchange(file: string, line: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(file);
		let reply = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			reply += chunk;
		});
		socket.on("end", () => resolve(reply));
		socket.on("error", reject);
		socket.end(`${line}\n`);
	});
}

/** Sends one command to the server that runs on `home`, through its owner-only socket. */
export async function requestAdmin(
	home: string,
	request: AdminRequest,
): Promise<AdminResult> {
	const parsed = checkResult.validate(
		JSON.parse(await exchange(adminSocket(home), JSON.stringify(request))),
	);
	if (!parsed.ok)
		throw new Error(`the server's reply does not fit: ${JSON.stringify(parsed.errors)}`);
	return parsed.value;
}

/** Refuses when a live server answers on the socket, and removes a socket that a killed server left. */
export async function refuseRunning(file: string): Promise<void> {
	const alive = await new Promise<boolean>((resolve) => {
		const socket = net.connect(file);
		socket.on("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.on("error", () => resolve(false));
	});
	if (alive) throw new Error(`a Tau server is already running on ${file}`);
	await unlink(file).catch((error) => {
		if (error.code !== "ENOENT") throw error;
	});
}

async function handle(devices: Devices, line: string): Promise<AdminResult> {
	let body: unknown;
	try {
		body = JSON.parse(line);
	} catch {
		return { error: "The request is not JSON." };
	}
	const parsed = checkRequest.validate(body);
	if (!parsed.ok)
		return { error: `The request does not fit: ${JSON.stringify(parsed.errors)}` };
	const request = parsed.value;
	if (request.command === "pair") return devices.issue(request.device);
	if (request.command === "revoke") return devices.revoke(request.device);
	return { devices: devices.list() };
}

export async function listenAdmin(
	file: string,
	devices: Devices,
): Promise<net.Server> {
	const server = net.createServer((socket) => {
		let line = "";
		let answered = false;
		const answer = async () => {
			if (answered) return;
			answered = true;
			const reply = await handle(devices, line.split("\n")[0] ?? "").catch(
				(error: unknown) => ({ error: String(error) }),
			);
			socket.end(`${JSON.stringify(reply)}\n`);
		};
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			line += chunk;
			if (line.length > LINE_LIMIT) socket.destroy();
			else if (line.includes("\n")) void answer();
		});
		socket.on("end", () => void answer());
		socket.on("error", () => {});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(file, () => resolve());
	});
	await chmod(file, 0o600);
	return server;
}
