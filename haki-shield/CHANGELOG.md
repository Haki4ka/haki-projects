# Changelog

## 1.8.9
- Removed temporary playlist diagnostics from the shipped code.

## 1.8.8
- Playback token now uses `playerType:"embed"`. Twitch starts in about 15-18 s instead of 22-23 s; 1920x1080 playback is unchanged.

## 1.8.7 / 1.8.6 / 1.8.5
- Short-lived metadata experiments. Reverted after measurement.

## 1.8.4
- Fixed the worker XHR timeout that had disabled ad removal.

## 1.8.0 - 1.8.3
- Cached the last live HLS segment so a pre-roll with no live segment no longer stalls startup.
- Matched ad URLs by origin and path; cleaned playlists in the page as well as in workers.

## 1.7.0
- Universal video-ad layer: `playerads.json` and `player.js`.
- VAST requests and foreign `video.src` swaps are rejected across sites.

## 1.6.1
- Weekly EasyList refresh with SHA-256 check, backup, rebuild and validation.

## 1.6.0
- `universal` ruleset with conservative EasyList host rules and exclusions for hand-tuned sites.
- Separate **Universal ads** switch.

## 1.5.x
- Per-site blocked counter.
- Faster Twitch start; no `mobile_web` token, so no 360p fallback.

## 1.0 - 1.4
- Initial Manifest V3 blocker, Twitch worker hooks and cosmetic rules.
