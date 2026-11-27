/**
 * Typed checker for declarativeNetRequest rulesets.
 *
 * TypeScript earns its place here: a typo in a rule field (or a missing
 * excludedInitiatorDomains entry) would otherwise only show up at runtime,
 * after Brave silently refuses to load the ruleset.
 *
 * Run:
 *   npx tsc --noEmit
 *   node --experimental-strip-types verify-rules.ts [rules.json] [universal.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Condition {
  urlFilter?: string;
  regexFilter?: string;
  resourceTypes?: string[];
  excludedInitiatorDomains?: string[];
  initiatorDomains?: string[];
  requestDomains?: string[];
}

interface Rule {
  id: number;
  priority?: number;
  action: { type: string };
  condition: Condition;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Works both from the .ts source and from the compiled dist/ output. */
function findWorkspaceRoot(from: string): string {
  let current = from;
  for (let i = 0; i < 8; i += 1) {
    if (path.basename(current) === 'tools') return path.dirname(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return from;
}

const ROOT = findWorkspaceRoot(HERE);
const STATIC_LIMIT = 30_000;
const PROTECTED = [
  'twitch.tv',
  'tradingview.com',
  'youtube.com',
  'kleinanzeigen.de',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRule(value: unknown): value is Rule {
  if (!isRecord(value)) return false;
  if (typeof value['id'] !== 'number' || !Number.isInteger(value['id'])) return false;
  const action = value['action'];
  if (!isRecord(action) || action['type'] !== 'block') return false;
  return isRecord(value['condition']);
}

function loadRules(file: string): Rule[] | null {
  if (!fs.existsSync(file)) {
    console.error(`MISSING FILE: ${file}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    console.error(`BAD JSON: ${file}: ${String(error)}`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.error(`NOT AN ARRAY: ${file}`);
    return null;
  }
  const bad = parsed.findIndex((item) => !isRule(item));
  if (bad >= 0) {
    console.error(`INVALID RULE at index ${bad} in ${file}`);
    return null;
  }
  return parsed as Rule[];
}

function check(file: string, universal: boolean): boolean {
  const rules = loadRules(file);
  if (rules === null) return false;

  const errors: string[] = [];
  const seen = new Set<number>();
  let regexCount = 0;

  for (const rule of rules) {
    if (seen.has(rule.id)) errors.push(`duplicate id ${rule.id}`);
    seen.add(rule.id);

    const cond = rule.condition;
    if (cond.regexFilter !== undefined) {
      regexCount += 1;
      if (regexCount > 1000) errors.push('more than 1000 regex rules');
    }
    if (cond.urlFilter === undefined && cond.regexFilter === undefined) {
      errors.push(`rule ${rule.id} has neither urlFilter nor regexFilter`);
    }
    const types = cond.resourceTypes;
    if (types === undefined || types.length === 0) {
      errors.push(`rule ${rule.id} has no resourceTypes`);
    } else if (types.includes('main_frame')) {
      errors.push(`rule ${rule.id} blocks main_frame`);
    }

    if (universal) {
      const excluded = cond.excludedInitiatorDomains ?? [];
      for (const site of PROTECTED) {
        if (!excluded.includes(site)) {
          errors.push(`rule ${rule.id} missing exclusion ${site}`);
        }
      }
    }
  }

  if (rules.length > STATIC_LIMIT) {
    errors.push(`too many static rules: ${rules.length} > ${STATIC_LIMIT}`);
  }

  const label = path.basename(file);
  console.log(`${label}: ${rules.length} rules, ${regexCount} regex, ${errors.length} errors`);
  for (const message of errors.slice(0, 20)) console.log(`  - ${message}`);
  return errors.length === 0;
}

const manual = process.argv[2] ?? path.join(ROOT, 'Haki Shield', 'rules.json');
const generated = process.argv[3] ?? path.join(ROOT, 'Haki Shield', 'universal.json');
const player = process.argv[4] ?? path.join(ROOT, 'Haki Shield', 'playerads.json');
const okManual = check(manual, false);
const okGenerated = check(generated, true);
const okPlayer = check(player, true);
const ok = okManual && okGenerated && okPlayer;
console.log(ok ? 'ALL_OK' : 'CHECK_FAILED');
process.exitCode = ok ? 0 : 1;
