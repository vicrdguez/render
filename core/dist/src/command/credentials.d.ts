import type { CredentialStore } from "@earendil-works/pi-ai";
/** Shares pi's resolved auth.json lock for the entire read, refresh, and write. */
export declare function piLogins(file: string): CredentialStore;
