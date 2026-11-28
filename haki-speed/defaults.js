(function (scope) {
  'use strict';

  scope.HAKI_SPEED_DEFAULTS = {
    enabled: true,
    // The floating panel is deliberately hidden until it is invoked
    // by the toolbar button or by a show/hide hotkey.
    panelVisible: false,
    autoShow: true,
    theme: 'dark',
    size: 'normal',
    opacity: 90,
    // Slow colour drift plus a liquid, slowly spreading pointer ripple.
    ambient: true,
    corner: 'bottom-right',
    offsetX: 16,
    offsetY: 16,
    pos: null,
    showLabel: true,
    collapsed: false,

    // Compact bar that follows the player and appears on hover.
    dockEnabled: true,
    dockPosition: 'top-right',
    dockOffset: 8,

    step: 0.25,
    // Quick modifier wheel control. "none" = any wheel, "off" = disabled;
    // recorded Hotkeys always work regardless of this value.
    wheelModifier: 'shift',
    min: 0.25,
    max: 4,
    remember: true,
    scope: 'domain',
    followSite: true,
    // One shared speed for every site/player instead of per-site memory.
    syncAll: false,
    // Any key, wheel or mouse-button combination can be recorded here.
    keys: { up: 'Shift+WheelUp', down: 'Shift+WheelDown', reset: '', toggle: '' },
    hotkeySchema: 2
  };

  // One format for every input: modifiers first, then the action itself.
  // Keyboard -> "Ctrl+Alt+KeyU"; wheel -> "Shift+WheelUp";
  // mouse button -> "Shift+RightClick". Empty/invalid modifiers are skipped.
  scope.HAKI_SPEED_COMBO = function (event) {
    var parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    var type = event.type || '';
    if (type === 'wheel') {
      var dy = Number(event.deltaY) || 0;
      var dx = Number(event.deltaX) || 0;
      if (Math.abs(dx) > Math.abs(dy)) parts.push(dx < 0 ? 'WheelLeft' : 'WheelRight');
      else parts.push(dy < 0 ? 'WheelUp' : 'WheelDown');
    } else if (type === 'mousedown' || type === 'pointerdown') {
      var names = ['LeftClick', 'MiddleClick', 'RightClick', 'BackClick', 'ForwardClick'];
      var button = Number(event.button) || 0;
      parts.push(names[button] || ('Mouse' + button));
    } else {
      parts.push(event.code || event.key || '');
    }
    return parts.filter(Boolean).join('+');
  };

  // Settings saved by 1.2.0 had a boolean "wheel" flag and empty hotkeys.
  // Note: "wheelModifier" is again a normal saved field since 1.4.0, so it
  // must NOT be treated as a legacy marker or cleared hotkeys come back.
  scope.HAKI_SPEED_MIGRATE = function (raw) {
    var saved = raw || {};
    var legacy = ('wheel' in saved);
    var out = Object.assign({}, scope.HAKI_SPEED_DEFAULTS, saved);
    out.keys = Object.assign({}, scope.HAKI_SPEED_DEFAULTS.keys, saved.keys || {});
    if (legacy && saved.wheel === false) {
      out.wheelModifier = 'off';
    }
    delete out.wheel;
    if (['shift','alt','ctrl','meta','none','off'].indexOf(out.wheelModifier) === -1) {
      out.wheelModifier = 'shift';
    }
    if (legacy || saved.hotkeySchema !== 2) {
      if (!out.keys.up) out.keys.up = scope.HAKI_SPEED_DEFAULTS.keys.up;
      if (!out.keys.down) out.keys.down = scope.HAKI_SPEED_DEFAULTS.keys.down;
    }
    out.hotkeySchema = 2;
    return out;
  };
})(globalThis);
