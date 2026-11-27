#!/usr/bin/env node
/*
 * Haki Shield - safe weekly EasyList refresh.
 *
 * Flow:
 *   1. run our own converter with --dry (no files touched)
 *   2. compare the upstream SHA-256 with the state file
 *   3. if unchanged -> log NO_CHANGE and exit (extension files stay untouched)
 *   4. if changed -> backup, rebuild, validate, bump extension version, log
 *
 * Usage:
 *   node tools/update-easylist.mjs            # normal weekly update
 *   node tools/update-easylist.mjs --check    # compare only, write nothing
 *   node tools/update-easylist.mjs --force    # rebuild even if hash is equal
 *
 * No third-party code is imported. Node's own child_process runs our converter.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROJECT = path.resolve(ROOT, '..');

const BUILDER = path.join(HERE, 'build-filters.mjs');
const STATE_FILE = path.join(HERE, 'easylist-state.json');
const LOG_FILE = path.join(PROJECT, 'AI Lab', 'logs', 'easylist-update.log');
const BACKUP_ROOT = path.join(PROJECT, 'Haki Shield Backups', 'easylist');

const UNIVERSAL = path.join(ROOT, 'universal.json');
const CUSTOM = path.join(ROOT, 'rules.json');
const CREDIT = path.join(ROOT, 'THIRD-PARTY.md');
const MANIFEST = path.join(ROOT, 'manifest.json');
const README = path.join(ROOT, 'README.md');

const VERSION_FILES = [
  'manifest.json', 'background.js', 'twitch.js', 'cosmetic.js', 'player.js',
  'popup.html', 'options.html'
];

const PROTECTED = ['twitch.tv', 'tradingview.com', 'youtube.com', 'kleinanzeigen.de'];
const MIN_RULES = 1000;
const MAX_RULES = 25000;
const MAX_STATIC_TOTAL = 30000;

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const FORCE = argv.includes('--force');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function appendLog(line) {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.appendFile(LOG_FILE, `${new Date().toISOString()} ${line}\n`, 'utf8');
}

function bumpVersion(version) {
  const p = version.split('.').map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isInteger(n))) {
    throw new Error(`Bad version string: ${version}`);
  }
  if (p[2] < 99) p[2] += 1;
  else { p[2] = 0; p[1] += 1; }
  return p.join('.');
}

async function readState() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  let state = null;
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    /* First run: derive the baseline from the credited build, never guess. */
    const credit = await fs.readFile(CREDIT, 'utf8');
    const m = credit.match(/Source SHA-256 at last build:\s*`([a-f0-9]{64})`/);
    const r = credit.match(/Rules emitted:\s*(\d+)/);
    if (!m) throw new Error('No baseline SHA-256 in THIRD-PARTY.md');
    state = {
      url: 'https://easylist.to/easylist/easylist.txt',
      sha256: m[1],
      rules: r ? Number(r[1]) : 0,
      version: manifest.version,
      builtAt: null,
      lastCheck: null,
      lastCheckResult: 'baseline',
      history: []
    };
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }
  if (!state.version) state.version = manifest.version;
  return state;
}

async function dryAnalysis() {
  const { stdout, stderr } = await run(process.execPath, [BUILDER, '--dry'], {
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    cwd: ROOT
  });
  if (stderr && stderr.trim()) await appendLog(`CONVERTER_STDERR ${stderr.trim().slice(0, 300)}`);
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Converter produced no JSON analysis');
  const info = JSON.parse(stdout.slice(start, end + 1));
  if (!/^[a-f0-9]{64}$/.test(info.sha256 || '')) throw new Error('Converter did not report SHA-256');
  if (!Number.isInteger(info.emittedRules) || info.emittedRules < MIN_RULES || info.emittedRules > MAX_RULES) {
    throw new Error(`Implausible rule count: ${info.emittedRules}`);
  }
  if (!Number.isInteger(info.lines) || info.lines < 10000) {
    throw new Error(`Implausible EasyList size: ${info.lines} lines`);
  }
  return info;
}

async function makeBackup(tag) {
  await fs.mkdir(BACKUP_ROOT, { recursive: true });
  const made = [];
  for (const [src, label] of [
    [UNIVERSAL, 'universal.json'],
    [CREDIT, 'THIRD-PARTY.md'],
    [MANIFEST, 'manifest.json']
  ]) {
    const dst = path.join(BACKUP_ROOT, `${tag}-${label}`);
    await fs.copyFile(src, dst);
    made.push(path.basename(dst));
  }
  return made;
}

