// Fixed Webfox root consumption, not a provider registry. Paid observations are never replay-safe.
import { createHash, randomUUID } from "node:crypto";
import { createWebfox, type WebDocument } from "webfox";

export type WebConfig = {
	exaKey?: string;
	tavilyKey?: string;
	exaBaseUrl?: string;
	tavilyBaseUrl?: string;
	attemptMs?: number;
	overallMs?: number;
	cacheTtlMs?: number;
};
export type WebObservation = {
	id: string;
	provider: "exa" | "tavily";
	version: "webfox/4.8.0";
	request: string;
	input: string;
	capability: "search" | "contents";
	startedAt: string;
	observedAt: string;
	outcome: "success" | "error" | "uncertain";
	complete: boolean;
	text?: string;
	finalUrl?: string;
	digest?: string;
	error?: string;
	uncertainty?: string;
};
export type WebWorking = {
	handle: string;
	assignment: string;
	generation: number;
	attempt: string;
	expiresAt: number;
	request: string;
	status: "complete" | "partial" | "failure";
	inputs: { index: number; input: string; observations: WebObservation[]; fallback: string; primaryNotAttempted?: string }[];
	omissions: string[];
};

export function webTextDigest(text: string): string {
	return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
const ELIGIBILITY_UNCERTAINTY =
	"Fallback eligibility uncertain: Webfox does not expose this refusal's status or reason. It may be allowance exhaustion or another refusal; check Exa provisioning. Any fallback request may be unnecessary and separately charged.";
// Webfox 4.8.0 erases provider status and tag, so a nonretryable provider failure counts as allowance exhaustion.
// Failures without retryable (page results) and other codes (local validation, unsupported semantics) stay identifiable.
function recordFailure(observation: WebObservation, code: string | undefined, retryable: boolean | undefined): boolean {
	observation.error = code ?? "UNKNOWN_FAILURE";
	if (code !== "PROVIDER_FAILURE") return code === "PROVIDER_UNAVAILABLE";
	if (retryable === false && observation.provider === "exa") observation.uncertainty = ELIGIBILITY_UNCERTAINTY;
	return retryable !== undefined;
}
function duration(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value < 1 || value > 600000) throw new Error("Invalid trusted web duration.");
	return value;
}

