// Must use var for hoisting over jest.mock
var mockSendWhatsApp = jest.fn().mockResolvedValue({ success: true });
var mockSendWhatsAppAudio = jest.fn().mockResolvedValue({ success: true });
var mockCallsCreate = jest.fn().mockResolvedValue({ sid: 'CA123' });
var mockStorageFrom = jest.fn();
var mockElevenLabsFetch = jest.fn();

jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...a) => mockSendWhatsApp(...a),
  sendWhatsAppAudioMessage: (...a) => mockSendWhatsAppAudio(...a),
}));

jest.mock('twilio', () =>
  jest.fn().mockImplementation(() => ({
    calls: { create: (...a) => mockCallsCreate(...a) },
  }))
);

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    storage: { from: (...a) => mockStorageFrom(...a) },
  },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

// Intercept global fetch for ElevenLabs
global.fetch = mockElevenLabsFetch;

const { sendBriefing } = require('../_lib/briefing-sender');

beforeEach(() => {
  jest.clearAllMocks();
});

it('text channel calls sendWhatsAppMessage', async () => {
  await sendBriefing('+15551234567', 'Good morning!', 'text', 'rest-1');
  expect(mockSendWhatsApp).toHaveBeenCalledWith('+15551234567', 'Good morning!');
  expect(mockSendWhatsAppAudio).not.toHaveBeenCalled();
  expect(mockCallsCreate).not.toHaveBeenCalled();
});

it('phone_call channel calls twilio calls.create with TwiML', async () => {
  await sendBriefing('+15551234567', 'Here is your briefing.', 'phone_call', 'rest-1');
  expect(mockCallsCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: '+15551234567',
      twiml: expect.stringContaining('Here is your briefing.'),
    })
  );
  expect(mockSendWhatsApp).not.toHaveBeenCalled();
});

it('voice_note channel calls ElevenLabs, uploads to storage, sends audio', async () => {
  const fakeBuffer = Buffer.from('fake-mp3');
  mockElevenLabsFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(fakeBuffer.buffer),
  });

  const storageChain = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/audio.mp3' }, error: null }),
  };
  mockStorageFrom.mockReturnValue(storageChain);

  await sendBriefing('+15551234567', 'Your briefing text.', 'voice_note', 'rest-1');

  expect(mockElevenLabsFetch).toHaveBeenCalledWith(
    expect.stringContaining('elevenlabs.io'),
    expect.any(Object)
  );
  expect(storageChain.upload).toHaveBeenCalledWith(
    'rest-1-briefing.mp3',
    expect.any(Buffer),
    expect.objectContaining({ contentType: 'audio/mpeg', upsert: true })
  );
  expect(storageChain.createSignedUrl).toHaveBeenCalledWith('rest-1-briefing.mp3', 3600);
  expect(mockSendWhatsAppAudio).toHaveBeenCalledWith('+15551234567', 'https://signed.url/audio.mp3');
});

it('defaults to text channel when channel is unknown', async () => {
  await sendBriefing('+15551234567', 'Hello!', 'unknown_channel', 'rest-1');
  expect(mockSendWhatsApp).toHaveBeenCalledWith('+15551234567', 'Hello!');
});

// ---------------------------------------------------------------------------
// Phase Q channel-fallback contract.
//
// voice_note and phone_call have several failure modes the plain-text path
// can't have (ElevenLabs down, Supabase Storage upload reject, Twilio call
// rejection, signed URL minted past TTL). Without fallback the manager got
// NOTHING — not even a degraded text version of the briefing they were
// waiting for. The hardened sendBriefing wraps the channel-specific code
// in try/catch and falls back to plain WhatsApp text on any failure.
// ---------------------------------------------------------------------------
describe('channel fallback to text when delivery fails', () => {
  beforeEach(() => {
    mockSendWhatsApp.mockClear();
    mockSendWhatsAppAudio.mockClear();
    mockCallsCreate.mockClear();
    mockStorageFrom.mockReset();
    mockElevenLabsFetch.mockReset();
  });

  it('falls back to text when ElevenLabs TTS returns non-OK', async () => {
    mockElevenLabsFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    await sendBriefing('+15551234567', 'Daily briefing.', 'voice_note', 'rest-1');
    expect(mockSendWhatsAppAudio).not.toHaveBeenCalled();
    expect(mockSendWhatsApp).toHaveBeenCalledWith('+15551234567', 'Daily briefing.');
  });

  it('falls back to text when Supabase Storage upload rejects', async () => {
    mockElevenLabsFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    });
    mockStorageFrom.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: { message: 'bucket quota exceeded' } }),
      createSignedUrl: jest.fn(),
    });
    await sendBriefing('+15551234567', 'Daily briefing.', 'voice_note', 'rest-1');
    expect(mockSendWhatsAppAudio).not.toHaveBeenCalled();
    expect(mockSendWhatsApp).toHaveBeenCalledWith('+15551234567', 'Daily briefing.');
  });

  it('falls back to text when Twilio phone_call throws', async () => {
    mockCallsCreate.mockRejectedValueOnce(new Error('Twilio: account suspended'));
    await sendBriefing('+15551234567', 'Daily briefing.', 'phone_call', 'rest-1');
    expect(mockSendWhatsApp).toHaveBeenCalledWith('+15551234567', 'Daily briefing.');
  });

  it('does NOT fallback if the text channel itself fails (no infinite loop)', async () => {
    // Sanity: text-channel rejections must surface — we shouldn't catch &
    // re-text our way into an infinite retry. The 'text' branch
    // short-circuits at the top of sendBriefing, before the try/catch.
    mockSendWhatsApp.mockRejectedValueOnce(new Error('Meta API rate-limited'));
    await expect(sendBriefing('+15551234567', 'Daily briefing.', 'text', 'rest-1'))
      .rejects.toThrow(/rate-limited/);
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
  });
});
