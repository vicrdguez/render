import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { classify, webHttpFixture as fixture, roleWebJourney } from "./support/web-http.ts";

test("B1/B3 empty success is final; provider refusal falls back once with distinct provenance", async () => {
	const http = await fixture((path, body) => {
		if (path.startsWith("/exa")) return body.query === "empty" ? { body: { results: [] } } : { status: 429, body: { error: "allowance" } };
		return {
			body: {
				images: [],
				results: [{ title: "Negative finding", url: "https://example.org/negative", content: "No support for the claim." }],
			},
		};
	});
	const web = {
		exaKey: "fixture-exa-secret",
		tavilyKey: "fixture-tavily-secret",
		exaBaseUrl: `${http.url}/exa`,
		tavilyBaseUrl: `${http.url}/tavily`,
	};
	try {
		const { f, reply, output } = await roleWebJourney(web, "web_search", { queries: ["empty", "bounded"] });
		try {
			assert.deepEqual(
				http.calls.map((c) => c.path),
				["/exa/search", "/exa/search", "/tavily/search"],
				"no provider fanout or retry",
			);
			assert.deepEqual(
				reply.inputs.map((x) => x.input),
				["empty", "bounded"],
			);
			assert.deepEqual(
				reply.inputs[0]!.observations.map((o) => o.provider),
				["exa"],
			);
			assert.deepEqual(
				reply.inputs[1]!.observations.map((o) => [o.provider, o.outcome]),
				[
					["exa", "error"],
					["tavily", "success"],
				],
				"primary failure must survive fallback",
			);
			assert.equal(reply.inputs[1]!.observations[0]!.uncertainty, undefined, "a retryable failure has known eligibility");
			assert.match(output, /No support for the claim/);
			assert.doesNotMatch(output, /fixture-exa-secret|fixture-tavily-secret|\/tmp\//);
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

// One request per status at the supported root: registered-tool wiring and provenance are covered by the journeys around this.
test("B1/B3 missing fallback key is explicit; only nonretryable refusals carry eligibility uncertainty", async () => {
	for (const status of [400, 401, 403, 404, 418, 503]) {
		const http = await fixture(() => ({ status, body: { error: "failure" } }));
		try {
			const reply = await classify({ exaKey: "fixture", exaBaseUrl: http.url }, "search", ["failure"]);
			assert.equal(http.calls.length, 1, "no transport retries");
			assert.equal(reply.inputs[0]!.observations.length, 1);
			assert.equal(reply.inputs[0]!.fallback, "credentials_missing");
			if (status === 503) assert.equal(reply.inputs[0]!.observations[0]!.uncertainty, undefined);
			else assert.match(reply.inputs[0]!.observations[0]!.uncertainty!, /Fallback eligibility uncertain/);
		} finally {
			await http.close();
		}
	}
});

const INDISTINGUISHABLE_REFUSALS = [
	{ name: "documented allowance exhaustion", status: 402, error: "Credits are exhausted", tag: "NO_MORE_CREDITS" },
	{ name: "erased upstream invalid request", status: 400, error: "Request rejected", tag: "INVALID_REQUEST_BODY" },
];
for (const refusal of INDISTINGUISHABLE_REFUSALS)
	for (const capability of ["search", "contents"] as const)
		test(`B1 ${refusal.name} admits one uncertain sequential fallback for ${capability}`, async () => {
			const http = await fixture((path) => {
				if (path.startsWith("/exa")) return { status: refusal.status, body: { error: refusal.error, tag: refusal.tag } };
				return capability === "search"
					? { body: { images: [], results: [{ url: "https://example.org/page", content: "Fallback evidence." }] } }
					: { body: { results: [{ url: "https://example.org/page", raw_content: "Fallback evidence." }], failed_results: [] } };
			});
			try {
				const reply = await classify(
					{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
					capability,
					capability === "search" ? ["refused"] : ["https://example.org/page"],
				);
				assert.deepEqual(
					http.calls.map((c) => c.path),
					capability === "search" ? ["/exa/search", "/tavily/search"] : ["/exa/contents", "/tavily/extract"],
					"an indistinguishable refusal must admit exactly one sequential fallback",
				);
				const [exa, tavily] = reply.inputs[0]!.observations;
				assert.deepEqual(
					[
						[exa!.provider, exa!.outcome, exa!.error],
						[tavily!.provider, tavily!.outcome, tavily!.error],
					],
					[
						["exa", "error", "PROVIDER_FAILURE"],
						["tavily", "success", undefined],
					],
				);
				assert.equal(reply.inputs[0]!.fallback, "completed");
				assert.match(exa!.uncertainty ?? "", /Fallback eligibility uncertain/, "ambiguous fallback must report uncertain eligibility");
				assert.doesNotMatch(exa!.uncertainty!, /\b40[02]\b/, "the underlying status is not known");
				assert.doesNotMatch(JSON.stringify(exa), /NO_MORE_CREDITS|INVALID_REQUEST_BODY|Credits are exhausted|Request rejected/);
				assert.equal(tavily!.uncertainty, undefined);
				assert.match(tavily!.text ?? "", /Fallback evidence/);
			} finally {
				await http.close();
			}
		});

test("B1/B3 refused fallback after an uncertain refusal ends the input with no third attempt", async () => {
	const http = await fixture(() => ({ status: 402, body: { error: "Credits are exhausted", tag: "NO_MORE_CREDITS" } }));
	try {
		const reply = await classify(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"search",
			["refused"],
		);
		assert.deepEqual(
			http.calls.map((c) => c.path),
			["/exa/search", "/tavily/search"],
		);
		const [exa, tavily] = reply.inputs[0]!.observations;
		assert.deepEqual(
			[
				[exa!.provider, exa!.outcome],
				[tavily!.provider, tavily!.outcome],
			],
			[
				["exa", "error"],
				["tavily", "error"],
			],
		);
		assert.equal(reply.inputs[0]!.fallback, "failed");
		assert.equal(tavily!.uncertainty, undefined, "fallback eligibility is a claim about the primary only");
	} finally {
		await http.close();
	}
});

test("B1 identifiable page failure admits no fallback", async () => {
	const url = "https://example.org/page";
	const http = await fixture((path) =>
		path.startsWith("/exa")
			? { body: { results: [], statuses: [{ id: url, status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } }] } }
			: { body: { results: [{ url, raw_content: "Unauthorized fallback." }], failed_results: [] } },
	);
	try {
		const reply = await classify(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"contents",
			[url],
		);
		assert.deepEqual(
			http.calls.map((c) => c.path),
			["/exa/contents"],
			"identifiable page failure must not admit fallback",
		);
		assert.equal(reply.inputs[0]!.fallback, "ineligible");
		assert.equal(reply.inputs[0]!.observations[0]!.error, "PROVIDER_FAILURE");
		assert.equal(reply.inputs[0]!.observations[0]!.uncertainty, undefined);
	} finally {
		await http.close();
	}
});

test("B1 input Webfox rejects locally admits no fallback and contacts no provider", async () => {
	const http = await fixture(() => ({ body: { results: [] } }));
	try {
		const result = await classify(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"contents",
			["file:///private/example"],
		);
		assert.equal(http.calls.length, 0);
		assert.equal(result.inputs[0]!.fallback, "ineligible");
		assert.deepEqual(
			result.inputs[0]!.observations.map((o) => [o.provider, o.outcome, o.error, o.uncertainty]),
			[["exa", "error", "INVALID_INPUT", undefined]],
		);
	} finally {
		await http.close();
	}
});

for (const overallMs of [40, 500])
	test(`B2 unsettled local timeout is uncertain and does not admit fallback (${overallMs}ms overall)`, async () => {
		const http = await fixture(async () => {
			await setTimeout(200);
			return { body: { results: [] } };
		});
		try {
			const reply = await classify(
				{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: http.url, tavilyBaseUrl: http.url, attemptMs: 50, overallMs },
				"search",
				["slow", "later"],
			);
			assert.equal(http.calls.length, 1, "no overlapping or repeated charged request");
			assert.equal(reply.inputs[0]!.fallback, "primary_unsettled");
			assert.equal(reply.inputs[0]!.observations[0]!.outcome, "uncertain");
			assert.equal(reply.inputs[1]!.observations.length, 0);
			assert.equal(reply.inputs[1]!.fallback, "prior_attempt_unsettled");
		} finally {
			await http.close();
		}
	});

for (const status of [429, 402])
	test(`B2 caller cancellation/current revocation before fallback admits no provider request (HTTP ${status})`, async () => {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses([fauxAssistantMessage(fauxToolCall("web_search", { queries: ["cancel"] }), { stopReason: "toolUse" })]);
		let f!: Awaited<ReturnType<typeof roleFixture>>;
		let stopped = false;
		const http = await fixture(async () => {
			if (stopped) return { status, body: { error: "refused" } };
			const assignments = (f.ledger.snapshot(admin) as unknown as { assignments: { id: string; generation: number; attempt: string }[] })
				.assignments;
			const a = assignments[0]!;
			const reply = await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
			assert.equal(reply.status, "accepted");
			stopped = true;
			return { status, body: { error: "refused" } };
		});
		try {
			f = await roleFixture(
				new Engine({
					provider: p.provider,
					apiKey: "fixture",
					families: { "claude-sonnet-4-6": "claude" },
					web: { exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: http.url, tavilyBaseUrl: http.url },
				}),
			);
			try {
				await f.command({ type: "assignTask", slice: "slice:cancel", delivery: true, packet: packet() });
				for (let n = 0; n < 500 && !stopped; n++) await setTimeout(10);
				assert.ok(stopped);
				await setTimeout(200);
				assert.equal(http.calls.length, 1, "fallback after cancellation is forbidden");
			} finally {
				await f.close();
			}
		} finally {
			await http.close();
		}
	});

test("B1/B3 mixed contents batch keeps partial success final and preserves both failures", async () => {
	const urls = [
		"https://example.org/success",
		"https://example.org/partial",
		"https://example.org/page-error",
		"https://example.org/allowance",
	];
	const http = await fixture((path, body) => {
		if (path.startsWith("/tavily")) return { status: 503, body: { error: "unavailable" } };
		const url = (body.urls as string[])[0]!;
		if (url.endsWith("page-error"))
			return { body: { results: [], statuses: [{ id: url, status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } }] } };
		if (url.endsWith("allowance")) return { status: 402, body: { error: "Credits are exhausted", tag: "NO_MORE_CREDITS" } };
		return { body: { results: [{ url, text: url.endsWith("partial") ? "x".repeat(262145) : "Exact usable content." }] } };
	});
	try {
		const { f, reply } = await roleWebJourney(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"web_contents",
			{ urls },
		);
		try {
			assert.deepEqual(
				http.calls.map((c) => c.path),
				["/exa/contents", "/exa/contents", "/exa/contents", "/exa/contents", "/tavily/extract"],
				"usable partial success must not be topped up",
			);
			assert.deepEqual(
				reply.inputs.map((i) => i.input),
				urls,
			);
			assert.equal(reply.status, "partial");
			assert.equal(reply.inputs[0]!.observations[0]!.complete, true);
			assert.equal(reply.inputs[1]!.observations[0]!.complete, false);
			assert.match(reply.omissions.join("\n"), /partial\/truncated/);
			assert.equal(reply.inputs[2]!.fallback, "ineligible");
			assert.deepEqual(
				reply.inputs[3]!.observations.map((o) => [o.provider, o.outcome]),
				[
					["exa", "error"],
					["tavily", "error"],
				],
			);
			assert.equal(reply.inputs[3]!.fallback, "failed");
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

for (const status of [429, 402])
	for (const remaining of [true, false])
		test(`B2 overall deadline checks settled primary before fallback (HTTP ${status}, remaining=${remaining})`, async (t) => {
			const epoch = Date.now();
			t.mock.timers.enable({ apis: ["Date"], now: epoch });
			const http = await fixture((path) => {
				if (path.startsWith("/exa")) {
					t.mock.timers.setTime(epoch + (remaining ? 100 : 1000));
					return { status, body: { error: "refused" } };
				}
				return { body: { images: [], results: [] } };
			});
			try {
				const reply = await classify(
					{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily`, overallMs: 1000 },
					"search",
					["deadline"],
				);
				assert.equal(http.calls.length, remaining ? 2 : 1, "overall expiry must prohibit fallback admission");
				assert.equal(reply.inputs[0]!.fallback, remaining ? "completed" : "overall_timeout");
			} finally {
				await http.close();
				t.mock.timers.reset();
			}
		});

test("B5 model cannot select host paths, configuration or arbitrary provider semantics", async () => {
	const http = await fixture(() => ({ body: { results: [] } }));
	try {
		for (const [property, value] of [
			["configPath", "/etc/passwd"],
			["provider", "custom"],
			["cwd", "/"],
		] as const) {
			const { f, output } = await roleWebJourney({ exaKey: "fixture", exaBaseUrl: http.url }, "web_search", {
				queries: ["safe"],
				[property]: value,
			});
			try {
				assert.match(
					output,
					new RegExp(`Validation failed[^]*${property}`),
					`tool validation must refuse the forbidden ${property} argument`,
				);
				assert.doesNotMatch(output, /"status":/, "a forbidden argument must not reach research");
			} finally {
				await f.close();
			}
		}
		assert.equal(http.calls.length, 0);
	} finally {
		await http.close();
	}
});
