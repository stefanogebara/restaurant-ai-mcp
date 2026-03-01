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
