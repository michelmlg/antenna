/**
 * dropdown customizado da toolbar (estilo do menu de Perfis): trigger com
 * chevron, painel surface/borda/sombra, opção ativa com ✓, fecha em
 * click-fora/Esc; opções são botões (ação única, como "ir p/ dia").
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  /** conteúdo estático do trigger (ícone + rótulo atual) */
  trigger: ReactNode;
  options: DropdownOption[];
  /** valor ativo — recebe ✓ no painel */
  activeValue?: string | null;
  onSelect(value: string): void;
  align?: "left" | "right";
  /** sobrepõe o label do trigger por opção selecionada (ex.: nome do dia) */
  className?: string;
  title?: string;
}

export function Dropdown({
  trigger,
  options,
  activeValue,
  onSelect,
  align = "left",
  className = "",
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={"relative " + className}>
      <button
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          "flex h-8 items-center gap-1.5 rounded-lg border border-muted/20 bg-surface px-2.5 text-xs font-medium text-foreground shadow-sm shadow-black/10 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.98] " +
          (open ? "ring-1 ring-signal/40" : "")
        }
      >
        {trigger}
        <ChevronDown
          size={12}
          className={"text-muted transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className={
            "absolute top-full z-50 mt-1.5 w-40 overflow-hidden rounded-xl border border-muted/20 bg-surface p-1 shadow-xl shadow-black/40 [animation:panel-in_120ms_ease-out] " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          {options.map((o) => {
            const active = activeValue != null && o.value === activeValue;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(o.value);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors focus-visible:outline-none " +
                  (active ? "font-semibold text-signal" : "text-foreground") +
                  " hover:bg-signal/10"
                }
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
