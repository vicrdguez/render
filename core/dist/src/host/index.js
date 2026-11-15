import { chmod, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { adminSocket, listenAdmin, refuseRunning } from "./admin.js";
import { Catalogue } from "./catalogue.js";
import { Devices } from "./devices.js";
import { loadExtensions } from "./extensions.js";
import { handler } from "./http.js";
import { Projects } from "./projects.js";
import { reload } from "./reload.js";
import { StructuralQueue } from "./structural.js";
import { inspectTasks, taskLine } from "./task-reports.js";
export { requestAdmin } from "./admin.js";
export { fromDirectory } from "./loader.js";
export { taskLine } from "./task-reports.js";
export async function startServer(options) {
    const loaded = await loadExtensions(options.source, options.models);
    await mkdir(options.home, { recursive: true, mode: 0o700 });
    await chmod(options.home, 0o700);
    const socket = adminSocket(options.home);
    const models = options.models;
    const current = typeof models === "function" ? models : () => models;
    const projects = new Projects(options, new Catalogue(loaded.modules, loaded.options));
    const structural = new StructuralQueue();
    let admin;
    try {
        const devices = await Devices.load(options.home, options.now ?? Date.now);
        await projects.start();
        for (const task of await inspectTasks(projects))
            process.stderr.write(`tau: ${taskLine(task)}\n`);
        await refuseRunning(socket);
        admin = await listenAdmin(socket, devices, () => server.reload());
        const host = {
            projects,
            devices,
            models: current,
            structural,
        };
        const http = createServer(handler(host, options.allowedHosts ?? []));
        await new Promise((resolve, reject) => {
            http.once("error", reject);
            http.listen(options.port ?? 6283, "127.0.0.1", () => resolve());
        });
        const address = http.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        const adminServer = admin;
        let closing;
        let failure;
        const server = {
            address: { host: "127.0.0.1", port },
            skipped: projects.skipped,
            reload: () => structural.run(async () => {
                const report = await reload(projects, options);
                if (report.status === "restart_required") {
                    failure = new Error(report.failures[0]?.message ??
                        "Restart required after publication failed.");
                    void server
                        .close()
                        .catch((error) => process.stderr.write(`tau: ${String(error)}\n`));
                }
                return { result: report };
            }),
            close: () => {
                closing ??= (async () => {
                    await structural.close();
                    devices.endAll("stopping");
                    await new Promise((resolve) => {
                        http.close(resolve);
                        http.closeAllConnections();
                    });
                    await new Promise((resolve) => adminServer.close(resolve));
                    await projects.close();
                    if (failure !== undefined)
                        throw failure;
                })();
                return closing;
            },
        };
        return server;
    }
    catch (error) {
        await new Promise((resolve) => admin ? admin.close(resolve) : resolve(undefined));
        await projects.close();
        throw error;
    }
}
//# sourceMappingURL=index.js.map