import { createHash, randomBytes, randomInt, timingSafeEqual, } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { arr, compile, num, obj, opt, str, } from "@earendil-works/pi-schema";
export const DEVICE = "^[a-z][a-z0-9-]{0,31}$";
const CODE_LIFE = 10 * 60_000;
const WRONG_LIMIT = 5;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TOKEN = /^Bearer tau\.([a-z][a-z0-9-]{0,31})\.([A-Za-z0-9_-]{43})$/;
const Stored = obj({
    devices: arr(obj({
        device: str({ pattern: DEVICE }),
        hash: str({ pattern: "^[0-9a-f]{64}$" }),
        pairedAt: num(),
        revokedAt: opt(num()),
    })),
});
const checkStored = compile(Stored);
const sha = (value) => createHash("sha256").update(value).digest();
const normalize = (code) => code.toUpperCase().replace(/[-\s]/g, "");
/** devices.json, the pending pairing codes, and the open streams of each device. */
export class Devices {
    #file;
    #now;
    #records;
    #codes = new Map();
    #streams = new Map();
    #wrong = 0;
    #writing = Promise.resolve();
    constructor(file, now, records) {
        this.#file = file;
        this.#now = now;
        this.#records = records;
    }
    static async load(home, now) {
        const file = path.join(home, "devices.json");
        let records = [];
        const text = await readFile(file, "utf8").catch((error) => {
            if (error.code !== "ENOENT")
                throw error;
        });
        if (text !== undefined) {
            const parsed = checkStored.validate(JSON.parse(text));
            if (!parsed.ok)
                throw new Error(`${file} does not fit: ${JSON.stringify(parsed.errors)}`);
            records = parsed.value.devices;
        }
        return new Devices(file, now, records);
    }
    authenticate(header) {
        const match = TOKEN.exec(header ?? "");
        if (match === null)
            return undefined;
        const [, device = "", secret = ""] = match;
        const record = this.#records.find((r) => r.device === device);
        if (record === undefined || record.revokedAt !== undefined)
            return undefined;
        return timingSafeEqual(Buffer.from(record.hash, "hex"), sha(secret))
            ? device
            : undefined;
    }
    issue(device) {
        if (this.#records.some((r) => r.device === device))
            return { error: `The device name ${device} is already used.` };
        for (const [key, pending] of this.#codes)
            if (pending.device === device)
                this.#codes.delete(key);
        const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(32)]).join("");
        const expiresAt = this.#now() + CODE_LIFE;
        this.#codes.set(sha(raw).toString("hex"), { device, expiresAt });
        return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt };
    }
    async pair(code) {
        const key = sha(normalize(code)).toString("hex");
        const pending = this.#codes.get(key);
        this.#codes.delete(key);
        if (pending === undefined || pending.expiresAt <= this.#now()) {
            this.#wrong++;
            if (this.#wrong >= WRONG_LIMIT) {
                this.#codes.clear();
                this.#wrong = 0;
            }
            return undefined;
        }
        this.#wrong = 0;
        const secret = randomBytes(32).toString("base64url");
        this.#records.push({
            device: pending.device,
            hash: sha(secret).toString("hex"),
            pairedAt: this.#now(),
        });
        await this.#persist();
        return { device: pending.device, token: `tau.${pending.device}.${secret}` };
    }
    async revoke(device) {
        const record = this.#records.find((r) => r.device === device);
        if (record === undefined)
            return { error: `No device is named ${device}.` };
        await this.#persist(record);
        this.#end(device, "revoked");
        return { done: true };
    }
    list() {
        return this.#records.map((r) => ({
            device: r.device,
            pairedAt: r.pairedAt,
            ...(r.revokedAt === undefined ? {} : { revokedAt: r.revokedAt }),
        }));
    }
    /** Registers a stream's end so that a revoke or a stop reaches it. Returns its removal. */
    attach(device, end) {
        const set = this.#streams.get(device) ?? new Set();
        this.#streams.set(device, set);
        set.add(end);
        return () => set.delete(end);
    }
    endAll(reason) {
        for (const device of [...this.#streams.keys()])
            this.#end(device, reason);
    }
    #end(device, reason) {
        for (const end of [...(this.#streams.get(device) ?? [])])
            end(reason);
    }
    #persist(revoking) {
        const next = this.#writing.then(async () => {
            const previous = revoking?.revokedAt;
            if (revoking)
                revoking.revokedAt ??= this.#now();
            try {
                const temporary = `${this.#file}.tmp`;
                await writeFile(temporary, `${JSON.stringify({ devices: this.#records }, null, "\t")}\n`, { mode: 0o600 });
                await rename(temporary, this.#file);
            }
            catch (error) {
                if (revoking) {
                    if (previous === undefined)
                        delete revoking.revokedAt;
                    else
                        revoking.revokedAt = previous;
                }
                throw error;
            }
        });
        this.#writing = next.catch(() => { });
        return next;
    }
}
//# sourceMappingURL=devices.js.map