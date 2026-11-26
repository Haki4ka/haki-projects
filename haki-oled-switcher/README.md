# Haki OLED Switcher

A tiny Brave extension with one toolbar button. The button opens a small dark
menu with two independent switches:

- **Browser theme** — enables/disables a pure-black theme by its extension ID;
- **Site darkening** — applies per-site styling without reloading the page.

`Alt + Shift + D` toggles both at once. The same two controls are available in
the context menu and on the options page.

Version 3.1.0.

## Site handling

- Generic light pages get an inversion filter with images inverted back.
- YouTube and YouTube Music get direct black OLED variables instead of a
  filter, so video and accents keep their colours.
- Twitch gets its own black variable overrides.
- Rezka has a separate stylesheet because it ships both a light and a dark
  theme of its own.

The stylesheet is injected from `detect.js` rather than from `manifest.json`
content scripts; this keeps the extension out of Brave's "theme" bucket, which
would otherwise ignore site permissions.

## Install

Extensions page → developer mode → **Load unpacked** → select this folder,
then pin the "H" button from the extensions toolbar menu.

## License

MIT.
