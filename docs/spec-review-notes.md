# Spec walkthrough and human annotations

Started: 2026-10-24.
Source: `docs/spec.md`.
Source SHA-256 at session start: `ffa0fff16566d2e245db04203b50b216e81e35c47dad3b263f8eefb2aa67dd93`.

## Purpose and handling

Understand the spec step by step and preserve the human's disagreements and questions for a different agent to use when revising the design. This session does not change or accept the design. Explanations, questions, and silence do not constitute approval. Give design opinions only when the human requests them.

For each annotation, retain a stable ID, source section and quoted anchor, the human's wording, and its status. Distinguish a question, disagreement, requested revision, and explicit decision. Mark any interpretation or proposed wording as such; do not convert uncertainty into a decision. Preserve unresolved questions and do not resolve them on the human's behalf.

## Position

The human said the opening status/outcome explanation "makes sense" and requested the single-host rule next. This records understanding, not design acceptance.

The human also said the single-host explanation "makes sense" and requested continuation. This records understanding, not design acceptance.

The human said Ground "makes sense" and requested Seams next. This records understanding, not design acceptance.

The human said Seams "makes sense" and requested Modules next. This records understanding, not design acceptance.

Continued 2026-10-25: the human requested configurable delegation (A003), then continuation beyond Modules.

The human said the Proposal explanation otherwise "makes sense", added the forge-adapter requirement (A004), and requested continuation. This records understanding, not overall design acceptance.

The human said the project-verification explanation "makes sense" and requested continuation. A001 remains a requested revision; this does not resolve its missing details or accept the design overall.

The human said Contract change rules are "all clear" and requested continuation. This records understanding, not overall design acceptance.

The human said Record "makes sense" and requested editable checkpoints and annotations next. This records understanding, not overall design acceptance.

The human said editable checkpoints and annotations are "all good" and requested continuation. This records understanding and no new concern, not an explicit acceptance of the proposed design.

The human added the fresh implementer-context requirement (A005), deferred a concern about network denial (A006), and requested continuation.

The human requested a configuration-tunable automatic rework limit and explicitly accepted two as its default (A007), then requested continuation. This is scoped acceptance of that default, not overall design acceptance.

The human promoted A008 to a requirement and requested investigation of deterministic incorporation/conflict routing before Watchdog, then continuation.

The human requested publication simplification (A009) and advisory human verification with automatable interaction support (A010, extending A001), then continuation.

The human specified personal macOS home-server/tailnet deployment and non-expiring revocable enrollment (A011), server-only design with separately designed GPUI/TUI clients (A012), and evaluation of four named Pi extensions (A013), then requested continuation.

The human said the representative histories "make sense" and requested the source register and invariant catalogue next. This records understanding, not overall design acceptance.

The human said the source register and I1–I3 explanation "make sense" and requested I4–I6 next. This records understanding, not overall design acceptance.

The human said I4–I6 "make sense" and requested I7–I10 next. This records understanding, not overall design acceptance.

The human said I7–I10 are "all good" and requested continuation. This records understanding and no new concern, not explicit overall design acceptance.

The human said I11–I15 are "all good" and requested continuation. This records understanding and no new concern, not explicit overall design acceptance.

The human said I16–I20 "make sense" and requested continuation. This records understanding, not overall design acceptance.

The human said the policy/conceptual-record explanation "looks good" and requested continuation. This records understanding and no new concern, not explicit overall design acceptance.

The human said the deliberate redesigns "make sense" and requested continuation. This records understanding, not overall design acceptance.

The human requested confirmation that modules would be covered independently. The agreed walkthrough order is Commitments → Record → Work → Sandboxes → Effects, covering responsibility, interface, inputs/outputs, rules, failure behavior, interactions and unspecified details. The human then requested Commitments.

Continued 2026-10-26: the human reaffirmed pure-function state transitions as the key architectural decision, requested alternative names for Commitments, and selected Kernel (A014). This is an explicit naming decision and statement of architectural intent.

The human requested continuation after choosing Kernel.

The human requested alternatives to the module name Record, then selected Ledger and requested continuation (A015). Use Kernel (draft: Commitments) and Ledger (draft: Record module) from here onward.

The human said Ledger part 2 is "all good" and requested Work next. This records understanding and no new concern, not overall design acceptance.

The human selected Engine as the replacement for Work and requested continuation (A016). Use Kernel (draft: Commitments), Ledger (draft: Record module), and Engine (draft: Work) from here onward.

The human clarified that worker internet access is a routine need for dependency/package downloads and documentation research. A006 is now an explicit requirement to revise the blanket no-network default; exact network policy remains open.

The human said source preparation/capture "makes sense and looks good", noted an initial over-engineering impression and an "orbs" association (A017), and requested continuation.

The human placed the forge adapter within Effects as a decoupled submodule (A018), asked about ownership/storage of the original Git contract ledger (A019), and authorized continuation otherwise.

The human said Effects is clear, but raised significant concerns about document/history storage, Git guarantees, disaster recovery and a future eval dataset, and explicitly requested thorough re-evaluation of the storage trade-offs (A020).

The human confirmed proceeding after A020 was recorded. The storage recommendation remains open for later architectural investigation; no backend was selected.

The human said the §5.1 host startup/access explanation is "all clear" and requested continuation. This records understanding, not overall design acceptance.

