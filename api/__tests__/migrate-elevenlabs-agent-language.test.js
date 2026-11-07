const {
  assertProject, assertWorkspace, inspect, migrate, parseArgs,
} = require('../../scripts/migrate-elevenlabs-agent-language.cjs');

const row = (overrides = {}) => ({
  id: 'restaurant-1', is_active: true, is_demo: false,
  restaurant_name: 'Sample Resto', elevenlabs_agent_id: 'agent-1',
  agent_language: 'pt', ai_config: {
    language: 'pt-PT', greeting_message: 'Obrigado por ligar para Sample Resto! Como posso ajudá-lo hoje?',
  }, agent_greeting: null,
  ...overrides,
});
const agent = (language = 'en', firstMessage = 'Thank you for calling Sample Resto. How may I help you today?') => ({
  conversation_config: { agent: { language, first_message: firstMessage } },
  version_id: 'old-version',
});

test('requires the exact Seatable project, workspace and a fresh apply journal', () => {
  expect(() => assertProject('inner', 'https://ckforlwdhewexyqljsaf.supabase.co')).toThrow();
  expect(() => assertWorkspace('seatable-workspace', 'inner-workspace')).toThrow();
  expect(() => parseArgs(['--apply', '--project-ref', 'ckforlwdhewexyqljsaf'])).toThrow('--manifest');
});

test.each([
  ['pt', 'pt-PT', 'Obrigado por ligar para Sample Resto! Como posso ajudá-lo hoje?'],
  ['it', 'it-IT', 'Grazie per aver chiamato Sample Resto! Come posso aiutarla oggi?'],
  ['es', 'es-ES', '¡Gracias por llamar a Sample Resto! ¿Cómo puedo ayudarle hoy?'],
])('recognizes exact default English greeting for %s and proposes its native default', (language, locale, greeting) => {
  expect(inspect(row({ agent_language: language, ai_config: { language: locale, greeting_message: greeting } }), agent()))
    .toMatchObject({ status: 'ready', targetLanguage: language, targetGreeting: greeting });
});

test('skips owner customizations and ambiguous language evidence', () => {
  expect(inspect(row({ agent_greeting: 'Minha saudação' }), agent()).reason).toBe('custom_greeting');
  expect(inspect(row({ ai_config: { language: 'en-US' } }), agent()).reason).toBe('config_language_mismatch');
  expect(inspect(row({ ai_config: { language: 'pt-PT', greeting_message: 'Olá, personalizado' } }), agent()).reason).toBe('custom_config_greeting');
  expect(inspect(row(), agent('es')).reason).toBe('provider_not_english');
  expect(inspect(row(), agent('en', 'A customized hello')).reason).toBe('nondefault_first_message');
  expect(inspect(row({ is_demo: true }), agent()).reason).toBe('ineligible_row');
});

test('a canary patches only language and first message, then verifies provider readback', async () => {
  let current = agent();
  const api = {
    getAgent: jest.fn(async () => current),
    patchAgent: jest.fn(async (_id, updates) => {
      current = {
        conversation_config: { agent: { ...current.conversation_config.agent, ...updates } },
        version_id: 'new-version',
      };
    }),
  };
  const db = { getRow: jest.fn(async () => row()) };
  const journal = jest.fn();
  const result = await migrate({ items: [{ row: row(), agent: agent(), ...inspect(row(), agent()) }], api, db, journal });

  expect(result).toEqual([{ agentId: 'agent-1', status: 'verified' }]);
  expect(api.patchAgent).toHaveBeenCalledWith('agent-1', {
    language: 'pt', first_message: 'Obrigado por ligar para Sample Resto! Como posso ajudá-lo hoje?',
  });
  expect(journal.mock.calls.map(([entry]) => entry.state)).toEqual(['patch_intent', 'patch_returned', 'verified']);
});

test('refuses a changed agent before patching and records no write', async () => {
  const api = { getAgent: jest.fn(async () => agent('es')), patchAgent: jest.fn() };
  const db = { getRow: jest.fn(async () => row()) };
  const journal = jest.fn();
  await expect(migrate({ items: [{ row: row(), agent: agent(), ...inspect(row(), agent()) }], api, db, journal }))
    .rejects.toThrow('changed after inventory');
  expect(api.patchAgent).not.toHaveBeenCalled();
  expect(journal).not.toHaveBeenCalled();
});

test('records a recoverable failure when provider patch fails', async () => {
  const api = {
    getAgent: jest.fn(async () => agent()),
    patchAgent: jest.fn(async () => { throw new Error('provider unavailable'); }),
  };
  const db = { getRow: jest.fn(async () => row()) };
  const journal = jest.fn();
  await expect(migrate({ items: [{ row: row(), agent: agent(), ...inspect(row(), agent()) }], api, db, journal }))
    .rejects.toThrow('rollback journal');
  expect(journal.mock.calls.map(([entry]) => entry.state)).toEqual(['patch_intent', 'failed']);
  expect(journal.mock.calls[0][0]).toMatchObject({
    old_language: 'en', new_language: 'pt',
    old_first_message: 'Thank you for calling Sample Resto. How may I help you today?',
  });
});
