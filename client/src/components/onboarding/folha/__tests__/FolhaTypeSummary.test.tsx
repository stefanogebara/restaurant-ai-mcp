import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import FolhaDeConfirmacao from '../FolhaDeConfirmacao';
import type { OnboardingData } from '../../../../types/onboarding.types';

const data = {
  restaurant_name: 'Casa Aurora', city: 'São Paulo', country: 'Brazil', country_code: 'BR',
  restaurant_type: '', phone_number: '+5511999990000', email: 'owner@example.com',
  business_hours: [{ day: 'Monday', is_open: true, open_time: '12:00', close_time: '23:00' }],
  areas: [{ name: 'Salão', is_active: true, tables: [{ capacity: 4, count: 4, shape: 'square', is_fixed_seating: false, is_joinable: true }] }],
} as OnboardingData;

function setup(type = '') {
  const onUpdate = vi.fn();
  function Sheet() {
    const [value, setValue] = useState({ ...data, restaurant_type: type });
    return <FolhaDeConfirmacao data={value} origem="manual" vozEscolhida="neighborhood"
      onEscolherVoz={vi.fn()} onConcluir={vi.fn()} updateData={patch => {
        onUpdate(patch); setValue(previous => ({ ...previous, ...patch }));
      }} />;
  }
  render(<Sheet />);
  const house = screen.getByRole('heading', { level: 2, name: i18n.t('onboarding.folha.aCasa', 'A casa') }).closest('section')!;
  return { house, onUpdate };
}
async function language(locale: string) { await act(async () => { await i18n.changeLanguage(locale); }); }
afterEach(async () => { await language('en'); });

const locales = [
  ['pt-BR', 'Brasil', 'Casual', 'Outro'],
  ['en', 'Brazil', 'Casual Dining', 'Other'],
  ['es', 'Brasil', 'Restaurante Casual', 'Otro'],
] as const;

describe('restaurant type summary uses the existing translated option labels', () => {
  it.each(locales)('renders the selected type in %s without changing its saved code', async (locale, country, label) => {
    await language(locale);
    const { house, onUpdate } = setup();
    fireEvent.click(within(house).getByRole('button', { name: i18n.t('onboarding.folha.ajustar', 'Ajustar') }));
    const select = within(house).getByRole('combobox', { name: new RegExp(i18n.t('onboarding.restaurantType'), 'i') });
    fireEvent.change(select, { target: { value: 'casual-dining' } });
    expect(within(house).getByText(`Casa Aurora · São Paulo · ${country} · ${label}`)).toBeVisible();
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent(label);
    expect(onUpdate).toHaveBeenLastCalledWith({ restaurant_type: 'casual-dining' });
  });

  it.each(locales)('also localizes an existing underscore type in %s', async (locale, country, label) => {
    await language(locale);
    const { house, onUpdate } = setup('casual_dining');
    expect(within(house).getByText(`Casa Aurora · São Paulo · ${country} · ${label}`)).toBeVisible();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it.each(locales)('uses localized Other for an unknown type in %s without rewriting the draft', async (locale, country, _label, other) => {
    await language(locale);
    const { house, onUpdate } = setup('unrecognized-service-code');
    expect(within(house).getByText(`Casa Aurora · São Paulo · ${country} · ${other}`)).toBeVisible();
    expect(within(house).queryByText(/unrecognized-service-code/)).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('omits the optional type from the summary when none was selected', () => {
    const { house } = setup();
    expect(within(house).getByText('Casa Aurora · São Paulo · Brazil')).toBeVisible();
  });

  it('keeps the Portuguese manual heading independent of the restaurant name’s gender', async () => {
    await language('pt-BR'); setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confira os dados: Casa Aurora.');
  });
});
