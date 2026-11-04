// Unsafe controls: each applies one intended wrong behavior to a temporary copy of the source and requires the
// targeted check to fail on an assertion. A control that fails on import, syntax or setup does not count, and every
// targeted check must pass on the unmutated copy first.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

type Edit = { file: string; find: string; replace: string };
// `expect` is the assertion message the intended wrong behavior must produce; any other failure is not detection.
type Control = { name: string; edits: Edit[]; test: string; pattern: string; behavior: string; expect: RegExp };

const CONTROLS: Control[] = [
	{
		name: "implementation-same-pass-reaudit",
		expect: /no same-pass reaudit with a new command/,
		behavior: "open a second Audit invocation in the same implementation pass",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (pass.audit) return refusal("role_already_requested", "This pass already has its one Audit invocation.");',
				replace: "",
			},
		],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "paired Audit uses literal",
	},
	{
		name: "implementation-report-source-relabel",
		expect: /Audit must refuse mismatched report.*source/,
		behavior: "admit a reviewer report claiming a source other than its inspected A",
		edits: [
			{
				file: "src/kernel/implementation.ts",
				find: "!Object.entries(binding).every(([k, x]) => v[k] === x)",
				replace: '!Object.entries(binding).every(([k, x]) => k === "source" || v[k] === x)',
			},
		],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "Audit report refuses wrong",
	},
	{
		name: "implementation-wrong-pass-report",
		expect: /Audit must refuse mismatched report.*passRef/,
		behavior: "admit a report selecting an old pass instead of its host-assigned pass",
		edits: [
			{
				file: "src/kernel/implementation.ts",
				find: "!Object.entries(binding).every(([k, x]) => v[k] === x)",
				replace: '!Object.entries(binding).every(([k, x]) => k === "passRef" || v[k] === x)',
			},
		],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "Audit report refuses wrong",
	},
	{
		name: "implementation-pass-on-restart",
		expect: /restart is not a new implementation interval/,
		behavior: "increment the pass ordinal when replacing an Attempt after state reload",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "created.passRef = a.passRef;",
				replace: "created.passRef = a.passRef; work.passes!.find(p => p.ref === a.passRef)!.ordinal++;",
			},
		],
		test: "test/implementation-pass.test.ts",
		pattern: "ordinary state reload",
	},
	{
		name: "implementation-generic-handoff",
		expect: /accepted implementation cannot bypass sealed handoff/,
		behavior: "close accepted implementation using a generic role report",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (a?.passRef)\n\t\t\treturn refusal("forbidden_scope", "Accepted implementation closes only through its sealed pass handoff, not a generic report.");',
				replace: "",
			},
		],
		test: "test/implementation-pass.test.ts",
		pattern: "generic report submission",
	},
	{
		name: "implementation-unpaired-audit",
		expect: /accepted implementation Audit must retain A and stage both fresh axes together/,
		behavior: "substitute a generic child role for the pass-bound paired Audit",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (a?.passRef) return refusal("forbidden_scope", "Accepted implementation requires its pass-bound paired Audit on retained source.");',
				replace: "",
			},
		],
		test: "test/implementation-pass.test.ts",
		pattern: "generic child request",
	},
	{
		name: "implementation-stop-original-only",
		expect: /scope stop must discover the latest runtime/,
		behavior: "stop only the original captured runtime, leaving the fresh writable runtime alive",
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: "executions.push(...last.executions);",
				replace: "executions.push(...last.executions); return { ...last, executions };",
			},
		],
		test: "test/implementation-capture.integration.ts",
		pattern: "reopening and stopping a scope",
	},
	{
		name: "candidate-delegated-advancement",
		expect: /delegated advancement must retain required candidate completion checks/,
		behavior: "advance a delegated checkpoint without required candidate completion",
		edits: [
			{
				file: "src/kernel/checkpoints.ts",
				find: "r.required.candidates &&",
				replace: 'r.required.candidates && c.type !== "advanceDelegatedCheckpoint" &&',
			},
		],
		test: "test/design-candidates.test.ts",
		pattern: "delegated routing retains required alternatives",
	},
	{
		name: "candidate-premature-synthesis",
		expect: /required alternatives must precede synthesis/,
		behavior: "stage a synthesis while required candidate assignments are missing",
		edits: [
			{ file: "src/kernel/checkpoints.ts", find: "if (!evidence ||", replace: "if (false && (!evidence ||" },
			{ file: "src/kernel/checkpoints.ts", find: "!cited.includes(child.report!)))", replace: "!cited.includes(child.report!))))" },
		],
		test: "test/design-candidates.test.ts",
		pattern: "human routing retains required alternatives",
	},
	{
		name: "candidate-foreign-artifact",
		expect: /foreign artifact must remain unreadable/,
		behavior: "disclose named foreign revisions to a candidate",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'if (principal.kind === "assignment-agent") {\n\t\t\t\tconst own = this.#roleWork.assignments.find',
				replace:
					'if (principal.kind === "assignment-agent" && principal.role !== "candidate") {\n\t\t\t\tconst own = this.#roleWork.assignments.find',
			},
		],
		test: "test/design-candidates.test.ts",
		pattern: "candidates receive own inputs",
	},
	{
		name: "intake-nonexecuted-behavior",
		expect: /non-executable exact catalog rows must not discharge behavior/,
		behavior: "map exact generated or human catalog evidence to a behavior obligation",
		edits: [{ file: "src/kernel/intake.ts", find: 'o.kind === "behavior" &&', replace: "false &&" }],
		test: "test/accepted-contracts.test.ts",
		pattern: "catalog row cannot discharge behavior",
	},
	{
		name: "intake-nonexecuted-rank",
		expect: /non-executable new evidence must not claim a proof rank/,
		behavior: "allow new generated or human evidence to claim proof ranks",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'if (check.rank !== null) return "Human/generated rows cannot claim proof ranks.";',
				replace: "",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "evidence cannot claim a proof rank",
	},
	{
		name: "intake-unbounded-change",
		expect: /matching change Ground must not waive the breakdown/,
		behavior: "stage a confirmed existing-seam change without its bounded breakdown",
		edits: [
			{ file: "src/kernel/intake.ts", find: 'if ((m.shape === "change" || m.shape === "design") && !m.breakdown)', replace: "if (false)" },
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "matching change Ground still requires",
	},
	{
		name: "intake-unapproved-source",
		expect: /retained source bytes must not substitute for human Ground approval/,
		behavior: "stage shortened intake using a source absent from human Ground approval",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'if (m.shape !== "design" && (!m.sources.length || m.sources.some((ref) => !approvedSources.includes(ref))))',
				replace: "if (false)",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "shortened intake sources require",
	},
	{
		name: "intake-unapproved-architecture",
		expect: /node-less architecture must not cite an unapproved source/,
		behavior: "allow a node-less architecture citation outside approved selected sources",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'return m.shape === "design" || !m.sources.includes(source.ref) || !approvedSources.includes(source.ref);',
				replace: "return false;",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "node-less architecture cites",
	},
	{
		name: "intake-retired-assignment",
		expect: /retired Contract must not become assignable even with its exact inputs/,
		behavior: "assign work against a superseded Slice with its retired Contract in inputs",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'if (s.status !== "accepted") return refused("contract_superseded", "Superseded work is not completed or assignable.");',
				replace: "",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "required Record stays blocked",
	},
	{
		name: "intake-stale-acceptance",
		expect: /edited intake cannot use stale fidelity/,
		behavior: "accept an intake despite unreviewed saved concerns",
		edits: [
			{ file: "src/kernel/intake.ts", find: "c.annotations !== d.annotations ||", replace: "false ||" },
			{ file: "src/kernel/intake.ts", find: "b.annotations !== d.annotations", replace: "false" },
			{ file: "src/kernel/intake.ts", find: "if (!mappedConcerns(work, d.manifest))", replace: "if (false)" },
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "only exact-basis human acceptance",
	},
	{
		name: "intake-release-thaws",
		expect: /release must not thaw consumed Contract/,
		behavior: "replace obligations after consumption and release",
		edits: [{ file: "src/kernel/intake.ts", find: 'if (c.type === "amendContract" && target!.everAssigned)', replace: "if (false)" }],
		test: "test/accepted-contracts.test.ts",
		pattern: "amendment before consumption succeeds",
	},
	{
		name: "intake-false-qualification",
		expect: /file or passing review cannot qualify Record/,
		behavior: "start a consumer without recorded qualifying Record integration",
		edits: [{ file: "src/kernel/intake.ts", find: "if (dependency)", replace: "if (false)" }],
		test: "test/accepted-contracts.test.ts",
		pattern: "required Record stays blocked",
	},
	{
		name: "settings-second-pending",
		expect: /second pending request must refuse/,
		behavior: "recapture pending routing through a new request",
		edits: [
			{
				file: "src/kernel/checkpoints.ts",
				find: 'if (work.requests.some((r) => r.stage === c.stage && r.status === "pending"))',
				replace: 'if (false && work.requests.some((r) => r.stage === c.stage && r.status === "pending"))',
			},
		],
		test: "test/checkpoint-authority.test.ts",
		pattern: "S11 V1",
	},
	{
		name: "settings-restart-overwrite",
		expect: /restart must not overwrite accepted settings/,
		behavior: "replay file over accepted client settings",
		edits: [
			{ file: "src/ledger/startup.ts", find: "if (settingsEmpty && existsSync(settingsFile))", replace: "if (existsSync(settingsFile))" },
		],
		test: "test/checkpoint-settings.test.ts",
		pattern: "S01 initial file",
	},
	{
		name: "settings-product-bypass",
		expect: /unresolved product or changed scope must block delegated advancement/,
		behavior: "ignore challenger unresolved product flags",
		edits: [{ file: "src/kernel/checkpoints.ts", find: "review.unresolvedProduct.length !== 0 ||", replace: "false ||" }],
		test: "test/editable-checkpoints.test.ts",
		pattern: "challenger unresolvedProduct",
	},
	{
		name: "settings-agent-human-approval",
		expect: /forbidden_principal/,
		behavior: "allow machine to use the human approval route",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: 'approveCheckpoint: { family: "human-decision", available: true }',
				replace: 'approveCheckpoint: { family: "role-work", available: true }',
			},
		],
		test: "test/editable-checkpoints.test.ts",
		pattern: "C16 machine principal",
	},
	{
		name: "checkpoint-edited-approval",
		expect: /edited draft must never be approvable/,
		behavior: "accept edited bytes without re-emission and exact review",
		edits: [{ file: "src/kernel/checkpoints.ts", find: "c.emission !== r.emission ||", replace: "false ||" }],
		test: "test/editable-checkpoints.test.ts",
		pattern: "saves preserve complete edits",
	},
	{
		name: "checkpoint-lost-concern",
		expect: /every acknowledged concern must survive/,
		behavior: "overwrite a concurrent acknowledged concern",
		edits: [{ file: "src/kernel/checkpoints.ts", find: "work.concerns.push(concern);", replace: "work.concerns = [concern];" }],
		test: "test/editable-checkpoints.test.ts",
		pattern: "saves preserve complete edits",
	},
	{
		name: "checkpoint-stale-review",
		expect: /stale challenge must not authorize changed emission/,
		behavior: "reuse old review after draft changes",
		edits: [
			{
				file: "src/kernel/checkpoints.ts",
				find: "basis.emission !== r!.emission || basis.manifest !== r!.manifest ||",
				replace: "false ||",
			},
		],
		test: "test/editable-checkpoints.test.ts",
		pattern: "exact review and configured family",
	},
	{
		name: "investigation-automatic-shape-consent",
		expect: /unconfirmed classifier shape must not become consent/,
		behavior: "an unconfirmed classifier suggestion authorizes investigation",
		edits: [
			{ file: "src/kernel/investigation.ts", find: 'ground.shape.origin === "classifier" && !ground.shape.confirmed', replace: "false" },
		],
		test: "test/ground-investigation.test.ts",
		pattern: "Kernel distinguishes",
	},
	{
		name: "investigation-delivery-work",
		expect: /investigation must not create delivery work/,
		behavior: "Ground creates a delivery owner without a Contract",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "if (c.delivery && c.packet.investigation)",
				replace: "if (false && c.delivery && c.packet.investigation)",
			},
		],
		test: "test/ground-investigation.test.ts",
		pattern: "Ground cannot authorize",
	},
	{
		name: "investigation-uncited-result",
		expect: /uncited or out-of-scope finding must not settle/,
		behavior: "an uncited model assertion settles investigation",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "if (a.packet.investigation && !outcome)",
				replace: "if (false && a.packet.investigation && !outcome)",
			},
		],
		test: "test/ground-investigation.test.ts",
		pattern: "uncited, foreign",
	},
	{
		name: "catalog-discovery-proof",
		expect: /non-executable evidence must not qualify as behavioral proof/,
		behavior: "silently omit generated discovery from required behavioral coverage",
		edits: [
			{
				file: "src/kernel/verification.ts",
				find: "for (const name of requiredCatalogRows(selection)) {",
				replace:
					'for (const name of requiredCatalogRows(selection).filter(name => receipt.catalog.rows.find(r => r.name === name)?.kind !== "generated")) {',
			},
		],
		test: "test/verification-catalog.integration.ts",
		pattern: "discover cannot discharge",
	},
	{
		name: "catalog-old-source-proof",
		expect: /old-source receipts cannot satisfy current completion/,
		behavior: "accept a previous exact source receipt on a new commit with the same tree",
		edits: [
			{
				file: "src/kernel/verification.ts",
				find: '["repository", "commit", "path", "digest", "contract"]',
				replace: '["repository", "path", "digest", "contract"]',
			},
			{ file: "src/kernel/verification.ts", find: "receipt.verification.inputCommit !== selection.commit ||", replace: "false ||" },
		],
		test: "test/verification-catalog.integration.ts",
		pattern: "catalog Linux results require assessment",
	},
	{
		name: "catalog-old-verifier-proof",
		expect: /Missing expected rejection/,
		behavior: "render a catalog under a different verifier digest",
		edits: [{ file: "src/engine/catalog.ts", find: "if (selected.digest !== selection.digest)", replace: "if (false)" }],
		test: "test/verification-catalog.test.ts",
		pattern: "catalog refuses old verifier",
	},
	...[
		{
			name: "inherited-noncandidate-packet",
			clause: 'input.data.document.startsWith("role-packet/")',
			pattern: "watchdog cannot inherit earlier watchdog packet",
		},
		{
			name: "inherited-candidate-report",
			clause: 'owner?.packet.role === "candidate"',
			pattern: "watchdog cannot inherit earlier candidate report",
		},
		{
			name: "inherited-experiment-candidate-report",
			clause: 'owner?.packet.role === "experiment-candidate"',
			pattern: "watchdog cannot inherit earlier experiment-candidate report",
		},
	].map(
		({ name, clause, pattern }): Control => ({
			name,
			expect: /"status":"accepted"/,
			behavior: pattern.replace("cannot inherit", "inherits"),
			edits: [{ file: "src/ledger/ledger.ts", find: clause, replace: "false" }],
			test: "test/context-continuation-independence.test.ts",
			pattern,
		}),
	),
	{
		name: "inherited-private-context",
		expect: /"status":"accepted"/,
		behavior: "an independent role inherits a candidate-private packet",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'if (input.data.roleBinding && packet.role !== "coordinator" && packet.role !== "implementer")',
				replace: 'if (false && input.data.roleBinding && packet.role !== "coordinator" && packet.role !== "implementer")',
			},
		],
		test: "test/context-continuation-independence.test.ts",
		pattern: "candidate cannot inherit",
	},
	{
		name: "adopt-back-revives-basis",
		expect: /strictly unequal/,
		behavior: "adopting the initial policy revives its original prepared binding",
		edits: [
			{
				file: "src/kernel/policy.ts",
				find: "const revision = `policy-binding:${facts.sequence}`;",
				replace: 'const revision = c.revision === "policy:initial" ? "policy-binding:2" : `policy-binding:${facts.sequence}`;',
			},
		],
		test: "test/policy-adoption.test.ts",
		pattern: "old pending basis",
	},
	{
		name: "policy-resets-review-count",
		expect: /completed review count must never reset/,
		behavior: "policy adoption deletes completed Watchdog history/count",
		edits: [
			{
				file: "src/kernel/policy.ts",
				find: "const work = structuredClone(state.roleWork ?? { assignments: [] });",
				replace:
					'const work = structuredClone(state.roleWork ?? { assignments: [] }); work.assignments = work.assignments.filter(a => a.status !== "submitted");',
			},
		],
		test: "test/policy-adoption.test.ts",
		pattern: "completed Watchdog",
	},
	{
		name: "web-page-failure-fallback",
		expect: /identifiable page failure must not admit fallback/,
		behavior: "Engine admits fallback for every provider failure, including identifiable page failures",
		edits: [{ file: "src/engine/web.ts", find: "return retryable !== undefined;", replace: "return true;" }],
		test: "test/scoped-web-research.test.ts",
		pattern: "identifiable page failure",
	},
	{
		name: "web-allowance-refusal",
		expect: /an indistinguishable refusal must admit exactly one sequential fallback/,
		behavior: "Engine refuses fallback for a refusal indistinguishable from allowance exhaustion",
		edits: [{ file: "src/engine/web.ts", find: "return retryable !== undefined;", replace: "return retryable === true;" }],
		test: "test/scoped-web-research.test.ts",
		pattern: "documented allowance exhaustion",
	},
	{
		name: "web-eligibility-uncertainty-erased",
		expect: /ambiguous fallback must report uncertain eligibility/,
		behavior: "Engine reports an indistinguishable refusal as ordinary eligible fallback",
		edits: [
			{
				file: "src/engine/web.ts",
				find: 'if (retryable === false && observation.provider === "exa") observation.uncertainty = ELIGIBILITY_UNCERTAINTY;',
				replace: "",
			},
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "documented allowance exhaustion",
	},
	{
		name: "web-cancel-uncertainty",
		expect: /in-flight cancellation must retain possibly-charged uncertainty/,
		behavior: "Engine labels an unsettled cancelled SDK call as a plain error",
		edits: [
			{
				file: "src/engine/web.ts",
				find: 'observation.error === "TIMEOUT" || observation.error === "CANCELLED"',
				replace: 'observation.error === "TIMEOUT"',
			},
		],
		test: "test/web-cancellation-outcome.test.ts",
		pattern: "in-flight",
	},
	{
		name: "web-omitted-declaration",
		expect: /omitted declaration must not authorize report reliance/,
		behavior: "Kernel silently treats an omitted declaration as no web reliance",
		edits: [
			{ file: "src/kernel/roles.ts", find: "if (!Array.isArray(c.supports))", replace: "if (false)" },
			{ file: "src/kernel/roles.ts", find: "if (c.supports.some(", replace: "c.supports ??= []; if (c.supports.some(" },
		],
		test: "test/web-report-declaration.test.ts",
		pattern: "Kernel requires",
	},
	{
		name: "web-damaged-support",
		expect: /damaged required support must block reliance/,
		behavior: "Ledger accepts required evidence without verifying retained bytes",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'if (!entry || entry.data.schema !== 1 || !intact(entry.data.text, entry.data.digest, entry.data.byteLength))\n\t\t\t\t\tthrow new Abort({\n\t\t\t\t\t\tstatus: "refused",\n\t\t\t\t\t\tcode: "content_corrupt",',
				replace: 'if (false)\n\t\t\t\t\tthrow new Abort({\n\t\t\t\t\t\tstatus: "refused",\n\t\t\t\t\t\tcode: "content_corrupt",',
			},
		],
		test: "test/web-evidence-retention.test.ts",
		pattern: "required corrupt support",
	},
	{
		name: "web-expired-deadline",
		expect: /overall expiry must prohibit fallback admission/,
		behavior: "Engine admits fallback after the overall deadline",
		edits: [
			{ file: "src/engine/web.ts", find: 'Date.now() >= deadline ? "overall_timeout" : undefined', replace: "undefined" },
			{ file: "src/engine/web.ts", find: "Math.max(1, Math.min(attemptMs, deadline - Date.now()))", replace: "attemptMs" },
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "remaining=false",
	},
	{
		name: "web-partial-top-up",
		expect: /usable partial success must not be topped up/,
		behavior: "Engine tops up usable partial primary content",
		edits: [
			{
				file: "src/engine/web.ts",
				find: 'if (!eligible || observation.outcome === "success") {',
				replace: 'if ((!eligible || observation.outcome === "success") && !(observation.outcome === "success" && !observation.complete)) {',
			},
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "mixed contents batch",
	},
	{
		name: "web-quality-top-up",
		expect: /no provider fanout or retry/,
		behavior: "Tavily tops up successful primary inputs",
		edits: [{ file: "src/engine/web.ts", find: 'if (!eligible || observation.outcome === "success") {', replace: "if (false) {" }],
		test: "test/scoped-web-research.test.ts",
		pattern: "empty success",
	},
	{
		name: "web-erased-primary-failure",
		expect: /primary failure must survive fallback/,
		behavior: "fallback erases primary failure provenance",
		edits: [
			{
				file: "src/engine/web.ts",
				find: "item.observations.push(observation);",
				replace: 'if (provider === "tavily") item.observations = []; item.observations.push(observation);',
			},
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "empty success",
	},
	{
		name: "web-digest-observation",
		expect: /observation identity must not be a digest/,
		behavior: "identical bytes reuse an observation identity",
		edits: [
			{
				file: "src/engine/web.ts",
				find: "observation.digest = webTextDigest(observation.text);",
				replace: "observation.digest = webTextDigest(observation.text); observation.id = observation.digest;",
			},
		],
		test: "test/web-evidence-retention.test.ts",
		pattern: "identical bytes",
	},
	{
		name: "web-cache-erases-evidence",
		expect: /retained evidence remains available independently of working cache/,
		behavior: "working cache cleanup makes retained evidence unavailable",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "const data = entry.data as unknown as RevisionData;",
				replace:
					'const data = entry.data as unknown as RevisionData; if (data.document.startsWith("web-evidence/") && this.#webWorking.size === 0) return NOT_FOUND;',
			},
		],
		test: "test/web-evidence-retention.test.ts",
		pattern: "selected negative evidence",
	},
	{
		name: "web-fallback-after-cancel",
		expect: /fallback after cancellation is forbidden/,
		behavior: "provider admission ignores cancellation and current authority",
		edits: [
			{
				file: "src/engine/web.ts",
				find: 'signal.aborted ? "canceled" : !current() ? "authority_revoked" : Date.now() >= deadline ? "overall_timeout" : undefined;',
				replace: "undefined;",
			},
			{
				file: "src/engine/web.ts",
				find: "const options = { provider, signal, timeoutMs:",
				replace: "const options = { provider, signal: undefined, timeoutMs:",
			},
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "caller cancellation",
	},
	{
		name: "owned-hidden-base",
		behavior: "collector trusts a worker ignore to drop accepted base source",
		test: "test/owned-source-controls.integration.ts",
		pattern: "worker ignore",
		expect: /worker ignores must not hide accepted literal source/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: "const relative = `${prefix}${name}`;",
				replace: 'const relative = `${prefix}${name}`; if (egress && relative === "ignored") continue;',
			},
		],
	},
	{
		name: "owned-follow-symlink",
		behavior: "collector follows a worker symlink into host bytes",
		test: "test/owned-source-controls.integration.ts",
		pattern: "symlink stays",
		expect: /collector must retain symlink text, never host target bytes/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'content = await readlink(path, { encoding: "buffer" });',
				replace: 'content = egress && relative === "host-link" ? await readFile(path) : await readlink(path, { encoding: "buffer" });',
			},
		],
	},
	{
		name: "owned-early-reuse",
		behavior: "prepare returns an already-live workspace",
		test: "test/owned-source-controls.integration.ts",
		pattern: "workspace never reused",
		expect: /live workspace must not be reused before confirmed quiescence/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'if (this.#preparations.has(id) || this.#fenced.has(id)) return Promise.reject(new Error("Sandbox workspace reuse is forbidden."));',
				replace: "if (this.#preparations.has(id)) return this.#preparations.get(id)!;",
			},
		],
	},
	{
		name: "owned-possibly-created-absent",
		behavior: "Engine classifies a preparation failure after create was issued as a pre-allocation refusal",
		test: "test/owned-source-recovery.integration.ts",
		pattern: "possibly created",
		expect: /a possibly created runtime must not be recorded absent/,
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: 'if (error instanceof SandboxInputRefusal) environment = "absent";',
				replace: 'if (error instanceof SandboxInputRefusal || /Docker create failed/.test(String(error))) environment = "absent";',
			},
		],
	},
	{
		name: "owned-host-fallback",
		behavior: "executor runs the actual coding command on the host",
		test: "test/owned-source-controls.integration.ts",
		pattern: "fall back",
		expect: /host-shell fallback exposes an owned host-only canary/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'if (this.#fenced.has(handle.id) || this.#stoppedScopes.has(identity(handle.scope)))\n\t\t\tthrow new Error("Sandbox sealed/closed to execute.");',
				replace:
					'return new Promise(resolve => execFile(call.argv[0]!, call.argv.slice(1), {encoding: "utf8"}, (error, stdout, stderr) => resolve({argv: call.argv, exitCode: error ? 1 : 0, stdout, stderr, platform: {os: "linux", cpu: "unknown"}, image: "host", timedOut: false})));',
			},
		],
	},
	{
		name: "blocked-slot-release",
		expect: /capacity_exhausted/,
		behavior: "a human-blocked but still executing Attempt releases its slot",
		edits: [{ file: "src/kernel/roles.ts", find: "a.blocker = c.reason;", replace: "a.blocker = c.reason; a.executing = false;" }],
		test: "test/cancellation-capacity.test.ts",
		pattern: "R05",
	},
	{
		name: "inherited-role-tools",
		expect: /role must not inherit broad tools/,
		behavior: "role configuration inherits broad coding tools from the host",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "import { anthropicProvider }",
				replace: 'import { CodingTools } from "@earendil-works/pi-durable/tools";\nimport { anthropicProvider }',
			},
			{
				file: "src/engine/runtime.ts",
				find: "registry.install(this.#roles);",
				replace: "registry.install(this.#roles); registry.install(CodingTools);",
			},
			{ file: "src/engine/runtime.ts", find: "extensions: [this.#roles],", replace: "extensions: [this.#roles, CodingTools]," },
			{ file: "src/engine/runtime.ts", find: "tools: this.#roles.tools ?? [],", replace: "tools: null," },
			{ file: "src/engine/runtime.ts", find: "modelTools: this.#roles.tools ?? [],", replace: "modelTools: null," },
		],
		test: "test/role-capability-refusal.test.ts",
		pattern: "R03 explicit",
	},
	{
		name: "tool-owned-role-child",
		expect: /role did not settle within 5s/,
		behavior: "accepted child runs under the submitting tool instead of a workflow-owned task",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "return tx.createTask(\n\t\t\t\t\t\tthis.#run,",
				replace: "if (a.parent) return 0;\n\t\t\t\t\treturn tx.createTask(\n\t\t\t\t\t\tthis.#run,",
			},
			{
				file: "src/engine/runtime.ts",
				find: "const reply = await this.#ledger!.command(envelope, identity.context);",
				replace:
					'const reply = await this.#ledger!.command(envelope, identity.context);\n\t\tif (command.type === "requestRole" && reply.status === "accepted") await api.createTask(this.#run, { assignment: reply.result.assignment as string }, { ownership: { kind: "task", taskId: api.taskId } }, ctx);',
			},
		],
		test: "test/workflow-task-survival.test.ts",
		pattern: "R01/R07",
	},
	{
		name: "latest-only-export",
		expect: /export must retain superseded identities, not latest only/,
		behavior: "export drops every superseded revision",
		edits: [
			{
				file: "src/ledger/history.ts",
				find: "const included = records;",
				replace: "const included = records.filter((r) => !records.some((newer) => newer.supersedes.includes(r.ref)));",
			},
		],
		test: "test/history-cutoff-export.test.ts",
		pattern: "exact separate identities",
	},
	{
		name: "history-cutoff-drift",
		expect: /history cutoff must not drift/,
		behavior: "continuing a traversal silently advances its cutoff",
		edits: [
			{
				file: "src/ledger/history.ts",
				find: "cutoff: state.cutoff,\n\t\tscope: state.scope,\n\t\trecords:",
				replace: "cutoff: state.cutoff + (state.offset > 0 ? 1 : 0),\n\t\tscope: state.scope,\n\t\trecords:",
			},
		],
		test: "test/history-cutoff-export.test.ts",
		pattern: "exact separate identities",
	},
	{
		name: "principal-forgery-header",
		expect: /enrollDevice: \{"status":"accepted"/,
		behavior: "a request header raises a device to the local-admin route",
		edits: [
			{
				file: "src/ledger/http.ts",
				find: "const context = ledger.authenticate(req.headers.authorization);",
				replace:
					'const context = req.headers["x-render-route"] === "local-admin" ? mintContext({ kind: "human", human: "human:owner", route: "local-admin" }) : ledger.authenticate(req.headers.authorization);',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-04/B1-05/B1-06",
	},
	{
		name: "principal-forgery-matrix",
		expect: /(enrollDevice|revokeDevice) accepted from forbidden/,
		behavior: "the Kernel admits any human to the local-admin family",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: '"local-admin": (p) => p.kind === "human" && p.route === "local-admin",',
				replace: '"local-admin": (p) => p.kind === "human",',
			},
		],
		test: "test/kernel-authority-schedules.test.ts",
		pattern: "^V1",
	},
	{
		name: "stale-write-acceptance",
		expect: /a stale save must be refused/,
		behavior: "a save is accepted against a stale expected revision",
		edits: [{ file: "src/kernel/kernel.ts", find: "if (c.expected !== current) {", replace: "if (false) {" }],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B2-01/B2-02",
	},
	{
		name: "dedup-before-auth",
		expect: /a revoked device's retry must not disclose the receipt/,
		behavior: "receipt deduplication runs before the current credential is checked",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "device === undefined || device.revokedAtSequence !== null || !verifies",
				replace: "device === undefined || !verifies",
			},
			{
				file: "src/ledger/ledger.ts",
				find: "\t\tif (!this.#current(principal)) return UNAUTHORIZED;\n\t\tconst env = parseEnvelope(raw);",
				replace: "\t\tconst env = parseEnvelope(raw);",
			},
			{
				file: "src/ledger/ledger.ts",
				find: '\t\tlet current = principal;\n\t\tif (principal.kind === "human" && principal.route === "device") {',
				replace:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: this is mutated source text, not a template.
					'\t\tconst early = await tx.doc(Receipt, `${namespaceOf(principal)} ${env.commandId}`, null);\n\t\tif (early.exists && early.fingerprint === env.fingerprint) return { duplicate: true as const, body: plain(early.body) as ReceiptBody };\n\t\tlet current = principal;\n\t\tif (principal.kind === "human" && principal.route === "device") {',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-11",
	},
	{
		name: "dedup-ignores-payload",
		expect: /a changed payload under a used ID must conflict/,
		behavior: "a reused command ID with a changed payload returns the original receipt",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "if (receipt.fingerprint !== env.fingerprint || !readable(receipt.body, current)) throw new Abort(CONFLICT);",
				replace: "if (!readable(receipt.body, current)) throw new Abort(CONFLICT);",
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-10",
	},
	{
		name: "device-bound-dedup",
		expect: /a second device's retry must return the original receipt/,
		behavior: "command IDs are namespaced by device, so a second device's retry executes again",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: '\tif (principal.kind === "human") return principal.human;',
				replace:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: this is mutated source text, not a template.
					'\tif (principal.kind === "human") return `${principal.human}:${principal.route === "device" ? principal.device : "admin"}`;',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-09",
	},
	{
		name: "lock-after-open",
		expect: /must be refused by the owner lock[\s\S]*store_unreadable/,
		behavior: "the owner lock is taken after the store is opened",
		edits: [
			{
				file: "src/ledger/startup.ts",
				find: '\tconst lock = acquireOwnerLock(join(options.data, "owner.lock"));',
				replace: "\tlet lock = { release: () => undefined };",
			},
			{
				file: "src/ledger/startup.ts",
				find: '\t\tconst fresh = identifyStore(path) === "new";',
				replace: '\t\tconst fresh = identifyStore(path) === "new";\n\t\tlock = acquireOwnerLock(join(options.data, "owner.lock"));',
			},
		],
		test: "test/persistence-startup.integration.ts",
		pattern: "B4-01/B4-02",
	},
	{
		name: "weakened-synchronous",
		expect: /ready must report the required persistence readback/,
		behavior: "the host runs with synchronous=NORMAL and skips readback validation",
		edits: [
			{
				file: "src/ledger/startup.ts",
				find: 'await adapter.exec("PRAGMA synchronous = FULL");',
				replace: 'await adapter.exec("PRAGMA synchronous = NORMAL");',
			},
			{ file: "src/ledger/startup.ts", find: "if (mismatched.length > 0)", replace: "if (false)" },
		],
		test: "test/persistence-startup.integration.ts",
		pattern: "B4-03/B4-09/B4-10",
	},
	{
		name: "latest-only-history",
		expect: /exact bytes of revision:\d+ after restart/,
		behavior: "an older revision ref resolves to the newest bytes of its document",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: '\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcase "document.advance": {',
				replace:
					'\t\t\t\t\tif (write.parent !== null) Object.assign(await tx.doc(RevisionLocation, write.parent, null), { entry: entry.id });\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcase "document.advance": {',
			},
			{ file: "src/ledger/ledger.ts", find: "if (data.revision !== ref || !intact(", replace: "if (!intact(" },
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B2-01/B2-02",
	},
	{
		name: "substitute-corrupt-bytes",
		expect: /a corrupt revision must be refused, not served/,
		behavior: "a corrupt revision read is answered with other retained bytes",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "\t\t\tif (data.revision !== ref || !intact(data.text, data.digest, data.byteLength))\n\t\t\t\treturn {",
				replace: "\t\t\tif (false)\n\t\t\t\treturn {",
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "tampered stored bytes",
	},
	{
		name: "revoked-stream-stays-open",
		expect: /expected an end frame after revocation/,
		behavior: "revocation does not close the revoked device's observation stream",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'for (const o of this.#observers) if (o.device === outcome.device.device) this.#endObserver(o, "credential_revoked");',
				replace: "void 0;",
			},
		],
		test: "test/two-client-reattach.integration.ts",
		pattern: "B2-03 race",
	},
	{
		name: "kernel-mutates-input",
		expect: /Kernel mutated its inputs/,
		behavior: "the Kernel changes the state it was given while deciding",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: '\t\tcase "revokeDevice": {\n\t\t\tif (state.device === null)',
				replace:
					'\t\tcase "revokeDevice": {\n\t\t\tif (state.device !== null) (state.device as { revoked: boolean }).revoked = true;\n\t\t\tif (state.device === null)',
			},
		],
		test: "test/kernel-authority-schedules.test.ts",
		pattern: "^V1",
	},
	{
		name: "slow-consumer-kept",
		expect: /the stalled stream must have been disconnected by the host/,
		behavior: "a stalled observer is never disconnected",
		edits: [{ file: "src/ledger/http.ts", find: "if (++pending > MAX_PENDING_FRAMES) {", replace: "if (false) {" }],
		test: "test/stalled-observer.performance.ts",
		pattern: "B3-05",
	},
	{
		name: "kernel-eligible-refused",
		expect: /postCoordinatorMessage from .* decided not_found, expected accepted/,
		behavior: "the Kernel refuses an eligible message for an ordinary reason",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: 'if (state.workflow === null) return refuse("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });\n\t\t\tconst message = required',
				replace:
					'if (state.workflow === null || state.workflow.messageCount > 0) return refuse("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });\n\t\t\tconst message = required',
			},
		],
		test: "test/kernel-authority-schedules.test.ts",
		pattern: "^V1",
	},
	{
		name: "storage-failure-host-stays-up",
		expect: /host must stop after a storage failure/,
		behavior: "the host keeps running after a storage failure",
		edits: [{ file: "src/host/main.ts", find: "setTimeout(() => process.exit(1), 250);", replace: "void 0;" }],
		test: "test/command-crash-recovery.integration.ts",
		pattern: "a save that cannot be stored",
	},
	{
		name: "same-family-request-admitted",
		expect: /same-family review must not silently start without human direction/,
		behavior: "a same-family role request starts without recorded human direction",
		edits: [{ file: "src/kernel/roles.ts", find: "request.packet.family === a.packet.family &&", replace: "false &&" }],
		test: "test/context-continuation-independence.test.ts",
		pattern: "same-family review requires",
	},
	{
		name: "capability-wrong-blocker",
		expect: /must block for its own reason/,
		behavior: "a missing sandbox capability reports another prerequisite as its blocker",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: 'if (a.packet.execution !== "read-only") return "sandbox_capability_unavailable";',
				replace: 'if (a.packet.execution !== "read-only") return "required_model_family_unavailable";',
			},
		],
		test: "test/role-capability-refusal.test.ts",
		pattern: "R04",
	},
	{
		name: "web-forbidden-argument-ignored",
		expect: /tool validation must refuse the forbidden/,
		behavior: "web tools accept and ignore model-selected host configuration",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: '{ additionalProperties: false },\n\t\t\t\t),\n\t\t\t\treplay: "unsafe",',
				replace: '{ additionalProperties: true },\n\t\t\t\t),\n\t\t\t\treplay: "unsafe",',
			},
		],
		test: "test/scoped-web-research.test.ts",
		pattern: "B5 model cannot",
	},
	{
		name: "role-new-call-not-rechecked",
		expect: /a new call must be rechecked against current executing authority/,
		behavior: "a second role submission call is accepted after the role stopped executing",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)\n\t\t\treturn refusal("assignment_not_running"',
				replace: 'if (false)\n\t\t\treturn refusal("assignment_not_running"',
			},
		],
		test: "test/workflow-task-survival.test.ts",
		pattern: "R02",
	},
];

