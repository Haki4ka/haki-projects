# Filter verification tools

Small utilities that check Haki Shield filter data.

| Tool | Purpose |
|---|---|
| `python/analyze_easylist.py` | Counts EasyList line types and extracts safe `||domain^` hosts. Standard library only. |
| `cpp/scan_rules.cpp` | Stream scanner used to cross-check the Python counts. Built with MinGW-w64. |
| `ts/verify-rules.ts` | Validates ID uniqueness, rule limits, resource types and protected-site exclusions before a release. |

Run the TypeScript check with `npm run verify` in `ts/`. It compiles with `tsc --noEmit` first, then runs the generated JavaScript. `node_modules/` and `dist/` are ignored.
