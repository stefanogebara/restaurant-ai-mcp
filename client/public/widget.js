(function () {
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var src = script.src || '';
  var match = src.match(/[?&]slug=([^&]+)/);
  if (!match) return;
  var slug = decodeURIComponent(match[1]);
  var BASE = 'https://seatable.one';

  var btn = document.createElement('button');
  btn.textContent = 'Book a Table';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:#1a1a2e;color:#fff;border:none;border-radius:9999px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25)';

  var iframe = document.createElement('iframe');
  iframe.src = BASE + '/book/' + slug + '?embed=true';
  iframe.style.cssText = 'display:none;position:fixed;bottom:80px;right:24px;z-index:9998;width:420px;height:600px;border:none;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2)';

  btn.addEventListener('click', function () {
    iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none';
  });

  document.body.appendChild(iframe);
  document.body.appendChild(btn);
})();
