import assert from "node:assert/strict";
import { test } from "node:test";
import { obj, str, } from "@earendil-works/pi-schema";
import * as kit from "../src/helpers.js";
const roleShape = true;
const roleCall = kit.role;
const modelCall = kit.modelRef;
const optionsCall = kit.options;
function compileContracts(tx) {
    const model = { provider: "local", modelId: "chosen" };
    // @ts-expect-error Every role must name its model.
    kit.role(tx, { extensions: [] }, { kind: "ownerless" });
    // @ts-expect-error Every role must name its extension selection.
    kit.role(tx, { model }, { kind: "ownerless" });
    // @ts-expect-error A null model is not a role model.
    kit.role(tx, { model: null, extensions: [] }, { kind: "ownerless" });
    // @ts-expect-error A null selection is not an explicit selection.
    kit.role(tx, { model, extensions: null }, { kind: "ownerless" });
    const render = kit.prose("/module", "instructions.md", ["pass", "contract"]);
    render({ pass: "2", contract: "C4" });
    // @ts-expect-error A declared fact is required.
    render({ pass: "2" });
    // @ts-expect-error Facts are strings.
    render({ pass: 2, contract: "C4" });
    const port = kit.options("workflow", obj({ model: str() }));
    const host = port;
    void host;
    // @ts-expect-error Stored keys follow the schema type.
    port.set(tx, { model: 42 });
}
void compileContracts;
test("emitted package exports exactly the four helpers with locked signatures", () => {
    assert.deepEqual(Object.keys(kit).sort(), [
        "modelRef",
        "options",
        "prose",
        "role",
    ]);
    assert.equal(roleShape, true);
    assert.equal(roleCall, kit.role);
    assert.equal(modelCall, kit.modelRef);
    assert.equal(optionsCall, kit.options);
});
//# sourceMappingURL=types.test.js.map