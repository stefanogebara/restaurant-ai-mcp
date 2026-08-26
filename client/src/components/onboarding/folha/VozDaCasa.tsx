import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AMOSTRAS, FALA_DO_CLIENTE, ORDEM_PADRAO, type Preset, type Idioma } from '../../../lib/personaProposta';
import { deriveBestPresetFromVibes } from '../../../utils/vibeToPersonaPreset';

/**
 * A voz da casa, escolhida ouvindo — não descrevendo.
 *
 * O passo que isto substitui pedia ao dono que redigisse um parágrafo sobre o
 * "estilo de comunicação" da casa. O que o sistema guarda dali é
 * `humor_type: 'warm'` e `communication_style: 'casual'` — abstrações que
 * ninguém sabe julgar no vazio. O dono não sabe se quer "warm" ou "light"; ele
 * reconhece a própria casa quando ouve.
 *
 * Então as quatro personas respondem à MESMA fala de cliente, e ele toca na
 * que soa como ele. A fala escolhida é um pedido em horário cheio de
 * propósito: recusar e oferecer alternativa é onde a voz aparece. Um "sim"
 * soa igual em qualquer tom.
 */

interface VozDaCasaProps {
  vibeTags?: string[];
  valor: Preset | null;
  onEscolher: (preset: Preset) => void;
}

function idiomaDe(lng: string): Idioma {
  const l = (lng || 'pt').slice(0, 2).toLowerCase();
  return (['pt', 'es', 'en'] as const).includes(l as Idioma) ? (l as Idioma) : 'pt';
}

export function VozDaCasa({ vibeTags, valor, onEscolher }: VozDaCasaProps) {
  const { t, i18n } = useTranslation();
  const lang = idiomaDe(i18n.language);

  // Sem tag não há base para sugerir. Marcar uma mesmo assim faria o dono
  // aceitar por inércia uma voz que ninguém escolheu.
  const sugerido = useMemo(
    () => (deriveBestPresetFromVibes(vibeTags ?? []) as Preset | null) ?? null,
    [vibeTags],
  );

  const ordem = useMemo<Preset[]>(
    () => (sugerido ? [sugerido, ...ORDEM_PADRAO.filter((p) => p !== sugerido)] : [...ORDEM_PADRAO]),
    [sugerido],
  );

  return (
    <div>
      <p className="text-[15px] text-warm-stone leading-[1.6]">
        {t('onboarding.folha.vozIntro', 'Um cliente manda isto quando a casa está cheia. Toque na resposta que soa como você:')}
      </p>

      <p className="mt-3 mb-2 text-[15px] text-deep-charcoal">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mr-2">
          {t('onboarding.folha.cliente', 'Cliente')}
        </span>
        {FALA_DO_CLIENTE[lang]}
      </p>

      <div role="radiogroup" aria-label={t('onboarding.folha.vozLabel', 'Voz da recepcionista')} className="space-y-2">
        {ordem.map((preset) => {
          const a = AMOSTRAS[preset];
          const escolhido = valor === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={escolhido}
              onClick={() => onEscolher(preset)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                escolhido
                  ? 'border-burgundy bg-burgundy/[4%]'
                  : 'border-glass-border-dark hover:border-burgundy/40 bg-white'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium text-deep-charcoal">{a.rotulo[lang]}</span>
                {preset === sugerido && (
                  /* Estado, não ação — o burgundy fica para o cartão escolhido. */
                  <span className="flex-shrink-0 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {t('onboarding.folha.pareceVoce', 'Parece você')}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.55] text-stone-gray">{a.resposta[lang]}</p>
              <p className="mt-1.5 text-[13px] text-muted-stone">{a.resumo[lang]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default VozDaCasa;
