// The pure rule for a path retained source can represent, shared by Effects, Sandboxes and Kernel.
export function validatePath(path: string): void {
	const parts = path.split("/");
	if (
		parts.length > 64 ||
		Buffer.byteLength(path) > 4096 ||
		path.normalize("NFC") !== path ||
		!Buffer.from(path).equals(Buffer.from(path, "utf8"))
	)
		throw new Error(`Unsupported source name representation: ${JSON.stringify(path)}`);
	for (const part of parts)
		if (
			!part ||
			part === "." ||
			part === ".." ||
			/[\0\\:]/.test(part) ||
			/[. ]$/.test(part) ||
			part.toLowerCase() === ".git" ||
			/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) ||
			Buffer.byteLength(part) > 255
		)
			throw new Error(`Invalid/reserved source name: ${JSON.stringify(path)}`);
}
