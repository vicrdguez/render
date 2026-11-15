# Tau's design

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue. It runs a durable agent on a server and keeps requests for human decisions and a record of events. A client connects to that server to inspect and direct the work.

The core is the single `tau` package, built on pi-durable 1.5.2. Extensions sit beside the core and load at run time. The core knows no extension by name. A workflow is an extension. A client speaks the [protocol](protocol.md) and is not part of this repository.

## Core layers

- The store opens a harness and adds [Decision and Event](primitives.md).
- The host manages projects, devices, client calls, and extensions. See [Host](host.md).
- The command starts and administers the server.
- The extension author interface exports functions, helpers, and pi types. See [Extensions](extensions.md).

The store does not import the host or command. The host does not import the command. Store, host, and command do not import the extension author interface. Core code does not import an extension. Extensions import `tau` through its author entries, and their tests may also import `tau/testing`. The build enforces these boundaries.

## Admission to the core

A proposal to add to the core must show all five checks:

1. **A real failure.** The bare agent or a proving workflow cannot do something today. The proposal names it.
2. **pi-durable does not provide it.** The proposal cites what was checked.
3. **An extension cannot keep the promise.** The change guards who may act at the boundary to the human and the client. Or it is a record that every client and every extension must read the same way. The proposal includes the extension that was tried and where it fell short. Convenience fails this check.
4. **Two unlike users.** Two extensions that do different jobs use it with the same meaning, or a client that knows no extension cannot work without it. A repair to the server's safety is the one exception.
5. **A small shape that names no workflow concept.** It is a type and a few functions over a `Tx` or the host. It adds no scheduler, loop, background process, or storage engine. A particular role such as "the designer", a phase, and an artifact type are workflow concepts. A way to define roles is not one. Checks 1 to 4 judge it.

When pi-durable gains a feature, the core's copy is deleted. A core part with fewer than two users goes back out, subject to the client and safety exceptions above.

## Admission of a helper

A proposal for a helper exported to extension authors names its call sites and passes four checks:

1. It has two call sites in the proving workflows. Both can be in one workflow.
2. It adds no guarantee. It uses only the public API of pi-durable and the core. A workflow that writes the same calls loses nothing.
3. It owns no stored name. It has no document, entry kind, task, or extension under a name of its own, and it makes no commit and starts no timer. It may write through the caller's `tx`. It may define a document for its caller when the caller's name is the document's name and the document holds only the caller's data.
4. It names no workflow concept. A way to define roles passes. "The designer" does not.

A helper goes out when it has fewer than two call sites or pi-durable gains it.

## Limits

Extensions are trusted code and are not sandboxed. An extension can end the server process or prevent startup by never finishing its top-level code. Changes to an extension's own dependencies require a restart.

The human answer boundary guards against mistakes, not an agent with access to the server's account, store, or device tokens. See [Decision and Event](primitives.md#who-can-answer).

An upgrade can change the meaning of an open decision because the task is looked up when an answer arrives. A workflow must keep its open decisions compatible with its task code.

Annotations travel with an answer. An unsent review stays on the device where it was written.

A repeated request to create a conversation can create another conversation. Tau offers no call to delete a conversation, unbind a project, or remove an extension from a project. A client can inspect faulted tasks, but Tau offers no general call to restart or delete them. See [Host](host.md).
