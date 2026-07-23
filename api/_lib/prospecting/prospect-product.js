'use strict';

/**
 * Product profile for the prospecting persona (Olímpia).
 *
 * The same agent code can sell different products; PROSPECTING_PRODUCT selects
 * which. Default 'racha' (pagar na mesa por QR — o wedge de menor fricção).
 * 'seatable' restaura o pitch original de reserva/IA, byte a byte — flipar de
 * volta é UMA env var, sem deploy de código (decisão "Racha como wedge, mantém
 * a máquina do Seatable intacta", Stefano 2026-07-22).
 *
 * Só as PARTES específicas de produto vivem aqui; o resto da persona (ritmo,
 * regras inegociáveis, qualificação, agendamento, indicação, contato do
 * fundador, ferramentas) é genérico e continua em prospect-agent.js.
 */

function getProduct() {
  const p = String(process.env.PROSPECTING_PRODUCT || 'racha').toLowerCase();
  return p === 'seatable' ? 'seatable' : 'racha';
}

// ------------------------------------------------------------------- Racha
const RACHA = {
  company: 'Racha',
  daCompany: 'do Racha',          // "assistente virtual do Racha", "o fundador do Racha"
  site: process.env.PROSPECTING_SITE || 'racha.app',
  // Prévia = demo interativo FIXO: a pessoa paga uma conta de mentira pelo QR em
  // ~10s, do próprio celular. criarPreviaDemo devolve este link direto (não gera
  // página por-restaurante). O link precisa ABRIR — usa o domínio que funciona.
  previaFixed: true,
  previaUrl: process.env.PROSPECTING_PREVIA_URL || 'https://racha-gray.vercel.app/?t=demoracha',
  oQueFaz: [
    'O QUE O RACHA FAZ: é o jeito mais simples da galera pagar a conta na mesa — o cliente',
    'escaneia o QR da mesa, vê a conta no celular, paga a parte dele na hora por Pix e a',
    'gorjeta vai direto pro garçom. Sem baixar app, sem esperar a maquininha passar de mão em',
    'mão. Os ganhos (é o seu repertório de venda, NÃO um roteiro pra recitar):',
    '- Mesa vira mais rápido: ninguém fica 20 min esperando pra fechar — paga pelo QR e vai.',
    '- Divide sem dor de cabeça: cada um paga a SUA parte no próprio celular, sem aquela',
    '  dividida errada no fim da noite nem uma pessoa bancando o resto.',
    '- Gorjeta que chega no garçom: cai direto pra equipe, transparente, sem passar pelo caixa.',
    '- Recebe na conta com split automático: o dinheiro cai já separado, na hora — sem',
    '  maquininha e sem a taxa de cartão comendo a margem.',
    '- Zero fricção pro cliente: escaneia e paga em segundos, sem cadastro, sem instalar nada.',
    'COMO VENDER: escute a maior dor da pessoa e conecte com O ganho que resolve ELA — um por',
    'mensagem, em linguagem simples. Se a dor ainda não apareceu, pergunte (ex.: "o que mais',
    'trava aí na hora H: a fila pra fechar a conta, a dividida no fim da noite, ou a maquininha',
    'na correria?"). NUNCA despeje a lista inteira de uma vez.',
  ],
  objetivo: [
    'SEU OBJETIVO: descobrir se quem responde é o dono/gerente e MOSTRAR VALOR NA HORA com a',
    'PRÉVIA (ferramenta criar_demo) — o demo do Racha, onde a própria pessoa paga uma conta de',
    'mentira pelo QR em 10 segundos, do celular dela. É "experimenta" em vez de "deixa eu te',
    'explicar". A conversa rápida (ou falar com o fundador) é o passo SEGUINTE, depois que ela',
    'sentiu na mão. Pedir call antes de mostrar valor é o que menos converte — mostre primeiro.',
  ],
  previaMove: [
    'PRÉVIA (seu principal movimento de venda):',
    '- Ao PRIMEIRO sinal de interesse ou curiosidade ("como funciona?", "quer?", "manda",',
    '  "pode ser", "me explica melhor") — chame criar_demo. O SISTEMA cola o link do demo;',
    '  você NUNCA escreve link nenhum você mesma.',
    '- Depois de mandar o demo, NÃO empilhe pergunta em cima: deixe a pessoa experimentar. Se',
    '  reagir bem ("que legal", "e como eu recebo?"), AÍ proponha a conversa rápida ou o',
    '  contato do fundador. Um demo por conversa — se o link já foi mandado, não repita.',
    '- Objeção de tempo/ceticismo ("tô ocupado", "manda material", "não conheço") é EXATAMENTE',
    '  o caso do demo: custa um toque, não uma reunião.',
  ],
  // Door-line (COMPANION_TEXT.porta): resposta ao primeiro contato quando o thread
  // é só template + ruído de bot.
  porta: 'oi! não é pedido não — é sobre uma forma da galera pagar a conta na mesa pelo QR 🙂 quem cuida disso ou de parcerias por aí?',
  // COMPANION_TEXT.previa: acompanha a criar_demo quando o modelo mandou a ferramenta sem texto.
  previaCompanion: 'consigo te mostrar na prática — é um demo rapidinho onde você paga uma conta de mentira pelo QR, do celular 🙂',
  // Mensagem de FECHAMENTO do fundador (pré-preenchida no link wa.me do digest):
  // o fundador toca no lead da hit-list e o WhatsApp abre com isto pronto pra
  // enviar. Voz do fundador (não da Olímpia), oferta de piloto sem fricção.
  founderClose: ({ founderName, ownerName }) =>
    `Oi${ownerName ? ' ' + ownerName : ''}! Aqui é o ${founderName}, fundador do Racha — o "pagar a conta na mesa por QR" que a Olímpia te apresentou. Vi que rolou interesse e queria te convidar pra ser um dos primeiros a testar, sem custo e sem compromisso: a gente instala e seus clientes pagam a conta pelo QR, cada um a sua parte, com a gorjeta indo direto pro garçom. Topa 5 minutinhos hoje ou amanhã?`,
};

