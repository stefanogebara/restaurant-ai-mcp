/**
 * Range slider for voice settings (stability, similarity, style, speed).
 */

import { colors } from '../../utils/colors';

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
  const displayValue = formatValue ? formatValue(value) : value.toFixed(2);
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-deep-charcoal">{label}</label>
        <span className="text-sm font-mono text-stone-gray">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-burgundy"
        style={{
          background: `linear-gradient(to right, ${colors.burgundy} 0%, ${colors.burgundy} ${percentage}%, ${colors.borderGray} ${percentage}%, ${colors.borderGray} 100%)`,
        }}
      />
      <div className="flex justify-between">
        <span className="text-xs text-muted-stone">{lowLabel}</span>
        <span className="text-xs text-muted-stone">{highLabel}</span>
      </div>
    </div>
  );
}
