/**
 * The calls on conversations, and joining a running agent (host.md). Unit 2.
 * Seam: `host.call` on a temporary root with the faux provider; a stand-in tool that holds a run open.
 */

import { test } from "node:test";

test.todo("create with a model makes the bare agent: { cwd: workdir, model }, no selection");
test.todo("create with a name that is not a workflow of the project is not_a_workflow");
test.todo("create resent makes a second, empty conversation (an accepted limit)");
test.todo("create sets cwd to the project's workdir on a workflow's conversation too");
test.todo("conversations pages each conversation with its owner and idle, running, or failed, and leaves out the log");
test.todo("a run that ends on a model error shows as failed, and continue answers it (H8)");
test.todo("input stores the request ID as client:<device>:<requestId>; a resend returns the first submission (W3)");
test.todo("the same request ID from another device is a submission of its own (W3)");
test.todo("a steer during a tool round joins the same run (H4)");
test.todo("whenIdle reject on an idle conversation is idle and writes nothing (H6)");
test.todo("continue on a busy conversation is busy");
test.todo("stop ends the run; a second stop later ends a newer run (H9); a background task is left alone");
test.todo("setModel applies from the next model request, in a working run too (H5); an unknown model is unknown_model");
test.todo("input, continue, stop, and setModel on the event log are refused with event_log");
test.todo("history pages a conversation, and the event log, with a cursor that works after a restart");
test.todo("an unknown conversation is unknown_conversation");
test.todo("open's first frame replaces the whole value; after starts the window after the client's newest entry (W6)");
