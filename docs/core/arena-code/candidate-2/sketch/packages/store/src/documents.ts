// Private persisted names. No exports from a package entry point.
// TODO defineDocFamily for decisions and a session doc for open subjects plus counters.
// TODO defineDoc for event log ID. pi-schema validates values at migration/import seams.
// Decision data stays exactly docs/core/primitives.md. Never add project to these records.
// pi JsonValue arrays are mutable. Use a private stored value with mutable arrays and copy
// at the document seam, preserving the exact public readonly Decision shape without casts.
export {};
