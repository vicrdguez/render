import { taskLine } from "../host/index.js";
export function printReload(report) {
    if (report.status !== "applied") {
        process.stderr.write(report.status === "refused"
            ? "tau: reload refused; old code still runs.\n"
            : "tau: restart required; publication did not finish.\n");
        for (const failure of report.failures)
            process.stderr.write(`tau: ${failure.name}${failure.path === undefined ? "" : ` ${failure.path}`} ${failure.stage}: ${failure.message}\n`);
        if (report.reached !== undefined)
            process.stderr.write(`tau: reached ${report.reached.project} extension=${report.reached.extension}\n`);
        return 1;
    }
    for (const extension of report.extensions)
        process.stdout.write(`${extension.status} ${extension.name}; projects: ${extension.projects.join(", ") || "none"}\n`);
    for (const task of report.tasks)
        process.stdout.write(`${taskLine(task)}\n`);
    for (const skipped of report.skipped)
        process.stdout.write(`skipped ${skipped.project}: ${skipped.reason}\n`);
    process.stdout.write(`total: ${report.extensions.length} extensions; ${report.tasks.length} tasks; ${report.skipped.length} skipped projects\n`);
    return report.extensions.some((e) => e.status === "kept") ||
        report.tasks.length > 0 ||
        report.skipped.length > 0
        ? 3
        : 0;
}
//# sourceMappingURL=reload.js.map