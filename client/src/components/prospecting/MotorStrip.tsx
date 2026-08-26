import { useQuery } from '@tanstack/react-query';
import ThiingsIcon from '../common/ThiingsIcon';
import { api } from '../../services/api';
import { httpStatus } from './types';

/**
 * Faixa de saúde do motor — o que faz a Olímpia emudecer.
 *
 * Três coisas a silenciaram nas últimas semanas e NENHUMA aparecia no console:
 *   1. saldo do LLM zerado (31/07: US$-0,03 e a agente parou de responder);
 *   2. cron do motor parado (prospect-flush desligado = agente muda, tela verde);
 *   3. lead com pergunta esperando resposta (Coco Bambu: 15h de silêncio).
 *
 * Regra que rege este componente: quando não dá pra saber, ele DIZ que não sabe.
 * O resto do cockpit lia `q.data?.x ?? fallback` e pintava verde no escuro — é
 * exatamente o que esta faixa existe para não repetir.
 */

interface Motor {
  llm: { status: string; detalhe: string };
  crons: Array<{ name: string; status: string; age: string | null }> | null;
  esperando: {
    horas_minimas: number;
    total: number;
    /** Dentro da janela de 24h da Meta: dá pra responder com texto livre HOJE. */
    acionavel?: number;
    /** Passou de 24h: texto livre não sai mais. É triagem, não resposta. */
    fora_da_janela?: number;
    /** Varredura truncada: o total é piso, não valor exato. */
    parcial?: boolean;
    leads: Array<{ id: string; name: string; horas: number }>;
    leads_fora_da_janela?: Array<{ id: string; name: string; horas: number }>;
  };
  indicados?: Array<{ id: string; name: string; numero: string; contexto: string | null }>;
  /** null = não consegui checar. Diferente de "não houve". */
  fallback?: { total_24h: number; ultimo: string | null; para: string | null } | null;
  gasto?: { total_24h: number; chamadas: number; top: Array<{ origem: string; usd: number }> } | null;
}

/** Link que abre o WhatsApp do fundador já na conversa certa. */
const linkWhats = (numero: string) => `https://wa.me/${numero.replace(/\D/g, '')}`;

const TOM: Record<string, string> = {
  ok: 'text-emerald-700',
  atencao: 'text-amber-700',
  falha: 'text-rose-700',
  nao_configurado: 'text-stone-500',
};
const PONTO: Record<string, string> = {
  ok: 'bg-emerald-500',
  atencao: 'bg-amber-500',
  falha: 'bg-rose-600',
  nao_configurado: 'bg-stone-400',
};

/** Nome curto do cron, sem o prefixo que se repete em todos. */
const rotuloCron = (n: string) => n.replace(/^prospect-/, '');

function Item({ status, children, title }: { status: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${TOM[status] ?? 'text-stone-600'}`} title={title}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${PONTO[status] ?? 'bg-stone-400'}`} />
      {children}
    </span>
  );
}

