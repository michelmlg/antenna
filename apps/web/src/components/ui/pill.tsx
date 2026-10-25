/** Pílulas de status — sempre cor + texto (nunca só cor). */
import type { ReactNode } from "react";
import { cn } from "./cn";

export type PillTone = "muted" | "brand" | "ok" | "danger" | "live";

const tones: Record<PillTone, string> = {
  muted: "bg-raised text-sub",
  brand: "bg-brand/15 text-brand",
  ok: "bg-ok/10 text-ok",
  danger: "bg-danger/10 text-danger",
  live: "bg-live text-white",
};

export function Pill({
  tone = "muted",
  dot,
  pulse,
  children,
  className,
  title,
}: {
  tone?: PillTone;
  /** bolinha à esquerda na cor do texto */
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-blink")} />
      )}
      {children}
    </span>
  );
}

/** Selo vermelho de transmissão (player, cabeçalhos). */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-live px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white" />
      Ao vivo
    </span>
  );
}
