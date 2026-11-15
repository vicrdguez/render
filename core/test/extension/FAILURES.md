# Extension author entry failure list

| Failure | Test |
| --- | --- |
| A seventh package path becomes importable. | exports.test.ts |
| A runtime name or type differs from the README in either direction. | exports.test.ts |
| A name is available through two entries. | exports.test.ts |
| A re-export changes identity or its documented origin. | exports.test.ts |
| Store, host, or command code imports the extension author directory. | tools/workspace.test.mjs |
| The faux answer accepts a trailing device identity. | core/test/store/types.test.ts |
| The core adds an unlisted export path. | core/test/store/exports.test.ts |

The server entry re-exports no pi names or helpers. The README test follows each server export to its declaration.

The existing kit failure list and tests move here with the helpers.
