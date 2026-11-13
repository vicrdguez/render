import { prose } from "tau-kit";

// Loaded when the module loads (docs/core/prose.md, "Prose loads when the module loads").
export const agentInstructions = prose(import.meta.dirname, "../prose/agent.md", []);
