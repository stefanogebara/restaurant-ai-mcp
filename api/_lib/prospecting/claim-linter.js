'use strict';

/**
 * Claim linter — o portão que toda mensagem autônoma atravessa antes de sair.
 *
 * POR QUE EXISTE. Em 07-08/08/2026 três afirmações falsas saíram sozinhas pro
 * mercado, todas geradas pelo modelo, nenhuma revisada por gente:
 *
 *  1. "com a gorjeta indo direto pro garçom" (founderClose + bloco de venda).
 *     Ilegal de cumprir (Lei 13.419/2017 + STJ Tema 1102) e custou um lead: a
 *     casa rateia os 10% entre todos os garçons, leu a promessa como quebra do
 *     rateio dela e encerrou. O rateio dela É o nosso modelo.
 *  2. "o fundador é solo e NÃO faz call/reunião" (regra 8), que virou falso no
 *     dia em que o fundador pediu reunião de 20 min por e-mail.
 *  3. "vou mandar a proposta pro compras@..." sem existir ferramenta de e-mail.
 *
 * O fundador optou por autonomia TOTAL de envio. A resposta a isso não é reduzir
 * a autonomia, é fazer o caminho autônomo falhar fechado: nada sai sem passar
 * por aqui, e violação BLOQUEIA o envio em vez de logar e mandar assim mesmo.
 * Silêncio bem-sucedido é o inimigo: um guard que "nunca dispara" é um guard que
 * ninguém testou.
 *
 * PURO: sem I/O, sem rede, sem DB. Determinístico. Testa sem mock.
 */

/**
 * Cada família carrega o PORQUÊ junto do padrão. Quando um envio é bloqueado, a
 * mensagem de erro precisa ensinar, senão alguém "conserta" removendo o guard.
 */
const FAMILIES = [
  {
    id: 'gorjeta-direta',
    // O incidente que originou o linter.
    why:
      'O serviço liquida no CNPJ do restaurante e a casa distribui pela folha ' +
      '(Lei 13.419/2017 + STJ Tema 1102). Repasse direto ao garçom é exposição ' +
      'trabalhista e tributária DO CLIENTE, e afasta justamente quem rateia entre a equipe.',
    patterns: [
      /gorjeta[^.!?]{0,50}\bdiret[oa]\b[^.!?]{0,30}\bgar[çc]om/i,
      /gorjeta[^.!?]{0,50}\bdiret[oa]\b[^.!?]{0,30}\bequipe/i,
      /gorjeta[^.!?]{0,60}pix\s+(pessoal\s+)?d[oe]\s+gar[çc]om/i,
      /gorjeta[^.!?]{0,40}sem\s+passar\s+pelo\s+caixa/i,
      // "o garçom AINDA recebe mais gorjeta" — advérbio no meio, por isso não é \s+
      /\bgar[çc]om[^.!?]{0,20}recebe\s+mais\s+gorjeta/i,
    ],
  },
  {
    id: 'taxa-consumidor',
    why:
      'Zero taxa pro consumidor é diferencial estrutural do Racha. A sunday levou ' +
      'class action (Hoke v. Sunday App, jan/2026) por checkout fee. Nunca insinuar ' +
      'que o cliente paga algo a mais.',
    patterns: [
      // Negação tratada no padrão, e não via `allow`, de propósito: "o cliente
      // não paga nada a mais" é a frase CANÔNICA do Racha, presente em quase
      // toda copy. Se ela precisasse de allow, todo chamador allow-listaria esta
      // família por reflexo e o guard viraria peso morto. O token temperado
      // abaixo recusa casar quando há "não"/"nunca" entre o sujeito e o verbo.
      /(cliente|consumidor)((?!\bn[ãa]o\b|\bnunca\b)[^.!?]){0,40}\bpaga\b[^.!?]{0,25}\b(taxa|tarifa|a\s+mais)/i,
      /taxa\s+de\s+(conveni[êe]ncia|servi[çc]o\s+do\s+app|checkout)/i,
    ],
  },
  {
    id: 'promessa-de-envio',
    why:
      'A agente não tem ferramenta de e-mail. Prometer envio que não acontece mata ' +
      'o lead em silêncio (caso Bario Bar). Se recebeu um endereço, escale.',
    patterns: [
      // O incidente real NÃO tinha a palavra "e-mail": era "vou mandar a proposta
      // pro compras@bario.com.br". Procurar só o substantivo deixava passar
      // justamente o caso que originou esta família.
      /\b(vou|vamos|posso)\s+(te\s+)?(mandar|enviar|encaminhar)[^.!?]{0,40}[\w.+-]+@[\w.-]+\.\w{2,}/i,
      /\b(vou|vamos|posso)\s+(te\s+)?(mandar|enviar|encaminhar)[^.!?]{0,30}\b(e-?mail|email)/i,
      /\bte\s+(envio|mando)\s+(a\s+proposta|o\s+material)[^.!?]{0,25}\b(e-?mail|email)/i,
    ],
  },
  {
    id: 'agenda-do-fundador',
    why:
      'A agente não fala pela agenda do fundador. Ele às vezes faz reunião; ' +
      'afirmar o contrário se contradiz na frente do lead. Quem quer falar vai por escalar_humano.',
    patterns: [
      /fundador[^.!?]{0,30}\bn[ãa]o\s+faz\b[^.!?]{0,20}(call|reuni[ãa]o)/i,
      /\bn[ãa]o\s+(fazemos|temos)\s+(call|reuni[ãa]o)/i,
    ],
  },
  {
    id: 'adocao-prometida',
    why:
      'Não existe evidência brasileira para taxa de adoção alta em full-service ' +
      '(a banda defensável é 10-30%). Prometer número na primeira conversa é chute ' +
      'que o piloto desmente em duas semanas.',
    patterns: [
      /\b([5-9]\d|100)\s*%[^.!?]{0,30}\b(ades[ãa]o|ado[çc][ãa]o|dos\s+clientes\s+(v[ãa]o\s+)?usa)/i,
      /garant\w+[^.!?]{0,30}\b(ades[ãa]o|ado[çc][ãa]o)/i,
    ],
  },
  {
    id: 'linguagem-de-carteira',
    why:
      'O Racha nunca retém fundos (fica fora da Res. BCB 494/2025). Vocabulário de ' +
      'banco/carteira sugere conta-bolsão e muda o enquadramento regulatório na cabeça do lead.',
    patterns: [
      /\b(nossa|sua)\s+(carteira\s+digital|conta\s+digital)/i,
      /\bo\s+dinheiro\s+fica\s+(com\s+a\s+gente|conosco|no\s+racha)/i,
    ],
  },
  {
    id: 'preco-inventado',
    why:
      'Preço pós-piloto não está fechado e a persona manda escalar pra humano. ' +
      'Número dito por engano vira âncora que o fundador não consegue desfazer.',
    patterns: [
      /\bR\$\s?\d[\d.,]*\s*(por\s+m[êe]s|\/m[êe]s|mensa\w+)/i,
      /\bcusta\s+R\$\s?\d/i,
    ],
  },
];

