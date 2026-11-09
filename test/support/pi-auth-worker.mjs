// Stands in for a running pi: pi-coding-agent 1.5.0's own AuthStorage refreshes the anthropic login in auth.json.
// argv: <auth.json> <new access> <hold ms> <refresh log>. Prints "locked" once it holds pi's lock.
import { appendFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const [authPath, access, holdMs, log] = process.argv.slice(2);
const { AuthStorage } = await import(
	pathToFileURL(`${process.cwd()}/node_modules/@earendil-works/pi-coding-agent/dist/core/auth-storage.js`).href
);
const storage = AuthStorage.create(authPath);
await storage.modify("anthropic", async (current) => {
	process.stdout.write("locked\n");
	if (current?.type === "oauth" && current.expires > Date.now() + 5 * 60_000) return undefined;
	await setTimeout(Number(holdMs));
	appendFileSync(log, "pi\n");
	return { type: "oauth", access, refresh: `${access}-refresh`, expires: Date.now() + 3_600_000 };
});
