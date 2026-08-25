import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'glob';
import { resolve } from 'path';

/**
 * As telas de reserva e de onboarding foram as últimas a passar pela reforma
 * Liquid Glass v2, e eram justamente as que mais tinham acumulado desvio:
 * um painel inteiro na paleta cinza-fria do Tailwind, um passo de depósito em
 * violeta no meio de um sistema todo quente, e "Confirmada" pintada de rose
 * (burgundy disfarçado) num sistema onde burgundy é AÇÃO, nunca estado.
 *
 * Cada asserção aqui corresponde a um desvio que existiu de verdade. Elas
 * falham no instante em que alguém reintroduz o mesmo.
 */

const ROOT = resolve(__dirname, '../../..');

const SURFACE = [
  ...globSync('components/booking/*.tsx', { cwd: ROOT }),
  ...globSync('components/onboarding/*.tsx', { cwd: ROOT }),
  'pages/BookingPage.tsx',
  'pages/BookingConfirmation.tsx',
  'pages/Onboarding.tsx',
];

function read(file: string) {
  return readFileSync(resolve(ROOT, file), 'utf-8');
}

/** Remove comentários — só o que renderiza conta (setas em prosa são livres). */
function code(file: string) {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('reserva + onboarding seguem a paleta quente', () => {
  it.each(SURFACE)('%s não usa cinza-frio nem cor fria', (file) => {
    const src = code(file);
    // #111827 / #6B7280 / #9CA3AF / #E5E7EB são os cinzas do Tailwind, todos
    // azulados. Os tokens quentes equivalentes são deep-charcoal, stone-gray,
    // muted-stone e glass-border-dark.
    expect(src).not.toMatch(/#(111827|6B7280|9CA3AF|E5E7EB)/i);
    expect(src).not.toMatch(/\b(bg|text|border)-(violet|indigo|blue|sky|cyan|slate|gray|zinc)-\d{2,3}\b/);
  });

  it.each(SURFACE)('%s não escreve burgundy à mão', (file) => {
    // Existiram três burgundies: #9F1239 (token), #831a3a e #8B1A4A (à mão).
    // Fora do próprio token, a cor vem de bg-burgundy / burgundy-dark.
    expect(code(file)).not.toMatch(/#(831a3a|8B1A4A|881337)/i);
  });

  it.each(SURFACE)('%s não pede bold no serif', (file) => {
    // Instrument Serif só tem peso 400 e o index.css bloqueia font-synthesis,
    // então font-bold aqui nunca renderizou — só mentia sobre a intenção.
    const serifBold = code(file).match(/font-serif[^"'`]*font-bold|font-bold[^"'`]*font-serif/g);
    expect(serifBold).toBeNull();
  });

  it.each(SURFACE)('%s usa ícone de traço, não emoji', (file) => {
    // Única exceção deliberada: a marca d'água de 120px por tipo de cozinha
    // no card do restaurante. Ali o emoji é ILUSTRAÇÃO a 13% de opacidade,
    // não um ícone carregando significado de UI — e o card só cai nele quando
    // o dono não subiu foto de capa. A exceção é nomeada para que qualquer
    // emoji NOVO continue quebrando este teste.
    const src = code(file).replace(/const cuisineEmoji:[\s\S]*?\};/, '');
    const emoji = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu);
    expect(emoji ?? []).toEqual([]);
  });

  it('rotula seções com o token único do v2', () => {
    // O rótulo uppercase tinha duas grafias (tracking-wider vs 0.14em) e duas
    // cores (warm-stone vs muted-stone) na mesma tela.
    for (const file of SURFACE) {
      const src = code(file);
      const labels = src.match(/[^"'`]*uppercase[^"'`]*/g) ?? [];
      for (const label of labels) {
        if (!/tracking-/.test(label)) continue;
        expect(label).toContain('tracking-[0.14em]');
      }
    }
  });

  it('pinta "confirmada" com cor de estado, não com a cor de ação', () => {
    const src = read('pages/BookingConfirmation.tsx');
    const at = src.indexOf("t('reservations.confirmed')");
    const badge = src.slice(at - 400, at + 100);
    expect(badge).toMatch(/emerald/);
    expect(badge).not.toMatch(/rose-|bg-burgundy\b/);
  });

  it('mantém o Stripe Elements no burgundy do sistema', () => {
    expect(read('components/booking/DepositPaymentStep.tsx')).toContain("colorPrimary: '#9F1239'");
  });
});
