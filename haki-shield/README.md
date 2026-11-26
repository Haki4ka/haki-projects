# Haki Shield

A small Manifest V3 content blocker for Chromium-based browsers. It is built
for two jobs:

1. ordinary network blocking with declarative rules;
2. removing ads that are stitched into a live Twitch HLS stream.

Version 1.6.1. See `CHANGELOG.md` for the full history.

## What is inside

- `rules.json` — 47 hand-written DNR rules.
- `universal.json` — 25 000 conservative rules converted from EasyList.
  Only `||domain^`-style entries were kept; unknown modifiers were dropped.
  Rules carry exclusions so they never fire on Twitch, TradingView, YouTube
  or Kleinanzeigen. See `THIRD-PARTY.md`.
- `background.js` — ruleset toggles and a per-site counter.
- `bridge.js`, `twitch.js` — page-side hooks. They rewrite the playback token
  request and patch playlist responses inside the player worker.
- `cosmetic.js` — small site-specific CSS cleanups.
- `popup.html/js/css`, `options.html/js` — controls and exception list.

## How the Twitch part works

The player reads its playlists in a blob worker. The hook is injected before
that worker's `importScripts()` call, so it can see `self.fetch`. When an ad
block is found, its segment URLs, `#EXTINF` and date-time lines are replaced
with the last known live segment instead of being deleted — deleting lines
breaks HLS timing. A null MPEG-TS packet is returned for cached ad segments.
Bounded ad breaks are still removed outright.

## Install

Extensions page → developer mode → **Load unpacked** → select this folder.
After changing `manifest.json`, use **Update** and then **Reload** on the
extension card.

## EasyList refresh

MV3 static rulesets are read at extension load time, so a rebuilt
`universal.json` only takes effect with a new extension version. The repository
ships `tools/update-easylist.mjs`, which fetches the public EasyList URL,
compares SHA-256, backs up the current files, rebuilds, validates the limits and
bumps the version. `tools/run-easylist-update.ps1` is the task-scheduler wrapper
with a seven-day guard against double bumps. Nothing is written when the
upstream hash is unchanged.

## Development

`tools/build-filters.mjs` regenerates `universal.json` from the public EasyList
URL. Keep the 25 000-rule cap, the 1 000-regex cap and the protected-domain
exclusions; a failed validation leaves the previous ruleset intact.

## License

MIT for our code. EasyList-derived data keeps CC BY-SA 3.0 — see
`THIRD-PARTY.md`.
