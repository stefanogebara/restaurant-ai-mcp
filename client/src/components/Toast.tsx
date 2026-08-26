import { useEffect } from 'react';
import ThiingsIcon from './common/ThiingsIcon';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-500/20 border-emerald-500/50',
          iconName: 'check-circle' as const,
          iconBg: 'bg-emerald-500/30',
          text: 'text-emerald-600',
        };
      case 'error':
        return {
          bg: 'bg-red-500/20 border-red-500/50',
          iconName: 'x-circle' as const,
          iconBg: 'bg-red-500/30',
          text: 'text-red-400',
        };
      case 'info':
        return {
          bg: 'bg-stone-500/20 border-stone-500/50',
          iconName: 'info' as const,
          iconBg: 'bg-stone-500/30',
          text: 'text-stone-400',
        };
    }
  };

  const styles = getToastStyles();

  return (
    <div className="fixed top-20 right-6 z-50 animate-slide-in">
      <div
        role="alert"
        aria-live={type === 'error' ? 'assertive' : 'polite'}
        className={`${styles.bg} border-2 rounded-2xl px-5 py-4 shadow-2xl backdrop-blur-sm flex items-center gap-3 min-w-[300px] max-w-md`}
      >
        <div className={`${styles.iconBg} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
          <ThiingsIcon name={styles.iconName} pxSize={20} />
        </div>
        <div className="flex-1">
          <p className={`${styles.text} font-medium text-sm`}>{message}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-muted-stone hover:text-white transition-colors ml-2"
        >
          <ThiingsIcon name="close" pxSize={20} />
        </button>
      </div>
    </div>
  );
}