async function copy(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "render-control-"));
	await cp(join(ROOT, "src"), join(dir, "src"), { recursive: true });
	await cp(join(ROOT, "test"), join(dir, "test"), { recursive: true });
	for (const f of ["package.json", "tsconfig.json"]) await cp(join(ROOT, f), join(dir, f));
	await symlink(join(ROOT, "node_modules"), join(dir, "node_modules"));
	return dir;
}

function run(dir: string, control: Control): { code: number | null; output: string } {
	const r = spawnSync(process.execPath, ["--test", `--test-name-pattern=${control.pattern}`, control.test], {
		cwd: dir,
		encoding: "utf8",
		timeout: 300_000,
	});
	return { code: r.status, output: `${r.stdout}\n${r.stderr}` };
}

const SETUP_FAILURE = /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|Cannot find module/;

const results: Record<string, unknown>[] = [];
let undetected = 0;
const only = process.argv[2];
for (const control of CONTROLS.filter((c) => only === undefined || c.name === only)) {
	const dir = await copy();
	try {
		const baseline = run(dir, control);
		const baselinePassed = baseline.code === 0 && /ℹ pass [1-9]/.test(baseline.output);
		for (const edit of control.edits) {
			const path = join(dir, edit.file);
			const source = await readFile(path, "utf8");
			const occurrences = source.split(edit.find).length - 1;
			if (occurrences !== 1) throw new Error(`${control.name}: expected exactly one match in ${edit.file}, found ${occurrences}`);
			await writeFile(path, source.replace(edit.find, edit.replace));
		}
		const mutated = run(dir, control);
		const failed = mutated.code !== 0;
		const intended = failed && control.expect.test(mutated.output) && !SETUP_FAILURE.test(mutated.output);
		const detected = baselinePassed && intended;
		if (!detected) undetected++;
		const assertion = /AssertionError[^\n]*\n?[^\n]*/.exec(mutated.output)?.[0]?.trim().slice(0, 300) ?? null;
		results.push({
			control: control.name,
			behavior: control.behavior,
			check: `${control.test} :: ${control.pattern}`,
			baselinePassed,
			detected,
			// A failure that is not the intended assertion is reported, never counted as detection.
			failedOtherwise: failed && !intended,
			assertion,
		});
		process.stdout.write(`${JSON.stringify(results.at(-1))}\n`);
		if (!detected && process.env.RENDER_CONTROLS_VERBOSE) process.stderr.write(mutated.output);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
process.stdout.write(`${JSON.stringify({ controls: results.length, detected: results.length - undetected, undetected })}\n`);
process.exit(undetected === 0 ? 0 : 1);
