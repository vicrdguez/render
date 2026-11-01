// Fixed SSH transport and receiver for the closed recovery-package format, not a backup-provider framework.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { faultBarrier } from "./barrier.ts";
import { syncPath, validatePackage } from "./recovery.ts";

export type OffHostDestination = { sshHost: string; receiver: string; directory: string };
const MAX_BYTES = 256 * 1024 * 1024;
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

type Receipt = { status: string; id: string; cutoff: number; digest: string };
function assertReceipt(receipt: Receipt, manifest: Awaited<ReturnType<typeof validatePackage>>): void {
	if (
		receipt.status !== "durable-verified" ||
		receipt.id !== manifest.id ||
		receipt.cutoff !== manifest.cutoff ||
		receipt.digest !== manifest.files["render.db"]
	)
		throw new Error("Remote durable verification receipt missing or mismatched; copy is not protection.");
}

export async function transferPackage(path: string, destination: OffHostDestination): Promise<void> {
	const manifest = await validatePackage(path);
	if (
		!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(destination.sshHost) ||
		!destination.receiver.startsWith("/") ||
		!destination.directory.startsWith("/")
	)
		throw new Error("Provision an SSH host alias and absolute remote receiver/destination paths.");
	const payload = JSON.stringify({
		manifest: await readFile(join(path, "manifest.json"), "utf8"),
		database: (await readFile(join(path, "render.db"))).toString("base64"),
	});
	if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error("Off-host package exceeds the 256 MiB encoded transfer bound.");
	const command = `node ${quote(destination.receiver)} backup-receive --data ${quote(destination.directory)}`;
	const output = await new Promise<string>((resolve, reject) => {
		const child = spawn(
			"ssh",
			["-oBatchMode=yes", "-oStrictHostKeyChecking=yes", "-oConnectTimeout=10", "--", destination.sshHost, command],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		let stdout = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("Off-host transfer timed out after 120 seconds."));
		}, 120000);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
			if (stdout.length > 16384) child.kill("SIGKILL");
		});
		// Drain diagnostics, but do not disclose operator paths/SSH configuration to scoped device readers.
		child.stderr.resume();
		child.on("error", reject);
		child.stdin.on("error", () => undefined);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0 && stdout.length <= 16384) resolve(stdout);
			else reject(new Error("Off-host destination/tool unavailable or package refused."));
		});
		child.stdin.end(payload);
	});
	const receipt = JSON.parse(output) as Receipt;
	assertReceipt(receipt, manifest);
}

/** Runs on the operator-owned destination host. No caller-controlled filenames are interpreted. */
export async function receivePackage(directory: string, input: AsyncIterable<Buffer | string>): Promise<Receipt> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of input) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > MAX_BYTES) throw new Error("Package exceeds encoded transfer bound.");
		chunks.push(bytes);
	}
	const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { manifest: string; database: string };
	if (typeof payload.manifest !== "string" || typeof payload.database !== "string") throw new Error("Invalid transfer framing.");
	// Provisioning owns the destination and its parent; never silently create a local replacement for a missing mount.
	const staging = join(directory, `.receive-${randomUUID()}.incomplete`);
	await mkdir(staging, { mode: 0o700 });
	try {
		await writeFile(join(staging, "manifest.json"), payload.manifest, { flag: "wx", mode: 0o600 });
		await writeFile(join(staging, "render.db"), Buffer.from(payload.database, "base64"), { flag: "wx", mode: 0o600 });
		const manifest = await validatePackage(staging);
		await syncPath(join(staging, "manifest.json"));
		await syncPath(join(staging, "render.db"));
		await syncPath(staging);
		await faultBarrier("offhost-before-publish", "offhost");
		const published = join(directory, manifest.id);
		await rename(staging, published);
		await syncPath(directory);
		await faultBarrier("offhost-after-publish", "offhost");
		const checked = await validatePackage(published);
		return { status: "durable-verified", id: checked.id, cutoff: checked.cutoff, digest: checked.files["render.db"] };
	} finally {
		await rm(staging, { force: true, recursive: true });
	}
}
