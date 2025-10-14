import Toast from './Toast';
import type { ToastType } from './Toast';

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

interface ToastContainerProps {
  toasts: ToastState[];
  onClose: (id: number) => void;
}

export default function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-3">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            animation: 'slideIn 0.3s ease-out',
            animationDelay: `${index * 0.1}s`,
            animationFillMode: 'backwards',
          }}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => onClose(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
