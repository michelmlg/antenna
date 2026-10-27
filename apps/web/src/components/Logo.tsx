/** Marca do Antenna: torre em "A" com ondas de sinal. Herda a cor via currentColor. */
import { cn } from "./ui";

export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title && <title>{title}</title>}
      <circle cx="24" cy="17" r="3.2" fill="currentColor" stroke="none" />
      <path d="M24 20.5 15 42M24 20.5 33 42M18.4 34h11.2" strokeWidth="3.6" />
      <path d="M16.5 9.5a10.5 10.5 0 0 0 0 15M31.5 9.5a10.5 10.5 0 0 1 0 15" strokeWidth="3.2" />
      <path d="M10.5 4.5a17.5 17.5 0 0 0 0 25M37.5 4.5a17.5 17.5 0 0 1 0 25" strokeWidth="3.2" />
    </svg>
  );
}

/** Logo + nome. */
export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("h-8 w-8 text-brand", markClassName)} />
      <span className="text-lg font-semibold tracking-tight">Antenna</span>
    </span>
  );
}
