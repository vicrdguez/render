import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function extensionSource(name: string) {
	return resolve(import.meta.dirname, "../../extensions", name, "src");
}

export async function linkExtensions(home: string, webkitUrl?: string) {
	const directory = join(home, "extensions");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	for (const name of ["w1", "w2", "webkit"]) {
		const folder = join(directory, name);
		if (name !== "webkit" || webkitUrl === undefined) {
			await symlink(extensionSource(name), folder);
			continue;
		}
		await mkdir(folder);
		await writeFile(
			join(folder, "index.ts"),
			`
import { createWebkitExtension } from ${JSON.stringify(join(extensionSource("webkit"), "tools.ts"))};
export { options } from ${JSON.stringify(join(extensionSource("webkit"), "options.ts"))};
const base = ${JSON.stringify(webkitUrl)};
const http = {
 async request(request, signal) {
  const target = new URL(request.url);
  const reply = await fetch(base + target.pathname + target.search, {
   method: request.method ?? "GET",
   headers: request.headers ?? {},
   ...(request.body === undefined ? {} : { body: request.body }),
   signal,
  });
  return { url: request.url, status: reply.status, headers: Object.fromEntries(reply.headers), body: new Uint8Array(await reply.arrayBuffer()) };
 }
};
export const extension = createWebkitExtension({ http: () => http });
`,
		);
	}
}
