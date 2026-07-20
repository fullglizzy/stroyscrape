import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (type: ToastType, message: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType>(null!);
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
    }, 4000);
  }, []);

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-success)' }} />,
    error: <XCircle className="w-5 h-5" style={{ color: 'var(--color-danger)' }} />,
    warning: <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />,
    info: <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
  };

  return (
    <ToastContext.Provider value={{
      toasts,
      toast: addToast,
      success: (m) => addToast('success', m),
      error: (m) => addToast('error', m),
      warning: (m) => addToast('warning', m),
    }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.exiting ? 'toast-exit' : ''}`}>
            {icons[t.type]}
            <span className="flex-1 text-sm">{t.message}</span>
            <button onClick={() => {
              setToasts(prev => prev.map(x => x.id === t.id ? { ...x, exiting: true } : x));
              setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 200);
            }} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() { return useContext(ToastContext); }
