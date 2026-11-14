import type { ExtensionModule } from "tau-host";

// The static import map. Each key is its module's `extension.name`. The extension units add their modules here.
export const modules: Readonly<Record<string, ExtensionModule>> = {};
