import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { defineExtension, defineTask, } from "@earendil-works/pi-durable";
import { requestAdmin } from "../../src/host/index.js";
import { Projects } from "../../src/host/projects.js";
import { newHome, start, until } from "./helpers.js";
test("startup reports a stored task newer than installed code", async (t) => {
    let projects;
    const original = Projects.prototype.start;
    t.mock.method(Projects.prototype, "start", function () {
        projects = this;
        return original.call(this);
    });
    let stderr = "";
    t.mock.method(process.stderr, "write", (chunk) => {
        stderr += String(chunk);
        return true;
    });
    const definition = (version) => defineTask({
        name: "ahead.task",
        version,
        initial: () => ({ phase: "sleep" }),
        phases: {
            sleep: async (_task, runtime, c) => {
                await runtime.sleepUntil(runtime.now() + 60000, { phase: "sleep" }, c);
            },
        },
        abort: async () => { },
    });
    let task = definition(2);
    let s = await start({
        source: () => ({
            modules: {
                ahead: { extension: defineExtension({ name: "ahead", tasks: [task] }) },
            },
            failures: [],
        }),
    });
    try {
        await s.call("bind", {
            project: "p",
            workdir: "/p",
            extensions: ["ahead"],
        });
        const conversation = (await s.call("create", { project: "p", model: "faux/a" })).body.result.conversation;
        const p = projects.get("p");
        const id = await p.store.harness.commit((tx) => tx.createTask(task, {}, {
            ownership: { kind: "conversation" },
            conversationId: conversation,
            background: true,
        }), context);
        await until("sleep", async () => (await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id && t.state.kind === "sleeping"));
        task = definition(1);
        s = await s.restart();
        assert.match(stderr, /blocked p task=.*kind=ahead.task.*version=2->1 task_too_old/);
        const report = await requestAdmin(s.home, { command: "extension_reload" });
        assert.ok("reload" in report);
        assert.equal(report.reload.tasks[0]?.reason, "task_too_old");
    }
    finally {
        await s.close();
    }
});
test("onReport logs a running task left on its old definition", async (t) => {
    let projects;
    const original = Projects.prototype.start;
    t.mock.method(Projects.prototype, "start", function () {
        projects = this;
        return original.call(this);
    });
    let stderr = "";
    t.mock.method(process.stderr, "write", (chunk) => {
        stderr += String(chunk);
        return true;
    });
    let release;
    const held = new Promise((resolve) => {
        release = resolve;
    });
    const definition = (version) => defineTask({
        name: "running.task",
        version,
        initial: () => ({ phase: "run" }),
        phases: {
            run: async (_task, runtime, c) => {
                await held;
                await runtime.commit(() => ({ status: "running", checkpoint: { phase: "next" } }), c);
            },
            next: async (_task, runtime, c) => {
                await runtime.commit(() => ({
                    status: "terminal",
                    outcome: { status: "completed", result: null },
                }), c);
            },
        },
        abort: async () => { },
    });
    let task = definition(1);
    const s = await start({
        source: () => ({
            modules: {
                running: {
                    extension: defineExtension({ name: "running", tasks: [task] }),
                },
            },
            failures: [],
        }),
    });
    try {
        await s.call("bind", {
            project: "p",
            workdir: "/p",
            extensions: ["running"],
        });
        const conversation = (await s.call("create", { project: "p", model: "faux/a" })).body.result.conversation;
        const p = projects.get("p");
        const id = await p.store.harness.commit((tx) => tx.createTask(task, {}, {
            ownership: { kind: "conversation" },
            conversationId: conversation,
            background: true,
        }), context);
        await until("running", async () => (await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id && t.state.kind === "running"));
        task = definition(2);
        await s.server.reload();
        release();
        await until("outdated report", async () => stderr.includes("task_outdated p task="));
        assert.match(stderr, /task_outdated p task=.*kind=running.task/);
    }
    finally {
        release();
        await s.close();
    }
});
test("reload inspects soon-to-block tasks in every open project", async (t) => {
    let projects;
    const original = Projects.prototype.start;
    t.mock.method(Projects.prototype, "start", function () {
        projects = this;
        return original.call(this);
    });
    const definition = (version) => defineTask({
        name: "both.due",
        version,
        initial: () => ({ phase: "sleep" }),
        phases: {
            sleep: async (_task, runtime, c) => {
                await runtime.sleepUntil(runtime.now() + 60000, { phase: "sleep" }, c);
            },
        },
        abort: async () => { },
    });
    let task = definition(1);
    const s = await start({
        source: () => ({
            modules: {
                both: { extension: defineExtension({ name: "both", tasks: [task] }) },
            },
            failures: [],
        }),
    });
    try {
        for (const project of ["p", "q"]) {
            await s.call("bind", {
                project,
                workdir: `/${project}`,
                extensions: ["both"],
            });
            const conversation = (await s.call("create", { project, model: "faux/a" })).body.result.conversation;
            const p = projects.get(project);
            const id = await p.store.harness.commit((tx) => tx.createTask(task, {}, {
                ownership: { kind: "conversation" },
                conversationId: conversation,
                background: true,
            }), context);
            await until("sleeping", async () => (await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id && t.state.kind === "sleeping"));
        }
        task = definition(2);
        const result = await requestAdmin(s.home, { command: "extension_reload" });
        assert.ok("reload" in result);
        assert.deepEqual(result.reload.tasks.map((t) => [t.project, t.kind, t.status]), [
            ["p", "both.due", "migration-needed-on-reservation"],
            ["q", "both.due", "migration-needed-on-reservation"],
        ]);
    }
    finally {
        await s.close();
    }
});
for (const migrate of [false, true])
    test(`reload reports sleeping and blocked tasks and repairs them with migrate ${migrate}`, async (t) => {
        let projects;
        const original = Projects.prototype.start;
        t.mock.method(Projects.prototype, "start", function () {
            projects = this;
            return original.call(this);
        });
        let stderr = "";
        t.mock.method(process.stderr, "write", (chunk) => {
            stderr += String(chunk);
            return true;
        });
        const definition = (version, migrates = false) => defineTask({
            name: "timer.due",
            version,
            initial: () => ({ phase: "sleep" }),
            phases: {
                sleep: async (_task, runtime, c) => {
                    await runtime.sleepUntil(runtime.now() + 1000, { phase: "wake" }, c);
                },
                wake: async (_task, runtime, c) => {
                    await runtime.commit(() => ({
                        status: "terminal",
                        outcome: { status: "completed", result: "migrated" },
                    }), c);
                },
            },
            abort: async () => { },
            ...(migrates
                ? {
                    migrate: () => ({
                        input: {},
                        checkpoint: { phase: "wake" },
                    }),
                }
                : {}),
        });
        const old = definition(1);
        let task = old;
        const root = await newHome();
        let s = await start({
            home: path.join(root, ".tau"),
            source: () => ({
                modules: {
                    timer: {
                        extension: defineExtension({ name: "timer", tasks: [task] }),
                    },
                },
                failures: [],
            }),
        });
        try {
            await s.call("bind", {
                project: "p",
                workdir: "/p",
                extensions: ["timer"],
            });
            const conversation = (await s.call("create", { project: "p", model: "faux/a" })).body.result.conversation;
            let p = projects.get("p");
            const id = await p.store.harness.commit((tx) => tx.createTask(old, {}, {
                ownership: { kind: "conversation" },
                conversationId: conversation,
                background: true,
            }), context);
            await until("sleeping", async () => (await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id && t.state.kind === "sleeping"));
            task = definition(2, migrate);
            const report = (await requestAdmin(s.home, {
                command: "extension_reload",
            }));
            assert.ok(report.reload, JSON.stringify(report));
            if (migrate)
                assert.deepEqual(report.reload.tasks, []);
            else {
                assert.deepEqual(report.reload.tasks.map(({ until, ...rest }) => rest), [
                    {
                        project: "p",
                        task: id,
                        kind: "timer.due",
                        conversation,
                        stored: 1,
                        installed: 2,
                        status: "migration-needed-on-reservation",
                        reason: "migration_failed",
                    },
                ]);
                assert.equal(typeof report.reload.tasks[0]?.until, "number");
                s = await s.restart();
                p = projects.get("p");
                assert.match(stderr, /migration-needed-on-reservation p task=.*kind=timer.due.*version=1->2/);
                await until("blocked", async () => (await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id && t.state.kind === "blocked"));
                const blocked = (await requestAdmin(s.home, {
                    command: "extension_reload",
                }));
                assert.equal(blocked.reload.tasks[0]?.status, "blocked");
                assert.equal(blocked.reload.tasks[0]?.reason, "migration_failed");
                try {
                    await promisify(execFile)(process.execPath, [
                        fileURLToPath(new URL("../../src/command/main.js", import.meta.url)),
                        "extension",
                        "reload",
                    ], { env: { ...process.env, HOME: root } });
                    assert.fail("blocked reload should exit 3");
                }
                catch (error) {
                    const result = error;
                    assert.equal(result.code, 3, result.stderr);
                    assert.match(result.stdout, /blocked p task=.*kind=timer.due.*version=1->2 migration_failed/);
                    t.diagnostic(result.stdout);
                }
                assert.match(stderr, /migration_failed p task=/);
                task = definition(2, true);
                await requestAdmin(s.home, { command: "extension_reload" });
            }
            await until("completed", async () => !(await p.store.harness.inspect(context)).tasks.some((t) => t.record.id === id));
            const stored = await p.store.harness.commit((tx) => tx.task(id), context);
            assert.equal(stored?.version, 2);
            assert.equal(stored?.state.status, "terminal");
        }
        finally {
            await s.close();
        }
    });
//# sourceMappingURL=task-reports.test.js.map