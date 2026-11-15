import { spawnSync } from "node:child_process";
import { selectPackages, workspaces } from "./workspaces.mjs";

const packages = selectPackages(await workspaces(), process.argv.slice(2));
if (packages.length) {
	const result = spawnSync(
		process.execPath,
		[
			"node_modules/typescript/bin/tsc",
			"-b",
			...packages.map((pkg) => pkg.directory),
		],
		{ stdio: "inherit" },
	);
	process.exitCode = result.status ?? 1;
}
