#!/usr/bin/env node
/*
 * Haki Shield — our own build-time filter converter.
 *
 * It downloads a public Adblock-style filter list and keeps ONLY rules we can
 * express safely as declarativeNetRequest host-anchor blocks:
 *
 *   ||example.com^$third-party,script   ->  block requests TO example.com
 *
 * Everything ambiguous is dropped: path/query-scoped rules, regexes,
 * cosmetic (##) rules, scriptlets, $redirect/$csp/$removeparam/$domain rules,
 * wildcard domains, IPs and public suffixes. Bare @@ exceptions are honoured.
 *
 * No foreign converter code is used. The AdGuard tsurlfilter converter is
 * GPLv3, so we deliberately do not depend on it or copy from it.
 *
 * Usage:
 *   node tools/build-filters.mjs --dry              # analyse, write nothing
 *   node tools/build-filters.mjs                    # write universal.json + THIRD-PARTY.md
 *   node tools/build-filters.mjs --url <url> --max 15000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON = path.resolve(HERE, '../universal.json');
const OUT_CREDIT = path.resolve(HERE, '../THIRD-PARTY.md');

const DEFAULT_URL = 'https://easylist.to/easylist/easylist.txt';
const START_ID = 10000;
const MAX_RULES = 25000;

/* Requests STARTING on these sites are never touched by the universal layer.
   Subdomains are included by DNR automatically. Twitch/TradingView/YouTube/
   Kleinanzeigen already have proven, hand-tuned behaviour we must not break. */
const PROTECTED_INITIATORS = [
  'twitch.tv',
  'tradingview.com',
  'youtube.com',
  'kleinanzeigen.de'
];

const DEFAULT_TYPES = ['script', 'image', 'xmlhttprequest', 'sub_frame', 'ping', 'other'];

const TYPE_MAP = {
  script: 'script',
  image: 'image',
  images: 'image',
  img: 'image',
  background: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  sub_frame: 'sub_frame',
  frame: 'sub_frame',
  iframe: 'sub_frame',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  ping: 'ping',
  font: 'font',
  media: 'media',
  object: 'object',
  websocket: 'websocket',
  other: 'other'
};

/* Shared CDN/infrastructure hosts must never be blocked wholesale: specific
   subdomains may serve ads, but the other 99% serve ordinary site content. */
const SHARED_CDN_BASES = new Set([
  'cloudfront.net', 'amazonaws.com', 'workers.dev', 'pages.dev', 'b-cdn.net',
  'cdn77.org', 'akamaized.net', 'azureedge.net', 'cloudflare.com', 'fastly.net',
  'jsdelivr.net', 'unpkg.com', 'github.io', 'netlify.app', 'vercel.app',
  'herokuapp.com', 'googleapis.com', 'gstatic.com'
]);

/* Bare public suffixes must never become whole-domain blocks. */
const PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz',
  'com.br', 'com.tr', 'com.ua', 'com.pl', 'com.cn', 'com.hk', 'co.jp', 'co.in',
  'co.kr', 'com.sg', 'com.mx', 'com.ar', 'co.za', 'net.nz', 'org.nz'
]);

const argv = process.argv.slice(2);
function argValue(name) {
  const i = argv.indexOf(name);
  if (i < 0 || !argv[i + 1] || argv[i + 1].startsWith('--')) return null;
  return argv[i + 1];
}
const URL = argValue('--url') || DEFAULT_URL;
const DRY = argv.includes('--dry');
const MAX = Math.min(parseInt(argValue('--max') || '', 10) || MAX_RULES, 25000);

function isSafeDomain(domain) {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || /^\d/.test(tld)) return false;
  if (PUBLIC_SUFFIXES.has(domain)) return false;
  return !labels.some((part) => part.startsWith('-') || part.endsWith('-'));
}

