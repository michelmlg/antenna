/**
 * LivePlayer — player do canal reutilizável.
 * Estados: connecting → live / stalled / offline. Selo AO VIVO, marca d'água do
 * canal, controles no hover (volume, reconectar, tela cheia), auto-reload quando a
 * mídia muda (via `mediaKey`) e watchdog de stall com backoff.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Hls from "hls.js";
import { Maximize, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { Loader } from "./Loader";
import { LogoMark } from "./Logo";
import { IconButton, LiveBadge, cn } from "./ui";

type PlayerState = "connecting" | "live" | "stalled" | "offline";

const VOLUME_KEY = "antenna.volume";

/** Último volume escolhido (0–1); o storage pode falhar (aba privada) → 100%. */
function loadVolume(): number {
  try {
    const n = Number(localStorage.getItem(VOLUME_KEY));
    if (localStorage.getItem(VOLUME_KEY) != null && Number.isFinite(n))
      return Math.min(1, Math.max(0, n));
  } catch {
    /* sem storage */
  }
  return 1;
}

export function LivePlayer({
  src,
  live,
  mediaKey,
  progress,
  offline,
}: {
  src: string | null;
  live: boolean;
  /** muda quando a mídia no ar troca → recarrega a fonte sozinho */
  mediaKey?: string;
  /** 0–100: barra fina de progresso do item no rodapé do player */
  progress?: number | null;
  /** conteúdo do estado offline (mensagem + ação) */
  offline?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef(0);
  const stallSinceRef = useRef<number | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const [state, setState] = useState<PlayerState>("connecting");
  const [attempt, setAttempt] = useState(0);
  // começa mudo (autoplay do navegador); o volume guardado vale ao ativar o som
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(loadVolume);
  const [volOpen, setVolOpen] = useState(false);
  const volRef = useRef<HTMLDivElement>(null);
  const volTimer = useRef<number | undefined>(undefined);
  const [showCtrl, setShowCtrl] = useState(false);

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

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(volTimer.current);
    },
    [],
  );

  // aplica volume/mudo no <video>
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  // seletor aberto: fecha ao clicar fora, com Esc ou após 4 s sem uso
  const touchVol = useCallback(() => {
    window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => setVolOpen(false), 4000);
  }, []);
  useEffect(() => {
    if (!volOpen) return;
    touchVol();
    const down = (e: PointerEvent) => {
      if (!volRef.current?.contains(e.target as Node)) setVolOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setVolOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.clearTimeout(volTimer.current);
    };
  }, [volOpen, touchVol]);

  const fullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };
  // 1º clique abre o seletor; com ele aberto, o clique no ícone alterna mudo/som
  const onVolumeButton = () => {
    if (!volOpen) return setVolOpen(true);
    touchVol();
    if (muted && volume === 0) setVolume(0.5);
    setMuted(!muted);
  };
  const changeVolume = (pct: number) => {
    const v = pct / 100;
    setVolume(v);
    setMuted(v === 0);
    touchVol();
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* sem storage */
    }
  };
  const wake = () => {
    setShowCtrl(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowCtrl(false), 2500);
  };

  const onAir = state === "live";

  return (
    <div
      ref={frameRef}
      className="group relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      onPointerMove={wake}
      onPointerLeave={() => setShowCtrl(false)}
    >
      <video ref={videoRef} playsInline muted autoPlay className="h-full w-full" />

      {/* topo: selo + marca d'água do canal (o "bug" de TV) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-5">
        <div>
          {onAir && <LiveBadge className="animate-fade-in" />}
          {state === "stalled" && (
            <span className="rounded-md bg-danger/90 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
              Reconectando…
            </span>
          )}
        </div>
        {live && (
          <div className="flex animate-fade-in items-center gap-2 opacity-90 [filter:drop-shadow(0_1px_6px_rgba(0,0,0,0.55))]">
            <LogoMark className="h-6 w-6 text-brand sm:h-8 sm:w-8" />
            <span className="text-sm font-semibold tracking-tight text-white sm:text-lg">
              Antenna
            </span>
          </div>
        )}
      </div>

      {/* controles: aparecem no movimento do ponteiro / foco por teclado */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity duration-200",
          "focus-within:opacity-100",
          showCtrl || volOpen ? "opacity-100" : "opacity-0",
        )}
      >
        <div ref={volRef} className="relative">
          <IconButton
            tone="onMedia"
            icon={muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2}
            label={volOpen ? (muted ? "Ativar som" : "Silenciar") : "Volume"}
            aria-expanded={volOpen}
            onClick={onVolumeButton}
          />
          {/* popover vertical acima do botão: não empurra os outros controles */}
          <div
            className={cn(
              "absolute bottom-full left-0 mb-2 flex w-8 origin-bottom flex-col items-center gap-2 rounded-lg bg-black/40 py-2.5 backdrop-blur transition-[opacity,transform] duration-150 ease-out",
              volOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
            )}
          >
            <span className="text-[11px] text-white/80 tnum">
              {muted ? 0 : Math.round(volume * 100)}%
            </span>
            <div className="relative h-24 w-4">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={muted ? 0 : Math.round(volume * 100)}
                onChange={(e) => changeVolume(Number(e.target.value))}
                tabIndex={volOpen ? 0 : -1}
                aria-label="Volume"
                className="absolute left-1/2 top-1/2 h-1 w-24 -translate-x-1/2 -translate-y-1/2 -rotate-90 cursor-pointer accent-brand"
              />
            </div>
          </div>
        </div>
        <IconButton tone="onMedia" icon={RotateCw} label="Reconectar" onClick={reconnect} />
        <IconButton
          tone="onMedia"
          icon={Maximize}
          label="Tela cheia"
          onClick={fullscreen}
          className="ml-auto"
        />
      </div>

      {progress != null && onAir && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <div
            className="h-full bg-brand transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* overlay de estado */}
      {state !== "live" && state !== "stalled" && (
        <div className="absolute inset-0 flex animate-fade-in items-center justify-center bg-base/90">
          {state === "offline" ? (
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <LogoMark className="h-12 w-12 text-element" />
              {offline}
            </div>
          ) : (
            <Loader label="conectando ao canal…" />
          )}
        </div>
      )}
      {state === "stalled" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader label="reconectando ao canal…" />
        </div>
      )}
    </div>
  );
}
