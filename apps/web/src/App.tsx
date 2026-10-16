import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clapperboard, Film, ListVideo, RadioTower, Settings, Tv } from "lucide-react";
import { api, type PlayoutState } from "./lib/api";
import { useAntennaEvents } from "./lib/sse";
import { Badge } from "./components/ui";
import NoAr from "./features/noar";
import Generos from "./features/generos";
import GeneroDetalhe from "./features/genero-detalhe";
import Grade from "./features/grade";
import Programas from "./features/programas";
import Midias from "./features/midias";
import Operacao from "./features/operacao";

const NAV = [
  { to: "/", label: "No Ar", icon: Tv },
  { to: "/grade", label: "Grade", icon: CalendarDays },
  { to: "/generos", label: "Gêneros", icon: Clapperboard },
  { to: "/programas", label: "Programas", icon: Film },
  { to: "/midias", label: "Mídias", icon: ListVideo },
  { to: "/operacao", label: "Operação", icon: Settings },
];

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono text-sm text-muted">{now.toLocaleTimeString("pt-BR")}</span>;
}

export default function App() {
  useAntennaEvents();
  const { data: state } = useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });

  const live = !!state?.running;

  return (
    <div className="flex h-full">
      {/* ---------- sidebar ---------- */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-muted/10 bg-surface">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal text-background">
            <RadioTower size={20} />
          </span>
          <div>
            <div className="text-sm font-bold leading-tight">Antenna</div>
            <div className="text-[11px] text-muted">canal linear · LAN</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-signal/15 text-signal font-medium" : "text-muted hover:bg-muted/10 hover:text-foreground"
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-muted/10 px-4 py-4 text-[11px]">
          <div className="flex items-center gap-2">
            {live ? <Badge tone="signal">● AO VIVO</Badge> : <Badge>○ parado</Badge>}
            {state?.workerOnline === false && <Badge tone="red">worker offline</Badge>}
          </div>
          <div className="text-muted">
            canal <code className="text-foreground">{state?.channel || "—"}</code>
          </div>
        </div>
      </aside>

      {/* ---------- workspace ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-muted/10 px-6 py-3">
          <div className="text-sm font-semibold">Painel de programação</div>
          <Clock />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<NoAr />} />
            <Route path="/grade" element={<Grade />} />
            <Route path="/generos" element={<Generos />} />
            <Route path="/generos/:id" element={<GeneroDetalhe />} />
            <Route path="/programas" element={<Programas />} />
            <Route path="/midias" element={<Midias />} />
            <Route path="/operacao" element={<Operacao />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
