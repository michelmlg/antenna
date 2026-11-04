/** Toasts: confirmação curta de ações (copiado, salvo, pulando…). */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type Tone = "ok" | "error";
interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
  icon?: LucideIcon;
  leaving?: boolean;
}

type ToastFn = (message: ReactNode, opts?: { tone?: Tone; icon?: LucideIcon }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const LIFETIME = 2600;
const EXIT = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback<ToastFn>((message, opts) => {
    const id = ++seq.current;
    setItems((list) => [
      ...list.slice(-3),
      { id, message, tone: opts?.tone ?? "ok", icon: opts?.icon },
    ]);
    window.setTimeout(() => {
      setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), EXIT);
    }, LIFETIME);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8"
        >
          {items.map((t) => {
            const Icon = t.icon ?? (t.tone === "error" ? AlertCircle : Check);
            return (
              <div
                key={t.id}
                role="status"
                className={cn(
                  "flex max-w-md items-center gap-2.5 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm shadow-pop",
                  "transition-[opacity,transform] duration-200",
                  t.leaving ? "translate-y-1 opacity-0" : "animate-slide-up",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0",
                    t.tone === "error" ? "text-danger" : "text-brand",
                  )}
                />
                <span className="min-w-0">{t.message}</span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
