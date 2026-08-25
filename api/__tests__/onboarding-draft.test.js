'use strict';

const { validarPatch, PROIBIDOS_CONHECIDOS } = require('../_lib/onboarding-draft');

describe('validarPatch — o portão de escrita do onboarding em conversa', () => {
  // ── Fronteira de segurança ────────────────────────────────────────────────
  //
  // Estes são os testes que importam. O agente de onboarding vai digerir texto
  // RASPADO da web — site, cardápio, avaliações — e o autor daquele texto não é
  // o dono do restaurante. Uma instrução plantada numa página que convença o
  // modelo a chamar gravar({ user_id }) tem que morrer aqui.
  describe('allowlist', () => {
    test.each(Object.keys(PROIBIDOS_CONHECIDOS))('barra "%s"', (campo) => {
      const r = validarPatch({ [campo]: 'qualquer coisa' });
      expect(r.ok).toBe(false);
      expect(r.patch).toEqual({});
      expect(r.barrados).toContain(campo);
    });

    test('campo desconhecido não chega ao banco — evita erro de PGRST no meio da conversa', () => {
      const r = validarPatch({ coluna_que_nao_existe: 1 });
      expect(r.ok).toBe(false);
      expect(r.patch).toEqual({});
      expect(r.erros[0]).toMatch(/não é um campo/);
    });

    // A allowlist é positiva justamente para isto: coluna nova no schema nasce
    // barrada, e liberá-la é decisão explícita de alguém.
    test('o campo bom passa e o proibido é barrado no MESMO patch', () => {
      const r = validarPatch({ city: 'São Paulo', is_demo: false });
      expect(r.patch).toEqual({ city: 'São Paulo' });
      expect(r.barrados).toEqual(['is_demo']);
      expect(r.ok).toBe(false);
    });

    test('a mensagem de um proibido conhecido diz o PORQUÊ, para o modelo não insistir', () => {
      const r = validarPatch({ user_id: 'abc' });
      expect(r.erros[0]).toMatch(/dono da conta/);
    });
  });

  // ── Enum do Postgres ──────────────────────────────────────────────────────
  describe('restaurant_type', () => {
    test('coage texto da vida real para o enum — gravar fora dele é erro de TIPO', () => {
      expect(validarPatch({ restaurant_type: 'Pizzaria Italiana' }).patch.restaurant_type).toBe('italian');
      expect(validarPatch({ restaurant_type: 'Sushi Bar' }).patch.restaurant_type).toBe('japanese');
      expect(validarPatch({ restaurant_type: 'Boteco do Zé' }).patch.restaurant_type).toBe('bar');
      // O vocabulário era 100% inglês num produto brasileiro: "Pizzaria"
      // sozinho não casava com regra nenhuma e caía em casual_dining.
      expect(validarPatch({ restaurant_type: 'Pizzaria' }).patch.restaurant_type).toBe('italian');
      expect(validarPatch({ restaurant_type: 'Churrascaria Gaúcha' }).patch.restaurant_type).toBe('steakhouse');
      expect(validarPatch({ restaurant_type: 'Padaria e Confeitaria' }).patch.restaurant_type).toBe('cafe');
      expect(validarPatch({ restaurant_type: 'Lanchonete' }).patch.restaurant_type).toBe('fast_casual');
      expect(validarPatch({ restaurant_type: 'algo que ninguém previu' }).patch.restaurant_type).toBe('casual_dining');
    });

    test('valor já legal atravessa intacto', () => {
      expect(validarPatch({ restaurant_type: 'fine_dining' }).patch.restaurant_type).toBe('fine_dining');
    });

    test('vazio é erro, não "other" silencioso', () => {
      expect(validarPatch({ restaurant_type: '' }).ok).toBe(false);
    });
  });

  // ── E-mail ────────────────────────────────────────────────────────────────
  describe('email', () => {
    test('normaliza para minúsculas', () => {
      expect(validarPatch({ email: '  Dono@Casa.COM ' }).patch.email).toBe('dono@casa.com');
    });

    test('recusa o que não parece e-mail', () => {
      expect(validarPatch({ email: 'dono arroba casa' }).ok).toBe(false);
    });

    // O demo grava um placeholder @demo.seatable.one só para satisfazer o NOT
    // NULL. Deixá-lo atravessar para a conta real é um dono sem e-mail de
    // contato: sem confirmação de reserva, sem recuperação de conta.
    test('recusa o placeholder do demo e diz o que pedir', () => {
      const r = validarPatch({ email: 'mocoto@demo.seatable.one' });
      expect(r.ok).toBe(false);
      expect(r.erros[0]).toMatch(/e-mail real do dono/);
    });
  });

  // ── Horários: os dois formatos que circulam no repo ───────────────────────
  describe('business_hours', () => {
    test('formato canônico atravessa', () => {
      const r = validarPatch({ business_hours: {
        monday: { is_open: true, open_time: '12:00', close_time: '23:00' },
      } });
      expect(r.ok).toBe(true);
      expect(r.patch.business_hours.monday).toEqual({ is_open: true, open_time: '12:00', close_time: '23:00' });
    });

    // O formato abreviado já custou meses de prefill silenciosamente ignorado
    // (achado da G4: o mapper lia .open/.close, campos que não existiam).
    test('formato abreviado open/close é convertido para o canônico', () => {
      const r = validarPatch({ business_hours: { friday: { open: '19:00', close: '01:00' } } });
      expect(r.ok).toBe(true);
      expect(r.patch.business_hours.friday).toEqual({ is_open: true, open_time: '19:00', close_time: '01:00' });
    });

    test('horário presente sem is_open significa ABERTO — scraping não escreve "estou aberto"', () => {
      const r = validarPatch({ business_hours: { tuesday: { open_time: '12:00', close_time: '15:00' } } });
      expect(r.patch.business_hours.tuesday.is_open).toBe(true);
    });

    test('null vira dia fechado, com horas legais para o NOT NULL', () => {
      const r = validarPatch({ business_hours: { monday: null } });
      expect(r.patch.business_hours.monday).toEqual({ is_open: false, open_time: '00:00', close_time: '00:00' });
    });

    test('hora fora do formato 24h vira erro em prosa, não linha quebrada', () => {
      const r = validarPatch({ business_hours: { monday: { open_time: '7pm', close_time: '11pm' } } });
      expect(r.ok).toBe(false);
      expect(r.erros[0]).toMatch(/HH:MM/);
    });

    test('"segunda" não é chave válida — o banco quer os dias em inglês', () => {
      const r = validarPatch({ business_hours: { segunda: { open_time: '12:00', close_time: '23:00' } } });
      expect(r.ok).toBe(false);
      expect(r.erros[0]).toMatch(/dia da semana/);
    });

    test('array não é objeto de dias', () => {
      expect(validarPatch({ business_hours: [] }).ok).toBe(false);
    });
  });

  // ── Fuso ──────────────────────────────────────────────────────────────────
  describe('timezone', () => {
    test('aceita IANA de verdade', () => {
      expect(validarPatch({ timezone: 'America/Sao_Paulo' }).patch.timezone).toBe('America/Sao_Paulo');
    });

    test('recusa fuso inventado em vez de deixar o banco aceitar lixo', () => {
      const r = validarPatch({ timezone: 'Brasil/SP' });
      expect(r.ok).toBe(false);
      expect(r.erros[0]).toMatch(/America\/Sao_Paulo/);
    });
  });

  // ── Campos NOT NULL sem default ───────────────────────────────────────────
  describe('texto obrigatório', () => {
    test('só espaço é vazio', () => {
      expect(validarPatch({ city: '   ' }).ok).toBe(false);
    });

    test('espaço interno é colapsado', () => {
      expect(validarPatch({ restaurant_name: '  Bar   do   Zé ' }).patch.restaurant_name).toBe('Bar do Zé');
    });

    test('número não passa por texto', () => {
      expect(validarPatch({ city: 42 }).ok).toBe(false);
    });
  });

  describe('phone', () => {
    test('guarda a forma que o dono reconhece', () => {
      expect(validarPatch({ phone: '(11) 98765-4321' }).patch.phone).toBe('(11) 98765-4321');
    });
    test('dígitos de menos é erro', () => {
      expect(validarPatch({ phone: '123' }).ok).toBe(false);
    });
  });

  describe('average_dining_duration_minutes', () => {
    test('aceita inteiro plausível', () => {
      expect(validarPatch({ average_dining_duration_minutes: 90 }).patch.average_dining_duration_minutes).toBe(90);
    });
    test.each([[0], [5], [1000], [90.5], ['noventa']])('recusa %p', (v) => {
      expect(validarPatch({ average_dining_duration_minutes: v }).ok).toBe(false);
    });
  });

  describe('website', () => {
    test('exige esquema — "casa.com.br" sem http quebra quem for buscar', () => {
      expect(validarPatch({ website: 'casa.com.br' }).ok).toBe(false);
      expect(validarPatch({ website: 'https://casa.com.br' }).patch.website).toBe('https://casa.com.br');
    });
    test('string vazia limpa o campo (é nullable)', () => {
      expect(validarPatch({ website: '' }).patch.website).toBeNull();
    });
  });

  // ── Forma da resposta ─────────────────────────────────────────────────────
  describe('contrato', () => {
    test('patch inteiro válido devolve ok', () => {
      const r = validarPatch({ city: 'Roma', country: 'IT', restaurant_type: 'Trattoria' });
      expect(r.ok).toBe(true);
      expect(r.erros).toEqual([]);
      expect(r.patch).toEqual({ city: 'Roma', country: 'IT', restaurant_type: 'italian' });
    });

    // O modelo precisa saber o que NÃO gravou. Um patch parcial silencioso faz
    // ele seguir a conversa achando que já tem o dado.
    test('patch parcial reporta os erros junto com o que passou', () => {
      const r = validarPatch({ city: 'Lisboa', email: 'nao-e-email' });
      expect(r.patch).toEqual({ city: 'Lisboa' });
      expect(r.ok).toBe(false);
      expect(r.erros).toHaveLength(1);
    });

    test.each([[null], [undefined], ['texto'], [[]], [42]])('entrada %p não derruba', (v) => {
      const r = validarPatch(v);
      expect(r.ok).toBe(false);
      expect(r.patch).toEqual({});
    });
  });
});
