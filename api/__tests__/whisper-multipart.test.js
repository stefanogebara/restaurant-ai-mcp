'use strict';

/**
 * O áudio precisa CHEGAR na OpenAI.
 *
 * Até 27/09/2026 o corpo enviado ao Whisper era a string "[object FormData]"
 * (pacote `form-data` + fetch nativo) e todo áudio voltava 400. Este teste
 * serializa a requisição de verdade (Request.text()) — conferir só que o fetch
 * "foi chamado" passaria com o bug.
 */

describe('transcribeVoiceMessage envia multipart de verdade', () => {
  const envAntes = { ...process.env };
  const fetchAntes = global.fetch;
  afterEach(() => { process.env = { ...envAntes }; global.fetch = fetchAntes; jest.resetModules(); });

  test('o corpo leva o arquivo e o modelo', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    process.env.WHATSAPP_ACCESS_TOKEN = 't';
    let corpoWhisper = null;
    let tipoWhisper = null;
    global.fetch = async (url, opts = {}) => {
      if (String(url).includes('api.openai.com')) {
        const req = new Request(url, { method: 'POST', headers: opts.headers, body: opts.body });
        tipoWhisper = req.headers.get('content-type');
        corpoWhisper = await req.text();
        return new Response(JSON.stringify({ text: 'o que é o racha?' }), { status: 200 });
      }
      if (String(url).includes('lookaside')) return new Response(Buffer.from('OggS-fake-audio'), { status: 200 });
      return new Response(JSON.stringify({ url: 'https://lookaside.example/a', mime_type: 'audio/ogg; codecs=opus', file_size: 15 }), { status: 200 });
    };
    const { transcribeVoiceMessage } = require('../_lib/whatsapp-interactions');
    const texto = await transcribeVoiceMessage('MEDIA1');

    expect(texto).toBe('o que é o racha?');
    expect(corpoWhisper).not.toBe('[object FormData]');
    expect(tipoWhisper).toMatch(/^multipart\/form-data; boundary=/);
    expect(corpoWhisper).toContain('filename="voice.ogg"');
    expect(corpoWhisper).toContain('OggS-fake-audio');
    expect(corpoWhisper).toContain('whisper-1');
  });
});
