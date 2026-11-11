'use strict';

// Testes do ROTEIRO das ligações reais, não da confirmação por tecla em si.
// O roteiro faz ligações pagas: ele precisa recusar configuração ruim antes de
// tocar em qualquer provedor, e o código ditado precisa bater com o recibo.

const fs = require('node:fs');
const path = require('node:path');
const {
  parseConfig, parseCases, receiptFor, SETUP_SQL,
} = require('../../scripts/sandbox-keypad-call-test.cjs');

const root = path.resolve(__dirname, '../..');
const env = {
  TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
  TWILIO_AUTH_TOKEN: 'token-de-teste',
  ELEVENLABS_API_KEY: 'chave-de-teste',
  KEYPAD_ORIGIN: 'https://exemplo.trycloudflare.com',
  KEYPAD_CALLER: '+5511999990000',
  KEYPAD_PG_SOCKET: '/tmp/kp',
  KEYPAD_PG_PORT: '58952',
};

describe('parseConfig', () => {
  test('aceita a configuração completa', () => {
    const config = parseConfig(env);
    expect(config).toMatchObject({
      accountSid: env.TWILIO_ACCOUNT_SID,
      origin: env.KEYPAD_ORIGIN,
      caller: env.KEYPAD_CALLER,
      pgSocket: '/tmp/kp',
      pgPort: '58952',
      pgUser: 'keypad',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test.each([
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'ELEVENLABS_API_KEY',
    'KEYPAD_ORIGIN', 'KEYPAD_CALLER', 'KEYPAD_PG_SOCKET', 'KEYPAD_PG_PORT',
  ])('recusa sem %s', name => {
    const { [name]: _removed, ...rest } = env;
    expect(() => parseConfig(rest)).toThrow(name);
  });

  test.each([
    ['KEYPAD_ORIGIN', 'http://exemplo.trycloudflare.com'],
    ['KEYPAD_ORIGIN', 'https://exemplo.trycloudflare.com/caminho'],
    ['KEYPAD_CALLER', '11999990000'],
    ['KEYPAD_PG_PORT', '58952; rm -rf /'],
    ['TWILIO_ACCOUNT_SID', 'ACcurto'],
    ['TWILIO_AUTH_TOKEN', '[Sensitive]'],
  ])('recusa %s inválido', (name, value) => {
    expect(() => parseConfig({ ...env, [name]: value })).toThrow(name);
  });

  test('a mensagem de erro nunca mostra o segredo', () => {
    const secret = '[Sensitive]';
    let message = '';
    try { parseConfig({ ...env, TWILIO_AUTH_TOKEN: secret }); } catch (error) { message = error.message; }
    expect(message).toContain('TWILIO_AUTH_TOKEN');
    expect(message).not.toContain(secret);
  });
});

describe('parseCases', () => {
  test('sem argumentos roda os três cenários', () => {
    expect(parseCases([])).toEqual(['confirm', 'refuse', 'hangup']);
  });

  test('aceita um subconjunto na ordem pedida', () => {
    expect(parseCases(['hangup', 'confirm'])).toEqual(['hangup', 'confirm']);
  });

  test.each([[['cancel']], [['confirm', 'confirm']]])('recusa %j', args => {
    expect(() => parseCases(args)).toThrow();
  });
});

describe('receiptFor', () => {
  const DIGITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const digitsOf = text => text.split(/[^a-zçê]+/u).filter(w => DIGITS.includes(w)).map(w => DIGITS.indexOf(w)).join('');

  test.each([7, 8, 9])('o código ditado para %i bate com o recibo', last => {
    const { code, spoken } = receiptFor(last);
    expect(code).toMatch(/^RES-\d{8}-\d{12}$/);
    expect(code.endsWith(String(last))).toBe(true);
    expect(digitsOf(spoken)).toBe(code.replace(/\D/g, ''));
    expect(spoken).toContain('erre de rato, e de escola, esse de sapo');
  });

  test('recusa um dígito final inválido', () => {
    expect(() => receiptFor(10)).toThrow();
  });
});

describe('SETUP_SQL', () => {
  test('cada arquivo do banco local existe, na ordem de aplicação', () => {
    expect(SETUP_SQL[0]).toMatch(/schema\.sql$/);
    expect(SETUP_SQL.at(-1)).toMatch(/sandbox_keypad_reservation_actions\.sql$/);
    for (const file of SETUP_SQL) expect(fs.existsSync(path.join(root, file))).toBe(true);
  });
});
