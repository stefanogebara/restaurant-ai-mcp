/**
 * Diagrama mermaid inline das respostas do Manager AI.
 *
 * A lib pesa ~500KB gz, então entra por import DINÂMICO: quem nunca recebe um
 * diagrama nunca paga o bundle. securityLevel 'strict' (sanitização da própria
 * lib) porque o código vem do LLM. Erro de sintaxe degrada pro código cru em
 * <pre> — nunca quebra a conversa.
 */

import { useEffect, useRef, useState } from 'react';

let mermaidReady: Promise<typeof import('mermaid')['default']> | null = null;
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: "'DM Sans', sans-serif",
        themeVariables: {
          primaryColor: '#FDF2F4',
          primaryBorderColor: '#9F1239',
          primaryTextColor: '#1C1917',
          lineColor: '#706A65',
        },
      });
      return m.default;
    });
  }
  return mermaidReady;
}

let seq = 0;

export default function ManagerMermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`manager-mermaid-${++seq}`);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code))
      .then(({ svg: out }) => { if (alive) setSvg(out); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [code]);

  if (failed) {
    return (
      <pre className="my-2.5 rounded-2xl bg-white/50 border border-glass-border p-3 text-xs text-muted-stone overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
    );
  }
  if (!svg) {
    return (
      <div className="my-2.5 rounded-2xl bg-white/40 border border-glass-border p-4">
        <div className="thought-active h-4 w-40 rounded" />
      </div>
    );
  }
  return (
    <div
      className="my-2.5 rounded-2xl bg-white/50 border border-glass-border p-3 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      // Saída do mermaid com securityLevel strict — sanitizada pela lib.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
