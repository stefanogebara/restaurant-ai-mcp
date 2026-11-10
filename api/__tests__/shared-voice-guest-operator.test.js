const { BEFORE, AFTER, buildPrompt, buildTool, protectedHash, assertToolMirror, assertCreatedTool } = require('../../scripts/enable-shared-voice-guest-changes.cjs');
const secret = 's'.repeat(40);
const base = () => ({ type: 'webhook', name: 'create_reservation',
  api_schema: { method: 'POST', url: 'https://seatable.one/api/elevenlabs-webhook?action=create_reservation',
    request_headers: { Authorization: `Bearer ${secret}`,
      'x-agent-id': { variable_name: 'system__agent_id' },
      'x-conversation-id': { variable_name: 'system__conversation_id' },
      'x-called-number': { variable_name: 'system__called_number' },
      'x-caller-number': { variable_name: 'system__caller_id' } } } });
test('treats ambiguous mutation failures as uncertain until a fresh verified lookup', () => {
  const prompt = buildPrompt(BEFORE);
  expect(prompt).toContain('can occur after a change committed');
  expect(prompt).toContain('do not blindly retry');
  expect(prompt).toContain('fresh verified lookup');
  expect(prompt).not.toContain('A failed request leaves the original reservation unchanged');
});
test('replaces only the reviewed scope paragraph and retains the booking/language policy', () => {
  const p = 'Keep language detection.\n'+BEFORE+'\nKeep complete booking readback.';
  expect(buildPrompt(p)).toBe('Keep language detection.\n'+AFTER+'\nKeep complete booking readback.');
});
test.each(['unknown prompt', BEFORE+'\n'+BEFORE, AFTER])('refuses an unknown or already modified policy', p => {
  expect(() => buildPrompt(p)).toThrow(/preimage/);
});
test.each(['lookup_reservation', 'modify_reservation', 'cancel_reservation'])('creates a separately scoped %s tool without model-supplied identity', name => {
  const b = base(), t = buildTool(b, name, secret);
  expect(t.api_schema.request_headers).toEqual(b.api_schema.request_headers);
  expect(t.api_schema.url).toBe(`https://seatable.one/api/elevenlabs-webhook?action=${name}`);
  expect(t.api_schema.request_body_schema.required).toEqual(['reservation_id']);
  expect(Object.keys(t.api_schema.request_body_schema.properties)).not.toEqual(expect.arrayContaining(['phone']));
  expect(t.follow_redirects).toBe(false);
  expect(b.name).toBe('create_reservation');
});
test('rejects a guessed caller variable instead of publishing weaker identity', () => {
  const b = base(); b.api_schema.request_headers['x-caller-number'] = { variable_name: 'customer_phone' };
  expect(() => buildTool(b, 'cancel_reservation', secret)).toThrow(/native call header/);
});
test('preserves the existing provider vault reference without exporting or replacing its secret', () => {
  const b = base(); b.api_schema.request_headers.Authorization = { secret_id: 'existing-seatable-vault-reference' };
  const guest = buildTool(b, 'cancel_reservation');
  expect(guest.api_schema.request_headers.Authorization).toEqual({ secret_id: 'existing-seatable-vault-reference' });
  const untrusted = base(); untrusted.api_schema.request_headers.Authorization = { variable_name: 'user_supplied_auth' };
  expect(() => buildTool(untrusted, 'cancel_reservation')).toThrow(/preimage/);
});
test('rejects a different credential and origin', () => {
  expect(() => buildTool(base(), 'cancel_reservation', 'x'.repeat(40))).toThrow(/preimage/);
  const b = base(); b.api_schema.url = 'https://another.example/api/elevenlabs-webhook?action=create_reservation';
  expect(() => buildTool(b, 'cancel_reservation', secret)).toThrow(/preimage/);
});
test('protects voices, model, language, procedures and phone assignment while allowing only prompt/tool IDs to differ', () => {
  const agent = { conversation_config: { asr: { keywords: ['Seatable'] },
    agent: { prompt: { prompt: BEFORE, tool_ids: ['existing'], llm: 'gpt-4.1-mini' } },
    tts: { voice_id: 'owned-voice' } }, procedures: {}, platform_settings: { language: 'pt-br' } };
  const after = structuredClone(agent);after.conversation_config.agent.prompt.prompt=AFTER;after.conversation_config.agent.prompt.tool_ids.push('new');
  expect(protectedHash(agent, ['phone-a'])).toBe(protectedHash(after, ['phone-a']));
  after.conversation_config.agent.prompt.llm='other-model';
  expect(protectedHash(agent, ['phone-a'])).not.toBe(protectedHash(after, ['phone-a']));
  expect(protectedHash(agent, ['phone-a'])).not.toBe(protectedHash(agent, ['phone-b']));
});
test('permits only independently verified custom-tool mirror expansion and still protects system tools', () => {
  const system = { type: 'system', name: 'language_detection', params: { only_at_conversation_start: false } };
  const agent = { conversation_config: { asr: { keywords: [] }, agent: { prompt: {
    prompt: BEFORE, tool_ids: ['old'], tools: [base(), system] } } } };
  const added = buildTool(base(), 'cancel_reservation', secret), after = structuredClone(agent);
  after.conversation_config.agent.prompt.tools.push(added);
  after.conversation_config.agent.prompt.tool_ids.push('new');
  expect(protectedHash(agent, [])).toBe(protectedHash(after, []));
  expect(() => assertToolMirror(after, [{ id: 'old', tool_config: base() }, { id: 'new', tool_config: added }])).not.toThrow();
  expect(() => assertToolMirror(after, [{ id: 'old', tool_config: base() }])).toThrow(/mirror/);
  after.conversation_config.agent.prompt.tools[1].params.only_at_conversation_start = true;
  expect(protectedHash(agent, [])).not.toBe(protectedHash(after, []));
});
test('rejects normalization that replaces guest proof with a system or constant value', () => {
  const expected = buildTool(base(), 'cancel_reservation', secret), actual = structuredClone(expected);
  expect(() => assertCreatedTool(expected, actual)).not.toThrow();
  actual.api_schema.request_body_schema.properties.reservation_id.constant_value = 'some-other-guest';
  expect(() => assertCreatedTool(expected, actual)).toThrow(/authority/);
});
test('requires one-to-one identities when comparing the provider tool mirror', () => {
  const a = base(), b = structuredClone(a); b.name = 'unreviewed_tool';
  b.api_schema.request_headers.Authorization = 'Bearer unreviewed';
  const agent = { conversation_config: { agent: { prompt: { tools: [a, b] } } } };
  expect(() => assertToolMirror(agent, [{ id: 'one', tool_config: a }, { id: 'one', tool_config: a }])).toThrow(/identity/);
  expect(() => assertToolMirror(agent, [{ id: 'one', tool_config: a }, { id: 'two', tool_config: a }])).toThrow(/identity/);
});
test.each(['assignments', 'query_params_schema'])('rejects an unexpected %s in newly created guest tools', key => {
  const expected = buildTool(base(), 'cancel_reservation', secret), actual = structuredClone(expected);
  if (key === 'assignments') actual.assignments = [{ source: 'response', target: 'system__caller_id' }];
  else actual.api_schema.query_params_schema = { type: 'object', properties: { phone: { type: 'string' } } };
  expect(() => assertCreatedTool(expected, actual)).toThrow(/configuration/);
});
test('accepts only known empty schema defaults supplied by the provider', () => {
  const expected = buildTool(base(), 'cancel_reservation', secret), actual = structuredClone(expected);
  Object.assign(actual.api_schema.request_body_schema, { dynamic_variable: '', is_omitted: false });
  Object.assign(actual.api_schema.request_body_schema.properties.reservation_id, {
    dynamic_variable: '', is_omitted: false, enum: null, is_system_provided: false,
    allowed_values: null, allowed_values_dynamic_variable: '', constant_value: '',
  });
  expect(() => assertCreatedTool(expected, actual)).not.toThrow();
  actual.api_schema.request_body_schema.properties.reservation_id.allowed_values_dynamic_variable = 'another_guest';
  expect(() => assertCreatedTool(expected, actual)).toThrow(/configuration/);
});
