// Structured content within existing Ground, packet and report revisions; no new authority/store.
export type Ground = {
	schema: 1;
	goal: string;
	constraints: string[];
	clarifications: string[];
	shape: { value: "investigation"; origin: "human" | "classifier"; confirmed: boolean };
	donePredicate: string;
};
export type Investigation = { ground: string; repository: string; commit: string; paths: string[] };
export type InvestigationOutcome = {
	schema: 1;
	outcome: "finding" | "escalation";
	summary: string;
	facts: { text: string; citations: { ref: string; path?: string }[] }[];
	uncertainties: string[];
	limits: string[];
	next: null | { playbook: "design" | "experiment" | "change" | "bug" | "performance"; reason: string; question: string };
};
function object(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}
function texts(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(text);
}
function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
export function readGround(content: string): Ground | undefined {
	const g = parse(content);
	if (
		!object(g) ||
		g.schema !== 1 ||
		!text(g.goal) ||
		!texts(g.constraints) ||
		!texts(g.clarifications) ||
		!text(g.donePredicate) ||
		!object(g.shape)
	)
		return;
	if (
		g.shape.value !== "investigation" ||
		!["human", "classifier"].includes(String(g.shape.origin)) ||
		typeof g.shape.confirmed !== "boolean"
	)
		return;
	return g as Ground;
}
export function shapeConfirmed(ground: Ground): boolean {
	return !(ground.shape.origin === "classifier" && !ground.shape.confirmed);
}
export const SHAPES = ["investigation", "bug", "performance", "change", "design", "experiment"] as const;
export type GroundShape = { value: (typeof SHAPES)[number]; origin: "human" | "classifier"; confirmed: boolean };
/** The task shape of any Ground text, with its provenance; undefined when the text names none. */
export function groundShape(content: string): GroundShape | undefined {
	const g = parse(content);
	if (!object(g) || !object(g.shape)) return;
	const { value, origin, confirmed } = g.shape;
	if (!SHAPES.includes(value as GroundShape["value"]) || (origin !== "human" && origin !== "classifier") || typeof confirmed !== "boolean")
		return;
	return { value: value as GroundShape["value"], origin, confirmed };
}
/** A classifier-proposed shape the human has not confirmed. */
export function unconfirmedShape(content: string): boolean {
	const shape = groundShape(content);
	return shape?.origin === "classifier" && !shape.confirmed;
}
/** A Ground proposal with its shape confirmed: the bytes a human saves to accept it. */
export function confirmedGround(content: string): string {
	const g = parse(content) as Record<string, unknown> & { shape: Record<string, unknown> };
	return JSON.stringify({ ...g, shape: { ...g.shape, confirmed: true } });
}
export function readInvestigationOutcome(
	content: string,
	inputs: readonly string[],
	source: string | undefined,
	paths: readonly string[],
): InvestigationOutcome | undefined {
	const r = parse(content);
	if (
		!object(r) ||
		r.schema !== 1 ||
		!["finding", "escalation"].includes(String(r.outcome)) ||
		!text(r.summary) ||
		!texts(r.uncertainties) ||
		!texts(r.limits) ||
		!Array.isArray(r.facts) ||
		!r.facts.length ||
		!source
	)
		return;
	let sourceCited = false;
	for (const fact of r.facts) {
		if (!object(fact) || !text(fact.text) || !Array.isArray(fact.citations) || !fact.citations.length) return;
		for (const citation of fact.citations) {
			if (!object(citation) || !text(citation.ref)) return;
			if (citation.ref === source) {
				if (typeof citation.path !== "string" || !paths.includes(citation.path)) return;
				sourceCited = true;
			} else if (!inputs.includes(citation.ref) || citation.path !== undefined) return;
		}
	}
	if (!sourceCited) return;
	if (r.outcome === "finding" && r.next !== null) return;
	if (
		r.outcome === "escalation" &&
		(!object(r.next) ||
			!["design", "experiment", "change", "bug", "performance"].includes(String(r.next.playbook)) ||
			!text(r.next.reason) ||
			!text(r.next.question))
	)
		return;
	return r as InvestigationOutcome;
}
