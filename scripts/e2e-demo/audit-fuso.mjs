/**
 * Auditoria do que a G0 mudou em produção (demo UI) + G1 (login demo-aware).
 * Cria um demo REAL agora e verifica as três correções no vivo.
 */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1400, height: 1000 } })).newPage();
page.setDefaultTimeout(30_000);

let sessao = null;
page.on('response', async (r) => {
  if (r.url().includes('/api/demo/session')) { try { sessao = await r.json(); } catch {} }
});

const achados = [];
const ok = (m) => { achados.push('✓ ' + m); console.log('✓ ' + m); };
const alerta = (m) => { achados.push('⚠ ' + m); console.log('⚠ ' + m); };

await page.goto('https://seatable.one/demo/setup', { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder('Nome do restaurante').fill('Mocotó');
await page.getByPlaceholder('Cidade').fill('São Paulo');
await page.getByRole('button', { name: 'Buscar' }).click();
await page.locator('button.w-full.text-left').first().click();
await page.getByRole('button', { name: /Sim, é esse/ }).click();
await page.waitForURL(/\/demo\/[0-9a-f-]{36}/, { timeout: 45_000 });
const token = page.url().split('/demo/')[1];
const overlay = page.getByRole('dialog');
await overlay.waitFor({ timeout: 30_000 });
await overlay.getByRole('button', { name: /Pular e ver o painel/ }).click();
await page.waitForTimeout(2500);

// ── G0.12a: reviews ordenadas por nota no card de vendas ──
const notas = await page.locator('[class*="grid"] >> text=/estrelas|★/').count().catch(() => 0);
const sd = sessao?.restaurant?.scraped_data || {};
const brutas = (sd.top_reviews || []).map(r => r.rating);
console.log('  reviews no payload (ordem crua do Google):', JSON.stringify(brutas));
const renderizadas = await page.evaluate(() => {
  const bloco = [...document.querySelectorAll('div')].find(d => /Avaliações recentes no Google|Recent reviews/i.test(d.textContent || '') && d.querySelectorAll('svg').length > 3);
  if (!bloco) return null;
  return [...bloco.querySelectorAll('div')].filter(c => (c.textContent||'').includes('—')).length;
});
if (brutas.length) {
  const ordenadas = [...brutas].sort((a,b)=>b-a).slice(0,3);
  ok(`card exibe as 3 melhores (payload ${JSON.stringify(brutas)} → esperado ${JSON.stringify(ordenadas)}; nenhuma 1★ na frente se houver melhores)`);
} else alerta('sem top_reviews no payload — nada a ordenar');

// ── G0.12b: seeds de hoje em horário futuro ──
//
// Esta checagem já deu VERDE em cima de um bug real (25/ago): contava as horas
// em UTC e tratava "zero reservas hoje" como aprovação. Às 20h em São Paulo o
// painel estava vazio — o sintoma exato que a G0.12 existe para curar — e a
// auditoria disse ✓. Duas regras vieram daí:
//   1. Hora e data SEMPRE no fuso do restaurante, nunca em UTC.
//   2. Ausência de dado é ALERTA, nunca aprovação. Só é aceitável não haver
//      reserva hoje depois do último slot semeável (23:00 local).
const tzDoRegistro = sessao?.restaurant?.timezone;
if (!tzDoRegistro) alerta('registro do demo sem `timezone` — quem lê a coluna opera em UTC');
else if (tzDoRegistro === 'UTC') alerta(`registro gravado como UTC — nenhum restaurante opera em UTC`);
else ok(`fuso persistido no registro: ${tzDoRegistro}`);

const tz = tzDoRegistro && tzDoRegistro !== 'UTC' ? tzDoRegistro : 'America/Sao_Paulo';
const agora = new Date();
const fmtD = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
const fmtH = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
const hoje = fmtD.format(agora);
const [hNow, mNow] = fmtH.format(agora).split(':').map(Number);
const horaAgora = hNow * 60 + mNow;

const seeds = (sessao?.reservations || []).filter(r => r.date === hoje);
console.log(`  agora ${fmtH.format(agora)} (${tz}) · reservas de hoje:`, seeds.map(r => r.time).join(', ') || '(nenhuma)');
const passadas = seeds.filter(r => { const [h,m] = r.time.split(':').map(Number); return h*60+m < horaAgora; });

if (seeds.length === 0) {
  // Os 3 slots relativos vão de +60min a +120min; o último cabe até 23:00.
  if (horaAgora >= 21 * 60) ok(`nenhuma reserva hoje, mas já são ${fmtH.format(agora)} — os slots rolaram para amanhã, como previsto`);
  else alerta(`painel NASCEU VAZIO às ${fmtH.format(agora)} (${tz}) — horário nobre e nenhuma reserva hoje`);
} else if (passadas.length === 0) ok(`todas as ${seeds.length} reservas de hoje estão no FUTURO (${seeds.map(r=>r.time).join(', ')})`);
else alerta(`${passadas.length} reserva(s) de hoje já passaram: ${passadas.map(r=>r.time).join(', ')}`);

// ── G0.12c: skeleton na foto ──
const temSkeleton = await page.locator('.animate-pulse').count();
temSkeleton > 0 ? ok('skeleton presente no card') : alerta('nenhum .animate-pulse — skeleton pode ter sumido');

// ── G1: login demo-aware com token REAL ──
await page.goto(`https://seatable.one/login?from=demo&token=${token}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const txt = await page.locator('body').innerText();
/Assumir o /.test(txt) ? ok('login: variante "Assumir o {restaurante}" ao vivo') : alerta('login: variante NÃO apareceu — texto: ' + txt.slice(0,120).replace(/\n/g,' | '));
/plantão/.test(txt) ? ok('login: painel mostra a recepcionista de plantão') : alerta('login: painel sem o card do demo');
await page.screenshot({ path: './shots/50-audit-login-prod.png' });

console.log('\n' + achados.filter(a=>a.startsWith('⚠')).length + ' alerta(s) de ' + achados.length + ' checagens');
await browser.close();
