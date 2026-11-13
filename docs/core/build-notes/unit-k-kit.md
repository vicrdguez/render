# Build notes for unit K

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Kit dependency declarations | Declare test imports as development dependencies. Or use dependencies as the sketch does. | Declare Chord and pi-ai as dependencies, used only by tests. | The existing boundary checker rejects test imports from development dependencies. Production imports only pi-durable, pi-schema, and Node. No new library is added. |
| Markdown after emit | Copy source Markdown only. Or also copy test Markdown beside emitted test modules. | Copy both source and test Markdown with the same relative paths. | The emitted fixture must test module-relative loading without putting test prose in production source. |
| Asset build entry | Change the root build script. Or extend the flake typecheck command that already emits TypeScript. | Copy assets after the flake typecheck command emits. | Build, test, check, and the gate already use that command. No second build path is needed. |
| Prose slot names | Restrict names to an identifier grammar. Or match the exact text inside each complete double-brace slot. | Match exact names and compare sets. Repeated slots are allowed. | The design fixes the delimiters but no identifier grammar. There is no template language or recursive substitution. |
| Prose facts | Validate typed internal facts again at render time. Or require the declared string fields in TypeScript. | Require the fields in TypeScript. | Extension code supplies facts. Files are checked at load. Render does no file access or second validation. |
| Invalid model strings | Add a new rejection rule to modelRef. Or keep the string cut in the sketch and spike. | Keep the string cut. | The host checks model availability. The helper receives a provider and model ID separated by a slash. Behavior outside that input contract is not promised. |
| Options defaults and document shape | Store filled defaults. Or keep only explicit keys and fill defaults during read. | Keep a version 1 session document with no wrapper and no checkpoints. Compile the supplied closed schema once. | This matches the host spike. Changed defaults reach an unset key when the extension module is loaded again. |
| Options read errors | Add a new error type. Or throw Error with pi-schema errors. | Throw Error with the extension name and validation errors. | The design requires a throw but names no error class. The host owns client refusal codes. |

## Verification limits

The kit tests use real pi-durable MemoryStorage and faux model requests. They make no real model calls. The package does not own SQLite crash recovery, client patch validation, secret masking, or provider login checks. Those remain with their owning units. The existing design spikes still run unchanged in the cumulative gate.

The extension callers are being built in other units. This branch checks the locked types and the structural host options contract without importing those units.
