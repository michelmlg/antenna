/** Mistura (builder visual) + Simulador da sequência viva. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from "lucide-react";
import { api, type GenreDetail, type MixIngredientRow } from "../lib/api";
import { sourceLabelOf } from "./genero-fontes";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Empty,
  ErrorMsg,
  Field,
  Spinner,
  fmtDur,
} from "../components/ui";

interface DraftIngredient {
  scope: MixIngredientRow["scope"];
  sourceId: string | null;
  categoryName: string | null;
  count: number;
}

const SCOPE_LABEL: Record<DraftIngredient["scope"], string> = {
  links: "Links manuais",
  source: "Fonte (canal/busca)",
  genre: "Gênero inteiro",
  category: "Categoria",
};

export function Mistura({ genre }: { genre: GenreDetail }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftIngredient[] | null>(null);
  const ingredients: DraftIngredient[] =
    draft ??
    genre.ingredients.map((i) => ({
      scope: i.scope,
      sourceId: i.sourceId,
      categoryName: i.categoryName,
      count: i.count,
    }));

  const save = useMutation({
    mutationFn: () => api.put(`/genres/${genre.id}/mix`, { ingredients }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["genre", genre.id] });
    },
  });

  const set = (i: number, patch: Partial<DraftIngredient>) => {
    const next = ingredients.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    setDraft(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ingredients.length) return;
    const next = [...ingredients];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-muted">Mistura</div>
          <p className="text-[11px] text-muted">
            A sequência segue este padrão em ciclo, respeitando a janela anti-repetição (
            {genre.antiRepeatWindow}).
          </p>
        </div>
        {draft && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="signal"
              onClick={() => save.mutate()}
              disabled={save.isPending || !ingredients.length}
            >
              Salvar mistura
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {ingredients.length === 0 && <Empty>Sem ingredientes — o gênero não produz nada.</Empty>}
        {ingredients.map((it, i) => {
          const source = genre.sources.find((s) => s.id === it.sourceId);
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded border border-muted/10 bg-background/50 p-2.5"
            >
              <span className="font-mono text-xs text-signal">{i + 1}.</span>
              <select
                value={it.scope}
                onChange={(e) =>
                  set(i, {
                    scope: e.target.value as DraftIngredient["scope"],
                    sourceId: null,
                    categoryName: null,
                  })
                }
                className="w-44"
              >
                {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {it.scope === "source" && (
                <select
                  value={it.sourceId ?? ""}
                  onChange={(e) => set(i, { sourceId: e.target.value })}
                  className="min-w-56"
                >
                  <option value="">— escolha a fonte —</option>
                  {genre.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sourceLabelOf(s)}
                    </option>
                  ))}
                </select>
              )}
              {it.scope === "category" && (
                <input
                  value={it.categoryName ?? ""}
                  onChange={(e) => set(i, { categoryName: e.target.value })}
                  placeholder="nome da categoria"
                  className="w-48"
                />
              )}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={it.count}
                  onChange={(e) =>
                    set(i, { count: Math.max(1, Math.min(10, Number(e.target.value))) })
                  }
                  className="w-16"
                />
                <span className="text-[11px] text-muted">por ciclo</span>
              </div>
              {source && (
                <Badge>{source.status === "ativo" ? "fonte ativa" : "fonte pausada"}</Badge>
              )}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} title="Subir">
                  <ArrowUp size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} title="Descer">
                  <ArrowDown size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft(ingredients.filter((_, idx) => idx !== i))}
                  title="Remover"
                >
                  <Trash2 size={14} className="text-danger" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {!draft && (
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            setDraft([
              ...ingredients,
              {
                scope: "source",
                sourceId: genre.sources[0]?.id ?? null,
                categoryName: null,
                count: 1,
              },
            ])
          }
        >
          <span className="flex items-center gap-1">
            <Plus size={13} /> Ingrediente
          </span>
        </Button>
      )}
      <ErrorMsg error={save.error} />
    </Card>
  );
}

interface PreviewItem {
  mediaId: string;
  title: string;
  duration: number;
  scope: string;
  scopeLabel: string;
}

export function Simulador({ genreId }: { genreId: string }) {
  const [count, setCount] = useState(8);
  const [open, setOpen] = useState(false);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["genre-preview", genreId, count],
    queryFn: () =>
      api.get<{ approx: boolean; window: number; items: PreviewItem[] }>(
        `/genres/${genreId}/preview?count=${count}`,
      ),
    enabled: open,
  });

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-muted">Simulador</div>
          <p className="text-[11px] text-muted">
            Projeta a sequência com as regras atuais (não interfere no ar).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            trigger={<span className="text-xs">{count} itens</span>}
            activeValue={String(count)}
            onSelect={(v) => setCount(Number(v))}
            options={[4, 8, 12, 20].map((n) => ({ value: String(n), label: `${n} itens` }))}
          />
          <Button
            variant="signal"
            size="sm"
            onClick={() => {
              setOpen(true);
              refetch();
            }}
          >
            <span className="flex items-center gap-1">
              <Play size={13} /> Simular
            </span>
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3">
          {isFetching && !data ? (
            <Spinner />
          ) : data ? (
            <>
              <div className="mb-2 text-[11px] text-muted">
                janela anti-repetição: {data.window}
                {data.approx && " · ordenação aleatória (ordem aproximada)"}
              </div>
              <ol className="space-y-1.5">
                {data.items.map((it, i) => (
                  <li
                    key={`${it.mediaId}-${i}`}
                    className="flex items-baseline gap-2 border-t border-muted/10 pt-1.5 text-sm first:border-0 first:pt-0"
                  >
                    <span className="font-mono text-xs text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Badge tone="signal">{it.scopeLabel}</Badge>
                    <span className="line-clamp-1 flex-1">{it.title}</span>
                    <span className="text-[11px] text-muted">{fmtDur(it.duration)}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <Empty>sem resultado</Empty>
          )}
        </div>
      )}
    </Card>
  );
}

// reexport para o detalhe usar o Field sem importar de novo
export { Field };
