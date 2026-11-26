# Haki projects

Small, self-contained browser extensions and the notes behind them.

| Folder | What it is |
|---|---|
| `haki-shield/` | Manifest V3 ad blocker for Chromium/Brave, including a Twitch stream hooking layer and a conservative EasyList-derived ruleset. |
| `haki-oled-switcher/` | Compact Brave toolbar menu that toggles a pure-black browser theme and per-site dark styling independently. |
| `ai-lab/` | Research notes about DNR limits and Twitch HLS markers, plus small Python/C++/TypeScript utilities used to validate rules. |

Everything here is written from scratch. The only third-party data is the
EasyList-derived URL list in `haki-shield/universal.json`; see
`haki-shield/THIRD-PARTY.md` for attribution and licensing.

## Install

Open the browser extensions page, enable developer mode, choose
**Load unpacked** and point it at `haki-shield/` or `haki-oled-switcher/`.
No build step is required for the extensions.

The scripts in `ai-lab/langs/` are developer tools, not part of the extensions.
See `ai-lab/langs/README.md`.

## License

Our own code is MIT licensed (see `LICENSE`). Third-party filter data keeps its
original license, documented in `haki-shield/THIRD-PARTY.md`.
