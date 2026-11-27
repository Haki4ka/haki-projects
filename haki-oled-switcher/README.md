# Haki OLED Switcher

Version 3.3.2. One toolbar button controls a pure-black Brave theme and site darkening independently.

## Features

- **Theme** toggles the companion `Haki OLED` theme through `chrome.management`.
- **Sites** darkens light pages without inverting video, images or brand colours.
- Three site modes: `haki-force-dark` for light pages, `haki-gray` for grey pages, and native dark for pages that are already dark.
- The popup has an editable gray-mode list. Domains there use dark surfaces without colour inversion; subdomains are included, and open tabs update without a reload.
- Separate rules for YouTube, YouTube Music, Twitch and Rezka.
- Twitch side navigation and chat are black while chat text keeps its own colours.
- Shadow DOM and iframes receive matching media rules.

## Controls

- Click the toolbar icon for two switches.
- Right-click the icon to toggle site darkening.
- `Alt+Shift+D` toggles both switches together.

The theme and site switches do not affect each other.

## Install

From the release ZIP, unpack it and load `theme/`, then `switcher/`, as unpacked extensions in `brave://extensions` with developer mode on. In this repository the same folders are `haki-oled-theme/` and `haki-oled-switcher/`. Pin the toolbar icon if Brave unpins it after an update.
