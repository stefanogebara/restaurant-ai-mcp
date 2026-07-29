import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../services/api';

/**
 * Confirmação de CNPJ + sócio — item 5 do plano zero-toque.
 *
 * O índice da Receita já sabe a razão social e QUEM SÃO OS SÓCIOS do
 * restaurante. Isso permite a pergunta que nenhum concorrente faz:
 * em vez de "qual seu cargo?", "você é o Jorge ou a Keila?" — que confirma
 * que quem está cadastrando é dono de verdade, sem pedir documento nenhum.
 *
 * Regras que o painel respeita:
 *  - nada é escolhido sozinho. O backend só marca `sugerido` com confiança
 *    alta, e mesmo assim o dono precisa CLICAR. Casar CNPJ errado põe dado
 *    fiscal de outra empresa no cadastro, em silêncio;
 *  - é sempre pulável. Restaurante novo pode não ter CNPJ no índice ainda, e
 *    ninguém deve travar o onboarding por causa disso;
 *  - falha de rede aparece; não vira tela vazia fingindo "não achamos nada".
 */

interface Socio {
  nome: string;
  qualificacao: string | null;
}

interface Candidato {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  municipio: string | null;
  uf: string | null;
  situacao: string | null;
  porte: string | null;
  do_setor_de_alimentacao: boolean;
  socios: Socio[];
  confianca: number;
}

interface Props {
  nome: string;
  cidade?: string;
  /** Chamado quando o dono confirma empresa + quem ele é. */
  onConfirm: (dados: { cnpj: string; razao_social: string | null; socio_confirmado?: string }) => void;
  onSkip: () => void;
}

/** CNPJ legível: 38.793.527/0001-93 */
function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function CnpjConfirmPanel({ nome, cidade, onConfirm, onSkip }: Props) {
  const { t } = useTranslation();
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!nome || nome.trim().length < 3) { setCarregando(false); return; }

    const params = new URLSearchParams({ nome: nome.trim() });
    if (cidade) params.set('cidade', cidade);

    authFetch(`/api/enrich-cnpj?${params.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
        setCandidatos(j.data.candidatos || []);
        // Sugestão do backend fica PRÉ-SELECIONADA, nunca confirmada — o
        // clique do dono continua sendo obrigatório.
        if (j.data.sugerido) setEscolhido(j.data.sugerido);
      })
      .catch((e: Error) => {
        if (!vivo) return;
        // Falha visível: uma lista vazia silenciosa faria o dono acreditar
        // que a empresa dele não existe no cadastro da Receita.
        console.warn('[cnpj] busca falhou:', e.message);
        setErro(e.message);
      })
      .finally(() => { if (vivo) setCarregando(false); });

    return () => { vivo = false; };
  }, [nome, cidade]);

  if (carregando) {
    return (
      <p className="text-sm text-[#9CA3AF] py-4">
        {t('onboarding.cnpj.loading', 'Procurando sua empresa no cadastro da Receita...')}
      </p>
    );
  }

  // Sem candidato (ou erro) não é beco sem saída: segue sem CNPJ.
  if (erro || !candidatos || candidatos.length === 0) {
    return (
      <div className="py-4">
        <p className="text-sm text-[#6B7280]">
          {erro
            ? t('onboarding.cnpj.error', 'Não conseguimos consultar o cadastro da Receita agora.')
            : t('onboarding.cnpj.notFound', 'Não encontramos sua empresa no cadastro da Receita.')}
        </p>
        <p className="text-xs text-[#9CA3AF] mt-1">
          {t('onboarding.cnpj.skipHint', 'Sem problema — você pode informar isso depois.')}
        </p>
        <button type="button" onClick={onSkip} className="mt-3 text-sm text-burgundy underline">
          {t('onboarding.cnpj.continue', 'Continuar')}
        </button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <h3 className="text-sm font-semibold text-[#111827]">
        {t('onboarding.cnpj.title', 'Confirme sua empresa')}
      </h3>
      <p className="text-xs text-[#6B7280] mt-1 mb-3">
        {t('onboarding.cnpj.subtitle', 'Encontramos isto no cadastro da Receita. Confirme qual é a sua.')}
      </p>

      <div className="space-y-2">
        {candidatos.map((c) => {
          const ativo = escolhido?.cnpj === c.cnpj;
          return (
            <button
              key={c.cnpj}
              type="button"
              onClick={() => setEscolhido(c)}
              className={`w-full text-left border rounded-xl px-3 py-2.5 transition-colors ${
                ativo ? 'border-burgundy bg-burgundy/[4%]' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#111827] truncate">
                    {c.razao_social || c.nome_fantasia || formatarCnpj(c.cnpj)}
                  </p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    {formatarCnpj(c.cnpj)}
                    {c.municipio ? ` · ${c.municipio}${c.uf ? `/${c.uf}` : ''}` : ''}
                    {c.porte ? ` · ${c.porte.toLowerCase()}` : ''}
                  </p>
                </div>
                {/* Situação cadastral importa: empresa baixada quase nunca é o
                    restaurante em operação, e o dono precisa ver isso. */}
                {c.situacao && c.situacao.toUpperCase() !== 'ATIVA' && (
                  <span className="shrink-0 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    {c.situacao.toLowerCase()}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* A pergunta que nenhum concorrente faz. */}
      {escolhido && escolhido.socios.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-[#111827]">
            {t('onboarding.cnpj.whoAreYou', 'E você é qual dos sócios?')}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {escolhido.socios.map((s) => (
              <button
                key={s.nome}
                type="button"
                onClick={() => onConfirm({
                  cnpj: escolhido.cnpj,
                  razao_social: escolhido.razao_social,
                  socio_confirmado: s.nome,
                })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E7EB] hover:border-burgundy hover:text-burgundy transition-colors"
              >
                {s.nome}
              </button>
            ))}
            {/* Gerente contratado, sócio novo que ainda não consta, contador
                fazendo o cadastro — todos são casos reais. Forçar a escolha
                de um nome errado seria pior que não perguntar. */}
            <button
              type="button"
              onClick={() => onConfirm({ cnpj: escolhido.cnpj, razao_social: escolhido.razao_social })}
              className="px-3 py-1.5 rounded-lg text-xs text-[#6B7280] border border-dashed border-[#E5E7EB] hover:border-[#9CA3AF]"
            >
              {t('onboarding.cnpj.otherPerson', 'Outra pessoa')}
            </button>
          </div>
        </div>
      )}

      {escolhido && escolhido.socios.length === 0 && (
        <button
          type="button"
          onClick={() => onConfirm({ cnpj: escolhido.cnpj, razao_social: escolhido.razao_social })}
          className="mt-4 w-full bg-[#111827] text-white rounded-lg py-2.5 text-sm font-medium"
        >
          {t('onboarding.cnpj.confirm', 'Confirmar')}
        </button>
      )}

      <button type="button" onClick={onSkip} className="mt-3 text-xs text-[#9CA3AF] underline">
        {t('onboarding.cnpj.skip', 'Nenhuma dessas / informar depois')}
      </button>
    </div>
  );
}
