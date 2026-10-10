import type { ReactNode } from 'react';

/** Plots sit directly on the report canvas; rules, rather than cards, group them. */
interface ChartPanelProps {
  title: string;
  description?: ReactNode;
  /** Pílula opcional à direita do título (tendência, destaque). */
  badge?: ReactNode;
  /** Descrição para leitores de tela — vira role="img" no corpo do gráfico. */
  ariaLabel?: string;
  /** The lead plot gets a larger heading and more breathing room. */
  emphasis?: boolean;
  children: ReactNode;
}

export default function ChartPanel({ title, description, badge, ariaLabel, emphasis = false, children }: ChartPanelProps) {
  return (
    <section
      className="min-w-0 bg-transparent"
    >
      <div className={`flex flex-wrap gap-x-5 gap-y-2 ${emphasis ? 'items-baseline justify-between pb-1 pt-2 xl:pt-0' : 'items-center justify-between border-b border-brand-line pb-3'}`}>
        <div>
          <h3 className={`font-brand leading-snug text-brand-ink ${emphasis ? 'text-[21px] tracking-tight sm:text-[27px]' : 'text-[14px] font-medium'}`}>
            {title}
          </h3>
          {description && <p className="mt-0.5 text-[13px] text-brand-muted">{description}</p>}
        </div>
        {badge}
      </div>
      <div
        className={emphasis ? 'pt-2' : 'pt-4'}
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
    accent: 'bg-brand-action/[0.08] text-brand-action',
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
