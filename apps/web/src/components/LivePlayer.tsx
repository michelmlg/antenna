/**
 * LivePlayer — player do canal reutilizável.
 * Estados: connecting → live / stalled / offline. Banner AO VIVO, loader custom,
 * botões de interação (som, reconectar, tela cheia), auto-reload quando a mídia
 * muda (via `mediaKey`) e watchdog de stall com backoff.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader } from "./Loader";
import { Volume2, VolumeX, RotateCw, Maximize } from "lucide-react";

type PlayerState = "connecting" | "live" | "stalled" | "offline";

export function LivePlayer({
  src,
  live,
  mediaKey,
  offlineLabel = "canal parado — inicie o playout",
  offlineAction,
  fill = false,
}: {
  src: string | null;
  /** muda quando a mídia no ar troca → recarrega a fonte sozinho */
  mediaKey?: string;
  live: boolean;
  offlineLabel?: string;
  /** ação opcional no estado offline (ex.: iniciar o playout direto daqui) */
  offlineAction?: { label: string; onClick: () => void };
  /** estica o quadro até o container (flex) em vez de 16:9 fixo — leve crop */
  fill?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastTimeRef = useRef(0);
  const stallSinceRef = useRef<number | null>(null);
  const [state, setState] = useState<PlayerState>("connecting");
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(true);
  const [showCtrl, setShowCtrl] = useState(true);

  const reconnect = useCallback(() => {
    setAttempt((a) => a + 1);
    setState("connecting");
  }, []);

  // carrega o stream (reexecuta a cada reconnect ou troca de mídia)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !live) {
      setState(live ? "connecting" : "offline");
      return;
    }
    setState("connecting");
    let destroyed = false;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 3, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(
        Hls.Events.FRAG_BUFFERED,
        () => !destroyed && setState((s) => (s === "connecting" ? "live" : s)),
      );
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      video.onloadeddata = () => !destroyed && setState("live");
    }

    return () => {
      destroyed = true;
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, live, attempt, mediaKey]);

  // watchdog: sem avanço de currentTime por 10s → reconecta (backoff)
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime > lastTimeRef.current + 0.1) {
        lastTimeRef.current = v.currentTime;
        stallSinceRef.current = null;
        setState((s) => (s === "stalled" ? "live" : s));
      } else if (v.readyState >= 2) {
        stallSinceRef.current ??= Date.now();
        if (Date.now() - stallSinceRef.current > 10000) {
          stallSinceRef.current = null;
          setState("stalled");
          setTimeout(reconnect, Math.min(1000 * 2 ** attempt, 30000));
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [live, attempt, reconnect]);

  const fullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    document.fullscreenElement
      ? document.exitFullscreen().catch(() => {})
      : el.requestFullscreen().catch(() => {});
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const banner =
    state === "live" ? (
      <span className="flex items-center gap-1.5 rounded bg-signal px-2 py-0.5 text-[11px] font-bold text-background">
        <i className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-background" /> AO VIVO
      </span>
    ) : state === "stalled" ? (
      <span className="rounded bg-danger/90 px-2 py-0.5 text-[11px] font-bold text-white">
        RECONECTANDO…
      </span>
    ) : state === "offline" ? (
      <span className="rounded bg-muted/60 px-2 py-0.5 text-[11px] font-bold text-background">
        OFFLINE
      </span>
    ) : null;

  return (
    <div
      ref={frameRef}
      className={
        fill
          ? "relative min-h-[200px] w-full flex-1 overflow-hidden rounded-lg bg-black"
          : "relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      }
      onMouseMove={() => {
        setShowCtrl(true);
        clearTimeout((frameRef.current as HTMLElement & { __t?: number }).__t);
        (frameRef.current as HTMLElement & { __t?: number }).__t = window.setTimeout(
          () => setShowCtrl(false),
          2500,
        );
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted={muted}
        autoPlay
        className={fill ? "h-full w-full object-cover" : "h-full w-full"}
      />

      {/* banner + controles */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">{banner}</div>
      <div
        className={`absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity ${showCtrl ? "opacity-100" : "opacity-0"}`}
      >
        <div className="flex gap-1.5">
          <PlayerBtn label={muted ? "Ativar som" : "Silenciar"} onClick={toggleMute}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </PlayerBtn>
          <PlayerBtn label="Reconectar" onClick={reconnect}>
            <RotateCw size={16} />
          </PlayerBtn>
        </div>
        <PlayerBtn label="Tela cheia" onClick={fullscreen}>
          <Maximize size={16} />
        </PlayerBtn>
      </div>

      {/* overlay de estado */}
      {(state === "connecting" || state === "offline" || state === "stalled") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          {state === "offline" ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted">{offlineLabel}</p>
              {offlineAction && (
                <button
                  type="button"
                  onClick={offlineAction.onClick}
                  className="rounded-lg bg-signal px-3.5 py-2 text-sm font-semibold text-background shadow-sm shadow-signal/20 transition-all hover:bg-signal/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                >
                  {offlineAction.label}
                </button>
              )}
            </div>
          ) : (
            <Loader
              label={state === "stalled" ? "reconectando ao canal…" : "conectando ao canal…"}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PlayerBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-signal hover:text-background"
    >
      {children}
    </button>
  );
}
