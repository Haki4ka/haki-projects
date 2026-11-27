# Haki Shield

Ad blocker for Chromium and Brave. Version **1.8.9**.

## What it blocks

- Network ads: 47 hand-written rules in `rules.json`.
- Web ads: 24,998 host rules in `universal.json`, converted from EasyList by our own tool. Twitch, TradingView, YouTube and Kleinanzeigen are excluded.
- Video ads: `playerads.json` blocks VAST requests and rejects foreign `video.src` swaps after a normal source has loaded.
- Twitch stream ads: hooks the blob worker, removes stitched ad segments and shortens pre-roll metadata.
- Banners: high-precision CSS for Twitch and TradingView.

`remote_control.php` is never blocked. It is part of Twitch stream control.

## Controls

The popup has independent switches for network ads, web ads, video ads and banners. It also shows blocked requests for the current site. The options page has the same switches, active rule sets and a per-site exclusion list.

## Install

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable developer mode.
3. Choose **Load unpacked** and select this folder.

No build step is needed to use the extension.

## Updating filters

`tools/update-easylist.mjs` checks EasyList once a week. On a change it backs up, rebuilds `universal.json`, validates the rulesets, bumps the version and writes to `AI Lab/logs/easylist-update.log`. Reload the unpacked extension after a version bump.

## Attribution

EasyList data is used under CC BY-SA 3.0. See `THIRD-PARTY.md`.

## License

MIT. See `LICENSE` in the repository root.
