(function () {
  if (new URLSearchParams(location.search).get('hero') === 'meadow') {
    document.body.classList.remove('hero-restaurant');
    var hero = document.getElementById('heroi'), picture = document.getElementById('restaurant-hero');
    var field = document.createElement('img'); field.id = 'campo'; field.className = 'foto'; field.alt = ''; field.src = '/images/artifact/asset-6.jpg';
    var film = document.createElement('video'); film.id = 'vento'; film.className = 'foto pronto'; film.autoplay = true; film.muted = true; film.loop = true; film.playsInline = true; film.preload = 'auto'; film.poster = '/images/artifact/asset-7.jpg'; film.setAttribute('aria-hidden', 'true');
    var source = document.createElement('source'); source.src = '/images/artifact/asset-8.mp4'; source.type = 'video/mp4'; film.appendChild(source);
    hero.insertBefore(field, picture); hero.insertBefore(film, picture);
  } else document.body.classList.add('hero-restaurant');
  var lento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  (function () { var v = document.getElementById('vento'); if (!v || document.body.classList.contains('hero-restaurant') || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (v) v.remove(); return; } var liga = function () { v.classList.add('pronto'); }; v.addEventListener('playing', liga, { once: true }); v.play && v.play().catch(function () {}); })();

  /* ── nav: tinta oliva no hero editorial; branco apenas sobre o filme alternativo ── */
  var nav = document.getElementById('nav'), heroi = document.getElementById('heroi');
  function navCor() { var dentro = heroi.getBoundingClientRect().bottom > (innerWidth <= 700 ? 64 : 72); var sobreFilme = dentro && !document.body.classList.contains('hero-restaurant'); nav.classList.toggle('docked', !dentro); nav.querySelector('.logo').style.color = sobreFilme ? '#fff' : ''; nav.querySelector('nav').style.color = sobreFilme ? '#fff' : ''; nav.style.background = sobreFilme ? 'rgba(24,31,21,.38)' : ''; }
  navCor(); addEventListener('scroll', navCor, { passive: true }); addEventListener('resize', navCor, { passive: true });

  /* ── placeholder digitado nos dois prompts ────────────────────── */
  (function digita() {
    var els = [].slice.call(document.querySelectorAll('[data-ph]')); if (!els.length) return;
    var frases = ['Oi! Tem mesa pra 4 hoje às 20h?', 'Dá pra remarcar pra sábado?', 'Vocês têm cadeirão?', 'Quanto rendeu o almoço de hoje?'];
    var i = 0; var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var mostra = function (t) { els.forEach(function (e) { e.innerHTML = ''; e.appendChild(document.createTextNode(t)); e.appendChild(Object.assign(document.createElement('i'), { className: 'cursor' })); }); };
    if (lento) { mostra(frases[0]); return; }
    (async function () { for (;;) { var f = frases[i % frases.length]; for (var c = 1; c <= f.length; c++) { mostra(f.slice(0, c)); await espera(38); } await espera(2600); for (var k = f.length; k >= 0; k -= 2) { mostra(f.slice(0, k)); await espera(12); } i++; await espera(300); } })();
  })();
  document.querySelectorAll('.prompt textarea').forEach(function (t) { var ph = t.parentElement.querySelector('[data-ph]'); t.addEventListener('input', function () { ph.style.visibility = t.value ? 'hidden' : ''; }); });

  /* ── a régua (mesmo desenho em tamanhos diferentes) ───────────── */
  var H0 = 12, H1 = 23.5, AGORA = 14 + 33 / 60;
  var MESAS = [
    ['Mesa 2',    [[12.00, 13.20, 'fim', 'Duas · 2'], [20.00, 22.00, 'novo', 'Marina · 4']]],
    ['Mesa 4',    [[12.40, 14.55, 'atraso', '2h09'], [19.50, 21.50, 'res', 'Aldo · 2']]],
    ['Mesa 6',    [[12.10, 13.40, 'fim', 'Bruno · 3'], [19.00, 21.00, 'res', 'Nara · 4']]],
    ['Mesa 10',   [[12.30, 14.10, 'fim', 'Escritório · 6'], [18.80, 21.60, 'res', 'Aniversário · 8']]],
    ['Mesa 14',   [[12.00, 13.10, 'fim', 'Sozinha · 1'], [19.60, 21.40, 'res', 'Léo · 2']]],
    ['Varanda 1', [[12.20, 13.60, 'fim', 'Vizinhos · 4'], [20.10, 22.00, 'res', 'Célia · 3']]]
  ];
  function monta(el, dados) {
    var span = H1 - H0; var pct = function (h) { return ((h - H0) / span * 100) + '%'; };
    var esc = document.createElement('div'); esc.className = 'escala'; for (var h = 12; h <= 22; h += 2) { var t = document.createElement('span'); t.style.left = pct(h); t.textContent = h + 'h'; esc.appendChild(t); } el.appendChild(esc);
    dados.forEach(function (m) { var l = document.createElement('div'); l.className = 'linha'; var r = document.createElement('div'); r.className = 'rot'; r.textContent = m[0]; var b = document.createElement('div'); b.className = 'bar';
      m[1].forEach(function (bl) { var x = document.createElement('div'); x.className = 'bl t-' + bl[2] + (bl[2] === 'novo' ? ' oculto' : ''); x.style.left = pct(bl[0]); x.style.width = ((bl[1] - bl[0]) / span * 100) + '%'; var e = document.createElement('em'); e.textContent = bl[3]; x.appendChild(e); b.appendChild(x); });
      l.appendChild(r); l.appendChild(b); el.appendChild(l); });
    var ag = document.createElement('b'); ag.className = 'agora'; el.appendChild(ag);
  }
  document.querySelectorAll('[data-regua]').forEach(function (el) { var n = el.dataset.regua === 'fone' ? 5 : el.dataset.regua === 'grande' ? 6 : 5; monta(el, MESAS.slice(0, n)); });
  function posicionaAgora() { document.querySelectorAll('[data-regua]').forEach(function (el) { var bar = el.querySelector('.bar'), ag = el.querySelector('.agora'), lin = el.querySelector('.linha'); if (!bar || !ag || !lin) return; var re = el.getBoundingClientRect(), rb = bar.getBoundingClientRect(); if (!rb.width) return; var ls = el.querySelectorAll('.linha'); var topo = lin.getBoundingClientRect().top - re.top; var fim = ls[ls.length - 1].getBoundingClientRect().bottom - re.top; ag.style.left = ((rb.left - re.left) + rb.width * ((AGORA - H0) / (H1 - H0))).toFixed(1) + 'px'; ag.style.top = topo.toFixed(1) + 'px'; ag.style.height = (fim - topo).toFixed(1) + 'px'; }); }
  posicionaAgora(); addEventListener('resize', posicionaAgora); document.fonts.ready.then(posicionaAgora);
  // a barra da Marina nasce e renasce
  (function vive() { if (lento) { document.querySelectorAll('.bl.t-novo').forEach(function (b) { b.classList.remove('oculto'); }); return; } var on = false; setInterval(function () { on = !on; document.querySelectorAll('.bl.t-novo').forEach(function (b) { if (on) { b.classList.remove('oculto'); b.classList.add('chega'); } else { b.classList.add('oculto'); b.classList.remove('chega'); } }); }, on ? 5000 : 5000); })();

  /* ── carrossel com pontos ─────────────────────────────────────── */
  (function carrossel() {
    var cartoes = [].slice.call(document.querySelectorAll('.cartao-f')); var pontos = document.querySelector('.pontos'); if (!cartoes.length) return;
    cartoes.forEach(function (c, i) { var b = document.createElement('button'); var n = document.createElement('span'); var label = document.createElement('span'); n.className = 'numero'; n.textContent = String(i + 1).padStart(2, '0'); label.className = 'nome'; label.textContent = c.dataset.nav || c.querySelector('h3').textContent; b.append(n, label); b.setAttribute('role', 'tab'); b.setAttribute('aria-current', i === 0 ? 'true' : 'false'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); b.addEventListener('click', function () { vai(i); }); pontos.appendChild(b); });
    var atual = 0, timer;
    var contador = document.querySelector('.feature-current');
    document.querySelectorAll('[data-feature-nav]').forEach(function (button) { button.addEventListener('click', function () { vai(atual + (button.dataset.featureNav === 'next' ? 1 : -1)); }); });
    function vai(i) { atual = (i + cartoes.length) % cartoes.length; cartoes.forEach(function (c, k) { c.classList.toggle('on', k === atual); }); pontos.querySelectorAll('button').forEach(function (b, k) { b.setAttribute('aria-current', k === atual ? 'true' : 'false'); b.setAttribute('aria-selected', k === atual ? 'true' : 'false'); }); contador.textContent = String(atual + 1).padStart(2, '0') + ' / 05 · ' + (cartoes[atual].dataset.nav || cartoes[atual].querySelector('h3').textContent); posicionaAgora(); clearInterval(timer); if (!lento) timer = setInterval(function () { if (!document.querySelector('.carrossel:hover, .carrossel:focus-within, .pontos:hover, .pontos:focus-within, .mobile-feature-nav:hover, .mobile-feature-nav:focus-within')) vai(atual + 1); }, 3600); }
    vai(0);
  })();

  /* ── toggle celular / balcão ──────────────────────────────────── */
  document.querySelectorAll('.toggle button').forEach(function (b) { b.addEventListener('click', function () { document.querySelectorAll('.toggle button').forEach(function (o) { o.setAttribute('aria-selected', String(o === b)); }); document.querySelectorAll('[data-cena-b]').forEach(function (c) { c.classList.toggle('on', c.dataset.cenaB === b.dataset.cena); }); posicionaAgora(); }); });
})();
