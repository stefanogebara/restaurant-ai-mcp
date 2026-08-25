/**
 * Leitor de frames SSE.
 *
 * Vivia dentro de um `mutationFn`, dentro de uma página de 749 linhas
 * (`ManagerAIChatPage`), e é a peça mais reusável da stack de chat: o
 * onboarding em conversa fala o mesmo protocolo.
 *
 * A parte que parece detalhe e não é: `reader.read()` devolve CHUNKS de bytes,
 * não frames. Um frame pode chegar partido ao meio — inclusive no meio de um
 * caractere multibyte ou no meio do JSON. Por isso duas coisas aqui são
 * obrigatórias e fáceis de errar:
 *
 *  1. `decoder.decode(value, { stream: true })` — sem `stream: true` um "ã"
 *     partido entre dois chunks vira U+FFFD.
 *  2. O último pedaço depois do split fica no buffer para a leitura seguinte.
 *     Sem isso, todo frame que atravessa uma fronteira de chunk é perdido —
 *     e a perda é silenciosa e dependente de timing, que é o pior tipo.
 *
 * Frames malformados são IGNORADOS em vez de derrubar o stream: JSON parcial
 * acontece, e um token perdido é melhor que a conversa inteira caindo. A
 * exceção é o frame `error`, que é sinal do servidor e sobe como exceção.
 */

export interface SseFrame {
  type: string;
  [k: string]: unknown;
}

/**
 * Consome um corpo de resposta SSE e chama `onFrame` para cada frame válido.
 *
 * @throws Error quando chega um frame `{type:'error'}` — é sinal do servidor,
 *   não ruído de transporte.
 */
export async function readSseFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    // O último pode estar incompleto — volta para o buffer.
    buffer = frames.pop() ?? '';

    for (const bruto of frames) {
      const frame = parseFrame(bruto);
      if (!frame) continue;
      if (frame.type === 'error') {
        throw new Error(typeof frame.error === 'string' ? frame.error : 'stream error');
      }
      onFrame(frame);
    }
  }

  // O servidor pode fechar sem o \n\n final. Um frame completo preso no
  // buffer ainda é um frame.
  const resto = parseFrame(buffer);
  if (resto) {
    if (resto.type === 'error') {
      throw new Error(typeof resto.error === 'string' ? resto.error : 'stream error');
    }
    onFrame(resto);
  }
}

function parseFrame(bruto: string): SseFrame | null {
  const linha = bruto.trim();
  if (!linha.startsWith('data:')) return null;
  const payload = linha.slice('data:'.length).trim();
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload);
    // JSON válido que não é objeto com `type` não é um frame deste protocolo.
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') return null;
    return obj as SseFrame;
  } catch {
    // JSON parcial ou lixo. Silêncio de propósito — ver o cabeçalho.
    return null;
  }
}
