/**
 * Aviso de painel cego.
 *
 * A auditoria de 01/08 achou o MESMO defeito em seis painéis: todos liam
 * `q.data?.x ?? fallback` e nenhum checava `isError`. Num backend que achata
 * toda falha em 'Internal error', isso vira uma tela que AFIRMA saúde estando
 * cega — "Fila limpa 🎉" quando não sabe, "nenhuma abordagem registrada" quando
 * não conseguiu perguntar.
 *
 * Um componente só, para que a resposta a "e se falhar?" seja a mesma em todo
 * lugar, e para que o próximo painel novo tenha onde se apoiar.
 */
export default function PanelError({
  oQue,
  consequencia,
  onRetry,
}: {
  /** O que não carregou, na língua do usuário: "os insights", "o funil". */
  oQue: string;
  /** Por que importa — o que a pessoa NÃO deve concluir do vazio. */
  consequencia?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2">
      <p className="text-sm text-rose-800">Não consegui carregar {oQue}.</p>
      <p className="text-xs text-rose-700">
        {consequencia ?? 'O que aparece aqui pode estar incompleto — não tire conclusões deste painel agora.'}
        {onRetry && (
          <button type="button" onClick={onRetry} className="ml-2 underline">tentar de novo</button>
        )}
      </p>
    </div>
  );
}