function parseHostRule(rawLine) {
  let line = rawLine.trim();
  if (line.startsWith('@@')) line = line.slice(2);
  if (!line.startsWith('||')) return null;

  let rest = line.slice(2);
  let modifiers = '';
  const dollar = rest.indexOf('$');
  if (dollar >= 0) {
    modifiers = rest.slice(dollar + 1).trim();
    rest = rest.slice(0, dollar);
  }

  /* Require an exact host anchor: ||domain^ and nothing else after it. */
  if (!/^[A-Za-z0-9.-]+\^$/.test(rest)) return null;
  const domain = rest.slice(0, -1).toLowerCase();
  if (!isSafeDomain(domain)) return null;

  let thirdParty = false;
  let types = null;
  if (modifiers) {
    const parts = modifiers.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const picked = [];
    for (const part of parts) {
      if (part === 'third-party') { thirdParty = true; continue; }
      if (part === 'important') continue; // priority is irrelevant for a pure block
      const mapped = TYPE_MAP[part];
      if (!mapped) return null; // conservative: unknown modifier -> drop the line
      if (!picked.includes(mapped)) picked.push(mapped);
    }
    if (picked.length) types = picked;
  }

  return { domain, modifiers, thirdParty, types };
}

function isProtectedTarget(domain) {
  return PROTECTED_INITIATORS.some((p) => domain === p || domain.endsWith('.' + p));
}

/* Group subdomains by registrable base so that ad networks appearing many
   times (ad.doubleclick.net, fls.doubleclick.net, doubleclick.com) rank above
   one-off obscure domains. This never widens a path-scoped upstream rule. */
function registrableBase(domain) {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  const last2 = parts.slice(-2).join('.');
  return PUBLIC_SUFFIXES.has(last2) ? parts.slice(-3).join('.') : last2;
}

function ruleDomain(rule) {
  return rule.condition.urlFilter.slice(2, -1);
}

/* A priority bonus only — every domain here already comes from EasyList. */
const AD_HINTS = [
  'ad', 'ads', 'advert', 'track', 'analytic', 'pixel', 'banner', 'popup',
  'popunder', 'sponsor', 'bid', 'rtb', 'ssp', 'tag', 'stats', 'counter',
  'click', 'syndication', 'adsystem', 'adservice'
];
function hasAdHint(domain) {
  return AD_HINTS.some((hint) => domain.includes(hint));
}

function upstreamNotice(lines) {
  const wanted = [];
  for (const line of lines.slice(0, 160)) {
    if (/^\s*!/ .test(line) && /licen|title|description|version|homepage/i.test(line)) {
      wanted.push(line.trim());
    }
  }
  return wanted.slice(0, 12);
}

