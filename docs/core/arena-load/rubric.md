# Loader and reload arena: rubric (picker and judge only)

Score each criterion 0 to 5.

1. **Fidelity.** Every settled decision is carried out as stated. Nothing else in the locked design changes without being named. Nothing deferred is built (no removal, no per-project reopen, no prose re-read, no new client call without the admission and version argument).
2. **Reload is safe.** The steps and their order leave no window where a project has half an extension, a stale default selection, or a stale options catalogue. A failed re-import keeps the old code. A crash in the middle leaves nothing that a restart does not repair. A task blocked by a missing migration is found and reported. Races with `bind`, `addExtensions`, and a second reload are settled.
3. **Least machinery.** The fewest new parts that satisfy 1 and 2. One list behind the alias table. No registry framework, plugin manifest format, or watcher. A simpler alternative that would do is named and beaten on a concrete burden.
4. **Boundaries by the build.** `answer` outside the testing entry, the core importing an extension or the extension package, and an extension importing past the extension package each fail the gate. The core's gate passes with no extension present. Shown or tied to the existing checker, not asserted.
5. **Evidence.** Claims beyond `probe-report.md` are measured. The parts the report left unmeasured (a crash mid-replacement, removed or renamed phases, two reloads at once) are either measured or handled without relying on them.
6. **The restructure is buildable.** Ordered units, each with a check that can fail, with the fate of the 283 tests stated. An agent that sees only one unit's kickoff could do it.
