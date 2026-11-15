# Kit failure list

Write the tests before the helpers.

| Failure | Test file |
| --- | --- |
| Options leak between stores or extension names, or use a different document name. | options.test.ts |
| Defaults are stored, explicit keys are merged rather than replaced, or returned values mutate storage. | options.test.ts |
| Missing, invalid, unknown, or newly required options pass read. | options.test.ts |
| A failed caller commit leaves options behind. | options.test.ts |
| A model ID loses a slash after the first one. | model-ref.test.ts |
| A role loses settings, ownership, inherited fields, or atomicity. | role.test.ts |
| A role submits input itself or allows input in the creating commit. | role.test.ts |
| Open roles lose project defaults or closed roles gain later extensions. | role.test.ts |
| The first model request ignores the role model or tools. | role.test.ts |
| Required role fields or prose facts become optional in TypeScript. | types.test.ts |
| Prose accepts a missing file, undeclared slot, or declared slot absent from the file. | prose.test.ts |
| Substitution recurses, alters Markdown, or reads the file at render time. | prose.test.ts |
| Prose implements conditions, loops, or includes. | prose.test.ts |
| Emitted modules lack their Markdown or the package exports extra runtime helpers. | prose.test.ts, types.test.ts |

The host validates client patches, model availability, and secret replies. The kit does not repeat those responsibilities. Render facts are typed strings from extension code.
