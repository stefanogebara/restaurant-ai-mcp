import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Dark-mode review 2026-11-24 (Modo Serviço). jsdom does not apply CSS, so
// this guards the rules themselves and the token swaps that let them apply.
const src = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(src, p), 'utf8');
const css = read('index.css');

describe('service mode reaches every light surface on the night dashboard', () => {
  it('re-themes white surfaces, so no white-on-white text (waitlist "Active" tab)', () => {
    expect(css).toMatch(/\.service-mode \.bg-white \{/);
    expect(css).toMatch(/\.service-mode \.bg-white\\\/60 \{/);
  });

  it('darkens the page behind the sidebar and the group tabs above the page', () => {
    expect(css).toMatch(/body:has\(\.service-mode\)/);
    expect(css).toMatch(/main:has\(\.service-mode\) > \.section-tabs/);
    expect(read('components/layout/SectionTabs.tsx')).toContain('section-tabs');
  });

  it('keeps the reservation filters on theme tokens, not raw light hex the layer cannot reach', () => {
    const list = read('components/dashboard/ReservationsList.tsx');
    expect(list).not.toContain('bg-[#FAFAF9] text-[#1C1917]');
    expect(list).not.toContain('bg-[#F5F5F4] text-[#78716C]');
  });
});