The human said the §5.3 command/receipt/observation explanation is "good" and requested continuation. This records understanding, not overall design acceptance.

The human said cancellation/ownership retention "makes sense", reopened A005 as an evaluation question rather than a fresh-context requirement, requested comparison of durable worker lanes and other alternatives (A021), and requested continuation.

The human said the §10 recovery-sequence explanation is "all clear" and requested continuation. This records understanding, not overall design acceptance.

The human prioritized RPO over RTO, described the battery-backed laptop host and personal self-hosting scope, endorsed the failure-model framework as a mental model while accepting unavoidable limitations, and requested continuation (A022). This does not select a numeric loss window or accept all existing production gates.

The human said the §10 version-policy explanation is "great" and requested continuation. This records understanding, not overall design acceptance.

The human said the first two §11 traces "make sense" and requested the remaining traces. This records understanding, not overall design acceptance.

The human said the remaining §11 traces "make sense" and requested §12 evidence/prototype results. This records understanding, not overall design acceptance.

The human said the four-prototype evidence explanation "makes sense" and requested the prototype/design differences and independent challenge findings. This records understanding, not overall design acceptance.

The human said the §12 prototype/design differences and independent challenge explanation "makes sense" and requested continuation. This records understanding, not overall design acceptance.

The human said §13's verification approach and V1–V4 explanation "makes sense" and requested continuation. This records understanding, not overall design acceptance.

The human requested that second-machine tests remain optional, be deprioritized and deferred to future versions, and requested continuation (A023). This supersedes the physical second-device initial release gate in §14, not the local protocol tests.

Current topic: final §14 staged implementation and decisions, completing the section-by-section walkthrough. §13 V1–V9/optional lab, §12 evidence/deltas/challenge/reproducibility, all §11 traces/failure coverage, module composition, Pi Durable's underlying persistence/execution role, §5 host startup/access/protocol, §6 cancellation/ownership retention and §10 recovery/failure models/version policy have been explained. All five individual modules and the full design journey/invariant catalogue have been covered. The Pi Durable clarification was explicitly requested without an annotation; no new design decision was recorded. The source spec remains unchanged; A001–A023 preserve the human's annotations and their current status for the later design agent. A005 was reopened and is no longer a settled fresh-context requirement. No overall design acceptance, implementation or migration has been authorized. This walkthrough has not rerun the external prototype lab; distinguish spec-reported historical evidence from new verification. Use Kernel, Ledger and Engine as chosen names. A023 defers physical second-machine validation; A022 sets personal-tool proportionality and data preservation priority; A005/A021 reopen worker-context strategy for durability-first evaluation; A020 reopens document storage/history/recovery; A006 supersedes blanket worker internet denial; A009/A010 supersede descriptive-issue publication and formal manual-attestation merge gates; A011/A012 supersede expiring-enrollment and web-client assumptions in the current draft.

## Human annotations

### A001 — Project-tailored verification and reducing human involvement

- **Type/status:** explicit requested design revision, awaiting implementation by the later design agent. The walkthrough has now returned to the existing project-verification requirements in §8; the requested missing details remain unresolved.
- **Source anchors:** §3.1: "`verification-skill`"; §8 / Proposal: "The repository's verification instructions define an ordered evidence ladder and a runnable catalog"; §13: "Lean verification strategy and acceptance targets".
- **Human wording:** "I haven't seen about verification and the \"verification skill\" that the original design also aimed to introduce (I basically borrowed ideas from pstack to free the human more from the loop like pstack does, and project-tailored verification is crucial). Not sure if it is mentioned later in the spec though."
- **Intent to preserve:** the human identifies project-tailored verification as crucial and describes reducing human involvement as motivation for borrowing ideas from pstack. This is not authorization to remove any particular human gate.
- **Follow-up human wording:** "You said: \"The document does not enumerate the concrete ladder levels or fully describe who creates, maintains, and updates that skill\" and that is something I want the spec to contain and describe clearly, as it is a key piece of the workflow."
- **Requested revision:** clearly describe the concrete verification evidence-ladder levels and who creates, maintains, and updates the project-tailored verification skill. Preserve verification as a key workflow component. The specific levels and responsibility assignments have not yet been chosen in this session.
- **Later extension (A010):** verification must support project-specific scripts/tools and interaction hooks, with source designed to permit automated interaction-based checks. Human usability/verification notes remain visible but formal human completion records must not gate merge validity. Preserve this extension when defining the skill and ladder; do not frame UI interaction as inherently human-only.
- **Textual clarification:** §3.1 names the historical verification-skill work. §8 requires repository-specific verification instructions, an ordered evidence ladder, a runnable catalog, obligation-to-check references, independent implementer/Watchdog execution, and source/verifier-bound receipts. §13 specifies verification of Render itself, a distinct subject.
- **Still unresolved:** the actual ladder levels, skill creation/maintenance/update responsibilities, and whether the resulting workflow fully captures the intended original skill and degree of autonomy. No comparison with the original skill or pstack has been performed in this walkthrough. The human explicitly requested continuing with Ground and returning to verification later.

### A002 — Task-specific playbooks and shortened paths

