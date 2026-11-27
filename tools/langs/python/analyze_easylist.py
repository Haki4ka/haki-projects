#!/usr/bin/env python3
"""Analyse an Adblock-style filter list and compare it with the DNR ruleset.

Learning tool, standard library only. Useful for the (deferred) weekly
EasyList refresh: it reports how many host-anchor rules a new list would
yield, before regenerating universal.json.

Usage:
  python analyze_easylist.py --file easylist.txt
  python analyze_easylist.py --url https://easylist.to/easylist/easylist.txt \
      --rules "Haki Shield/universal.json"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Iterable

HOST_RULE = re.compile(r"^\|\|(?P<domain>[A-Za-z0-9.-]+)\^(?:\$(?P<mods>.*))?$")
DOMAIN_RE = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")

# Hosts shared by ads and ordinary content: never block the whole domain.
SHARED_BASES = {
    "cloudfront.net", "amazonaws.com", "workers.dev", "pages.dev",
    "b-cdn.net", "cdn77.org", "akamaized.net", "azureedge.net",
    "cloudflare.com", "fastly.net", "jsdelivr.net", "unpkg.com",
    "github.io", "netlify.app", "vercel.app", "herokuapp.com",
    "googleapis.com", "gstatic.com",
}
PUBLIC_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
    "co.nz", "com.br", "com.tr", "com.ua", "com.pl", "com.cn", "com.hk",
    "co.jp", "co.in", "co.kr", "com.sg", "com.mx", "com.ar", "co.za",
}


def safe_domain(domain: str) -> bool:
    """Mirror the conservative rule used by build-filters.mjs."""
    low = domain.lower()
    if not DOMAIN_RE.fullmatch(low):
        return False
    labels = low.split(".")
    if low in PUBLIC_SUFFIXES or low in SHARED_BASES:
        return False
    if len(labels[-1]) < 2 or labels[-1][0].isdigit():
        return False
    return not any(p.startswith("-") or p.endswith("-") for p in labels)


def classify(lines: Iterable[str]) -> tuple[Counter, set[str]]:
    stats: Counter = Counter()
    domains: set[str] = set()
    for raw in lines:
        line = raw.strip()
        if not line:
            stats["blank"] += 1
            continue
        if line.startswith("!"):
            stats["comment"] += 1
            continue
        if "##" in line or "#@#" in line:
            stats["cosmetic"] += 1
            continue
        if line.startswith("@@"):
            stats["exception"] += 1
            continue
        match = HOST_RULE.fullmatch(line)
        if not match:
            stats["other"] += 1
            continue
        domain = match.group("domain").lower()
        if safe_domain(domain):
            stats["safe_host"] += 1
            domains.add(domain)
        else:
            stats["rejected_host"] += 1
    return stats, domains


def dn_r_domains(path: Path) -> set[str]:
    """Pull host names out of generated urlFilter values."""
    data = json.loads(path.read_text(encoding="utf-8"))
    out: set[str] = set()
    for rule in data:
        condition = rule.get("condition", {})
        url_filter = condition.get("urlFilter", "")
        if url_filter.startswith("||") and url_filter.endswith("^"):
            out.add(url_filter[2:-1].lower())
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--file", type=Path)
    src.add_argument("--url")
    ap.add_argument("--rules", type=Path, help="universal.json to compare with")
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    if args.file:
        text = args.file.read_text(encoding="utf-8", errors="replace")
        source = str(args.file)
    else:
        req = urllib.request.Request(args.url, headers={"User-Agent": "haki-lab/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
        source = args.url

    lines = text.splitlines()
    stats, domains = classify(lines)

    print(f"SOURCE: {source}")
    print(f"LINES: {len(lines)}")
    for key in ("comment", "blank", "cosmetic", "exception", "safe_host",
                "rejected_host", "other"):
        print(f"  {key:14s} {stats[key]:>7d}")
    print(f"UNIQUE SAFE DOMAINS: {len(domains)}")
    print("TOP:")
    for domain, count in Counter(
        d for line in lines if line.strip().startswith("||")
        for d in [line.strip()[2:].split("^")[0].lower()]
        if d in domains
    ).most_common(args.top):
        print(f"  {count:>4d}  {domain}")

    if args.rules:
        ours = dn_r_domains(args.rules)
        print(f"RULE DOMAINS: {len(ours)}")
        print(f"MISSING (in list, not in rules): {len(domains - ours)}")
        print(f"EXTRA   (in rules, not in list): {len(ours - domains)}")
        for d in sorted(domains - ours)[:10]:
            print(f"  - {d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
