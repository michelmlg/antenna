/** Aba Mistura: builder do ciclo (ingredientes) + Simulador da sequência viva. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Play, Plus, X } from "lucide-react";
import { api, type GenreDetail, type MixIngredientRow } from "../../lib/api";
import { alpha } from "../../lib/color";
import { fmtDur } from "../../lib/format";
import {
  Button,
  Card,
  Dropdown,
  Empty,
  ErrorMsg,
  IconButton,
  Pill,
  Spinner,
  useToast,
} from "../../components/ui";
import { sourceLabelOf } from "./shared";

interface DraftIngredient {
  scope: MixIngredientRow["scope"];
  sourceId: string | null;
  categoryName: string | null;
  count: number;
}

const SCOPE_LABEL: Record<DraftIngredient["scope"], string> = {
  links: "Links manuais",
  source: "Fonte",
  genre: "Gênero inteiro",
  category: "Categoria",
};

/** Tons da cor do gênero para distinguir ingredientes na barra do ciclo. */
const shade = (color: string, i: number) => alpha(color, [1, 0.7, 0.5, 0.85, 0.6, 0.4][i % 6]);

function Mixer({ genre }: { genre: GenreDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
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
      toast("Mistura salva");
    },
  });

  const set = (i: number, patch: Partial<DraftIngredient>) =>
    setDraft(ingredients.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ingredients.length) return;
    const next = [...ingredients];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };
  const labelOf = (it: DraftIngredient) =>
    it.scope === "source"
      ? (() => {
          const s = genre.sources.find((x) => x.id === it.sourceId);
          return s ? sourceLabelOf(s) : "fonte?";
        })()
      : it.scope === "category"
        ? it.categoryName || "categoria?"
        : SCOPE_LABEL[it.scope];

  return (
    <div className="min-w-0">
      <p className="mb-3 text-sm text-dim">
        A sequência segue este padrão em ciclo, respeitando a anti-repetição (últimos{" "}
        <span className="text-sub">{genre.antiRepeatWindow}</span>).
      </p>
      {ingredients.length > 0 && (
        <div className="mb-4 flex h-3 overflow-hidden rounded-full" aria-label="Proporção do ciclo">
          {ingredients.map((it, i) => (
            <span
              key={i}
              title={`${labelOf(it)} × ${it.count}`}
              className="border-r-2 border-base transition-[flex-grow] duration-300 last:border-0"
              style={{ flexGrow: it.count, background: shade(genre.color, i) }}
            />
          ))}
        </div>
      )}

      <Card>
        {ingredients.length === 0 ? (
          <Empty title="Sem ingredientes">
            Sem ingredientes, o gênero não produz nada para a fila.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {ingredients.map((it, i) => {
              const source = genre.sources.find((s) => s.id === it.sourceId);
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <span className="w-5 text-[13px] text-dim tnum">{i + 1}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: shade(genre.color, i) }}
                  />
                  <select
                    value={it.scope}
                    onChange={(e) =>
                      set(i, {
                        scope: e.target.value as DraftIngredient["scope"],
                        sourceId: null,
                        categoryName: null,
                      })
                    }
                    className="h-8 text-[13px]"
                    aria-label="Tipo do ingrediente"
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
                      className="order-last h-8 min-w-0 basis-full text-[13px] sm:order-none sm:basis-0 sm:flex-1"
                      aria-label="Fonte"
                    >
                      <option value="">Escolha a fonte…</option>
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
                      className="h-8 min-w-0 flex-1 text-[13px]"
                    />
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-dim">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={it.count}
                      onChange={(e) =>
                        set(i, { count: Math.max(1, Math.min(10, Number(e.target.value))) })
                      }
                      className="h-8 w-14 text-center text-[13px]"
                    />
                    por ciclo
                  </label>
                  {source && source.status !== "ativo" && <Pill>fonte pausada</Pill>}
                  <div className="ml-auto flex">
                    <IconButton
                      icon={ArrowUp}
                      label="Subir"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="Descer"
                      disabled={i === ingredients.length - 1}
                      onClick={() => move(i, 1)}
                    />
                    <IconButton
                      icon={X}
                      label="Remover ingrediente"
                      tone="danger"
                      onClick={() => setDraft(ingredients.filter((_, idx) => idx !== i))}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          icon={Plus}
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
          Adicionar ingrediente
        </Button>
        {draft && (
          <div className="ml-auto flex animate-fade-in items-center gap-2">
            <span className="text-xs text-dim">Alterações não salvas</span>
            <Button onClick={() => setDraft(null)}>Descartar</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!ingredients.length}
              onClick={() => save.mutate()}
            >
              Salvar mistura
            </Button>
          </div>
        )}
      </div>
      <ErrorMsg error={save.error} className="mt-3" />
    </div>
  );
}

interface PreviewItem {
  mediaId: string;
  title: string;
  duration: number;
  scope: string;
  scopeLabel: string;
}

function Simulador({ genreId }: { genreId: string }) {
  const [count, setCount] = useState(8);
  const [open, setOpen] = useState(false);
  const { data, refetch, isFetching, error } = useQuery({
    queryKey: ["genre-preview", genreId, count],
    queryFn: () =>
      api.get<{ approx: boolean; window: number; items: PreviewItem[] }>(
        `/genres/${genreId}/preview?count=${count}`,
      ),
    enabled: open,
  });

  return (
    <Card padded className="h-fit">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Simulador</h4>
        <Dropdown
          align="right"
          value={String(count)}
          onSelect={(v) => setCount(Number(v))}
          options={[4, 8, 12, 20].map((n) => ({ value: String(n), label: `${n} itens` }))}
        />
      </div>
      <p className="mt-1 text-[13px] text-dim">
        Projeta a sequência com as regras atuais. Não mexe no que está no ar.
      </p>
      <Button
        className="mt-3 w-full"
        icon={Play}
        loading={isFetching}
        onClick={() => {
          setOpen(true);
          void refetch();
        }}
      >
        Simular
      </Button>
      <ErrorMsg error={error} className="mt-3" />
      {open &&
        (isFetching && !data ? (
          <Spinner className="py-6" />
        ) : data ? (
          <>
            {data.approx && (
              <p className="mt-3 text-xs text-dim">Ordenação aleatória — ordem aproximada.</p>
            )}
            <ol className="mt-3 space-y-1.5">
              {data.items.map((it, i) => (
                <li
                  key={`${it.mediaId}-${i}`}
                  className="flex animate-fade-in items-center gap-2.5 text-[13px]"
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
                >
                  <span className="w-5 text-dim tnum">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  <span className="max-w-[40%] shrink-0 truncate text-xs text-dim">
                    {it.scopeLabel}
                  </span>
                  <span className="shrink-0 text-xs text-dim tnum">{fmtDur(it.duration)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null)}
    </Card>
  );
}

export function MisturaTab({ genre }: { genre: GenreDetail }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Mixer genre={genre} />
      <Simulador genreId={genre.id} />
    </div>
  );
}