- **Type/status:** stated expectation/assumption, to confirm when reviewing task playbooks; not yet an explicit requested revision or chosen skip policy.
- **Source anchor:** §8 / Ground: "bug/performance/change work can use smaller commitments rather than unnecessary design ceremony".
- **Human wording:** "makes sense, about shortened paths, each playbook (e.g. bug, investigation etc) I'm assuming contains those instructions that might skip ceremony if needed. Again, all that is borrowed from the original design-workflow proposal in skl (skills project) and pstack".
- **Expectation to preserve:** task-specific playbooks, such as bug and investigation playbooks, contain instructions defining shortened paths and when ceremony may be skipped. The human identifies the original skl design-workflow proposal and pstack as sources of this expectation.
- **Unresolved/deferred:** confirm what the spec actually defines, what the original sources require, and which stages/gates each playbook can omit. Do not infer a general waiver of mandatory integrity or human decision gates. The human requested proceeding to Seams without resolving these details now.
- **Revisited during Work:** the current spec names fixed workflow policy, role instructions and task-shape-dependent smaller commitments, but does not enumerate concrete bug/investigation/etc. playbooks and their shortened paths. The original sources have not been independently rechecked in this walkthrough. The expectation remains unresolved rather than silently treated as specified.

### A003 — Configurable delegation dial as trust grows

- **Type/status:** explicit requested design revision, awaiting implementation by the later design agent.
- **Source anchors:** §1: "Explicit Modules-stage delegation may be added"; §14: "Human final Contract acceptance; possible explicit Modules delegation later"; §3.2 policy/delegation rules; §8 / Modules.
- **Human wording:** "Yes, modules delegation is something that should be possible. think about it as a dial, that can be tuned without changing the code, by config. That let's me start from the most \"untrusting position\" where I still want to be more in the design loop as I gain trust on the workflow, and eventually dial it in so I delegate more of the process as trust gets build."
- **Requested revision:** support configuration-driven degrees of delegation, explicitly including Modules, without requiring code changes. Enable starting with extensive human involvement and progressively delegating more of the process as the human gains trust. Treat this as requested capability, rather than leaving Modules delegation as merely a possible later addition.
- **Unresolved:** exact dial levels, whether the controls are one setting or several, scope across stages/decision types, and treatment of the spec's currently fixed human gates. The later design must reconcile the configurable-delegation request with those existing statements; this session has not selected which additional gates are delegable or authorized any live delegation.
- **Session direction:** record the note and continue the walkthrough; do not design the configuration mechanism now.

### A004 — Provider-neutral forge adapter seam

- **Type/status:** explicit design requirement to preserve in revision; detailed discussion deferred to the forge/effects sections.
- **Source anchors:** §8 / Proposal: "publishing descriptive issues is a separate effect"; §4 / Effects; §9.2 operation rules and §9.3 integration/publication.
- **Human wording:** "as you said github issues are separate and should not stop the actual workflow. In fact, the seam for github or other forgers must be correctly defined as a *forge adapter seam* of some sort, which I assume is discussed later. That way nothing in the workflow knows or need to know about github or gitlab or whatever else, and adapters are easily swappable."
- **Requested behavior:** descriptive issue publication is separate from workflow progress and must not gate the actual workflow. Define a clear forge adapter boundary hiding provider-specific details from the workflow, so GitHub, GitLab or other forge adapters can be swapped easily.
- **Placement chosen later (A018):** the forge adapter is a submodule of Effects with its own responsibility and decoupling.
- **Textual context:** the current design puts effects behind an Effects module, but its descriptions and concrete publication rules explicitly name Git/GitHub. A fully specified provider-neutral adapter contract and swappability have not been established in this walkthrough.
- **Unresolved/deferred:** exact interface and provider-neutral semantics, provider capability differences, and the distinction between nonblocking descriptive publication and later required source-publication/final-readiness gates. Do not infer that this note removes every external-effect gate. No request to implement multiple providers now has been recorded.

### A005 — Evaluate fresh implementer contexts (original requirement reopened)

- **Type/status:** originally an explicit fresh-context requirement; subsequently reopened by the human as an investigation question. Do not enforce fresh implementer contexts as an already settled requirement. See A021 for the requested durability-first comparison.
- **Source anchors:** §6.1 assignment packets and workflow-owned tasks; §6.2 Implementer / Audit role. The current text explicitly requires fresh Audit and Watchdog contexts but does not expressly state the same starting-context rule for implementers.
- **Human wording:** "Not sure if it is mentioned further in the spec, but implement workers, even when they can also feed on the durable state, must start with a fresh context. Passed work packets and durable state is what it starts with."
- **Original requested behavior, retained as an alternative rather than the current requirement:** each implementer worker starts with a fresh context populated from its passed work packet and accessible durable state, rather than inheriting the preceding conversation. Reading retained findings, directions, evidence and progress through durable state remains allowed.
- **Reopening rationale:** this approach came from the old skl workflow where workers were not durable. The new strategy should be evaluated from the capabilities and best use of durable workers rather than carry over that constraint automatically.
- **Unresolved:** fresh starts versus durable context continuity, worker lanes and other alternatives; exact relationship between new workers, replacement attempts, resumption and compaction. No context strategy has been selected; no request to discard durable progress or prevent reading historical artifacts has been made.

### A006 — Routine worker internet access; revise blanket network denial

