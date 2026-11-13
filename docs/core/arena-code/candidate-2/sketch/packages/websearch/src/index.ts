import { obj, str } from "@earendil-works/pi-schema";
import { options as defineOptions } from "tau-kit";

export { extension } from "./web-search.js";

// docs/core/extensions.md. Provider list and Webfox version are deliberately deferred to unit 3.
export const WebsearchOptions = defineOptions(
	"websearch",
	obj({
		provider: str({ minLength: 1 }),
		apiKey: str({ format: "secret", minLength: 1 }),
	}),
);
export const options = WebsearchOptions;
// No entry export: this is not a workflow.
