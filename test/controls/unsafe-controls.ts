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

// Debt: the initial experiment controls were authored after product implementation began; passing them does not
// repair that ordering violation. Independent review of their behavioral sensitivity remains required.
const CONTROLS: Control[] = [
	{
		name: "implementation-read-only-owner",
		expect: /read-only owner/,
		behavior: "accept a read-only implementer that can never capture source",
		edits: [{ file: "src/kernel/implementation.ts", find: 'owner.execution !== "linux-writer" || ', replace: "" }],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-selection-other-contract",
		expect: /selection naming another retained document/,
		behavior: "accept a verification selection bound to a document other than the accepted Contract",
		edits: [{ file: "src/kernel/implementation.ts", find: "selection.contract !== contract || ", replace: "" }],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-selection-no-behavioral-rows",
		expect: /selection without behavioral rows/,
		behavior: "accept a selection whose handoff can never establish behavioral coverage",
		edits: [{ file: "src/kernel/implementation.ts", find: "!selection.behavioralRows.length || ", replace: "" }],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-selection-impossible-path",
		expect: /traversing catalog path/,
		behavior: "accept a catalog path retained source cannot represent",
		edits: [{ file: "src/kernel/implementation.ts", find: "validatePath(selection.path);", replace: "" }],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-reviewer-frozen-verifier",
		expect: /standards reviewer freezing a verifier before A/,
		behavior: "freeze a caller-selected reviewer verifier before A exists",
		edits: [{ file: "src/kernel/implementation.ts", find: "\t\t!p.verification &&\n", replace: "" }],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-replacement-changes-configuration",
		expect: /forbidden_scope/,
		behavior: "let a replacement owner change the pass's frozen configuration",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "!isDeepStrictEqual(passConfiguration(c.packet, pass!.contract), pass!.configuration) ||",
				replace: "false ||",
			},
		],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "replacement cannot change",
	},
	{
		name: "implementation-incompatible-audit-reviewers",
		expect: /standards experiment candidate/,
		behavior: "accept an experiment-bearing Audit reviewer into a pass",
		edits: [
			{
				file: "src/kernel/implementation.ts",
				find: "\t\t!p.experiment &&\n",
				replace: "",
			},
		],
		test: "test/implementation-lifecycle.test.ts",
		pattern: "accepted pass refuses",
	},
	{
		name: "implementation-same-pass-reaudit",
		expect: /no same-pass reaudit with a new command/,
		behavior: "open a second Audit invocation in the same implementation pass",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (pass.audit) return yield* Effect.fail(refusal("role_already_requested", "This pass already has its one Audit invocation."));',
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
				find: 'if (a?.passRef)\n\t\t\treturn yield* Effect.fail(\n\t\t\t\trefusal("forbidden_scope", "Accepted implementation closes only through its sealed pass handoff, not a generic report."),\n\t\t\t);',
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
				find: 'if (a?.passRef)\n\t\t\treturn yield* Effect.fail(\n\t\t\t\trefusal("forbidden_scope", "Accepted implementation requires its pass-bound paired Audit on retained source."),\n\t\t\t);',
				replace: "",
			},
		],
		test: "test/implementation-pass.test.ts",
		pattern: "generic child request",
	},
	{
		name: "implementation-old-audit-reuse",
		expect: /Audit before A2/,
		behavior: "let a successor pass inherit its predecessor's completed Audit",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'cause: returned?.cause ?? "initial-implementation",',
				replace:
					'cause: returned?.cause ?? "initial-implementation", ...(returned ? { audit: pass!.audit, captureA: pass!.captureA } : {}),',
			},
		],
		test: "test/implementation-successor.test.ts",
		pattern: "P1 reports cannot satisfy P2",
	},
	{
		name: "implementation-operational-retry-opens-pass",
		expect: /launch failure 126/,
		behavior: "open a successor pass for an unchanged-source operational check failure",
		edits: [
			{
				file: "src/kernel/implementation.ts",
				// The record parser shares the predicate; anchor on the return-observation parser this control targets.
				find: "!LAUNCH_FAILURES.includes(Number(f.exitCode)),\n\t\t\t)\n\t\t\t? (v as ReturnObservation)",
				replace: "LAUNCH_FAILURES.length > 0,\n\t\t\t)\n\t\t\t? (v as ReturnObservation)",
			},
		],
		test: "test/implementation-successor.test.ts",
		pattern: "prepared-check failure opens from X",
	},
	{
		name: "implementation-unbound-rework-verdict",
		expect: /other X/,
		behavior: "accept a Watchdog rework verdict bound to another prepared source",
		edits: [{ file: "src/kernel/roles.ts", find: "verdict.prepared !== observation.preparedCommit ||", replace: "" }],
		test: "test/implementation-successor.test.ts",
		pattern: "Watchdog rework needs",
	},
	{
		name: "implementation-successor-ignores-review-cap",
		expect: /cap reached/,
		behavior: "open a successor after the completed-review limit instead of stopping for the human",
		edits: [{ file: "src/kernel/roles.ts", find: "reviews.length >= limit", replace: "reviews.length < 0" }],
		test: "test/implementation-successor.test.ts",
		pattern: "Watchdog rework needs",
	},
	{
		name: "watchdog-count-resets-per-pass",
		expect: /cap reached/,
		behavior: "count only the current pass's completed Watchdog reviews, so a successor pass resets the rework budget",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "const reviews = completedReviews(work.assignments, c.workflow, a.slice);",
				replace:
					"const reviews = completedReviews(work.assignments, c.workflow, a.slice).filter((r) => !r.watchdogReview || r.watchdogReview.passRef === pass.ref);",
			},
		],
		test: "test/implementation-successor.test.ts",
		pattern: "Watchdog rework needs",
	},
	{
		name: "watchdog-drift-exempt",
		expect: /moved target never qualifies/,
		behavior: "let a completed passing review qualify after the canonical target moved",
		edits: [
			{
				file: "src/kernel/implementation.ts",
				find: "\tif (record.target.commit !== target)\n",
				replace: "\tif (false)\n",
			},
		],
		test: "test/watchdog-rework.test.ts",
		pattern: "WR12/WR15/WR16",
	},
	{
		name: "watchdog-changed-source-passes",
		expect: /pass over source_changed/,
		behavior: "accept a Watchdog pass over its own checks whose scratch run changed the reviewed tree",
		edits: [
			{ file: "src/kernel/verification.ts", find: '\t\treceipt.verification.status !== "needs_assessment" ||\n', replace: "" },
			{
				file: "src/kernel/verification.ts",
				find: " ||\n\t\treceipt.verification.inputTree !== receipt.verification.resultTree\n",
				replace: "\n",
			},
		],
		test: "test/watchdog-rework.test.ts",
		pattern: "WR06/WR07/WR08/WR09",
	},
	{
		name: "watchdog-resume-abandons-check-runtime",
		expect: /the interrupted check runtime was stopped, not abandoned/,
		behavior: "resume an interrupted Watchdog round without stopping its own in-flight check runtime",
		edits: [{ file: "src/engine/runtime.ts", find: "\t\t\t\t\t\t\tawait this.#stopPreparationScope(this.#scope(a));\n", replace: "" }],
		test: "test/watchdog-crash.integration.ts",
		pattern: "WR17 SIGKILL",
	},
	{
		name: "watchdog-source-edit",
		expect: /no source-writing tool/,
		behavior: "give a Watchdog round the implementation tools that capture and hand off source",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: '(a.passRef || !tool.name.startsWith("implementation_"))',
				replace: '(a.passRef || a.watchdogReview || !tool.name.startsWith("implementation_"))',
			},
		],
		test: "test/watchdog-rework.integration.ts",
		pattern: "WR19",
	},
	{
		name: "watchdog-successor-blind",
		expect: /the cited report is a required successor input/,
		behavior: "open a rework successor without the cited Watchdog report among its inputs, so it cannot read its findings",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: '\t\t\tobservation.cause === "watchdog-rework"\n\t\t\t\t? [observation.report]\n',
				replace: '\t\t\tobservation.cause === "watchdog-rework"\n\t\t\t\t? []\n',
			},
		],
		test: "test/watchdog-rework.test.ts",
		pattern: "WR25",
	},
	{
		name: "watchdog-direction-bypass",
		expect: /no recorded human direction/,
		behavior: "admit a human-direction return through a Needs Human stop without a recorded human direction",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: '\t\t\tobservation.cause === "human-direction" &&\n\t\t\tpass.handoff.direction?.review === observation.review &&\n\t\t\tpass.handoff.direction.revision === observation.direction;',
				replace: '\t\t\tobservation.cause === "human-direction";',
			},
		],
		test: "test/watchdog-rework.test.ts",
		pattern: "WR26 only an authenticated",
	},
	{
		name: "watchdog-direction-unbound",
		expect: /the report is no human direction/,
		behavior: "admit a human-direction return below the cap without the direction recorded for its exact round",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: '\t\tif (observation.cause === "human-direction" && !directed)\n\t\t\treturn yield* Effect.fail(\n\t\t\t\trefusal("human_direction_required", "A human-directed return must cite the direction recorded for its exact round."),\n\t\t\t);\n',
				replace: "",
			},
		],
		test: "test/watchdog-rework.test.ts",
		pattern: "WR28",
	},
	{
		name: "watchdog-reviewer-direction-blind",
		expect: /the next Watchdog's prior context names the human direction/,
		behavior: "launch the next Watchdog round without the human direction that resolved the stopped round",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "[p.opening?.observation, p.handoff?.direction?.revision]",
				replace: "[p.opening?.observation]",
			},
		],
		test: "test/watchdog-rework.integration.ts",
		pattern: "WR29",
	},
	{
		name: "watchdog-cancel-abandons-check-runtime",
		expect: /quiescence is recorded only after the check runtime stopped/,
		behavior: "record a canceled Watchdog quiescent while its own check runtime still runs",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "environment = await this.#stopPreparationScope(this.#scope(a, true));",
				replace: 'environment = "absent";',
			},
		],
		test: "test/watchdog-rework.integration.ts",
		pattern: "WR27",
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
		name: "local-prompt-experiment-evidence",
		expect: /advisory must retain exact experiment source and raw negative evidence/,
		behavior: "omit sealed experiment source and decisive negative bytes from advisory inputs",
		edits: [{ file: "src/ledger/ledger.ts", find: "\n\t\t\t\t\t\t\ta.experimentSource,", replace: "" }],
		test: "test/experiment-journey.integration.ts",
		pattern: "E02/E09/E10",
	},
	{
		name: "experiment-correction-replacement",
		expect: /Experimental corrections require a new protocol\/round/,
		behavior: "replace an experiment with an ordinary role instead of requiring a new round",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "if (a?.packet.experiment)\n\t\t\treturn yield* Effect.fail(",
				replace: "if (false)\n\t\t\treturn yield* Effect.fail(",
			},
		],
		test: "test/experiment-design-candidates.test.ts",
		pattern: "E18",
	},
	{
		name: "design-candidate-replacement",
		expect: /Candidate replacement retains exact question/,
		behavior: "replace a design candidate with changed question, conditions or role",
		edits: [{ file: "src/kernel/roles.ts", find: "\t\t\tif (!samePacket(a.packet, c.packet))\n", replace: "\t\t\tif (false)\n" }],
		test: "test/experiment-design-candidates.test.ts",
		pattern: "E18",
	},
	{
		name: "experiment-runner-answer",
		expect: /Only the assigned coordinator can submit a cited investigation outcome/,
		behavior: "accept a host runner receipt as an experiment answer",
		edits: [
			{ file: "src/kernel/roles.ts", find: "if (a.packet.investigation || a.packet.experiment)", replace: "if (a.packet.investigation)" },
		],
		test: "test/experiment-design-candidates.test.ts",
		pattern: "E19",
	},
	{
		name: "design-candidate-runner-answer",
		expect: /Only the assigned candidate can submit its competing answer/,
		behavior: "accept a host runner receipt as an independent design answer",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: "if (a.checkpointCandidate)\n\t\t\t\t\treturn yield* Effect.fail(",
				replace: "if (false)\n\t\t\t\t\treturn yield* Effect.fail(",
			},
		],
		test: "test/experiment-design-candidates.test.ts",
		pattern: "E19",
	},
	{
		name: "experiment-missing-preregistered-rule",
		expect: /missing decisionRule must not execute/,
		behavior: "candidate execution is admitted without a preregistered decision rule",
		edits: [
			{
				file: "src/kernel/experiments.ts",
				find: "p.ground, p.question, p.hypothesis, p.falsifier, p.decisionRule",
				replace: "p.ground, p.question, p.hypothesis, p.falsifier",
			},
		],
		test: "test/protocol-experiments.test.ts",
		pattern: "E01",
	},
	{
		name: "experiment-post-measurement-criteria",
		expect: /execution criteria must remain the original protocol after measurement/,
		behavior: "parent silently receives amended criteria after candidate measurements",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: 'inputs.push({ ref, text: value.content.toString("utf8") });',
				replace:
					'inputs.push({ ref, text: a.packet.experiment?.candidate === null && ref === a.packet.experiment.protocol ? value.content.toString("utf8").replace("Any measurement greater than 10", "Any measurement greater than 20") : value.content.toString("utf8") });',
			},
		],
		test: "test/experiment-journey.integration.ts",
		pattern: "E02/E09/E10",
	},
	{
		name: "experiment-parent-repairs-original",
		expect: /parent must not repair a sealed favorite/,
		behavior: "comparison receives writable original candidate mounts",
		edits: [{ file: "src/sandboxes/sandboxes.ts", find: "dst=/candidates/${name},readonly", replace: "dst=/candidates/${name}" }],
		test: "test/experiment-isolation.integration.ts",
		pattern: "E08",
	},
	{
		name: "experiment-negative-raw-erased",
		expect: /retain raw decisive negative measurement/,
		behavior: "sealed candidate evidence drops decisive raw measurements",
		edits: [
			{
				file: "src/engine/experiments.ts",
				find: "source,\n\t\t\texecutions: stopped.executions,",
				replace: "source,\n\t\t\texecutions: [],",
			},
		],
		test: "test/experiment-journey.integration.ts",
		pattern: "E02/E09/E10",
	},

	{
		name: "local-prompt-completion-gate",
		expect: /advisory absence must not gate or complete work/,
		behavior: "add a pending-local-verification blocker to retained workflow work",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'case "local-prompt.retain": {',
				replace: 'case "local-prompt.retain": { roles.assignments[0].blocker = "local_verification_pending";',
			},
		],
		test: "test/local-verification-prompt.test.ts",
		pattern: "two clients retain one exact advisory receipt",
	},
	{
		name: "local-prompt-stale-basis",
		expect: /stale prompt basis must refuse before generation/,
		behavior: "accept a prompt request against a stale observed snapshot",
		edits: [{ file: "src/kernel/kernel.ts", find: "if (c.expectedSequence !== facts.sequence - 1)", replace: "if (false)" }],
		test: "test/local-verification-prompt.test.ts",
		pattern: "two clients retain one exact advisory receipt",
	},
	{
		name: "local-prompt-linux-equivalence",
		expect: /Linux evidence must not imply Mac equivalence/,
		behavior: "claim same-CPU Linux evidence establishes Mac portability",
		edits: [
			{
				file: "src/engine/local-verification.ts",
				find: "Same CPU does not make Linux binaries portable to macOS",
				replace: "Same CPU makes Linux binaries portable to macOS",
			},
		],
		test: "test/local-verification-prompt.test.ts",
		pattern: "two clients retain one exact advisory receipt",
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
		name: "existing-seam-ground-unchecked",
		expect: /must not ground a commitment/,
		behavior: "stage shortened intake on human Ground without a goal, done predicate, constraints or facts",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'if (m.shape !== "design" && !(text(g.goal) && text(g.donePredicate) && texts(g.constraints) && texts(g.facts)))',
				replace: "if (false)",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "ES01",
	},
	{
		name: "existing-seam-change-waives-seams",
		expect: /running change-shape owner stops/,
		behavior: "let change-shape Contract work keep running under a revised Seams request",
		edits: [
			{
				file: "src/kernel/checkpoints.ts",
				find: "const contracts = (intakes?.slices ?? []).filter((s) => inputs.includes(s.contract));",
				replace: "const contracts: Intakes['slices'] = [];",
			},
		],
		test: "test/existing-seam-change.test.ts",
		pattern: "ES04",
	},
	{
		name: "existing-seam-handover-hides-delivery",
		expect: /partial delivery: read-fix qualified/,
		behavior: "omit recorded qualifying integration from the handover view",
		edits: [{ file: "src/kernel/kernel.ts", find: "integrated: w.integrated ?? [],", replace: "integrated: []," }],
		test: "test/existing-seam-change.test.ts",
		pattern: "ES05",
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
	{
		name: "maintenance-clean-failed-row",
		expect: /a failed row called clean must not be retained/,
		behavior: "classify a row clean although its maintenance run failed",
		edits: [{ file: "src/kernel/verification.ts", find: 'if (c.status === "clean" && !executed)', replace: "if (false)" }],
		test: "test/verification-maintenance.integration.ts",
		pattern: "VM01|VM02 classification refuses a failed row",
	},
	{
		name: "maintenance-unchanged-definition",
		expect: /a blocked row's definition is not maintenance's to change/,
		behavior: "let maintenance lower the expectations of a row it did not prove drifted",
		edits: [
			{
				file: "src/kernel/verification.ts",
				find: "if (row.literal !== p.literal || row.journey?.digest !== p.journey?.digest)",
				replace: "if (false)",
			},
		],
		test: "test/verification-maintenance.integration.ts",
		pattern: "VM01|VM03|VM05",
	},
	{
		name: "maintenance-product-code",
		expect: /product\.js is not a verifier file/,
		behavior: "accept a maintenance correction that also edits product code",
		edits: [
			{
				file: "src/kernel/verification.ts",
				find: "if (before.get(path) !== after.get(path) && !verifier.has(path))",
				replace: "if (false)",
			},
		],
		test: "test/verification-maintenance.integration.ts",
		pattern: "VM01|VM03|VM06",
	},
	{
		name: "maintenance-unsubstantiated-change",
		expect: /a correction that cannot run is not a successful change/,
		behavior: "claim a corrected row changed without a successful re-execution",
		edits: [{ file: "src/kernel/verification.ts", find: 'if (basis && c.status === "changed" && !executed)', replace: "if (false)" }],
		test: "test/verification-maintenance.integration.ts",
		pattern: "VM01|VM03|VM04",
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
			test:
				name === "inherited-experiment-candidate-report"
					? "test/experiment-journey.integration.ts"
					: "test/context-continuation-independence.test.ts",
			pattern: name === "inherited-experiment-candidate-report" ? "E02/E09/E10" : pattern,
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
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'a.blocker = c.reason;\n\t\t\t\tif (a.status !== "canceling") a.status = "blocked";',
				replace: 'a.blocker = c.reason; a.executing = false;\n\t\t\t\tif (a.status !== "canceling") a.status = "blocked";',
			},
		],
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
			{ file: "src/engine/runtime.ts", find: "\n\t\t\t\t\t\ttools,", replace: "\n\t\t\t\t\t\ttools: null," },
			{ file: "src/engine/runtime.ts", find: "modelTools: tools,", replace: "modelTools: null," },
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
				find: 'if (state.workflow === null) return yield* fail("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });\n\t\t\tconst message = required',
				replace:
					'if (state.workflow === null || state.workflow.messageCount > 0) return yield* fail("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });\n\t\t\tconst message = required',
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
				find: 'if (a.packet.execution !== "read-only" && !a.passRef && !a.packet.experiment) return "sandbox_capability_unavailable";',
				replace:
					'if (a.packet.execution !== "read-only" && !a.passRef && !a.packet.experiment) return "required_model_family_unavailable";',
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
				find: 'if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)\n\t\t\treturn yield* Effect.fail(refusal("assignment_not_running"',
				replace: 'if (false)\n\t\t\treturn yield* Effect.fail(refusal("assignment_not_running"',
			},
		],
		test: "test/workflow-task-survival.test.ts",
		pattern: "R02",
	},
	{
		name: "preparation-inherits-home-attributes",
		expect: /HOME-only hostile default attributes changed a real conflict/,
		behavior: "trusted preparation Git reads default attributes through the caller's HOME",
		edits: [
			{ file: "src/effects/source.ts", find: '\t\t\t"-c",\n\t\t\t"core.attributesFile=/dev/null",\n', replace: "" },
			{ file: "src/effects/source.ts", find: "\t\tHOME: cwd,\n", replace: "\t\tHOME: process.env.HOME,\n" },
		],
		test: "test/target-preparation.test.ts",
		pattern: "HOME-only hostile",
	},
	{
		name: "preparation-inherits-xdg-attributes",
		expect: /XDG_CONFIG_HOME-only hostile default attributes changed a real conflict/,
		behavior: "trusted preparation Git reads default attributes through the caller's XDG_CONFIG_HOME",
		edits: [
			{ file: "src/effects/source.ts", find: '\t\t\t"-c",\n\t\t\t"core.attributesFile=/dev/null",\n', replace: "" },
			{
				file: "src/effects/source.ts",
				find: "\t\tHOME: cwd,\n",
				replace: "\t\tHOME: cwd,\n\t\tXDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,\n",
			},
		],
		test: "test/target-preparation.test.ts",
		pattern: "XDG-only hostile",
	},
	{
		name: "preparation-resume-abandons-check-runtime",
		expect: /the interrupted check runtime was stopped, not abandoned/,
		behavior: "a recovered preparation reruns its attempt without stopping the interrupted prepared-X check runtime",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "if (prior && prior.executorEpoch !== this.#ledger!.status().executorEpoch) await this.#stopPreparationScope(prior);",
				replace: "",
			},
		],
		test: "test/target-preparation-crash.integration.ts",
		pattern: "TP14 SIGKILL",
	},
	{
		name: "preparation-discovery-row-qualifies",
		// TP22's first assertion on the intended wrong behavior: X checked and waiting for Watchdog.
		expect: /X must not be checked ready for Watchdog/,
		behavior: "a required row that X's own verifier defines as discovery-only runs and qualifies X as checked",
		edits: [
			{ file: "src/engine/runtime.ts", find: "\t\t\tif (gap) throw new VerifierDefect(`Required row ${name}: ${gap}`);\n", replace: "" },
		],
		test: "test/implementation-engine.integration.ts",
		pattern: "TP22",
	},
	{
		name: "integration-requires-grant",
		expect: /Integration needs a human grant/,
		behavior: "eligible proposal integration waits for a human grant instead of current eligibility",
		edits: [
			{
				file: "src/kernel/integration.ts",
				find: "\t\tconst closedReason = handoffClosed(pass);\n",
				replace:
					'\t\tif (!facts.checkpointInputs?.grant) return yield* Effect.fail(refusal("forbidden_scope", "Integration needs a human grant."));\n\t\tconst closedReason = handoffClosed(pass);\n',
			},
		],
		test: "test/canonical-integration.test.ts",
		pattern: "CI01",
	},
	{
		name: "integration-ignores-cancellation",
		expect: /admission after cancellation: \{"status":"accepted"/,
		// Cancellation fences admission twice: the canceled guard, and the generation bump that makes the staged intent's
		// pinned owner generation stale. Removing only the guard still refuses, so both go.
		behavior: "admission ignores a human cancellation committed before it",
		edits: [
			{
				file: "src/kernel/integration.ts",
				find: '\t\tif (h.canceled) return yield* Effect.fail(refusal("assignment_closed", "Cancellation fenced this handoff before admission."));\n',
				replace: "",
			},
			{ file: "src/kernel/integration.ts", find: "\t\tintent.generation !== a.generation ||\n", replace: "" },
		],
		test: "test/canonical-integration.test.ts",
		pattern: "CI04",
	},
	{
		name: "integration-unserialized",
		expect: /admitted unresolved operation/,
		behavior: "another Slice stages integration while one of the proposal's operations is unresolved",
		edits: [{ file: "src/kernel/integration.ts", find: "\tif (blocking)\n", replace: "\tif (false)\n" }],
		test: "test/canonical-integration.test.ts",
		pattern: "CI11",
	},
	{
		name: "integration-infers-success",
		expect: /observed T is never inferred success/,
		behavior: "reconciliation that observes the unchanged target records qualifying integration",
		edits: [
			{
				file: "src/kernel/integration.ts",
				find: '\tif (ref.commit === intent.target) return "unapplied";\n',
				replace: '\tif (ref.commit === intent.target) return "applied";\n',
			},
		],
		test: "test/canonical-integration.test.ts",
		pattern: "CI07/CI13",
	},
	{
		name: "integration-dependency-before-qualification",
		expect: /Watchdog passed, no qualification/,
		behavior: "a prepared and reviewed handoff clears its same-proposal dependents without recorded qualification",
		edits: [
			{
				file: "src/kernel/integration.ts",
				find: "p.contract === s.contract && integrated(p)",
				replace: "p.contract === s.contract && !!p.handoff?.preparations?.length",
			},
		],
		test: "test/canonical-integration.test.ts",
		pattern: "CI15 integration edge",
	},
	{
		name: "integration-blind-cas",
		expect: /refuses the stale CAS/,
		behavior: "the canonical-ref update omits its expected old target",
		edits: [
			{
				file: "src/effects/source.ts",
				find: "update ${ref} ${result.commit} ${expected}\\n",
				replace: "update ${ref} ${result.commit}\\n",
			},
		],
		test: "test/canonical-integration-effects.test.ts",
		pattern: "CI09",
	},
	{
		name: "integration-adopts-old-permit",
		expect: /integration_observation_refused: stale_executor/,
		behavior: "a recovering executor dispatches an integration permit admitted under the dead executor's epoch",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: 'if (operation.status === "admitted" && attempt.executorEpoch === epoch) {',
				replace: 'if (operation.status === "admitted") {',
			},
		],
		test: "test/canonical-integration-crash.integration.ts",
		pattern: "before-integration-cas",
	},
	{
		name: "integration-observes-without-durability",
		expect: /the dispatch reports no applied R it could not make durable/,
		behavior: "a canonical-ref observation that can qualify is reported without a successful fsync of the store",
		edits: [
			{
				file: "src/effects/source.ts",
				find: "\t\tawait syncTree(store.path);\n\t\tconst current = await this.#gitResult(",
				replace: "\t\tconst current = await this.#gitResult(",
			},
		],
		test: "test/canonical-integration-effects.test.ts",
		pattern: "CI23",
	},
	{
		name: "integration-blocks-behind-serialization",
		expect: /integration_refused: ownership_conflict/,
		behavior: "a passing Slice blocks for good behind another unresolved integration of its proposal",
		edits: [
			{ file: "src/engine/runtime.ts", find: '\t\t\tif (reply.code === "ownership_conflict") return "wait" as const;\n', replace: "" },
		],
		test: "test/canonical-integration.integration.ts",
		pattern: "CI24",
	},
	{
		name: "integration-removes-live-lock",
		expect: /a lock written since this executor began may be live/,
		behavior: "reconciliation removes a canonical-ref lock that a live writer may hold",
		edits: [
			{
				file: "src/effects/source.ts",
				find: "if (held && held.mtimeMs < this.#started) await rm(path);",
				replace: "if (held) await rm(path);",
			},
		],
		test: "test/canonical-integration-effects.test.ts",
		pattern: "CI25",
	},
	{
		name: "record-assignment-without-basis",
		expect: /Contract alone omits the fidelity basis/,
		behavior: "a Record assignment need not carry its fidelity review and cited approved sources",
		edits: [{ file: "src/kernel/intake.ts", find: "const missing = recordBasis(state, slice)", replace: "const missing = [].concat()" }],
		test: "test/record-baseline.test.ts",
		pattern: "RB03",
	},
	{
		name: "record-unbounded-obligations",
		expect: /Record Slice with a behavior obligation/,
		behavior: "a Record Slice may hold obligations other than its explicit Record outputs",
		edits: [{ file: "src/kernel/intake.ts", find: '(o.kind === "record") !== s.record', replace: 'o.kind === "record" && !s.record' }],
		test: "test/accepted-contracts.test.ts",
		pattern: "RB01",
	},
	{
		name: "record-document-clears-consumer",
		expect: /document-only/,
		behavior: "a Record edge clears once the Record pass is handed off, before recorded qualification",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: "e.slice === slice && !cleared(e, qualified, delivered));",
				replace:
					'e.slice === slice && !cleared(e, qualified, delivered) && !(e.kind === "record" && state.roleWork?.passes?.some((p) => p.slice === e.requires && p.handoff)));',
			},
		],
		test: "test/record-baseline.test.ts",
		pattern: "RB06",
	},
	{
		name: "publication-retries-unknown-create",
		expect: /no automatic recreation/,
		behavior: "admission accepts another attempt of a draft PR create whose outcome is unknown",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: 'if (op.status !== "planned" && !reissue)',
				replace: 'if (op.status !== "planned" && op.status !== "unknown" && !reissue)',
			},
		],
		test: "test/github-publication.test.ts",
		pattern: "GP09/GP10",
	},
	{
		name: "publication-negative-listing-absent",
		expect: /a negative or incomplete listing is not absence/,
		behavior: "a complete empty listing re-plans an unknown draft PR create as if it was never sent",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: '\tif (op.status === "admitted") op.status = "unknown";\n\tif (!o.proposals?.complete || settled) return;\n',
				replace:
					'\tif (op.status === "admitted") op.status = "unknown";\n\tif (op.status === "unknown" && o.proposals?.complete && !o.proposals.items.length) op.status = "planned";\n\tif (!o.proposals?.complete || settled) return;\n',
			},
		],
		test: "test/github-publication.test.ts",
		pattern: "GP09/GP10",
	},
	{
		name: "publication-transient-listing-clears-risk",
		expect: /a transient unique listing does not clear risk/,
		behavior: "one verified listing associates the PR although a human-authorized reissue left sticky duplicate risk",
		edits: [
			{ file: "src/kernel/publication.ts", find: "if (verified.length === 1 && !riskOpen(p)) {", replace: "if (verified.length === 1) {" },
		],
		test: "test/github-publication.test.ts",
		pattern: "GP13/GP14",
	},
	{
		name: "publication-overwrites-divergence",
		expect: /divergent remote/,
		behavior: "source publication stages over a published head outside canonical lineage",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: '\t\t\t\tif (p.divergence) return refusal("stale_basis", `The published head ${p.divergence} diverged from canonical lineage.`);\n',
				replace: "",
			},
		],
		test: "test/github-publication.test.ts",
		pattern: "GP04",
	},
	{
		name: "publication-blind-push",
		expect: /a moved remote refuses the guarded push/,
		behavior: "the source push omits its expected-old lease",
		edits: [
			{
				file: "src/effects/forge.ts",
				find: '`--force-with-lease=refs/heads/${branch}:${request.expected ?? ""}`,',
				replace: '"--force",',
			},
		],
		test: "test/github-publication-forge.test.ts",
		pattern: "GF02",
	},
	{
		name: "publication-non-draft-fallback",
		expect: /draft unsupported is a capability rejection/,
		behavior: "a forge without draft support gets a non-draft PR instead of a visible capability refusal",
		edits: [
			{
				file: "src/effects/forge.ts",
				find: 'return result("rejected", "draft-unsupported");',
				replace:
					'return (await this.#request("POST", `${this.#base()}/pulls`, { title: request.title, head: branch, base: this.#repo.base, body: request.body })).status === 201 ? result("applied", null, "github:pr:fallback") : result("rejected", "draft-unsupported");',
			},
		],
		test: "test/github-publication-forge.test.ts",
		pattern: "GF03",
	},
	{
		name: "performance-target-invented",
		expect: /missing target without unresolved question/,
		behavior: "stage a performance intake whose human Ground has no target without surfacing it as a question",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: 'if (p === null && !m.unresolved.some((u) => u.kind === "product"))',
				replace: "if (false)",
			},
		],
		test: "test/performance-journey.test.ts",
		pattern: "PJ03",
	},
	{
		name: "performance-mismatch-passes",
		expect: /a different workload cannot pass/,
		behavior: "admit a passing Watchdog verdict whose faster measurement used another workload",
		edits: [{ file: "src/kernel/roles.ts", find: 'comparison.outcome !== "met" && ', replace: 'comparison.outcome === "regressed" && ' }],
		test: "test/performance-journey.test.ts",
		pattern: "PJ09",
	},
	{
		name: "performance-regression-ignored",
		expect: /a silently weakened full suite cannot pass/,
		behavior: "compare the measured row only, ignoring baseline checks that were weakened since the baseline",
		edits: [{ file: "src/kernel/performance.ts", find: "Object.entries(c.baseline.rows)", replace: "Object.entries({})" }],
		test: "test/performance-journey.test.ts",
		pattern: "PJ11",
	},
	{
		name: "merge-label-integrates",
		expect: /an incomplete listing or a merge outside main is not main integration/,
		behavior: "a merged label in an incomplete or non-main observation records the main merge",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: "if (!gap) p.main = { pr: current.id, source: current.head!, commit: current.merge!.commit, observation: revision };",
				replace: 'p.main = { pr: current.id, source: current.head ?? "", commit: current.merge?.commit ?? "", observation: revision };',
			},
		],
		test: "test/human-merge-observation.test.ts",
		pattern: "HM03",
	},
	{
		name: "main-edge-clears-on-private-ref",
		expect: /a prerequisite's private ref and passing review clear no cross-proposal edge/,
		behavior: "a cross-proposal edge clears on the prerequisite's recorded qualifying integration instead of an observed main merge",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "mainCoverage(w.publication, roles, w.intakes, id).covered.map(",
				replace: "qualifiedSlices(roles.passes ?? [], id, w.intakes?.slices ?? []).map(",
			},
		],
		test: "test/human-merge-observation.test.ts",
		pattern: "HM05",
	},
	{
		name: "merge-older-source-relabels",
		expect: /older merged source leaves its later Slices uncovered/,
		behavior: "an older or foreign merged source is credited with every qualified Slice",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: "const merged = lineage.slice(0, lineage.findIndex(({ i }) => i.result === p?.main?.source) + 1);",
				replace: "const merged = lineage;",
			},
		],
		test: "test/human-merge-observation.test.ts",
		pattern: "HM04",
	},
	{
		name: "merge-observation-overwrites",
		expect: /the first accepted mapping is kept/,
		behavior: "a later merge observation replaces the recorded main mapping",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: 'if (current?.state === "merged" && !p.main) {',
				replace: 'if (current?.state === "merged") {',
			},
		],
		test: "test/human-merge-observation.test.ts",
		pattern: "HM06",
	},
	{
		name: "forge-closed-is-merged",
		expect: /a closed unmerged PR is not merged/,
		behavior: "the GitHub adapter reports a closed unmerged PR as a merge",
		edits: [
			{
				file: "src/effects/forge.ts",
				find: "merge: p.merged_at && p.merge_commit_sha ? { main: p.base.ref === this.#repo.base, commit: p.merge_commit_sha } : null,",
				replace: 'merge: p.state === "closed" ? { main: p.base.ref === this.#repo.base, commit: p.merge_commit_sha ?? p.head.sha } : null,',
			},
		],
		test: "test/human-merge-observation-forge.test.ts",
		pattern: "HF01",
	},
	{
		name: "authoring-craft-omitted",
		expect: /author receives reusable channel craft/,
		behavior: "render no reusable verification authoring craft to the author",
		edits: [{ file: "src/engine/runtime.ts", find: "verificationAuthoring: VERIFICATION_AUTHORING,", replace: "" }],
		test: "test/verification-authoring.integration.ts",
		pattern: "VA1-VA3",
	},
	{
		name: "authoring-legacy-path-ignored",
		expect: /authored legacy asset checked at A/,
		behavior: "check the default .render/verify.md instead of the explicitly selected legacy asset",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "captured.source.entries.find((e) => e.path === selected.path",
				replace: 'captured.source.entries.find((e) => e.path === ".render/verify.md"',
			},
		],
		test: "test/verification-authoring.integration.ts",
		pattern: "VA1-VA3",
	},
	{
		name: "authoring-unproven-hidden",
		expect: /missing prerequisite and failed journey are visible/,
		behavior: "leave a stopped author's blocker generic, hiding its unrun and failed rows",
		edits: [
			{ file: "src/engine/runtime.ts", find: '((await this.#unproven(a)) ?? "role_did_not_submit")', replace: '"role_did_not_submit"' },
		],
		test: "test/verification-authoring.integration.ts",
		pattern: "VA4-VA5",
	},
	{
		name: "bug-intake-without-reproduction",
		expect: /must not reach intake/,
		behavior: "stage a bug intake whose human Ground lacks the reproduction or expected correction",
		edits: [{ file: "src/kernel/intake.ts", find: 'if (m.shape === "bug") {', replace: "if (false) {" }],
		test: "test/accepted-contracts.test.ts",
		pattern: "BJ03",
	},
	{
		name: "bug-intake-unfaithful-reproduction",
		expect: /must not stand in for the reproduction/,
		behavior: "accept a bug intake whose reproduction is missing, weakened, invented or not a behavior obligation",
		edits: [
			{
				file: "src/kernel/intake.ts",
				find: '\t\t\tm.reproduction?.observed !== r.observed ||\n\t\t\tm.reproduction.expected !== g.expected ||\n\t\t\t!m.slices[0]!.obligations.some((o) => o.id === m.reproduction!.obligation && o.kind === "behavior")\n',
				replace: "\t\t\tfalse\n",
			},
		],
		test: "test/accepted-contracts.test.ts",
		pattern: "BJ04",
	},
	{
		name: "bug-setup-failure-counts-as-red",
		expect: /must be reported, not claimed as red/,
		behavior: "treat any failing regression row as red-on-the-bug, whatever its output shows",
		edits: [{ file: "src/kernel/implementation.ts", find: "`${s.stdout}${s.stderr}`.includes(observed)", replace: "true" }],
		test: "test/bug-journey.test.ts",
		pattern: "BJ08",
	},
	{
		name: "bug-audit-without-reproduction",
		expect: /must not reach Audit without a reproduction/,
		behavior: "capture Audit source A of a bug pass with no red-on-the-bug reproduction",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: '\t\t\t\t\tc.kind === "audit" &&\n\t\t\t\t\tbug &&\n',
				replace: '\t\t\t\t\tc.kind === "audit" &&\n\t\t\t\t\tfalse &&\n',
			},
		],
		test: "test/bug-journey.test.ts",
		pattern: "BJ11",
	},
	{
		name: "bug-reproduction-after-audit",
		expect: /a reproduction after A is not pre-fix evidence/,
		behavior: "record a reproduction after Audit source A, when product code may already exist",
		edits: [
			{
				file: "src/kernel/roles.ts",
				find: 'if (pass.captureA)\n\t\t\t\t\t\treturn yield* Effect.fail(refusal("assignment_closed", "Reproduction precedes product code',
				replace: 'if (false)\n\t\t\t\t\t\treturn yield* Effect.fail(refusal("assignment_closed", "Reproduction precedes product code',
			},
		],
		test: "test/bug-journey.test.ts",
		pattern: "BJ11",
	},
	{
		name: "readiness-ignores-unfinished-slice",
		expect: /unfinished Slice/,
		behavior: "a required Slice without recorded qualifying integration is not a readiness gap",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: "const gaps = slices.filter((s) => !done.includes(s.id))",
				replace: "const gaps = slices.filter((s) => s.record && !done.includes(s.id))",
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR02",
	},
	{
		name: "readiness-ignores-record",
		expect: /an unfinished Record Slice is a gap/,
		behavior: "an unfinished Record Slice does not block ready promotion",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: "const gaps = slices.filter((s) => !done.includes(s.id))",
				replace: "const gaps = slices.filter((s) => !s.record && !done.includes(s.id))",
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR03",
	},
	{
		name: "readiness-ignores-publication",
		expect: /unpublished current source/,
		behavior: "a canonical head not yet published to the PR counts as eligible",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: "\telse if ((p.remote?.head ?? null) !== head) gaps.push(`awaiting publication: ${head}`);\n",
				replace: "",
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR02",
	},
	{
		name: "ready-admits-without-reobservation",
		expect: /no admission before reobserving the PR/,
		behavior: "a ready promotion is admitted without reobserving the associated PR on the exact head",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: '\t\t\t\tif (!op.checked)\n\t\t\t\t\treturn refusal("stale_basis", "Reobserve the associated PR open and draft on the exact published head before admitting.");\n',
				replace: "",
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR04",
	},
	{
		name: "ready-lost-reply-any-ready",
		expect: /ready on a changed head is not success/,
		behavior: "any ready listing satisfies an unknown promotion, whatever head the PR shows",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: '&& exact && !seen.draft) op.status = "satisfied";',
				replace: '&& seen && !seen.draft) op.status = "satisfied";',
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR06",
	},
	{
		name: "ready-partial-draft-resends",
		expect: /a partial observation that still says draft keeps it unknown/,
		behavior: "an incomplete listing that still says draft settles an unknown promotion for a fresh dispatch",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: 'exact && o.proposals!.complete) op.status = "unapplied";',
				replace: 'exact) op.status = "unapplied";',
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR07",
	},
	{
		name: "ready-flag-certifies-new-source",
		expect: /the ready flag does not bless new source/,
		behavior: "an observed ready PR makes the proposal eligible whatever its current scope and source",
		edits: [
			{
				file: "src/kernel/publication.ts",
				find: '\tif (!head) return [...gaps, "no qualifying integration"];\n',
				replace: '\tif (!head) return [...gaps, "no qualifying integration"];\n\tif (p.association?.draft === false) return [];\n',
			},
		],
		test: "test/automatic-readiness.test.ts",
		pattern: "AR08",
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
