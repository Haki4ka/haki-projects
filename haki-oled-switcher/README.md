# Haki OLED Switcher

Version 3.4.0. One toolbar button controls a pure-black browser theme and site darkening independently. Built and tested in Brave.

## Features

- **Theme** toggles the companion `Haki OLED` theme through `chrome.management`.
- **Sites** darkens light pages without inverting video, images or brand colours.
- Three site modes: `haki-force-dark` for light pages, `haki-gray` for grey pages, and native dark for pages that are already dark. Pages that declare a dark colour scheme keep their own palette; an explicit gray-mode entry still wins.
- The popup has editable lists. Gray-mode domains use dark surfaces without colour inversion. "Never darken" domains keep their original colours and take priority over every other mode, including special rules. Subdomains are included, and open tabs update without a reload.
- **Recheck this page** in the popup, and the right-click menu item with the same name, re-run detection after a site changes its theme without a reload.
- Separate rules for YouTube, YouTube Music, Twitch and Rezka.
- Twitch side navigation, chat, input and player controls are black or transparent while chat text, the typed message and control icons stay visible.
- Shadow DOM and iframes receive matching media rules. CSS background images are inverted back to their natural colours too.

## Controls

- Click the toolbar icon for two switches and the site lists.
- Right-click the icon to toggle site darkening or recheck the current page.
- `Alt+Shift+D` toggles both switches together.

The theme and site switches do not affect each other.

## Install

From the release ZIP, unpack it and load `theme/`, then `switcher/`, as unpacked extensions on the browser's extensions page (`brave://extensions` in Brave) with developer mode on. In this repository the same folders are `haki-oled-theme/` and `haki-oled-switcher/`. Pin the toolbar icon if the browser unpins it after an update.

Site darkening works in any Chromium-based browser. The theme switch uses the companion theme's extension ID, so it is intended for Brave; darkening still works if the theme is not found.
