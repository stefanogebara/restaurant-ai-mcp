/**
 * OpenAI Realtime backend of the Fly voice server — GA protocol.
 *
 * 24/11/2026: a test call against the live server got no audio. OpenAI closed
 * the socket with `invalid_request_error.beta_api_shape_disabled`: the backend
 * still spoke the beta protocol (OpenAI-Beta header, gpt-4o-realtime-preview,
 * flat session fields, response.audio.delta). It also never used the greeting,
 * so even a working session waited in silence for the caller.
 */

const sockets = [];
jest.mock('ws', () => {
  const { EventEmitter: Emitter } = require('events');
  class FakeSocket extends Emitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.readyState = FakeSocket.OPEN;
      this.sent = [];
      sockets.push(this);
      setImmediate(() => this.emit('open'));
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
  }
  FakeSocket.OPEN = 1;
  return FakeSocket;
});

const OpenAIRealtimeBackend = require('../_voice-server/backends/openai-realtime');

async function connected(config = {}) {
  process.env.OPENAI_API_KEY = 'sk-test';
  const backend = new OpenAIRealtimeBackend();
  await backend.connect({ systemPrompt: 'You are the host.', voice: 'alloy', ...config });
  return { backend, socket: sockets[sockets.length - 1] };
}

beforeEach(() => { sockets.length = 0; });

describe('GA connection', () => {
  it('uses a GA model and no beta header', async () => {
    const { socket } = await connected();
    expect(socket.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime');
    expect(socket.options.headers).toEqual({ Authorization: 'Bearer sk-test' });
  });

  it('sends the GA session shape: type realtime, nested audio formats, voice under output', async () => {
    const { socket } = await connected();
    const update = socket.sent.find((m) => m.type === 'session.update');
    expect(update.session).toMatchObject({
      type: 'realtime',
      output_modalities: ['audio'],
      instructions: 'You are the host.',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          turn_detection: { type: 'server_vad' },
        },
        output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'alloy' },
      },
      tool_choice: 'auto',
    });
    // Beta-only fields must be gone: OpenAI rejects the beta shape outright.
    for (const beta of ['modalities', 'voice', 'input_audio_format', 'output_audio_format', 'input_audio_transcription', 'turn_detection']) {
      expect(update.session).not.toHaveProperty(beta);
    }
    expect(update.session.tools.length).toBeGreaterThan(0);
  });
});

describe('greeting', () => {
  it('speaks the restaurant greeting first, so the caller does not hear silence', async () => {
    const { socket } = await connected({ firstMessage: 'Brasa & Alma, boa noite!' });
    const types = socket.sent.map((m) => m.type);
    expect(types).toEqual(['session.update', 'response.create']);
    const create = socket.sent[1];
    expect(create.response.output_modalities).toEqual(['audio']);
    expect(create.response.instructions).toContain('Brasa & Alma, boa noite!');
  });

  it('sends no response.create when there is no greeting', async () => {
    const { socket } = await connected({ firstMessage: '' });
    expect(socket.sent.map((m) => m.type)).toEqual(['session.update']);
  });
});

describe('GA server events', () => {
  it('forwards response.output_audio.delta as audio', async () => {
    const { backend, socket } = await connected();
    const audio = jest.fn();
    backend.onAudioResponse(audio);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.output_audio.delta', delta: 'AAAA' })));
    expect(audio).toHaveBeenCalledWith('AAAA');
  });

  it('forwards the GA transcript events', async () => {
    const { backend, socket } = await connected();
    const transcript = jest.fn();
    backend.onTranscript(transcript);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'Boa' })));
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Boa noite' })));
    expect(transcript).toHaveBeenCalledWith({ type: 'ai', text: 'Boa', partial: true });
    expect(transcript).toHaveBeenCalledWith({ type: 'ai', text: 'Boa noite', partial: false });
  });
});

describe('end_call tool', () => {
  it('offers end_call, so the AI can hang up after its goodbye', async () => {
    const { socket } = await connected();
    const update = socket.sent.find((m) => m.type === 'session.update');
    expect(update.session.tools.map((t) => t.name)).toContain('end_call');
  });
});
