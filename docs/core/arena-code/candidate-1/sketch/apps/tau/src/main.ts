#!/usr/bin/env node
/**
 * The `tau` command. Node runs this file as it is, with its own type stripping. The Nix package must not place the tree
 * under a `node_modules` directory: Node refuses to strip types there (probe/toolchain, T2).
 */

import { main } from "tau-core/host";
import { modules } from "./extensions.ts";

process.exitCode = await main(process.argv.slice(2), modules);
