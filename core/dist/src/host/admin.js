import { chmod, unlink } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { arr, compile, lit, num, obj, opt, str, union, } from "@earendil-works/pi-schema";
import { DEVICE } from "./devices.js";
import { ReloadReport } from "./reload.js";
const Request = union([
    obj({ command: lit("pair"), device: str({ pattern: DEVICE }) }),
    obj({ command: lit("revoke"), device: str() }),
    obj({ command: lit("list") }),
    obj({ command: lit("extension_reload") }),
]);
const Result = union([
    obj({ code: str(), expiresAt: num() }),
    obj({
        devices: arr(obj({ device: str(), pairedAt: num(), revokedAt: opt(num()) })),
    }),
    obj({ done: lit(true) }),
    obj({ reload: ReloadReport }),
    obj({ error: str() }),
]);
const checkRequest = compile(Request);
const checkResult = compile(Result);
const LINE_LIMIT = 64 * 1024;
export const adminSocket = (home) => path.join(home, "admin.sock");
function exchange(file, line) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(file);
        let reply = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            reply += chunk;
        });
        socket.on("end", () => resolve(reply));
        socket.on("error", reject);
        socket.end(`${line}\n`);
    });
}
/** Sends one command to the server that runs on `home`, through its owner-only socket. */
export async function requestAdmin(home, request) {
    const parsed = checkResult.validate(JSON.parse(await exchange(adminSocket(home), JSON.stringify(request))));
    if (!parsed.ok)
        throw new Error(`the server's reply does not fit: ${JSON.stringify(parsed.errors)}`);
    return parsed.value;
}
/** Refuses when a live server answers on the socket, and removes a socket that a killed server left. */
export async function refuseRunning(file) {
    const alive = await new Promise((resolve) => {
        const socket = net.connect(file);
        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("error", () => resolve(false));
    });
    if (alive)
        throw new Error(`a Tau server is already running on ${file}`);
    await unlink(file).catch((error) => {
        if (error.code !== "ENOENT")
            throw error;
    });
}
async function handle(devices, reload, line) {
    let body;
    try {
        body = JSON.parse(line);
    }
    catch {
        return { error: "The request is not JSON." };
    }
    const parsed = checkRequest.validate(body);
    if (!parsed.ok)
        return {
            error: `The request does not fit: ${JSON.stringify(parsed.errors)}`,
        };
    const request = parsed.value;
    if (request.command === "extension_reload") {
        const report = await reload();
        return "result" in report
            ? { reload: report.result }
            : { error: report.refused.message };
    }
    if (request.command === "pair")
        return devices.issue(request.device);
    if (request.command === "revoke")
        return devices.revoke(request.device);
    return { devices: devices.list() };
}
export async function listenAdmin(file, devices, reload) {
    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
        let line = "";
        let answered = false;
        const answer = async () => {
            if (answered)
                return;
            answered = true;
            const reply = await handle(devices, reload, line.split("\n")[0] ?? "").catch((error) => ({ error: String(error) }));
            socket.end(`${JSON.stringify(reply)}\n`);
        };
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
            line += chunk;
            if (line.length > LINE_LIMIT)
                socket.destroy();
            else if (line.includes("\n"))
                void answer();
        });
        socket.on("end", () => void answer());
        socket.on("error", () => { });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(file, () => resolve());
    });
    await chmod(file, 0o600);
    return server;
}
//# sourceMappingURL=admin.js.map