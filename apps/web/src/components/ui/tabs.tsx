/**
 * Tabs (underline que desliza até a aba ativa) e Segmented (pílula que desliza
 * entre opções). Mesma técnica: mede o botão ativo e anima posição/largura.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

function useIndicator<T extends string>(ids: T[], active: T) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  const key = ids.join("|");
  useLayoutEffect(() => {
    const place = () => {
      const el = refs.current[ids.indexOf(active)];
      if (el) setRect({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    refs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);
  return { refs, rect };
}

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  /** contador discreto ao lado do rótulo */
  count?: number;
  /** ponto de alerta */
  dot?: boolean;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  aside,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  /** conteúdo à direita da barra (filtros, ações) */
  aside?: ReactNode;
}) {
  const { refs, rect } = useIndicator(
    tabs.map((t) => t.id),
    active,
  );
  return (
    <div className={cn("relative flex items-center gap-6 border-b border-line", className)}>
      <div role="tablist" className="relative flex min-w-0 gap-6 overflow-x-auto">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap pb-3 text-sm transition-colors duration-150",
                "focus-visible:outline-none focus-visible:text-fg",
                on ? "font-medium text-fg" : "text-sub hover:text-fg",
              )}
            >
              {t.dot && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "rounded px-1.5 text-[11px] tnum transition-colors",
                    on ? "bg-brand/15 text-brand" : "bg-raised text-dim",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        {rect && (
          <span
            aria-hidden
            className="absolute bottom-0 h-0.5 rounded-full bg-brand transition-[left,width] duration-200 ease-out"
            style={{ left: rect.left, width: rect.width }}
          />
        )}
      </div>
      {aside && <div className="mb-2 ml-auto flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const { refs, rect } = useIndicator(
    options.map((o) => o.value),
    value,
  );
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative inline-flex rounded-lg bg-raised p-0.5", className)}
    >
      {rect && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-md bg-element shadow-sm transition-[left,width] duration-200 ease-out"
          style={{ left: rect.left, width: rect.width }}
        />
      )}
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              on ? "text-fg" : "text-sub hover:text-fg",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
