# Extension package failure list

| Failure | Test |
| --- | --- |
| A sixth package path becomes importable. | exports.test.ts |
| A runtime name or type differs from the README in either direction. | exports.test.ts |
| A name is available through two entries. | exports.test.ts |
| A re-export changes identity or its documented origin. | exports.test.ts |
| A core package imports the extension package. | tools/workspace.test.mjs |
| The faux answer accepts a trailing device identity. | core/test/store/types.test.ts |
| The store adds a fourth export path. | core/test/store/exports.test.ts |

The existing kit failure list and tests move here with the helpers.
