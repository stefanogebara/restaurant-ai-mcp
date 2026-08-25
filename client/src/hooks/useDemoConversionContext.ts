/**
 * Contexto do demo na tela de login (G1 — Onboarding do Aha).
 *
 * Resolve dois problemas de uma vez:
 *
 * 1. CAPTURA SÍNCRONA dos params. O efeito que limpa `?from=demo&token=` da
 *    URL roda DEPOIS do primeiro render; a partir daí `searchParams` não tem
 *    mais os valores. Os handlers de OAuth liam os params no clique — ou
 *    seja, já limpos: o forwarding para o round-trip do provedor era código
 *    morto na prática, e o localStorage era o único fio real (que o modo
 *    privado corta com um catch vazio). O initializer preguiçoso do useState
 *    roda DURANTE o primeiro render, antes de qualquer efeito.
 *
 * 2. IDENTIDADE do demo para a tela. O convert chegava numa tela genérica
 *    ("Bem-vindo de volta") 30 segundos depois de ver a própria IA fechar uma
 *    reserva. Com o nome do restaurante em mãos, o login continua o aha em
 *    vez de apagá-lo.
 *
 * Demo expirado/inválido → a sessão 404 e tudo volta à tela padrão. É a
 * degradação certa: nunca prometemos um demo que não existe mais.
 */
import { useState, useEffect } from 'react';
import { LS_PENDING_DEMO_TOKEN } from '../config/localStorageKeys';

export interface DemoConversionContext {
  /** Token do demo — da URL ou do localStorage. Sobrevive ao scrub. */
  token: string | null;
  /** `from=demo` estava na URL desta visita (não vale o token guardado). */
  fromDemoParam: boolean;
  restaurantName: string | null;
  city: string | null;
  daysLeft: number | null;
  /** Buscando a sessão — evita piscar a tela genérica antes da variante. */
  loading: boolean;
}

interface CapturedParams {
  token: string | null;
  fromDemoParam: boolean;
}

export function useDemoConversionContext(): DemoConversionContext {
  const [captured] = useState<CapturedParams>(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const urlToken = p.get('token');
      const fromDemoParam = p.get('from') === 'demo';
      if (fromDemoParam && urlToken) return { token: urlToken, fromDemoParam: true };
      // Sem params: OAuth de volta, link de reset de senha, ou reload — o
      // token guardado ainda identifica o demo pendente.
      return { token: localStorage.getItem(LS_PENDING_DEMO_TOKEN), fromDemoParam };
    } catch {
      return { token: null, fromDemoParam: false };
    }
  });

  const [info, setInfo] = useState<{ name: string; city: string | null; daysLeft: number | null } | null>(null);
  const [loading, setLoading] = useState(Boolean(captured.token));

  useEffect(() => {
    if (!captured.token) return;
    let vivo = true;
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    fetch(`${apiBase}/demo/session?token=${encodeURIComponent(captured.token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo || !d?.success || !d.restaurant) return;
        setInfo({
          name: d.restaurant.restaurant_name || '',
          city: d.restaurant.city || null,
          daysLeft: typeof d.daysLeft === 'number' ? d.daysLeft : null,
        });
      })
      .catch(() => { /* demo expirado ou rede — cai na tela padrão */ })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [captured.token]);

  return {
    token: captured.token,
    fromDemoParam: captured.fromDemoParam,
    restaurantName: info?.name || null,
    city: info?.city ?? null,
    daysLeft: info?.daysLeft ?? null,
    loading,
  };
}
