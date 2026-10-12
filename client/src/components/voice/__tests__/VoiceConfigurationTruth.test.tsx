import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { renderWithProviders } from '../../../test/renderWithProviders';
import VoiceEngineSelector from '../VoiceEngineSelector';
import VoiceAgentInfo from '../VoiceAgentInfo';
import OpenAIEngineInfo from '../OpenAIEngineInfo';
import VoiceLanguagePicker from '../VoiceLanguagePicker';
import VoiceFilters from '../VoiceFilters';
import VoiceEngineSwitchModal from '../VoiceEngineSwitchModal';
import { getVoiceLanguageLabel } from '../voiceConstants';

afterEach(async () => { await i18n.changeLanguage('en'); });

describe('voice configuration is distinct from a connected phone', () => {
  it('shows the selected engine without an active-call badge or unsupported prices', () => {
    renderWithProviders(
      <VoiceEngineSelector currentEngine="elevenlabs" pendingEngine={null} engineStatus="active" onEngineSwitch={vi.fn()} />,
    );

    expect(screen.getByText(/Calls reach it only after your phone connection is verified/)).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b1\.2 s\b/)).not.toBeInTheDocument();
  });

  it('shows testing for the saved engine, not a pending alternative', () => {
    const { rerender } = renderWithProviders(
      <VoiceEngineSelector currentEngine="elevenlabs" pendingEngine={null} engineStatus="testing" onEngineSwitch={vi.fn()} />,
    );
    expect(screen.getByText('Testing')).toBeInTheDocument();
    rerender(<VoiceEngineSelector currentEngine="openai_realtime" pendingEngine="openai_realtime" engineStatus="testing" onEngineSwitch={vi.fn()} />);
    expect(screen.queryByText('Testing')).not.toBeInTheDocument();
  });

  it('describes the configured agent without promising that calls are routed', async () => {
    renderWithProviders(<VoiceAgentInfo agentId="agent-1" updatedAt={undefined} createdAt={undefined} />);
    expect(screen.getByText('Agent configured')).toBeInTheDocument();
    expect(screen.getByText(/verified phone connection is still required/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check phone connection' })).toHaveAttribute('href', '#voice-settings:phone');
    expect(screen.queryByText(/ready to take calls/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show technical details' }));
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.queryByText('turbo_v2.5')).not.toBeInTheDocument();
  });

  it('keeps the alternate engine status about configuration, including disabled', async () => {
    const { rerender } = renderWithProviders(<OpenAIEngineInfo engineStatus="active" currentOpenAIVoice="alloy" />);
    expect(screen.getByText(/Phone routing is checked separately/)).toBeInTheDocument();
    rerender(<OpenAIEngineInfo engineStatus="disabled" currentOpenAIVoice="alloy" />);
    expect(screen.getByText(/Calls cannot use this voice/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show technical details' }));
    expect(screen.queryByText('seatable-voice.fly.dev')).not.toBeInTheDocument();
  });

  it('uses localized language names and localized filter labels without flag icons', async () => {
    await i18n.changeLanguage('pt-BR');
    const { unmount } = renderWithProviders(
      <VoiceLanguagePicker currentLanguage="pt" savedLanguage="pt" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /português/i })).toBeInTheDocument();
    expect(screen.queryByText(/🇵🇹/)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <VoiceFilters filters={{ gender: 'all', language: 'pt', search: '' }} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Masculinas' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar vozes por idioma' })).toBeInTheDocument();
    expect(getVoiceLanguageLabel({ code: 'es', label: 'Spanish' }, 'pt-BR')).toMatch(/espanhol/i);
  });

  it('does not promise a timed switch or uninterrupted calls in Spanish', async () => {
    await i18n.changeLanguage('es');
    renderWithProviders(
      <VoiceEngineSwitchModal isOpen engineSwitchTarget="openai_realtime" onConfirm={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/Aún tendrás que guardar el cambio/)).toBeInTheDocument();
    expect(screen.getByText(/Voz directa/)).toBeInTheDocument();
    expect(screen.queryByText(/30 segundos|ninguna llamada/i)).not.toBeInTheDocument();
  });
});
