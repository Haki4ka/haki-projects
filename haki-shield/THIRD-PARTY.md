# Third-party data used by Haki Shield

Our extension code, converter, UI and Twitch logic are written by us.
This file records the one external data source we convert at build time.

## EasyList

- Source: https://easylist.to/easylist/easylist.txt
- Authors: The EasyList authors (easylist.to/)
- Upstream licence: dual **GPLv3-or-later** or **CC BY-SA 3.0-or-later**, at our option.
- **Our election: CC BY-SA 3.0-or-later** for the derived data file `universal.json`.
  We choose the Creative Commons arm so our own extension code stays ours.
- Required attribution: "The EasyList authors (easylist.to/)".
- Source SHA-256 at last build: `b62d2256ac6c228ec0f5069dced47e8ca74f67eaef7173c721d17d4be83b44bf`
- Rules emitted: 25000
- Built: 2026-11-25T22:48:17.165Z

### Upstream notice (verbatim header lines)

> ! Version: 202611252237
> ! Title: EasyList
> ! Homepage: https://easylist.to/
> ! Licence: https://easylist.to/pages/licence.html

### What we keep and what we drop

Kept: only host-anchored `||domain^` block rules, optionally with
`$third-party` and ordinary resource-type modifiers. Exceptions `@@||domain^`
remove a domain from our list.

Dropped: path-, query- or port-scoped rules, regex rules, cosmetic `##` rules,
scriptlets, `$redirect`, `$csp`, `$removeparam`, `$domain=`, wildcard domains,
IP addresses and bare public suffixes. We never widen a narrow rule to a
whole-domain block.

### Protection of existing behaviour

Every emitted rule carries `excludedInitiatorDomains` for
`twitch.tv`, `tradingview.com`, `youtube.com`, `kleinanzeigen.de`, and requests whose
target is one of those domains are skipped entirely. Twitch, TradingView,
YouTube and Kleinanzeigen keep their hand-tuned behaviour.

### What we did NOT use

No code was copied from AdGuard's browser extension. We did not use its
GPLv3 `tsurlfilter`/`dnr-converter` package as a dependency; we only studied
public documentation. Our converter in `tools/build-filters.mjs` is ours.
