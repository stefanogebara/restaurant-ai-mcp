const mockFrom = jest.fn();
const mockSchema = jest.fn();
const mockSend = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom, schema: mockSchema },
}));
jest.mock('../_lib/whatsapp-sender', () => ({ sendWhatsAppDocumentMessage: mockSend }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const {
  resolveReportRange, generateWeeklyReportHTML, generateWeeklyReportPDF,
  sendWeeklyReportViaWhatsApp,
} = require('../_services/pdfReportService');

function query(data, error = null) {
  const result = { data, error };
  const builder = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GOTENBERG_URL;
  const config = query({ restaurant_name: 'Casa <Nova>', country: 'BR', timezone: 'America/Sao_Paulo' });
  mockSchema.mockReturnValue({ from: () => config });
  mockFrom.mockImplementation(table => {
    if (table === 'reservations') return query([
      { date: '2026-10-12', status: 'confirmed', party_size: 2 },
      { date: '2026-10-12', status: 'no_show', party_size: 4 },
    ]);
    if (table === 'service_records') return query([
      { seated_at: '2026-10-12T14:00:00Z', status: 'completed', party_size: 2, total_bill: 120 },
      { seated_at: '2026-10-12T01:00:00Z', status: 'completed', party_size: 3, total_bill: 300 },
    ]);
    throw new Error(`Unexpected table ${table}`);
  });
});

test('defaults to seven completed days in the restaurant time zone', () => {
  expect(resolveReportRange(undefined, 'America/Sao_Paulo', new Date('2026-10-12T01:00:00Z')))
    .toEqual({ start: '2026-10-04', end: '2026-10-10' });
});

test.each([
  { start_date: '2026-10-12', end_date: undefined },
  { start_date: '2026-02-30', end_date: '2026-03-02' },
  { start_date: '2026-10-13', end_date: '2026-10-12' },
  { start_date: '2026-01-01', end_date: '2026-10-12' },
])('rejects incomplete, impossible, inverted or oversized periods', range => {
  expect(() => resolveReportRange(range, 'UTC')).toThrow(RangeError);
});

test('renders only the chosen local-calendar period, escapes the name, and invents no rating', async () => {
  const html = await generateWeeklyReportHTML('restaurant-1', 'pt-BR', {
    start_date: '2026-10-12', end_date: '2026-10-12',
  });
  expect(html).toContain('Casa &lt;Nova&gt;');
  expect(html).toContain('R$');
  expect(html).toContain('120,00');
  expect(html).toContain('Não compareceram');
  expect(html).not.toContain('300,00');
  expect(html).not.toContain('4.5');
  expect(html).not.toContain('quickchart');
  expect(html).not.toContain('fonts.googleapis');
});

test('fails closed before reading restaurant data when no private PDF renderer is configured', async () => {
  await expect(generateWeeklyReportPDF('restaurant-1')).rejects.toThrow('not configured');
  expect(mockSchema).not.toHaveBeenCalled();
  await expect(sendWeeklyReportViaWhatsApp('restaurant-1', '+5511999000000'))
    .resolves.toMatchObject({ success: false });
  expect(mockSend).not.toHaveBeenCalled();
});

test('does not invent zero revenue when completed services have no recorded bill', async () => {
  mockFrom.mockImplementation(table => table === 'reservations' ? query([]) : query([
    { seated_at: '2026-10-12T14:00:00Z', status: 'completed', party_size: 2, total_bill: null },
  ]));
  const html = await generateWeeklyReportHTML('restaurant-1', 'pt-BR', {
    start_date: '2026-10-12', end_date: '2026-10-12',
  });
  expect(html).toContain('Sem contas registradas');
  expect(html).not.toContain('R$&nbsp;0,00');
});

test('does not mislabel an unsupported country as euros or reais', async () => {
  const config = query({ restaurant_name: 'New House', country: 'MX', timezone: 'UTC' });
  mockSchema.mockReturnValue({ from: () => config });
  const html = await generateWeeklyReportHTML('restaurant-1', 'pt-BR', {
    start_date: '2026-10-12', end_date: '2026-10-12',
  });
  expect(html).toContain('moeda não confirmada');
  expect(html).not.toContain('R$');
});

test('does not infer currency from interface language when restaurant country is missing', async () => {
  mockSchema.mockReturnValue({ from: () => query({ restaurant_name: 'New House', timezone: 'UTC' }) });
  const html = await generateWeeklyReportHTML('restaurant-1', 'pt-BR', {
    start_date: '2026-10-12', end_date: '2026-10-12',
  });
  expect(html).toContain('moeda não confirmada');
  expect(html).not.toContain('R$');
});

test('refuses the public demo renderer even when set explicitly', async () => {
  process.env.GOTENBERG_URL = 'https://demo.gotenberg.dev';
  await expect(generateWeeklyReportPDF('restaurant-1')).rejects.toThrow('not permitted');
  expect(mockSchema).not.toHaveBeenCalled();
});

test('does not turn a failed reservations query into a zero-activity report', async () => {
  mockFrom.mockImplementation(table => table === 'reservations'
    ? query(null, { message: 'DB down' })
    : query([]));
  await expect(generateWeeklyReportHTML('restaurant-1', 'en', {
    start_date: '2026-10-12', end_date: '2026-10-12',
  })).rejects.toThrow('Report data unavailable');
});
