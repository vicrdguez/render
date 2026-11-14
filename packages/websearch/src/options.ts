import { options as defineOptions } from "tau-extension";
import { obj, oneOf, str } from "tau-extension/schema";

export const options = defineOptions(
	"websearch",
	obj({
		provider: oneOf(["exa", "tavily"]),
		apiKey: str({ format: "secret", minLength: 1 }),
	}),
);
