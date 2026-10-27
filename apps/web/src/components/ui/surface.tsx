/** Superfícies e rótulos de seção. */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Card({
  className,
  padded = false,
  interactive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** p-4/p-5 interno */
  padded?: boolean;
  /** realce no hover (cards clicáveis) */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel",
        padded && "p-4 sm:p-5",
        interactive &&
          "transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-element hover:shadow-pop",
        className,
      )}
      {...rest}
    />
  );
}

/** Cabeçalho de seção: título discreto à esquerda, ação à direita. */
export function SectionHeader({
  title,
  aside,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h3 className="text-sm font-medium text-sub">{title}</h3>
      {aside}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1 font-sans text-[11px] text-sub">
      {children}
    </kbd>
  );
}
