/** Cliente HTTP da API (mesma origem; nginx/dev-proxy cuida do encaminhamento). */
async function req(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch("/api/v1" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: <T = unknown>(path: string) => req("GET", path) as Promise<T>,
  post: <T = unknown>(path: string, body?: unknown) => req("POST", path, body) as Promise<T>,
  put: <T = unknown>(path: string, body?: unknown) => req("PUT", path, body) as Promise<T>,
  patch: <T = unknown>(path: string, body?: unknown) => req("PATCH", path, body) as Promise<T>,
  del: <T = unknown>(path: string) => req("DELETE", path) as Promise<T>,
};

// ---------- tipos das respostas (espalhadas, alinhadas à API) ----------
export interface MediaLite {
  id: string;
  title: string;
  url: string;
  duration: number;
  source: string;
  status: string;
  channelTitle: string;
  views: number | null;
  uploadDate: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  categories?: { id: string; name: string; color: string }[];
}

export interface SourceRow {
  id: string;
  type: "video" | "channel" | "search" | "channelSearch";
  url: string;
  query: string;
  limit: number;
  status: string;
  sort: string;
  lastSyncAt: string | null;
  lastSyncCount: number;
  lastError: string;
  filters: Record<string, unknown> | null;
  filterChips?: string[];
  runs?: { id: string; message: string; startedAt: string; added: number; errors: number }[];
}

export interface MixIngredientRow {
  id: string;
  scope: "links" | "source" | "genre" | "category";
  sourceId: string | null;
  categoryName: string | null;
  count: number;
  order: number;
}

export interface GenreRow {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: string;
  antiRepeatWindow: number;
  orderingPadrao: string;
  linkCount: number;
  expandedCount: number;
  sources: SourceRow[];
  ingredients: MixIngredientRow[];
  program: { id: string; name: string; _count?: { schedule: number } } | null;
  createdAt: string;
}

export interface GenreDetail extends GenreRow {
  items: { id: string; order: number; media: MediaLite }[];
  pool: {
    links: MediaLite[];
    expanded: MediaLite[];
    porFonte: Record<string, number>;
    porFonteTotal: Record<string, number>;
  };
}

export interface ScheduleRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  program: {
    id: string;
    name: string;
    genre: { id: string; name: string; color: string; icon: string } | null;
  };
}

export interface QueueItemView {
  mediaId: string;
  title: string;
  url: string;
  source: string;
  duration: number;
  resolvedId: string | null;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  genre: { name: string; color: string; icon: string } | null;
}

export interface PlayoutState {
  running: boolean;
  channel: string;
  since: string | null;
  current: {
    mediaId: string;
    title: string;
    url: string;
    source: string;
    duration: number;
    programId: string | null;
    programName: string | null;
    startedAt: string;
    pid: number | null;
    isFallback: boolean;
  } | null;
  next: { title: string; program: string | null } | null;
  queue: QueueItemView[];
  errors: number;
  restarts: number;
  lastError: string | null;
  fallbackMediaId: string | null;
  stale?: boolean;
  workerOnline?: boolean;
}

export interface QueuePlan {
  program: string | null;
  approx: boolean;
  window: number | null;
  items: QueueItemView[];
}

export interface HistoryRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number;
  result: string;
  programId: string | null;
  channel: string;
  media: { id: string; title: string; source: string; thumbnailUrl: string | null };
}

export interface SyncRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  errors: number;
  message: string;
  source: {
    id: string;
    type: string;
    url: string;
    query: string;
    genre?: { id: string; name: string; color: string; icon: string };
  };
}

export interface ProgramRow {
  id: string;
  name: string;
  description: string;
  status: string;
  targetDuration: number;
  mixOverride: string | null;
  genre: { id: string; name: string; color: string; icon: string } | null;
  _count?: { schedule: number };
}

export interface StreamInfo {
  channel: string;
  hlsPath: string;
  rtspPath: string;
  viewers: number | null;
}
