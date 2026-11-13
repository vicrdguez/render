# How workflows bind facts into instructions

**Decided.** Prose belongs to the workflow that uses it.

**Proposed.** Workflows share one small function, `prose()`, that binds facts into Markdown files. All three designs of the first arena reached this answer independently.

**Decided.** `prose()` lives in the [kit](kit.md) beside the core, together with `role()`. The core does not import it.

## What pi-durable already renders

A workflow does not need its own renderer for the system prompt. pi-durable has one (measured, `packages/durable/README.md`, sections "System Prompt" and "Per-Conversation Agent"):

- An extension's sections render in order before each request. Each section reads committed documents.
- Each section is wrapped as `<key>...</key>`.
- Only a changed section is sent again, so the provider's prompt cache stays warm.
- What the model was told is stored in the transcript as `pi.system` entries.
- A conversation's `instructions` are stored on the conversation and render last.

So three delivery slots exist.

| Slot | Holds | Changes when |
| --- | --- | --- |
| `instructions` | Prose pinned to one conversation | Code calls `configure()` (measured, `src/harness/agent.ts:161`) |
| A section | Prose that follows live state | The section renders different text at the next request |
| The input | Guidance for one step | Never. It is in the transcript. |

Pick the slot by whether a fix to the prose should reach running work. Prose in a section does. Prose in `instructions` does not, unless code calls `configure()` again.

The [walk](walk.md) put each role's prose in `instructions`. A role is fixed when its conversation is created, and `role()` takes the same settings that hold `instructions`. The cost is that a fix to a role's prose reaches new conversations only.

What is missing is narrower. A workflow has long prose with a few facts to fill in, and nothing checks that the facts and the prose match.

## Four ways to bind facts

| Option | Checks | Cost |
| --- | --- | --- |
| 1. TypeScript functions with template literals. Nothing is shared. | The compiler checks every fact. | Prose lives in code. Every backtick needs an escape. Conditions can move into the prose. |
| 2. Markdown files with named slots, and one shared `prose()` function. | The call site is typed. The file is checked against its declared slots when the module loads. | One small concept. Values are strings. |
| 3. A template language such as Handlebars or Liquid. | Run-time only. | A dependency. Conditions and loops live in prose, where the workflow's rules then hide. |
| 4. A typed catalogue of content blocks, as the pluggable-kernels design sketched. | Strong. | The most syntax. A format that grows into a language. |

Evidence:

- Real agent prose is full of backticks. Ultimate's 8 agent files have 342 backticks in 404 lines. The 23 pstack playbooks have 616 in 527 lines (measured, a character count over `agents/*.md` at ultimate `7eb49b8` and over `.agents/skills/poteto-mode/playbooks/*.md`).
- The pluggable-kernels design already ruled out option 3. "Body substitutions bind established facts; they do not contain `if new pass`", and "Do not commit a compiler or template dependency" (measured, `execution-skills.md:120-122` at `afc95d4`).
- `skl` binds named inputs into a resource with `--input name=value` and lists them with `--describe-inputs` (measured, `skl skill --help`). Option 2 is the same idea. The `skl` source was not read.
- Ultimate keeps agent prose as Markdown with frontmatter and has no slots (measured, `lib/agents.ts`).

## The recommendation is option 2, kept strict

```ts
const implement = prose(import.meta.dirname, "implement.md", ["pass", "contract", "base", "findings"]);

const instructions = implement({ pass: "2", contract: "C4", base: "B2", findings: bullets(findings) });
```

```md
You own implementation pass {{pass}} for {{contract}}.
Start from `{{base}}`. Address these findings:

{{findings}}

Run `npm run check` before you hand off.
```

The rules:

- A slot is `{{name}}`. A value is a string. Code formats a list before it passes the list in.
- `prose()` fails when the slots in the file differ from the declared names. The failure happens when the module loads, not in the middle of a run.
- Substitution is one pass. A value that contains `{{x}}` stays as text.
- A file has no conditions, no loops, and no includes. A different case is a different file, and workflow code picks the file.
- Composition uses what exists. Live prose is one section per file. Pinned prose is a string join into `instructions`.

One check covers every workflow: each prose file loads against its declared slots. No workflow needs its own test for that.

## Prose loads when the module loads

Every `prose()` call sits at the top level of the extension's module. A missing file or a wrong slot then stops the server before the project opens.

This is a rule and not a preference. A section must not load or check prose while it renders. pi-durable catches a section that throws, reports the error, and keeps the text it showed before (measured, `src/harness/prompt.ts:21-46`). The model would carry on with stale instructions, and nothing would stop the run. Candidate 2 found this.

Prose also grants nothing. A tool checks the workflow's state itself, whatever the instructions say.

## Why it is in the kit and not in the core

`prose()` needs nothing from the store, the client API, or the device identity. No client has to understand it. It guards no boundary, so it fails check 3 of the admission rule in the [README](README.md).

It still earns a shared home. Both proving workflows need it, and a prose file written for one workflow can be reused by another only if the slot format is the same. [Kit](kit.md) has the rule for what enters that home.

## What `prose()` cannot do

It cannot pick the procedure. Which case applies to this run is a decision of the workflow's code, and no neutral layer can make it.

It does not separate instructions from data. A slot value that came from a repository or from a human is inserted as given. The prose author marks such values with tags.

## The line to hold

Template formats grow. The first request for an optional block or a loop is the point where option 2 turns into option 3. The answer to that request is a second file.
