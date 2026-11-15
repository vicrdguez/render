import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineDoc, defineEntry, defineExtension, defineTask, MemoryStorage, } from "@earendil-works/pi-durable";
import { decision, request, } from "tau";
import { openStore } from "../../src/store/host.js";
export { context };
export const Basis = defineEntry("test.basis");
const Seen = defineDoc({
    kind: "test.seen",
    version: 1,
    scope: "session",
    initial: () => ({ runs: [] }),
    checkpointWhen: () => false,
});
/** A `then` task that reads its decision through `decision()` and records what it saw. */
export const Then = defineTask({
    name: "test.then",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: {
        run: async (task, runtime, c) => {
            await runtime.commit(async (tx) => {
                const read = await decision(tx, task.input.decision);
                (await tx.doc(Seen)).runs.push({
                    input: { ...task.input },
                    read: read === undefined ? null : JSON.stringify(read),
                });
                return {
                    status: "terminal",
                    outcome: { status: "completed", result: null },
                };
            }, c);
        },
    },
    abort: (_task, runtime, c) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c),
});
export const Throws = defineTask({
    name: "test.throws",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: {
        run: async () => {
            throw new Error("then task threw");
        },
    },
    abort: async () => { },
});
export const Fails = defineTask({
    name: "test.fails",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: {
        run: (_task, runtime, c) => runtime.commit(() => ({
            status: "terminal",
            outcome: { status: "failed", error: { message: "failed" } },
        }), c),
    },
    abort: async () => { },
});
export const extension = defineExtension({
    name: "test",
    tasks: [Then, Throws, Fails],
});
/** A store over memory with the test extension installed and a clock the test moves. */
export async function setup(storage = new MemoryStorage(), installed = true) {
    const registry = createRegistry();
    if (installed)
        registry.install(extension);
    const clock = { now: 1_000 };
    const store = await openStore(storage, { models: createModels(), registry, now: () => clock.now }, context);
    let commits = 0;
    store.harness.observeCommits({
        advance: () => {
            commits++;
        },
        end: () => { },
    });
    const conversation = (await store.harness.commit((tx) => tx.createConversation({ ownership: { kind: "ownerless" } }), context)).id;
    const basis = (text, where = conversation) => store.harness.commit((tx) => tx.appendEntry(Basis, where, { data: { text } }), context);
    const draft = async (change = {}) => ({
        subject: "test:k",
        title: "Review the design",
        basis: await basis("The design text."),
        choices: ["approve", "revise", "abort"],
        conversation,
        then: Then,
        requestedAt: clock.now,
        ...change,
    });
    const ask = (d) => store.harness.commit((tx) => request(tx, d), context);
    const read = (id) => store.harness.commit((tx) => decision(tx, id), context);
    const seen = async () => (await store.harness.snapshot(Seen, context))?.runs ?? [];
    return {
        store,
        registry,
        clock,
        conversation,
        basis,
        draft,
        ask,
        read,
        seen,
        commits: () => commits,
    };
}
//# sourceMappingURL=setup.js.map