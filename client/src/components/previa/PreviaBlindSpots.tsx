import { useState } from 'react';

/**
 * Ato 2 da prévia — "o que passa batido".
 *
 * Insight selling honesto: a perda de no-show é uma FAIXA que o próprio dono
 * controla no slider (input dele = estimativa honesta, nunca "você perdeu R$ X"),
 * e a nota real dele aparece ao lado de um benchmark rotulado como referência —
 * nunca uma média de bairro fabricada. Os críticos do estudo mataram qualquer
 * número inventado apresentado como fato; aqui tudo que é estimativa carrega o
 * rótulo, e a única cifra concreta nasce do gesto do dono.
 */

interface PreviaBlindSpotsProps {
  restaurantName: string;
  rating: number | null;
}

// Ticket médio estimado por mesa de 4 que fura (faixa conservadora, R$).
const PER_TABLE_LOW = 110;
const PER_TABLE_HIGH = 160;
const WEEKS_PER_MONTH = 4.3;
// Benchmark de referência: a maioria dos restaurantes no Google fica nesta
// faixa. Rotulado como referência geral, não como medição do bairro do lead.
const RATING_BENCHMARK = 4.2;

const brl = (n: number) => n.toLocaleString('pt-BR');
const round50 = (n: number) => Math.round(n / 50) * 50;

export default function PreviaBlindSpots({ restaurantName, rating }: PreviaBlindSpotsProps) {
  const [mesas, setMesas] = useState(2);

  const lo = round50(mesas * WEEKS_PER_MONTH * PER_TABLE_LOW);
  const hi = round50(mesas * WEEKS_PER_MONTH * PER_TABLE_HIGH);
  const hot = mesas >= 4;

  const hasRating = typeof rating === 'number' && rating > 0;
  const ratingPct = hasRating ? Math.min(100, (rating! / 5) * 100) : 0;
  const benchPct = (RATING_BENCHMARK / 5) * 100;
  const acima = hasRating && rating! >= RATING_BENCHMARK;

  return (
    <section className="mt-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy mb-2">
        Ato 2 · o que hoje passa batido
      </p>

      {/* Card A — perda de no-show, faixa controlada pelo dono */}
      <div className="glass-card p-4">
        <h3 className="text-[15px] font-semibold text-deep-charcoal">Quanto o no-show pode estar custando?</h3>
        <p className="text-[12.5px] text-muted-stone mt-0.5 mb-4">arrasta pra ver — é a sua conta, não a minha</p>

        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="previa-mesas" className="text-[13px] text-charcoal-dark">
            mesas que furam por semana
          </label>
          <span className="font-serif text-2xl tabular-nums text-deep-charcoal">{mesas}</span>
        </div>

        <input
          id="previa-mesas"
          type="range"
          min={0}
          max={10}
          value={mesas}
          onChange={(e) => setMesas(Number(e.target.value))}
          aria-label="mesas que furam por semana"
          className="previa-range w-full my-4"
        />

        <div
          className={`rounded-xl px-4 py-3 border transition-colors ${
            hot
              ? 'bg-red-500/10 border-red-500/25'
              : 'bg-amber-500/10 border-amber-500/25'
          }`}
        >
          {mesas === 0 ? (
            <>
              <div className="font-serif text-2xl tabular-nums text-amber-700">R$ 0</div>
              <div className="text-[11.5px] text-muted-stone mt-0.5">
                nenhuma furando — ótimo. <b className="text-charcoal-dark font-semibold">estimativa</b> pra referência
              </div>
            </>
          ) : (
            <>
              <div className={`font-serif text-2xl tabular-nums ${hot ? 'text-red-600' : 'text-amber-700'}`}>
                R$ {brl(lo)} – {brl(hi)}
              </div>
              <div className="text-[11.5px] text-muted-stone mt-0.5">
                por mês parados · <b className="text-charcoal-dark font-semibold">estimativa</b>{' '}
                (média do setor: 10–20% de no-show)
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card B — nota real vs benchmark de referência (honesto, sem bairro fake) */}
      {hasRating && (
        <div className="glass-card p-4 mt-3">
          <div className="flex items-center justify-between text-[12.5px] text-charcoal-dark mb-2">
            <span>
              Sua nota: <b className="text-emerald-600">{rating!.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</b>
            </span>
            <span className="text-muted-stone">referência comum: ~{RATING_BENCHMARK.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</span>
          </div>
          <div className="relative h-2.5 rounded-full bg-black/[0.06] overflow-hidden">
            <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${ratingPct}%` }} />
            {/* marcador da referência */}
            <span className="absolute inset-y-0 w-0.5 bg-amber-500/80" style={{ left: `${benchPct}%` }} aria-hidden />
          </div>
          <p className="text-[12px] text-charcoal-dark mt-2.5 leading-relaxed">
            {acima ? (
              <>Você já está <b>acima da média</b>. O {restaurantName} com a Seatable mantém isso pedindo avaliação na hora certa.</>
            ) : (
              <>Dá pra subir isso pedindo avaliação na hora certa — a Seatable faz sozinha, no fim de cada visita.</>
            )}
          </p>
        </div>
      )}

      <p className="text-[11px] text-stone-400 mt-3 text-center">
        números são estimativa pra dar ordem de grandeza, não conta fechada.
      </p>
    </section>
  );
}
