import type { ReactNode } from 'react';

/**
 * Cápsula de gráfico (Liquid Glass v2).
 *
 * "Vidro é para objetos, não para conteúdo" — um gráfico é objeto, então ele
 * mora numa cápsula de vidro; as métricas e listas ao redor vivem direto no
 * canvas. Os cinco gráficos das Análises repetiam o mesmo cabeçalho
 * (`overflow-hidden` + faixa com `border-b` + label uppercase em #1C1917
 * cru), cada um com sua cópia. Agora o shell é um só.
 */
interface ChartPanelProps {
  title: string;
  description?: ReactNode;
  /** Pílula opcional à direita do título (tendência, destaque). */
  badge?: ReactNode;
  /** Descrição para leitores de tela — vira role="img" no corpo do gráfico. */
  ariaLabel?: string;
  /** Only the lead chart carries a soft depth cue. */
  emphasis?: boolean;
  children: ReactNode;
}

export default function ChartPanel({ title, description, badge, ariaLabel, emphasis = false, children }: ChartPanelProps) {
  return (
    <section
      className="glass-panel overflow-hidden"
      style={emphasis
        ? { borderRadius: 12, boxShadow: 'none', backgroundColor: 'rgba(255, 255, 255, 0.24)', borderColor: 'rgba(49, 42, 38, 0.08)' }
        : { borderRadius: 16, boxShadow: 'none' }}
    >
      <div className={`flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 sm:px-5 ${emphasis ? 'pb-0 pt-4 sm:pt-5' : 'border-b hairline py-3.5'}`}>
        <div>
          <h3 className={`leading-snug text-deep-charcoal ${emphasis ? 'font-serif text-[24px] sm:text-[27px]' : 'font-sans text-[14px] font-medium'}`}>
            {title}
          </h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-stone">{description}</p>}
        </div>
        {badge}
      </div>
      <div
        className={emphasis ? 'px-2 pb-3 pt-2 sm:px-5 sm:pb-5' : 'p-4 sm:p-5'}
        {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : {})}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Pílula de destaque do cabeçalho — `rounded-[100px]` por DESIGN.md, nunca
 * `rounded-full` improvisado com cores cruas.
 */
export function ChartBadge({ tone, children }: { tone: 'accent' | 'up' | 'down' | 'muted'; children: ReactNode }) {
  const toneClass = {
    accent: 'bg-burgundy/[0.08] text-burgundy',
    up: 'bg-emerald-600/[0.10] text-emerald-700',
    down: 'bg-red-700/[0.08] text-red-700',
    muted: 'bg-muted-stone/[0.10] text-muted-stone',
  }[tone];
  return (
    <span className={`text-[11px] font-medium px-3 py-1 rounded-[100px] whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}
