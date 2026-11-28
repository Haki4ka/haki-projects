importScripts('defaults.js');

const DEFAULTS = globalThis.HAKI_SPEED_DEFAULTS;

function injectOpenTabs() {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, function (tabs) {
    tabs.forEach(function (tab) {
      if (tab.id === undefined) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['defaults.js', 'content.js']
      }, function () { void chrome.runtime.lastError; });
    });
  });
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.storage.local.get(['settings', 'speeds'], function (data) {
      const patch = {};
      if (!data.settings) {
        patch.settings = JSON.parse(JSON.stringify(DEFAULTS));
      } else {
        const merged = Object.assign({}, DEFAULTS, data.settings);
        merged.keys = Object.assign({}, DEFAULTS.keys, data.settings.keys || {});
        if (JSON.stringify(merged) !== JSON.stringify(data.settings)) patch.settings = merged;
      }
      if (!data.speeds) patch.speeds = {};
      if (Object.keys(patch).length) chrome.storage.local.set(patch);
    });
    injectOpenTabs();
  }
});

function commandActiveTab(command) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs.length || tabs[0].id === undefined) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'haki-speed-command', command: command }, function () {
      void chrome.runtime.lastError;
    });
  });
}

// The toolbar button is a direct show/hide switch for the floating panel.
// Settings are reached from the gear button on either panel.
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || tab.id === undefined) return;
  chrome.tabs.sendMessage(tab.id, { type: 'haki-speed-command', command: 'toggle-panel' }, function () {
    void chrome.runtime.lastError;
  });
});

chrome.commands.onCommand.addListener(function (command) { commandActiveTab(command); });

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === 'haki-speed-open-options') chrome.runtime.openOptionsPage();
});
