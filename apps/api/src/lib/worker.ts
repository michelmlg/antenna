/**
 * Cliente do worker de playout (rede interna do compose).
 * Comandos (start/stop/play-now/fallback/queue) e operações que precisam
 * dos binários (probe/sync) moram no worker — a API é o proxy do painel.
 */
import { config } from "../config";
import { HttpError } from "./http";

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 120000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(config.playoutUrl + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(config.adminToken ? { authorization: `Bearer ${config.adminToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new HttpError(res.status, String(data.error || `worker respondeu ${res.status}`));
    return data as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, "worker de playout indisponível", "WORKER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

export const worker = {
  get: <T>(path: string) => call<T>("GET", path, undefined, 15000),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) => call<T>("POST", path, body, timeoutMs),
};
