# Rationale

**The client list.** I weighed a protocol sketch and a list per client type. Ruling 12 rules out both, so the list has one row per thing a client does and names the pi-durable call under it. I left out a timeline call, because the event log is a conversation and the conversation rows already read it. I rejected a host flag that marks a conversation as "W1".

**The script.** I ran the moves I was least sure of in `probe.mjs` and let the results choose. H1 chose the restart order: open with an empty registry, read the workflow list from the store, then install. H6 chose the scan by kind, and showed that `onReport` arrives after the fault is stored.

**Binding.** I weighed a catalogue file, a `project.json` beside each store, and a document in the store. The first two need their own atomic write and can disagree with the store. I weighed a minted ID against an owner-picked name. The name makes a resent bind converge with no request ID. I rejected refusing to remove a workflow with live work. pi-durable already parks that work and resumes it.

**Options.** I weighed three stores and two homes. A file fails on one fact: a `tx` names a store, and one module serves many projects, so a function cannot find a per-project file unless the host injects a path. I rejected the library as the home. Its own rule says it owns nothing stored, and the core cannot import it to write the value. I rejected a library wrapper over a core read, which is a second name for one thing. I rejected `entry.init` for `entry(options)`, a pure function. I rejected pushing a change to running conversations, because the host knows no role. I chose a shallow patch over a whole-value replace, so two devices that edit different options do not undo each other.

**Faulted tasks.** I rejected a host list fed by `onReport`. It needs a write and a reconcile at start, and it can miss a fault. A scan needs neither.

**Joining an agent.** I rejected a label on a conversation. Events and decisions name it. I rejected tools and instructions in the client's configure call, because a role is the workflow's.

**Least sure of.** The home of `options()`, the owner-picked name as the project ID, and whether `cwd` belongs in bind.
