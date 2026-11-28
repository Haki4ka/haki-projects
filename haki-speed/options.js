(function () {
  'use strict';
  const D = globalThis.HAKI_SPEED_DEFAULTS;
  const COMBO = globalThis.HAKI_SPEED_COMBO;
  const MIGRATE = globalThis.HAKI_SPEED_MIGRATE;
  let settings = MIGRATE(null);

  function save() {
    chrome.storage.local.set({ settings: settings });
  }

  document.querySelectorAll('[data-setting]').forEach(function (el) {
    const key = el.getAttribute('data-setting');
    if (el.type === 'checkbox') {
      el.checked = settings[key] !== false;
      el.addEventListener('change', function () {
        settings[key] = el.checked;
        save();
      });
    } else {
      el.value = String(settings[key] === undefined || settings[key] === null ? '' : settings[key]);
      el.addEventListener('change', function () {
        if (el.hasAttribute('data-num')) {
          const n = Number(el.value);
          settings[key] = Number.isFinite(n) ? n : D[key];
          el.value = String(settings[key]);
        } else {
          settings[key] = el.value;
        }
        save();
      });
    }
  });

  function label(action) {
    const btn = document.querySelector('[data-key="' + action + '"]');
    btn.textContent = settings.keys[action] || 'Not set';
  }

  document.querySelectorAll('[data-key]').forEach(function (btn) {
    const action = btn.getAttribute('data-key');
    label(action);
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-key].recording').forEach(function (other) {
        other.classList.remove('recording');
        label(other.getAttribute('data-key'));
      });
      btn.classList.add('recording');
      btn.textContent = 'Press keys…';
    });
  });

  document.querySelectorAll('[data-clear]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      settings.keys[btn.getAttribute('data-clear')] = '';
      save();
      label(btn.getAttribute('data-clear'));
    });
  });

  function recordingButton() { return document.querySelector('[data-key].recording'); }

  function finishRecording(btn, combo) {
    btn.classList.remove('recording');
    if (combo) settings.keys[btn.getAttribute('data-key')] = combo;
    save();
    label(btn.getAttribute('data-key'));
  }

  document.addEventListener('keydown', function (e) {
    const btn = recordingButton();
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { finishRecording(btn, null); return; }
    // Modifier keys alone are not a complete combination.
    if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].indexOf(e.code) !== -1) return;
    finishRecording(btn, COMBO(e));
  });

  // Wheel and mouse-button combinations are recorded the same way. Clicking
  // the record/clear buttons themselves must not be captured as a hotkey.
  function isUiClick(e) {
    return !!(e.target && e.target.closest && e.target.closest('[data-key],[data-clear],button'));
  }

  document.addEventListener('wheel', function (e) {
    const btn = recordingButton();
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!Number(e.deltaY) && !Number(e.deltaX)) return;
    finishRecording(btn, COMBO(e));
  }, { passive: false, capture: true });

  document.addEventListener('mousedown', function (e) {
    const btn = recordingButton();
    if (!btn || isUiClick(e)) return;
    e.preventDefault();
    e.stopPropagation();
    finishRecording(btn, COMBO(e));
  }, { capture: true });

  document.addEventListener('contextmenu', function (e) {
    if (recordingButton()) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });

  function syncFields() {
    document.querySelectorAll('[data-setting]').forEach(function (el) {
      const key = el.getAttribute('data-setting');
      if (el.type === 'checkbox') el.checked = settings[key] !== false;
      else el.value = String(settings[key] === undefined || settings[key] === null ? '' : settings[key]);
    });
    Object.keys(settings.keys).forEach(label);
  }

  document.getElementById('resetPos').addEventListener('click', function () {
    settings.corner = 'bottom-right';
    settings.pos = null;
    save();
    syncFields();
  });

  document.getElementById('resetAll').addEventListener('click', function () {
    if (!window.confirm('Reset all Haki Speed settings to defaults?')) return;
    settings = MIGRATE(null);
    chrome.storage.local.set({ settings: settings }, function () { location.reload(); });
  });

  chrome.storage.local.get(['settings'], function (data) {
    settings = MIGRATE(data.settings || {});
    // Persist the cleaned schema once so legacy fields stop coming back.
    chrome.storage.local.set({ settings: settings });
    syncFields();
  });
})();
