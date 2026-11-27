# Haki Projects

Two browser extensions for Brave and Chromium, plus the small tools that check their filter rules.

| Folder | Description |
|---|---|
| `haki-shield/` | Manifest V3 ad blocker: manual rules, an EasyList-derived layer, video-ad protection and Twitch stream hooks. |
| `haki-oled-switcher/` | Toolbar button for a pure-black Brave theme and independent site darkening. |
| `haki-oled-theme/` | Companion deep-black theme for Brave. |
| `tools/` | Converter and rule checks used during development. |

## Install

Download a ZIP from Releases, unpack it, then open `brave://extensions`, enable developer mode and choose **Load unpacked**. No build step is required.

The OLED ZIP contains `theme/` and `switcher/`; load both folders. The Shield ZIP is loaded as one extension.

## License

MIT for the project code. `haki-shield/universal.json` is derived from EasyList under CC BY-SA 3.0; see `haki-shield/THIRD-PARTY.md`.
