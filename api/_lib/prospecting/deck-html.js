'use strict';

/**
 * Proposta personalizada por prospect — gerador puro de HTML.
 *
 * É o análogo do `criar_demo` do Seatable, e era o maior ganho de conversão
 * pendente do funil do Racha: até aqui a Olímpia só tinha a mesa de
 * demonstração genérica ("Bar do Racha"), e o deck com o nome da casa existia
 * como um arquivo feito à mão, um por prospect.
 *
 * PÁGINA, NÃO PDF, por três razões concretas:
 *  - PDF por prospect exigiria renderizar com browser a cada envio, e anexo
 *    pesado em e-mail frio derruba entregabilidade (decisão de 08/08).
 *  - Gerência abre no celular e ENCAMINHA internamente; link sobrevive a isso,
 *    anexo de 760KB atravessa mal gateway corporativo.
 *  - A página leva o demo interativo dentro, que é a prova real.
 *
 * PERSONALIZAÇÃO HONESTA: só nome, cidade e setor (bar/restaurante). Nada de
 * nota do Google, prato ou movimento — inventar fato sobre a casa destrói a
 * credibilidade na primeira frase, e o dono sabe a nota dele de cor.
 *
 * PURO: sem I/O. Escapa tudo que vem do lead (nome de casa é dado hostil).
 */

const { assertOutbound } = require('./claim-linter');

const PREVIA_URL =
  process.env.PROSPECTING_PREVIA_URL || 'https://racha-gray.vercel.app/?t=demoracha';

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * A dor muda com o formato da casa. Bar com comanda individual não tem
 * "dividida" pra resolver — tem fila no caixa. Errar isso faz a proposta falar
 * de um problema que a pessoa não tem.
 */
function dorDoFormato(sector) {
  const s = String(sector || '').toLowerCase();
  if (/bar|pub|boteco|cerve/.test(s)) {
    return {
      titulo: 'A fila do caixa no fim da noite',
      texto:
        'Em casa de comanda individual, o gargalo não é dividir a conta: é a fila que se ' +
        'forma no caixa quando todo mundo resolve ir embora ao mesmo tempo. Com o QR, cada ' +
        'um fecha a própria comanda sentado, e ninguém precisa passar no caixa.',
    };
  }
  return {
    titulo: 'Os últimos vinte minutos de toda refeição',
    texto:
      'A refeição termina e a mesa não vaga: pede a conta, espera, o garçom traz a ' +
      'maquininha, a mesa de oito quer dividir em cinco cartões, e cada passada é uma de ' +
      'cada vez. No pico, é onde o giro de mesa morre justamente quando vale mais.',
  };
}

const SECOES_FIXAS = [
  {
    titulo: 'Três passos, nenhum download',
    itens: [
      ['Escaneou', 'O QR na mesa abre a conta ao vivo no celular, com o que a pessoa consumiu.'],
      ['Rachou', 'Igual entre a mesa, por item, ou um valor livre. A tela mostra quanto já foi pago e quanto falta.'],
      ['Pagou', 'Pix ou cartão pelo Google Pay. A mesa fecha sozinha quando chega a 100%.'],
    ],
  },
  {
    titulo: 'O que muda no salão',
    itens: [
      ['O garçom volta a atender', 'Ele para de circular com a maquininha de mesa em mesa.'],
      ['A mesa vaga mais rápido no pico', 'O grupo paga sentado, cada um no seu tempo. Quando o último confirma, a mesa está livre.'],
      ['Pix custa menos que crédito', 'O custo de receber no Pix fica bem abaixo do MDR do cartão, e cai no mesmo dia.'],
      ['Fechamento sem quebra-cabeça', 'Relatório por mesa, conciliado ao centavo, com o valor de serviço separado.'],
    ],
  },
  {
    titulo: 'O que não muda',
    itens: [
      ['Sua maquininha', 'Continua onde está. O Racha é uma opção a mais, não uma substituição.'],
      ['Seu sistema', 'Onde há integração, a conta vem do próprio PDV. Onde não há, o lançamento é pelo nosso painel desde o primeiro dia.'],
      ['Sem hardware', 'Nenhum equipamento, nenhuma obra, nenhuma instalação. É um QR na mesa.'],
      ['Sem app pro cliente', 'Nada pra baixar, nada pra cadastrar. Câmera do celular e pronto.'],
    ],
  },
];

