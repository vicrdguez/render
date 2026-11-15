import { glob, readdir, readFile, realpath } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Build tooling, not Tau runtime. No lint suppression can bypass this check.
export async function check(root) {
	const policy = JSON.parse(
		await readFile(path.join(root, "boundaries.json"), "utf8"),
	);
	const rootConfig = JSON.parse(
		await readFile(path.join(root, "tsconfig.json"), "utf8"),
	);
	const references = new Set(
		(rootConfig.references ?? []).map(({ path: reference }) => {
			const target = path.resolve(root, reference);
			return path.basename(target) === "tsconfig.json"
				? path.dirname(target)
				: target;
		}),
	);
	const packages = [];
	const errors = [];
	const workspace = JSON.parse(
		await readFile(path.join(root, "package.json"), "utf8"),
	);
	for await (const entry of glob(workspace.workspaces, { cwd: root })) {
		const directory = await realpath(path.join(root, entry));
		const manifest = JSON.parse(
			await readFile(path.join(directory, "package.json"), "utf8"),
		);
		packages.push({ directory, manifest });
		if (!references.has(directory))
			errors.push(
				`${manifest.name}: missing from root tsconfig.json references`,
			);
		const config = JSON.parse(
			await readFile(path.join(directory, "tsconfig.json"), "utf8"),
		);
		for (const key of ["paths", "baseUrl", "rootDirs"]) {
			if (config.compilerOptions?.[key])
				errors.push(`${manifest.name}: forbidden compiler alias ${key}`);
		}
		if (!Object.hasOwn(policy, manifest.name))
			errors.push(`no policy for ${manifest.name}`);
	}
	const base = JSON.parse(
		await readFile(path.join(root, "tsconfig.base.json"), "utf8"),
	);
	for (const key of ["paths", "baseUrl", "rootDirs"]) {
		if (base.compilerOptions?.[key])
			errors.push(`forbidden base compiler alias ${key}`);
	}
	const byName = new Map(packages.map((p) => [p.manifest.name, p]));
	const builtins = new Set(builtinModules.flatMap((n) => [n, `node:${n}`]));
	function forbiddenExtensionDependency(name) {
		return (
			name.startsWith("@earendil-works/") ||
			["tau-store", "tau-host", "tau", "tau-kit"].includes(name) ||
			(name !== "tau-extension" && Object.hasOwn(policy, name))
		);
	}
	function extensionEntry(name, spec = name) {
		if (spec === "tau-store/testing") return "tau-extension/testing";
		const deepEntry =
			/^tau-extension\/dist\/src\/(durable|schema|chord|testing)\.js$/.exec(
				spec,
			);
		if (deepEntry) return `tau-extension/${deepEntry[1]}`;
		return (
			{
				"@earendil-works/pi-durable": "tau-extension/durable",
				"@earendil-works/pi-schema": "tau-extension/schema",
				"@earendil-works/chord": "tau-extension/chord",
				"@earendil-works/pi-ai": "tau-extension/testing",
			}[name] ?? "tau-extension"
		);
	}
	function inspectSpecifier(pkg, file, spec) {
		const label = `${path.relative(root, file)}: ${spec}`;
		const isTest = file.startsWith(path.join(pkg.directory, "test") + path.sep);
		const permissions = policy[pkg.manifest.name];
		if (pkg.manifest.name === "tau") {
			const source = path.join(pkg.directory, "src");
			const from = path.relative(source, file).split(path.sep)[0];
			const target =
				spec === "tau/server"
					? path.join(source, "host", "index.ts")
					: spec.startsWith(".")
						? path.resolve(path.dirname(file), spec)
						: undefined;
			const to =
				target === undefined
					? undefined
					: path.relative(source, target).split(path.sep)[0];
			if (
				(from === "store" &&
					["host", "server.js", "server.ts", "command"].includes(to)) ||
				(from === "host" && to === "command")
			)
				errors.push(`${label}: forbidden core layer import`);
		}
		if (
			spec.startsWith(".") ||
			path.isAbsolute(spec) ||
			spec.startsWith("file:")
		) {
			if (!spec.startsWith(".")) {
				errors.push(`${label}: absolute/file imports forbidden`);
				return;
			}
			if (permissions?.extension && !spec.endsWith(".ts"))
				errors.push(`${label}: extension relative imports must end in .ts`);
			const target = path.resolve(path.dirname(file), spec);
			if (!target.startsWith(pkg.directory + path.sep))
				errors.push(`${label}: cross-package relative import`);
			const testDirectory = path.join(pkg.directory, "test");
			if (
				file.startsWith(path.join(pkg.directory, "src") + path.sep) &&
				(target === testDirectory ||
					target.startsWith(testDirectory + path.sep))
			)
				errors.push(`${label}: source import of tests forbidden`);
			return;
		}
		if (spec === "module" || spec === "node:module") {
			errors.push(`${label}: CommonJS escape forbidden`);
			return;
		}
		if (builtins.has(spec)) return;
		const name = spec.startsWith("@")
			? spec.split("/").slice(0, 2).join("/")
			: spec.split("/")[0];
		const subpath = spec === name ? "." : `.${spec.slice(name.length)}`;
		if (
			permissions?.extension &&
			(forbiddenExtensionDependency(name) ||
				(name === "tau-extension" &&
					![".", "./durable", "./schema", "./chord"].includes(subpath) &&
					!(isTest && subpath === "./testing")))
		) {
			const guidance =
				name === "@earendil-works/pi-ai" && !isTest
					? "pi-ai is for tests only"
					: `use ${extensionEntry(name, spec)}${spec === "tau-extension/testing" ? "/testing in test/ only" : ""}`;
			errors.push(`${label}: forbidden extension import; ${guidance}`);
			return;
		}
		const target = byName.get(name);
		const declared =
			Object.hasOwn(pkg.manifest.dependencies ?? {}, name) ||
			(isTest && Object.hasOwn(pkg.manifest.devDependencies ?? {}, name));
		if (Object.hasOwn(policy, name)) {
			if (
				pkg !== target &&
				!permissions?.[name]?.includes(subpath) &&
				!(isTest && permissions?.testOnly?.[name]?.includes(subpath))
			) {
				errors.push(`${label}: forbidden workspace capability`);
			}
			if (pkg !== target && !declared)
				errors.push(`${label}: undeclared workspace dependency`);
			if (!target) errors.push(`${label}: workspace package is missing`);
			else if (!Object.hasOwn(target.manifest.exports ?? {}, subpath))
				errors.push(`${label}: not an exported subpath`);
		} else if (!declared) {
			errors.push(`${label}: undeclared external dependency`);
		}
	}
	async function visitDirectory(pkg, directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				errors.push(`${file}: source symlink forbidden`);
				continue;
			}
			if (entry.isDirectory()) {
				await visitDirectory(pkg, file);
				continue;
			}
			if (!/\.[cm]?tsx?$/.test(file)) continue;
			const source = ts.createSourceFile(
				file,
				await readFile(file, "utf8"),
				ts.ScriptTarget.Latest,
				true,
			);
			if (source.referencedFiles.length)
				errors.push(`${file}: triple-slash paths forbidden`);
			function walk(node) {
				if (
					(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
					node.moduleSpecifier
				) {
					inspectSpecifier(pkg, file, node.moduleSpecifier.text);
				}
				if (
					(ts.isIdentifier(node) && node.text === "getBuiltinModule") ||
					(ts.isElementAccessExpression(node) &&
						ts.isStringLiteral(node.argumentExpression) &&
						node.argumentExpression.text === "getBuiltinModule")
				)
					errors.push(`${file}: CommonJS escape forbidden`);
				if (ts.isImportTypeNode(node)) {
					if (
						ts.isLiteralTypeNode(node.argument) &&
						ts.isStringLiteral(node.argument.literal)
					)
						inspectSpecifier(pkg, file, node.argument.literal.text);
					else errors.push(`${file}: nonliteral import type`);
				}
				if (ts.isImportEqualsDeclaration(node))
					errors.push(`${file}: import equals forbidden`);
				if (ts.isCallExpression(node)) {
					if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
						if (
							node.arguments.length === 1 &&
							ts.isStringLiteral(node.arguments[0])
						)
							inspectSpecifier(pkg, file, node.arguments[0].text);
						else errors.push(`${file}: nonliteral dynamic import forbidden`);
					}
					if (
						ts.isIdentifier(node.expression) &&
						node.expression.text === "require"
					)
						errors.push(`${file}: CommonJS escape forbidden`);
				}
				ts.forEachChild(node, walk);
			}
			walk(source);
		}
	}
	for (const pkg of packages) {
		for (const field of [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies",
		]) {
			for (const name of Object.keys(pkg.manifest[field] ?? {})) {
				if (
					policy[pkg.manifest.name]?.extension &&
					forbiddenExtensionDependency(name)
				)
					errors.push(
						`${pkg.manifest.name}: forbidden dependency ${name}; use ${extensionEntry(name)}`,
					);
				if (
					Object.hasOwn(policy, name) &&
					name !== pkg.manifest.name &&
					!policy[pkg.manifest.name]?.[name] &&
					!(
						field === "devDependencies" &&
						policy[pkg.manifest.name]?.testOnly?.[name]
					)
				)
					errors.push(`${pkg.manifest.name}: forbidden dependency ${name}`);
			}
		}
		for await (const file of glob("**/*.{test,spec}.*", {
			cwd: pkg.directory,
			exclude: ["dist/**", "node_modules/**"],
		})) {
			if (!/^test\/(?:.*\/)?[^/]+\.test\.ts$/.test(file))
				errors.push(
					`${path.relative(root, pkg.directory)}/${file}: tests must live in <pkg>/test/**/*.test.ts`,
				);
		}
		for (const value of Object.values(pkg.manifest.exports ?? {})) {
			for (const target of Object.values(
				typeof value === "string" ? { default: value } : value,
			)) {
				if (!target.startsWith("./dist/") || target.includes("*"))
					errors.push(`${pkg.manifest.name}: invalid export target ${target}`);
			}
		}
		for (const dir of ["src", "test"]) {
			try {
				await visitDirectory(pkg, path.join(pkg.directory, dir));
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
		}
	}
	return errors;
}
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const errors = await check(process.cwd());
	if (errors.length) {
		console.error(errors.join("\n"));
		process.exitCode = 1;
	} else console.log("workspace import boundaries: pass");
}
