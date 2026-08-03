'use strict';

/**
 * O número que a PRÓPRIA casa publica no menu do robô.
 *
 * CASO REAL (Zé Leite, 16/07/2026): a primeira resposta foi o menu do
 * autoatendimento e, dentro dele, "2️⃣ Reservas 📲 / 1197321-0441". A Olímpia
 * tratou o menu como ruído e gastou oito mensagens perguntando quem cuidava de
 * reservas — com a resposta na tela desde o primeiro segundo. Duas semanas
 * paradas falando com o número errado.
 *
 * O menu não é ruído: é onde a casa DIZ para qual número vai cada assunto.
 *
 * REGRA DE OURO AQUI: falso positivo é pior que silêncio. Mandar o fundador
 * falar com um CNPJ, um CEP ou um horário de funcionamento queima a confiança
 * no sinal inteiro. Por isso o extrator é deliberadamente conservador —
 * exige contexto de roteamento perto do número e valida a forma do telefone
 * em vez de varrer dígitos soltos.
 */

/**
 * Palavras que indicam ROTEAMENTO ("fale aqui", "reserve ali"). Sem uma delas
 * por perto, um número no texto é só um número: quantidade de pessoas, código
 * de pedido, número da rua.
 */
const PALAVRAS_DE_CONTATO = [
  'reserva', 'reservas', 'contato', 'contatos', 'fale', 'falar', 'chame', 'chamar',
  'atendimento', 'ligue', 'ligar', 'whats', 'whatsapp', 'zap', 'telefone', 'fone',
  'comercial', 'gerente', 'responsável', 'responsavel', 'proprietário', 'proprietario',
  'dono', 'eventos', 'agende', 'agendar',
];

/** Janela de busca do contexto: o rótulo costuma vir na linha anterior. */
const JANELA_CONTEXTO = 80;

/**
 * Telefone brasileiro com DDD. Aceita +55, parênteses, espaço, ponto e hífen.
 * Os grupos de 4-5 dígitos contíguos são o que separa telefone de horário:
 * "12:00 às 15:00" nunca tem quatro dígitos seguidos.
 */
const RE_TELEFONE = /(?:\+?55[\s.-]?)?\(?([1-9]\d)\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})(?!\d)/g;

/** Sequências longas de dígitos que NÃO são telefone e confundem o casamento. */
const RUIDO = [
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,   // CNPJ
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g,          // CPF
  /\b\d{5}-\d{3}\b/g,                    // CEP
  /R\$\s*[\d.,]+/gi,                     // valores
  /\b\d{1,2}[:h]\d{2}\b/g,               // horários 12:00 / 12h30
];

/** DDDs que existem no Brasil (não há 10, 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90). */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
]);

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

/**
 * Remove metade de emoji.
 *
 * O contexto sai de um slice por índice de caractere, que corta pares
 * substitutos (emoji) ao meio e deixa um surrogate órfão. String com surrogate
 * solto NÃO serializa em JSON: o PostgREST devolve "Empty or invalid json" e o
 * patch inteiro falha — e esse patch é o mesmo que grava `last_in_at`. Ou seja,
 * sem esta limpeza, uma mensagem com emoji na posição errada impediria a
 * atualização da janela de 24h do lead. Achado no backfill de 02/08 (Sabor da
 * Massa, 1 de 12).
 */
const semSurrogatoSolto = (s) => String(s)
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
  .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
  .replace(/�/g, '')
  .trim();

/**
 * PURE: acha um número de contato publicado no corpo da mensagem.
 *
 * @param {string|null} corpo texto da mensagem recebida
 * @param {{numeroDoLead?: string|null}} opts
 * @returns {{numero: string, contexto: string}|null} E.164 + o trecho que deu
 *   o contexto, para o cockpit poder mostrar POR QUE aquele número apareceu.
 */
function extrairNumeroIndicado(corpo, { numeroDoLead } = {}) {
  const texto = String(corpo || '').trim();
  if (!texto) return null;

  // Apaga o ruído ANTES de procurar: um CNPJ tem dígitos suficientes para
  // formar um telefone falso se o casamento cair no meio dele.
  let limpo = texto;
  for (const re of RUIDO) limpo = limpo.replace(re, (m) => ' '.repeat(m.length));

  const doLead = soDigitos(numeroDoLead).slice(-11);

  RE_TELEFONE.lastIndex = 0;
  let m;
  while ((m = RE_TELEFONE.exec(limpo)) !== null) {
    const [bruto, ddd, meio, fim] = m;
    if (!DDDS_VALIDOS.has(Number(ddd))) continue;

    const nacional = `${ddd}${meio}${fim}`;
    if (nacional.length !== 10 && nacional.length !== 11) continue;
    // Celular tem 11 dígitos e começa com 9 depois do DDD; fixo tem 10 e
    // começa com 2-5. Qualquer outra combinação é dígito solto com sorte.
    if (nacional.length === 11 && meio[0] !== '9') continue;
    if (nacional.length === 10 && !/^[2-5]/.test(meio)) continue;

    // O número do próprio lead não é "outro número" — é a linha onde já estamos.
    if (doLead && nacional.slice(-11) === doLead.slice(-11)) continue;
    if (doLead && nacional.length === 10 && doLead.endsWith(nacional)) continue;

    // Contexto de roteamento perto do número, senão é chute.
    const antes = limpo.slice(Math.max(0, m.index - JANELA_CONTEXTO), m.index).toLowerCase();
    const achou = PALAVRAS_DE_CONTATO.find((p) => antes.includes(p));
    if (!achou) continue;

    // Devolve o trecho de contexto limpo, para o painel explicar a origem.
    const contexto = semSurrogatoSolto(
      texto
        .slice(Math.max(0, m.index - JANELA_CONTEXTO), m.index + bruto.length)
        .replace(/\s+/g, ' '),
    );

    return { numero: `+55${nacional}`, contexto };
  }

  return null;
}

module.exports = { extrairNumeroIndicado, PALAVRAS_DE_CONTATO };
