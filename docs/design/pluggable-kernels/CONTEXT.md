# Proposed Render workflow domain

This glossary describes the proposed domain for workflow-owned execution skills and logically isolated projects on one host. It is a design vocabulary, not an accepted change to the product glossary or specification.

## Projects and workflows

**Host**:
The accepting authority for Render work, identities, retained records, and execution across its projects.

**Project**:
An ownership and working-context scope with its selected workflow, repository configuration, guidance, and workflow runs. A project is not a conversation or a repository remote.

**Workflow definition**:
The versioned definition of a way of working, including its legal transitions, roles, procedures, craft composition, and result contracts.
_Avoid_: workflow when the distinction from a run matters, static prompt collection.

**Workflow run**:
One instance of a selected workflow definition within one project. It carries the state and history of a particular investigation, development journey, or other supported activity.

**Role**:
A workflow-defined responsibility under which an assignment performs work. Identically named roles in different workflow definitions do not imply identical instructions or authority.

**Assignment**:
A bounded responsibility for agent work with an exact scope, basis, and execution identity. Continuing an assignment is different from replacing it or creating a new implementation pass.

## Instructions and rendering

**Procedure**:
The ordered work and completion conditions for a particular operation. A procedure is specialized for its actual assignment rather than handed to an agent as every possible workflow branch.

**Craft**:
Reusable judgment guidance applied to the work, such as Testing or design vocabulary. Craft is distinct from a repository's check catalogue and from the executable policy that decides legal transitions.

**Instruction asset**:
An independently authored, versioned piece of procedure, craft, role guidance, tool description, or outcome guidance owned by a workflow or its declared content library.

**Resolved task**:
The concrete role, procedure case, evidence basis, and available execution facilities selected for an assignment. It records the choices already determined by the workflow and the host.

**Render plan**:
The selected instruction assets, knowledge revisions, bindings, and output contract needed to render a resolved task. It is the content portion of the prepared assignment, not a second workflow policy.

**Execution skill**:
The immutable, tailored instructions and bound task information rendered for one assignment basis. It includes the procedure and applicable craft rather than a generic collection of skills left for the agent to select.
_Avoid_: role prompt when it obscures procedure and craft composition.

**Rendering manifest**:
The attributable record of the exact content, facts, versions, and knowledge uses that produced an execution skill.

**Instruction resource**:
A named, versioned instruction available under a particular execution skill, with declared applicability and delivery requirements.

**Workflow tool**:
A workflow-owned interaction exposed to an agent under its assignment's checked authority. Its description and returned guidance are distinct from its permission to perform an action.

**Instruction delivery**:
The retained rendering of an instruction resource for one skill revision, assignment basis, and tool call. It is not a role change or an authority grant.

**Effective provider context**:
The instructions, conversation material, tools, and other declared context actually supplied for a provider call. An execution skill is part of this context, not the whole conversation.

## Knowledge and guidance

**Project guidance**:
The principles and other judgment guidance adopted for a project through its authorized configuration. Unrelated repository text and a model's suggestions are not automatically project guidance.

**Knowledge revision**:
An immutable version of a knowledge item, with its owner, declared kind, and source provenance.

**Knowledge binding**:
A project's explicit selection of a knowledge revision and its declared use. A binding is not a grant of access or automatic adoption of another project's policy.

**Share grant**:
An owner's authorization for another project to acquire or use the specified knowledge under declared terms.

**Knowledge use**:
An assignment's captured use of an exact knowledge revision under its binding and authorization. It is a record of consumption, not a mutable fork of the source item.

## Flagged ambiguities

- Workflow means a definition when a project chooses how to work. Workflow run means a particular instance. The current source's `Workflow` record is closest to a workflow run.
- A project may contain programming work about finance. That does not require a financial workflow. Workflow procedure and project knowledge are independent choices.
- A principle statement and the full principle are distinct required materials. Carrying a reference to one document does not establish complete principle selection.
- Rendering specializes known facts and choices. It does not remove genuine judgment or turn unknown facts into established ones.

## Example dialogue

Developer. The programming project selected a pstack-inspired workflow definition.

Domain expert. Its candidate and review assignments therefore use that definition's procedures and roles, not the built-in development procedure.

Developer. It also needs finance knowledge from another project.

Domain expert. Add an authorized knowledge binding. Each execution skill records the exact knowledge revision used. That does not select the finance project's workflow or grant access to its other records.
