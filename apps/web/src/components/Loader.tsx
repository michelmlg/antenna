/** Loader reutilizável — torre da Antenna pulsando + mensagem. */
export function Loader({ label = "carregando…", size = 44 }: { label?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3 text-muted">
      <div className="relative" style={{ width: size, height: size }}>
        <div className="absolute inset-0 animate-ping rounded-full bg-signal/20" />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-surface">
          <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} className="text-signal" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
          </svg>
        </div>
      </div>
      {label && <p className="text-xs">{label}</p>}
    </div>
  );
}
