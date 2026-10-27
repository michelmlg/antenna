/**
 * Seletor de ícone do gênero: galeria fixa (lib/icons) com busca em pt-BR e
 * categorias. O ícone atual aparece marcado na cor do gênero.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { alpha } from "../lib/color";
import { ICON_CATEGORIES } from "../lib/icons";
import { GenreTile } from "./GenreTile";
import { Popover, cn } from "./ui";

export function IconPicker({
  value,
  color,
  onChange,
  size = "md",
}: {
  value: string;
  color: string;
  onChange: (name: string) => void;
  size?: "md" | "lg";
}) {
  return (
    <Popover
      panelClassName="w-[336px] p-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title="Trocar ícone"
          className={cn(
            "rounded-xl transition-transform duration-150 hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            open && "ring-2 ring-brand/60",
          )}
        >
          <GenreTile icon={value} color={color} size={size === "lg" ? "lg" : "md"} />
        </button>
      )}
    >
      {({ close }) => (
        <IconGallery
          value={value}
          color={color}
          onPick={(n) => {
            onChange(n);
            close();
          }}
        />
      )}
    </Popover>
  );
}

function IconGallery({
  value,
  color,
  onPick,
}: {
  value: string;
  color: string;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(
    () =>
      ICON_CATEGORIES.find((c) => c.icons.some((i) => i.name === value))?.label ??
      ICON_CATEGORIES[0].label,
  );
  const query = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      query
        ? ICON_CATEGORIES.flatMap((c) => c.icons).filter((i) =>
            `${i.name} ${i.keywords}`.includes(query),
          )
        : (ICON_CATEGORIES.find((c) => c.label === cat)?.icons ?? []),
    [cat, query],
  );

  return (
    <div>
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-dim"
            aria-hidden
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (ex.: peixe, jogo, música)"
            className="w-full bg-panel pl-8"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-0.5 border-b border-line px-2 py-1.5">
        {query ? (
          <span className="px-2 py-1 text-xs text-dim">Resultados</span>
        ) : (
          ICON_CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setCat(c.label)}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                c.label === cat ? "bg-element text-fg" : "text-sub hover:text-fg",
              )}
            >
              {c.label}
            </button>
          ))
        )}
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="col-span-8 py-6 text-center text-[13px] text-dim">
            Nenhum ícone encontrado
          </div>
        ) : (
          list.map(({ name, Icon, keywords }) => {
            const on = name === value;
            return (
              <button
                key={name}
                type="button"
                title={keywords}
                aria-pressed={on}
                onClick={() => onPick(name)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-[background-color,transform] duration-150 hover:scale-110 hover:bg-element active:scale-95",
                  on ? "ring-2 ring-brand" : "text-sub",
                )}
                style={on ? { background: alpha(color, 0.15), color } : undefined}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
