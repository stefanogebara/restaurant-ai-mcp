import { useTranslation } from 'react-i18next';
import type { CalculatorInputs } from '../../pages/NoShowCalculator';

interface Props {
  inputs: CalculatorInputs;
  onChange: (field: keyof CalculatorInputs, value: number) => void;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  prefix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  prefix?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-deep-charcoal">{label}</label>
        <span className="text-sm font-semibold text-burgundy tabular-nums">
          {prefix}{value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="calculator-slider w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #9F1239 0%, #9F1239 ${pct}%, #E7E5E4 ${pct}%, #E7E5E4 100%)`,
        }}
      />
      <div className="flex justify-between text-xs text-warm-stone">
        <span>{prefix}{min}{suffix}</span>
        <span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}

function TurnSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();

  const options = [
    { value: 1, label: t('calculator.inputs.lunchOnly', '1 (alm.)') },
    { value: 2, label: t('calculator.inputs.lunchDinner', '2 (alm. + jantar)') },
  ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-deep-charcoal">
        {t('calculator.inputs.turnsPerDay', 'Turnos por dia')}
      </label>
      <div className="flex gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
              value === opt.value
                ? 'border-burgundy bg-burgundy/5 text-burgundy'
                : 'border-glass-border-dark bg-white text-stone-gray hover:border-stone-gray'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CalculatorSliders({ inputs, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="glass-card p-6 sm:p-8 space-y-6">
      <h2 className="text-lg font-semibold text-deep-charcoal">
        {t('calculator.inputs.title', 'Dados do seu restaurante')}
      </h2>

      <SliderField
        label={t('calculator.inputs.tables', 'Numero de mesas')}
        value={inputs.tables}
        min={5}
        max={50}
        step={1}
        onChange={(v) => onChange('tables', v)}
      />

      <SliderField
        label={t('calculator.inputs.avgTicket', 'Ticket medio por mesa')}
        value={inputs.avgTicket}
        min={50}
        max={500}
        step={10}
        prefix="R$"
        onChange={(v) => onChange('avgTicket', v)}
      />

      <SliderField
        label={t('calculator.inputs.noShowRate', 'Taxa de no-show')}
        value={inputs.noShowRate}
        min={5}
        max={40}
        step={1}
        suffix="%"
        onChange={(v) => onChange('noShowRate', v)}
      />

      <SliderField
        label={t('calculator.inputs.daysPerWeek', 'Dias abertos por semana')}
        value={inputs.daysPerWeek}
        min={4}
        max={7}
        step={1}
        onChange={(v) => onChange('daysPerWeek', v)}
      />

      <TurnSelector
        value={inputs.turnsPerDay}
        onChange={(v) => onChange('turnsPerDay', v)}
      />

      <SliderField
        label={t('calculator.inputs.occupancy', 'LotaÃ§Ã£o mÃ©dia')}
        value={inputs.occupancy}
        min={50}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => onChange('occupancy', v)}
      />
    </div>
  );
}
