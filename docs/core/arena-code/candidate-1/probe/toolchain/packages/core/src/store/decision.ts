import type { Tx } from "@earendil-works/pi-durable";
import { defineDoc } from "@earendil-works/pi-durable";

export type Decision = { readonly id: string; readonly subject: string; readonly status: "open" | "answered" };

const OpenList = defineDoc<{ [subject: string]: string }>({
	kind: "tau.open",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});

export async function request(tx: Tx, subject: string): Promise<Decision> {
	const open = await tx.doc(OpenList);
	const id = `${subject}#1`;
	open[subject] = id;
	return { id, subject, status: "open" };
}

export async function openSubjects(tx: Tx): Promise<string[]> {
	return Object.keys(await tx.doc(OpenList));
}

/** Host only. Not re-exported from the package entry. */
export async function answer(tx: Tx, subject: string): Promise<Decision | undefined> {
	const open = await tx.doc(OpenList);
	const id = open[subject];
	if (id === undefined) return undefined;
	delete open[subject];
	return { id, subject, status: "answered" };
}
