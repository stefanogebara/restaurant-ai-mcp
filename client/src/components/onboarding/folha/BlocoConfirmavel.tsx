import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A unidade da folha de confirmação.
 *
 * O onboarding em passos pede que o dono PREENCHA. A folha pede que ele
 * CONFIRME — e a diferença não é de layout, é de quanto trabalho sobra para
 * ele. Por isso o estado de repouso deste bloco é o valor já pronto, em prosa,
 * com a fonte à mostra; o formulário só aparece se ele discordar.
 *
 * A fonte importa mais do que parece. "do seu Google" ao lado do horário é o
 * que separa "o sistema adivinhou" de "o sistema pesquisou" — e é o mesmo
 * contrato dos cards de fase do Manager AI: nunca afirmar um trabalho que não
 * aconteceu. Bloco sem fonte não exibe rótulo nenhum, em vez de inventar um.
 */

export interface BlocoConfirmavelProps {
  titulo: string;
  /** O valor já descoberto, em prosa. É o estado de repouso. */
  resumo: ReactNode;
  /** De onde veio — "do seu Google", "você configurou no demo". Opcional. */
  fonte?: string;
  /** O formulário, revelado só quando o dono discorda. */
  children?: ReactNode;
  /** Um bloco pendente não pode passar despercebido na rolagem. */
  pendente?: boolean;
  /**
   * O que dizer quando está pendente. O padrão ("a gente não descobriu")
   * mente em dois casos: quando parte do bloco FOI descoberta (o telefone
   * veio, só o e-mail falta) e quando o campo não é descobrível de jeito
   * nenhum — a voz é escolha do dono, não achado de pesquisa.
   */
  textoPendente?: string;
  /** Abre já editando — para o que ainda não temos resposta. */
  abertoInicialmente?: boolean;
}

export function BlocoConfirmavel({
  titulo,
  resumo,
  fonte,
  children,
  pendente = false,
  textoPendente,
  abertoInicialmente = false,
}: BlocoConfirmavelProps) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(abertoInicialmente || pendente);

  return (
    <section
      className={`py-5 ${pendente ? 'border-l-2 border-amber-500 pl-4 -ml-4' : ''}`}
      aria-labelledby={`bloco-${titulo}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          {/* `font-sans` explícito: o index.css força Instrument Serif em TODO
              h1..h6, e sem isto o rótulo de seção sai em serifa versalete em
              vez do token do DESIGN.md. Só apareceu no screenshot — no texto
              da página a diferença é invisível. */}
          <h2
            id={`bloco-${titulo}`}
            className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone"
          >
            {titulo}
          </h2>
          <div className="mt-1.5 text-[17px] leading-[1.5] text-deep-charcoal">{resumo}</div>
          {/* Estado, não ação — âmbar, nunca burgundy (DESIGN.md). */}
          {fonte && !pendente && (
            <p className="mt-1 text-[13px] text-warm-stone">{fonte}</p>
          )}
          {pendente && (
            <p className="mt-1 text-[13px] text-amber-700">
              {textoPendente || t('onboarding.folha.faltaIsso', 'Só isso a gente não descobriu sozinho.')}
            </p>
          )}
        </div>

        {children && !pendente && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="flex-shrink-0 text-[14px] text-burgundy hover:text-burgundy-dark underline underline-offset-2 transition-colors"
          >
            {aberto
              ? t('onboarding.folha.fechar', 'Pronto')
              : t('onboarding.folha.ajustar', 'Ajustar')}
          </button>
        )}
      </div>

      {children && aberto && <div className="mt-4">{children}</div>}
    </section>
  );
}

export default BlocoConfirmavel;