export default function MotorStrip() {
  const q = useQuery({
    queryKey: ['prospect-admin', 'motor'],
    queryFn: async () => (await api.get<{ data: Motor }>('/prospect-admin?action=motor')).data.data,
    refetchInterval: 60000,
    retry: (count, err) => httpStatus(err) !== 403 && count < 2,
  });

  // A própria faixa precisa obedecer a regra que ela cobra dos outros painéis.
  if (q.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2">
        <p className="text-xs text-rose-800">
          Não consegui checar a saúde do motor (saldo do LLM, crons, fila de espera).
          <button type="button" onClick={() => q.refetch()} className="ml-2 underline">tentar de novo</button>
        </p>
      </div>
    );
  }
  if (q.isLoading || !q.data) {
    return <div className="rounded-xl border border-stone-200 bg-white/50 px-4 py-2 text-xs text-stone-500">checando o motor…</div>;
  }

  const m = q.data;
  const cronsRuins = (m.crons ?? []).filter((c) => c.status !== 'healthy');
  // O alarme é sobre quem AINDA dá pra responder. Casas fora da janela de 24h
  // não recebem texto livre nem que a gente queira; deixá-las no alerta o
  // mantinha vermelho para sempre (13 delas estavam há 36 dias), e alarme que
  // nunca apaga é alarme que ninguém lê.
  const acionavel = m.esperando.acionavel ?? m.esperando.total;
  const foraDaJanela = m.esperando.fora_da_janela ?? 0;
  const esperandoStatus = acionavel > 0 ? 'falha' : 'ok';
  const indicados = m.indicados ?? [];

  return (
    <div className="space-y-2">
    {indicados.length > 0 && (
      <details className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-2">
        <summary className="text-xs text-stone-900 cursor-pointer">
          <ThiingsIcon name="clipboard-list" pxSize={13} className="inline text-warm-stone mr-1" /> <strong>{indicados.length}</strong> {indicados.length === 1 ? 'casa indicou' : 'casas indicaram'} outro número — a Olímpia não escreve para eles
        </summary>
        <p className="text-[11px] text-stone-800 mt-1.5 mb-2">
          Números que a própria casa publicou (menu do robô, “fale com a central”). É contato frio sem modelo aprovado,
          então quem decide falar é você — pelo seu WhatsApp.
        </p>
        <ul className="space-y-1.5">
          {indicados.map((i) => (
            <li key={i.id} className="text-xs">
              <a href={linkWhats(i.numero)} target="_blank" rel="noreferrer" className="font-mono text-stone-900 underline">
                {i.numero}
              </a>
              <span className="text-stone-700"> · {i.name}</span>
              {i.contexto && (
                <span className="block text-[10px] text-stone-500 truncate" title={i.contexto}>“{i.contexto}”</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    )}

    <div className="rounded-xl border border-stone-200 bg-white/60 px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
      <Item status={m.llm.status} title="Sem saldo no OpenRouter a Olímpia não consegue formular resposta — ela para de responder, mesmo com tudo o mais funcionando.">
        cérebro: {m.llm.detalhe}
      </Item>

      {/* Para onde o dinheiro está indo. Antes disso, o gasto só existia no
          painel do OpenRouter — e US$328 de US$350 sumiram sem ninguém saber
          em quê. */}
      {m.gasto && m.gasto.chamadas > 0 && (
        <Item
          status={m.gasto.total_24h > 5 ? 'atencao' : 'ok'}
          title={
            'Custo real (cobrado pelo OpenRouter), por quem chamou:\n' +
            m.gasto.top.map((t) => `  ${t.origem}: US$${t.usd.toFixed(4)}`).join('\n')
          }
        >
          gasto 24h: US${m.gasto.total_24h.toFixed(2)} em {m.gasto.chamadas} chamadas
          {m.gasto.top[0] && ` · maior: ${m.gasto.top[0].origem}`}
        </Item>
      )}

      {/* O gasto mudou de bolso. Quando o OpenRouter zera, o ai-client cai pra
          Anthropic direta: a agente continua respondendo, mas o custo sai do
          painel que você olha. Antes isso vivia só num logger.warn. */}
      {m.fallback === null ? (
        <Item status="atencao" title="Não consegui consultar o registro de troca de provedor.">
          plano B: não consegui checar
        </Item>
      ) : m.fallback && m.fallback.total_24h > 0 ? (
        <Item
          status="falha"
          title={`O OpenRouter recusou por falta de crédito e as chamadas foram para ${m.fallback.para ?? 'o provedor reserva'}. O agente seguiu respondendo, mas esse gasto NÃO aparece no saldo do OpenRouter. Último: ${m.fallback.ultimo ? new Date(m.fallback.ultimo).toLocaleString('pt-BR') : '—'}`}
        >
          plano B disparou {m.fallback.total_24h}× em 24h — gasto foi pra {m.fallback.para ?? 'reserva'}
        </Item>
      ) : null}

      {m.crons === null ? (
        <Item status="atencao" title="A checagem de saúde dos crons falhou. Não sei se o motor está rodando.">
          motor: não consegui checar
        </Item>
      ) : cronsRuins.length === 0 ? (
        <Item status="ok" title="Os 5 crons que fazem a Olímpia funcionar rodaram dentro do esperado.">
          motor: {m.crons.length} rotinas em dia
        </Item>
      ) : (
        <Item
          status="falha"
          title={cronsRuins.map((c) => `${c.name}: ${c.status}${c.age ? ` (última: ${c.age})` : ''}`).join(' · ')}
        >
          motor: {cronsRuins.map((c) => `${rotuloCron(c.name)} ${c.status === 'never_run' ? 'nunca rodou' : `parado há ${c.age}`}`).join(', ')}
        </Item>
      )}

      <Item
        status={esperandoStatus}
        title={
          m.esperando.total > 0
            ? `Escreveram e não foram respondidos: ${m.esperando.leads.map((l) => `${l.name} (${l.horas}h)`).join(', ')}`
            : `Nenhum lead com mensagem sem resposta há mais de ${m.esperando.horas_minimas}h.`
        }
      >
        {acionavel > 0
          ? `${m.esperando.parcial ? 'pelo menos ' : ''}${acionavel} esperando resposta há +${m.esperando.horas_minimas}h`
          : 'ninguém esperando resposta'}
      </Item>

      {/*
        Fora da janela de 24h: nem alarme nem invisível. Texto livre não sai
        mais, então não é "responder", é decidir — template de resgate ou
        arquivar. Ficava somado ao alerta, mantendo-o vermelho para sempre.
      */}
      {foraDaJanela > 0 && (
        <Item
          status="ok"
          title={
            `Passaram da janela de 24h do WhatsApp — texto livre não é mais entregue. `
            + `Precisam de template aprovado ou de arquivamento: `
            + `${(m.esperando.leads_fora_da_janela ?? []).map((l) => `${l.name} (${Math.floor(l.horas / 24)}d)`).join(', ')}`
          }
        >
          {`${foraDaJanela} fora da janela de 24h — triagem, não resposta`}
        </Item>
      )}
    </div>
    </div>
  );
}
