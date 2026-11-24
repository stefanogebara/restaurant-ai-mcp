const {
  buildSystemPrompt,
  buildUserPrompt,
  buildFallbackMessage,
  MAX_MESSAGE_LENGTH,
} = require('../_lib/upsell-generator');

describe('upsell-generator', () => {
  describe('buildSystemPrompt', () => {
    it('returns English instructions for en', () => {
      const prompt = buildSystemPrompt('en');
      expect(prompt).toContain('Write in English');
      expect(prompt).toContain('Max 400 characters');
      expect(prompt).toContain('WhatsApp bold');
    });

    it('returns Spanish instructions for es', () => {
      const prompt = buildSystemPrompt('es');
      expect(prompt).toContain('Write in Spanish');
    });

    it('returns Portuguese instructions for pt-BR', () => {
      const prompt = buildSystemPrompt('pt-BR');
      expect(prompt).toContain('Brazilian Portuguese');
    });

    it('defaults to English for unknown lang', () => {
      const prompt = buildSystemPrompt('de');
      expect(prompt).toContain('Write in English');
    });

    it('includes privacy instruction', () => {
      const prompt = buildSystemPrompt('en');
      expect(prompt).toContain('never mention visit counts or spend amounts');
    });
  });

  describe('buildUserPrompt', () => {
    const baseContext = {
      customerName: 'Alice Smith',
      partySize: 4,
      time: '20:00',
      visitCount: 0,
      preferences: null,
      favoriteDishes: null,
      customerTier: null,
      signatureDishes: [],
      menuMemories: [],
      restaurantName: 'Test Bistro',
    };

    it('includes restaurant name and customer name', () => {
      const prompt = buildUserPrompt(baseContext);
      expect(prompt).toContain('Restaurant: Test Bistro');
      expect(prompt).toContain('Guest: Alice Smith');
    });

    it('includes party size and time', () => {
      const prompt = buildUserPrompt(baseContext);
      expect(prompt).toContain('Party size: 4');
      expect(prompt).toContain('Reservation time: 20:00');
    });

    it('shows first-time guest when visitCount is 0', () => {
      const prompt = buildUserPrompt(baseContext);
      expect(prompt).toContain('First-time guest');
    });

    it('shows returning guest with visit count', () => {
      const prompt = buildUserPrompt({ ...baseContext, visitCount: 5 });
      expect(prompt).toContain('Returning guest (5 previous visits)');
    });

    it('includes preferences when provided', () => {
      const prompt = buildUserPrompt({ ...baseContext, preferences: 'vegetarian, no nuts' });
      expect(prompt).toContain('Known preferences: vegetarian, no nuts');
    });

    it('includes favorite dishes when provided', () => {
      const prompt = buildUserPrompt({ ...baseContext, favoriteDishes: ['Risotto', 'Tiramisu'] });
      expect(prompt).toContain('Favorite dishes: Risotto, Tiramisu');
    });

    it('includes customer tier when provided', () => {
      const prompt = buildUserPrompt({ ...baseContext, customerTier: 'vip' });
      expect(prompt).toContain('Customer tier: vip');
    });

    it('includes signature dishes', () => {
      const dishes = [
        { name: 'Grilled Sea Bass', description: 'Fresh daily catch', why_special: 'Chef favorite' },
      ];
      const prompt = buildUserPrompt({ ...baseContext, signatureDishes: dishes });
      expect(prompt).toContain('Signature dishes: Grilled Sea Bass — Fresh daily catch (Chef favorite)');
    });

    it('includes menu memories', () => {
      const memories = [{ content: 'New truffle pasta added this week' }];
      const prompt = buildUserPrompt({ ...baseContext, menuMemories: memories });
      expect(prompt).toContain('Menu notes: New truffle pasta added this week');
    });

    it('handles empty context gracefully', () => {
      const prompt = buildUserPrompt({
        customerName: 'Bob',
        partySize: 2,
        time: '19:00',
        visitCount: 0,
        preferences: null,
        favoriteDishes: null,
        customerTier: null,
        signatureDishes: [],
        menuMemories: [],
        restaurantName: 'Cafe',
      });
      expect(prompt).toContain('Guest: Bob');
      expect(prompt).not.toContain('Known preferences');
      expect(prompt).not.toContain('Favorite dishes');
      expect(prompt).not.toContain('Customer tier');
      expect(prompt).not.toContain('Signature dishes');
      expect(prompt).not.toContain('Menu notes');
    });
  });

  describe('buildFallbackMessage', () => {
    const signatureDishes = [
      { name: 'Grilled Sea Bass', description: 'Fresh daily catch' },
      { name: 'Truffle Risotto', description: 'Black truffle cream' },
      { name: 'Tiramisu', why_special: 'House recipe' },
    ];

    it('returns null when no signature dishes', () => {
      const msg = buildFallbackMessage({
        customerName: 'Alice',
        restaurantName: 'Test',
        signatureDishes: [],
        partySize: 2,
        lang: 'en',
      });
      expect(msg).toBeNull();
    });

    it('returns null when signatureDishes is undefined', () => {
      const msg = buildFallbackMessage({
        customerName: 'Alice',
        restaurantName: 'Test',
        signatureDishes: undefined,
        partySize: 2,
        lang: 'en',
      });
      expect(msg).toBeNull();
    });

    it('generates English message', () => {
      const msg = buildFallbackMessage({
        customerName: 'Alice Smith',
        restaurantName: 'Bella Italia',
        signatureDishes,
        partySize: 2,
        lang: 'en',
      });
      expect(msg).toContain('Hi Alice!');
      expect(msg).toContain('Bella Italia');
      expect(msg).toContain('We look forward to seeing you!');
    });

    it('generates Spanish message', () => {
      const msg = buildFallbackMessage({
        customerName: 'Carlos',
        restaurantName: 'La Cocina',
        signatureDishes,
        partySize: 2,
        lang: 'es',
      });
      expect(msg).toContain('Hola Carlos!');
      expect(msg).toContain('La Cocina');
      expect(msg).toContain('Te esperamos!');
    });

    it('generates Portuguese message', () => {
      const msg = buildFallbackMessage({
        customerName: 'Maria',
        restaurantName: 'Boteco',
        signatureDishes,
        partySize: 2,
        lang: 'pt-BR',
      });
      expect(msg).toContain('Oi Maria!');
      expect(msg).toContain('Boteco');
      expect(msg).toContain('Te esperamos!');
    });

    it('includes large party note for party >= 4', () => {
      const msg = buildFallbackMessage({
        customerName: 'Alice',
        restaurantName: 'Test',
        signatureDishes,
        partySize: 6,
        lang: 'en',
      });
      expect(msg).toContain('sharing plates');
    });

    it('omits large party note for small parties', () => {
      const msg = buildFallbackMessage({
        customerName: 'Alice',
        restaurantName: 'Test',
        signatureDishes,
        partySize: 2,
        lang: 'en',
      });
      expect(msg).not.toContain('sharing plates');
    });

    it('uses generic greeting when no customer name', () => {
      const msg = buildFallbackMessage({
        customerName: '',
        restaurantName: 'Test',
        signatureDishes,
        partySize: 2,
        lang: 'en',
      });
      expect(msg).toContain('Hi!');
    });

    it('picks max 3 dishes', () => {
      const manyDishes = Array.from({ length: 10 }, (_, i) => ({
        name: `Dish ${i}`,
        description: `Desc ${i}`,
      }));
      const msg = buildFallbackMessage({
        customerName: 'Alice',
        restaurantName: 'Test',
        signatureDishes: manyDishes,
        partySize: 2,
        lang: 'en',
      });
      const matches = msg.match(/•/g);
      expect(matches.length).toBeLessThanOrEqual(3);
    });
  });

  describe('MAX_MESSAGE_LENGTH', () => {
    it('is 500', () => {
      expect(MAX_MESSAGE_LENGTH).toBe(500);
    });
  });
});
