/** Loader de marca — a torre da Antenna com ondas pulsando + mensagem. */
import { LogoMark } from "./Logo";

export function Loader({ label = "carregando…", size = 44 }: { label?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3 text-sub">
      <div className="relative" style={{ width: size, height: size }}>
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-panel">
          <LogoMark className="h-[60%] w-[60%] text-brand" />
        </span>
      </div>
      {label && <p className="text-xs">{label}</p>}
    </div>
  );
}
