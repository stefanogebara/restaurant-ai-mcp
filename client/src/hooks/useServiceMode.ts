import { useEffect, useState, useCallback } from 'react';

const LS_KEY = 'seatable_service_mode_override';
const NIGHT_START = 18; // 18h — o salão escurece junto com a rua
const NIGHT_END = 6;    // até 6h da manhã

export const isNightHour = (hour: number) => hour >= NIGHT_START || hour < NIGHT_END;

type Override = 'on' | 'off' | null;

function readOverride(): Override {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Modo Serviço — a partir das 18h o painel escurece sozinho (host trabalha
 * em salão de luz baixa; tela branca ofusca). O toggle manual grava um
 * override que vence o relógio até o usuário voltar para o estado
 * automático (toggle de novo quando o override coincide com o relógio).
 */
export function useServiceMode() {
  const [override, setOverride] = useState<Override>(readOverride);
  const [autoNight, setAutoNight] = useState(() => isNightHour(new Date().getHours()));

  // Reavalia o relógio a cada minuto — a virada das 18h acontece ao vivo,
  // sem exigir reload no meio do serviço.
  useEffect(() => {
    const id = setInterval(() => setAutoNight(isNightHour(new Date().getHours())), 60_000);
    return () => clearInterval(id);
  }, []);

  const isNight = override !== null ? override === 'on' : autoNight;

  const toggle = useCallback(() => {
    const next: Override = isNight ? 'off' : 'on';
    // Se o destino coincide com o automático, limpa o override — o painel
    // volta a seguir o relógio em vez de ficar preso num estado manual.
    const value: Override = (next === 'on') === autoNight ? null : next;
    setOverride(value);
    try {
      if (value === null) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, value);
    } catch {
      // localStorage indisponível (Safari privado) — o estado em memória basta.
    }
  }, [isNight, autoNight]);

  return { isNight, toggle };
}
