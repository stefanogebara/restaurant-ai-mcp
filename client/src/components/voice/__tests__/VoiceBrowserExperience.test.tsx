import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import VoiceCard from '../VoiceCard';
import VoiceGrid from '../VoiceGrid';

const voice = { id: 'voice-1', name: 'Restaurant voice', language: 'pt', gender: 'female', description: 'A clear voice.', preview_phrase: 'Olá!' };
afterEach(async () => { await act(async () => { await i18n.changeLanguage('en'); }); });

describe('auditioning is separate from selecting a voice', () => {
  it.each(['{Enter}', ' '])('plays from the preview button with %s without selecting the voice', async key => {
    const onSelect = vi.fn(); const onPlay = vi.fn();
    render(<VoiceCard voice={voice} isSelected={false} isPlaying={false} isLoading={false} onSelect={onSelect} onPlay={onPlay} />);
    screen.getByRole('button', { name: 'Preview' }).focus();
    await userEvent.keyboard(key);
    expect(onPlay).toHaveBeenCalledWith('voice-1', 'Olá!');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still selects when the voice option itself has keyboard focus', async () => {
    const onSelect = vi.fn();
    render(<VoiceCard voice={voice} isSelected={false} isPlaying={false} isLoading={false} onSelect={onSelect} onPlay={vi.fn()} />);
    screen.getByRole('radio').focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('voice-1');
  });

  it('moves from actual keyboard focus using the rendered number of columns', async () => {
    const onSelectVoice = vi.fn();
    const voices = Array.from({ length: 5 }, (_, index) => ({ ...voice, id: `voice-${index}`, name: `Voice ${index}` }));
    render(<VoiceGrid voices={voices} selectedVoiceId="voice-0" playingVoiceId={null} loadingAudioId={null} hasMore={false} isLoadingMore={false} onSelectVoice={onSelectVoice} onPlayVoice={vi.fn()} onLoadMore={vi.fn()} />);
    const cards = screen.getAllByRole('radio');
    const grid = screen.getByRole('radiogroup');
    grid.style.gridTemplateColumns = '300px 300px';
    cards[1].focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(cards[3]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(cards[2]).toHaveFocus();
    grid.style.gridTemplateColumns = '300px';
    await userEvent.keyboard('{ArrowDown}');
    expect(cards[3]).toHaveFocus();
    expect(onSelectVoice).not.toHaveBeenCalled();
  });

  it.each([
    ['pt-BR', 'Nenhuma voz encontrada', 'Tente outro idioma ou ajuste os filtros.'],
    ['es', 'No se encontraron voces', 'Prueba otro idioma o ajusta los filtros.'],
  ])('explains the empty library in %s', async (language, title, hint) => {
    await i18n.changeLanguage(language);
    render(<VoiceGrid voices={[]} selectedVoiceId="" playingVoiceId={null} loadingAudioId={null} hasMore={false} isLoadingMore={false} onSelectVoice={vi.fn()} onPlayVoice={vi.fn()} onLoadMore={vi.fn()} />);
    expect(screen.getByText(title)).toBeVisible();
    expect(screen.getByText(hint)).toBeVisible();
  });

  it('localizes the next-page action without claiming support can unlock a provider fallback', async () => {
    await i18n.changeLanguage('pt-BR');
    render(<VoiceGrid voices={[voice]} selectedVoiceId="" playingVoiceId={null} loadingAudioId={null} hasMore isLoadingMore={false} source="own_voices_fallback" onSelectVoice={vi.fn()} onPlayVoice={vi.fn()} onLoadMore={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mostrar mais vozes' })).toBeVisible();
    expect(screen.getByText('Estas são as vozes disponíveis para esta conta no momento.')).toBeVisible();
    expect(screen.queryByText(/unlock the full voice library/i)).not.toBeInTheDocument();
  });
});
