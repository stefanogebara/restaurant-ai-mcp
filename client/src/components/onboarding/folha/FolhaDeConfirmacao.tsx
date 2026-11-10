import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BlocoConfirmavel } from './BlocoConfirmavel';
import { VozDaCasa } from './VozDaCasa';
import HoursEditor, { invalidHours } from './HoursEditor';
import { getSheetCopy } from './sheetCopy';
import { getAllCountries, getCountryByCode } from '../../../data/countries';
import type { Preset } from '../../../lib/personaProposta';
import { proporMesas, resumirMesas } from '../../../lib/proporMesas';
import type { OnboardingData, BusinessHours } from '../../../types/onboarding.types';

/**
 * O onboarding numa folha só.
 *
 * O fluxo em seis passos pedia que o dono PREENCHESSE, e o passo "Ensine sua
 * IA" pedia doze respostas dissertativas — pela própria copy, cinco minutos de
 * digitação logo depois de assinar. A folha inverte: mostra o que a pesquisa
 * já descobriu e pede CONFIRMAÇÃO. Digitar vira a exceção, não o caminho.
 *
 * Três regras que o layout precisa carregar:
 *
 *  1. Nada de barra de progresso. Progresso é a métrica do formulário — ela
 *     mede o quanto ainda falta VOCÊ fazer. Aqui a métrica é o oposto: quanto
 *     já está pronto sem você.
 *  2. O que falta fica visível o tempo todo, no rodapé fixo, com o nome do que
 *     falta. Um botão desabilitado sem dizer por quê é a pior tela do produto.
 *  3. Cada bloco declara a FONTE. "do seu Google" é o que separa "adivinhou"
 *     de "pesquisou" — e bloco sem fonte não exibe rótulo, em vez de inventar.
 */

export interface FolhaDeConfirmacaoProps {
  data: OnboardingData;
  updateData: (u: Partial<OnboardingData>) => void;
  vibeTags?: string[];
  vozEscolhida: Preset | null;
  onEscolherVoz: (p: Preset) => void;
  onConcluir: () => void;
  enviando?: boolean;
  /** De onde vieram os dados: muda a frase da fonte, não o layout. */
  veioDoDemo?: boolean;
  origem?: 'manual' | 'demo' | 'google';
}

/** Só o que o banco exige (NOT NULL sem default) + a voz. */
type Pendencia = { campo: string; rotulo: string };

