/**
 * Modal acessível: portal no body, Esc/clique fora fecham, trava o scroll da
 * página e foca o primeiro campo. `bare` entrega o painel vazio (layouts próprios,
 * ex.: Configurações com sidebar).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./button";
import { cn } from "./cn";

const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "sm",
  bare = false,
  className,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
  bare?: boolean;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([readonly]), select, textarea, [data-autofocus]",
    );
    (first ?? panelRef.current)?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm sm:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "flex max-h-full w-full animate-pop-in flex-col overflow-hidden border border-line bg-panel shadow-pop outline-none sm:max-h-[88vh] sm:rounded-2xl",
          widths[size],
          bare ? "h-full" : "mx-4 rounded-2xl sm:mx-0",
          className,
        )}
      >
        {bare ? (
          children
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-6 pt-5">
              <h2 className="text-base font-semibold">{title}</h2>
              <IconButton icon={X} label="Fechar" onClick={onClose} className="-mr-2" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
