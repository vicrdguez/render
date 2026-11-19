/**
 * The one list of roles. Options, model resolution, tool lists and dispatch seats are derived from it.
 *
 * Model resolution: a role's own option if set, else its lane's option. The four lane options are required;
 * every role and sub-role option is optional, so adding a role never invalidates stored options.
 *
 * Tool lists are closed and derived: a role gets the coding tools named here plus every keel tool whose
 * `ToolSpec.roles` names it (kernel), plus `principle`, plus `dispatch` when it has seats. No list of keel tools is
 * written per role.
 */
import type { ModelRef } from "tau/durable";
import type { RoleSettings } from "tau";
import type { WorkLane, ProjectLane } from "../kernel/ids.ts";

type Coding = "read" | "bash" | "edit" | "write";

export const ROLES = {
	// Design lane
	designer: { lane: "design", kind: "agent", coding: ["read", "bash"], seats: ["design_explorer", "design_prototype"] },
	design_explorer: { lane: "design", kind: "seat", coding: ["read", "bash"], seats: [] },
	design_prototype: { lane: "design", kind: "seat", coding: ["read", "bash", "edit", "write"], seats: [] },
	arena_seat_1: { lane: "design", kind: "arena", coding: ["read", "bash"], seats: [] },
	arena_seat_2: { lane: "design", kind: "arena", coding: ["read", "bash"], seats: [] },
	/** Runs only when its option is set: the arena has as many candidates as configured seats, at least two. */
	arena_seat_3: { lane: "design", kind: "arena", coding: ["read", "bash"], seats: [] },
	arena_judge: { lane: "design", kind: "arena", coding: ["read"], seats: [] },
	arena_challenger: { lane: "design", kind: "arena", coding: ["read", "bash"], seats: [] },
	// Build lane
	coordinator: { lane: "build", kind: "agent", coding: ["read"], seats: ["build_explorer"] },
	worker: { lane: "build", kind: "agent", coding: ["read", "bash", "edit", "write"], seats: ["build_explorer"] },
	build_explorer: { lane: "build", kind: "seat", coding: ["read", "bash"], seats: [] },
	// Verify lane
	verifier: { lane: "verify", kind: "agent", coding: ["read", "bash"], seats: [] },
	diagnoser: { lane: "verify", kind: "agent", coding: ["read", "bash"], seats: [] },
	// Queue
	investigator: { lane: "queue", kind: "agent", coding: ["read", "bash"], seats: ["queue_explorer"] },
	queue_explorer: { lane: "queue", kind: "seat", coding: ["read", "bash"], seats: [] },
} as const satisfies Record<
	string,
	{
		readonly lane: WorkLane | Exclude<ProjectLane, "trunk">;
		/** agent: a lane agent keel creates; seat: a dispatched child; arena: a child the Design lane's code dispatches. */
		readonly kind: "agent" | "seat" | "arena";
		readonly coding: readonly Coding[];
		readonly seats: readonly string[];
	}
>;

export type RoleName = keyof typeof ROLES;

/**
 * The options type, derived from `ROLES`: `design`, `build`, `verify`, `queue` (required, `format: "model"`), one
 * optional model key per role, and:
 * - `trunk` (default `"trunk"`), `base` (default `"main"`): branch names; must differ.
 * - `max_workers` (default 3): items building at once per piece of work.
 */
export type KeelOptions = {
	readonly design: string;
	readonly build: string;
	readonly verify: string;
	readonly queue: string;
	readonly trunk: string;
	readonly base: string;
	readonly max_workers: number;
} & { readonly [R in RoleName]?: string };

/** `options("keel", schema)` with the schema built from `ROLES`. Exported by `index.ts` for the host. */
export declare const options: {
	readonly schema: unknown;
	read(tx: unknown): Promise<KeelOptions>;
	get(tx: unknown): Promise<Partial<KeelOptions>>;
	set(tx: unknown, value: Partial<KeelOptions>): Promise<void>;
};

export function modelFor(role: RoleName, options: KeelOptions): ModelRef {
	throw new Error("not implemented");
}

/** Prose for a role: `prose/roles/<role>.md` for agents, `prose/roles/seats/<role>.md` for children. */
export type RoleCatalog = {
	/** Settings for a lane agent or a child, from current options. Instructions are re-rendered at every delivery. */
	settings(role: RoleName, options: KeelOptions): RoleSettings;
	/** Seats a conversation of `role` may dispatch, with their settings; `{}` for roles without seats. */
	seats(role: RoleName, options: KeelOptions): Readonly<Record<string, RoleSettings>>;
};
