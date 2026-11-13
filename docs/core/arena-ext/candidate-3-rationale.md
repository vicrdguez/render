# Rationale

**1. The extension model.** I weighed three ways to give an agent an extension's tools. Exact names on every conversation keep running work fixed, and they make every workflow name every tool extension. An extension that is on for everyone breaks the reviewer, and pi-durable has no part for it. I chose the project default that a conversation edits, because pi-durable ships it and a role can still shut it out. I rejected a "default" flag on the module, because "has no `entry`" already says it. For the key I rejected the server's environment and a secrets file of the host. The first cannot be set from a client. The second is a new store and two new calls.

**2. Steps 1 to 6.** I kept W2 closed. Opening it would make step 5 look better and would change W2 for no ruling. I rejected a client call that edits one conversation's selection.

**3. Lane.** I rejected the core on four checks and the library on two. I also weighed a fifth home, a `subagent` extension that any project selects, as in pi-durable's example 22. It does not give W1 a lane, because W1's dispatch writes W1's evidence.

**4. Steps 7 to 12.** I rejected workers that a task of the lane owns. They copy the lane's agent, and a Stop in the lane ends them. I rejected a fix round that goes through the lane, because it puts one conversation in the path of every fix. I rejected `control.terminate` on `dispatch`. It saves one request and can end a run that holds a second item. For a fresh lane I chose a reset in place over a second conversation, which needs a rule for the inputs that still wait in the first. I left out a decision on each brief.

**5. Knowledge and cost.** I rejected the transcript and the summary as the home of what a lane knows, and chose a document that a section renders. I weighed a `beforeCompact` hook that writes the summary from W1's own records. The document already carries what must survive, so the hook adds nothing.

**6. Changes.** I reworded check 4 with the smallest edit. I weighed "at least one of them a workflow" and dropped it, because "differ" already does that work.

**7. Not verified.** I listed what the probe did not run.
