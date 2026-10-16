import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-lg border border-muted/10 p-4 ${className}`}>{children}</div>;
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
  const base = "rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  const variants = {
    default: "bg-surface hover:bg-muted/20 border border-muted/20 text-foreground",
    signal: "bg-signal text-background hover:bg-signal/90 font-semibold",
    ghost: "bg-transparent hover:bg-muted/10 text-muted hover:text-foreground",
    danger: "bg-transparent border border-red-500/40 text-red-400 hover:bg-red-500/10",
  };
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${base} ${sizes} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "signal" | "green" | "red" }) {
  const tones = {
    muted: "bg-muted/10 text-muted",
    signal: "bg-signal/15 text-signal",
    green: "bg-emerald-500/15 text-emerald-400",
    red: "bg-red-500/15 text-red-400",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[11px] normal-case">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-surface w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border border-muted/20 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = "carregando…" }: { label?: string }) {
  return <div className="animate-pulse text-sm text-muted">{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted">{children}</div>;
}

export function ErrorMsg({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{String(error instanceof Error ? error.message : error)}</div>;
}

export function fmtDur(s: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
