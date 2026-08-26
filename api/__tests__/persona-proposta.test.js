'use strict';

const { proporPersona, AMOSTRAS, ORDEM_PADRAO } = require('../_lib/persona-proposta');
const { PERSONA_PRESETS } = require('../_lib/vibe-to-persona-preset');

describe('proporPersona — a voz vira escolha, não redação', () => {
  test('devolve as quatro vozes, sempre', () => {
    const r = proporPersona({ vibe_tags: ['upscale'] });
    expect(r.cartoes).toHaveLength(4);
    expect(r.cartoes.map((c) => c.preset).sort()).toEqual([...ORDEM_PADRAO].sort());
  });

  test('a sugerida vem primeiro e marcada', () => {
    const r = proporPersona({ vibe_tags: ['romantic', 'upscale', 'quiet'] });
    expect(r.sugerido).toBe('fine_dining');
    expect(r.cartoes[0].preset).toBe('fine_dining');
    expect(r.cartoes[0].sugerido).toBe(true);
    expect(r.cartoes.filter((c) => c.sugerido)).toHaveLength(1);
  });

  // Sem tag não há base para sugerir. Marcar uma mesmo assim faria o dono
  // aceitar por inércia uma voz que ninguém escolheu.
  test('sem tag nenhuma NÃO sugere — as quatro em pé de igualdade', () => {
    for (const entrada of [{}, { vibe_tags: [] }, { vibe_tags: null }, { vibe_tags: ['inexistente'] }]) {
      const r = proporPersona(entrada);
      expect(r.sugerido).toBeNull();
      expect(r.motivo).toBeNull();
      expect(r.cartoes.every((c) => !c.sugerido)).toBe(true);
      expect(r.cartoes).toHaveLength(4);
    }
  });

  describe('o motivo', () => {
    // Mesmo contrato dos cards de fase do Manager AI: nunca inventar a etapa.
    test('cita as tags que REALMENTE pesaram naquele preset', () => {
      const r = proporPersona({ vibe_tags: ['romantic', 'upscale', 'quiet'], lang: 'pt' });
      expect(r.motivo).toContain('romântico');
      expect(r.motivo).toContain('sofisticado');
      expect(r.motivo).toContain('tranquilo');
    });

    test('NÃO cita tag que não pontuou no preset escolhido', () => {
      // 'bustling' pesa fast_efficient, não fine_dining. Ela não pode aparecer
      // como justificativa de uma escolha que ela não ajudou a fazer.
      const r = proporPersona({ vibe_tags: ['upscale', 'quiet', 'bustling'], lang: 'pt' });
      expect(r.sugerido).toBe('fine_dining');
      expect(r.motivo).not.toContain('movimentado');
      expect(r.motivo).not.toContain('bustling');
    });

    // As tags chegam do Google em inglês; a frase é do dono.
    test('traduz as tags em vez de cuspir o inglês cru', () => {
      expect(proporPersona({ vibe_tags: ['romantic'], lang: 'pt' }).motivo).not.toMatch(/romantic\b/);
      expect(proporPersona({ vibe_tags: ['family-friendly'], lang: 'es' }).motivo).toContain('para familias');
    });

    test('tag desconhecida que pontua aparece crua, não some', () => {
      // Melhor mostrar algo estranho que apagar a razão da escolha.
      const r = proporPersona({ vibe_tags: ['upscale'], lang: 'pt' });
      expect(r.motivo).toBeTruthy();
    });
  });

  describe('os cartões', () => {
    // Comparar só é justo se a pergunta for a mesma nas quatro.
    test('todas respondem à MESMA fala do cliente', () => {
      const r = proporPersona({ vibe_tags: ['casual'], lang: 'pt' });
      const perguntas = new Set(r.cartoes.map((c) => c.pergunta));
      expect(perguntas.size).toBe(1);
    });

    // O dono não sabe julgar `humor_type: 'warm'`. Ele sabe reconhecer a casa
    // dele quando ouve — então cada cartão precisa trazer a fala pronta.
    test('cada cartão traz uma resposta concreta, não um adjetivo', () => {
      for (const c of proporPersona({ lang: 'pt' }).cartoes) {
        expect(c.resposta.length).toBeGreaterThan(40);
        expect(c.rotulo).toBeTruthy();
        expect(c.resumo).toBeTruthy();
      }
    });

    test('as quatro respostas são DIFERENTES entre si — senão a escolha é falsa', () => {
      const respostas = proporPersona({ lang: 'pt' }).cartoes.map((c) => c.resposta);
      expect(new Set(respostas).size).toBe(4);
    });

    // A escolha tem que virar o objeto que o resto do sistema já consome
    // (elevenlabs-kb-sync, ai-personality).
    test('cada cartão carrega a personalidade real do preset', () => {
      for (const c of proporPersona({}).cartoes) {
        expect(c.personalidade).toEqual(PERSONA_PRESETS[c.preset]);
      }
    });
  });

  describe('idiomas', () => {
    test.each(['pt', 'es', 'en'])('%s traz a fala e as respostas naquele idioma', (lang) => {
      const r = proporPersona({ vibe_tags: ['casual'], lang });
      for (const c of r.cartoes) {
        expect(c.resposta).toBe(AMOSTRAS[c.preset].resposta[lang]);
        expect(c.rotulo).toBe(AMOSTRAS[c.preset].rotulo[lang]);
      }
    });

    test('idioma desconhecido cai em pt, o mercado principal', () => {
      const r = proporPersona({ vibe_tags: ['casual'], lang: 'de' });
      expect(r.cartoes[0].resposta).toBe(AMOSTRAS[r.cartoes[0].preset].resposta.pt);
    });

    test('aceita pt-BR, não só pt', () => {
      const r = proporPersona({ vibe_tags: ['casual'], lang: 'pt-BR' });
      expect(r.cartoes[0].resposta).toBe(AMOSTRAS[r.cartoes[0].preset].resposta.pt);
    });

    // Todas as quatro em todos os três idiomas — um buraco aqui vira card mudo.
    test('nenhuma amostra tem furo de tradução', () => {
      for (const [preset, a] of Object.entries(AMOSTRAS)) {
        for (const lang of ['pt', 'es', 'en']) {
          expect(`${preset}.rotulo.${lang}=${a.rotulo[lang] || ''}`).not.toMatch(/=$/);
          expect(`${preset}.resumo.${lang}=${a.resumo[lang] || ''}`).not.toMatch(/=$/);
          expect(`${preset}.resposta.${lang}=${a.resposta[lang] || ''}`).not.toMatch(/=$/);
        }
      }
    });
  });

  test.each([[null], [undefined], ['texto'], [42]])('entrada %p não derruba', (v) => {
    expect(() => proporPersona(v)).not.toThrow();
  });
});