- **Type/status:** explicit capability requirement following discussion of the original concern. Revise the blanket network-disabled default; detailed network policy remains unspecified.
- **Source anchors:** §1 worker defaults; §7.1 baseline profile (`--network none`) and separately authorized network-required profiles; §14 decisions requiring acceptance.
- **Human wording:** "Separately: we will discuss containment later, but I'm doubtful about the network access block that you mention here."
- **Follow-up human wording:** "in general the worker is very likely to need access to the internet. It will need to download dependencies and packages, it might need to check online documentation before implementing etc."
- **Required revision:** support internet access as a normal worker capability for dependency/package downloads and documentation/research. The baseline must accommodate ordinary development needs rather than require an exceptional manually provisioned network profile for each routine download or lookup. Images/caches can support that workflow but cannot be its sole assumed dependency-access path.
- **Concern to preserve:** revisit whether the proposed network block is appropriate and how real implementation/verification needs are supported. Do not treat the existing default as accepted by the human.
- **Session direction:** record the concern and continue to Watchdog; do not resolve containment or select network permissions now.
- **Revisited during Sandboxes:** explain the current proposed network-disabled execution profile, preprovisioned image/cache dependency approach, and separately authorized profile provision. Distinguish host-side provider/research tools from network access by container commands. The spec defines host-side model calls, but does not establish the named web extension's integration or a concrete alternative network-enabled profile. No revised network policy has yet been selected.
- **Remaining questions:** precise outbound policy, private/tailnet/host-service access for verification, and role/tool-specific networking. The user has established the ordinary internet-access requirement, not chosen endpoint restrictions, credential forwarding, or a network implementation. Keep this aligned with A013 research-tool compatibility and A010 interaction-based verification.

### A007 — Configurable automatic rework limit; default two accepted

- **Type/status:** explicit requested configuration capability; human acceptance of two completed reviews as the default.
- **Source anchors:** §3.2: "The initial automatic rework budget is two completed reviews"; §1 Figure 1; related configurable delegation intent in A003.
- **Human wording:** "a note on the rework limit: it should be also a config-tunable nob, default of *two* is ok, but I should be able to change that limit through config without having to change the code."
- **Requested behavior:** expose the automatic rework limit as a configuration setting changeable without editing code. Keep two completed reviews as the default, which the human explicitly said is acceptable.
- **Scope:** the human changed configurability and accepted the default; no change to completed-review counting, interruption/dedup handling, valid-pass admissibility, or immediate Needs Human handling was requested.
- **Unresolved:** configuration location/scope, allowed values, and when changes apply to active work. Do not select these details on the human's behalf.

### A008 — Detect and incorporate target drift before Watchdog where possible

- **Type/status:** explicit requested requirement, with investigation of the concrete mechanism required before treating it as established.
- **Source anchors:** §9.3 exact reviewed source/target and expected-old integration; §6.1–6.2 Work, implementer and Watchdog; §8 Figure 9 target-change consequences.
- **Human wording:** "can't target head drift be detected before B is reviewed by watchdog, so the review happens with T+A already incorporated into Bs work (assuming again, no conflicts, and that A merged to proposal before B finished)".
- **Question to preserve:** when the proposal target advances while a worker is active, can that be detected and incorporated before Watchdog reviews the submitted work, avoiding a review on a target already known to be outdated?
- **Follow-up human wording:** "It should at least be investigated but yes I think of it as a requirement. wasting a watchdog review round when its known before hand it can't be integrated makes no sense."
- **Requested behavior:** detect known target drift and prepare the combined source before invoking Watchdog. Investigate programmatic, deterministic incorporation: when conflict-free, submit the incorporated source (T+A+B in the example) for required verification/review; when Git detects conflicts, route directly to implementer rework without invoking Watchdog or requiring a reasoning agent to identify the conflict.
- **Original-workflow context supplied by human:** in the original skl workflow, Watchdog incorporated the target first; it reviewed the incorporated source when conflict-free and returned conflicts for rework without further review. This is the human's account; the original source has not been independently inspected during this walkthrough.
- **Clarification of current text:** Effects owns deterministic integration mechanics; Record validates authority/eligibility and records outcomes; Work schedules work. Current §9.3 requires the reviewed source to include the expected target and forbids source recomputation/conflict resolution after review. It does not explicitly define a pre-Watchdog target-refresh step. A clean merge still creates a different combined source; a fast-forward alone cannot combine the divergent A/B histories in the illustrative example.
- **Unresolved:** concrete deterministic incorporation method, exact module ownership/timing and execution boundary, required verification on the incorporated source, and handling of additional target movement during review. A conflict detected without invoking Watchdog is not a completed Watchdog review; any separate preparation/retry accounting remains unspecified. The final integration guard still addresses later target movement under the current design. Do not treat the requested mechanism as already verified or invent its implementation now.

### A009 — UI contains detailed workflow state; publish only the proposal PR

