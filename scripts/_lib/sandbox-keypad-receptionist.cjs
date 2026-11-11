'use strict';

const TOOL_NAME = 'prepare_keypad_reservation';
const GRANT_VARIABLE = 'secret__keypad_grant';
const GRANT_HEADER = 'x-keypad-grant';

const instructions = [
  'Você é a recepcionista do sandbox Seatable. Responda em português.',
  'Você pode preparar a remarcação para outro horário no mesmo dia.',
  'Assim que o cliente pedir o novo horário e informar seu código completo, chame ' + TOOL_NAME + ', sem pedir confirmação por voz.',
  'O código começa com as letras R E S, seguido de hífen, oito dígitos, hífen e doze caracteres.',
  'O cliente pode ditar as três letras do prefixo com palavras de apoio, por exemplo erre de rato, e de escola, esse de sapo.',
  'Quando todos os dígitos são ditados no trecho numérico, junte os grupos na ordem em que foram ditados, sem espaços ou pontuação inserida pela transcrição.',
  'Nunca invente caracteres, peça para repetir se incompleto.',
  'Se indisponível, diga que não foi possível verificar a reserva.',
  'A ferramenta encaminha para uma leitura automática que pede a tecla. Não diga que a reserva já mudou.',
].join(' ');

function buildKeypadTool(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Invalid sandbox origin');
  return {
    type: 'webhook',
    name: TOOL_NAME,
    description: 'Inicie a confirmação segura por teclado para remarcar o horário. Não altera a reserva.',
    api_schema: {
      url: new URL('/tool', origin).href,
      method: 'POST',
      content_type: 'application/json',
      request_headers: { [GRANT_HEADER]: { variable_name: GRANT_VARIABLE } },
      request_body_schema: {
        type: 'object',
        properties: {
          reservation_id: {
            type: 'string',
            description: 'Código completo do recibo exatamente como informado. Transcreva todos os dígitos na ordem falada. ' +
              'Quando a transcrição agrupou dígitos ditados com pontuação extra, mantenha os dígitos e use os dois separadores do código. ' +
              'Exija oito dígitos no meio e doze caracteres no final. Nunca invente caracteres.',
          },
          new_time: { type: 'string', description: 'Novo horário local de 24 horas em HH:mm.' },
        },
        required: ['reservation_id', 'new_time'],
      },
    },
  };
}

module.exports = { buildKeypadTool, instructions, TOOL_NAME, GRANT_HEADER, GRANT_VARIABLE };
