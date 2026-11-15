import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { watchOpen } from "../store/host.js";
const under = (project, op) => op[0] === "r"
    ? ["s", [project], op[1]]
    : [op[0], [project, ...op[1]], ...op.slice(2)];
/** The open lists of every project, each under its project's name, as one watch. A project that a later `bind`
 * opens arrives as an `s` op. One store's failed watch ends the whole watch as failed. */
export async function watchInbox(projects) {
    const watches = new Map();
    for (const open of projects.all())
        watches.set(open.name, await watchOpen(open.store, context));
    let value = Object.fromEntries([...watches].map(([name, watch]) => [name, watch.value]));
    let listener;
    let queue = Promise.resolve();
    let ended = false;
    let unjoin = () => { };
    let settle = () => { };
    const closed = new Promise((resolve) => {
        settle = resolve;
    });
    const end = (result) => {
        if (ended)
            return;
        ended = true;
        unjoin();
        for (const watch of watches.values())
            void watch.stop();
        settle(result);
    };
    const push = (ops) => {
        const next = queue.then(() => ended || listener === undefined
            ? undefined
            : listener({ kind: "value", value, ops, retired: false }, context));
        queue = next.catch(() => { });
        return next;
    };
    const follow = (project, watch) => {
        watch.start(async (call) => {
            if (call.kind === "failed")
                return end({ kind: "failed", error: call.error });
            if (call.ops.length === 0)
                return;
            value = { ...value, [project]: call.value };
            await push(call.ops.map((op) => under(project, op)));
        });
        void watch.closed.then((result) => {
            if (result.kind !== "stopped")
                end({ kind: "failed", error: result });
        });
    };
    const join = async (open) => {
        if (ended)
            return;
        const watch = await watchOpen(open.store, context);
        if (ended)
            return void watch.stop();
        watches.set(open.name, watch);
        value = { ...value, [open.name]: watch.value };
        await push([["s", [open.name], watch.value]]);
        follow(open.name, watch);
    };
    return {
        get value() {
            return value;
        },
        closed,
        start(next) {
            listener = next;
            for (const [project, watch] of watches)
                follow(project, watch);
            unjoin = projects.onBind((open) => {
                join(open).catch((error) => end({ kind: "failed", error }));
            });
        },
        stop: async () => {
            end({ kind: "stopped" });
            return closed;
        },
    };
}
//# sourceMappingURL=inbox.js.map