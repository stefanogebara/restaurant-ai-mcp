import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BlocoConfirmavel } from './BlocoConfirmavel';
import { VozDaCasa } from './VozDaCasa';
import type { Preset } from '../../../lib/personaProposta';
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
}: FolhaDeConfirmacaoProps) {
  const { t } = useTranslation();

  const fonte = veioDoDemo
    ? t('onboarding.folha.fonteDemo', 'você configurou no demo')
    : t('onboarding.folha.fonteGoogle', 'do seu Google');

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
    if (!data.city?.trim()) p.push({ campo: 'city', rotulo: t('onboarding.folha.pCidade', 'a cidade') });
    if (!data.phone_number?.trim()) p.push({ campo: 'phone_number', rotulo: t('onboarding.folha.pTelefone', 'o telefone') });
    if (emailVazio) p.push({ campo: 'email', rotulo: t('onboarding.folha.pEmail', 'o e-mail') });
    if (!diasAbertos.length) p.push({ campo: 'business_hours', rotulo: t('onboarding.folha.pHorarios', 'os horários') });
    if (!vozEscolhida) p.push({ campo: 'voz', rotulo: t('onboarding.folha.pVoz', 'a voz da recepcionista') });
    return p;
  }, [data, diasAbertos.length, vozEscolhida, t]);

  const pendente = (campo: string) => pendencias.some((p) => p.campo === campo);
  const entrada =
    'w-full px-4 py-3 border border-glass-border-input rounded-xl text-[15px] text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-40">
      <header className="pt-12 pb-2">
        <h1 className="font-serif text-[38px] sm:text-[46px] leading-[1.08] tracking-tight text-deep-charcoal text-balance">
          {data.restaurant_name
            ? t('onboarding.folha.titulo', 'Achamos isto sobre o {{nome}}.', { nome: data.restaurant_name })
            : t('onboarding.folha.tituloSemNome', 'Vamos montar sua recepcionista.')}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.6] text-warm-stone">
          {t(
            'onboarding.folha.subtitulo',
            'Confira o que já está certo e ajuste só o que estiver errado. Não precisa preencher nada que a gente já descobriu.',
          )}
        </p>
      </header>

      <div className="divide-y divide-glass-border-dark">
        <BlocoConfirmavel
          titulo={t('onboarding.folha.aCasa', 'A casa')}
          fonte={fonte}
          pendente={pendente('restaurant_name') || pendente('city')}
          resumo={
            <>
              {data.restaurant_name || t('onboarding.folha.semNome', 'Sem nome ainda')}
              {data.city ? ` · ${data.city}` : ''}
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
          </div>
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.horarios', 'Horários')}
          fonte={fonte}
          pendente={pendente('business_hours')}
          resumo={
            diasAbertos.length
              ? t('onboarding.folha.resumoHorarios', '{{n}} dias abertos, das {{de}} às {{ate}}', {
                  n: diasAbertos.length,
                  de: diasAbertos[0]?.open_time,
                  ate: diasAbertos[0]?.close_time,
                })
              : t('onboarding.folha.semHorarios', 'Ainda não sabemos quando vocês abrem')
          }
        >
          <p className="text-[14px] text-warm-stone">
            {t('onboarding.folha.horariosDica', 'Você ajusta dia a dia depois, no painel — aqui só precisa estar perto do certo.')}
          </p>
        </BlocoConfirmavel>

        <BlocoConfirmavel
          titulo={t('onboarding.folha.contato', 'Contato')}
          pendente={pendente('email') || pendente('phone_number')}
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
          abertoInicialmente
          resumo={t('onboarding.folha.vozResumo', 'Como ela fala com seus clientes.')}
        >
          <VozDaCasa vibeTags={vibeTags} valor={vozEscolhida} onEscolher={onEscolherVoz} />
        </BlocoConfirmavel>
      </div>

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
