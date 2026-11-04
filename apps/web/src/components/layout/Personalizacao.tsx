/**
 * Configurações → Personalização. Tabs (hoje só "Logo"): logo sobreposto ao
 * sinal com prévia que imita a tela do canal. A geometria da prévia vem da
 * mesma função usada pelo FFmpeg (packages/core/branding).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_LOGO,
  LOGO_LIMITS,
  logoBox,
  type LogoCorner,
  type LogoSettings,
} from "@antenna/core/branding";
import { api, type BrandingPayload } from "../../lib/api";
import { usePlayoutState } from "../../lib/queries";
import { thumbOf } from "../Thumb";
import { Button, ErrorMsg, LiveBadge, Spinner, Switch, Tabs, cn, useToast } from "../ui";

type Draft = Omit<LogoSettings, "file">;

const CORNERS: { id: LogoCorner; label: string }[] = [
  { id: "top-left", label: "Superior esquerdo" },
  { id: "top-right", label: "Superior direito" },
  { id: "bottom-left", label: "Inferior esquerdo" },
  { id: "bottom-right", label: "Inferior direito" },
];

export function Personalizacao() {
  const [tab, setTab] = useState<"logo">("logo");
  return (
    <>
      <Tabs
        className="mb-6"
        active={tab}
        onChange={setTab}
        tabs={[{ id: "logo", label: "Logo" }]}
      />
      {tab === "logo" && <LogoTab />}
    </>
  );
}

const appliedMsg = (what: string, p: BrandingPayload) =>
  p.applied ? `${what} · aplicado na transmissão` : `${what} · entra no próximo vídeo`;

function toDraft(l: LogoSettings): Draft {
  const { file: _file, ...rest } = l;
  void _file;
  return rest;
}

function LogoTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.get<BrandingPayload>("/settings/branding"),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved = data ? toDraft(data.logo) : toDraft(DEFAULT_LOGO);
  const d = draft ?? saved;
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });

  const onSaved = (p: BrandingPayload) => {
    qc.setQueryData(["branding"], p);
    setDraft(null);
  };
  const save = useMutation({
    mutationFn: () => api.put<BrandingPayload>("/settings/branding/logo", d),
    onSuccess: (p) => {
      onSaved(p);
      toast(appliedMsg("Logo salvo", p));
    },
  });
  const upload = useMutation({
    mutationFn: (base64: string) =>
      api.post<BrandingPayload>("/settings/branding/logo/file", { data: base64 }),
    onSuccess: (p) => {
      qc.setQueryData(["branding"], p);
      toast(appliedMsg("Logo enviado", p));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del<BrandingPayload>("/settings/branding/logo/file"),
    onSuccess: (p) => {
      onSaved(p);
      toast(appliedMsg("Logo removido", p), { icon: Trash2 });
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  function pick(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type))
      return setFileError("Envie um PNG ou WebP (de preferência com fundo transparente).");
    if (file.size > 5 * 1024 * 1024) return setFileError("O arquivo passa de 5 MB.");
    const reader = new FileReader();
    reader.onload = () => upload.mutate(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  }

  if (isLoading || !data) return <Spinner />;
  const hasFile = !!data.logo.file;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* ---------- prévia ---------- */}
      <div className="min-w-0">
        <Preview logoUrl={data.logoUrl} draft={d} />
        <p className="mt-2 text-xs text-dim">
          Prévia com a imagem do próximo vídeo. O logo é desenhado no próprio sinal — aparece igual
          no navegador, VLC e Jellyfin.
        </p>
      </div>

      {/* ---------- controles ---------- */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-raised p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(theme(colors.element)_0_25%,theme(colors.panel)_0_50%)] bg-[length:12px_12px]">
            {data.logoUrl ? (
              <img
                src={data.logoUrl}
                alt="Logo atual"
                className="max-h-10 max-w-10 object-contain"
              />
            ) : (
              <ImagePlus className="h-5 w-5 text-dim" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm">{hasFile ? "Logo do canal" : "Nenhum logo"}</div>
            <div className="text-xs text-dim">PNG ou WebP · até 5 MB</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            icon={Upload}
            className="flex-1"
            loading={upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {hasFile ? "Trocar" : "Enviar logo"}
          </Button>
          {hasFile && (
            <Button
              variant="danger"
              icon={Trash2}
              loading={remove.isPending}
              onClick={() => window.confirm("Remover o logo da transmissão?") && remove.mutate()}
              aria-label="Remover logo"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {fileError && <p className="text-[13px] text-danger">{fileError}</p>}
        <ErrorMsg error={upload.error || remove.error} />

        <div className={cn("space-y-5", !hasFile && "pointer-events-none opacity-40")}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm">Mostrar na transmissão</div>
              <div className="text-xs text-dim">Desligado, o logo fica guardado.</div>
            </div>
            <Switch
              label="Mostrar logo"
              checked={d.enabled}
              onChange={(v) => set({ enabled: v })}
            />
          </div>

          <div>
            <span className="mb-2 block text-[13px] text-sub">Canto</span>
            <div
              className="grid w-40 grid-cols-2 gap-1.5 rounded-xl bg-raised p-1.5"
              role="radiogroup"
              aria-label="Canto do logo"
            >
              {CORNERS.map((c) => {
                const on = d.corner === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => set({ corner: c.id })}
                    className={cn(
                      "relative h-12 rounded-lg border transition-[background-color,border-color,transform] duration-150 active:scale-95",
                      on ? "border-brand bg-brand/10" : "border-line hover:border-element",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute h-2.5 w-4 rounded-sm transition-colors",
                        on ? "bg-brand" : "bg-element",
                        c.id.startsWith("top") ? "top-1.5" : "bottom-1.5",
                        c.id.endsWith("left") ? "left-1.5" : "right-1.5",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <Slider
            label="Tamanho"
            hint="% da largura da tela"
            value={d.scale}
            {...LOGO_LIMITS.scale}
            onChange={(v) => set({ scale: v })}
          />
          <Slider
            label="Distância do canto"
            hint="% da largura da tela"
            value={d.margin}
            step={0.5}
            {...LOGO_LIMITS.margin}
            onChange={(v) => set({ margin: v })}
          />
          <Slider
            label="Opacidade"
            hint="%"
            value={d.opacity}
            step={5}
            {...LOGO_LIMITS.opacity}
            onChange={(v) => set({ opacity: v })}
          />
        </div>

        <div className="flex items-center gap-2 border-t border-line pt-4">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Salvar
          </Button>
          {dirty && (
            <Button variant="ghost" icon={RotateCcw} onClick={() => setDraft(null)}>
              Descartar
            </Button>
          )}
        </div>
        <p className="text-xs text-dim">
          Aplicado na hora: o vídeo no ar continua do mesmo ponto, com uma emenda de cerca de 1
          segundo.
        </p>
        <ErrorMsg error={save.error} />
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-sub">
        {label}
        <span className="text-xs text-dim tnum">
          {String(value).replace(".", ",")} {hint}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-brand"
      />
    </label>
  );
}

/** Imita o player do canal: frame do próximo vídeo + selo AO VIVO + logo posicionado. */
function Preview({ logoUrl, draft }: { logoUrl: string | null; draft: Draft }) {
  const { data: state } = usePlayoutState();
  const frame = state?.queue?.map((q) => thumbOf(q)).find(Boolean) ?? null;
  const [aspect, setAspect] = useState(2);
  useEffect(() => setAspect(2), [logoUrl]);
  const box = logoBox({ ...draft, file: logoUrl }, 16 / 9, aspect);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {frame ? (
        <img src={frame} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-element to-base" />
      )}
      <LiveBadge
        className={cn(
          "absolute",
          // o selo foge do canto do logo para não sobrepor
          draft.corner === "top-left" ? "right-4 top-4" : "left-4 top-4",
        )}
      />
      {logoUrl && draft.enabled && (
        <img
          src={logoUrl}
          alt="Logo na transmissão"
          onLoad={(e) => {
            const i = e.currentTarget;
            if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight);
          }}
          className="absolute transition-[left,top,width,opacity] duration-200 ease-out"
          style={{
            left: `${box.left * 100}%`,
            top: `${box.top * 100}%`,
            width: `${box.width * 100}%`,
            opacity: draft.opacity / 100,
          }}
        />
      )}
      {(!logoUrl || !draft.enabled) && (
        <div className="absolute inset-x-0 bottom-4 text-center text-xs text-white/70">
          {logoUrl ? "Logo desligado" : "Envie um logo para ver a prévia"}
        </div>
      )}
    </div>
  );
}
