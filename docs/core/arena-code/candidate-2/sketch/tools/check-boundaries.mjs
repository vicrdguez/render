import { readdir, readFile, realpath } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Build tooling, not Tau runtime. No lint suppression can bypass this check.
export async function check(root) {
	const policy = JSON.parse(
		await readFile(path.join(root, "boundaries.json"), "utf8"),
	);
	const packages = [];
	const errors = [];
	for (const entry of await readdir(path.join(root, "packages"), {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory()) continue;
		const directory = await realpath(path.join(root, "packages", entry.name));
		const manifest = JSON.parse(
			await readFile(path.join(directory, "package.json"), "utf8"),
		);
		packages.push({ directory, manifest });
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
	function inspectSpecifier(pkg, file, spec) {
		const label = `${path.relative(root, file)}: ${spec}`;
		if (
			spec.startsWith(".") ||
			path.isAbsolute(spec) ||
			spec.startsWith("file:")
		) {
			if (!spec.startsWith(".")) {
				errors.push(`${label}: absolute/file imports forbidden`);
				return;
			}
			const target = path.resolve(path.dirname(file), spec);
			if (!target.startsWith(pkg.directory + path.sep))
				errors.push(`${label}: cross-package relative import`);
			return;
		}
		if (builtins.has(spec)) return;
		const name = spec.startsWith("@")
			? spec.split("/").slice(0, 2).join("/")
			: spec.split("/")[0];
		const subpath = spec === name ? "." : `.${spec.slice(name.length)}`;
		const target = byName.get(name);
		if (target) {
			if (
				pkg !== target &&
				!policy[pkg.manifest.name]?.[name]?.includes(subpath)
			) {
				errors.push(`${label}: forbidden workspace capability`);
			}
			if (!Object.hasOwn(target.manifest.exports ?? {}, subpath))
				errors.push(`${label}: not an exported subpath`);
		} else if (!Object.hasOwn(pkg.manifest.dependencies ?? {}, name)) {
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
						["require", "createRequire"].includes(node.expression.text)
					)
						errors.push(`${file}: CommonJS escape forbidden`);
				}
				ts.forEachChild(node, walk);
			}
			walk(source);
		}
	}
	for (const pkg of packages) {
		for (const name of Object.keys(pkg.manifest.dependencies ?? {})) {
			if (
				byName.has(name) &&
				name !== pkg.manifest.name &&
				!policy[pkg.manifest.name]?.[name]
			)
				errors.push(`${pkg.manifest.name}: forbidden dependency ${name}`);
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
