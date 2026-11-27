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
- Source SHA-256 at last build: `a3cddc45e939d1906df0b71425ca54e754220d536a647de2831590ac14c5966e`
- Rules emitted: 24998
- Built: 2026-11-26T00:26:26.306Z

### Upstream notice (verbatim header lines)

> ! Version: 202611260020
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
