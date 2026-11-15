import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { defineEntry, defineTask } from "@earendil-works/pi-durable";
import { emit, request } from "tau";
import { fauxAnswer } from "tau/testing";
// tsc checks these cases. An `@ts-expect-error` line that compiles fails the build.
const DesignAnswer = defineTask({
    name: "types.design_answer",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: { run: async () => { } },
    abort: async () => { },
});
export async function cases() {
    void fauxAnswer(store, "test:k#1", input);
    // @ts-expect-error Tests cannot supply a device identity.
    void fauxAnswer(store, "test:k#1", input, "phone");
    // @ts-expect-error Tests cannot override identity after supplying context.
    void fauxAnswer(store, "test:k#1", input, BACKGROUND_CONTEXT, "phone");
    const draft = {
        subject: "w1:7:design",
        title: "Design v2",
        basis: design,
        conversation,
        requestedAt: 0,
    };
    const asked = await request(tx, {
        ...draft,
        choices: ["approve", "revise", "abort"],
        then: DesignAnswer,
    });
    void asked.choices;
    // @ts-expect-error The then task accepts more choices than the request offers.
    void request(tx, { ...draft, choices: ["approve"], then: DesignAnswer });
    void request(tx, {
        ...draft,
        choices: ["approve", "abort"],
        // @ts-expect-error The then task accepts more choices than the request offers.
        then: DesignAnswer,
    });
    void request(tx, {
        ...draft,
        choices: ["approve", "retry"],
        // @ts-expect-error The then task does not accept "retry".
        then: DesignAnswer,
    });
    void request(tx, {
        ...draft,
        choices: ["retry", "abort"],
        // @ts-expect-error The then task does not accept "retry".
        then: DesignAnswer,
    });
    void request(tx, {
        ...draft,
        // @ts-expect-error A basis entry carries text.
        basis: commit,
        choices: ["approve", "revise", "abort"],
        then: DesignAnswer,
    });
    // @ts-expect-error A decision offers at least one choice.
    void request(tx, { ...draft, choices: [], then: DesignAnswer });
    const descriptor = {
        definition: {
            name: "types.design_answer",
            initial: (_input) => ({ phase: "run" }),
        },
    };
    // @ts-expect-error The then task is a pi-durable task, not only a name and an initial.
    void request(tx, { ...draft, choices: ["retry"], then: descriptor });
    const Wrong = defineTask({
        name: "types.wrong",
        version: 1,
        initial: () => ({ phase: "run" }),
        phases: { run: async () => { } },
        abort: async () => { },
    });
    // @ts-expect-error The then task takes a decision and a choice.
    void request(tx, { ...draft, choices: ["approve"], then: Wrong });
    const Handed = defineEntry("w1.handed");
    const Bare = defineEntry("w1.bare");
    void emit(tx, Handed, { text: "Approved.", at: 0, sha: "S2" });
    // @ts-expect-error An event carries text.
    void emit(tx, Bare, { at: 0 });
}
test("the type cases compile as marked", () => { });
//# sourceMappingURL=types.test.js.map