/**
 * Monta a página da proposta.
 *
 * @param {object} lead Linha de prospect_leads (name, city, sector).
 * @param {object} [opts]
 * @returns {{ html: string, titulo: string }}
 */
function buildDeckHtml(lead, opts = {}) {
  const {
    previaUrl = PREVIA_URL,
    founderName = process.env.PROSPECTING_FOUNDER_NAME || 'Stefano',
    founderEmail = process.env.PROSPECTING_FOUNDER_EMAIL || '',
    founderPhone = process.env.PROSPECTING_FOUNDER_PHONE
      || process.env.PROSPECTING_FOUNDER_WHATSAPP || '',
  } = opts;

  const casa = (lead && lead.name ? String(lead.name) : '').trim();
  const cidade = (lead && lead.city ? String(lead.city) : '').trim();
  const dor = dorDoFormato(lead && lead.sector);

  const titulo = casa ? `Racha · proposta para ${casa}` : 'Racha · proposta';

  // O texto visível passa pelo mesmo portão de qualquer coisa que sai daqui.
  // Uma página é conteúdo de saída como um e-mail: se um claim proibido entrar
  // por edição futura, tem que estourar no teste e não no cliente.
  const textoVisivel = [
    casa, cidade, dor.titulo, dor.texto,
    ...SECOES_FIXAS.flatMap((s) => [s.titulo, ...s.itens.flat()]),
    GORJETA_TEXTO, PILOTO_TEXTO,
  ].join('\n');
  assertOutbound(textoVisivel);

  const secoesHtml = SECOES_FIXAS.map((s) => `
    <section class="bloco">
      <h2>${esc(s.titulo)}</h2>
      <div class="grade">
        ${s.itens.map(([t, d]) => `
          <div class="carta">
            <h3>${esc(t)}</h3>
            <p>${esc(d)}</p>
          </div>`).join('')}
      </div>
    </section>`).join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root{
    --ground:#FAFAF9; --ink:#1C1917; --muted:#706A65;
    --burgundy:#9F1239; --emerald:#10B981;
    --glass:rgba(255,255,255,.62); --border:rgba(255,255,255,.70);
    --shadow:0 8px 32px rgba(28,25,23,.08), 0 2px 8px rgba(28,25,23,.04);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'DM Sans',system-ui,sans-serif; color:var(--ink);
    background:var(--ground); line-height:1.55; position:relative; min-height:100vh;
  }
  body::before{
    content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
    background:
      radial-gradient(46% 42% at 8% 4%,   rgba(217,119,6,.18) 0%, rgba(217,119,6,0) 62%),
      radial-gradient(44% 40% at 92% 10%, rgba(245,158,11,.15) 0%, rgba(245,158,11,0) 60%),
      radial-gradient(52% 46% at 88% 92%, rgba(159,18,57,.12)  0%, rgba(159,18,57,0)  62%),
      radial-gradient(48% 44% at 4% 96%,  rgba(120,53,15,.10)  0%, rgba(120,53,15,0)  60%);
  }
  .pagina{position:relative; z-index:1; max-width:820px; margin:0 auto; padding:56px 24px 80px}
  h1,h2{font-family:'Instrument Serif',Georgia,serif; font-weight:400; letter-spacing:-.01em}
  h1{font-size:clamp(38px,7vw,62px); line-height:1.05; margin-bottom:18px}
  h2{font-size:clamp(26px,4.4vw,36px); line-height:1.15; margin-bottom:22px}
  em{font-style:italic; color:var(--burgundy)}
  .eyebrow{
    font-size:12px; font-weight:500; letter-spacing:.16em; text-transform:uppercase;
    color:var(--muted); margin-bottom:18px;
  }
  .lede{font-size:clamp(17px,2.4vw,20px); color:var(--muted); margin-bottom:14px}
  .bloco{margin-top:56px}
  .grade{display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .carta{
    background:var(--glass); border:1px solid var(--border); border-radius:20px;
    box-shadow:var(--shadow); padding:22px 24px;
  }
  .carta h3{font-size:17px; font-weight:700; margin-bottom:7px}
  .carta p{font-size:15.5px; color:var(--muted)}
  .cta{
    display:inline-flex; align-items:center; gap:10px; margin-top:8px;
    padding:15px 28px; border-radius:100px; background:var(--burgundy);
    color:#fff; text-decoration:none; font-size:17px; font-weight:500;
  }
  .destaque{
    margin-top:24px; padding:20px 24px; border-radius:16px;
    background:rgba(159,18,57,.06); border:1px solid rgba(159,18,57,.16);
    font-size:16px;
  }
  .rodape{
    margin-top:64px; padding-top:28px; border-top:1px solid rgba(28,25,23,.10);
    font-size:15px; color:var(--muted);
  }
  .rodape strong{font-family:'Instrument Serif',serif; font-size:21px; font-weight:400; color:var(--ink)}
  .mono{font-family:'JetBrains Mono',monospace}
  a{color:var(--burgundy)}
</style>
</head>
<body>
<div class="pagina">

  <div class="eyebrow">Pagamento na mesa · Pix e cartão · sem aplicativo</div>
  <h1>O jeito mais rápido<br>de <em>fechar a conta</em>${casa ? `,<br>no ${esc(casa)}` : ''}.</h1>
  <p class="lede">
    ${casa ? `Seu cliente${cidade ? ` aí em ${esc(cidade)}` : ''} escaneia o QR da mesa` : 'O cliente escaneia o QR da mesa'},
    vê a conta, divide como quiser e paga em segundos.
  </p>
  <a class="cta" href="${esc(previaUrl)}">Ver a tela que o seu cliente vê →</a>
  <div class="destaque">
    É uma conta de demonstração: pode mexer à vontade, ninguém é cobrado. Trinta segundos, do celular.
  </div>

  <section class="bloco">
    <h2>${esc(dor.titulo)}</h2>
    <p class="lede">${esc(dor.texto)}</p>
  </section>
${secoesHtml}

  <section class="bloco">
    <h2>A gorjeta, do jeito que <em>a lei pede</em></h2>
    <p class="lede">${esc(GORJETA_TEXTO)}</p>
  </section>

  <section class="bloco">
    <h2>A proposta</h2>
    <p class="lede">${esc(PILOTO_TEXTO)}</p>
  </section>

  <div class="rodape">
    <strong>${esc(founderName)} Gebara</strong><br>
    Fundador · Racha<br>
    ${founderEmail ? `<a href="mailto:${esc(founderEmail)}">${esc(founderEmail)}</a>` : ''}
    ${founderPhone ? ` · <span class="mono">${esc(founderPhone)}</span>` : ''}
  </div>

</div>
</body>
</html>`;

  return { html, titulo };
}

const GORJETA_TEXTO =
  'Os 10% entram na conta e o cliente pode remover, como manda o CDC. O valor liquida no CNPJ ' +
  'do restaurante junto com o resto, e a distribuição continua sendo sua, pela folha, como já é ' +
  'feita hoje. O relatório separa quanto foi de serviço, por dia e por mesa. Não há repasse ' +
  'direto a funcionário, justamente para não criar exposição trabalhista (Lei 13.419/2017).';

const PILOTO_TEXTO =
  'Um piloto sem custo e sem contrato, começando por algumas mesas, com métrica combinada antes ' +
  'de ligar: quantas contas fecham pelo Racha e quantos minutos entre pedir a conta e a mesa ' +
  'ficar livre. Não prometemos taxa de adoção; o piloto existe para descobrir esse número na sua ' +
  'casa, com a sua clientela, sem você pagar para descobrir.';

module.exports = { buildDeckHtml, dorDoFormato, GORJETA_TEXTO, PILOTO_TEXTO };
