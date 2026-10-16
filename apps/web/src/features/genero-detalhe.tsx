/** Detalhe do gênero — identidade inline, fontes em cima + gestão embaixo, mistura e simulador. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { api, type GenreDetail } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Spinner, fmtDur } from "../components/ui";
import { GenreIcon, ICON_PALETTE } from "../lib/icons";
import { AddSourceBar, SourceBlock, SourceMediaGrid, thumbOfMedia } from "./genero-fontes";
import { Mistura, Simulador } from "./genero-mistura";

const ORDERINGS: [string, string][] = [
  ["menos_reproduzidos", "menos reproduzidos"],
  ["aleatoria", "aleatória"],
  ["mais_antigos", "mais antigos"],
  ["definida", "ordem definida"],
];

function Identidade({ g }: { g: GenreDetail }) {
  const qc = useQueryClient();
  const [d, setD] = useState({
    name: g.name,
    icon: g.icon || "clapperboard",
    color: g.color,
    status: g.status,
    antiRepeatWindow: g.antiRepeatWindow,
    orderingPadrao: g.orderingPadrao,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const edit = (patch: Partial<typeof d>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () => api.put(`/genres/${g.id}`, d),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["genre", g.id] });
      qc.invalidateQueries({ queryKey: ["genres"] });
    },
  });

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        {/* ícone + picker */}
        <div className="relative">
          <button
            type="button"
            title="Trocar ícone"
            onClick={() => setPickerOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-lg"
            style={{ background: d.color + "22", color: d.color }}
          >
            <GenreIcon name={d.icon} size={22} />
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-14 z-40 grid w-72 grid-cols-8 gap-1 rounded-lg border border-muted/20 bg-surface p-2 shadow-xl">
              {ICON_PALETTE.map((n) => (
                <button
                  key={n}
                  type="button"
                  title={n}
                  onClick={() => {
                    edit({ icon: n });
                    setPickerOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded ${d.icon === n ? "bg-signal text-background" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
                >
                  <GenreIcon name={n} size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="Nome">
          <input value={d.name} onChange={(e) => edit({ name: e.target.value })} className="w-52" />
        </Field>
        <Field label="Cor">
          <input
            type="color"
            value={d.color}
            onChange={(e) => edit({ color: e.target.value })}
            className="h-9 w-16"
          />
        </Field>
        <Field label="Seleção">
          <select value={d.orderingPadrao} onChange={(e) => edit({ orderingPadrao: e.target.value })} className="w-44">
            {ORDERINGS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Anti-repetição" hint="últimos N exibidos">
          <input
            type="number"
            min={1}
            max={100}
            value={d.antiRepeatWindow}
            onChange={(e) => edit({ antiRepeatWindow: Number(e.target.value) })}
            className="w-20"
          />
        </Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => edit({ status: e.target.value })} className="w-28">
            <option value="ativo">ativo</option>
            <option value="pausado">pausado</option>
          </select>
        </Field>
        <Button variant={dirty ? "signal" : "default"} disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          <span className="flex items-center gap-1">
            <Check size={14} /> Salvar
          </span>
        </Button>
        <ErrorMsg error={save.error} />
      </div>
    </Card>
  );
}

export default function GeneroDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [openSid, setOpenSid] = useState<string | null>(null);
  const { data: g } = useQuery({
    queryKey: ["genre", id],
    queryFn: () => api.get<GenreDetail>(`/genres/${id}`),
    refetchInterval: 15000,
  });
  const del = useMutation({
    mutationFn: () => api.del(`/genres/${id}`),
    onSuccess: () => navigate("/generos"),
  });

  if (!g) return <Spinner />;
  const manual = g.items.map((it) => ({ ...it.media, itemId: it.id }));

  return (
    <div className="space-y-4">
      {/* cabeçalho */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/generos")}>
          <ArrowLeft size={15} />
        </Button>
        <h1 className="text-xl font-bold">{g.name}</h1>
        {g.status === "pausado" ? <Badge tone="red">pausado</Badge> : <Badge tone="green">ativo</Badge>}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span>{g.pool.expanded.length} vídeos sincronizados</span>
          <Button variant="danger" size="sm" onClick={() => del.mutate()} title="Excluir gênero (e o programa da grade)">
            <Trash2 size={13} /> Excluir
          </Button>
        </div>
      </div>

      {/* identidade inline */}
      <Identidade g={g} />

      {/* adicionar fonte (em cima) */}
      <AddSourceBar genreId={g.id} />

      {/* gestão de fontes (embaixo) */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Fontes ({g.sources.length})
        </div>
        {g.sources.length === 0 ? (
          <Empty>Nenhuma fonte — adicione canais ou buscas acima.</Empty>
        ) : (
          <div className="space-y-2">
            {g.sources.map((s) => (
              <SourceBlock
                key={s.id}
                s={s}
                genreId={g.id}
                open={openSid === s.id}
                onToggleOpen={() => setOpenSid((cur) => (cur === s.id ? null : s.id))}
              />
            ))}
            {/* vídeos manuais */}
            {manual.length > 0 && (
              <Card>
                <SourceMediaGrid genreId={g.id} sid="__manual__" manual={manual} />
              </Card>
            )}
          </div>
        )}
      </div>

      {/* mistura */}
      <Mistura genre={g} />

      {/* simulador */}
      <Simulador genreId={g.id} />
    </div>
  );
}
