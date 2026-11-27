# Third-party data

The extension code, UI, converter and Twitch logic are written by the project author. This file documents the one external data source used to build `universal.json`.

## EasyList

- Source: https://easylist.to/easylist/easylist.txt
- Authors: The EasyList authors (easylist.to/)
- Licence: GPLv3-or-later or CC BY-SA 3.0-or-later, at the user's option.
- Election for the derived `universal.json`: **CC BY-SA 3.0-or-later**.
- Attribution: "The EasyList authors (easylist.to/)".
- Upstream header: `! Version: 202611271003`, `! Title: EasyList`, `! Homepage: https://easylist.to/`, `! Licence: https://easylist.to/pages/licence.html`
- Source SHA-256: `8db96c63ea1684c6e10569bef3d03acf8150b3cd9ed0ae95ad7df241ac120772`
- Rules emitted: 25,000. Built: 2026-11-27T10:07:39.452Z.

## Conversion

Kept: host-anchored `||domain^` blocks with optional `$third-party` and resource types. A bare `@@||domain^` removes a domain from the generated list.

Dropped: path, query and port rules, regex rules, cosmetic `##` rules, scriptlets, `$redirect`, `$csp`, `$removeparam`, `$domain`, wildcard domains, IP addresses and bare public suffixes.

Every generated rule excludes `twitch.tv`, `tradingview.com`, `youtube.com` and `kleinanzeigen.de` as initiator. Requests to those domains are never blocked by this layer.

No code from AdGuard extensions or GPLv3 converter packages is used. `tools/build-filters.mjs` is an independent implementation.