export function FolhaDeConfirmacao({
  data,
  updateData,
  vibeTags,
  vozEscolhida,
  onEscolherVoz,
  onConcluir,
  enviando = false,
  veioDoDemo = false,
  origem,
}: FolhaDeConfirmacaoProps) {
  const { t, i18n } = useTranslation();
  const copy = getSheetCopy(i18n.language);
  const source = origem ?? (veioDoDemo ? 'demo' : 'manual');
  const countryNames = useMemo(() => new Intl.DisplayNames([i18n.language || 'en'], { type: 'region' }), [i18n.language]);
  const fonte = source === 'demo'
    ? t('onboarding.folha.fonteDemo', 'você configurou no demo')
    : source === 'google' ? t('onboarding.folha.fonteGoogle', 'do seu Google') : undefined;

  // O salão proposto vem do porte estimado (avaliações + faixa de preço), que o
  // prefill do demo já calcula. Sem evidência, oferecemos um salão inicial
  // declarado como tal e que só entra no payload após aceitação explícita.
  const salaoProposto = useMemo(
    () => proporMesas(data.profile_data?.seat_count),
    [data.profile_data?.seat_count],
  );
  const salaoAtual = useMemo(() => resumirMesas(data.areas), [data.areas]);
  // A declared starting layout is offered when there is no evidence for an estimate.
  // Nothing is submitted until the owner explicitly accepts it.
  const proposta = salaoProposto ?? {
    areas: [{ name: t('onboarding.areaIndoor', 'Salão'), is_active: true, tables: [
      { capacity: 4, count: 4, shape: 'square' as const, is_fixed_seating: false, is_joinable: true },
    ] }], totalMesas: 4, totalLugares: 16,
  };

  const diasAbertos = useMemo(
    () => (data.business_hours ?? []).filter((h: BusinessHours) => h.is_open),
    [data.business_hours],
  );

  // A lista de pendências é a mesma regra do backend: os NOT NULL sem default.
  // Placeholder do demo NÃO conta como e-mail — quem tem esse endereço não
  // recebe confirmação de reserva nenhuma.
  const pendencias = useMemo<Pendencia[]>(() => {
    const p: Pendencia[] = [];
    const emailVazio =
      !data.email?.trim() || data.email.toLowerCase().endsWith('@demo.seatable.one');
    if (!data.restaurant_name?.trim()) p.push({ campo: 'restaurant_name', rotulo: t('onboarding.folha.pNome', 'o nome') });
    if (!data.country?.trim() || !getCountryByCode(data.country_code || '')) p.push({ campo: 'country', rotulo: copy.country });
    if (!salaoAtual.mesas) p.push({ campo: 'areas', rotulo: copy.confirmLayout });
    if (!data.city?.trim()) p.push({ campo: 'city', rotulo: t('onboarding.folha.pCidade', 'a cidade') });
    if (!data.phone_number?.trim()) p.push({ campo: 'phone_number', rotulo: t('onboarding.folha.pTelefone', 'o telefone') });
    if (emailVazio) p.push({ campo: 'email', rotulo: t('onboarding.folha.pEmail', 'o e-mail') });
    if (!diasAbertos.length || diasAbertos.some(invalidHours)) p.push({ campo: 'business_hours', rotulo: t('onboarding.folha.pHorarios', 'os horários') });
    if (!vozEscolhida) p.push({ campo: 'voz', rotulo: t('onboarding.folha.pVoz', 'a voz da recepcionista') });
    return p;
  }, [data, diasAbertos, vozEscolhida, t, copy, salaoAtual.mesas]);

  const pendente = (campo: string) => pendencias.some((p) => p.campo === campo);
  const entrada =
    'w-full px-4 py-3 border border-glass-border-input rounded-xl text-[15px] text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-40">
      <header className="pt-12 pb-2">
        <h1 className="font-serif text-[38px] sm:text-[46px] leading-[1.08] tracking-tight text-deep-charcoal text-balance">
          {source === 'google'
            ? t('onboarding.folha.titulo', 'Achamos isto sobre o {{nome}}.', { nome: data.restaurant_name })
            : data.restaurant_name
              ? (source === 'demo' ? copy.demoTitle : copy.manualTitle).replace('{{name}}', data.restaurant_name)
              : copy.manualEmptyTitle}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.6] text-warm-stone">
          {source === 'manual' ? copy.manualIntro : t(
            'onboarding.folha.subtitulo',
            'Confira o que já está certo e ajuste só o que estiver errado. Não precisa preencher nada que a gente já descobriu.',
          )}
        </p>
      </header>

      <fieldset disabled={enviando} className="min-w-0 divide-y divide-glass-border-dark">
        <BlocoConfirmavel
          titulo={t('onboarding.folha.aCasa', 'A casa')}
          fonte={fonte}
          textoPendente={source === 'google' ? undefined : copy.essentialDetails}
          pendente={pendente('restaurant_name') || pendente('city') || pendente('country')}
          resumo={
            <>
              {data.restaurant_name || t('onboarding.folha.semNome', 'Sem nome ainda')}
              {data.city ? ` · ${data.city}` : ''}
              {data.country_code && getCountryByCode(data.country_code) ? ` · ${countryNames.of(data.country_code) || data.country}` : ''}
              {data.restaurant_type ? ` · ${data.restaurant_type}` : ''}
            </>
          }
        >
          <div className="space-y-3">
            <input
              className={entrada}
              value={data.restaurant_name || ''}
              onChange={(e) => updateData({ restaurant_name: e.target.value })}
              placeholder={t('onboarding.folha.pNome', 'o nome')}
              aria-label={t('onboarding.folha.pNome', 'o nome')}
            />
            <input
              className={entrada}
              value={data.city || ''}
              onChange={(e) => updateData({ city: e.target.value })}
              placeholder={t('onboarding.folha.pCidade', 'a cidade')}
              aria-label={t('onboarding.folha.pCidade', 'a cidade')}
            />
            <label className="block text-sm text-muted-stone">
              {copy.country}
              <select required aria-label={copy.country} className={`${entrada} mt-1`} value={data.country_code || ''}
                onChange={e => {
                  const country = getCountryByCode(e.target.value);
                  updateData({ country_code: country?.code || '', country: country?.name || '', language: country?.language.split('-')[0] || '' });
                }}>
                <option value="">{copy.selectCountry}</option>
                {getAllCountries().map(country => <option key={country.code} value={country.code}>{countryNames.of(country.code) || country.name}</option>)}
              </select>
            </label>
            <label className="block text-sm text-muted-stone">
              {copy.type} <span>({copy.optional})</span>
              <select aria-label={copy.type} className={`${entrada} mt-1`} value={(data.restaurant_type || '').replace(/_/g, '-')}
                onChange={e => updateData({ restaurant_type: e.target.value })}>
                <option value="">{copy.selectType}</option>
                {['fine-dining', 'casual-dining', 'fast-casual', 'cafe', 'bar', 'bistro', 'pizzeria', 'steakhouse', 'seafood', 'other'].map(type =>
                  <option key={type} value={type}>{t(`onboarding.restaurantTypes.${type}`, type)}</option>)}
              </select>
            </label>
          </div>
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.horarios', 'Horários')}
          fonte={fonte || copy.initialHours}
          pendente={pendente('business_hours')}
          resumo={
            diasAbertos.length
              ? !diasAbertos.every(day => day.open_time === diasAbertos[0].open_time && day.close_time === diasAbertos[0].close_time)
                ? copy.daysOpen.replace('{{n}}', String(diasAbertos.length))
                : t('onboarding.folha.resumoHorarios', '{{n}} dias abertos, das {{de}} às {{ate}}', {
                  n: diasAbertos.length,
                  de: diasAbertos[0]?.open_time,
                  ate: diasAbertos[0]?.close_time,
                })
              : t('onboarding.folha.semHorarios', 'Ainda não sabemos quando vocês abrem')
          }
        >
          <HoursEditor value={data.business_hours ?? []} onChange={business_hours => updateData({ business_hours })} />
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.salao', 'O salão')}
          fonte={salaoAtual.mesas ? undefined : salaoProposto ? copy.estimatedLayout : copy.initialLayout}
          pendente={pendente('areas')}
          textoPendente={salaoProposto ? copy.estimatedLayout : copy.initialLayout}
          abertoInicialmente
          resumo={
            salaoAtual.mesas
              ? t('onboarding.folha.resumoSalao', '{{mesas}} mesas · {{lugares}} lugares', salaoAtual)
              : t('onboarding.folha.resumoSalao', '{{mesas}} mesas · {{lugares}} lugares', {
                  mesas: proposta.totalMesas, lugares: proposta.totalLugares,
                })
          }
        >
          <p className="text-[14px] leading-relaxed text-muted-stone">{salaoAtual.mesas ? copy.layoutAccepted : copy.layoutHint}</p>
          {!salaoAtual.mesas && <>
            <ul className="mt-3 space-y-1 text-sm text-deep-charcoal">
              {proposta.areas.flatMap(area => area.tables).map(table => <li key={table.capacity}>
                {table.count} × {table.capacity}
              </li>)}
            </ul>
            <button type="button" onClick={() => updateData({ areas: proposta.areas })}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-glass-border-dark px-5 py-2 text-sm font-medium text-burgundy hover:bg-soft-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/60">
              {copy.acceptLayout}
            </button>
          </>}
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.contato', 'Contato')}
          pendente={pendente('email') || pendente('phone_number')}
          textoPendente={
            source === 'google' && pendente('email') && !pendente('phone_number')
              ? t('onboarding.folha.faltaEmail', 'O telefone veio do Google. O e-mail precisa ser o seu — é por ele que as confirmações saem.')
              : copy.manualContact
          }
          abertoInicialmente
          resumo={
            <>
              {data.phone_number || t('onboarding.folha.semTelefone', 'Sem telefone')}
              {data.email && !data.email.endsWith('@demo.seatable.one') ? ` · ${data.email}` : ''}
            </>
          }
        >
          <div className="space-y-3">
            <input
              className={entrada}
              value={data.phone_number || ''}
              onChange={(e) => updateData({ phone_number: e.target.value })}
              placeholder={t('onboarding.folha.pTelefone', 'o telefone')}
              aria-label={t('onboarding.folha.pTelefone', 'o telefone')}
            />
            <input
              className={entrada}
              type="email"
              value={data.email?.endsWith('@demo.seatable.one') ? '' : data.email || ''}
              onChange={(e) => updateData({ email: e.target.value })}
              placeholder={t('onboarding.folha.pEmail', 'o e-mail')}
              aria-label={t('onboarding.folha.pEmail', 'o e-mail')}
            />
          </div>
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.voz', 'A voz dela')}
          pendente={pendente('voz')}
          textoPendente={t('onboarding.folha.escolhaSua', 'Essa é a única que só você pode escolher.')}
          abertoInicialmente
          resumo={t('onboarding.folha.vozResumo', 'Como ela fala com seus clientes.')}
        >
          <VozDaCasa vibeTags={vibeTags} valor={vozEscolhida} onEscolher={onEscolherVoz} />
        </BlocoConfirmavel>
      </fieldset>

      {/* Rodapé fixo: o que falta, sempre à vista e sempre nomeado. */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/85 backdrop-blur-xl border-t border-glass-border-dark px-6 py-4">
        <div className="max-w-[620px] mx-auto flex items-center justify-between gap-4">
          <p className="text-[14px] text-warm-stone min-w-0">
            {pendencias.length ? (
              <span className="text-amber-700">
                {t('onboarding.folha.falta', 'Falta {{lista}}.', {
                  lista: pendencias.map((p) => p.rotulo).join(', '),
                })}
              </span>
            ) : (
              t('onboarding.folha.tudoPronto', 'Tudo pronto.')
            )}
          </p>
          <button
            type="button"
            onClick={onConcluir}
            disabled={pendencias.length > 0 || enviando}
            className="flex-shrink-0 px-6 py-3 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {enviando
              ? t('onboarding.folha.enviando', 'Colocando no ar…')
              : t('onboarding.folha.concluir', 'Colocar no ar')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolhaDeConfirmacao;