async function main() {
  const response = await fetch(URL, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);
  const text = await response.text();
  const sha256 = crypto.createHash('sha256').update(text).digest('hex');
  const lines = text.split(/\r?\n/);

  const stats = { lines: lines.length, comments: 0, hostRules: 0, exceptions: 0, dropped: 0, protected: 0, skippedCdn: 0, duplicated: 0 };
  const exceptions = new Set();

  /* Pass 1: bare @@ exceptions. They may appear after the block they cancel. */
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('[')) continue;
    if (line.startsWith('!')) { stats.comments++; continue; }
    if (!line.startsWith('@@')) continue;
    const parsed = parseHostRule(line);
    if (!parsed) continue;
    if (!parsed.modifiers) {
      exceptions.add(parsed.domain);
      stats.exceptions++;
    }
  }

  /* Pass 2: blocks. First wins, but a broad rule upgrades a third-party one. */
  const blocks = new Map();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) continue;
    const parsed = parseHostRule(line);
    if (!parsed) { stats.dropped++; continue; }
    stats.hostRules++;
    if (exceptions.has(parsed.domain) || isProtectedTarget(parsed.domain)) {
      stats.protected++;
      continue;
    }
    if (SHARED_CDN_BASES.has(registrableBase(parsed.domain))) {
      stats.skippedCdn++;
      continue;
    }

    const condition = {
      urlFilter: `||${parsed.domain}^`,
      resourceTypes: parsed.types || DEFAULT_TYPES
    };
    if (parsed.thirdParty) condition.domainType = 'thirdParty';
    condition.excludedInitiatorDomains = PROTECTED_INITIATORS.slice();

    const candidate = { priority: 1, action: { type: 'block' }, condition };
    const existing = blocks.get(parsed.domain);
    if (!existing) {
      blocks.set(parsed.domain, candidate);
    } else if (existing.condition.domainType === 'thirdParty' && !candidate.condition.domainType) {
      blocks.set(parsed.domain, candidate);
      stats.duplicated++;
    } else {
      stats.duplicated++;
    }
  }

  /* Rank: ad-looking and short domains first, broad before third-party.
     This prioritises real ad networks without ever blocking shared CDNs. */
  const ranked = Array.from(blocks.values()).sort((a, b) => {
    const da = ruleDomain(a);
    const db = ruleDomain(b);
    const ha = hasAdHint(da) ? 0 : 1;
    const hb = hasAdHint(db) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    const ta = a.condition.domainType ? 1 : 0;
    const tb = b.condition.domainType ? 1 : 0;
    if (ta !== tb) return ta - tb;
    if (da.length !== db.length) return da.length - db.length;
    return da.localeCompare(db);
  });

  const chosen = ranked.slice(0, MAX);
  const rules = chosen.map((rule, i) => ({ id: START_ID + i, ...rule }));
  const notice = upstreamNotice(lines);

  console.log(JSON.stringify({
    url: URL,
    sha256,
    ...stats,
    uniqueDomains: blocks.size,
    emittedRules: rules.length,
    sample: rules.slice(0, 12).map((r) => r.condition.urlFilter),
    hasDoubleclick: rules.some((r) => /doubleclick/.test(r.condition.urlFilter)),
    hasGoogleAdServices: rules.some((r) => /googleadservices/.test(r.condition.urlFilter)),
    hasAdnxs: rules.some((r) => /adnxs/.test(r.condition.urlFilter))
  }, null, 2));

  if (DRY) return;

  const jsonBody = rules.map((r) => '  ' + JSON.stringify(r)).join(',\n');
  await fs.writeFile(OUT_JSON, `[\n${jsonBody}\n]\n`, 'utf8');

  const credit = `# Third-party data used by Haki Shield

Our extension code, converter, UI and Twitch logic are written by us.
This file records the one external data source we convert at build time.

## EasyList

- Source: ${URL}
- Authors: The EasyList authors (easylist.to/)
- Upstream licence: dual **GPLv3-or-later** or **CC BY-SA 3.0-or-later**, at our option.
- **Our election: CC BY-SA 3.0-or-later** for the derived data file \`universal.json\`.
  We choose the Creative Commons arm so our own extension code stays ours.
- Required attribution: "The EasyList authors (easylist.to/)".
- Source SHA-256 at last build: \`${sha256}\`
- Rules emitted: ${rules.length}
- Built: ${new Date().toISOString()}

### Upstream notice (verbatim header lines)

${notice.length ? notice.map((n) => '> ' + n).join('\n') : '> (no licence header lines found in the first 160 lines)'}

### What we keep and what we drop

Kept: only host-anchored \`||domain^\` block rules, optionally with
\`$third-party\` and ordinary resource-type modifiers. Exceptions \`@@||domain^\`
remove a domain from our list.

Dropped: path-, query- or port-scoped rules, regex rules, cosmetic \`##\` rules,
scriptlets, \`$redirect\`, \`$csp\`, \`$removeparam\`, \`$domain=\`, wildcard domains,
IP addresses and bare public suffixes. We never widen a narrow rule to a
whole-domain block.

### Protection of existing behaviour

Every emitted rule carries \`excludedInitiatorDomains\` for
${PROTECTED_INITIATORS.map((d) => `\`${d}\``).join(', ')}, and requests whose
target is one of those domains are skipped entirely. Twitch, TradingView,
YouTube and Kleinanzeigen keep their hand-tuned behaviour.

### What we did NOT use

No code was copied from AdGuard's browser extension. We did not use its
GPLv3 \`tsurlfilter\`/\`dnr-converter\` package as a dependency; we only studied
public documentation. Our converter in \`tools/build-filters.mjs\` is ours.
`;
  await fs.writeFile(OUT_CREDIT, credit, 'utf8');
  console.log(`WROTE ${OUT_JSON}`);
  console.log(`WROTE ${OUT_CREDIT}`);
}

main().catch((error) => {
  console.error('BUILD FAILED:', error && error.message ? error.message : error);
  process.exitCode = 1;
});
