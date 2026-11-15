import { prose } from "tau";

export const instructions = prose(import.meta.dirname, "instructions.md", [
	"pass",
	"contract",
	"findings",
]);
