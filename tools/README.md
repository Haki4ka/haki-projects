# Development tools

Utilities used to build and verify Haki Shield filter data. They are not needed to install or use the extension.

- `build-filters.mjs` converts safe EasyList host rules into `universal.json`.
- `update-easylist.mjs` refreshes the list from upstream and bumps the extension version.
- `langs/` contains the Python counter, C++ cross-check and TypeScript rule validator.

Run `npm run verify` inside `langs/ts/` before publishing a release.
