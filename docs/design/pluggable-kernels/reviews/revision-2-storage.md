# Storage and workflow-boundary review

The goal is workflow-owned instruction rendering and one authoritative database per host, with isolated project knowledge and explicit sharing. This review checks whether the proposed boundaries support that goal without presenting future functionality as delivered.

## Verdict

**No confirmed document contradiction or false current-source claim found within the requested scope.** No mandatory correction is supported by this inspection. The proposal is suitable for further design review, not implementation acceptance or a claim of working tenancy.

Read all five requested documents. Compared the relevant claims with the exported `eea2a7cb047f55683c4bf83658315b41129be62a` source. The `f7aba19314d312416a882fc6215f3de7f5fd5224` project work remains unmerged prior art, not evidence of delivered isolation.

## Commands and observed evidence

Paths below use these abbreviations.

- `D` is `/tmp/render-kernel-docs-publish.wwbt5S/checkout/docs/design/pluggable-kernels`.
- `S` is `/tmp/render-workflow-redesign.WQSLi4/current`.

The source identity check executed the following command.

```sh
python3 -c 'import pathlib,subprocess; r="/Users/vr-osxs/dev/render"; s="eea2a7cb047f55683c4bf83658315b41129be62a"; root=pathlib.Path("/tmp/render-workflow-redesign.WQSLi4/current"); files=["src/ledger/records.ts","src/ledger/ledger.ts","src/ledger/history.ts","src/ledger/startup.ts","src/engine/runtime.ts","docs/spec.md","package.json"]; [(print(p, "MATCH" if subprocess.check_output(["git","-C",r,"rev-parse",s+":"+p]).strip()==subprocess.check_output(["git","hash-object",str(root/p)]).strip() else "MISMATCH")) for p in files]'
```

Observed output was `MATCH` for each of the seven files. This proves their exported bytes match the specified commit, not their runtime behavior.

The following are actual read/grep tool invocations, with abbreviated paths.

| Command | Observed output and review consequence |
| --- | --- |
| `read(S/src/ledger/records.ts, offset=1, limit=180)` | `Meta` and `Workflow` use session scope. `WorkflowRecord` has `conversation` but no project field. The documents correctly distinguish proposed ProjectId from database, Durable session, workflow run, and conversation identity. |
| `grep(D/storage-and-knowledge.md, pattern="Duplicate creation\|receipt namespace\|Host administration\|Acquisition means\|Existing assignment\|History cursors")` | Lines 59, 79, 81, and 120 separately specify creation retry behavior, project receipt keys, a host namespace for creation, scoped history, and assignment capture. Creation is not incorrectly keyed by a project ID that does not yet exist. |
| `read(S/src/ledger/ledger.ts, offset=290, limit=115)` | Current scope checks precede receipt lookup. Receipt lookup uses principal namespace plus command ID and refuses fingerprint disagreement. This supports the documented baseline, not a claim that project namespaces already exist. |
| `read(S/src/ledger/history.ts, offset=1, limit=190)` | Cursors bind epoch, owner, receipt view, workflow selection, and cutoff. They check supplied current scope. Export/page types explicitly carry missing content, redactions, omissions, and exclusions. Adding project ownership is correctly described as future work. |
| `read(S/src/ledger/startup.ts, offset=1, limit=220)` | Startup inspects shared retained tasks and refuses with `unsupported_definitions` when any inspected task is blocked. The proposed project-local dispatch behavior is correctly labeled unproven. |
| `read(S/src/engine/runtime.ts, offset=220, limit=80)` | Admission checks trusted assignment scope, configuration, packet containment, model, transcript budget, current running state, executor epoch, generation, and turn budget. The document accurately distinguishes containment from exact rendered-section equality. |
| `read(S/src/engine/runtime.ts, offset=1205, limit=208)` and `read(..., offset=881, limit=95)` | Rendering resolves exact retained inputs and current child results, while continuation consumes child identities and rebinds execution. Pinning authored content without freezing all future facts is consistent with this baseline. |

## Boundary assessment

**Project isolation.** The proposed scope list includes commands, receipts, artifacts, history, exports, source operations, background execution, refresh, and provider admission. Neither a common database nor a shared workflow name grants access. Host-wide authority and failure domains remain explicit.

**Sharing.** Revision, grant, binding, and assignment use are distinct. A grant does not adopt guidance; a binding does not authorize disclosure. The capture definition includes staged material and distinguishes reading an existing capture from reading the source collection again. Prospective revocation therefore does not contradict continued use by the same assignment.

**Workflow ownership.** The workflow selects legal work, procedure cases, content, and result contracts. The host supplies authority and capabilities; the composer assembles an already authorized content closure. Independent content releases cannot silently change workflow meaning. Compatible code repair and retirement are explicitly unfinished policies.

**Admission and compatibility.** Retaining a skill is not provider authorization, and a preview is not the effective context. Shared-runtime startup isolation, transaction staging, and exact provider-section binding remain feasibility gates. Their absence is not a defect in a proposal that expressly disclaims proving them.

## Product choices and unverified design risks

These are not confirmed defects or mandatory corrections.

1. **Captured knowledge in later work.** Product review should explicitly decide whether a new assignment may read an old skill, report, or export containing previously shared material after grant revocation. The text preserves prior disclosure and blocks new uses under the revoked grant, but does not fully specify downstream reuse of derivative records. A useful clarification would distinguish authorized historical inspection from creating a new assignment input. Do not infer retroactive erasure or content-level tracking machinery.
2. **Creation retry details.** Before implementation, define “duplicate creation” as the same established principal, host namespace, command ID, and matching request fingerprint. State that changed bytes conflict and changed host defaults do not alter the recorded result. The present statements are compatible with that interpretation; they are not proof that the retry contract has been implemented.

No tests, live-ledger operations, implementation edits, or runtime probes ran. The only written artifact is this report. The **Prove It Works** principle shaped the source-identity comparison and direct source inspection. It did not justify treating structural evidence as proof of future functionality.
