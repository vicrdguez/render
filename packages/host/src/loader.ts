import type { ExtensionSource } from "./extensions.js";

export function fromDirectory(_directory: string): ExtensionSource {
	return () => ({ modules: {}, failures: [] });
}
