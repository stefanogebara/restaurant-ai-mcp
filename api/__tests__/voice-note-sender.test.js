/**
 * Tests for voice-note-sender.js and voice-note-trigger.js
 *
 * Covers:
 * - Successful TTS → Storage → WhatsApp flow
 * - TTS API failure handling
 * - Storage upload failure handling
 * - Text truncation at 500 chars
 * - Missing parameter validation
 * - Template rendering in voice-note-trigger
 */

// ============================================================
// Mocks
// ============================================================

const mockUpload = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockSendWhatsAppAudioMessage = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: jest.fn(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  },
}));

jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppAudioMessage: mockSendWhatsAppAudioMessage,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { sendVoiceNote } = require('../services/whatsapp/voice-note-sender');
const { sendConfirmationVoiceNote, sendReminderVoiceNote } = require('../services/whatsapp/voice-note-trigger');

// ============================================================
// Setup
// ============================================================

const VALID_PARAMS = {
  text: 'Hello, your reservation is confirmed!',
  restaurantId: 'rest-123',
  customerPhone: '+5511999999999',
  voiceId: 'voice-abc',
  language: 'en',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = 'test-api-key';
});

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
});

// ============================================================
// sendVoiceNote — core sender
// ============================================================

describe('sendVoiceNote', () => {
  it('should return success with messageId on full successful flow', async () => {
    // TTS returns audio buffer
    const fakeAudioBuffer = new ArrayBuffer(1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeAudioBuffer),
    });

    // Storage upload succeeds
    mockUpload.mockResolvedValueOnce({ error: null });

    // Signed URL succeeds
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://storage.example.com/signed/audio.mp3' },
      error: null,
    });

    // WhatsApp send succeeds
    mockSendWhatsAppAudioMessage.mockResolvedValueOnce({
      success: true,
      messageId: 'wamid.123',
    });

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result).toEqual({ success: true, messageId: 'wamid.123' });

    // Verify TTS was called correctly
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [ttsUrl, ttsOpts] = mockFetch.mock.calls[0];
    expect(ttsUrl).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-abc');
    const ttsBody = JSON.parse(ttsOpts.body);
    expect(ttsBody.model_id).toBe('eleven_flash_v2_5');
    expect(ttsBody.text).toBe(VALID_PARAMS.text);

    // Verify storage upload
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [storagePath, buffer, opts] = mockUpload.mock.calls[0];
    expect(storagePath).toMatch(/^rest-123\/\d+\.mp3$/);
    expect(opts.contentType).toBe('audio/mpeg');

    // Verify WhatsApp audio send
    expect(mockSendWhatsAppAudioMessage).toHaveBeenCalledWith(
      '+5511999999999',
      'https://storage.example.com/signed/audio.mp3'
    );
  });

  it('should return error when TTS API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('TTS failed');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockSendWhatsAppAudioMessage).not.toHaveBeenCalled();
  });

  it('should return error when storage upload fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });

    mockUpload.mockResolvedValueOnce({
      error: { message: 'Bucket not found' },
    });

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Storage upload failed');
    expect(mockSendWhatsAppAudioMessage).not.toHaveBeenCalled();
  });

  it('should return error when signed URL generation fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    mockUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'URL generation failed' },
    });

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Signed URL failed');
    expect(mockSendWhatsAppAudioMessage).not.toHaveBeenCalled();
  });

  it('should truncate text at 500 characters', async () => {
    const longText = 'A'.repeat(600);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    mockUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://example.com/audio.mp3' },
      error: null,
    });
    mockSendWhatsAppAudioMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.456' });

    await sendVoiceNote({ ...VALID_PARAMS, text: longText });

    const ttsBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(ttsBody.text.length).toBe(500);
    expect(ttsBody.text.endsWith('...')).toBe(true);
  });

  it('should return error when required params are missing', async () => {
    const result1 = await sendVoiceNote({ ...VALID_PARAMS, text: '' });
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Missing required parameters');

    const result2 = await sendVoiceNote({ ...VALID_PARAMS, restaurantId: '' });
    expect(result2.success).toBe(false);

    const result3 = await sendVoiceNote({ ...VALID_PARAMS, customerPhone: '' });
    expect(result3.success).toBe(false);

    const result4 = await sendVoiceNote({ ...VALID_PARAMS, voiceId: '' });
    expect(result4.success).toBe(false);
  });

  it('should return error when ELEVENLABS_API_KEY is missing', async () => {
    delete process.env.ELEVENLABS_API_KEY;

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toContain('API key not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should handle fetch throwing an exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await sendVoiceNote(VALID_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});

// ============================================================
// sendConfirmationVoiceNote — trigger helper
// ============================================================

describe('sendConfirmationVoiceNote', () => {
  it('should render confirmation template and call sendVoiceNote', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    mockUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://example.com/audio.mp3' },
      error: null,
    });
    mockSendWhatsAppAudioMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.789' });

    const result = await sendConfirmationVoiceNote({
      restaurantId: 'rest-abc',
      customerPhone: '+5511999999999',
      customerName: 'Maria',
      partySize: 4,
      date: '2026-03-25',
      time: '19:00',
      restaurantName: 'Cantina Bella Vista',
      voiceId: 'voice-xyz',
      language: 'pt-BR',
    });

    expect(result.success).toBe(true);

    // Verify template was rendered in Portuguese
    const ttsBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(ttsBody.text).toContain('Maria');
    expect(ttsBody.text).toContain('Cantina Bella Vista');
    expect(ttsBody.text).toContain('4');
  });

  it('should use default voice ID when none provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    mockUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://example.com/audio.mp3' },
      error: null,
    });
    mockSendWhatsAppAudioMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.def' });

    await sendConfirmationVoiceNote({
      restaurantId: 'rest-abc',
      customerPhone: '+5511999999999',
      customerName: 'John',
      partySize: 2,
      date: '2026-03-25',
      time: '20:00',
      restaurantName: 'Test Restaurant',
      // voiceId omitted — should use default
    });

    const ttsUrl = mockFetch.mock.calls[0][0];
    // Should use the default Rachel voice ID
    expect(ttsUrl).toContain('EXAVITQu4vr4xnSDxMaL');
  });
});

// ============================================================
// sendReminderVoiceNote — trigger helper
// ============================================================

describe('sendReminderVoiceNote', () => {
  it('should render reminder template and call sendVoiceNote', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    mockUpload.mockResolvedValueOnce({ error: null });
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://example.com/audio.mp3' },
      error: null,
    });
    mockSendWhatsAppAudioMessage.mockResolvedValueOnce({ success: true, messageId: 'wamid.rem' });

    const result = await sendReminderVoiceNote({
      restaurantId: 'rest-abc',
      customerPhone: '+5511999999999',
      customerName: 'Carlos',
      time: '7:00 PM',
      restaurantName: 'Cantina Bella Vista',
      voiceId: 'voice-xyz',
      language: 'es',
    });

    expect(result.success).toBe(true);

    const ttsBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(ttsBody.text).toContain('Carlos');
    expect(ttsBody.text).toContain('Cantina Bella Vista');
    expect(ttsBody.text).toContain('7:00 PM');
  });
});
