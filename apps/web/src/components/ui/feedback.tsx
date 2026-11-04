/** Estados de carregamento, vazio e erro. */
import { useState, type ReactNode } from "react";
import { AlertCircle, Loader2, X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export function Spinner({
  label = "carregando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-10 text-sm text-dim", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center gap-2 px-4 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-dim">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      {title && <div className="text-sm font-medium text-fg">{title}</div>}
      {children && <div className="max-w-sm text-[13px] text-dim">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Erro de requisição (mensagem da API). Some quando não há erro. */
export function ErrorMsg({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex animate-fade-in items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[13px] text-danger",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        {String(error instanceof Error ? error.message : error)}
      </span>
    </div>
  );
}

/** Aviso persistente com detalhe técnico opcional e botão de dispensar. */
export function Alert({
  children,
  detail,
  dismissible,
  className,
}: {
  children: ReactNode;
  detail?: ReactNode;
  dismissible?: boolean;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex animate-fade-in items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 px-3.5 py-2.5 text-[13px]",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1 text-sub">
        {children}
        {detail && <div className="mt-0.5 break-words font-mono text-xs text-dim">{detail}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          aria-label="Dispensar"
          onClick={() => setHidden(true)}
          className="rounded text-dim transition-colors hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
