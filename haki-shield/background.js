/* Haki Shield v1.9.1 — our own blocker.
   All logic here is written by us; no foreign extension code is used. */

const DEFAULTS = {
  enabled: true,
  networkAds: true,
  universal: true,
  videoAds: true,
  banners: true,
  disabledSites: []
};

/* Three independent static rulesets: our hand-written rules, the converted
   public list, and the universal in-player ad endpoints. Never mix them into
   one file — the proven Twitch rules must stay readable and rollback-able. */
const ALL_RULESETS = ['ads', 'universal', 'playerads'];
let state = { ...DEFAULTS };
let enabledRulesets = [];
let rulesetError = '';

/* Counters live only in the service worker. They are intentionally NOT saved:
   a browser restart starts a fresh session with zeros. */
const siteCounts = Object.create(null);
let blockedTotal = 0;
let broadcastTimer = null;

function normalizeHost(value) {
  if (!value) return '';
  try {
    return (new URL(String(value))).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return String(value).toLowerCase().replace(/^www\./, '').split(/[/?#]/)[0];
  }
}

function addBlocked(host, count) {
  const site = normalizeHost(host);
  const n = Math.max(0, Math.min(parseInt(count, 10) || 0, 500));
  if (!site || !n) return;
  siteCounts[site] = (siteCounts[site] || 0) + n;
  blockedTotal += n;
  scheduleBroadcast();
}

function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(function () {
    broadcastTimer = null;
    broadcast();
  }, 300);
}

function snapshot() {
  return {
    version: chrome.runtime.getManifest().version,
    state: state,
    blockedToday: blockedTotal,
    siteCounts: { ...siteCounts },
    enabledRulesets: enabledRulesets.slice(),
    rulesetError: rulesetError
  };
}

async function init() {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
  state = { ...DEFAULTS, ...saved };
  if (!Array.isArray(state.disabledSites)) state.disabledSites = [];
  await applyRules();
}

async function save() {
  await chrome.storage.local.set(state);
}

async function applyRules() {
  const adsOn = !!state.enabled && !!state.networkAds;
  const universalOn = adsOn && !!state.universal;
  const videoOn = adsOn && !!state.videoAds;
  const wanted = [];
  if (adsOn) wanted.push('ads');
  if (universalOn) wanted.push('universal');
  if (videoOn) wanted.push('playerads');

  rulesetError = '';
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: wanted,
      disableRulesetIds: ALL_RULESETS.filter((id) => wanted.indexOf(id) < 0)
    });
    enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
  } catch (e) {
    // If a ruleset is invalid, the manifest's "enabled: false" is the safe state.
    rulesetError = String(e && e.message ? e.message : e);
    console.warn('Haki Shield: ruleset toggle unavailable', e);
  }
  await applySiteExceptions();
  try {
    await chrome.action.setTitle({
      title: 'Haki Shield — ' + (state.enabled ? 'ON' : 'OFF') +
        ' (ads ' + (adsOn ? 'ON' : 'OFF') +
        ', web ' + (universalOn ? 'ON' : 'OFF') +
        ', video ' + (state.videoAds ? 'ON' : 'OFF') + ')'
    });
  } catch (e) {
    void e;
  }
}

/* DNR rules are static/global. Session allow rules make "Disable on this
   site" apply to network blocking too, not just banners and Twitch hooks. */
async function applySiteExceptions() {
  try {
    const current = await chrome.declarativeNetRequest.getSessionRules();
    const oldIds = current
      .filter(function (r) { return r.id >= 1000 && r.id < 1500; })
      .map(function (r) { return r.id; });
    const addRules = state.disabledSites.map(function (site, i) {
      return {
        id: 1000 + i,
        priority: 2,
        action: { type: 'allow' },
        condition: {
          initiatorDomains: [site],
          resourceTypes: [
            'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
            'object', 'xmlhttprequest', 'ping', 'csp_report', 'media',
            'websocket', 'webtransport', 'webbundle', 'other'
          ]
        }
      };
    });
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: oldIds,
      addRules: addRules
    });
  } catch (e) {
    console.warn('Haki Shield: site exceptions unavailable', e);
  }
}

function broadcast() {
  try {
    const p = chrome.runtime.sendMessage({ type: 'haki-shield-state', ...snapshot() });
    if (p && typeof p.catch === 'function') p.catch(function () { void 0; });
  } catch (e) {
    void e; // popup may be closed
  }
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return false;

  if (msg.type === 'get-state') {
    sendResponse(snapshot());
    return true;
  }
  if (msg.type === 'get-site-count') {
    sendResponse({ count: siteCounts[normalizeHost(msg.host)] || 0 });
    return true;
  }
  if (msg.type === 'haki-blocked') {
    const host = msg.host || (sender.tab && sender.tab.url) || '';
    addBlocked(host, msg.count);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'set-state') {
    const patch = msg.patch || {};
    for (const key of Object.keys(DEFAULTS)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) state[key] = patch[key];
    }
    if (!Array.isArray(state.disabledSites)) state.disabledSites = [];
    save().then(applyRules).then(function () {
      const out = snapshot();
      broadcast();
      sendResponse(out);
    });
    return true;
  }
  return false;
});

/* Feedback permission is present, so every DNR block can be attributed to the
   site that started it. Ignore our own session "allow" rules (ids 1000+). */
try {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
    const rule = info && info.rule;
    if (!rule || (rule.action && rule.action.type !== 'block')) return;
    if (rule.id >= 1000 && rule.id < 1500) return;

    const req = (info && info.request) || {};
    const fromInitiator = normalizeHost(req.initiator);
    if (fromInitiator) {
      addBlocked(fromInitiator, 1);
      return;
    }
    if (typeof req.tabId === 'number' && req.tabId >= 0) {
      try {
        chrome.tabs.get(req.tabId, function (tab) {
          addBlocked((tab && tab.url) || '', 1);
        });
      } catch (e) {
        void e;
      }
    }
  });
} catch (e) {
  void e; // feedback permission absent — JS hooks still count
}
