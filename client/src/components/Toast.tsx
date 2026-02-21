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
          bg: 'bg-[#10b981]/20 border-[#10b981]/50',
          icon: '✅',
          iconBg: 'bg-[#10b981]/30',
          text: 'text-[#34d399]',
        };
      case 'error':
        return {
          bg: 'bg-[#ef4444]/20 border-[#ef4444]/50',
          icon: '❌',
          iconBg: 'bg-[#ef4444]/30',
          text: 'text-[#f87171]',
        };
      case 'info':
        return {
          bg: 'bg-[#3b82f6]/20 border-[#3b82f6]/50',
          icon: 'ℹ️',
          iconBg: 'bg-[#3b82f6]/30',
          text: 'text-[#60a5fa]',
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
          className="text-[#A8A29E] hover:text-white transition-colors ml-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
