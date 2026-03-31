/**
 * Seatable Booking Widget
 *
 * Embeddable floating button + iframe overlay for restaurant booking.
 * Zero dependencies. Namespaced CSS (seatable-widget-*).
 *
 * Usage:
 *   <script src="https://seatable.one/widget.js" data-slug="my-restaurant"></script>
 *
 * Data attributes:
 *   data-slug     (required) — restaurant booking slug
 *   data-color    — primary button color (default #9F1239)
 *   data-text     — button label (default per lang)
 *   data-position — "bottom-right" | "bottom-left" (default bottom-right)
 *   data-lang     — "en" | "pt-BR" | "es" (default pt-BR)
 */
(function () {
  'use strict';

  // ─── Resolve script tag ──────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  // ─── Read config ─────────────────────────────────────────────────────────────
  var slug = script.getAttribute('data-slug');
  if (!slug) {
    // Legacy: fall back to ?slug= query param on script src
    var src = script.src || '';
    var match = src.match(/[?&]slug=([^&]+)/);
    if (match) slug = decodeURIComponent(match[1]);
  }
  if (!slug) {
    if (typeof console !== 'undefined') console.warn('[Seatable Widget] Missing data-slug attribute');
    return;
  }

  var color = script.getAttribute('data-color') || '#9F1239';
  var lang = script.getAttribute('data-lang') || 'pt-BR';
  var position = script.getAttribute('data-position') || 'bottom-right';
  var isLeft = position === 'bottom-left';

  var DEFAULT_TEXTS = {
    'pt-BR': 'Reservar Mesa',
    en: 'Book a Table',
    es: 'Reservar Mesa',
  };
  var buttonText = script.getAttribute('data-text') || DEFAULT_TEXTS[lang] || DEFAULT_TEXTS['pt-BR'];

  var BASE = script.src ? script.src.replace(/\/widget\.js.*$/, '') : 'https://seatable.one';
  var BOOKING_URL = BASE + '/book/' + encodeURIComponent(slug) + '?embed=true';

  // ─── Inject scoped styles ────────────────────────────────────────────────────
  var STYLE_ID = 'seatable-widget-styles';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.seatable-widget-btn{',
      '  position:fixed;bottom:24px;z-index:99999;',
      '  display:inline-flex;align-items:center;gap:8px;',
      '  background:' + color + ';color:#fff;border:none;',
      '  border-radius:9999px;padding:12px 24px;',
      '  font-family:Inter,system-ui,-apple-system,sans-serif;',
      '  font-size:14px;font-weight:600;line-height:1;',
      '  cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);',
      '  transition:transform 0.2s,box-shadow 0.2s;',
      '}',
      '.seatable-widget-btn:hover{transform:scale(1.05);box-shadow:0 6px 20px rgba(0,0,0,0.3);}',
      '.seatable-widget-btn:focus-visible{outline:2px solid ' + color + ';outline-offset:3px;}',
      isLeft ? '.seatable-widget-btn{left:24px;}' : '.seatable-widget-btn{right:24px;}',

      '.seatable-widget-overlay{',
      '  display:none;position:fixed;top:0;left:0;right:0;bottom:0;',
      '  z-index:100000;background:rgba(0,0,0,0.5);',
      '  align-items:center;justify-content:center;',
      '}',
      '.seatable-widget-overlay[data-open="true"]{display:flex;}',

      '.seatable-widget-panel{',
      '  position:relative;width:420px;max-width:100%;',
      '  height:90vh;max-height:700px;',
      '  border-radius:16px;overflow:hidden;',
      '  box-shadow:0 8px 32px rgba(0,0,0,0.2);',
      '  background:#fff;',
      '}',

      '@media(max-width:767px){',
      '  .seatable-widget-panel{',
      '    width:100%;height:100vh;max-height:100vh;',
      '    border-radius:0;',
      '  }',
      '}',

      '.seatable-widget-close{',
      '  position:absolute;top:12px;right:12px;z-index:1;',
      '  width:32px;height:32px;border-radius:50%;',
      '  background:rgba(0,0,0,0.06);border:none;',
      '  display:flex;align-items:center;justify-content:center;',
      '  cursor:pointer;font-size:18px;line-height:1;',
      '  color:#333;transition:background 0.15s;',
      '}',
      '.seatable-widget-close:hover{background:rgba(0,0,0,0.12);}',
      '.seatable-widget-close:focus-visible{outline:2px solid ' + color + ';outline-offset:2px;}',

      '.seatable-widget-iframe{',
      '  width:100%;height:100%;border:none;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ─── SVG icon helper ─────────────────────────────────────────────────────────
  function createCalendarIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    var rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '3');
    rect.setAttribute('y', '4');
    rect.setAttribute('width', '18');
    rect.setAttribute('height', '18');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');
    svg.appendChild(rect);

    var lines = [[16,2,16,6],[8,2,8,6],[3,10,21,10]];
    for (var i = 0; i < lines.length; i++) {
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(lines[i][0]));
      line.setAttribute('y1', String(lines[i][1]));
      line.setAttribute('x2', String(lines[i][2]));
      line.setAttribute('y2', String(lines[i][3]));
      svg.appendChild(line);
    }
    return svg;
  }

  // ─── Create DOM ──────────────────────────────────────────────────────────────

  // Floating button
  var btn = document.createElement('button');
  btn.className = 'seatable-widget-btn';
  btn.setAttribute('aria-label', buttonText);
  btn.appendChild(createCalendarIcon());
  var btnSpan = document.createElement('span');
  btnSpan.textContent = buttonText;
  btn.appendChild(btnSpan);

  // Overlay
  var overlay = document.createElement('div');
  overlay.className = 'seatable-widget-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', buttonText);
  overlay.setAttribute('data-open', 'false');

  // Panel
  var panel = document.createElement('div');
  panel.className = 'seatable-widget-panel';

  // Close button
  var CLOSE_LABELS = { 'pt-BR': 'Fechar', es: 'Cerrar', en: 'Close' };
  var closeBtn = document.createElement('button');
  closeBtn.className = 'seatable-widget-close';
  closeBtn.setAttribute('aria-label', CLOSE_LABELS[lang] || 'Close');
  closeBtn.textContent = '\u2715';

  // Iframe (loaded lazily on first open)
  var iframe = document.createElement('iframe');
  iframe.className = 'seatable-widget-iframe';
  iframe.title = buttonText;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allow', 'payment');

  panel.appendChild(closeBtn);
  panel.appendChild(iframe);
  overlay.appendChild(panel);

  // ─── State ───────────────────────────────────────────────────────────────────
  var isOpen = false;
  var iframeLoaded = false;

  function openWidget() {
    if (!iframeLoaded) {
      iframe.src = BOOKING_URL;
      iframeLoaded = true;
    }
    isOpen = true;
    overlay.setAttribute('data-open', 'true');
    btn.style.display = 'none';
    closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeWidget() {
    isOpen = false;
    overlay.setAttribute('data-open', 'false');
    btn.style.display = '';
    document.body.style.overflow = '';
    btn.focus();
  }

  // ─── Event listeners ────────────────────────────────────────────────────────

  btn.addEventListener('click', openWidget);
  closeBtn.addEventListener('click', closeWidget);

  // Click outside panel closes
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeWidget();
  });

  // Escape key closes
  document.addEventListener('keydown', function (e) {
    if (isOpen && e.key === 'Escape') {
      closeWidget();
    }
  });

  // Focus trap: Tab within overlay
  overlay.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !isOpen) return;
    var focusable = overlay.querySelectorAll('button, iframe, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Listen for postMessage from booking page (booking confirmed)
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'seatable-booking-confirmed') {
      var event;
      if (typeof CustomEvent === 'function') {
        event = new CustomEvent('seatable:booking-confirmed', { detail: e.data.payload });
      } else {
        event = document.createEvent('CustomEvent');
        event.initCustomEvent('seatable:booking-confirmed', true, true, e.data.payload);
      }
      document.dispatchEvent(event);
    }
  });

  // ─── Mount ───────────────────────────────────────────────────────────────────
  document.body.appendChild(overlay);
  document.body.appendChild(btn);
})();
