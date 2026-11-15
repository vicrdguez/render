import { options as defineOptions } from "tau";
import { obj, oneOf, str } from "tau/schema";

export const options = defineOptions(
	"websearch",
	obj({
		provider: oneOf(["exa", "tavily"]),
		apiKey: str({ format: "secret", minLength: 1 }),
	}),
);
