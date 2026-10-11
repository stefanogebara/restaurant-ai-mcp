/**
 * Range slider for voice settings (stability, similarity, style, speed).
 */

import { useId } from 'react';

interface VoiceSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  lowLabel: string;
  highLabel: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

export default function VoiceSlider({
  label,
  value,
  min,
  max,
  step,
  lowLabel,
  highLabel,
  formatValue,
  onChange,
}: VoiceSliderProps) {
  const inputId = useId();
  const displayValue = formatValue ? formatValue(value) : value.toFixed(2);
  const fill = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="space-y-2 font-brand">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="text-sm font-medium text-brand-ink">{label}</label>
        <span className="text-sm tabular-nums text-brand-muted">{displayValue}</span>
      </div>
      <div className="relative h-6">
        <div aria-hidden="true" className="absolute inset-x-0 top-[11px] h-[2px] bg-brand-line">
          <div className="h-full bg-brand-action" style={{ width: `${fill}%` }} />
        </div>
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="voice-range absolute inset-0 w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        />
      </div>
      <div className="flex justify-between">
        <span className="text-xs text-brand-muted">{lowLabel}</span>
        <span className="text-xs text-brand-muted">{highLabel}</span>
      </div>
    </div>
  );
}
