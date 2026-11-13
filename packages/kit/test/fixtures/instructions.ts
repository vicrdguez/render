import { prose } from "tau-kit";

export const instructions = prose(import.meta.dirname, "instructions.md", [
	"pass",
	"contract",
	"findings",
]);
