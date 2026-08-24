import type { ReactNode } from 'react';

/**
 * Cápsula de gráfico (Liquid Glass v2).
 *
 * "Vidro é para objetos, não para conteúdo" — um gráfico é objeto, então ele
 * mora numa cápsula de vidro; as métricas e listas ao redor vivem direto no
 * canvas. Os cinco gráficos das Análises repetiam o mesmo cabeçalho
 * (`overflow-hidden` + faixa com `border-b` + label uppercase em #111827
 * cru), cada um com sua cópia. Agora o shell é um só.
 */
interface ChartPanelProps {
  title: string;
  /** Pílula opcional à direita do título (tendência, destaque). */
  badge?: ReactNode;
  /** Descrição para leitores de tela — vira role="img" no corpo do gráfico. */
  ariaLabel?: string;
  children: ReactNode;
}

export default function ChartPanel({ title, badge, ariaLabel, children }: ChartPanelProps) {
  return (
    <section className="glass-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b hairline">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {title}
        </h3>
        {badge}
      </div>
      <div
        className="p-5 sm:p-6"
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
