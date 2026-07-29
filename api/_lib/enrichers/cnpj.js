'use strict';

/**
 * Enricher de CNPJ — item 5 do plano zero-toque (28/jul/2026).
 *
 * CONTRATO DE ENRICHER (Parte 2 do plano): toda fonte devolve o mesmo formato
 *   { campos, confianca, fonte }
 * para o chamador poder rodar várias em paralelo, com timeout próprio, sem que
 * nenhuma seja bloqueante. Ausência de dado NUNCA é erro — é `campos: null`.
 *
 * POR QUE ESTA FONTE PRIMEIRO: o índice da Receita já está carregado no banco
 * (146k estabelecimentos, RPC `buscar_cnpj_local`) e verificado em produção.
 * Custo zero por consulta, dado oficial, nenhuma dependência externa nova —
 * a melhor relação valor/risco das quatro fontes que o plano lista.
 *
 * O QUE ISSO DESTRAVA NO ONBOARDING:
 *   1. razão social e porte pré-preenchidos (menos digitação);
 *   2. os SÓCIOS, que permitem uma pergunta que nenhum concorrente faz:
 *      "você é o Jorge ou a Keila?" — em vez de "qual seu cargo?". Confirma
 *      que quem está cadastrando é dono de verdade, sem pedir documento.
 *
 * NÃO decide sozinho: devolve candidatos com confiança e deixa a escolha para
 * o dono. Casar CNPJ errado é pior que não casar nenhum — dado fiscal de outra
 * empresa no cadastro é problema sério e silencioso.
 */

const { buscarCnpjLocal } = require('../prospecting/prospect-cnpj-local');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('EnricherCnpj');

/** CNAEs de restaurante/bar/lanchonete — o setor certo aumenta a confiança. */
const CNAE_ALIMENTACAO = /^56(11|12)/;

/**
 * Confiança do casamento, de 0 a 1.
 *
 * A similaridade do trigrama (`sim`) sozinha engana: "Bar do Zé" casa com
 * dezenas de "BAR DO ZE LTDA" pelo país. Por isso o CNAE de alimentação e a
 * situação cadastral entram na conta — um restaurante ativo do setor certo é
 * muito mais provável de ser o que o dono quis dizer.
 */
function calcularConfianca(candidato) {
  const sim = typeof candidato?.sim === 'number' ? candidato.sim : 0;
  let score = Math.max(0, Math.min(1, sim));

  if (CNAE_ALIMENTACAO.test(String(candidato?.cnae || ''))) score += 0.25;
  if (String(candidato?.situacao || '').toUpperCase() === 'ATIVA') score += 0.1;
  // Baixa cadastral é sinal forte de que NÃO é o restaurante em operação.
  else if (candidato?.situacao) score -= 0.3;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

/** Só o que o produto usa — o resto do registro da Receita fica de fora. */
function formatarCandidato(c) {
  return {
    cnpj: c.cnpj,
    razao_social: c.razao_social || null,
    nome_fantasia: c.nome_fantasia || null,
    municipio: c.municipio || null,
    uf: c.uf || null,
    bairro: c.bairro || null,
    situacao: c.situacao || null,
    porte: c.porte || null,
    mei: c.mei === true,
    do_setor_de_alimentacao: CNAE_ALIMENTACAO.test(String(c.cnae || '')),
    socios: Array.isArray(c.socios)
      ? c.socios.map((s) => ({ nome: s?.nome || null, qualificacao: s?.qualificacao || null })).filter((s) => s.nome)
      : [],
    confianca: calcularConfianca(c),
  };
}

/**
 * @param {object} supabase cliente com .rpc
 * @param {{nome: string, cidade?: string|null}} restaurante
 * @returns {Promise<{campos: object|null, confianca: number, fonte: string}>}
 */
async function enriquecerComCnpj(supabase, { nome, cidade = null } = {}) {
  const vazio = { campos: null, confianca: 0, fonte: 'receita_federal_local' };
  if (!supabase || !nome || String(nome).trim().length < 3) return vazio;

  // `buscarCnpjLocal` já trata e REGISTRA suas próprias falhas (devolve []
  // tanto para "não achei" quanto para "quebrou" — o rastro fica no log dele,
  // não aqui). Este catch é só rede de segurança para o inesperado; se ele
  // disparar, é bug de contrato, não indisponibilidade do índice.
  let brutos = [];
  try {
    brutos = await buscarCnpjLocal(supabase, nome, cidade, 5);
  } catch (err) {
    logger.error('buscarCnpjLocal lançou — não deveria, ela trata as próprias falhas', {
      nome, cidade, erro: err?.message || String(err),
    });
    return vazio;
  }

  if (!Array.isArray(brutos) || brutos.length === 0) return vazio;

  const candidatos = brutos
    .map(formatarCandidato)
    .sort((a, b) => b.confianca - a.confianca);

  const melhor = candidatos[0];
  return {
    campos: {
      candidatos,
      // Sugerido ≠ escolhido: só vira sugestão com confiança real. Abaixo
      // disso o dono escolhe da lista, sem nada pré-marcado.
      sugerido: melhor.confianca >= 0.5 ? melhor : null,
    },
    confianca: melhor.confianca,
    fonte: 'receita_federal_local',
  };
}

module.exports = { enriquecerComCnpj, calcularConfianca, CNAE_ALIMENTACAO };
