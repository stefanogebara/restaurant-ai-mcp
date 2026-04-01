import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Check } from 'lucide-react';
import type { CalculatorOutput } from '../../pages/NoShowCalculator';

interface Props {
  output: CalculatorOutput;
  onShare: () => void;
}

/** Animated number that counts up/down smoothly */
function AnimatedNumber({
  value,
  prefix = '',
  className = '',
}: {
  value: number;
  prefix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) return;

    const duration = 400; // ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  const formatted = display.toLocaleString('pt-BR');

  return (
    <span className={className}>
      {prefix}{formatted}
    </span>
  );
}

function EmptyTablesVisual({ count }: { count: number }) {
  const { t } = useTranslation();
  // Show up to 20 table icons, then "+N"
  const maxShow = Math.min(count, 20);
  const overflow = count > 20 ? count - 20 : 0;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-deep-charcoal">
        {t('calculator.results.emptyTablesLabel', 'Mesas vazias por semana')}
      </p>
      <div className="flex flex-wrap gap-1.5 items-center">
        {Array.from({ length: maxShow }).map((_, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded bg-red-100 border border-red-200 flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="w-3 h-3 rounded-sm bg-red-400/60" />
          </div>
        ))}
        {overflow > 0 && (
          <span className="text-xs font-medium text-red-500 ml-1">+{overflow}</span>
        )}
      </div>
      <p className="text-xs text-warm-stone">
        {count} {t('calculator.results.emptyTablesUnit', 'mesas/semana perdidas')}
      </p>
    </div>
  );
}

export default function CalculatorResults({ output, onShare }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Monthly potential */}
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <p className="text-sm text-warm-stone mb-1">
          {t('calculator.results.monthlyPotential', 'Receita potencial mensal')}
        </p>
        <AnimatedNumber
          value={Math.round(output.monthlyPotentialRevenue)}
          prefix="R$ "
          className="text-2xl font-bold text-deep-charcoal tabular-nums"
        />
      </div>

      {/* Monthly loss - BIG RED */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
        <p className="text-sm text-red-700 mb-1">
          {t('calculator.results.monthlyLoss', 'Perda mensal com no-shows')}
        </p>
        <AnimatedNumber
          value={Math.round(output.monthlyLoss)}
          prefix="- R$ "
          className="text-3xl sm:text-4xl font-bold text-red-600 tabular-nums"
        />
      </div>

      {/* Annual loss - even bigger */}
      <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6">
        <p className="text-sm text-red-600 mb-1">
          {t('calculator.results.annualLoss', 'Perda anual estimada')}
        </p>
        <AnimatedNumber
          value={Math.round(output.annualLoss)}
          prefix="- R$ "
          className="text-4xl sm:text-5xl font-bold text-red-700 tabular-nums"
        />
      </div>

      {/* Empty tables visual */}
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <EmptyTablesVisual count={output.emptyTablesPerWeek} />
      </div>

      {/* Seatable recovery - GREEN */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
        <p className="text-sm text-emerald-700 mb-1">
          {t('calculator.results.seatableLabel', 'Com Seatable, restaurantes reduzem no-shows em ate 50%')}
        </p>
        <div className="flex items-baseline gap-2">
          <AnimatedNumber
            value={Math.round(output.recoveredRevenue)}
            prefix="+ R$ "
            className="text-3xl sm:text-4xl font-bold text-emerald-600 tabular-nums"
          />
          <span className="text-sm text-emerald-600 font-medium">
            {t('calculator.results.perMonth', '/mes')}
          </span>
        </div>
        <p className="text-xs text-emerald-600/70 mt-2">
          {t('calculator.results.recoveryNote', 'Receita recuperada com confirmacoes automaticas via WhatsApp')}
        </p>
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border-gray bg-white text-sm font-medium text-stone-gray hover:text-deep-charcoal hover:border-stone-gray transition-colors"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-600">
              {t('calculator.results.linkCopied', 'Link copiado!')}
            </span>
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            {t('calculator.results.share', 'Compartilhar resultado')}
          </>
        )}
      </button>
    </div>
  );
}
