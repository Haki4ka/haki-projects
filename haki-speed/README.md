# Haki Speed

Playback speed controller for HTML5 video. Standalone Manifest V3 extension: it does not depend on or modify other extensions. Built and tested in Brave. Version **1.4.0**.

## Features

- A compact glass bar appears over a video on hover and fades after about 2.5 seconds without pointer movement, including in fullscreen. It has slower / faster buttons, the current speed and a gear that opens settings.
- A larger floating panel is available from the toolbar button or a hotkey. Drag its header to move it; the position is saved.
- Both panels have a slow violet/cyan colour drift and liquid ripples that spread from the pointer. The ambient switch turns the whole effect off.
- The chosen speed is applied to every `<video>` on the page at once and reasserted if a player silently resets it after a seek or buffer event.
- Speeds are remembered per domain or domain + path. Synchronize shares one speed across all sites.
- Settings cover theme, panel size and opacity, bar position and inset, step size, limits, hotkeys and the wheel modifier.

## Controls

- **Player bar:** click the centre digits to silently reset playback to 1× — the bar looks unchanged.
- **Hotkeys:** record any keyboard key, wheel direction or mouse button, including the middle button, with Ctrl / Alt / Shift / Meta. Wheel and button combinations act only over videos and the two panels, so normal page scrolling is untouched.
- **Wheel modifier:** Shift, Alt, Ctrl, Meta, any wheel, or Disabled. A combination recorded in Hotkeys always takes priority; Shift + wheel is never applied twice. Step size ranges from 0.05× to 1.00× in 0.05 increments.
- **Browser shortcuts:** Alt+Shift+U (faster), Alt+Shift+S (slower), Alt+Shift+R (reset), Alt+Shift+P (show/hide panel). Rebind them in `brave://extensions/shortcuts`.

Press Esc while recording to cancel. Key combinations are ignored while typing in a field.

## Privacy

Settings and the last used speed are stored locally with `chrome.storage.local`. No accounts, network requests, viewing history or telemetry.

## Install

Download the ZIP from Releases, unpack it, then open `brave://extensions` (or `chrome://extensions`), enable developer mode and choose **Load unpacked** on this folder. Pin the toolbar button for quick access. No build step is needed.

After replacing the files on disk, use **Update extensions now**, then **Reload** on the extension card. New content scripts only reach freshly opened tabs. Disable other speed extensions: two extensions writing `playbackRate` will conflict. Haki Speed never disables anything automatically.

## Notes and limits

- Works with HTML5 `<video>`. Proprietary players without a real video element cannot be controlled.
- Iframes get their own bar because each frame is a separate document; the saved speed is shared by domain.
- Open shadow roots are scanned. Deeply nested custom players may need a later pass.
- A speed change made with the site's own control is adopted and applied to every video on the page.
- Fullscreen video is supported: the controller moves into the fullscreen element and the bar follows the video rectangle.

## License

MIT. See `LICENSE` in the repository root.
