(function () {
  'use strict';

  var box = document.getElementById('sitesEnabled');
  var state = document.getElementById('state');

  function show(on) {
    box.checked = on;
    state.textContent = on ? 'on' : 'off';
  }

  chrome.runtime.sendMessage({ type: 'haki-sites-get' }, function (res) {
    show(!!(res && res.enabled));
  });

  box.addEventListener('change', function () {
    show(box.checked);
    chrome.runtime.sendMessage({ type: 'haki-sites-set', enabled: box.checked });
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && (msg.type === 'haki-sites-state' || msg.type === 'haki-all-changed')) {
      show(!!msg.enabled);
    }
  });
})();
