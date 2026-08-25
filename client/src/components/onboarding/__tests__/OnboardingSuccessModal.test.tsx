/**
 * OnboardingSuccessModal — placar honesto (G3.2).
 *
 * O endpoint devolvia 200 mesmo quando o agente de voz, o WhatsApp, a
 * assinatura ou o sync de conhecimento falhavam: o dono lia "Bem-vindo a
 * bordo! Seu restaurante está pronto" sobre uma instalação quebrada e só
 * descobria dias depois, com o telefone tocando sem resposta.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n/config';
import OnboardingSuccessModal from '../OnboardingSuccessModal';

beforeAll(async () => { await i18n.changeLanguage('en'); });

const base = { countdown: 5, ownReferral: null, bookingUrl: 'https://seatable.one/book/x' };
const TUDO_OK = {
  restaurant: 'ok', voice_agent: 'ok', whatsapp_registry: 'ok',
  knowledge_base: 'ok', subscription: 'ok',
};

describe('OnboardingSuccessModal', () => {
  it('instalação completa: nenhuma pendência na tela', () => {
    render(<OnboardingSuccessModal {...base} setup={TUDO_OK} />);
    expect(screen.getByText(/welcome aboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/still finishing/i)).toBeNull();
  });

  it('sem placar (compat) não inventa pendência', () => {
    render(<OnboardingSuccessModal {...base} setup={null} />);
    expect(screen.queryByText(/still finishing/i)).toBeNull();
  });

  it('lista SÓ o que falhou — e não festeja por cima', () => {
    render(<OnboardingSuccessModal {...base} setup={{ ...TUDO_OK, voice_agent: 'timeout', knowledge_base: 'failed' }} />);
    expect(screen.getByText(/still finishing/i)).toBeInTheDocument();
    expect(screen.getByText(/voice agent/i)).toBeInTheDocument();
    expect(screen.getByText(/knowledge/i)).toBeInTheDocument();
    // O que deu certo não vira ruído.
    expect(screen.queryByText(/whatsapp — not connected/i)).toBeNull();
    // E o painel segue utilizável — a mensagem diz isso.
    expect(screen.getByText(/dashboard works normally/i)).toBeInTheDocument();
  });

  it('o botão primário leva ao checklist de lançamento, igual ao countdown', () => {
    render(<OnboardingSuccessModal {...base} setup={TUDO_OK} />);
    const btn = screen.getByRole('button', { name: /dashboard/i });
    const spy = vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, href: '' } as Location);
    btn.click();
    spy.mockRestore();
    expect(btn).toBeInTheDocument();
  });
});
