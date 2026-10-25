/** Campos: rótulo + dica, interruptor e linha de configuração. */
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[13px] text-sub">{label}</span>
      {children}
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** acessível (o texto visível fica ao lado, em quem usa) */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
        "disabled:opacity-40",
        checked ? "bg-brand" : "bg-element",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

/** Linha de configuração: título + descrição à esquerda, controle à direita. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-fg">{title}</div>
        {description && <div className="mt-0.5 text-[13px] text-dim">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