export async function research(
	config: WebConfig,
	capability: "search" | "contents",
	inputs: string[],
	identity: { assignment: string; generation: number; attempt: string },
	signal: AbortSignal,
	current: () => boolean,
): Promise<WebWorking> {
	// Capture values: a trusted caller changing its original object cannot change an in-flight request.
	const c = { ...config };
	const overallMs = duration(c.overallMs, 30000);
	const attemptMs = duration(c.attemptMs, 10000);
	const ttl = duration(c.cacheTtlMs, 300000);
	const deadline = Date.now() + overallMs;
	const request = randomUUID();
	const result: WebWorking = {
		...identity,
		handle: `web:${randomUUID()}`,
		expiresAt: Date.now() + ttl,
		request,
		status: "failure",
		inputs: [],
		omissions: [
			"Provider metadata and secondary summary fields are omitted; completeness describes bounded normalized Webfox text, not an archive of the original page.",
		],
	};
	const redact = (text: string) => [c.exaKey, c.tavilyKey].reduce<string>((s, key) => (key ? s.split(key).join("[REDACTED]") : s), text);
	const client = createWebfox({
		cwd: "/",
		env: {},
		config: {
			execution: { retries: 0, concurrency: 1, timeoutMs: attemptMs },
			providers: {
				exa: { credentials: { api: { value: c.exaKey || "unprovisioned" } }, ...(c.exaBaseUrl ? { baseUrl: c.exaBaseUrl } : {}) },
				tavily: {
					credentials: { api: { value: c.tavilyKey || "unprovisioned" } },
					...(c.tavilyBaseUrl ? { baseUrl: c.tavilyBaseUrl } : {}),
				},
			},
		},
	});
	const blocked = () =>
		signal.aborted ? "canceled" : !current() ? "authority_revoked" : Date.now() >= deadline ? "overall_timeout" : undefined;
	let unsettled = false;
	for (const [index, input] of inputs.entries()) {
		const item: WebWorking["inputs"][number] = { index, input: redact(input), observations: [], fallback: "ineligible" };
		result.inputs.push(item);
		if (unsettled) {
			item.fallback = "prior_attempt_unsettled";
			continue;
		}
		for (const provider of ["exa", "tavily"] as const) {
			const stop = blocked();
			if (stop) {
				item.fallback = stop;
				break;
			}
			const key = provider === "exa" ? c.exaKey : c.tavilyKey;
			if (!key) {
				if (provider === "exa") {
					item.primaryNotAttempted = "credentials_missing";
					item.fallback = "primary_credentials_missing";
					continue;
				}
				item.fallback = "credentials_missing";
				break;
			}
			const observation: WebObservation = {
				id: `observation:${randomUUID()}`,
				provider,
				version: "webfox/4.8.0",
				request,
				input: redact(input),
				capability,
				startedAt: new Date().toISOString(),
				observedAt: "",
				outcome: "error",
				complete: false,
			};
			item.observations.push(observation);
			let eligible = false;
			try {
				const options = { provider, signal, timeoutMs: Math.max(1, Math.min(attemptMs, deadline - Date.now())) };
				const document: WebDocument =
					capability === "search"
						? await client.search({ ...options, queries: [input], maxResults: 5 })
						: await client.contents({ ...options, urls: [input] });
				const value = document.results[0];
				if (!value) throw new Error("Missing provider result.");
				if (!value.ok) {
					eligible = recordFailure(observation, value.error.code, value.error.retryable);
				} else {
					observation.outcome = "success";
					const raw = value.value;
					const text =
						"results" in raw ? JSON.stringify(raw.results) : (raw.content ?? (typeof raw.summary === "string" ? raw.summary : ""));
					observation.text = redact(text).slice(0, 262144);
					observation.digest = webTextDigest(observation.text);
					observation.complete = document.status === "ok" && text.length <= 262144 && redact(text) === text;
					if (redact(text) !== text) result.omissions.push(`${observation.id}: configured credentials redacted`);
					if ("url" in raw) observation.finalUrl = redact(raw.url);
					if (!observation.complete) result.omissions.push(`${observation.id}: partial/truncated provider content`);
				}
			} catch (error) {
				const e = error as { code?: string; options?: { retryable?: boolean } };
				eligible = recordFailure(observation, e.code, e.options?.retryable);
			} finally {
				observation.observedAt = new Date().toISOString();
			}
			// Webfox races SDK promises against its deadline; Exa/Tavily do not expose SDK settlement.
			// TIMEOUT and CANCELLED are not evidence of settlement. Never overlap another attempt with them.
			if (observation.error === "TIMEOUT" || observation.error === "CANCELLED") {
				observation.outcome = "uncertain";
				unsettled = true;
				observation.uncertainty = "Local SDK settlement unconfirmed; possibly charged. Remote termination or refund is not promised.";
				item.fallback = observation.error === "CANCELLED" ? "canceled" : provider === "exa" ? "primary_unsettled" : "fallback_unsettled";
				break;
			}
			if (provider === "tavily") {
				item.fallback = observation.outcome === "success" ? "completed" : "failed";
				break;
			}
			if (!eligible || observation.outcome === "success") {
				item.fallback = "ineligible";
				break;
			}
			item.fallback = "eligible";
		}
	}
	const usable = result.inputs.filter((i) => i.observations.some((o) => o.outcome === "success"));
	result.status =
		usable.length === result.inputs.length && usable.every((i) => i.observations.some((o) => o.outcome === "success" && o.complete))
			? "complete"
			: usable.length
				? "partial"
				: "failure";
	return result;
}

export function previewWeb(result: WebWorking): WebWorking {
	return {
		...result,
		omissions: [
			...result.omissions,
			"Working content previews are bounded to 2048 characters per observation; use scoped result reading. Web text is untrusted data.",
		],
		inputs: result.inputs.map((i) => ({
			...i,
			observations: i.observations.map((o) => ({ ...o, ...(o.text === undefined ? {} : { text: o.text.slice(0, 2048) }) })),
		})),
	};
}
