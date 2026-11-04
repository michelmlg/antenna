/**
 * Filtros de uma fonte (painel inline na linha). Busca dentro do canal = coluna
 * query da fonte — o sync lista a página de busca do canal (playout/sync.ts).
 * Filtros pós-listagem valem no sync e na seleção do ar.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SourceRow } from "../../lib/api";
import { Button, ErrorMsg, Field, Segmented, useToast } from "../../components/ui";
import { hasChannelQuery } from "./shared";

interface FiltersDraft {
  titleHas: string;
  titleLacks: string;
  minDur: number | null;
  maxDur: number | null;
  excludeShorts: boolean;
  minViews: number | null;
  maxViews: number | null;
  excludeLive: boolean;
  dateMode: "any" | "range" | "older" | "newer";
  yearFrom: number | null;
  yearTo: number | null;
  olderYears: number | null;
  newerMonths: number | null;
}

type Saved = Partial<Omit<FiltersDraft, "titleHas" | "titleLacks">> & {
  titleHas?: string[];
  titleLacks?: string[];
};

const num = (v: string) => (v === "" ? null : Number(v));
const list = (s: string) =>
  s
    .split(/[,;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

function Range({
  label,
  hint,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  hint?: string;
  min: number | null;
  max: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="mín"
          value={min ?? ""}
          onChange={(e) => onMin(num(e.target.value))}
          className="w-full"
        />
        <span className="text-dim">–</span>
        <input
          type="number"
          placeholder="máx"
          value={max ?? ""}
          onChange={(e) => onMax(num(e.target.value))}
          className="w-full"
        />
      </div>
    </Field>
  );
}

export function FiltersPanel({
  source,
  genreId,
  onClose,
}: {
  source: SourceRow;
  genreId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = (source.filters || {}) as Saved;
  const isChannel = hasChannelQuery(source);
  const [query, setQuery] = useState(source.query);
  const [d, setD] = useState<FiltersDraft>({
    titleHas: f.titleHas?.join(", ") || "",
    titleLacks: f.titleLacks?.join(", ") || "",
    minDur: f.minDur ?? null,
    maxDur: f.maxDur ?? null,
    excludeShorts: !!f.excludeShorts,
    minViews: f.minViews ?? null,
    maxViews: f.maxViews ?? null,
    excludeLive: !!f.excludeLive,
    dateMode: f.dateMode || "any",
    yearFrom: f.yearFrom ?? 2015,
    yearTo: f.yearTo ?? 2020,
    olderYears: f.olderYears ?? 10,
    newerMonths: f.newerMonths ?? 12,
  });
  const set = (p: Partial<FiltersDraft>) => setD((prev) => ({ ...prev, ...p }));

  const save = useMutation({
    mutationFn: () => {
      const any =
        !!d.titleHas ||
        !!d.titleLacks ||
        !!d.minDur ||
        !!d.maxDur ||
        d.excludeShorts ||
        !!d.minViews ||
        !!d.maxViews ||
        d.excludeLive ||
        d.dateMode !== "any";
      return api.put(`/genres/${genreId}/sources/${source.id}`, {
        // canal guarda a busca na própria fonte (o sync lista a aba de busca do canal)
        ...(isChannel ? { query: query.trim() } : {}),
        filters: any
          ? {
              titleHas: list(d.titleHas),
              titleLacks: list(d.titleLacks),
              minDur: d.minDur || null,
              maxDur: d.maxDur || null,
              excludeShorts: d.excludeShorts,
              minViews: d.minViews || null,
              maxViews: d.maxViews || null,
              excludeLive: d.excludeLive,
              dateMode: d.dateMode,
              yearFrom: d.dateMode === "range" ? d.yearFrom : null,
              yearTo: d.dateMode === "range" ? d.yearTo : null,
              olderYears: d.dateMode === "older" ? d.olderYears : null,
              newerMonths: d.dateMode === "newer" ? d.newerMonths : null,
            }
          : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genre", genreId] });
      toast("Filtros salvos · valem no próximo sync");
      onClose();
    },
  });

  return (
    <div className="animate-fade-in border-t border-line bg-base/40 px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isChannel && (
          <Field
            label="Busca dentro do canal"
            hint="Vazio traz o canal inteiro."
            className="sm:col-span-2 lg:col-span-4"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="termo de busca"
              className="w-full"
            />
          </Field>
        )}
        <Field
          label="Título contém"
          hint="Qualquer um dos termos, separados por vírgula."
          className="sm:col-span-2"
        >
          <input
            value={d.titleHas}
            onChange={(e) => set({ titleHas: e.target.value })}
            placeholder="plantado, aquascape"
            className="w-full"
          />
        </Field>
        <Field
          label="Título não contém"
          hint="Descarta se tiver qualquer um dos termos."
          className="sm:col-span-2"
        >
          <input
            value={d.titleLacks}
            onChange={(e) => set({ titleLacks: e.target.value })}
            placeholder="shorts, live"
            className="w-full"
          />
        </Field>
        <Range
          label="Duração (min)"
          min={d.minDur}
          max={d.maxDur}
          onMin={(v) => set({ minDur: v })}
          onMax={(v) => set({ maxDur: v })}
        />
        <Range
          label="Visualizações"
          min={d.minViews}
          max={d.maxViews}
          onMin={(v) => set({ minViews: v })}
          onMax={(v) => set({ maxViews: v })}
        />
        <div className="flex flex-col justify-end gap-2 pb-1 text-[13px] text-sub sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={d.excludeShorts}
              onChange={(e) => set({ excludeShorts: e.target.checked })}
            />
            Excluir shorts (menos de 60s)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={d.excludeLive}
              onChange={(e) => set({ excludeLive: e.target.checked })}
            />
            Excluir transmissões ao vivo
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <span className="mb-1.5 block text-[13px] text-sub">Data de publicação</span>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented
              ariaLabel="Data de publicação"
              value={d.dateMode}
              onChange={(v) => set({ dateMode: v })}
              options={[
                { value: "any", label: "Qualquer" },
                { value: "range", label: "Entre anos" },
                { value: "older", label: "Mais antigo que" },
                { value: "newer", label: "Mais novo que" },
              ]}
            />
            {d.dateMode === "range" && (
              <div className="flex animate-fade-in items-center gap-2">
                <input
                  type="number"
                  value={d.yearFrom ?? ""}
                  onChange={(e) => set({ yearFrom: num(e.target.value) })}
                  className="w-24"
                  aria-label="De (ano)"
                />
                <span className="text-dim">até</span>
                <input
                  type="number"
                  value={d.yearTo ?? ""}
                  onChange={(e) => set({ yearTo: num(e.target.value) })}
                  className="w-24"
                  aria-label="Até (ano)"
                />
              </div>
            )}
            {d.dateMode === "older" && (
              <div className="flex animate-fade-in items-center gap-2 text-[13px] text-sub">
                <input
                  type="number"
                  value={d.olderYears ?? ""}
                  onChange={(e) => set({ olderYears: num(e.target.value) })}
                  className="w-20"
                  aria-label="Anos"
                />
                anos
              </div>
            )}
            {d.dateMode === "newer" && (
              <div className="flex animate-fade-in items-center gap-2 text-[13px] text-sub">
                <input
                  type="number"
                  value={d.newerMonths ?? ""}
                  onChange={(e) => set({ newerMonths: num(e.target.value) })}
                  className="w-20"
                  aria-label="Meses"
                />
                meses
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-dim">
        Dado faltando passa: o filtro nunca derruba vídeo por falta de informação.
      </p>
      <ErrorMsg error={save.error} className="mt-3" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Salvar filtros
        </Button>
      </div>
    </div>
  );
}
