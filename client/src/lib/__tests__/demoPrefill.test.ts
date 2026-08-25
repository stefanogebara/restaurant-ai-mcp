/**
 * mapDemoSessionToOnboarding — cada achado da auditoria de 24/ago virou
 * asserção. Antes isto morava dentro de um componente de ~700 linhas e não
 * tinha teste nenhum: os bugs abaixo passaram meses em produção.
 */
import { describe, it, expect } from 'vitest';
import { mapDemoSessionToOnboarding, converterHorarios } from '../demoPrefill';

const vazio = {};

describe('país (o beco do Passo 1)', () => {
  it('deriva country_code do ISO que o demo grava, e o nome legível junto', () => {
    const { updates } = mapDemoSessionToOnboarding({ country: 'BR' }, vazio);
    expect(updates.country_code).toBe('BR');
    expect(updates.country).toBe('Brazil');
  });

  it("'Unknown' não vira país", () => {
    const { updates } = mapDemoSessionToOnboarding({ country: 'Unknown' }, vazio);
    expect(updates.country).toBeUndefined();
    expect(updates.country_code).toBeUndefined();
  });

  it('país já escolhido pelo dono não é sobrescrito', () => {
    const { updates } = mapDemoSessionToOnboarding({ country: 'BR' }, { country_code: 'PT' });
    expect(updates.country_code).toBeUndefined();
  });
});

describe('e-mail placeholder do demo', () => {
  it('<slug>@demo.seatable.one NUNCA vira contato do restaurante', () => {
    const { updates } = mapDemoSessionToOnboarding({ email: 'demo-a1b2c3d4@demo.seatable.one' }, vazio);
    expect(updates.email).toBeUndefined();
  });

  it('e-mail de verdade passa', () => {
    const { updates } = mapDemoSessionToOnboarding({ email: 'dono@mocoto.com.br' }, vazio);
    expect(updates.email).toBe('dono@mocoto.com.br');
  });
});

describe('tipo de restaurante (três vocabulários)', () => {
  it('enum do demo vira tile slug — não mais "other" no banco', () => {
    expect(mapDemoSessionToOnboarding({ restaurant_type: 'casual_dining' }, vazio).updates.restaurant_type)
      .toBe('casual-dining');
  });

  it('texto livre do Google no scraped_data também é normalizado', () => {
    const { updates } = mapDemoSessionToOnboarding(
      { scraped_data: { cuisine_type: 'Japanese restaurant' } }, vazio,
    );
    expect(updates.restaurant_type).toBe('japanese');
  });
});

describe('horários (o bug silencioso)', () => {
  it('lê open_time/close_time — o mapper antigo lia .open/.close e tudo caía nos defaults', () => {
    const h = converterHorarios({ Monday: { open_time: '18:00', close_time: '23:30', is_open: true } });
    const seg = h.find((d) => d.day === 'Monday')!;
    expect(seg.open_time).toBe('18:00');
    expect(seg.close_time).toBe('23:30');
  });

  it('respeita is_open:false e a string "Closed"', () => {
    const h = converterHorarios({ Monday: { is_open: false }, Tuesday: 'Closed' });
    expect(h.find((d) => d.day === 'Monday')!.is_open).toBe(false);
    expect(h.find((d) => d.day === 'Tuesday')!.is_open).toBe(false);
  });

  it('aceita o formato string "12:00-23:00" e devolve os 7 dias', () => {
    const h = converterHorarios({ friday: '12:00-23:30' });
    expect(h).toHaveLength(7);
    expect(h.find((d) => d.day === 'Friday')!.close_time).toBe('23:30');
  });
});

describe('nunca vence o que já existe (as duas corridas da auditoria)', () => {
  it('rascunho retomado / digitação em curso permanecem intactos', () => {
    const prev = { restaurant_name: 'Nome do dono', city: 'Santos', phone_number: '+55 13 90000-0000' };
    const { updates } = mapDemoSessionToOnboarding(
      { restaurant_name: 'Nome do demo', city: 'São Paulo', phone: '+55 11 91111-1111' }, prev,
    );
    expect(updates.restaurant_name).toBeUndefined();
    expect(updates.city).toBeUndefined();
    expect(updates.phone_number).toBeUndefined();
  });
});

describe('banner honesto', () => {
  it('só o nome (convert do caminho "restaurante novo") NÃO é substancial', () => {
    expect(mapDemoSessionToOnboarding({ restaurant_name: 'Zebrallina' }, vazio).substancial).toBe(false);
  });

  it('demo com cidade, país e horários é substancial', () => {
    const r = { restaurant_name: 'Mocotó', city: 'São Paulo', country: 'BR',
      business_hours: { Monday: { open_time: '12:00', close_time: '22:00', is_open: true } } };
    expect(mapDemoSessionToOnboarding(r, vazio).substancial).toBe(true);
  });
});
