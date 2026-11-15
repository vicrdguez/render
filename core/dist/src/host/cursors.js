import { compile, int, lit, map, nul, obj, oneOf, opt, str, union, unknown, } from "@earendil-works/pi-schema";
const Payload = obj({
    call: str(),
    project: str(),
    query: map(unknown()),
    position: unknown(),
});
const checkPayload = compile(Payload);
const id = int({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
const order = oneOf(["ascending", "descending"]);
const position = obj({ after: id, order });
const checks = {
    conversations: compile(obj({
        query: obj({}),
        position: obj({ after: id, order: lit("ascending") }),
    })),
    history: compile(obj({
        query: obj({
            conversation: id,
            minEntryId: opt(id),
            maxEntryId: opt(id),
            order: opt(order),
        }),
        position,
    })),
    faults: compile(obj({
        query: obj({}),
        position: map(union([obj({ after: id, order: lit("descending") }), nul()])),
    })),
};
/** A cursor names its call, its project, its query, and pi-durable's own position, and no server memory. So it
 * works after a restart. */
export function encodeCursor(call, project, query, position) {
    return Buffer.from(JSON.stringify({ call, project, query, position })).toString("base64url");
}
/** Undefined for a cursor that this call did not make for this project. */
export function decodeCursor(cursor, call, project) {
    let value;
    try {
        value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    }
    catch {
        return undefined;
    }
    const parsed = checkPayload.validate(value);
    if (!parsed.ok ||
        parsed.value.call !== call ||
        parsed.value.project !== project)
        return undefined;
    if (!Object.hasOwn(checks, call))
        return undefined;
    const check = checks[call];
    if (!check.check({ query: parsed.value.query, position: parsed.value.position }))
        return undefined;
    if (call === "history") {
        const saved = parsed.value.position;
        if (saved.order !== (parsed.value.query.order ?? "descending"))
            return undefined;
    }
    return { query: parsed.value.query, position: parsed.value.position };
}
//# sourceMappingURL=cursors.js.map