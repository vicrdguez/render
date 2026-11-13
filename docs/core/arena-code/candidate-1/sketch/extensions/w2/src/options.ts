import { obj, str } from "@earendil-works/pi-schema";
import { options } from "tau-kit";

// Copied from docs/core/kit.md, "W1 and W2 on paper". A model has no default.
export const W2Options = options("w2", obj({ model: str({ format: "model" }) }));
