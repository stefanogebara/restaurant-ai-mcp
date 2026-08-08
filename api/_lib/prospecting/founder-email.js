'use strict';

/**
 * Proposta do fundador por e-mail — compositor puro.
 *
 * POR QUE EXISTE. Quando o porteiro entrega o e-mail do decisor ("fala com o
 * compras@..."), o sistema não tinha para onde levar: a Olímpia não tem
 * ferramenta de e-mail, `prospect_email` era escrito e nunca lido, e o lead
 * ficava em 'conversando', fora do digest. O caso Bario Bar (07/08/2026) morreu
 * exatamente assim, com uma promessa de envio que ninguém podia cumprir.
 *
 * DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
 *
 *  - **Texto fixo, não composto por LLM.** O fundador pediu autonomia total de
 *    envio. Conteúdo determinístico é o que torna isso seguro: o mesmo lead gera
 *    o mesmo e-mail, revisável uma vez e válido para sempre. Composição livre
 *    entra só depois do linter provar que segura em produção.
 *  - **Link do demo, não anexo do deck.** PDF de 760KB em cold email derruba
 *    entregabilidade e alguns gateways corporativos barram anexo de remetente
 *    novo. O link do demo converte mais e chega mais.
 *  - **Auto-lint antes de devolver.** `buildProposalEmail` chama assertOutbound
 *    no corpo final. Se um dia alguém editar a copy e reintroduzir um claim
 *    proibido, o build estoura no teste, não no cliente.
 *
 * PURO: sem I/O, sem rede, sem DB. O envio é do cron; a seleção é do store.
 */

const { assertOutbound } = require('./claim-linter');

/**
 * Marcador do evento de envio. É o que impede envio duplicado: o cron procura
 * este prefixo em prospect_messages antes de mandar. Sem coluna nova, sem
 * migration. NÃO MUDAR sem migrar o histórico, ou todo lead já contactado
 * recebe a proposta de novo.
 */
const PROPOSAL_MARKER = '📧 proposta enviada por e-mail';

const PREVIA_URL =
  process.env.PROSPECTING_PREVIA_URL || 'https://racha-gray.vercel.app/?t=demoracha';

/** Primeiro nome, para não escrever "Prezado Bario Bar - Tatuapé". */
function primeiroNome(valor) {
  if (!valor) return null;
  const limpo = String(valor).trim().split(/\s+/)[0];
  return limpo && /^[A-Za-zÀ-ÿ]{2,}$/.test(limpo) ? limpo : null;
}

/**
 * Monta a proposta. Determinístico: mesmo lead + mesmas opções → mesmo e-mail.
 *
 * @param {object} lead Linha de prospect_leads (name, owner_name, prospect_email).
 * @param {object} [opts]
 * @param {string} [opts.previaUrl] Link do demo interativo.
 * @param {string} [opts.founderName]
 * @param {string} [opts.founderEmail]
 * @param {string} [opts.founderPhone] Formatado para humano, ex. "(11) 99900-2121".
 * @param {string} [opts.indicadoPor] Nome de quem passou o contato, se houver.
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildProposalEmail(lead, opts = {}) {
  const {
    previaUrl = PREVIA_URL,
    founderName = process.env.PROSPECTING_FOUNDER_NAME || 'Stefano',
    founderEmail = process.env.PROSPECTING_FOUNDER_EMAIL || '',
    founderPhone = process.env.PROSPECTING_FOUNDER_PHONE || '',
    indicadoPor = null,
  } = opts;

  const casa = (lead && lead.name ? String(lead.name) : '').trim();
  const quemPassou = primeiroNome(indicadoPor || (lead && lead.owner_name));

  const abertura = quemPassou
    ? `O ${quemPassou}, aí do ${casa || 'restaurante'}, indicou este e-mail para eu encaminhar a proposta.`
    : 'Fui orientado a escrever para este endereço para tratar do assunto.';

  const assinaturaLinhas = [
    `${founderName} Gebara`,
    'Fundador · Racha',
    [founderEmail, founderPhone && `WhatsApp ${founderPhone}`].filter(Boolean).join(' · '),
  ].filter(Boolean);

  const paragrafos = [
    'Olá, bom dia.',
    abertura,
    `Sou o ${founderName}, fundador do Racha, pagamento de conta na mesa por QR code. ` +
      'O cliente escaneia o QR, vê a conta no próprio celular, divide como quiser e paga ' +
      'no Pix ou cartão. Sem baixar aplicativo e sem cadastro.',
    'Dá para ver funcionando em trinta segundos, do celular:',
    previaUrl,
    'É exatamente a tela que o cliente vê na mesa, com uma conta de demonstração. ' +
      'Podem mexer à vontade, ninguém é cobrado.',
    'Três pontos que costumam ser perguntados logo:',
  ];

  const bullets = [
    'Não substitui a maquininha nem o sistema de vocês. Roda junto, como uma opção a ' +
      'mais, sem hardware e sem instalação, é um QR na mesa.',
    'Os 10% de serviço entram na conta (o cliente pode remover, como manda o CDC) e ' +
      'liquidam no CNPJ do restaurante junto com o resto. A distribuição continua sendo ' +
      'de vocês, pela folha, como já é feita hoje. Não há repasse direto a funcionário, ' +
      'justamente para não criar exposição trabalhista (Lei 13.419/2017).',
    'O cliente não paga nada a mais para usar.',
  ];

  const fecho = [
    'A proposta é um piloto sem custo e sem contrato, começando por algumas mesas, com ' +
      'métrica combinada antes de ligar.',
    'Fico à disposição.',
  ];

  const subject = casa
    ? `Racha — pagamento na mesa por QR para ${casa}`
    : 'Racha — pagamento na mesa por QR';

  const text = [
    ...paragrafos,
    ...bullets.map((b) => `• ${b}`),
    ...fecho,
    '',
    ...assinaturaLinhas,
  ].join('\n\n');

  const html = [
    ...paragrafos.map((p) => (p === previaUrl
      ? `<p><a href="${esc(previaUrl)}">${esc(previaUrl)}</a></p>`
      : `<p>${esc(p)}</p>`)),
    `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`,
    ...fecho.map((p) => `<p>${esc(p)}</p>`),
    `<p>${assinaturaLinhas.map(esc).join('<br>')}</p>`,
  ].join('\n');

  // Falha fechado: copy editada que reintroduza claim proibido estoura aqui,
  // no teste, e não no cliente.
  assertOutbound(text);

  return { subject, text, html };
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * PURO: este lead já recebeu a proposta? Lê o histórico em memória, sem DB.
 * @param {Array<{direcao?: string, corpo?: string}>} mensagens
 */
function propostaJaEnviada(mensagens) {
  return (mensagens || []).some(
    (m) => m && typeof m.corpo === 'string' && m.corpo.startsWith(PROPOSAL_MARKER)
  );
}

/** Texto do evento gravado após o envio (o que `propostaJaEnviada` procura). */
function eventoDeEnvio(destino) {
  return `${PROPOSAL_MARKER}: ${destino}`;
}

module.exports = {
  buildProposalEmail,
  propostaJaEnviada,
  eventoDeEnvio,
  PROPOSAL_MARKER,
};
