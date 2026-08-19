import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { attemptChunkReload } from '../../../utils/lazyRetry';

vi.mock('../../../lib/sentry', () => ({
  Sentry: { captureException: vi.fn() },
}));

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div>conteudo ok</div>;
}

describe('ErrorBoundary resetKey', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('mostra o fallback quando o filho quebra', () => {
    render(
      <ErrorBoundary resetKey="/a" fallback={<div>fallback da rota</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('fallback da rota')).toBeInTheDocument();
  });

  it('reseta e volta a renderizar os filhos quando resetKey muda (navegação)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/campanhas" fallback={<div>fallback da rota</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('fallback da rota')).toBeInTheDocument();

    // Usuário clica em outra página — pathname muda, boundary deve destravar.
    rerender(
      <ErrorBoundary resetKey="/dashboard" fallback={<div>fallback da rota</div>}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('conteudo ok')).toBeInTheDocument();
  });

  it('NÃO reseta se resetKey não mudar', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/campanhas" fallback={<div>fallback da rota</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    rerender(
      <ErrorBoundary resetKey="/campanhas" fallback={<div>fallback da rota</div>}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('fallback da rota')).toBeInTheDocument();
  });
});

describe('attemptChunkReload', () => {
  beforeEach(() => {
    sessionStorage.clear();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...original, reload: vi.fn() },
      writable: true,
    });
  });

  it('recarrega na primeira falha e respeita o cooldown na segunda', () => {
    expect(attemptChunkReload()).toBe(true);
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    // Dentro da janela de cooldown: não recarrega (proteção contra loop).
    expect(attemptChunkReload()).toBe(false);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('permite novo reload depois que o cooldown expira', () => {
    sessionStorage.setItem('seatable-chunk-reload-ts', String(Date.now() - 61_000));
    expect(attemptChunkReload()).toBe(true);
  });
});