- **Type/status:** explicit requested simplification, superseding descriptive slice-issue/status publication requirements in the current draft.
- **Source anchors:** §1 web client; §5.2 UI; §8 descriptive-issue publication; §9.2 latest-view prose and issue/PR effects; §9.3 source publication/final package.
- **Human wording:** "Since now we will have a client UI, there is no need for descriptive issues getting in the way even if they are best-effort or asynchronous. The UI will contain all the relevant slice information for me, the human to see, including status, contracts, reports etc."
- **Further human wording:** "The main and only published items that make more sense to me to keep is the final proposal PR, since it is the endpoint for me to finally merge into main. That's the one we will likely want to be published against, but again, without blocking local work"; "proposal status should also be available in the UI thus forge presentation of the proposal PR becomes a lower resolution summary of what you can see in the UI."
- **Requested behavior:** remove descriptive issues as published workflow artifacts, including best-effort/asynchronous issue mirroring. Present detailed Slice and proposal information (status, Contracts, reports, etc.) in the client UI. Retain the proposal-level PR and its supporting source publication as the endpoint for the human main merge. Its forge presentation is a lower-resolution summary of UI information; publication must not block eligible local work.
- **Relationship to A004:** retain the provider-neutral forge adapter seam, with its publication scope narrowed to what supports the proposal PR rather than a slice-issue mirror.
- **Later scope clarification (A012):** detailed UI contents inform required server views/protocol data, but the client UI itself is designed separately. This design must not expand into GPUI/TUI layout or client implementation.
- **Unresolved:** exact PR creation/update timing, summary contents and UI presentation. Do not infer that all source-publication correctness conditions or observed main-merge tracking are removed.

### A010 — Advisory human verification; project-tailored interaction automation

- **Type/status:** explicit requested revision, superseding formal human-verification completion records as a condition of merge validity.
- **Source anchors:** §6.2 Human/Watchdog; §8 verification and Manual Verification; §9.2 main-merge observation; §9.3 final-readiness/manual-attestation gates; §13 acceptance; related A001.
- **Human wording:** "Usability assessment and human-owned verification should be noted but should not require a formal record of completion for the merge to main to be valid."
- **Further human wording:** "The idea is that overtime the verification skill can test most of the UI interaction since it can involve custom scripts or tools that allow for interface interaction, and the source code should be built to allow that. That's something coming from pstack as well."
- **Requested behavior:** retain visibility of usability assessments and suggested human verification, but do not require formal completion attestations to make a main merge valid. Revise the corresponding readiness/merge-gap rules consistently. Support verification through project-tailored scripts/tools and interaction entrypoints, and design source so these checks can exercise relevant behavior. Do not assume interface interaction always requires a human.
- **Examples supplied by human:** verification interacting with a running Elixir BEAM to simulate UI interaction; analogous entrypoints in JavaScript projects. These illustrate project-specific verification channels, not a requirement to choose a particular framework or implement these examples in Render.
- **Scope and unresolved details:** this request changes human-completion gating; it does not remove automated verification, independent review, or truthful recording of the source actually merged. Exact skill procedures, evidence classification and interaction-hook design remain to be specified. Do not mark a suggested human check as performed when it was not.

### A011 — Personal private-tailnet deployment and non-expiring enrollment

- **Type/status:** explicit requested revision of deployment/authentication assumptions and defaults.
- **Source anchors:** §1 single host and enrollment/session defaults; §5.1 deployment, enrollment and renewal; §14 security/production assumptions.
- **Human wording:** "This is not aimed to be an enterprise solution but a personal self-hosted tool. I'll be the first user, the host will be deployed into home-server (osx) and access to it is only possible through a private tailnet."
- **Further human wording:** "Enrollment definitely might still be revocable but I would say it should not expire. For session, if the session token/access is renewed automatically that is fine, but I'm not looking forward to add special security machinery for something I'm selfhosting and not making available to the internet. If in the future that changes, then it can be incorporated then."
- **Requested behavior:** design for a personal self-hosted macOS home-server reachable only through the private tailnet. Device enrollment does not expire; revocation remains supported. Session/access renewal may happen automatically without recurring manual laptop registration. Keep authentication/session machinery proportionate to this concrete deployment and defer additional machinery for public/enterprise deployment until that scope exists.
- **Unresolved:** precise session lifetime/renewal/authentication mechanism. The human did not request eliminating all authentication or selecting a particular credential implementation. Revisit browser-specific assumptions alongside A012.

### A012 — Server-only design and stack-independent client protocol

- **Type/status:** explicit scope correction, replacing the proposed small web client as a deliverable of this design.
- **Source anchors:** §1 web-client default; §5.1 browser-oriented session/transport assumptions; §5.2 client experience; §5.3 command/receipt/snapshot protocol; §14 client-related stages.
- **Human wording:** "I'm planning to build a GPUI desktop client much more capable and that will be designed separately. So this particular design sure needs to assume or have in mind that the UI will do but not design the UI client itself. The focus should be to settle with a well design wire format that makes an stateless client easy to build, regardless of the stack. In fact, a TUI client is also in scope for the project, although again, not the scope for this design. This design focuses on the server side."
- **Requested behavior:** focus this design on the server, protocol and client-facing capabilities. Define a well-designed stack-independent wire format making stateless clients easy to implement. Account for required interactions/data without designing the UI itself. GPUI desktop and TUI clients are project goals with separate designs; no small web-client implementation/design is included here.
- **Consequences to reconcile:** browser-only cookies, Origin/CSRF assumptions, rendering/CSP prescriptions, web wireframes and client-specific implementation stages must be scoped appropriately rather than treated as universal server/client requirements. Retain explicit server state/command/observation semantics and client reconnection support.
- **Unresolved:** concrete protocol/authentication transport choices and the separately designed clients' detailed presentation.

### A013 — Evaluate and include the needed Pi extension capabilities

