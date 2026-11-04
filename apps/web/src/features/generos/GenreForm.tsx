/** Identidade do gênero: ícone (galeria fixa) + nome + cor. Usado em criar e em Ajustes. */
import { Pipette } from "lucide-react";
import { GENRE_PALETTE } from "../../lib/color";
import { IconPicker } from "../../components/IconPicker";
import { Field, cn } from "../../components/ui";

export function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const custom = !GENRE_PALETTE.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cor do gênero">
      {GENRE_PALETTE.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              "h-7 w-7 rounded-full transition-transform duration-150 hover:scale-110 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
              on && "ring-2 ring-fg ring-offset-2 ring-offset-panel",
            )}
            style={{ background: c }}
          />
        );
      })}
      {/* cor livre: o seletor nativo fica por trás do botão de conta-gotas */}
      <label
        title="Outra cor"
        className={cn(
          "relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-element text-sub transition-transform hover:scale-110",
          custom && "ring-2 ring-fg ring-offset-2 ring-offset-panel",
        )}
        style={custom ? { background: value, borderStyle: "solid" } : undefined}
      >
        {!custom && <Pipette className="h-3.5 w-3.5" aria-hidden />}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Escolher outra cor"
        />
      </label>
    </div>
  );
}

export function IdentityFields({
  name,
  icon,
  color,
  onChange,
}: {
  name: string;
  icon: string;
  color: string;
  onChange: (patch: Partial<{ name: string; icon: string; color: string }>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl bg-raised p-4">
        <IconPicker value={icon} color={color} onChange={(i) => onChange({ icon: i })} size="lg" />
        <div className="min-w-0">
          <div className="truncate font-medium">{name.trim() || "Sem nome"}</div>
          <div className="text-[13px] text-dim">Clique no ícone para trocar</div>
        </div>
      </div>
      <Field label="Nome">
        <input
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="ex.: Documentários"
          maxLength={60}
          className="w-full"
        />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] text-sub">Cor</span>
        <ColorSwatches value={color} onChange={(c) => onChange({ color: c })} />
      </div>
    </div>
  );
}
