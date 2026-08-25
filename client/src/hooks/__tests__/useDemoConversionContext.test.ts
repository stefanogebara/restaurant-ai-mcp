/**
 * useDemoConversionContext — o fio do token na tela de login (G1).
 *
 * O que estes testes prendem é exatamente o que quebrou na auditoria:
 * a captura tem que acontecer ANTES do scrub da URL (o efeito que limpa
 * ?from=demo&token=), senão o forwarding para o OAuth lê params vazios.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDemoConversionContext } from '../useDemoConversionContext';
import { LS_PENDING_DEMO_TOKEN } from '../../config/localStorageKeys';

const SESSAO = {
  success: true,
  restaurant: { restaurant_name: 'Mocotó Bar e Restaurante', city: 'São Paulo' },
  daysLeft: 6,
};

function comUrl(search: string) {
  window.history.replaceState({}, '', `/login${search}`);
}

describe('useDemoConversionContext', () => {
  beforeEach(() => {
    localStorage.clear();
    comUrl('');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('captura o token da URL e busca a identidade do demo', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => SESSAO });
    comUrl('?from=demo&token=tok-123');

    const { result } = renderHook(() => useDemoConversionContext());
    expect(result.current.token).toBe('tok-123');
    expect(result.current.fromDemoParam).toBe(true);

    await waitFor(() => expect(result.current.restaurantName).toBe('Mocotó Bar e Restaurante'));
    expect(result.current.city).toBe('São Paulo');
    expect(result.current.daysLeft).toBe(6);
    expect(result.current.loading).toBe(false);
  });

  it('o token SOBREVIVE ao scrub da URL — é isto que o OAuth lê no clique', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => SESSAO });
    comUrl('?from=demo&token=tok-123');

    const { result } = renderHook(() => useDemoConversionContext());
    // Simula o efeito de scrub do Login.tsx rodando logo após o primeiro render.
    comUrl('');
    await waitFor(() => expect(result.current.restaurantName).toBeTruthy());
    expect(result.current.token).toBe('tok-123');
  });

  it('sem params, cai no token guardado (volta do OAuth / reset de senha)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => SESSAO });
    localStorage.setItem(LS_PENDING_DEMO_TOKEN, 'tok-stash');

    const { result } = renderHook(() => useDemoConversionContext());
    expect(result.current.token).toBe('tok-stash');
    // fromDemoParam é da VISITA — token guardado não inventa origem.
    expect(result.current.fromDemoParam).toBe(false);
    await waitFor(() => expect(result.current.restaurantName).toBeTruthy());
  });

  it('demo expirado degrada para a tela padrão, sem prometer o que não existe', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ error: 'Demo not found or expired' }),
    });
    comUrl('?from=demo&token=tok-morto');

    const { result } = renderHook(() => useDemoConversionContext());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.restaurantName).toBeNull();
  });

  it('sem token não busca nada', () => {
    const { result } = renderHook(() => useDemoConversionContext());
    expect(result.current.token).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
