import { obj, oneOf, str } from "@earendil-works/pi-schema";
import { options as defineOptions } from "tau-kit";

export const options = defineOptions(
	"websearch",
	obj({
		provider: oneOf(["exa", "tavily"]),
		apiKey: str({ format: "secret", minLength: 1 }),
	}),
);
