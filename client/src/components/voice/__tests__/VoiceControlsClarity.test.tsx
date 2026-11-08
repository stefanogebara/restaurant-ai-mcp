import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import VoiceTuningPanel from '../VoiceTuningPanel';
import VoiceLanguagePicker from '../VoiceLanguagePicker';

const customSettings = { stability: 0.62, similarity_boost: 0.73, style: 0.12, speed: 1 };

describe('voice controls', () => {
  it('shows three concise choices and describes only the active style', () => {
    renderWithProviders(<VoiceTuningPanel
      settings={{ stability: 0.55, similarity_boost: 0.80, style: 0.25, speed: 1 }}
      currentVoiceId="voice-1"
      loadingAudio={null}
      onSettingChange={vi.fn()}
      onApplyPreset={vi.fn()}
      onReset={vi.fn()}
      onPreview={vi.fn()}
    />);

    const group = screen.getByRole('group', { name: 'How your AI sounds' });
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Friendly neighbourhood feel/)).toBeInTheDocument();
    expect(screen.queryByText(/Steady and reassuring/)).not.toBeInTheDocument();
  });

  it('applies a preset as one complete change while preserving speed', async () => {
    const onApplyPreset = vi.fn();
    const onSettingChange = vi.fn();
    renderWithProviders(<VoiceTuningPanel
      settings={customSettings}
      currentVoiceId="voice-1"
      loadingAudio={null}
      onSettingChange={onSettingChange}
      onApplyPreset={onApplyPreset}
      onReset={vi.fn()}
      onPreview={vi.fn()}
    />);

    await userEvent.click(screen.getByRole('button', { name: /Calm/ }));
    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset).toHaveBeenCalledWith({
      stability: 0.75, similarity_boost: 0.85, style: 0.10,
    });
    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it('keeps technical tuning closed for custom saved values until requested', async () => {
    renderWithProviders(<VoiceTuningPanel
      settings={customSettings}
      currentVoiceId="voice-1"
      loadingAudio={null}
      onSettingChange={vi.fn()}
      onApplyPreset={vi.fn()}
      onReset={vi.fn()}
      onPreview={vi.fn()}
    />);

    expect(screen.getByText('Custom tuning')).toBeInTheDocument();
    expect(screen.queryByText('Voice match')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show advanced controls' }));
    expect(screen.getByText('Voice match')).toBeInTheDocument();
  });

  it('identifies the restored defaults without calling them custom', () => {
    renderWithProviders(<VoiceTuningPanel
      settings={{ stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 }}
      currentVoiceId="voice-1"
      loadingAudio={null}
      onSettingChange={vi.fn()}
      onApplyPreset={vi.fn()}
      onReset={vi.fn()}
      onPreview={vi.fn()}
    />);

    expect(screen.getByText('Default tuning')).toBeInTheDocument();
    expect(screen.queryByText('Custom tuning')).not.toBeInTheDocument();
  });

  it('offers every language in a compact select and retains the pending warning', async () => {
    const onChange = vi.fn();
    renderWithProviders(<VoiceLanguagePicker currentLanguage="pt" savedLanguage="en" onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: 'Languages' });
    expect(select).toHaveValue('pt');
    expect(screen.getAllByRole('option')).toHaveLength(15);
    expect(screen.getByText(/Changing the language/)).toBeInTheDocument();
    await userEvent.selectOptions(select, 'ja');
    expect(onChange).toHaveBeenCalledWith('ja');
  });
});