- **Type/status:** explicit compatibility-investigation requirement; no installation or compatibility conclusion recorded in this walkthrough.
- **Source anchors:** §1 ordinary Pi-extension non-goal; §5.2 runtime/extension compatibility; §6.1 explicit worker capabilities; §7.1 network/profile assumptions; §12 pinned-runtime evidence; related A006.
- **Human direction:** existing Pi extensions cannot be assumed compatible with the Durable host, but a minimal named set should be included and evaluated for actual compatibility/capability coverage.
- **Named extensions and purposes as supplied by the human:**
  - `pi-web-access`: design research and other web use; compare with native Durable-agent web capability if present. The human expects this extension may be more complete and connects the requirement to the concern about implementer network denial.
  - `pi-fff`: better local codebase search for agents.
  - `pi-better-compaction`: compaction better suited to the human's predominantly OpenAI-model usage.
  - `pi-claude-bridge`: make the human's Claude models available to the workflow.
- **Requested behavior:** evaluate these concrete integrations against the pinned runtime and desired role capabilities; account for them in the server/runtime design rather than excluding all ordinary Pi extensions categorically. If native equivalents cover a need, establish that from actual capability/compatibility evidence.
- **Unresolved:** exact extension sources/versions, APIs, Durable compatibility, role-specific access, network/tool boundaries and whether a compatible adapter or native equivalent is required. The purposes above are human-supplied expectations, not independently verified package capabilities.
- **Scope:** evaluation belongs to the later design revision/runtime discussion. No request to install extensions during this explanatory walkthrough or to copy broad inherited tools/credentials into workers was made.

### A014 — Rename Commitments to Kernel; preserve the pure state-machine boundary

- **Type/status:** explicit human naming decision and reaffirmed architectural requirement, recorded 2026-10-26. Apply in the later design revision; the source spec remains unchanged during this walkthrough.
- **Source anchors:** §4 Commitments interface/responsibilities and Figure 3; §3.2 domain integrity enforcement; §5.4 pure transformations within the accepting transaction; §13 V1; corresponding terminology throughout the spec.
- **Human architectural wording:** "the \"state machine based in pure functions\" is the key design decision here, it decouples state transitions from the loop which makes it easier to test and evolve, and this module responsibility is only to compute the right next state given the inputs + current state."
- **Human naming decision:** "Let's settle on \"kernel\" then".
- **Required revision:** rename the module currently called Commitments to Kernel consistently across its interface descriptions, owner references, diagrams and verification discussion. Describe it as Render's pure workflow state machine: given explicit inputs and current state, compute the appropriate next state independently of the orchestration loop. Keep persistence, model/runtime calls, scheduling and external side effects outside this module.
- **Scope:** this decision establishes the name and responsibility boundary. It does not select implementation language, a state-machine library, a generic framework, or the final detailed state/decision schemas.

### A015 — Rename the Record module to Ledger

- **Type/status:** explicit human naming decision, recorded 2026-10-26. Apply in the later design revision; the source spec remains unchanged during this walkthrough.
- **Source anchors:** §4 Record module/interface and Figure 3; §3.2 owner references; §5 command/observation/artifact/persistence responsibilities; corresponding module references throughout the spec.
- **Human wording:** "let's settle on \"ledger\". and continue".
- **Required revision:** rename the module currently called Record to Ledger consistently across module descriptions, interfaces, ownership references and diagrams. Preserve its role accepting authorized commands, invoking Kernel, atomically recording outcomes/tasks/receipts, and serving scoped views and retained artifacts.
- **Terminology scope:** this decision renames the server module. The separate Record workflow stage was not the subject of the naming discussion; do not mechanically rename that phase or ordinary uses of the verb "record".
- **Scope:** Ledger does not imply Git-ledger files, event-sourced state reconstruction, or a raw database-only interface. No responsibility or storage-mechanism change was selected with the rename.

### A016 — Rename Work to Engine

- **Type/status:** explicit human naming decision, recorded 2026-10-26. Apply in the later design revision; the source spec remains unchanged during this walkthrough.
- **Source anchors:** §4 Work module/interface and Figure 3; §6 scheduling, packets, tasks, provider/tool configuration and lifecycle; corresponding ownership/composition references throughout the spec.
- **Human wording:** "let's use \"engine\". And continue".
- **Required revision:** rename the module currently called Work to Engine consistently across module descriptions, interfaces, ownership references and diagrams. Preserve its responsibilities for scheduling eligible activity, rendering assignment packets, configuring role execution, provider calls and Durable task supervision/recovery.
- **Terminology scope:** rename the module, not ordinary uses of the word "work". This naming decision does not merge Engine with Kernel, Ledger, the Durable runtime, or worker execution environments.

### A017 — Initial containment complexity impression and "orbs" analogy

- **Type/status:** human observation/open concern, not an instruction to simplify a specific mechanism or adopt a particular platform.
- **Source anchors:** §4 Sandboxes; §7 execution profiles, literal materialization and sealed capture.
- **Human wording:** "makes sense and looks good. It looks a bit over-engineered on a first pass, but reminds me to the idea of running agents in \"orbs\"."
- **Observation to preserve:** the containment/capture design is understandable but initially appears potentially over-engineered to the human. The human associates it with running agents in "orbs".
- **Unresolved:** what the human specifically means by "orbs" and which complexity, if any, they want reduced. Do not infer that they selected OrbStack, VMs, a new execution architecture, or removal of particular checks from this analogy.
- **Session direction:** retain the note and continue to Effects.