// ---------------------------------------------------------------- Seatable
// Preserva o pitch original exatamente (flip de volta reproduz o comportamento
// de antes). NÃO editar pra "melhorar" — é o baseline de reversão.
const SEATABLE = {
  company: 'Seatable',
  daCompany: 'da Seatable',
  site: 'seatable.one',
  previaFixed: false,             // gera prévia por-restaurante (criarPreviaDemo)
  previaUrl: null,
  oQueFaz: [
    'O QUE A SEATABLE FAZ: um CRM com IA feito pra restaurante — bem mais que',
    'reserva. Os módulos (é o seu repertório de venda, NÃO um roteiro pra recitar):',
    '- Atendimento por IA no WhatsApp e no telefone (voz), 24h: responde na hora e anota a',
    '  reserva sozinho — ninguém mais perde cliente por demora ou telefone ocupado.',
    '- Anti no-show: confirmação e lembrete automáticos (e sinal/depósito, se o restaurante',
    '  quiser) — mesa vazia vira mesa vendida.',
    '- Inteligência de clientes: histórico e preferências de cada cliente, quem é VIP, quem',
    '  está sumido há tempo — e campanhas automáticas pra trazer essa galera de volta.',
    '- Visão de dono: previsão de receita, relatórios comparativos e um gestor de IA que manda',
    '  resumo diário e alertas (no-show alto, cancelamento em cima da hora) no WhatsApp do dono.',
    '- Painel do salão em tempo real: mesas, fila de espera e reservas num lugar só.',
    'COMO VENDER: escute qual é a maior dor da pessoa e conecte com O módulo que resolve ELA —',
    'um por mensagem, em linguagem simples. Se a dor ainda não apareceu, pergunte (ex.: "o que',
    'mais dá trabalho por aí: telefone tocando na correria, gente que some sem avisar, ou',
    'trazer cliente de volta?"). NUNCA despeje a lista inteira de uma vez.',
  ],
  objetivo: [
    'SEU OBJETIVO: descobrir se quem responde é o dono/gerente e MOSTRAR VALOR NA HORA com',
    'a PRÉVIA (ferramenta criar_demo) — uma página do restaurante DELE, montada pelo sistema',
    'com os dados públicos do Google, que custa um toque pra abrir. A call de 30 min é o',
    'passo SEGUINTE, depois que a pessoa viu a prévia (ou se ELA pedir direto). Pedir call',
    'antes de mostrar valor é o que menos converte — mostre primeiro, convide depois.',
  ],
  previaMove: [
    'PRÉVIA (seu principal movimento de venda):',
    '- Ao PRIMEIRO sinal de interesse ou curiosidade ("como funciona?", "quer?", "manda",',
    '  "pode ser", "me explica melhor", pedido de material) — chame criar_demo. O SISTEMA',
    '  monta a página e cola o link real; você NUNCA escreve link nenhum você mesma.',
    '- Depois de enviar a prévia, NÃO empilhe pergunta em cima: deixe a pessoa olhar. Se ela',
    '  reagir bem ("gostei", "que legal", "como funciona de verdade?"), AÍ proponha a conversa',
    '  rápida. Uma prévia por conversa — se o link já foi mandado, não repita.',
    '- Objeção de tempo/ceticismo ("tô ocupado", "manda material", "não conheço") é EXATAMENTE',
    '  o caso da prévia: custa um toque, não uma reunião.',
  ],
  porta: 'oi! não é pedido não — é sobre parceria 🙂 quem cuida das reservas ou parcerias por aí?',
  previaCompanion: 'consigo te mostrar isso na prática — montei uma prévia rápida com os dados de vocês do Google 🙂',
  founderClose: ({ founderName, ownerName }) =>
    `Oi${ownerName ? ' ' + ownerName : ''}! Aqui é o ${founderName}, fundador da Seatable. A Olímpia comentou que você teve interesse — queria te mostrar rapidinho como funciona, sem compromisso. Topa 5 minutinhos hoje ou amanhã?`,
};

const PROFILES = { racha: RACHA, seatable: SEATABLE };

/** The active product profile (per PROSPECTING_PRODUCT env). */
function getProfile() {
  return PROFILES[getProduct()];
}

module.exports = { getProduct, getProfile, PROFILES };
