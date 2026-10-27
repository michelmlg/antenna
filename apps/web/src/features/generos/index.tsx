/** Gêneros — coleção dos gêneros do canal: identidade, tamanho do acervo e espaço na grade. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LayoutGrid, Plus, RefreshCw } from "lucide-react";
import { api, type GenreRow } from "../../lib/api";
import { GENRE_PALETTE } from "../../lib/color";
import { fmtHours, plural } from "../../lib/format";
import { DEFAULT_GENRE_ICON } from "../../lib/icons";
import { useGenres, useSchedule } from "../../lib/queries";
import { GenreTile } from "../../components/GenreTile";
import {
  Button,
  Card,
  Empty,
  ErrorMsg,
  IconButton,
  Modal,
  Pill,
  Spinner,
  cn,
  useToast,
} from "../../components/ui";
import { IdentityFields } from "./GenreForm";
import { orderingLabel, weeklyMinutesByGenre } from "./shared";

function GenreCard({ g, minutes }: { g: GenreRow; minutes: number }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.post(`/genres/${g.id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genres"] });
      toast(`${g.name} sincronizado`);
    },
    onError: (e) => toast(`Sync falhou: ${(e as Error).message}`, { tone: "error" }),
  });
  const paused = g.status === "pausado";
  const open = () => navigate(`/generos/${g.id}`);

  return (
    <Card
      interactive
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()}
      className={cn(
        "group cursor-pointer p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
        paused && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <GenreTile icon={g.icon} color={g.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{g.name}</h3>
            {paused && <Pill>pausado</Pill>}
          </div>
          <p className="truncate text-[13px] text-dim">
            anti-repetição {g.antiRepeatWindow} · {orderingLabel(g.orderingPadrao)}
          </p>
        </div>
        <IconButton
          icon={RefreshCw}
          label="Sincronizar fontes"
          spin={sync.isPending}
          disabled={sync.isPending}
          className="-mr-1 -mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            sync.mutate();
          }}
        />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <span className="text-3xl font-semibold tracking-tight tnum">{g.expandedCount}</span>
          <span className="ml-1.5 text-[13px] text-dim">vídeos</span>
        </div>
        <div className="text-right text-[13px] text-dim">
          {plural(g.sources.length, "fonte", "fontes")} · {plural(g.linkCount, "link", "links")}
          <div className="text-sub">
            {minutes ? `${fmtHours(minutes)} por semana na grade` : "fora da grade"}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end text-[13px] text-dim">
        <span className="flex items-center gap-1 transition-colors group-hover:text-brand">
          Abrir
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Card>
  );
}

function NewGenreModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [d, setD] = useState({
    name: "",
    icon: DEFAULT_GENRE_ICON,
    color: GENRE_PALETTE[5] as string,
  });
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>("/genres", { ...d, name: d.name.trim() }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["genres"] });
      toast(`${d.name.trim()} criado · adicione as fontes`);
      onClose();
      navigate(`/generos/${g.id}`);
    },
  });
  return (
    <Modal
      title="Novo gênero"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!d.name.trim()}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Criar gênero
          </Button>
        </>
      }
    >
      <IdentityFields {...d} onChange={(p) => setD((prev) => ({ ...prev, ...p }))} />
      <ErrorMsg error={create.error} className="mt-4" />
    </Modal>
  );
}

export default function Generos() {
  const [modal, setModal] = useState(false);
  const { data: genres } = useGenres();
  const { data: schedule } = useSchedule();
  const minutes = weeklyMinutesByGenre(schedule ?? []);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="max-w-prose text-sm text-dim">
          Cada gênero agrupa canais, buscas e links, e define a mistura do que vai ao ar.
        </p>
        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => setModal(true)}>
          Novo gênero
        </Button>
      </div>

      {!genres ? (
        <Spinner />
      ) : genres.length === 0 ? (
        <Card>
          <Empty
            icon={LayoutGrid}
            title="Nenhum gênero ainda"
            action={
              <Button variant="primary" icon={Plus} onClick={() => setModal(true)}>
                Criar o primeiro
              </Button>
            }
          >
            Gêneros reúnem fontes do YouTube e decidem o que passa em cada bloco da grade.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {genres.map((g) => (
            <GenreCard key={g.id} g={g} minutes={minutes.get(g.id) ?? 0} />
          ))}
        </div>
      )}

      {modal && <NewGenreModal onClose={() => setModal(false)} />}
    </div>
  );
}
