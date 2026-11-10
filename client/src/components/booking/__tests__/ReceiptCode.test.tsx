import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReceiptCode from '../ReceiptCode';

const CODE = 'RES-20261110-aB_cD-eF12_X';
let clipboardDescriptor: PropertyDescriptor | undefined;
beforeEach(() => { clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard'); });
afterEach(async () => {
  cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  await i18n.changeLanguage('en');
});
function clipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

const locales = [
  { language: 'en', label: 'Copy code', copied: 'Code copied.', manual: 'Could not copy. Select the full code above and copy it manually.' },
  { language: 'pt-BR', label: 'Copiar código', copied: 'Código copiado.', manual: 'Não foi possível copiar. Selecione o código completo acima e copie manualmente.' },
  { language: 'es', label: 'Copiar código', copied: 'Código copiado.', manual: 'No se pudo copiar. Selecciona el código completo de arriba y cópialo manualmente.' },
];

describe.each(locales)('receipt code in $language', ({ language, label, copied, manual }) => {
  beforeEach(async () => { await i18n.changeLanguage(language); });

  it('shows the complete selectable code with a wrap contract and reports success only after clipboard resolution', async () => {
    let finish!: () => void;
    const writeText = vi.fn().mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    clipboard({ writeText });
    render(<ReceiptCode code={CODE} />);
    const code = screen.getByText(CODE);
    expect(code).toBeVisible();
    expect(code.textContent).toBe(CODE);
    expect(code).toHaveClass('block', 'w-full', 'min-w-0', 'max-w-full', 'break-all', 'whitespace-normal', 'select-all');
    expect(code).not.toHaveClass('truncate', 'overflow-hidden', 'whitespace-nowrap');
    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveClass('min-h-[44px]', 'focus-visible:ring-2');
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODE);
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText(copied)).not.toBeInTheDocument();
    await act(async () => { finish(); });
    expect(screen.getByRole('status')).toHaveTextContent(copied);
    expect(screen.getByRole('status')).toHaveClass('text-emerald-700');
    expect(button).toBeEnabled();
  });

  it.each(['denied', 'unavailable'])('shows manual-copy instructions for %s clipboard access, never copied feedback', async reason => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    clipboard(reason === 'denied' ? { writeText } : undefined);
    render(<ReceiptCode code={CODE} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByText(manual)).toBeVisible();
    expect(screen.getByRole('status')).not.toHaveTextContent(copied);
    expect(screen.getByText(CODE).textContent).toBe(CODE);
    expect(screen.getByText(CODE)).toBeVisible();
    if (reason === 'denied') expect(writeText).toHaveBeenCalledExactlyOnceWith(CODE);
    else expect(writeText).not.toHaveBeenCalled();
  });

  it.each(['{Enter}', ' '])('copies the exact opaque code with keyboard activation %s', async key => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard({ writeText });
    render(<ReceiptCode code={CODE} />);
    await user.tab();
    expect(screen.getByRole('button', { name: label })).toHaveFocus();
    await user.keyboard(key);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODE);
    expect(screen.getByRole('status')).toHaveTextContent(copied);
  });
});

it('does not display stale success for a different receipt code', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  clipboard({ writeText });
  const { rerender } = render(<ReceiptCode code={CODE} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
  await screen.findByText('Code copied.');
  rerender(<ReceiptCode code="RES-20261110-Xy_Z-456" />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.getByText('RES-20261110-Xy_Z-456')).toBeVisible();
});
