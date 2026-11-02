// Real SQLite through the managed-restore and repair interfaces. Process witnesses stay in recovery-packages.integration.ts.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runtimeOptions } from "../src/engine/runtime.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { managedRestore, openLedger, StartupFailure } from "../src/ledger/startup.ts";
import { damagedPackage, type PackageDamage } from "./support/recovery-damage.ts";

const admin = mintContext({ kind: "human", human: "human:owner", route: "local-admin" });
const open = (data: string) => openLedger({ data, runtime: runtimeOptions, onFatal: () => {} });

async function packagedStore(data: string): Promise<string> {
	const opened = await open(data);
	const send = async (commandId: string, command: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
		const reply = await opened.ledger.command({ version: 1, authorityEpoch: opened.authorityEpoch, commandId, command, ...extra }, admin);
		assert.equal(reply.status, commandId === "package" ? "packaged" : "accepted", JSON.stringify(reply));
		return reply as { path: string };
	};
	try {
		await send("enroll", { type: "enrollDevice", label: "before package", scope: { workflows: "all" } });
		await send("create", { type: "createWorkflow", title: "retained" });
		const content = Buffer.from("first\r\n").toString("base64");
		await send(
			"first",
			{ type: "saveDocument", document: "ground", mediaType: "text/markdown", content },
			{ workflow: "workflow:3", expected: { document: null } },
		);
		await send("hello", { type: "postCoordinatorMessage", text: "hello" }, { workflow: "workflow:3" });
		return (await send("package", { type: "createRecoveryPackage" })).path;
	} finally {
		await opened.close();
	}
}

// Each damage must refuse for its own reason; a refusal at the checksum or any other stage is not this evidence.
const REFUSALS: Record<PackageDamage, RegExp> = {
	pointer: /document pointer workflow:3\/ground/,
	receipt: /receipt fact\/scope/,
	"receipt-result": /receipt result\/relationships/,
	device: /device scope device:2/,
	parent: /revision chain/,
	schema: /unsupported entry schema render.revision/,
	"unknown-kind": /unsupported entry render.future/,
	"role-provenance": /role-work reconciliation unavailable/,
	"future-fact": /unsupported fact command admitEffect/,
	"backup-schema": /backup state/,
	"backup-cutoff": /backup state/,
	"message-text": /message content/,
	"message-digest": /message content/,
	"message-length": /message content/,
	"message-partial": /message content/,
};

test("package-validation: checksummed but semantically invalid retained relationships cannot be repaired", async () => {
	const root = await mkdtemp(join(tmpdir(), "render-semantics-"));
	try {
		const source = await packagedStore(join(root, "original"));
		for (const [kind, reason] of Object.entries(REFUSALS) as [PackageDamage, RegExp][]) {
			const bad = join(root, `semantic-${kind}`);
			await damagedPackage(source, bad, kind);
			await assert.rejects(
				managedRestore(join(root, `reject-${kind}`), bad),
				reason,
				`${kind} semantics must be validated beyond checksums`,
			);
			const direct = join(root, `direct-${kind}`);
			await mkdir(direct);
			await cp(join(bad, "render.db"), join(direct, "render.db"));
			if (kind.startsWith("backup-")) {
				await assert.rejects(
					open(direct),
					(e) => e instanceof StartupFailure && e.code === "unsupported_schema",
					"malformed backup state must block direct-copy startup",
				);
				continue;
			}
			const opened = await open(direct);
			try {
				const repair = await opened.ledger.command(
					{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "repair", command: { type: "repairRecovery" } },
					admin,
				);
				assert.equal(
					"code" in repair ? repair.code : repair.status,
					"invalid_recovery_package",
					`${kind} direct-copy repair must validate semantics`,
				);
			} finally {
				await opened.close();
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
