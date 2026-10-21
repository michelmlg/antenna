/** Gêneros — coleção visual dos gêneros do canal + sincronização geral. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Settings2 } from "lucide-react";
import { useState } from "react";
import { api, type GenreRow } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Modal, Spinner } from "../components/ui";
import { GenreIcon, ICON_PALETTE } from "../lib/icons";

function GenreIdentityChip({
  icon,
  color,
  size = 19,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      style={{ background: color + "22", color }}
    >
      <GenreIcon name={icon} size={size} />
    </span>
  );
}

function GenreCard({ g }: { g: GenreRow }) {
  const qc = useQueryClient();
  const syncAll = useMutation({
    mutationFn: () => api.post(`/genres/${g.id}/sync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["genres"] }),
  });
  const paused = g.status === "pausado";

  return (
    <Card className={`flex flex-col gap-3 ${paused ? "opacity-75" : ""}`}>
      <Link to={`/generos/${g.id}`} title={`Abrir ${g.name}`} className="min-w-0">
        <div className="flex items-start gap-3">
          <GenreIdentityChip icon={g.icon} color={g.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="line-clamp-1 text-lg font-semibold leading-tight transition-colors hover:text-signal">
                {g.name}
              </span>
              {paused && <Badge tone="red">pausado</Badge>}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              anti-repetição {g.antiRepeatWindow} · {g.orderingPadrao.replace(/_/g, " ")}
            </div>
          </div>
        </div>
      </Link>

      <div className="flex items-baseline gap-2">
        <span
          className="text-xl font-semibold tnum"
          style={{ color: paused ? undefined : g.color }}
        >
          {g.expandedCount}
        </span>
        <span className="text-[11px] text-muted">vídeos de fontes</span>
        <span className="ml-auto text-[11px] text-muted tnum">
          {g.sources.length} fonte{g.sources.length === 1 ? "" : "s"} · {g.linkCount} link
          {g.linkCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-muted/10 pt-3">
        <span className="line-clamp-1 text-[11px] text-muted">
          {g.program ? `programa: ${g.program.name}` : "sem programa na grade"}
        </span>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Sincronizar todas as fontes"
            onClick={() => syncAll.mutate()}
          >
            <RefreshCw size={14} className={syncAll.isPending ? "animate-spin" : ""} />
          </Button>
          <Link to={`/generos/${g.id}`}>
            <Button size="sm">
              <span className="flex items-center gap-1">
                <Settings2 size={13} /> Editar
              </span>
            </Button>
          </Link>
        </div>
      </div>

      <ErrorMsg error={syncAll.error} />
    </Card>
  );
}

function NewGenreModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("clapperboard");
  const [color, setColor] = useState("#FFB547");
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>("/genres", { name, icon, color }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["genres"] });
      onClose();
      navigate(`/generos/${g.id}`);
    },
  });
  return (
    <Modal title="Novo gênero" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-muted/10 bg-background/40 px-3 py-2.5">
          <GenreIdentityChip icon={icon} color={color} />
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-semibold">{name || "sem nome"}</div>
            <div className="text-[11px] text-muted">
              como o gênero aparece nos blocos da grade e nos metadados dos vídeos
            </div>
          </div>
        </div>

        <Field label="Nome">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gameplays"
            className="w-full"
          />
        </Field>
        <div className="flex gap-3">
          <Field label="Cor">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-20"
            />
          </Field>
        </div>
        <Field label="Ícone">
          <div className="grid max-w-sm grid-cols-12 gap-1">
            {ICON_PALETTE.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={icon === n}
                title={n}
                onClick={() => setIcon(n)}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 ${
                  icon === n
                    ? "bg-signal text-background"
                    : "text-muted hover:bg-muted/10 hover:text-foreground"
                }`}
              >
                <GenreIcon name={n} size={15} />
              </button>
            ))}
          </div>
        </Field>
        <ErrorMsg error={create.error} />
        <Button
          variant="signal"
          onClick={() => create.mutate()}
          disabled={!name || create.isPending}
        >
          Criar e adicionar fontes
        </Button>
      </div>
    </Modal>
  );
}

export default function Generos() {
  const [modal, setModal] = useState(false);
  const { data: genres } = useQuery({
    queryKey: ["genres"],
    queryFn: () => api.get<GenreRow[]>("/genres"),
    refetchInterval: 15000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <p className="max-w-prose text-sm text-muted">
          cada gênero agrupa canais, buscas e links — e define a mistura do que passa no canal
        </p>
        <Button variant="signal" className="shrink-0" onClick={() => setModal(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Novo gênero
          </span>
        </Button>
      </div>

      {!genres ? (
        <Spinner />
      ) : genres.length === 0 ? (
        <Empty>Nenhum gênero ainda — crie o primeiro.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {genres.map((g) => (
            <GenreCard key={g.id} g={g} />
          ))}
        </div>
      )}

      {modal && <NewGenreModal onClose={() => setModal(false)} />}
    </div>
  );
}
