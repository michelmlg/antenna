/**
 * Botões do sistema. Micro-interações sutis e consistentes:
 * hover clareia o fundo, o primário "acende" (glow âmbar + sobe 1px),
 * pressionar encolhe levemente e o foco por teclado ganha anel âmbar.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "group/btn relative inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[background-color,color,box-shadow,transform,filter,opacity] duration-150 ease-out " +
  "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] hover:-translate-y-px hover:shadow-brand-glow hover:brightness-105 active:translate-y-0",
  secondary: "bg-raised text-fg hover:bg-element",
  ghost: "text-sub hover:bg-raised hover:text-fg",
  danger: "bg-raised text-danger hover:bg-danger/15",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-9 px-4 text-sm [&_svg]:h-4 [&_svg]:w-4",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  /** ícone à esquerda (troca por spinner enquanto `loading`) */
  icon?: LucideIcon;
  /** ícone à direita — desliza 2px no hover (setas, chevrons) */
  trailingIcon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    trailingIcon: Trailing,
    loading,
    className,
    children,
    type = "button",
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon aria-hidden className="transition-transform duration-150 group-hover/btn:scale-110" />
      ) : null}
      {children}
      {Trailing && (
        <Trailing
          aria-hidden
          className="transition-transform duration-150 group-hover/btn:translate-x-0.5"
        />
      )}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** obrigatório: vira aria-label e tooltip */
  label: string;
  size?: Size;
  tone?: "default" | "danger" | "onMedia";
  active?: boolean;
  loading?: boolean;
  /** gira o ícone continuamente (ex.: sincronizando) */
  spin?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    label,
    size = "md",
    tone = "default",
    active,
    loading,
    spin,
    className,
    type = "button",
    disabled,
    ...rest
  },
  ref,
) {
  const tones = {
    default: active ? "bg-raised text-brand" : "text-sub hover:bg-raised hover:text-fg",
    danger: "text-sub hover:bg-danger/15 hover:text-danger",
    onMedia: "bg-black/40 text-white/85 backdrop-blur hover:bg-black/60 hover:text-white",
  };
  const Shown = loading ? Loader2 : Icon;
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled || loading}
      className={cn(
        "group/icon inline-flex shrink-0 items-center justify-center rounded-lg",
        "transition-[background-color,color,transform] duration-150 ease-out active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:pointer-events-none disabled:opacity-30",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        tones[tone],
        className,
      )}
      {...rest}
    >
      <Shown
        aria-hidden
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          loading || spin
            ? "animate-spin"
            : "transition-transform duration-150 group-hover/icon:scale-110",
        )}
      />
    </button>
  );
});

/** Link estilizado como botão de texto (ex.: "Ver grade completa →"). */
export function TextAction({
  children,
  onClick,
  icon: Icon,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/ta inline-flex items-center gap-1 rounded text-[13px] text-dim transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      {children}
      {Icon && (
        <Icon
          aria-hidden
          className="h-3.5 w-3.5 transition-transform duration-150 group-hover/ta:translate-x-0.5"
        />
      )}
    </button>
  );
}
