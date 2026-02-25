import { useEffect, useCallback, type ReactNode } from 'react';
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
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`
          bg-white shadow-2xl border border-border-gray w-full max-h-[90vh] overflow-y-auto
          ${mobileSheet ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl'}
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
              onClick={onClose}
              aria-label="Close"
              className="text-muted-stone hover:text-stone-gray transition-colors p-1.5 rounded-xl hover:bg-soft-gray"
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
