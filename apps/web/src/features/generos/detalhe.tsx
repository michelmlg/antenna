/** Detalhe do gênero — cabeçalho + abas Fontes, Mistura, Links manuais e Ajustes. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api, type GenreDetail } from "../../lib/api";
import { fmtHours } from "../../lib/format";
import { useSchedule } from "../../lib/queries";
import { GenreTile } from "../../components/GenreTile";
import { Button, Pill, Spinner, Tabs, useToast } from "../../components/ui";
import { AjustesTab } from "./ajustes";
import { FontesTab } from "./fontes";
import { LinksTab } from "./links";
import { MisturaTab } from "./mistura";
import { weeklyMinutesByGenre } from "./shared";

type Tab = "fontes" | "mistura" | "links" | "ajustes";
const TABS: Tab[] = ["fontes", "mistura", "links", "ajustes"];

export default function GeneroDetalhe() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  // aba na URL (?aba=mistura): recarregar/compartilhar mantém o contexto
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("aba") as Tab) ? params.get("aba") : "fontes") as Tab;

  const { data: g } = useQuery({
    queryKey: ["genre", id],
    queryFn: () => api.get<GenreDetail>(`/genres/${id}`),
    refetchInterval: 15000,
  });
  const { data: schedule } = useSchedule();
  const sync = useMutation({
    mutationFn: () => api.post(`/genres/${id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genre", id] });
      qc.invalidateQueries({ queryKey: ["source-media"] });
      toast("Fontes sincronizadas");
    },
    onError: (e) => toast(`Sync falhou: ${(e as Error).message}`, { tone: "error" }),
  });

  if (!g) return <Spinner />;
  const minutes = weeklyMinutesByGenre(schedule ?? []).get(g.id) ?? 0;
  const paused = g.status === "pausado";

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/generos"
        className="group mb-4 inline-flex items-center gap-1.5 rounded text-[13px] text-dim transition-colors hover:text-fg"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Gêneros
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <GenreTile icon={g.icon} color={g.color} size="lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{g.name}</h2>
            <Pill tone={paused ? "muted" : "ok"}>{paused ? "pausado" : "ativo"}</Pill>
          </div>
          <p className="mt-0.5 text-sm text-dim tnum">
            {g.pool.expanded.length} vídeos sincronizados ·{" "}
            {minutes ? `${fmtHours(minutes)} por semana na grade` : "fora da grade"}
          </p>
        </div>
        <Button
          className="ml-auto"
          icon={RefreshCw}
          loading={sync.isPending}
          onClick={() => sync.mutate()}
        >
          Sincronizar
        </Button>
      </div>

      <Tabs
        className="mb-6"
        active={tab}
        onChange={(t) => setParams(t === "fontes" ? {} : { aba: t }, { replace: true })}
        tabs={[
          { id: "fontes", label: "Fontes", count: g.sources.length },
          { id: "mistura", label: "Mistura" },
          { id: "links", label: "Links manuais", count: g.items.length },
          { id: "ajustes", label: "Ajustes" },
        ]}
      />

      <div key={tab} className="animate-fade-in">
        {tab === "fontes" && <FontesTab genre={g} />}
        {tab === "mistura" && <MisturaTab genre={g} />}
        {tab === "links" && <LinksTab genre={g} />}
        {/* key: recarrega o formulário quando o gênero muda no servidor */}
        {tab === "ajustes" && <AjustesTab key={g.id} genre={g} />}
      </div>
    </div>
  );
}
