import { useEffect } from 'react';

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
          icon: '✅',
          iconBg: 'bg-emerald-500/30',
          text: 'text-emerald-400',
        };
      case 'error':
        return {
          bg: 'bg-red-500/20 border-red-500/50',
          icon: '❌',
          iconBg: 'bg-red-500/30',
          text: 'text-red-400',
        };
      case 'info':
        return {
          bg: 'bg-blue-500/20 border-blue-500/50',
          icon: 'ℹ️',
          iconBg: 'bg-blue-500/30',
          text: 'text-blue-400',
        };
    }
  };

  const styles = getToastStyles();

  return (
    <div className="fixed top-20 right-6 z-50 animate-slide-in">
      <div
        className={`${styles.bg} border-2 rounded-xl px-5 py-4 shadow-2xl backdrop-blur-sm flex items-center gap-3 min-w-[300px] max-w-md`}
      >
        <div className={`${styles.iconBg} w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0`}>
          {styles.icon}
        </div>
        <div className="flex-1">
          <p className={`${styles.text} font-medium text-sm`}>{message}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors ml-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
