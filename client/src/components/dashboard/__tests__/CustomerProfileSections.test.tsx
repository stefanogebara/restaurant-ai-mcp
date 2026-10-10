import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../../../i18n/config';
import CustomerProfileSections from '../CustomerProfileSections';
import { displayCustomerPreset } from '../CustomerProfilePresets';

describe('customer profile preset values', () => {
  beforeEach(async () => { await act(async () => { await i18n.changeLanguage('pt-BR'); }); });
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });

  it('shows legacy labels in the current language and saves canonical values without changing custom notes', async () => {
    const onUpdateProfile = vi.fn();
    render(
      <CustomerProfileSections
        customerId="guest-1"
        allergies={['Glúten', 'Nozes', 'Sesame']}
        dietaryRestrictions={['Vegetariano', 'No onions']}
        seatingPreferences={[]}
        specialOccasions={{}}
        onUpdateProfile={onUpdateProfile}
      />
    );

    expect(screen.getByText('Glúten')).toBeInTheDocument();
    expect(screen.getByText('Nozes')).toBeInTheDocument();
    expect(screen.getByText('Sesame')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Glúten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Nozes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Ovos' }));
    expect(onUpdateProfile).toHaveBeenLastCalledWith({
      customerId: 'guest-1',
      allergies: ['Gluten', 'Nuts', 'Sesame', 'Eggs'],
    });
  });

  it('recognizes Spanish legacy labels and preserves unknown free text', async () => {
    await act(async () => { await i18n.changeLanguage('es'); });
    expect(displayCustomerPreset('Crustáceos', 'allergy')).toBe('Crustaceos');
    expect(displayCustomerPreset('Pescetariano', 'dietary')).toBe('Pescetariano');
    expect(displayCustomerPreset('No garlic', 'dietary')).toBe('No garlic');
  });
});
