/**
 * A real host for a test: a temporary root, SQLite stores, a faux model provider, and a clock the test moves.
 * Not a test file. The extensions' tests keep a copy of these lines (design.md, "Tradeoffs accepted").
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { deviceId } from "../../../src/host/devices.ts";
import { type Host, openHost } from "../../../src/host/host.ts";
import type { ExtensionModule } from "../../../src/module.ts";

export type TestHost = {
	readonly host: Host;
	readonly root: string;
	readonly faux: ReturnType<typeof fauxProvider>;
	readonly clock: { now: number };
	/** Closes the host and opens a new one on the same root: the server restarts. */
	reopen(): Promise<Host>;
};

export const phone = deviceId("phone");
export const laptop = deviceId("laptop");

export async function testHost(modules: readonly ExtensionModule[] = []): Promise<TestHost> {
	const root = await mkdtemp(join(tmpdir(), "tau-test-"));
	const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }, { id: "c" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const clock = { now: Date.UTC(2026, 10, 13) };
	const open = () => openHost({ root, modules, models, now: () => clock.now });
	let host = await open();
	return {
		get host() {
			return host;
		},
		root,
		faux,
		clock,
		async reopen() {
			await host.close();
			host = await open();
			return host;
		},
	};
}
