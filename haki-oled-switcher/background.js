/* Haki OLED v3.3.2
   One toolbar button opens popup.html with two independent switches:
     1) browser theme -> chrome.management.setEnabled(THEME_ID, ...)
     2) site darkening -> chrome.storage.local['sitesEnabled']
   The popup also edits a gray-mode list: domains there get dark surfaces
   without inversion. Alt+Shift+D toggles BOTH main switches at once. */

const THEME_ID = 'embggbpfahheclcjifbkcejahhjnfcfc';
const SITES_KEY = 'sitesEnabled';
const GRAY_KEY = 'graySites';
const SITES_MENU = 'haki-toggle-sites';

/* ---------- Browser theme ---------- */

async function themeIsOn() {
  try {
    const item = await chrome.management.get(THEME_ID);
    return item.enabled;
  } catch (e) {
    return null; // theme removed or unavailable
  }
}

async function setTheme(on) {
  try {
    await chrome.management.setEnabled(THEME_ID, !!on);
  } catch (e) {
    console.error('Haki OLED (theme):', e);
    return themeIsOn();
  }
  await refreshTitle();
  return !!on;
}

/* ---------- Site darkening ---------- */

async function sitesOn() {
  const data = await chrome.storage.local.get(SITES_KEY);
  return data[SITES_KEY] !== false; // enabled by default
}

function normalizeDomain(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return '';
  if (s.indexOf('://') === -1) s = 'https://' + s;
  try {
    s = new URL(s).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
  return s.replace(/^www\./, '').replace(/^\.+|\.+$/g, '');
}

function cleanDomains(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const value of list) {
    const d = normalizeDomain(value);
    if (d && out.indexOf(d) === -1) out.push(d);
  }
  return out.sort();
}

async function getGraySites() {
  const data = await chrome.storage.local.get(GRAY_KEY);
  return cleanDomains(data[GRAY_KEY]);
}

async function setGraySites(list) {
  const sites = cleanDomains(list);
  await chrome.storage.local.set({ [GRAY_KEY]: sites });
  chrome.tabs.query({}, function (tabs) {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'haki-gray-list-changed', sites: sites }, function () {
        void chrome.runtime.lastError;
      });
    }
  });
  return sites;
}

function tellTabs(on) {
  /* tabs.sendMessage reaches content scripts; runtime.sendMessage does not. */
  chrome.tabs.query({}, function (tabs) {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'haki-sites-changed', enabled: on }, function () {
        void chrome.runtime.lastError; // tabs without our script are fine
      });
    }
  });
}

async function setSites(on) {
  on = !!on;
  await chrome.storage.local.set({ [SITES_KEY]: on });
  await refreshSitesMenu(on);
  tellTabs(on);
  /* Also update an open popup (e.g. after the hotkey or context menu). */
  try {
    await chrome.runtime.sendMessage({ type: 'haki-sites-state', enabled: on });
  } catch (e) {
    void e; // nobody listening is fine
  }
  await refreshTitle();
  return on;
}

async function toggleSites() {
  return setSites(!(await sitesOn()));
}

/* ---------- Fast hotkey: BOTH at once, no mixed states ----------
   - both ON      -> both OFF
   - mixed / both OFF -> both ON
   A missing theme extension counts as OFF: darkening still gets applied. */

async function toggleAll() {
  const current = await Promise.all([themeIsOn(), sitesOn()]);
  const bothOn = current[0] === true && current[1] === true;
  const next = !bothOn;
  await setTheme(next);
  await setSites(next);
  await refreshTitle();
  try {
    await chrome.runtime.sendMessage({ type: 'haki-all-changed', enabled: next });
  } catch (e) {
    void e; // popup may be closed
  }
  return next;
}

/* ---------- Tooltip (always current) ---------- */

async function refreshTitle() {
  const theme = await themeIsOn();
  const sites = await sitesOn();
  const t = theme === null ? 'theme N/A' : theme ? 'theme ON' : 'theme OFF';
  const s = sites ? 'sites ON' : 'sites OFF';
  try {
    await chrome.action.setTitle({ title: 'Haki OLED — ' + t + ', ' + s });
  } catch (e) {
    void e;
  }
}

chrome.runtime.onInstalled.addListener(function () {
  refreshTitle();
  createSitesMenu();
});
chrome.runtime.onStartup.addListener(function () {
  refreshTitle();
  createSitesMenu();
});

/* ---------- Context menu (extra way to control sites only) ---------- */

async function refreshSitesMenu(on) {
  try {
    await chrome.contextMenus.update(SITES_MENU, {
      title: on
        ? 'Haki OLED: disable site darkening'
        : 'Haki OLED: enable site darkening'
    });
  } catch (e) {
    void e; // menu not created yet
  }
}

async function createSitesMenu() {
  try {
    await chrome.contextMenus.removeAll();
    const on = await sitesOn();
    await chrome.contextMenus.create({
      id: SITES_MENU,
      title: on
        ? 'Haki OLED: disable site darkening'
        : 'Haki OLED: enable site darkening',
      contexts: ['page']
    });
  } catch (e) {
    console.error('Haki OLED (menu):', e);
  }
}

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === SITES_MENU) toggleSites();
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle_sites') toggleAll();
});

/* ---------- Single entry point for popup / options ---------- */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;
  switch (msg.type) {
    case 'haki-theme-get':
      themeIsOn().then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-theme-set':
      setTheme(!!msg.enabled).then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-theme-toggle':
      themeIsOn().then(function (on) { return setTheme(!on); })
        .then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-sites-get':
      sitesOn().then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-sites-set':
      setSites(!!msg.enabled).then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-sites-toggle':
      toggleSites().then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-toggle-all':
      toggleAll().then(function (on) { sendResponse({ enabled: on }); });
      return true;
    case 'haki-gray-get':
      getGraySites().then(function (sites) { sendResponse({ sites: sites }); });
      return true;
    case 'haki-gray-set':
      setGraySites(msg.sites).then(function (sites) { sendResponse({ sites: sites }); });
      return true;
    default:
      return false;
  }
});
