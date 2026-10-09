import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import VoiceTuningPanel from '../VoiceTuningPanel';
import VoiceLanguagePicker from '../VoiceLanguagePicker';
import VoiceSlider from '../VoiceSlider';
import VoiceCard from '../VoiceCard';
import VoiceFilters from '../VoiceFilters';
import type { VoiceSettings } from '../voiceTypes';

const warmSettings: VoiceSettings = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.25,
  speed: 1,
};

describe('voice controls', () => {
  it('applies a speaking preset and exposes technical controls on request', () => {
    const onSettingChange = vi.fn();
    const onReset = vi.fn();
    render(
      <VoiceTuningPanel
        settings={warmSettings}
        onSettingChange={onSettingChange}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole('button', { name: 'Warm' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('slider', { name: 'Stability' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Calm' }));
    expect(onSettingChange.mock.calls).toEqual([
      ['stability', 0.75],
      ['similarity_boost', 0.85],
      ['style', 0.1],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced controls' }));
    expect(screen.getByRole('slider', { name: 'Stability' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide advanced controls' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide advanced controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('slider', { name: 'Stability' })).not.toBeInTheDocument();
  });

  it('names a custom mix when no preset matches', () => {
    render(<VoiceTuningPanel
      settings={{ stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 }}
      onSettingChange={vi.fn()}
      onReset={vi.fn()}
    />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calm' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps sliders labelled and sends their numeric value', () => {
    const onChange = vi.fn();
    render(<VoiceSlider label="Speaking speed" value={1} min={0.7} max={1.2} step={0.05} lowLabel="Slow" highLabel="Fast" onChange={onChange} />);

    fireEvent.change(screen.getByRole('slider', { name: 'Speaking speed' }), { target: { value: '1.1' } });
    expect(onChange).toHaveBeenCalledWith(1.1);
  });

  it('selects a language without flag buttons and links a pending change to its warning', () => {
    const onChange = vi.fn();
    const { rerender } = render(<VoiceLanguagePicker currentLanguage="en" savedLanguage="en" onChange={onChange} />);
    const language = screen.getByRole('combobox', { name: 'Languages' });
    expect(language).toHaveValue('en');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.change(language, { target: { value: 'es' } });
    expect(onChange).toHaveBeenCalledWith('es');

    rerender(<VoiceLanguagePicker currentLanguage="es" savedLanguage="en" onChange={onChange} />);
    expect(screen.getByRole('status')).toHaveAttribute('id', 'voice-language-warning');
    expect(language).toHaveAttribute('aria-describedby', 'voice-language-warning');
    expect(screen.queryByRole('button', { name: /Spanish/ })).not.toBeInTheDocument();
  });

  it('keeps voice choice separate from listening in the library', () => {
    const onSelect = vi.fn();
    const onPlay = vi.fn();
    render(<VoiceCard
      voice={{ id: 'voice-1', name: 'Lia', description: 'Warm Portuguese voice', language: 'pt', gender: 'female', accent: 'Brazilian', preview_phrase: 'Olá!' }}
      isSelected
      isPlaying={false}
      isLoading={false}
      onSelect={onSelect}
      onPlay={onPlay}
    />);
    expect(screen.getByRole('radio', { name: /Lia/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(onPlay).toHaveBeenCalledWith('voice-1', 'Olá!');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Lia/ }));
    expect(onSelect).toHaveBeenCalledWith('voice-1');
  });

  it('filters the library without flag emoji or decorative gender buttons', () => {
    const onChange = vi.fn();
    render(<VoiceFilters filters={{ gender: 'all', language: 'pt', search: '' }} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by gender' }), { target: { value: 'female' } });
    expect(onChange).toHaveBeenCalledWith({ gender: 'female', language: 'pt', search: '' });
    expect(screen.getByRole('combobox', { name: 'Filter by language' })).toHaveTextContent('Portuguese');
    expect(screen.getByRole('combobox', { name: 'Filter by language' })).not.toHaveTextContent('🇵🇹');
  });
});
