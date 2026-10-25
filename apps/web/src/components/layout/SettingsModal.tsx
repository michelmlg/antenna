/**
 * Configurações — modal grande com sidebar de seções. Mostra só o que é real:
 * o que vem de variáveis de ambiente aparece como leitura (com a origem), o que
 * a API controla (playout no ar) tem controle de verdade.
 */
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Info, RadioTower, Server, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { version } from "../../../package.json";
import { hhmm } from "../../lib/format";
import { usePlayoutControls } from "../../lib/playout";
import { usePlayoutState, useStreamInfo } from "../../lib/queries";
import { streamLinks } from "../../lib/stream";
import { CopyField } from "../CopyField";
import { Wordmark } from "../Logo";
import {
  Button,
  ErrorMsg,
  Field,
  IconButton,
  Modal,
  Pill,
  SettingRow,
  Switch,
  useToast,
  cn,
} from "../ui";
import type { SettingsSection } from "./settings-context";

const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: "geral", label: "Geral", icon: SlidersHorizontal },
  { id: "transmissao", label: "Transmissão", icon: RadioTower },
  { id: "sistema", label: "Sistema", icon: Server },
  { id: "sobre", label: "Sobre", icon: Info },
];

export function SettingsModal({
  initial = "geral",
  onClose,
}: {
  initial?: SettingsSection;
  onClose: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initial);
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <Modal bare size="xl" onClose={onClose} className="sm:h-[620px]">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-line bg-base/40 p-3 md:w-56 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-3 pb-3 pt-2 md:pb-5">
            <h2 className="font-semibold">Configurações</h2>
            <IconButton icon={X} label="Fechar" onClick={onClose} className="-mr-2 md:hidden" />
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={section === id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                  section === id
                    ? "bg-brand font-medium text-brand-ink"
                    : "text-sub hover:bg-raised hover:text-fg",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="hidden items-center justify-between px-8 pt-6 md:flex">
            <h3 className="text-lg font-semibold">{current.label}</h3>
            <IconButton icon={X} label="Fechar" onClick={onClose} className="-mr-2" />
          </div>
          <div
            key={section}
            className="min-h-0 flex-1 animate-fade-in overflow-y-auto px-5 py-5 md:px-8"
          >
            {section === "geral" && <Geral />}
            {section === "transmissao" && <Transmissao />}
            {section === "sistema" && <Sistema onClose={onClose} />}
            {section === "sobre" && <Sobre />}
          </div>
          <div className="flex justify-end border-t border-line px-5 py-4 md:px-8">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EnvNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex gap-3 rounded-xl bg-raised p-4 text-[13px] text-sub">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-dim" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

function Geral() {
  const { data: state } = usePlayoutState();
  const { start, stop } = usePlayoutControls();
  const toast = useToast();
  const running = !!state?.running;
  const busy = start.isPending || stop.isPending;
  return (
    <>
      <Field label="Canal">
        <input value={state?.channel || "—"} readOnly className="w-full font-mono" />
      </Field>
      <div className="mt-4">
        <SettingRow
          title="Transmissão no ar"
          description={running ? "O canal está publicando agora." : "O canal está parado."}
        >
          <Switch
            label={running ? "Tirar do ar" : "Colocar no ar"}
            checked={running}
            disabled={busy}
            onChange={(on) =>
              (on ? start : stop).mutate(undefined, {
                onSuccess: () => toast(on ? "Canal no ar" : "Canal fora do ar"),
              })
            }
          />
        </SettingRow>
      </div>
      <ErrorMsg error={start.error || stop.error} />
      <EnvNote>
        Nome do canal, token de acesso ao painel e início automático vêm das variáveis{" "}
        <code className="text-fg">CHANNEL</code>, <code className="text-fg">ADMIN_TOKEN</code> e{" "}
        <code className="text-fg">AUTOPLAY</code> em <code className="text-fg">infra/</code>. Altere
        lá e recrie os containers.
      </EnvNote>
    </>
  );
}

function Transmissao() {
  const { data: stream } = useStreamInfo();
  if (!stream)
    return <p className="text-sm text-dim">Sem informações de stream — API indisponível.</p>;
  const l = streamLinks(stream);
  return (
    <>
      <div className="space-y-4">
        <Field label="HLS (navegadores)">
          <CopyField value={l.hls} />
        </Field>
        <Field label="RTSP (VLC, mpv)">
          <CopyField value={l.rtsp} />
        </Field>
        <Field label="RTMP (OBS, ffmpeg)">
          <CopyField value={l.rtmp} />
        </Field>
        <Field label="IPTV (Jellyfin)">
          <div className="space-y-2">
            <CopyField label="M3U" value={l.m3u} />
            <CopyField label="Guia" value={l.xmltv} />
          </div>
        </Field>
      </div>
      <EnvNote>
        Portas e caminhos são definidos pelo MediaMTX (
        <code className="text-fg">infra/mediamtx.yml</code>) e pelo nginx da front door.
      </EnvNote>
    </>
  );
}

function Sistema({ onClose }: { onClose: () => void }) {
  const { data: state } = usePlayoutState();
  const navigate = useNavigate();
  const offline = state?.workerOnline === false;
  return (
    <>
      <SettingRow
        title="Worker de playout"
        description="Escolhe a fila e comanda o FFmpeg (tick de 5s)."
      >
        <Pill tone={offline ? "danger" : "ok"} dot>
          {offline ? "offline" : "online"}
        </Pill>
      </SettingRow>
      <SettingRow
        title="Publicação do estado"
        description="O painel lê o que o worker grava a cada tick."
      >
        <Pill tone={state?.stale ? "danger" : "ok"} dot>
          {state?.stale ? "atrasada" : "em dia"}
        </Pill>
      </SettingRow>
      <SettingRow title="Encoder (FFmpeg)" description="Processo que publica no servidor de mídia.">
        <span className="font-mono text-[13px] text-sub">pid {state?.current?.pid ?? "—"}</span>
      </SettingRow>
      <SettingRow title="Erros e reinícios" description="Contagem da sessão atual.">
        <span className="text-[13px] text-sub tnum">
          {state?.errors ?? 0} · {state?.restarts ?? 0}
        </span>
      </SettingRow>
      <SettingRow title="Sessão desde">
        <span className="text-[13px] text-sub tnum">{state?.since ? hhmm(state.since) : "—"}</span>
      </SettingRow>
      <div className="mt-6">
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            navigate("/atividade");
          }}
        >
          Ver atividade
        </Button>
      </div>
    </>
  );
}

function Sobre() {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <Wordmark markClassName="h-14 w-14" className="flex-col gap-3 [&>span]:text-2xl" />
      <p className="mt-2 text-sm text-sub">Do YouTube para a sua TV local.</p>
      <span className="mt-4 rounded-full bg-raised px-3 py-1 text-xs text-sub tnum">
        versão {version}
      </span>
    </div>
  );
}
