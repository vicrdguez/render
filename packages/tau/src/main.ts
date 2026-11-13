#!/usr/bin/env node
import { run } from "./command.js";

run(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		process.stderr.write(`tau: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	},
);
