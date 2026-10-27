/**
 * Contrato único API ↔ Web: schemas Zod de entrada e tipos compartilhados.
 * Tudo que entra pela API valida aqui; tudo que a web envia tipa daqui.
 */
import { z } from "zod";

// ---------- enums ----------
export const SOURCE_TYPES = ["video", "channel", "search", "channelSearch"] as const;
export const SOURCE_SORTS = ["recent", "oldest"] as const;
export const MIX_SCOPES = ["links", "source", "genre", "category"] as const;
export const ORDERINGS = ["aleatoria", "menos_reproduzidos", "mais_antigos", "definida"] as const;

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const sourceSortSchema = z.enum(SOURCE_SORTS);
export const mixScopeSchema = z.enum(MIX_SCOPES);
export const orderingSchema = z.enum(ORDERINGS);

// ---------- filtros avançados de fonte (espelha packages/core/filters) ----------
export const sourceFiltersSchema = z.object({
  titleHas: z.array(z.string()).max(8).optional(),
  titleLacks: z.array(z.string()).max(8).optional(),
  minDur: z.number().int().min(1).max(1440).nullable().optional(),
  maxDur: z.number().int().min(1).max(1440).nullable().optional(),
  excludeShorts: z.boolean().optional(),
  minViews: z.number().int().min(0).nullable().optional(),
  maxViews: z.number().int().min(0).nullable().optional(),
  excludeLive: z.boolean().optional(),
  dateMode: z.enum(["any", "range", "older", "newer"]).optional(),
  yearFrom: z.number().int().min(2005).max(2100).nullable().optional(),
  yearTo: z.number().int().min(2005).max(2100).nullable().optional(),
  olderYears: z.number().int().min(1).max(80).nullable().optional(),
  newerMonths: z.number().int().min(1).max(600).nullable().optional(),
});
export type SourceFilters = z.infer<typeof sourceFiltersSchema>;

// ---------- gêneros ----------
export const genreCreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().max(8).optional(),
});
export const genreUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().max(8).optional(),
  status: z.enum(["ativo", "pausado"]).optional(),
  antiRepeatWindow: z.number().int().min(1).max(100).optional(),
  orderingPadrao: orderingSchema.optional(),
});

// ---------- fontes ----------
export const sourceCreateSchema = z.object({
  type: sourceTypeSchema,
  url: z.string().max(500).optional(),
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  title: z.string().max(200).optional(), // só p/ type=video (título da mídia)
  sort: sourceSortSchema.optional(),
});
export const sourceUpdateSchema = z.object({
  status: z.enum(["ativo", "pausado"]).optional(),
  url: z.string().max(500).optional(),
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  sort: sourceSortSchema.optional(),
  filters: sourceFiltersSchema.nullable().optional(),
});

// ---------- mistura ----------
export const mixIngredientSchema = z.object({
  scope: mixScopeSchema,
  sourceId: z.string().uuid().nullable().optional(),
  categoryName: z.string().max(80).nullable().optional(),
  count: z.number().int().min(1).max(10),
});
export const mixUpdateSchema = z.object({
  ingredients: z.array(mixIngredientSchema).min(1).max(8),
});

// ---------- grade ----------
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleCreateSchema = z.object({
  genreId: z.string().uuid().optional(), // cria/reaproveita o auto-programa do gênero
  programId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: hhmm,
  endTime: hhmm,
});
export const scheduleUpdateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
});

// ---------- perfis de grade ----------
export const scheduleProfileCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  blocks: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: hhmm,
        endTime: hhmm,
        genreId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(300),
});
export type ScheduleProfileCreate = z.infer<typeof scheduleProfileCreateSchema>;

// ---------- playout ----------
export const playNowSchema = z.object({ mediaId: z.string().uuid() });
export const fallbackSchema = z.object({ mediaId: z.string().uuid().nullable() });

