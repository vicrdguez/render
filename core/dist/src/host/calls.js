import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { ConversationBusy, ConversationIdle, configure, LiveDoc, StorageRequestError, } from "@earendil-works/pi-durable";
import { arr, compile, int, map, num, obj, oneOf, opt, str, union, unknown, } from "@earendil-works/pi-schema";
import { decision } from "../store/index.js";
import { answer } from "../store/host.js";
import { decodeCursor, encodeCursor } from "./cursors.js";
import { scanFaults } from "./faults.js";
import { watchInbox } from "./inbox.js";
import { hasModel, modelRef } from "./options.js";
import { PROJECT } from "./projects.js";
import { refuse } from "./refusals.js";
function checked(schema, run) {
    const validator = compile(schema);
    return async (host, device, body) => {
        const parsed = validator.validate(body);
        if (!parsed.ok)
            return refuse("bad_request", "The body does not fit the call.", {
                errors: parsed.errors,
            });
        try {
            return await run(host, device, parsed.value);
        }
        catch (error) {
            if (error instanceof StorageRequestError &&
                (error.message === "Invalid storage cursor" ||
                    error.message.startsWith("The cursor continues a ")))
                return badCursor();
            throw error;
        }
    };
}
function inProject(run) {
    return async (host, device, input) => {
        const open = host.projects.get(input.project);
        return open === undefined
            ? refuse("unknown_project", `No project is named ${input.project}.`)
            : run(host, device, input, open);
    };
}
const unary = (schema, run) => ({
    stream: false,
    dispatch: checked(schema, run),
});
function structural(schema, run) {
    return unary(schema, (host, device, input) => host.structural.run(() => run(host, device, input, host.projects.catalogue)));
}
function structuralProject(schema, run) {
    return structural(schema, (host, device, input, catalogue) => inProject((host, device, input, open) => run(host, device, input, open, catalogue))(host, device, input));
}
const stream = (schema, run) => ({
    stream: true,
    dispatch: checked(schema, run),
});
function inConversation(writes, run) {
    return inProject(async (host, device, input, open) => {
        if (writes && input.conversation === open.log)
            return refuse("event_log", "Nothing may run in the event log.");
        const conversation = await open.store.harness.conversation(input.conversation, context);
        return conversation === undefined
            ? refuse("unknown_conversation", `${input.project} has no conversation ${input.conversation}.`)
            : run(host, device, input, conversation, open);
    });
}
const watchOf = async (conversation, after) => {
    const watch = await conversation.watch(context, after === undefined ? undefined : { from: (after + 1) });
    return { result: watch };
};
const page = (items, next) => next === undefined ? { items } : { items, next };
const badCursor = () => refuse("bad_cursor", "This cursor was not made by this call.");
const DEFAULT_LIMIT = 50;
const project = str({ pattern: PROJECT });
const id = int({ minimum: 1 });
const cursor = opt(str());
const limit = opt(int({ minimum: 1 }));
const levels = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
];
// The one list of calls. HTTP routes and `unknown_call` both read its keys.
export const calls = {
    extensions: unary(obj({}), async (host) => ({
        result: {
            items: host.projects.catalogue.entries().map(([name, { module }]) => ({
                name,
                workflow: module.entry !== undefined,
                ...(module.options === undefined
                    ? {}
                    : { schema: module.options.schema }),
            })),
        },
    })),
    models: unary(obj({}), async (host) => ({
        result: {
            items: (await host.models().getAvailable()).map((model) => ({
                model: `${model.provider}/${model.id}`,
                name: model.name,
            })),
        },
    })),
    projects: unary(obj({}), async (host) => ({
        result: { items: host.projects.list() },
    })),
    bind: structural(obj({ project, workdir: str({ pattern: "^/" }), extensions: arr(str()) }), (host, _device, input, catalogue) => host.projects.bind(input, catalogue)),
    addExtensions: structuralProject(obj({ project, extensions: arr(str()) }), async (host, _device, input, _open, catalogue) => ({
        result: {
            project: await host.projects.addExtensions(input.project, input.extensions, catalogue),
        },
    })),
    options: structuralProject(obj({ project }), async (_host, _device, _input, open, catalogue) => {
        const items = await open.store.harness.commit(async (tx) => {
            const views = [];
            for (const name of open.record.extensions) {
                const options = catalogue.get(name)?.options;
                if (options === undefined)
                    continue;
                views.push({
                    extension: name,
                    schema: options.schema,
                    ...(await options.view(tx)),
                });
            }
            return views;
        }, context);
        return { result: { items } };
    }),
    setOptions: structuralProject(obj({ project, extension: str(), patch: map(unknown()) }), async (_host, _device, input, open, catalogue) => {
        const name = input.extension;
        if (!open.record.extensions.includes(name) ||
            catalogue.get(name) === undefined)
            return refuse("extension_not_loaded", `${input.project} has no extension ${name}.`);
        const options = catalogue.get(name)?.options;
        if (options === undefined)
            return refuse("bad_options", `${name} has no options.`, {
                errors: [
                    { path: "", keyword: "options", message: `${name} has no options` },
                ],
            });
        const patched = await open.store.harness.commit((tx) => options.patch(tx, input.patch), context);
        return "errors" in patched
            ? refuse("bad_options", `The options of ${name} do not fit.`, {
                errors: patched.errors,
            })
            : { result: patched };
    }),
    create: structuralProject(union([obj({ project, workflow: str() }), obj({ project, model: str() })]), async (host, _device, input, open, catalogue) => {
        const { harness } = open.store;
        const cwd = open.record.workdir;
        if ("model" in input) {
            const model = modelRef(input.model);
            if (model === undefined || !hasModel(host.models, input.model))
                return refuse("unknown_model", `This server has no model ${input.model}.`);
            const conversation = await harness.commit(async (tx) => {
                const created = await tx.createConversation({
                    ownership: { kind: "ownerless" },
                });
                await configure(tx, created.id, { cwd, model });
                return created.id;
            }, context);
            return { result: { conversation } };
        }
        const name = input.workflow;
        const module = catalogue.get(name)?.module;
        if (!open.record.extensions.includes(name))
            return refuse("not_a_workflow", `${input.project} has no workflow ${name}.`);
        if (module === undefined)
            return refuse("extension_not_loaded", `This server has no code for ${name}.`);
        const entry = module.entry;
        if (entry === undefined)
            return refuse("not_a_workflow", `${name} is not a workflow.`);
        const options = catalogue.get(name)?.options;
        return harness.commit(async (tx) => {
            const errors = options === undefined ? [] : (await options.view(tx)).errors;
            if (errors.length > 0)
                return refuse("options_invalid", `The options of ${name} are not all set.`, {
                    errors,
                });
            const created = await tx.createConversation({
                ownership: { kind: "ownerless" },
            });
            const change = typeof entry === "function" ? await entry(tx) : entry;
            await configure(tx, created.id, { cwd, ...change });
            return { result: { conversation: created.id } };
        }, context);
    }),
    conversations: unary(obj({ project, cursor, limit }), inProject(async (_host, _device, input, open) => {
        const { harness } = open.store;
        let position;
        if (input.cursor !== undefined) {
            const decoded = decodeCursor(input.cursor, "conversations", input.project);
            if (decoded === undefined)
                return badCursor();
            position = decoded.position;
        }
        const scanned = await harness.commit((tx) => tx.scanConversations({}, input.limit ?? DEFAULT_LIMIT, position), context);
        const items = [];
        for (const record of scanned.items) {
            if (record.id === open.log)
                continue;
            const live = await harness.snapshot(LiveDoc, record.id, context);
            items.push({
                conversation: record.id,
                ...(record.owner === undefined ? {} : { owner: record.owner }),
                state: live?.run !== undefined
                    ? "running"
                    : live?.runFailure !== undefined
                        ? "failed"
                        : "idle",
            });
        }
        const next = scanned.next === undefined
            ? undefined
            : encodeCursor("conversations", input.project, {}, scanned.next);
        return { result: page(items, next) };
    })),
    open: stream(obj({ project, conversation: id, after: opt(int({ minimum: 0 })) }), inConversation(false, (_host, _device, input, conversation) => watchOf(conversation, input.after))),
    history: unary(obj({
        project,
        conversation: id,
        cursor,
        limit,
        minEntryId: opt(id),
        maxEntryId: opt(id),
        order: opt(oneOf(["ascending", "descending"])),
    }), inConversation(false, async (_host, _device, input, conversation) => {
        const asked = {
            conversation: input.conversation,
            minEntryId: input.minEntryId,
            maxEntryId: input.maxEntryId,
            order: input.order,
        };
        let query = asked;
        let position;
        if (input.cursor !== undefined) {
            const decoded = decodeCursor(input.cursor, "history", input.project);
            if (decoded === undefined ||
                Object.entries(asked).some(([key, value]) => value !== undefined && decoded.query[key] !== value))
                return badCursor();
            query = decoded.query;
            position = decoded.position;
        }
        const bounds = {
            ...(typeof query.minEntryId === "number"
                ? { minEntryId: query.minEntryId }
                : {}),
            ...(typeof query.maxEntryId === "number"
                ? { maxEntryId: query.maxEntryId }
                : {}),
            ...(query.order === "ascending" || query.order === "descending"
                ? { order: query.order }
                : {}),
        };
        const entries = await conversation.entries(bounds, input.limit ?? DEFAULT_LIMIT, position, context);
        const next = entries.next === undefined
            ? undefined
            : encodeCursor("history", input.project, { conversation: input.conversation, ...bounds }, entries.next);
        return { result: page([...entries.items], next) };
    })),
    input: unary(obj({
        project,
        conversation: id,
        text: str(),
        requestId: str({ minLength: 1 }),
        whenBusy: opt(oneOf(["steer", "followUp"])),
        whenIdle: opt(oneOf(["reject"])),
    }), inConversation(true, async (_host, device, input, conversation) => {
        try {
            const submission = await conversation.submit({
                type: "input",
                content: input.text,
                requestId: `client:${device}:${input.requestId}`,
                ...(input.whenBusy === undefined
                    ? {}
                    : { whenBusy: input.whenBusy }),
                ...(input.whenIdle === undefined
                    ? {}
                    : { whenIdle: input.whenIdle }),
            }, context);
            const { id, ...record } = await submission.status(context);
            return { result: { submission: { id, ...record } } };
        }
        catch (error) {
            if (error instanceof ConversationIdle)
                return refuse("idle", "Nothing runs in this conversation.");
            throw error;
        }
    })),
    continue: unary(obj({ project, conversation: id, requestId: str({ minLength: 1 }) }), inConversation(true, async (_host, device, input, conversation) => {
        try {
            const submission = await conversation.submit({
                type: "continue",
                requestId: `client:${device}:${input.requestId}`,
            }, context);
            return { result: { submission: await submission.status(context) } };
        }
        catch (error) {
            if (error instanceof ConversationBusy)
                return refuse("busy", "A run is working in this conversation.");
            throw error;
        }
    })),
    stop: unary(obj({ project, conversation: id }), inConversation(true, async (_host, _device, _input, conversation) => {
        await conversation.abort(context);
        return { result: {} };
    })),
    setModel: unary(obj({
        project,
        conversation: id,
        model: str(),
        thinkingLevel: opt(oneOf(levels)),
    }), inConversation(true, async (host, _device, input, conversation) => {
        const model = modelRef(input.model);
        if (model === undefined || !hasModel(host.models, input.model))
            return refuse("unknown_model", `This server has no model ${input.model}.`);
        await conversation.configure({
            model,
            ...(input.thinkingLevel === undefined
                ? {}
                : { thinkingLevel: input.thinkingLevel }),
        }, context);
        return { result: {} };
    })),
    inbox: stream(obj({}), async (host) => ({
        result: await watchInbox(host.projects),
    })),
    decision: unary(obj({ project, decision: str() }), inProject(async (_host, _device, input, open) => {
        const { harness } = open.store;
        const found = await harness.commit(async (tx) => {
            const record = await decision(tx, input.decision);
            if (record === undefined)
                return undefined;
            const data = (await tx.entry(record.basis))?.data;
            return {
                record,
                text: typeof data?.text === "string" ? data.text : "",
            };
        }, context);
        if (found === undefined)
            return refuse("unknown_decision", `${input.project} has no decision ${input.decision}.`);
        const then = found.record.status === "answered"
            ? (await harness.getTask(found.record.continuation, context))?.state
            : undefined;
        return {
            result: {
                decision: found.record,
                text: found.text,
                ...(then === undefined ? {} : { then }),
            },
        };
    })),
    answer: unary(obj({
        project,
        decision: str(),
        basis: id,
        choice: str(),
        annotations: arr(obj({
            text: str(),
            range: opt(obj({ start: num(), end: num() })),
        })),
    }), inProject(async (_host, device, input, open) => {
        const answered = await answer(open.store, input.decision, {
            basis: input.basis,
            choice: input.choice,
            annotations: input.annotations,
        }, device, context);
        return answered.kind === "answered"
            ? {
                result: {
                    decision: answered.decision,
                    repeated: answered.repeated,
                },
            }
            : { refused: answered.refusal };
    })),
    timeline: stream(obj({ project, after: opt(int({ minimum: 0 })) }), inProject(async (_host, _device, input, open) => {
        const log = await open.store.harness.conversation(open.log, context);
        if (log === undefined)
            throw new Error(`${input.project} has lost its event log`);
        return watchOf(log, input.after);
    })),
    faults: unary(obj({ project, cursor, limit }), inProject(async (host, _device, input, open) => {
        let positions = {};
        if (input.cursor !== undefined) {
            const decoded = decodeCursor(input.cursor, "faults", input.project);
            if (decoded === undefined)
                return badCursor();
            positions = decoded.position;
        }
        const catalogue = host.projects.catalogue;
        const kinds = catalogue
            .selected(open.record.extensions)
            .flatMap(({ module }) => (module.extension.tasks ?? []).map((task) => task.definition.name));
        const scanned = await scanFaults(open, kinds, input.limit ?? DEFAULT_LIMIT, positions);
        const more = kinds.some((kind) => scanned.positions[kind] !== null);
        const next = more
            ? encodeCursor("faults", input.project, {}, scanned.positions)
            : undefined;
        return { result: page(scanned.items, next) };
    })),
};
//# sourceMappingURL=calls.js.map