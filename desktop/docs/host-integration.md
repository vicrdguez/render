# Host integration boundary

The desktop consumes client-domain facts. It does not import the Render host, read its database, classify its workflow lifecycle, or derive authority from chat.

The accepted server spec describes protocol semantics but leaves route names and several presentation guarantees unsettled. Issue #52 owns that work. Demonstration data and recorded client-domain messages are substitutes for exercising this app, not evidence of server compatibility.

## Adapter responsibilities

The adapter translates public host responses into the typed model in `render-core`. Only the adapter knows wire field names, nesting, versions, authentication, routes, stream framing, and command encoding.

The native app drains adapter messages at frame boundaries. It resolves input against a separate record of what it drew. Changing the host representation must not require changes to screen code.

A prepared command contains its identity, format identifier, and exact encoded bytes. The app writes those bytes to its device store before transmission. A retry transmits the stored bytes, not a newly encoded command. Receipt queries do not execute commands. A missing receipt does not establish that a command was never accepted.

## Guarantees needed from the host

- Attention, agent, and Slice indexes must distinguish unavailable data from a complete empty result.
- Handover facts, NEXT targets, roles, outcomes, lifecycle labels, and eligibility come from structured host records.
- Every authority action needs an exact host basis, ordered basis fields, availability, EFFECT, and NOT. Unknown basis field names remain visible.
- Conversation sends need the turn and prompt, steer, or follow-up mode that the user saw. Refusal must preserve the draft.
- Scoped observations need a sequence and a declared change base. Reconnect and gaps obtain fresh snapshots.
- Historical reads must retain exact revision and source identity. Missing, unauthorized, and unreadable content must not fall back to another revision.
- Search must cover the host corpus with explicit scope and completeness. A loaded-object picker is not a substitute for host search.
- Reference styling needs a scoped label index. Without it, reference-shaped text stays plain.
- Content authorship must be explicit. Unmarked free text is content, not trusted chrome.

These are client requirements, not proposed endpoint names or a new host Contract. See `docs/ui/protocol-requirements.md` and https://github.com/vicrdguez/render/issues/52 in the containing repository.

## Disaster recovery is excluded

Issue #52 records the accepted disaster-recovery deferral from issue #49. The desktop must not manufacture backup protection, restore status, or migration machinery to match older mockups. Ordinary reconnect, revocation, command uncertainty, exact retry, and uncertain external effects remain required.

The statusline can show host identity, connection state, admission state, and observed sequence without claiming off-host protection. The governing UI-spec reconciliation remains a host-design handoff item.

## Real-host acceptance

Before enabling a production adapter, capture authenticated public-protocol fixtures and run them through the adapter and client reducer. Verify changed bases, lost replies, receipt ordering, scoped gaps, revocation, unknown versions, and exact-source reads. Exercise a real window against the real host. Demonstration screenshots and local tests cannot replace those checks.
