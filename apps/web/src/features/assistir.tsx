/** Assistir — como conectar cada tipo de tela ao canal (endereços reais da LAN). */
import { Globe, Monitor, MonitorPlay, Router, Smartphone, Tv, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useStreamInfo } from "../lib/queries";
import { streamLinks } from "../lib/stream";
import { CopyField } from "../components/CopyField";
import { Card, Empty, Pill, Spinner } from "../components/ui";

function ClientCard({
  icon: Icon,
  title,
  description,
  children,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Card padded interactive className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {aside}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-dim">{description}</p>
      <div className="mt-5 space-y-2">{children}</div>
    </Card>
  );
}

const DEVICES: [LucideIcon, string][] = [
  [Tv, "TVs"],
  [Monitor, "Computadores"],
  [Smartphone, "Celulares"],
  [Router, "Set-top boxes"],
];

export default function Assistir() {
  const { data: stream, isLoading } = useStreamInfo();
  const l = stream ? streamLinks(stream) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 max-w-xl">
        <h2 className="text-2xl font-semibold tracking-tight">Assista em qualquer tela</h2>
        <p className="mt-2 text-sm text-sub">
          O mesmo canal, em vários formatos. Escolha onde quer assistir e copie o endereço — nada
          sai da sua rede.
        </p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !stream || !l ? (
        <Empty title="Sem informações de stream">
          A API não respondeu. Tente de novo em instantes.
        </Empty>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <ClientCard
              icon={Globe}
              title="Navegador"
              description="Qualquer celular, computador ou smart TV com navegador."
              aside={
                stream.viewers != null && (
                  <Pill tone={stream.viewers > 0 ? "ok" : "muted"} dot>
                    {stream.viewers} assistindo
                  </Pill>
                )
              }
            >
              <CopyField value={l.hls} />
            </ClientCard>
            <ClientCard
              icon={MonitorPlay}
              title="VLC ou mpv"
              description="Mídia → Abrir fluxo de rede, e cole o endereço."
            >
              <CopyField value={l.rtsp} />
            </ClientCard>
            <ClientCard
              icon={Tv}
              title="Jellyfin / IPTV"
              description="Adicione a lista M3U como sintonizador e o XMLTV como guia em Live TV."
            >
              <CopyField label="M3U" value={l.m3u} />
              <CopyField label="Guia" value={l.xmltv} />
            </ClientCard>
          </div>

          <details className="group mt-5 rounded-xl border border-line bg-panel p-4">
            <summary className="cursor-pointer select-none text-sm text-sub transition-colors hover:text-fg">
              Avançado · RTMP para reencaminhar (OBS, ffmpeg)
            </summary>
            <CopyField value={l.rtmp} className="mt-3 max-w-md" />
          </details>
        </>
      )}

      <div className="mt-10 grid grid-cols-2 gap-6 text-center text-sm text-sub sm:grid-cols-4">
        {DEVICES.map(([Icon, label]) => (
          <div key={label} className="group">
            <Icon
              className="mx-auto mb-2 h-7 w-7 text-dim transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:text-brand"
              aria-hidden
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
