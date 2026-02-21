/**
 * Range slider for voice settings (stability, similarity, style, speed).
 */

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
        <label className="text-sm font-medium text-[#1C1917]">{label}</label>
        <span className="text-sm font-mono text-[#57534E]">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#9F1239]"
        style={{
          background: `linear-gradient(to right, #9F1239 0%, #9F1239 ${percentage}%, #E7E5E4 ${percentage}%, #E7E5E4 100%)`,
        }}
      />
      <div className="flex justify-between">
        <span className="text-xs text-[#A8A29E]">{lowLabel}</span>
        <span className="text-xs text-[#A8A29E]">{highLabel}</span>
      </div>
    </div>
  );
}
