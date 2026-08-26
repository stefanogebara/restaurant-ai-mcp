/**
 * Rebaixa a linha de base da catraca depois de você corrigir desvios.
 *   cd client && npx vite-node src/test/atualizaDivida.mts
 *
 * Só rode DEPOIS de corrigir — este script não perdoa dívida, ele registra o
 * que sobrou. Se rodar sem corrigir nada, o arquivo fica idêntico.
 */
import { writeFileSync } from 'fs';
import { medirDesvios, totalPorDesvio } from './paletaQuente.guard';

const m = medirDesvios();
const ordenado = Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/test/paletaQuente.divida.json', JSON.stringify(ordenado, null, 2) + '\n');
console.log(`${Object.keys(m).length} arquivos · ${JSON.stringify(totalPorDesvio(m))}`);
