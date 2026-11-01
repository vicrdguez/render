# Historical export: preimplementation oracle

Authored before product implementation. Observe real Ledger HTTP/SQLite seams, not raw SQL as a correctness oracle.

- H1: Save `original\r\n☃\n` twice under separate command IDs. Both revision refs return those exact UTF-8 bytes; second parents/supersedes first. A later changed revision must not replace either original identity. Creator and command remain distinct. Outcomes are null (not fabricated success/failure).
- H2: Begin history with limit 1; save later text and create another workflow before continuation. Resume after host restart from the opaque cursor. Cutoff and selected workflow set stay fixed; no late revision, fact, receipt or relationship enters the traversal or export. Changing query scope with that cursor refuses invalid_cursor. Malformed/tampered cursors refuse. New traversal sees new writes.
- H3: Export contains manifest version 1, JSONL records and exact content bytes, normalized lineage/fact/receipt links, scope, completeness and explicit exclusions. Fresh independent Node reader imports no Render code or fixture. Literal assertions check original text twice and later text absent at the old cutoff. Reader refuses unknown version, malformed JSONL, dangling relationships and missing/corrupt bytes; no current-content substitution.
- H4: Revoked credentials cannot resume/export/read; other-workflow scope cannot read even with another caller's cursor. Authenticate before malformed-query disclosure. Proposal/assignment/outcome capabilities not yet present refuse capability_unavailable, not an empty complete answer.
- H5: Offline controlled corruption/unknown schema/deletion in owned stores must yield named exact-read refusal and export missing-data declaration, incomplete, never replacement bytes. Existing slice1 corruption/unknown-schema fixtures are extended rather than used as a correctness side channel.
- H6: Human saved strings mentioning rejected/abandoned/unknown or runner success remain literal text, not classified domain outcomes or runner receipts. Future assignment, Attempt, decision, policy, retained packet, execution and runtime transcript kinds are explicitly unavailable, not fabricated test passes.

## Audit repair oracles (authored before their product fixes)

- F3/F6: delete an acknowledged message, set its text to null, or replace it with different string bytes in an owned stopped store. Exact reads refuse missing_content/content_corrupt and exports declare the exact missing ref, incomplete, with no invented bytes or external-link substitution. New message saves must retain digest/length atomically with the original text; pre-slice messages cannot retroactively acquire a trustworthy original digest and are explicitly legacy-unverified.
- F4/F5: a default broad-scope page declares administrative receipt redactions and unavailable future kinds. Create another workflow after page one; every continuation/export retains the original workflow set and cutoff.

Unsafe latest-only-export and cutoff-drift mutations must fail their own literal assertions after the unmodified checks pass. Setup/import failures do not count. Full applicable V1/V2/V3/V4/V7/early-V9 rows remain cumulative; V5/V6 and full V8/V9 cannot be claimed before their owning features exist. No human/model/service trial is run by this slice.
