import { homedir } from "node:os";
import path from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { type AdminRequest, requestAdmin, startServer } from "tau-host";
import { piLogins } from "./credentials.js";
import { modules } from "./modules.js";

const USAGE = `usage: tau [--allow-host NAME]...  start the server on ~/.tau and 127.0.0.1:6283
       tau device pair NAME             print a pairing code for a new device
       tau device revoke NAME           refuse that device from now on
       tau device list                  list the paired devices
`;

function parse(argv: readonly string[]): AdminRequest | undefined {
	const [group, command, device, ...rest] = argv;
	if (group !== "device" || rest.length > 0) return undefined;
	if (command === "list" && device === undefined) return { command };
	if ((command === "pair" || command === "revoke") && device !== undefined)
		return { command, device };
	return undefined;
}

const when = (ms: number) => new Date(ms).toISOString();

/** The host names a proxy forwards with, or undefined when the arguments are not a serve command. */
function hosts(argv: readonly string[]): string[] | undefined {
	const names: string[] = [];
	for (let i = 0; i < argv.length; i += 2) {
		const name = argv[i + 1];
		if (argv[i] !== "--allow-host" || name === undefined) return undefined;
		names.push(name);
	}
	return names;
}

async function serve(home: string, allowedHosts: string[]): Promise<number> {
	const agentDir =
		process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
	const server = await startServer({
		home,
		modules,
		models: builtinModels({
			credentials: piLogins(path.join(agentDir, "auth.json")),
		}),
		env: (target) => new NodeExecutionEnv({ cwd: target.cwd ?? process.cwd() }),
		allowedHosts,
	});
	for (const { project, reason } of server.skipped)
		process.stderr.write(`tau: skipped ${project}: ${reason}\n`);
	process.stdout.write(
		`tau: listening on http://127.0.0.1:${server.address.port}\n`,
	);
	await new Promise<void>((resolve) => {
		const stop = () => {
			process.once("SIGINT", () => process.exit(1));
			process.once("SIGTERM", () => process.exit(1));
			resolve();
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
	await server.close();
	return 0;
}

/** `tau` with no argument serves; `tau device …` reaches the running server through its admin socket. */
export async function run(argv: readonly string[]): Promise<number> {
	const home = path.join(homedir(), ".tau");
	const allowed = argv[0] === "device" ? undefined : hosts(argv);
	if (allowed !== undefined) return serve(home, allowed);
	const request = parse(argv);
	if (request === undefined) {
		process.stderr.write(USAGE);
		return 2;
	}
	const result = await requestAdmin(home, request).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT" || error.code === "ECONNREFUSED")
				return undefined;
			throw error;
		},
	);
	if (result === undefined) {
		process.stderr.write(`tau: no Tau server runs on ${home}\n`);
		return 1;
	}
	if ("error" in result) {
		process.stderr.write(`tau: ${result.error}\n`);
		return 1;
	}
	if ("code" in result)
		process.stdout.write(
			`Pairing code: ${result.code}\nIt works once, until ${when(result.expiresAt)}.\n`,
		);
	else if ("devices" in result)
		for (const d of result.devices)
			process.stdout.write(
				`${d.device}\tpaired ${when(d.pairedAt)}${d.revokedAt === undefined ? "" : `\trevoked ${when(d.revokedAt)}`}\n`,
			);
	else process.stdout.write("Revoked.\n");
	return 0;
}
