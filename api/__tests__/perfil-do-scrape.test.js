'use strict';

const { montarPerfil } = require('../_lib/perfil-do-scrape');
const { PERSONA_PRESETS } = require('../_lib/vibe-to-persona-preset');

/** Um scrape real, no formato que o banco guarda hoje (Mocotó, 25/ago). */
const SCRAPE = {
  cuisine_type: 'Brazilian',
  price_level: 2,
  editorial_summary: 'Restaurante nordestino contemporâneo, com tema artístico, que serve pratos tradicionais.',
  insights: {
    vibe_tags: ['casual', 'traditional', 'lively', 'family-friendly'],
    praise_themes: ['comida autêntica', 'atendimento atencioso'],
    complaint_themes: ['espera longa nos fins de semana', 'estacionamento difícil'],
    popular_dishes: ['Dadinho de tapioca', 'Caldinho de feijão'],
    ai_voice_notes: 'Clientes valorizam a informalidade.',
  },
  menu: { popular_dishes: ['Dadinho de tapioca', 'Escondidinho'] },
};

describe('montarPerfil — o perfil sai da pesquisa, não de doze perguntas', () => {
  test('preenche as sete seções quando o scrape é completo', () => {
    const { cobertura } = montarPerfil({ scraped_data: SCRAPE, preset: 'neighborhood' });
    expect(cobertura._preenchidas).toBe(7);
    expect(cobertura._total).toBe(7);
  });

  test('o resumo usa o editorial do Google, palavra por palavra', () => {
    const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
    expect(p.persona_summary).toBe(SCRAPE.editorial_summary);
  });

  // A pergunta "o que torna seu restaurante especial?" tem uma resposta mais
  // confiável que a do dono: a dos clientes dele.
  test('os diferenciais são o que os CLIENTES elogiam', () => {
    const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
    expect(p.unique_differentiators).toEqual(['comida autêntica', 'atendimento atencioso']);
  });

  // As queixas recorrentes são exatamente o que a recepcionista precisa saber
  // para não repetir o problema ao telefone.
  test('as queixas viram "o que a IA precisa saber"', () => {
    const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
    expect(p.things_to_know).toContain('estacionamento difícil');
  });

  describe('pratos', () => {
    test('avaliações vêm na frente do cardápio e a fonte fica registrada', () => {
      const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
      expect(p.signature_dishes[0]).toMatchObject({ name: 'Dadinho de tapioca', _fonte: 'avaliações' });
      expect(p.signature_dishes.map((d) => d.name)).toContain('Escondidinho');
    });

    test('o mesmo prato nas duas fontes não duplica', () => {
      const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
      const nomes = p.signature_dishes.map((d) => d.name.toLowerCase());
      expect(new Set(nomes).size).toBe(nomes.length);
    });
  });

  test('a voz escolhida na folha entra como escolha do dono, não como pesquisa', () => {
    const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE, preset: 'fine_dining' });
    expect(p.communication_style._fonte).toBe('escolha do dono');
    expect(p.communication_style.personality_traits).toEqual(PERSONA_PRESETS.fine_dining.personality_traits);
  });

  // ── A regra que mais importa ──────────────────────────────────────────────
  //
  // Um perfil inventado é PIOR que um perfil vazio: a IA o repete para o
  // cliente com convicção. "Nosso prato mais pedido é..." dito com confiança
  // sobre um prato que ninguém pediu é um dano que o silêncio não causaria.
  describe('nunca inventa', () => {
    test('scrape vazio devolve nulls e listas vazias, não prosa plausível', () => {
      const { restaurant_profile: p, cobertura } = montarPerfil({});
      expect(p.persona_summary).toBeNull();
      expect(p.signature_dishes).toEqual([]);
      expect(p.unique_differentiators).toEqual([]);
      expect(p.things_to_know).toEqual([]);
      expect(p.cuisine_identity.primary_cuisine).toBeNull();
      expect(cobertura._preenchidas).toBe(0);
    });

    test('sem preset, communication_style é null — não um tom padrão silencioso', () => {
      const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
      expect(p.communication_style).toBeNull();
    });

    test('sem editorial, o resumo é montado de pedaços VERDADEIROS ou é null', () => {
      const semEditorial = { ...SCRAPE, editorial_summary: undefined };
      const { restaurant_profile: p } = montarPerfil({ scraped_data: semEditorial, restaurant_name: 'Zé' });
      expect(p.persona_summary).toContain('brazilian');
      expect(p.persona_summary).toContain('Zé');

      const nada = montarPerfil({ scraped_data: { insights: {} } });
      expect(nada.restaurant_profile.persona_summary).toBeNull();
    });

    test('campos que a pesquisa não alcança ficam null, e não são chutados', () => {
      const { restaurant_profile: p } = montarPerfil({ scraped_data: SCRAPE });
      expect(p.atmosphere.music).toBeNull();
      expect(p.atmosphere.dress_code).toBeNull();
      expect(p.cuisine_identity.philosophy).toBeNull();
      expect(p.greeting_preview).toBeNull();
    });
  });

  describe('faixa de preço', () => {
    test.each([[0, 'econômico'], [2, 'intermediário'], [4, 'muito caro']])(
      'price_level %i → %s', (n, esperado) => {
        const { restaurant_profile: p } = montarPerfil({ scraped_data: { price_level: n } });
        expect(p.atmosphere.price_range).toBe(esperado);
      });

    test.each([[null], [undefined], [9], ['caro']])('price_level %p vira null', (v) => {
      const { restaurant_profile: p } = montarPerfil({ scraped_data: { price_level: v } });
      expect(p.atmosphere.price_range).toBeNull();
    });
  });

  describe('robustez', () => {
    test.each([[null], [undefined], ['texto'], [42], [[]]])('scraped_data %p não derruba', (v) => {
      expect(() => montarPerfil({ scraped_data: v })).not.toThrow();
    });

    test('insights com formato errado não derruba', () => {
      expect(() => montarPerfil({ scraped_data: { insights: 'nada disso' } })).not.toThrow();
      expect(() => montarPerfil({ scraped_data: { insights: { vibe_tags: 'casual' } } })).not.toThrow();
    });

    test('lista com objetos em vez de strings extrai o nome', () => {
      const { restaurant_profile: p } = montarPerfil({
        scraped_data: { insights: { popular_dishes: [{ name: 'Moqueca' }, { title: 'Vatapá' }] } },
      });
      expect(p.signature_dishes.map((d) => d.name)).toEqual(['Moqueca', 'Vatapá']);
    });

    test('entrada sem argumento nenhum não derruba', () => {
      expect(() => montarPerfil()).not.toThrow();
    });
  });
});
