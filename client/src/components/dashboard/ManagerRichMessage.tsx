/**
 * Corpo de uma mensagem do Manager AI: markdown + gráficos + diagramas,
 * renderizados AO VIVO durante o streaming.
 *
 * Um fence ```chart/```mermaid ainda aberto (tokens chegando) vira o
 * esqueleto "montando…" com o brilho líquido; quando o fence fecha, o bloco
 * real assume com a animação de entrada do recharts/mermaid.
 */

import { useTranslation } from 'react-i18next';
import { renderMarkdown } from '../../utils/markdownRenderer';
import { splitRichBlocks } from '../../utils/managerRichBlocks';
import ManagerChart from './ManagerChart';
import ManagerMermaid from './ManagerMermaid';

export default function ManagerRichMessage({ content }: { content: string }) {
  const { t } = useTranslation();
  const blocks = splitRichBlocks(content);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'md') return <span key={i}>{renderMarkdown(b.text)}</span>;
        if (b.kind === 'chart') return <ManagerChart key={i} spec={b.spec} />;
        if (b.kind === 'mermaid') return <ManagerMermaid key={i} code={b.code} />;
        return (
          <div key={i} className="my-2.5 rounded-2xl bg-white/40 border border-glass-border p-4 space-y-2" role="status">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-stone">
              {b.fence === 'chart'
                ? t('managerAI.buildingChart', 'Montando gráfico…')
                : t('managerAI.buildingDiagram', 'Montando diagrama…')}
            </div>
            <div className="thought-active h-3 w-3/4 rounded" />
            <div className="thought-active h-3 w-1/2 rounded" />
          </div>
        );
      })}
    </>
  );
}
