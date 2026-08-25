/**
 * LoginBrandPanel — variante do convert (G1).
 *
 * Sem demo: os três bullets de marca (tela intacta para quem chega direto).
 * Com demo: o restaurante que a pessoa acabou de ver a IA atender — vender
 * features para quem ACABOU de experimentá-las era o desperdício do momento
 * de maior intenção do funil.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../i18n/config';
import LoginBrandPanel from '../LoginBrandPanel';

beforeAll(async () => { await i18n.changeLanguage('en'); });

const renderPanel = (props = {}) =>
  render(<MemoryRouter><LoginBrandPanel {...props} /></MemoryRouter>);

describe('LoginBrandPanel', () => {
  it('sem demo mantém a tela de marca genérica', () => {
    renderPanel();
    expect(screen.getByText(/AI that truly understands|entende o seu restaurante/i)).toBeInTheDocument();
    expect(screen.queryByText(/your demo is waiting/i)).toBeNull();
  });

  it('com demo mostra o restaurante, a cidade e a recepcionista de plantão', () => {
    renderPanel({ demo: { restaurantName: 'Mocotó Bar e Restaurante', city: 'São Paulo', daysLeft: 6 } });
    expect(screen.getByText('Mocotó Bar e Restaurante')).toBeInTheDocument();
    expect(screen.getByText('São Paulo')).toBeInTheDocument();
    expect(screen.getByText(/your demo is waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/receptionist is on duty/i)).toBeInTheDocument();
    expect(screen.getByText(/6 days left/i)).toBeInTheDocument();
    // Os bullets genéricos saem de cena.
    expect(screen.queryByText(/AI that truly understands/i)).toBeNull();
  });

  it('demo sem cidade/prazo não renderiza linhas vazias', () => {
    renderPanel({ demo: { restaurantName: 'Zebrallina', city: null, daysLeft: null } });
    expect(screen.getByText('Zebrallina')).toBeInTheDocument();
    expect(screen.queryByText(/days left/i)).toBeNull();
  });
});
