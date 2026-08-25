import { describe, test, expect, vi } from 'vitest';
import { readSseFrames, type SseFrame } from '../sseStream';

/** Monta um ReadableStream a partir de pedaços de texto — os pedaços são os
 *  CHUNKS que o navegador entrega, e a divisão entre eles é o ponto do teste. */
function stream(...pedacos: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= pedacos.length) return void c.close();
      c.enqueue(enc.encode(pedacos[i++]));
    },
  });
}

const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

async function coletar(...pedacos: string[]): Promise<SseFrame[]> {
  const out: SseFrame[] = [];
  await readSseFrames(stream(...pedacos), (f) => out.push(f));
  return out;
}

describe('readSseFrames', () => {
  test('lê frames inteiros num único chunk', async () => {
    const frames = await coletar(frame({ type: 'start' }) + frame({ type: 'token', text: 'oi' }));
    expect(frames.map((f) => f.type)).toEqual(['start', 'token']);
    expect(frames[1].text).toBe('oi');
  });

  // O ponto principal do módulo. `reader.read()` devolve chunks de bytes, não
  // frames — um frame partido entre dois chunks era perdido em silêncio, e a
  // perda dependia de timing de rede.
  test('frame partido ao meio entre dois chunks é remontado', async () => {
    const inteiro = frame({ type: 'token', text: 'reserva confirmada' });
    const corte = Math.floor(inteiro.length / 2);
    const frames = await coletar(inteiro.slice(0, corte), inteiro.slice(corte));
    expect(frames).toHaveLength(1);
    expect(frames[0].text).toBe('reserva confirmada');
  });

  test('frame partido em TRÊS pedaços também', async () => {
    const i = frame({ type: 'phase', key: 'lendo_contexto' });
    const frames = await coletar(i.slice(0, 5), i.slice(5, 12), i.slice(12));
    expect(frames[0].key).toBe('lendo_contexto');
  });

  test('a fronteira do chunk caindo exatamente no \\n\\n não duplica nem perde', async () => {
    const a = frame({ type: 'token', text: 'a' });
    const b = frame({ type: 'token', text: 'b' });
    const frames = await coletar(a, b);
    expect(frames.map((f) => f.text)).toEqual(['a', 'b']);
  });

  // Sem `stream: true` no decoder, um caractere multibyte partido entre chunks
  // vira U+FFFD — e o português é cheio deles.
  test('caractere multibyte partido entre chunks não vira �', async () => {
    const bytes = new TextEncoder().encode(frame({ type: 'token', text: 'reservação' }));
    const corte = bytes.indexOf(0xc3); // primeiro byte do "ç"
    expect(corte).toBeGreaterThan(0);
    const out: SseFrame[] = [];
    await readSseFrames(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, corte + 1)); // corta NO MEIO do "ç"
          c.enqueue(bytes.slice(corte + 1));
          c.close();
        },
      }),
      (f) => out.push(f),
    );
    expect(out[0].text).toBe('reservação');
  });

  test('frame sem \\n\\n final ainda é entregue — servidor pode fechar seco', async () => {
    const frames = await coletar('data: {"type":"done"}');
    expect(frames.map((f) => f.type)).toEqual(['done']);
  });

  // Um token perdido é melhor que a conversa inteira caindo.
  test('JSON malformado é ignorado sem derrubar o stream', async () => {
    const frames = await coletar('data: {isso não é json}\n\n' + frame({ type: 'token', text: 'segue' }));
    expect(frames).toHaveLength(1);
    expect(frames[0].text).toBe('segue');
  });

  test('linha que não começa com data: é ignorada (comentário/keep-alive do SSE)', async () => {
    const frames = await coletar(': keep-alive\n\n' + frame({ type: 'token', text: 'x' }));
    expect(frames.map((f) => f.type)).toEqual(['token']);
  });

  test('JSON válido sem `type` não é frame deste protocolo', async () => {
    expect(await coletar('data: {"foo":1}\n\n')).toEqual([]);
  });

  test('data: vazio é ignorado', async () => {
    expect(await coletar('data:\n\n')).toEqual([]);
  });

  // Frame `error` é sinal do SERVIDOR, não ruído de transporte — sobe.
  test('frame error lança com a mensagem do servidor', async () => {
    await expect(
      readSseFrames(stream(frame({ type: 'error', error: 'quota_exceeded' })), () => {}),
    ).rejects.toThrow('quota_exceeded');
  });

  test('frame error sem mensagem ainda lança', async () => {
    await expect(
      readSseFrames(stream(frame({ type: 'error' })), () => {}),
    ).rejects.toThrow(/stream error/);
  });

  test('o que veio ANTES do error é entregue antes de lançar', async () => {
    const vistos: SseFrame[] = [];
    await expect(
      readSseFrames(
        stream(frame({ type: 'token', text: 'meio' }) + frame({ type: 'error', error: 'caiu' })),
        (f) => vistos.push(f),
      ),
    ).rejects.toThrow('caiu');
    expect(vistos.map((f) => f.text)).toEqual(['meio']);
  });

  test('stream vazio não chama o callback nem lança', async () => {
    const cb = vi.fn();
    await readSseFrames(stream(), cb);
    expect(cb).not.toHaveBeenCalled();
  });

  test('sequência realista start → phase → tokens → done', async () => {
    const frames = await coletar(
      frame({ type: 'start' }),
      frame({ type: 'phase', key: 'lendo_contexto' }),
      frame({ type: 'token', text: 'Você ' }) + frame({ type: 'token', text: 'tem ' }),
      frame({ type: 'token', text: '4 reservas.' }) + frame({ type: 'done' }),
    );
    expect(frames.map((f) => f.type)).toEqual(['start', 'phase', 'token', 'token', 'token', 'done']);
    expect(frames.filter((f) => f.type === 'token').map((f) => f.text).join(''))
      .toBe('Você tem 4 reservas.');
  });
});
