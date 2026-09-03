'use strict';

/**
 * Todo `.select()` sobre uma tabela conhecida pede colunas que EXISTEM.
 *
 * Este teste é o irmão da auditoria `audit:phantom-columns`, e existe porque a
 * auditoria só roda em CI: quem edita um select localmente descobre o erro
 * quatro minutos depois, no pipeline, e não em dois segundos, no jest.
 *
 * O caso que motivou os dois: `elevenlabs-agent-create.js` pedia SETE colunas
 * inexistentes de `restaurant_config` — address, avg_dining_duration_minutes,
 * language, cancellation_policy, special_notes, advance_booking_days,
 * buffer_time. Em PostgREST UMA coluna ruim derruba o select inteiro, e o
 * chamador nem desestruturava o `error`. O prompt "hiper-personalizado" do
 * agente de voz caía SEMPRE no fallback básico — o comentário dizia "se ainda
 * não houver config", quando na verdade era sempre.
 */

const { execFileSync } = require('child_process');
const path = require('path');

describe('os selects batem com o schema real', () => {
  test('nenhuma coluna fantasma NOVA em api/', () => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'audit-phantom-columns.js');
    let saida = '';
    let codigo = 0;
    try {
      saida = execFileSync('node', [script], { encoding: 'utf8' });
    } catch (e) {
      codigo = e.status;
      saida = (e.stdout || '') + (e.stderr || '');
    }
    // A mensagem da auditoria já diz qual arquivo e qual coluna.
    expect(`${codigo}\n${saida}`).toMatch(/^0\n/);
  });
});
