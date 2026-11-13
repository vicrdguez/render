export async function run(argv: readonly string[]): Promise<number> {
	// TODO pi-schema validate argv/config. No argument means startServer with ~/.tau,
	// pi's own server-machine model credentials, NodeExecutionEnv and the static modules map.
	// TODO tau device pair NAME | revoke NAME | list -> requestAdmin on ~/.tau/admin.sock.
	// Device subcommands never write devices.json or poll files.
	// TODO signals close gracefully; bind only 127.0.0.1:6283 by default. No client is built.
	throw new Error("not implemented");
}
