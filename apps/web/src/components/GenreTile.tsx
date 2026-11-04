/** Ícone do gênero num quadrado tingido com a cor dele (lista, grade, detalhe). */
import { alpha } from "../lib/color";
import { GenreIcon } from "../lib/icons";
import { cn } from "./ui";

const sizes = {
  xs: { box: "h-7 w-7 rounded-md", icon: 14 },
  sm: { box: "h-8 w-8 rounded-md", icon: 16 },
  md: { box: "h-10 w-10 rounded-lg", icon: 20 },
  lg: { box: "h-12 w-12 rounded-xl", icon: 24 },
};

export function GenreTile({
  icon,
  color,
  size = "md",
  className,
}: {
  icon?: string | null;
  color?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const s = sizes[size];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", s.box, className)}
      style={{ background: alpha(color, 0.13), color: color ?? undefined }}
    >
      <GenreIcon name={icon} size={s.icon} />
    </span>
  );
}

/** Bolinha de cor do gênero (listas densas). */
export function GenreDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-2 w-2 shrink-0 rounded-full", className)}
      style={{ background: color ?? undefined }}
    />
  );
}