### A018 — Forge adapter is a decoupled Effects submodule

- **Type/status:** explicit architectural placement decision, extending A004.
- **Source anchors:** §4 Effects module; §9 forge operations; related A004/A009.
- **Human wording:** "I'd say that the forge adapter can be a submodule of Effects, keeping its own responsibility and decoupling."
- **Required revision:** define the provider-neutral forge adapter as a submodule within Effects. Preserve its own responsibility/interface and decoupling so provider-specific behavior does not leak into the workflow. This does not require a sixth top-level module or a separate deployed service.
- **Unresolved:** the exact adapter contract and per-provider capability mapping still need definition and verification.

### A019 — Clarify Contract ledger storage and ownership

- **Type/status:** clarification question about the current design, followed by the explicit re-evaluation requirement A020. No particular replacement storage architecture selected.
- **Source anchors:** §3.1 historical skl ledger paths; §3.3 Git-ledger redesign; §4 Ledger (draft Record); §5.4 shared Durable SQLite store and retained content; §8 Record workflow stage.
- **Human wording:** "I also have not seen mentioned yet about the contract ledger (the original git repo with contracts for slices, proposals, designs etc) neither I understood who owns it. Not sure if it is mentioned after or not."
- **Current-text explanation:** Render proposes a single transactional host authority rather than a second writable Git contract ledger. Ledger owns persistence/access for accepted Contracts, designs, proposals and associated retained records/content; Kernel computes valid transitions; Engine consumes assignment inputs. Git managed by Effects holds canonical proposal source and reviewed repository documents such as ADRs. The historical skl ledger paths are source references, not a defined Render directory layout.
- **Still unspecified:** exact stored document schemas/representation of full Contract/proposal/design text, compatibility with the original intent/behavior/plan layout, and optional human-readable exports. Read-only exports are allowed by the draft but a complete Git mirror is not specified.
- **Decision boundary:** explain the existing design before inferring whether the human wants a Git representation retained. The question alone does not authorize changing the storage authority or migration of the existing skl ledger.

### A020 — Re-evaluate document storage, immutable history, disaster recovery and eval use

- **Type/status:** explicit required architectural investigation/revision. The SQLite-centric document-storage recommendation is reopened; the human has not rejected SQLite or chosen Git/hybrid storage. This is a central unresolved decision, not an incidental implementation detail.
- **Source anchors:** §3.2 artifacts/Contract revisions/history; §3.3 Git-ledger replacement; §4 Ledger/Effects ownership; §5.4 shared store and external content-addressed files; §8 saved revisions/supersession; §10 durability/backup/restore; §12 probe limitations; §13 V7; related A019.
- **Human wording:** "the old git ledger provided a way to get immutable references to versions of documents. They informed workers and helped other designed sessions by looking at what was done already or superseded."
- **Further human direction:** "is not that I'm against the full-on sqlite approach, but I think it should be re-checked again thoroughly to ensure we are choosing the right tradeoffs"; "this is a very important part of the system and seems overlooked or \"not thought through\" enough".
- **Questions/requirements to address explicitly:**
  - Suitability and measured behavior of SQLite for text-heavy Contracts, proposals, designs and worker reports, including version retention and retrieval. Do not assume ordinary text documents need external storage merely because they are text-heavy.
  - Whether an additional immutable host-owned file store duplicates capabilities already supplied by Git (content identities, versions/history, references, inspection, transport), and what concrete burden each alternative adds/removes.
  - Disaster recovery after host loss or database corruption, including an off-host copy, exact database/document/artifact backup consistency, restore on a fresh machine, retained in-flight documents and explicitly bounded recovery loss. The human values the existing Git ledger's clone-based portability/recovery.
  - Complete recoverable document/workflow history for later workers and design sessions: original, revised, rejected/abandoned, accepted and superseded material and its relationships, with stable immutable references. Define the actual retention scope rather than promise unspecified "history".
  - A future eval dataset/harness must be able to inspect retained workflow history and documented outcomes to identify weaknesses and successful patterns. Define an accessible/exportable historical dataset and stable linkage/provenance; building the harness itself is not requested in this walkthrough.
- **Clarification:** SQLite does not inherently mean latest-state-only. The draft explicitly intends immutable facts, receipts, Contract revisions and saved document versions, but does not fully define/prove the complete historical document representation, recovery/export contract or eval usability. Keep that factual correction separate from deciding whether SQLite is the best architecture.
- **Required comparison:** evaluate SQLite-held immutable document revisions; SQLite plus the proposed external immutable artifact store; and SQLite runtime/authority metadata plus Git-backed versioned documents. An archival Git projection/export may also be considered, with its freshness and restore limitations explicit. Keep one authoritative host; Git-backed document storage need not introduce a second independent workflow writer.
- **Evidence needed before settling the recommendation:** concrete content/revision/reference schemas and ownership; representative text/history sizes and access patterns; end-to-end old-revision retrieval and worker/design-session reuse; backup/restore on a clean environment including referenced content; failure/corruption/missing-artifact handling; historical export suitable for evals; explicit complexity and cross-store crash-consistency trade-offs. Follow repository test/failure-case-before-implementation rules for any later probes.
- **Current evidence boundary:** same-store atomic state/document/task probes support a narrow advantage of SQLite, not the full storage/history/disaster-recovery choice. §10 and V7 name backup/restore goals but provide no completed restore proof. No new storage/restore experiments have been performed in this walkthrough.
- **Later prioritization (A022):** preserving work/RPO matters more than rapid restoration/RTO. Evaluate recovery trade-offs proportionately for a personal self-hosted tool and its battery-backed laptop host; do not turn this investigation into an enterprise availability or all-failures protection requirement. Exact acceptable loss and recovery times remain unspecified.
- **Verified reference material consulted for the factual response:** SQLite appropriate uses (`https://www.sqlite.org/whentouse.html`), text/BLOB limits (`https://www.sqlite.org/limits.html`), backup API (`https://www.sqlite.org/backup.html`), WAL persistent-state rules (`https://www.sqlite.org/wal.html`); Git object model (`https://git-scm.com/book/en/v2/Git-Internals-Git-Objects`) and clone/mirror semantics (`https://git-scm.com/docs/git-clone`). These establish capabilities, not Render-specific performance or recovery acceptance.

