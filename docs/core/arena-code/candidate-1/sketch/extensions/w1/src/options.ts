import { obj, str } from "@earendil-works/pi-schema";
import { options } from "tau-kit";

// Copied from docs/core/kit.md, "W1 and W2 on paper".
export const W1Options = options(
	"w1",
	obj({
		designer: str({ format: "model" }),
		implementer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	}),
);
