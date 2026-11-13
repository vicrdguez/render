#!/usr/bin/env node
import { openHost } from "tau-core/host";
import { extension } from "tau-demo";

const host = await openHost([extension]);
console.log(`tau probe: host open with ${extension.name}`);
await host.close();
