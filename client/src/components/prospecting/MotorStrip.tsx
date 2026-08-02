import { useQuery } from '@tanstack/react-query';
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
    /** Varredura truncada: o total é piso, não valor exato. */
    parcial?: boolean;
    leads: Array<{ id: string; name: string; horas: number }>;
  };
}

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
  const esperandoStatus = m.esperando.total > 0 ? 'falha' : 'ok';

  return (
    <div className="rounded-xl border border-stone-200 bg-white/60 px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
      <Item status={m.llm.status} title="Sem saldo no OpenRouter a Olímpia não consegue formular resposta — ela para de responder, mesmo com tudo o mais funcionando.">
        cérebro: {m.llm.detalhe}
      </Item>

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
            ? `Estes leads escreveram e não foram respondidos: ${m.esperando.leads.map((l) => `${l.name} (${l.horas}h)`).join(', ')}`
            : `Nenhum lead com mensagem sem resposta há mais de ${m.esperando.horas_minimas}h.`
        }
      >
        {m.esperando.total > 0
          ? `${m.esperando.parcial ? 'pelo menos ' : ''}${m.esperando.total} esperando resposta há +${m.esperando.horas_minimas}h`
          : 'ninguém esperando resposta'}
      </Item>
    </div>
  );
}
