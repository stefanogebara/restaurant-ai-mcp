'use strict';

/**
 * As partes puras da avaliação: ler os blocos ricos da resposta e levantar
 * todo número que o agente tinha à disposição.
 *
 * Vivem separadas do `run.mjs` porque ele exige chaves de API e sai com
 * `process.exit` — e um verificador sem teste é um verificador que dá falso
 * verde, que é exatamente o defeito que esta avaliação existe para caçar.
 */

const CERCA = /```(\w+)\n([\s\S]*?)```/g;

function extrairBlocos(texto) {
  const blocos = { chart: [], mermaid: [], outros: [] };
  let m;
  while ((m = CERCA.exec(texto)) !== null) {
    const [, tipo, corpo] = m;
    if (tipo === 'chart') blocos.chart.push(corpo.trim());
    else if (tipo === 'mermaid') blocos.mermaid.push(corpo.trim());
    else blocos.outros.push(tipo);
  }
  return blocos;
}

/**
 * Todo número que o agente TINHA à disposição.
 *
 * É o gabarito da checagem de ancoragem: valor plotado que não está aqui foi
 * inventado. Varre o snapshot inteiro em vez de campos escolhidos a dedo —
 * escolher a dedo produziria falso positivo no primeiro campo novo.
 */
function numerosDoContexto(obj, saida = new Set(), profundidade = 0) {
  if (profundidade > 8 || obj == null) return saida;
  if (typeof obj === 'number' && Number.isFinite(obj)) { saida.add(obj); return saida; }
  if (typeof obj === 'string') {
    for (const n of obj.match(/\d+(?:[.,]\d+)?/g) || []) {
      const v = Number(n.replace(',', '.'));
      if (Number.isFinite(v)) saida.add(v);
    }
    return saida;
  }
  if (Array.isArray(obj)) { obj.forEach((x) => numerosDoContexto(x, saida, profundidade + 1)); return saida; }
  if (typeof obj === 'object') {
    Object.values(obj).forEach((x) => numerosDoContexto(x, saida, profundidade + 1));
  }
  return saida;
}


module.exports = { extrairBlocos, numerosDoContexto };
