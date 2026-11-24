'use strict';

const mockReport = jest.fn(async () => ({ success: true }));
jest.mock('../_services/pdfReportService', () => ({ sendWeeklyReportViaWhatsApp: (...args) => mockReport(...args) }));
jest.mock('../_services/campaignService', () => ({ handleOptOut: jest.fn(async () => true) }));
const mockOwnerLookup = jest.fn(async () => ({ data: {
  manager_phone: '+15550001111', manager_whatsapp_verified: true }, error: null }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: (...args) => mockOwnerLookup(...args) }) }) }),
}) } }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));

const { handleKeyword } = require('../_services/whatsapp/keyword-handler');
const from = '+15550001111';
const session = { restaurant_id: 'restaurant-a', restaurant: { agent_language: 'pt-BR' } };

beforeEach(() => { mockReport.mockClear(); mockOwnerLookup.mockClear();
  mockOwnerLookup.mockResolvedValue({ data: { manager_phone: from, manager_whatsapp_verified: true }, error: null }); });

test('HELP and STOP use the verified adapter sender, not the default Meta account', async () => {
  const sendText = jest.fn(async () => ({ entregue: true }));
  expect(await handleKeyword('HELP', from, session,
    { provider: 'twilio', receiver: '+15550002222', sendText })).toBe(true);
  expect(await handleKeyword('STOP', from, session,
    { provider: 'twilio', receiver: '+15550002222', sendText })).toBe(true);
  expect(sendText).toHaveBeenCalledTimes(2);
  expect(mockReport).not.toHaveBeenCalled();
});

test('PDF report uses the verified Meta receiver and never the default number', async () => {
  const sendText = jest.fn(async () => ({ entregue: true }));
  const beforeReportSend = jest.fn(async () => {});
  expect(await handleKeyword('RELATORIO', from, session,
    { provider: 'meta', receiver: '22222222222', sendText, beforeReportSend })).toBe(true);
  expect(mockReport).toHaveBeenCalledWith('restaurant-a', from, 'pt-BR', undefined,
    { phoneNumberId: '22222222222', beforeSend: beforeReportSend });
  expect(sendText).not.toHaveBeenCalled();
});

test('PDF command on Twilio fails closed with a message on the same account', async () => {
  const sendText = jest.fn(async () => ({ entregue: true }));
  expect(await handleKeyword('RELATORIO', from, session,
    { provider: 'twilio', receiver: '+15550002222', sendText })).toBe(true);
  expect(mockReport).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(expect.stringContaining('não está disponível'), 'keyword');
});

test('PDF preparation failure produces no premature acknowledgement and remains retryable', async () => {
  const beforeReportSend = jest.fn(async () => {});
  const sendText = jest.fn(async () => ({ entregue: true }));
  mockReport.mockRejectedValueOnce(new Error('renderer unavailable'));
  await expect(handleKeyword('RELATORIO', from, session,
    { provider: 'meta', receiver: '22222222222', sendText, beforeReportSend }))
    .rejects.toThrow('renderer unavailable');
  expect(beforeReportSend).not.toHaveBeenCalled();
  expect(sendText).not.toHaveBeenCalled();
});

test('guest cannot obtain the manager PDF from a restaurant-bound chat', async () => {
  mockOwnerLookup.mockResolvedValueOnce({ data: {
    manager_phone: '+15550009999', manager_whatsapp_verified: true }, error: null });
  const sendText = jest.fn(async () => ({ entregue: true }));
  expect(await handleKeyword('RELATORIO', from, session,
    { provider: 'meta', receiver: '22222222222', sendText })).toBe(true);
  expect(mockReport).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(expect.stringContaining('gestor verificado'), 'keyword');
});
