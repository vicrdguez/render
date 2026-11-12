# Rationale

**1. Client calls.** A protocol sketch was out under ruling 12. I left out a stored title per conversation, because `pi.agent.extensions` shows the workflow and the first entry shows the prompt. I left out device attribution on input, an `InputEntry` with `by`, because one owner on several devices names no failure.

**2. The script.** A bind that also sets options would make two writers of options.

**3. Binding.** I weighed a catalogue file on the server, a record in each store, and both. A separate file can disagree with the stores after a crash between two writes. A record in the store, found by listing directories, cannot. A host-minted ID would make a resent bind create a second project, so the client picks the ID. Allowing removal would block live tasks and refuse answers. Removal is not in the script, so a plain `workflow_in_use` refusal won.

**4. Options.** Beyond the three homes in §4, I weighed three points at which a change reaches work:

- The host pushes it into live conversations. Rejected, because probe H3 shows one run would mix models.
- The workflow reads it once, when it creates a role. Rejected, because step 5's second round would stay on B.
- The workflow reads it at each round's start. Chosen.

Applying an option only when it changed would keep a model picked by hand, but W1 would have to remember what it applied. I left it out. `entry` as a `ConversationInit` that reads options lost to a plain `entry(values)`, which lets the host refuse before it creates anything. A model as `{ provider, modelId }` lost to a string with `format: "model"`, because pi-schema checks a string format with a host function, and a client can show a picker from the schema. `defineOptions` in the core fails check 3, since it guards nothing.

**5. Faulted tasks.** A scan by status alone reads every tool call ever made. A list fed by `onReport` is not stored with the fault, so a crash loses entries and a scan is needed anyway. A scan per kind won.

**6. Joining.** A "list running agents" call repeats the task graph. Refusing steers to workflow conversations would break ruling 18.

**Ruling 13.** An idempotent create takes about five lines: a document, written in the create commit, maps a client key to the conversation. The owner accepted the limit instead.
