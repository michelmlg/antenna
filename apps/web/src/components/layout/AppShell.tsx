/**
 * Shell do painel: sidebar (desktop), cabeçalho com título e relógio, navegação
 * inferior (celular) e o modal de Configurações, aberto de qualquer tela.
 */
import { useCallback, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  Cast,
  House,
  LayoutGrid,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { usePlayoutState, useStreamInfo } from "../../lib/queries";
import { useNow } from "../../lib/hooks";
import { ErrorBoundary } from "../ErrorBoundary";
import { LogoMark, Wordmark } from "../Logo";
import { IconButton, cn } from "../ui";
import { SettingsContext, type SettingsSection } from "./settings-context";
import { SettingsModal } from "./SettingsModal";

interface NavDef {
  to: string;
  label: string;
  icon: LucideIcon;
  title: string;
}

const NAV: NavDef[] = [
  { to: "/", label: "Início", icon: House, title: "Início" },
  { to: "/grade", label: "Grade", icon: CalendarDays, title: "Grade de programação" },
  { to: "/generos", label: "Gêneros", icon: LayoutGrid, title: "Gêneros" },
  { to: "/atividade", label: "Atividade", icon: Activity, title: "Atividade" },
  { to: "/assistir", label: "Assistir", icon: Cast, title: "Assistir" },
];

function titleFor(pathname: string): string {
  const hit = [...NAV]
    .reverse()
    .find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  return hit?.title ?? "Antenna";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const openSettings = useCallback((s: SettingsSection = "geral") => setSettings(s), []);
  const { data: state } = usePlayoutState();
  const issues = state?.workerOnline === false || !!state?.lastError;

  return (
    <SettingsContext.Provider value={openSettings}>
      <div className="flex h-full">
        {/* ---------- sidebar ---------- */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">
          <div className="px-5 py-6">
            <Wordmark />
          </div>
          <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
            {NAV.map((n) => (
              <SideLink key={n.to} item={n} dot={n.to === "/atividade" && issues} />
            ))}
          </nav>
          <div className="space-y-3 px-3 pb-4">
            <button
              type="button"
              onClick={() => openSettings()}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sub transition-colors duration-150",
                "hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
              )}
            >
              <Settings
                className="h-[18px] w-[18px] transition-transform duration-300 group-hover:rotate-45"
                aria-hidden
              />
              Configurações
            </button>
            <ChannelStatus />
          </div>
        </aside>

        {/* ---------- área de trabalho ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 px-5 lg:px-8">
            <LogoMark className="h-7 w-7 text-brand lg:hidden" />
            <h1 className="truncate text-lg font-semibold">{titleFor(pathname)}</h1>
            <div className="ml-auto flex items-center gap-2">
              <Clock />
              <IconButton
                icon={Settings}
                label="Configurações"
                onClick={() => openSettings()}
                className="lg:hidden"
              />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-1 lg:px-8 lg:pb-10">
            {/* key: cada rota entra com fade curto */}
            <div key={pathname.split("/")[1]} className="animate-fade-in">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      {/* ---------- navegação inferior (celular) ---------- */}
      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                isActive ? "text-brand" : "text-dim hover:text-sub",
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      {settings && <SettingsModal initial={settings} onClose={() => setSettings(null)} />}
    </SettingsContext.Provider>
  );
}

function SideLink({ item, dot }: { item: NavDef; dot?: boolean }) {
  const { to, label, icon: Icon } = item;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
          isActive
            ? "bg-brand font-medium text-brand-ink"
            : "text-sub hover:bg-raised hover:text-fg",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            aria-hidden
            className={cn(
              "h-[18px] w-[18px] transition-transform duration-150",
              !isActive && "group-hover:scale-110",
            )}
          />
          {label}
          {dot && (
            <span
              className={cn(
                "ml-auto h-1.5 w-1.5 rounded-full",
                isActive ? "bg-brand-ink" : "bg-danger",
              )}
              title="Há alertas"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

function ChannelStatus() {
  const { data: state } = usePlayoutState();
  const { data: stream } = useStreamInfo();
  const running = !!state?.running;
  const offline = state?.workerOnline === false;
  const detail = offline
    ? "Worker offline"
    : running
      ? stream?.viewers != null
        ? `No ar · ${stream.viewers} assistindo`
        : "No ar"
      : "Fora do ar";
  return (
    <div className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2.5">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          offline ? "bg-danger" : running ? "animate-blink bg-live" : "bg-dim",
        )}
      />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium">{state?.channel || "canal"}</div>
        <div className="text-xs text-dim">{detail}</div>
      </div>
    </div>
  );
}

function Clock() {
  const now = useNow(1000);
  return (
    <span className="hidden text-sm text-dim tnum sm:inline">
      {now.toLocaleTimeString("pt-BR")}
    </span>
  );
}