/** Item da fila persistida (gerada uma vez, consumida em ordem). */
export const queueItemSchema = z.object({
  mediaId: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  duration: z.number(),
  resolvedId: z.string().nullable(),
  channelTitle: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  genre: z.object({ name: z.string(), color: z.string(), icon: z.string() }).nullable(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

// ---------- falhas de reprodução ----------
/** Causa classificada de uma falha (ver packages/core/failures). */
export const FAILURE_KINDS = [
  "source_forbidden", // YouTube/CDN recusou a URL (403)
  "source_unresolvable", // yt-dlp não achou stream (bot-check, indisponível...)
  "sink_unreachable", // mediamtx fora do ar / sem rede / DNS
  "input_died", // demuxer desistiu de um input no meio da exibição
  "unknown",
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Rótulo curto + explicação + de quem é a culpa (vídeo ou infraestrutura). */
export const FAILURE_INFO: Record<FailureKind, { label: string; hint: string; blame: "media" | "infra" | "unknown" }> = {
  source_forbidden: {
    label: "YouTube recusou (403)",
    hint: "A URL do vídeo foi negada pelo servidor de mídia. Costuma ser transitório ou específico do vídeo.",
    blame: "media",
  },
  source_unresolvable: {
    label: "Vídeo não resolvido",
    hint: "O yt-dlp não obteve o stream (vídeo indisponível, bot-check ou limite do YouTube).",
    blame: "media",
  },
  sink_unreachable: {
    label: "MediaMTX inacessível",
    hint: "O worker não consegue publicar no MediaMTX (container parado, sem rede ou DNS). O vídeo não tem culpa.",
    blame: "infra",
  },
  input_died: {
    label: "Stream interrompido",
    hint: "O vídeo ou o áudio parou no meio da exibição.",
    blame: "media",
  },
  unknown: { label: "Falha desconhecida", hint: "Veja a linha bruta do ffmpeg no log do worker.", blame: "unknown" },
};

/** `result` do histórico: "error" legado ou "error:<kind>". */
export function parseHistoryResult(result: string): { base: string; kind: FailureKind | null } {
  if (!result.startsWith("error:")) return { base: result, kind: null };
  const k = result.slice(6) as FailureKind;
  return { base: "error", kind: (FAILURE_KINDS as readonly string[]).includes(k) ? k : "unknown" };
}

export const failureSchema = z.object({
  kind: z.enum(FAILURE_KINDS),
  message: z.string(),
  title: z.string().nullable(),
  at: z.string(),
  attempt: z.number().nullable(),
  maxAttempts: z.number().nullable(),
});
export type Failure = z.infer<typeof failureSchema>;

export const quarantineEntrySchema = z.object({
  mediaId: z.string(),
  title: z.string(),
  kind: z.enum(FAILURE_KINDS),
  failures: z.number(),
  until: z.string().nullable(), // null = ainda contando, sem quarentena
});
export type QuarantineEntry = z.infer<typeof quarantineEntrySchema>;

/** Saúde do canal: ok | degraded (se recuperando) | blocked (disjuntor aberto). */
export const playoutHealthSchema = z.object({
  status: z.enum(["ok", "degraded", "blocked"]),
  sink: z.enum(["ok", "down"]),
  sinkFailures: z.number(), // falhas consecutivas de publicação
  nextRetryAt: z.string().nullable(),
  counts: z.record(z.string(), z.number()).default({}), // por FailureKind, desde o boot
  lastFailure: failureSchema.nullable(),
});
export type PlayoutHealth = z.infer<typeof playoutHealthSchema>;

/** Payload que o worker publica em PlayoutState (id=1) a cada tick. */
export const playoutStatePayloadSchema = z.object({
  running: z.boolean(),
  channel: z.string(),
  since: z.string().nullable(),
  current: z
    .object({
      mediaId: z.string(),
      title: z.string(),
      url: z.string(),
      source: z.string(),
      duration: z.number(),
      programId: z.string().nullable(),
      programName: z.string().nullable(),
      startedAt: z.string(),
      pid: z.number().nullable(),
      isFallback: z.boolean(),
    })
    .nullable(),
  next: z.object({ title: z.string(), program: z.string().nullable() }).nullable(),
  queue: z.array(queueItemSchema).default([]),
  errors: z.number(),
  restarts: z.number(),
  lastError: z.string().nullable(),
  fallbackMediaId: z.string().nullable(),
  // campos novos são opcionais: payloads gravados por workers antigos continuam válidos
  health: playoutHealthSchema.optional(),
  quarantine: z.array(quarantineEntrySchema).optional(),
});
export type PlayoutStatePayload = z.infer<typeof playoutStatePayloadSchema>;

// ---------- personalização: logo sobre a transmissão ----------
export const LOGO_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export const logoSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  corner: z.enum(LOGO_CORNERS).optional(),
  scale: z.number().min(3).max(30).optional(),
  margin: z.number().min(0).max(10).optional(),
  opacity: z.number().min(10).max(100).optional(),
});
export type LogoSettingsUpdate = z.infer<typeof logoSettingsUpdateSchema>;

/** Upload do logo: PNG/WebP em base64 (sem prefixo data:), até ~5 MB. */
export const logoUploadSchema = z.object({
  data: z.string().min(1).max(7_000_000),
});
