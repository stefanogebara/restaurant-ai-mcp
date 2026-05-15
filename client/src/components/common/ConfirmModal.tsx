import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Replacement for the native `window.confirm()` blocking prompt that was
 * still used in a couple of host-facing dashboards. The native prompt is
 * ugly, breaks the design system, and on iPad/iOS Safari renders with a
 * default font + layout that looks like a bug to non-technical users.
 *
 * Usage:
 *   const [pending, setPending] = useState<{...} | null>(null);
 *   <ConfirmModal
 *     open={!!pending}
 *     title="Delete this note?"
 *     message="This can't be undone."
 *     confirmLabel="Delete"
 *     confirmTone="danger"
 *     onConfirm={() => { mutate(pending.id); setPending(null); }}
 *     onCancel={() => setPending(null)}
 *   />
 */

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" uses red — for destructive actions. Default uses burgundy. */
  confirmTone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmTone = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  // Close on Escape — restores the keyboard affordance of the native prompt.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // Lock body scroll while open so the underlying page doesn't move when
  // the user reaches for the confirm button on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const confirmClass =
    confirmTone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-burgundy hover:bg-burgundy-dark text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-border-gray p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-modal-title" className="text-lg font-bold text-deep-charcoal mb-2">
          {title}
        </h3>
        {message && (
          <div className="text-sm text-stone-gray mb-6">{message}</div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-border-gray text-stone-gray rounded-xl hover:bg-soft-gray transition-colors font-medium disabled:opacity-50"
          >
            {cancelLabel ?? t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 ${confirmClass}`}
          >
            {isLoading
              ? t('common.loading', 'Loading…')
              : (confirmLabel ?? t('common.confirm', 'Confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
