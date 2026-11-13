/**
 * The lock on each store (topology.md: "Hold one lock per store"). Unit 2.
 * Seam: two hosts on one root in two processes; a child killed with SIGKILL while holding the lock.
 */

import { test } from "node:test";

test.todo("a second server on the same root does not open a store the first one holds");
test.todo("a lock left by a server killed with SIGKILL does not block the next start");
test.todo("close releases every lock");
