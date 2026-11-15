import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyImmutable } from "@earendil-works/chord/delta";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { fromDirectory, requestAdmin, startServer, } from "tau/server";
import { linkExtensions } from "./extensions.js";
export async function until(what, test) {
    const deadline = Date.now() + 10_000;
    while (!(await test())) {
        assert.ok(Date.now() < deadline, `timed out: ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
export async function post(url, name, body, token) {
    const response = await fetch(`${url}/v1/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}
export async function watch(url, name, body, token) {
    const controller = new AbortController();
    const response = await fetch(`${url}/v1/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const stream = response.body;
    const state = {
        value: undefined,
        frames: [],
        error: undefined,
        close: () => controller.abort(),
    };
    void (async () => {
        let pending = "";
        for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
            pending += chunk;
            for (let end = pending.indexOf("\n\n"); end >= 0; end = pending.indexOf("\n\n")) {
                const line = pending.slice(0, end);
                pending = pending.slice(end + 2);
                if (line.startsWith(":"))
                    continue;
                assert.ok(line.startsWith("data: "), line);
                state.frames.push(line);
                const frame = JSON.parse(line.slice(6));
                if (frame.ops)
                    state.value = applyImmutable(state.value, frame.ops);
            }
        }
    })().catch((error) => {
        if (!controller.signal.aborted)
            state.error = error;
    });
    await until(`${name} snapshot`, () => {
        if (state.error)
            throw state.error;
        return state.value !== undefined;
    });
    return state;
}
export async function journey(changes = {}) {
    const root = await realpath(await mkdtemp(join(tmpdir(), "tau-journey-")));
    const home = join(root, "home");
    await linkExtensions(home);
    const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }] });
    const models = createModels();
    models.setProvider(faux.provider);
    let options = {
        home,
        source: fromDirectory(join(home, "extensions")),
        models,
        port: 0,
        env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? root }),
        ...changes,
    };
    let server = await startServer(options);
    let url = `http://127.0.0.1:${server.address.port}`;
    const wire = [];
    const call = async (name, body, token) => {
        const reply = await post(url, name, body, token);
        wire.push(JSON.stringify(reply));
        return reply;
    };
    const pair = async (device) => {
        const issued = await requestAdmin(home, { command: "pair", device });
        assert.ok("code" in issued, JSON.stringify(issued));
        const reply = await post(url, "pair", { code: issued.code });
        assert.equal(reply.status, 200);
        return reply.body.result.token;
    };
    const laptop = await pair("laptop");
    const phone = await pair("phone");
    return {
        root,
        home,
        faux,
        laptop,
        phone,
        wire,
        call: (name, body, token = laptop) => call(name, body, token),
        async ok(name, body, token = laptop) {
            const reply = await call(name, body, token);
            assert.equal(reply.status, 200, JSON.stringify(reply.body));
            assert.ok(reply.body.result, JSON.stringify(reply.body));
            return reply.body.result;
        },
        watch: (name, body, token = laptop) => watch(url, name, body, token),
        async restart(patch = {}) {
            await server.close();
            options = { ...options, ...patch };
            server = await startServer(options);
            url = `http://127.0.0.1:${server.address.port}`;
        },
        stop: () => server.close(),
        async close() {
            await server.close();
            await rm(root, { recursive: true, force: true });
        },
    };
}
export async function decision(j, id, project = "p") {
    let found;
    await until(`decision ${id}`, async () => {
        const reply = await j.call("decision", { project, decision: id }, j.phone);
        if (reply.status !== 200)
            return false;
        found = reply.body.result;
        return true;
    });
    return found;
}
//# sourceMappingURL=journey.js.map