/**
 * Roda o linter sobre um texto de saída.
 *
 * @param {string} texto Mensagem prestes a ser enviada.
 * @param {{ allow?: string[] }} [opts] Famílias a ignorar. Use com parcimônia e
 *   só quando o contexto tornar o padrão legítimo (ex.: um e-mail que EXPLICA o
 *   enquadramento correto da gorjeta cita "direto pro garçom" pra negar).
 * @returns {{ ok: boolean, violations: Array<{id: string, why: string, trecho: string}> }}
 */
function lintOutbound(texto, opts = {}) {
  const allow = new Set(opts.allow || []);
  const alvo = typeof texto === 'string' ? texto : '';
  const violations = [];

  for (const fam of FAMILIES) {
    if (allow.has(fam.id)) continue;
    for (const re of fam.patterns) {
      const hit = alvo.match(re);
      if (hit) {
        violations.push({ id: fam.id, why: fam.why, trecho: hit[0].trim() });
        break; // uma violação por família basta; o objetivo é bloquear, não catalogar
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Versão que ESTOURA. Use no caminho de envio: quem chama não pode continuar
 * sem decidir o que fazer, e um `if (!ok)` esquecido vira mensagem falsa em
 * cliente real.
 *
 * @throws {Error} com todas as violações e o motivo de cada uma.
 */
function assertOutbound(texto, opts = {}) {
  const { ok, violations } = lintOutbound(texto, opts);
  if (ok) return;
  const detalhe = violations
    .map((v) => `  [${v.id}] "${v.trecho}"\n    ${v.why}`)
    .join('\n');
  const err = new Error(`claim proibido no texto de saída:\n${detalhe}`);
  err.code = 'CLAIM_BLOCKED';
  err.violations = violations;
  throw err;
}

module.exports = { lintOutbound, assertOutbound, FAMILIES };
