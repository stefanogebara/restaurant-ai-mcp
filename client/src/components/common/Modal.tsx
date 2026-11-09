import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogLifecycle } from '../../hooks/useDialogLifecycle';
import ThiingsIcon from './ThiingsIcon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** If true, renders as bottom sheet on mobile */
  mobileSheet?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  mobileSheet = false,
}: ModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogLifecycle(dialogRef, onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          glass-modal w-full max-h-[90vh] overflow-y-auto focus:outline-none
          ${mobileSheet ? 'rounded-t-2xl sm:rounded-2xl' : ''}
          ${sizeClasses[size]}
        `}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between p-5 sm:p-6 pb-0">
            <div>
              {title && (
                <h3 className="text-lg font-bold text-deep-charcoal">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-stone-gray mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Close')}
              className="text-muted-stone hover:text-stone-gray transition-colors min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-white/40"
            >
              <ThiingsIcon name="close" pxSize={20} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-5 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
