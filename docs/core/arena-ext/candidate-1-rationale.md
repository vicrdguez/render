# Rationale

## 1. The extension model

- **What makes a workflow.** I weighed "an extension that requests decisions" and "one that defines roles". Any extension may request a decision, and `role()` is a library helper. The host treats a workflow differently only in `create`, so `entry` is the definition.
- **What a project selects.** I rejected two lists in `Project`, because `entry` already tells workflows apart.
- **How agents get tools.** A would make every workflow name every tool extension. C lets the extension's author decide instead of the owner, and W1 would need to name `websearch` to keep it from the reviewer. B is pi-durable's own mechanism. Its cost is that open conversations change when the set grows, so roles whose promise rests on what they cannot do keep exact arrays.
- **Secrets.** I weighed the server's configuration beside the model logins, an Ultimate-style file, and a separate document. Each needs a new call or a second store. Options already store, check, and reach a client. Only showing the value differs, so one format name covers it. The cost is a key per project.

## 2. Steps 1 to 6

A call that changes a conversation's selection would answer step 5. I rejected it, because a chat could then give the reviewer search.

## 3. Lane

- I weighed recommending that W1 build the lane. The walk showed two or more requests at the lane's context per hand-over, one queue, and knowledge in a summary nobody reviews. So I recommend notes now.
- A helper that only finds or creates the role's conversation passes check 3, but it is `role()` plus a read.
- If a lane is built, a `beforeCompact` summary from W1's records is its best memory. The lasting knowledge is the stored kind.

## 4. Steps 7 to 12

- Foreground dispatch (example 21) would block the lane for a whole build, so item 1's fix would wait for item 2's worker.
- A steer for the fix mixes two items in one run.
- A `retire_lane` tool needs the wrong lane to obey. An option counter needs no model.
- Fixes go to the item's worker, which keeps its context.

## 6. Check 4

"Two workflows" would never count `websearch`. "A workflow and another extension" is narrower than the owner's unit. "Two extensions that do different jobs" keeps the point: two unlike users.