async function validateBuilt(info) {
  const rules = JSON.parse(await fs.readFile(UNIVERSAL, 'utf8'));
  if (!Array.isArray(rules) || rules.length !== info.emittedRules) {
    throw new Error(`Built rule count ${rules.length} != analysis ${info.emittedRules}`);
  }
  rules.forEach((r, i) => {
    if (r.id !== 10000 + i) throw new Error(`Bad id at index ${i}`);
    if (!r.action || r.action.type !== 'block') throw new Error(`Bad action at index ${i}`);
    const c = r.condition || {};
    if (typeof c.urlFilter !== 'string' || !c.urlFilter.startsWith('||') || !c.urlFilter.endsWith('^')) {
      throw new Error(`Bad urlFilter at index ${i}`);
    }
    if (c.regexFilter) throw new Error(`Unexpected regex rule at index ${i}`);
    for (const d of PROTECTED) {
      if (!Array.isArray(c.excludedInitiatorDomains) || !c.excludedInitiatorDomains.includes(d)) {
        throw new Error(`Missing protection for ${d} at index ${i}`);
      }
      if (c.urlFilter.slice(2, -1) === d || c.urlFilter.slice(2).endsWith('.' + d + '^')) {
        throw new Error(`Protected domain targeted: ${d} at index ${i}`);
      }
    }
  });
  const custom = JSON.parse(await fs.readFile(CUSTOM, 'utf8'));
  if (!Array.isArray(custom) || custom.length < 40 || custom.length > 60) {
    throw new Error(`Hand-written ruleset changed unexpectedly: ${custom.length}`);
  }
  const total = custom.length + rules.length;
  if (total > MAX_STATIC_TOTAL) throw new Error(`Static rule total too high: ${total}`);
  return { custom: custom.length, universal: rules.length, total };
}

async function bumpAllVersions(oldVersion, newVersion) {
  for (const name of VERSION_FILES) {
    const file = path.join(ROOT, name);
    const text = await fs.readFile(file, 'utf8');
    if (!text.includes(oldVersion)) throw new Error(`Version marker missing in ${name}`);
    await fs.writeFile(file, text.split(oldVersion).join(newVersion), 'utf8');
  }
  const readme = await fs.readFile(README, 'utf8');
  const esc = oldVersion.replace(/\./g, '\\.');
  const header = new RegExp('(Version \\*\\*)' + esc + '(\\*\\*)');
  if (header.test(readme)) {
    await fs.writeFile(README, readme.replace(header, '$1' + newVersion + '$2'), 'utf8');
  } else {
    await appendLog(`README_HEADER_NOT_UPDATED ${oldVersion}`);
  }
}

async function main() {
  const state = await readState();
  const info = await dryAnalysis();
  const same = info.sha256 === state.sha256;

  if (CHECK_ONLY) {
    console.log(JSON.stringify({
      mode: 'check',
      upstreamSha: info.sha256,
      storedSha: state.sha256,
      changed: !same,
      emittedRules: info.emittedRules,
      extensionVersion: state.version
    }, null, 2));
    return;
  }

  if (same && !FORCE) {
    state.lastCheck = new Date().toISOString();
    state.lastCheckResult = 'NO_CHANGE';
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await appendLog(`NO_CHANGE sha=${info.sha256.slice(0, 12)} rules=${info.emittedRules} version=${state.version}`);
    console.log(`NO_CHANGE ${info.sha256.slice(0, 12)} (extension files untouched)`);
    return;
  }

  const tag = stamp();
  const backedUp = await makeBackup(tag);
  await appendLog(`UPDATE_BEGIN sha=${info.sha256.slice(0, 12)} backup=${tag}`);

  const { stdout } = await run(process.execPath, [BUILDER], {
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
    cwd: ROOT
  });
  const counts = await validateBuilt(info);
  const oldVersion = state.version;
  const newVersion = bumpVersion(oldVersion);
  await bumpAllVersions(oldVersion, newVersion);

  const builtCredit = await fs.readFile(CREDIT, 'utf8');
  if (!builtCredit.includes(info.sha256)) {
    throw new Error('Built THIRD-PARTY.md does not match analysed SHA-256');
  }

  state.sha256 = info.sha256;
  state.rules = counts.universal;
  state.version = newVersion;
  state.builtAt = new Date().toISOString();
  state.lastCheck = state.builtAt;
  state.lastCheckResult = 'UPDATED';
  state.history = [{ at: state.builtAt, sha256: info.sha256, version: newVersion, rules: counts.universal }, ...(state.history || [])].slice(0, 8);
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  await appendLog(`UPDATED sha=${info.sha256} custom=${counts.custom} universal=${counts.universal} total=${counts.total} version=${oldVersion}->${newVersion} backup=${tag}`);
  console.log(JSON.stringify({
    mode: 'updated',
    sha256: info.sha256,
    custom: counts.custom,
    universal: counts.universal,
    staticTotal: counts.total,
    version: `${oldVersion}->${newVersion}`,
    backup: backedUp,
    converterTail: stdout.trim().split('\n').slice(-2)
  }, null, 2));
}

main().catch(async (error) => {
  const msg = error && error.message ? error.message : String(error);
  try { await appendLog(`ERROR ${msg.slice(0, 500)}`); } catch { /* nothing else we can do */ }
  console.error('EASYLIST UPDATE FAILED:', msg);
  process.exitCode = 1;
});