### A021 — Evaluate durable worker/context strategies and worker lanes

- **Type/status:** explicit investigation request, reopening A005; no alternative selected. Record for the later design revision and continue the walkthrough rather than conduct the comparison now.
- **Source anchors:** §6.1 workflow-owned conversations/tasks and resumable assignments; §6.2 role contexts/independence; §6.3 ownership retention and continuation; §10 recovery/task compatibility. Related A005 and the Pi Durable clarification.
- **Human alternatives to investigate:** independent fresh-context workers; "worker lanes: one watchdog lane, continuously running, always compacting and dispatching fresh context workers"; "The coordinator being that ever compacting lane that dispatches (not sure about this one, probably not the best idea)"; other available alternatives. Preserve the coordinator option as tentative, not a preferred architecture or a rejection.
- **Human rationale:** "the fresh context worker idea comes from skl old workflow where workers were not capable of being durable. Now they are so the strategy we design should be design with that mindset first, following what would be the best use of durability for the workflow."
- **Explicit change of status:** "this puts somewhat in question my earlier comment on fresh implement workers. Keep it there but more than a requirement, a question to evaluate against other alternatives as I mentioned."
- **Investigation scope:** compare context/continuity and dispatch strategies using actual durable-runtime capabilities. Clarify what a lane owns, whether it executes role work itself or dispatches independent workers, how compaction/resumption/replacement work, and the relationship to Engine scheduling and durable assignment ownership. Do not infer that a persistent lane must consume an execution slot while idle, or that durable execution requires an inherited model context.
- **Decision boundary:** no implementation, continuously active daemon, coordinator dispatch authority, automatic compaction strategy or worker topology was selected. The human has not explicitly removed independent review, role authority or candidate-blindness constraints; examine how alternatives interact with these rather than silently waive them. Detailed comparison and any further evaluation criteria remain work for the later design agent.

### A022 — Prioritize preservation over recovery speed; proportionate personal-tool resilience

- **Type/status:** explicit recovery/product priority and deployment context; scoped endorsement of the failure-model framework, not a selected durability setting or general design acceptance.
- **Source anchors:** §1 personal deployment scope; §10 failure models and backup RPO/RTO; §13 restore acceptance; related A011 and A020.
- **Human wording:** "overall, RPO is more important that RTO for this particular project"; "the server machine is a laptop with its own battery, which acts somewhat like a UPS"; "We need to acknowledge the tradeoffs and accept that we won't be able to protect against every single server failure."
- **Scope direction:** "the overall framework in the spec is good though, is a good mental model about how to at least be ready to the best of our ability to resist this issues"; "this is a personal tool after all, meant to be self-hostable so we don't need to think it as an 'enterprise ready' solution".
- **Required interpretation:** prioritize limiting loss of designs, decisions and workflow progress over minimizing restoration time. State practical trade-offs and residual limitations, and choose proportionate measures rather than assuming enterprise availability, immediate recovery or protection against every failure.
- **Deployment context:** the user considers power-loss risk lower on the current battery-backed laptop host; retain this as user-provided operational context rather than a measured probability or universal assumption for every self-hosted installation. No claim that the battery eliminates hard restarts or storage failures.
- **Still unresolved:** numeric RPO/RTO, acceptable loss window, final persistence settings, backup frequency/location and restore procedure. This direction neither accepts a particular loss bound nor withdraws the document/history/backup investigation in A020. No new resilience implementation requested during the walkthrough.

### A023 — Defer physical second-machine testing; optional and low priority

- **Type/status:** explicit prioritization/scope decision for the later revision.
- **Source anchors:** §13 optional second-machine fixture and future product acceptance; §14 stage 7 "real second-device acceptance" release gate.
- **Human wording:** "Let's keep the second-machine tests optional and not prioratized. Won't become an issue to attend in the short term so we can safe some effort there and defer it to future versions."
- **Required revision:** keep physical second-machine fixture/product trials optional, low priority and deferred to future versions. Remove their status as a prerequisite for initial release/readiness; do not allocate short-term implementation effort on the assumption that this lab must run now.
- **Scope boundary:** this concerns physical second-machine validation, not removal of the stack-independent client protocol, local two-client race/reconnection tests, revocation behavior or cross-device command semantics. No new deadline/version or alternative test apparatus selected. Preserve the truthful evidence statement that physical second-machine validation has not been performed.
