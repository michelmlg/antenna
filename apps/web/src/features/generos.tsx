/** Gêneros — cards com estatísticas + sync geral. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Settings2 } from "lucide-react";
import { useState } from "react";
import { api, type GenreRow } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Modal, Spinner } from "../components/ui";
import { GenreIcon, ICON_PALETTE } from "../lib/icons";

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
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gameplays" className="w-full" />
        </Field>
        <div className="flex gap-3">
          <Field label="Cor">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20" />
          </Field>
        </div>
        <Field label="Ícone">
          <div className="grid max-w-sm grid-cols-12 gap-1">
            {ICON_PALETTE.map((n) => (
              <button
                key={n}
                type="button"
                title={n}
                onClick={() => setIcon(n)}
                className={`flex h-8 w-8 items-center justify-center rounded ${icon === n ? "bg-signal text-background" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
              >
                <GenreIcon name={n} size={15} />
              </button>
            ))}
          </div>
        </Field>
        <ErrorMsg error={create.error} />
        <Button variant="signal" onClick={() => create.mutate()} disabled={!name || create.isPending}>
          Criar e adicionar fontes
        </Button>
      </div>
    </Modal>
  );
}

export default function Generos() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const { data: genres } = useQuery({
    queryKey: ["genres"],
    queryFn: () => api.get<GenreRow[]>("/genres"),
    refetchInterval: 15000,
  });

  const syncAll = useMutation({
    mutationFn: (id: string) => api.post(`/genres/${id}/sync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["genres"] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Gêneros de conteúdo</h1>
          <p className="text-sm text-muted">
            Cada gênero agrupa canais, buscas e links — e define a mistura do que passa no canal.
          </p>
        </div>
        <Button variant="signal" onClick={() => setModal(true)}>
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
            <Card key={g.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <Link to={`/generos/${g.id}`} className="flex items-center gap-2 hover:text-signal">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: g.color + "22", color: g.color }}>
                    <GenreIcon name={g.icon} size={17} />
                  </span>
                  <div>
                    <div className="font-semibold leading-tight">{g.name}</div>
                    <div className="text-[11px] text-muted">
                      anti-repetição {g.antiRepeatWindow} · {g.orderingPadrao.replace(/_/g, " ")}
                    </div>
                  </div>
                </Link>
                {g.status === "pausado" ? <Badge tone="red">pausado</Badge> : <Badge tone="green">ativo</Badge>}
              </div>

              <div className="flex gap-4 text-sm">
                <div>
                  <div className="text-lg font-bold text-signal">{g.expandedCount}</div>
                  <div className="text-[11px] text-muted">mídias de fontes</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{g.linkCount}</div>
                  <div className="text-[11px] text-muted">links manuais</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{g.sources.length}</div>
                  <div className="text-[11px] text-muted">fontes</div>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-muted/10 pt-3">
                <span className="text-[11px] text-muted">
                  {g.program ? `programa: ${g.program.name}` : "sem programa"}
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" title="Sincronizar todas as fontes" onClick={() => syncAll.mutate(g.id)}>
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
              {syncAll.isPending && syncAll.variables === g.id && <Spinner label="sincronizando…" />}
            </Card>
          ))}
        </div>
      )}

      {modal && <NewGenreModal onClose={() => setModal(false)} />}
    </div>
  );
}
