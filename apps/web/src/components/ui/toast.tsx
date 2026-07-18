"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  addToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => {
        const next = [...current, { id, message, type }];
        return next.slice(-4);
      });

      window.setTimeout(() => removeToast(id), 3500);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 md:w-full">
              {toasts.map((toast) => {
                const styles = {
                  success: "bg-emerald-900/80 border-emerald-500/40 text-emerald-200",
                  error: "bg-red-900/80 border-red-500/40 text-red-200",
                  info: "bg-cobalt/20 border-cobalt/40 text-cobalt",
                }[toast.type];
                const Icon = {
                  success: CheckCircle2,
                  error: AlertTriangle,
                  info: Info,
                }[toast.type];

                return (
                  <div
                    key={toast.id}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all duration-200 ${styles}`}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <p className="flex-1">{toast.message}</p>
                    <button type="button" className="text-current/80 transition hover:text-current" onClick={() => removeToast(toast.id)}>
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
