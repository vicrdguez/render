import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyImmutable } from "@earendil-works/chord/delta";
import { createModels, fauxProvider, } from "@earendil-works/pi-ai";
import { requestAdmin, startServer, } from "../../src/host/index.js";
export const newHome = () => mkdtemp(path.join(tmpdir(), "tau-host-"));
export function faux(ids = ["a", "b", "c"]) {
    const handle = fauxProvider({ models: ids.map((id) => ({ id })) });
    const models = createModels();
    models.setProvider(handle.provider);
    return { faux: handle, models };
}
export function send(url, pathname, body, headers = {}, method = "POST") {
    return new Promise((resolve, reject) => {
        const request = http.request(`${url}${pathname}`, { method, headers: { "Content-Type": "application/json", ...headers } }, (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
                const text = Buffer.concat(chunks).toString();
                resolve({
                    status: response.statusCode ?? 0,
                    headers: response.headers,
                    body: text === "" ? {} : JSON.parse(text),
                });
            });
        });
        request.on("error", reject);
        request.end(body);
    });
}
export async function start(options = {}, device = "laptop") {
    const home = options.home ?? (await newHome());
    const models = options.models ?? faux();
    const { token: existing, ...rest } = options;
    const server = await startServer({
        source: () => ({ modules: {}, failures: [] }),
        port: 0,
        ...rest,
        home,
        models: models.models,
    });
    const url = `http://127.0.0.1:${server.address.port}`;
    const call = (name, body, token) => send(url, `/v1/${name}`, JSON.stringify(body), token === undefined ? {} : { Authorization: `Bearer ${token}` });
    const pair = async (name) => {
        const issued = await requestAdmin(home, { command: "pair", device: name });
        assert.ok("code" in issued, JSON.stringify(issued));
        const paired = await call("pair", { code: issued.code });
        assert.ok(paired.body.result, JSON.stringify(paired.body));
        return paired.body.result.token;
    };
    const token = existing ?? (await pair(device));
    return {
        server,
        url,
        home,
        token,
        faux: models.faux,
        call: (name, body, as = token) => call(name, body, as),
        pair,
        watch: (name, body, as = token) => watch(url, name, body, as),
        restart: async (changes = {}) => {
            await server.close();
            return start({ ...options, home, models, token, ...changes });
        },
        close: () => server.close(),
    };
}
export function watch(url, name, body, token) {
    const waiters = new Set();
    const wake = () => {
        for (const waiter of [...waiters]) {
            if (waiter.test(state)) {
                waiters.delete(waiter);
                waiter.resolve();
            }
        }
    };
    const request = http.request(`${url}/v1/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
    });
    const state = {
        status: 0,
        headers: {},
        value: undefined,
        frames: 0,
        heartbeats: 0,
        end: undefined,
        closed: false,
        refused: undefined,
        newest: 0,
        held: new Map(),
        gaps: [],
        response: undefined,
        until: (test, what = "the watch") => test(state)
            ? Promise.resolve()
            : new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), 10_000);
                waiters.add({
                    test,
                    resolve: () => {
                        clearTimeout(timer);
                        resolve();
                    },
                });
            }),
        close: () => request.destroy(),
    };
    request.on("response", (response) => {
        state.response = response;
        state.status = response.statusCode ?? 0;
        state.headers = response.headers;
        response.setEncoding("utf8");
        let pending = "";
        response.on("data", (chunk) => {
            pending += chunk;
            if (state.status !== 200)
                return;
            for (let cut = pending.indexOf("\n\n"); cut >= 0; cut = pending.indexOf("\n\n")) {
                const block = pending.slice(0, cut);
                pending = pending.slice(cut + 2);
                if (block.startsWith(":")) {
                    state.heartbeats++;
                    continue;
                }
                assert.ok(block.startsWith("data: "), block);
                const frame = JSON.parse(block.slice(6));
                state.frames++;
                if (frame.end !== undefined) {
                    state.end = frame.end.reason;
                    continue;
                }
                const before = state.newest;
                state.value = applyImmutable(state.value, frame.ops);
                const entries = state.value?.entries;
                if (Array.isArray(entries)) {
                    for (const entry of entries)
                        state.held.set(entry.id, entry);
                    for (const id of state.held.keys())
                        state.newest = Math.max(state.newest, id);
                    const gapEnd = state.value.before;
                    if (before > 0 && gapEnd !== undefined && gapEnd > before) {
                        state.gaps.push({ minEntryId: before + 1, maxEntryId: gapEnd });
                    }
                }
            }
            wake();
        });
        const finish = () => {
            if (state.status !== 200 && pending !== "")
                state.refused = JSON.parse(pending);
            state.closed = true;
            wake();
        };
        response.on("end", finish);
        response.on("close", finish);
        response.on("error", finish);
    });
    request.on("error", () => {
        state.closed = true;
        wake();
    });
    request.end(JSON.stringify(body));
    return state;
}
export async function until(what, test) {
    for (let i = 0; i < 1000; i++) {
        if (await test())
            return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(`never: ${what}`);
}
export const TWENTY_CALLS = [
    "extensions",
    "models",
    "projects",
    "bind",
    "addExtensions",
    "options",
    "setOptions",
    "create",
    "conversations",
    "open",
    "history",
    "input",
    "continue",
    "stop",
    "setModel",
    "inbox",
    "decision",
    "answer",
    "timeline",
    "faults",
];
//# sourceMappingURL=helpers.js.map