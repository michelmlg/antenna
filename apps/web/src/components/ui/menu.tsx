/**
 * Popover (painel ancorado a um gatilho) e Dropdown (lista de opções).
 * Fecham com clique fora / Esc; entram com pop-in curto.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useDismiss } from "../../lib/hooks";
import { cn } from "./cn";

export function Popover({
  trigger,
  children,
  align = "left",
  className,
  panelClassName,
}: {
  /** render-prop: recebe o estado e o toggle (o gatilho é do chamador) */
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (p: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, root, close);
  return (
    <div ref={root} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-1.5 min-w-[200px] origin-top animate-pop-in rounded-xl border border-line bg-raised p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children({ close })}
        </div>
      )}
    </div>
  );
}

/** Item de menu (dentro de Popover). */
export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  active,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-100",
        "focus-visible:bg-element focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        danger ? "text-danger hover:bg-danger/10" : "text-sub hover:bg-element hover:text-fg",
        active && "text-fg",
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <Check className="h-3.5 w-3.5 text-brand" aria-hidden />}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-dim">
      {children}
    </div>
  );
}

export const MenuDivider = () => <div className="my-1 h-px bg-line" />;

export interface DropdownOption {
  value: string;
  label: string;
}

/** Seletor compacto (substitui <select> em barras de ferramentas). */
export function Dropdown({
  value,
  options,
  onSelect,
  align = "left",
  title,
  renderLabel,
}: {
  value: string;
  options: DropdownOption[];
  onSelect: (value: string) => void;
  align?: "left" | "right";
  title?: string;
  renderLabel?: (o: DropdownOption | undefined) => ReactNode;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover
      align={align}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          title={title}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-sub transition-colors duration-150",
            "hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            open && "bg-raised text-fg",
          )}
        >
          {renderLabel ? renderLabel(current) : (current?.label ?? value)}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 text-dim transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      )}
      panelClassName="min-w-[160px]"
    >
      {({ close }) => (
        <div role="listbox">
          {options.map((o) => (
            <MenuItem
              key={o.value}
              active={o.value === value}
              onClick={() => {
                onSelect(o.value);
                close();
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
