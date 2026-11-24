'use strict';

/**
 * Teto de mídia — o caminho que não tinha limite nenhum.
 *
 * Antes: `downloadMedia` baixava qualquer coisa, sem teto de tamanho e sem
 * prazo. Um número hostil mandando 200 áudios de 10 minutos gerava, por
 * mensagem, um download de até 16 MB dentro de um Lambda de 512 MB mais uma
 * chamada ao Whisper (≈US$0,06 por áudio de 10 min). E como a transcrição
 * acontece antes do dedup, cada reentrega da Meta re-transcrevia e pagava
 * de novo.
 *
 * A economia de verdade está em recusar pelo `file_size` dos METADADOS, antes
 * de gastar banda.
 */

process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-teste';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const {
  downloadMedia, MidiaGrandeDemais, MAX_MEDIA_BYTES, MAX_AUDIO_BYTES,
} = require('../_lib/whatsapp-interactions');

/** Encadeia respostas de fetch: 1ª = metadados, 2ª = arquivo. */
function fetchFalso({ fileSize, bytesReais, mimeType = 'audio/ogg' }) {
  return jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://lookaside.fb/x', mime_type: mimeType, file_size: fileSize }),
    })
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array(bytesReais == null ? 0 : bytesReais).buffer,
    });
}

describe('recusa pelo tamanho declarado — sem gastar banda', () => {
  test('áudio acima do teto é recusado ANTES do download', async () => {
    const f = fetchFalso({ fileSize: MAX_AUDIO_BYTES + 1, bytesReais: 10 });
    global.fetch = f;

    await expect(downloadMedia('m1', { maxBytes: MAX_AUDIO_BYTES }))
      .rejects.toThrow(MidiaGrandeDemais);

    // Só a chamada de metadados aconteceu — o arquivo nunca foi baixado.
    expect(f).toHaveBeenCalledTimes(1);
  });

  test('o erro carrega os números, pra virar mensagem útil e log útil', async () => {
    global.fetch = fetchFalso({ fileSize: 5_000_000, bytesReais: 10 });
    try {
      await downloadMedia('m1', { maxBytes: MAX_AUDIO_BYTES });
      throw new Error('devia ter recusado');
    } catch (err) {
      expect(err.name).toBe('MidiaGrandeDemais');
      expect(err.bytes).toBe(5_000_000);
      expect(err.teto).toBe(MAX_AUDIO_BYTES);
    }
  });

  test('dentro do teto passa normalmente', async () => {
    global.fetch = fetchFalso({ fileSize: 50_000, bytesReais: 50_000 });
    const r = await downloadMedia('m1', { maxBytes: MAX_AUDIO_BYTES });
    expect(r.size).toBe(50_000);
    expect(r.mimeType).toBe('audio/ogg');
  });
});

describe('cinto e suspensório — a Meta nem sempre declara o tamanho', () => {
  test('sem file_size, o teto ainda vale depois do download', async () => {
    global.fetch = fetchFalso({ fileSize: undefined, bytesReais: MAX_AUDIO_BYTES + 1000 });
    await expect(downloadMedia('m1', { maxBytes: MAX_AUDIO_BYTES }))
      .rejects.toThrow(MidiaGrandeDemais);
  });

  test('file_size subestimado não fura o teto', async () => {
    // Declara pequeno, entrega grande. Sem a segunda checagem o teto seria
    // apenas uma sugestão.
    global.fetch = fetchFalso({ fileSize: 1000, bytesReais: MAX_AUDIO_BYTES + 1 });
    await expect(downloadMedia('m1', { maxBytes: MAX_AUDIO_BYTES }))
      .rejects.toThrow(MidiaGrandeDemais);
  });
});

describe('teto padrão', () => {
  test('sem opção explícita usa o teto geral, mais folgado que o de áudio', async () => {
    expect(MAX_MEDIA_BYTES).toBeGreaterThan(MAX_AUDIO_BYTES);
    global.fetch = fetchFalso({ fileSize: MAX_MEDIA_BYTES + 1, bytesReais: 10 });
    await expect(downloadMedia('m1')).rejects.toThrow(MidiaGrandeDemais);
  });
});

describe('prazo', () => {
  test('metadados pendurados não seguram a função pra sempre', async () => {
    // O AbortController tem que interromper; sem ele o download pendurado
    // consome o maxDuration inteiro e a mensagem do cliente morre por timeout.
    global.fetch = jest.fn((url, opcoes) => new Promise((_res, rej) => {
      opcoes.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));
    await expect(downloadMedia('m1')).rejects.toThrow(/abort/i);
  }, 15000);
});
