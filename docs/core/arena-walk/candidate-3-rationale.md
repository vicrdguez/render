# Rationale

**W1.** Three shapes for the work were weighed.

- The root conversation is the designer. Rejected: something must reconfigure the root, and the host knows no workflow. It also allows one piece of work per project.
- One long `w1.run` task that owns everything. Rejected: a task cannot wait for an answer, so it would have to sleep as a handle for abort. That is a task with no work.
- One ownerless thread per piece of work, with every task owned by that thread. Chosen: `abort()` on one conversation reaches all of it, and each role is created the same way.

For driving an agent, an `afterRun` hook and an `onYield` hook were weighed against a task that submits and waits. The task was chosen. Its nudge count sits in its checkpoint, and the hooks read documents but cannot write them.

For a stuck agent, failing the task was rejected. A decision with `retry` and `drop` puts it in the inbox.

**W2.** Aborting the old timer on revision was rejected. A tool cannot abort a task inside a commit, and the timer's own check costs one read. Reading events for calibration was kept because the script asks for it, and flagged.

**`role()`.** A `role.open(tx, ownership)` helper that also creates the conversation was rejected. It saves one line and puts library code inside commits. A role file format was rejected: `prose()` already loads the text.

**Annotation.** Four anchors were weighed: none, a quoted string, line numbers, and character offsets. Offsets were chosen. A quote can match twice, a line client can compute offsets, and the workflow gets the quote by slicing. Keeping `notes` beside `annotations` was rejected: an annotation without a range is a note. Saved annotations were rejected for now on checks 4 and 5, and the owner accepted the limit they would remove.

**What fell short.** A host call for a client to withdraw a decision was rejected in favour of a `drop` choice. Storing a flag on `then` for `background` was rejected in favour of one fixed rule. A conversation label in the core was rejected on check 4.

**Probe.** Six checks were run, each for a move the walk leans on that `substrate.mjs` did not cover. A real kill and Git were left out and are listed as not verified.
