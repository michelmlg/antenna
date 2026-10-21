import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({
  trigger,
  options,
  activeValue,
  onSelect,
  align = "left",
  className = "",
  title,
}: {
  trigger: ReactNode;
  options: DropdownOption[];
  activeValue?: string | null;
  onSelect: (value: string) => void;
  align?: "left" | "right";
  className?: string;
  title?: string;
}) {
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

export function StatusPill({
  tone,
  text,
  pulse,
}: {
  tone: "muted" | "signal" | "green" | "red";
  text: string;
  pulse?: boolean;
}) {
  const tones = {
    muted: "border-muted/10 bg-surface text-muted",
    signal: "border-signal/30 bg-signal/10 text-signal",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    red: "border-danger/30 bg-danger/10 text-danger",
  };
  return (
    <div
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-medium ${tones[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`}
      />
      {text}
    </div>
  );
}

export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  /** sem padding interno — para conteúdo edge-to-edge (ex.: timeline da grade) */
  flush?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-muted/10 bg-surface shadow-sm shadow-black/20 ${
        flush ? "p-0" : "p-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  className = "",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "signal" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "rounded-lg font-medium transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 active:scale-[0.98]";
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  const variants = {
    default:
      "bg-surface hover:bg-muted/20 border border-muted/20 text-foreground shadow-sm shadow-black/10",
    signal: "bg-signal text-background hover:bg-signal/90 font-semibold shadow-sm shadow-signal/20",
    ghost: "bg-transparent hover:bg-muted/10 text-muted hover:text-foreground",
    danger:
      "bg-transparent border border-danger/40 text-danger hover:bg-danger/10 hover:border-danger/60",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "signal" | "green" | "red";
}) {
  const tones = {
    muted: "bg-muted/10 text-muted",
    signal: "bg-signal/15 text-signal",
    green: "bg-emerald-500/15 text-emerald-400",
    red: "bg-danger/15 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[11px] normal-case">{hint}</span>}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm [animation:overlay-in_120ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-muted/20 bg-surface p-5 shadow-xl shadow-black/40 [animation:panel-in_140ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} title="Fechar">
            <X size={16} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = "carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>;
}

export function ErrorMsg({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
      {String(error instanceof Error ? error.message : error)}
    </div>
  );
}

export function fmtDur(s: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
