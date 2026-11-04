/**
 * SSE — empurra mudanças de estado do playout e de syncs para o painel.
 * A API observa a tabela publicada pelo worker (não há canal reverso).
 */
import { Router } from "express";
import { prisma } from "@antenna/database";
import { readState, readStateUpdatedAt } from "./playout.state";
import { config } from "../config";

export const eventsRoutes = Router();

const clients = new Set<import("express").Response>();

function send(res: import("express").Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function broadcast(event: string, data: unknown): void {
  for (const res of clients) send(res, event, data);
}

eventsRoutes.get("/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(`retry: 3000\n\n`);
  send(res, "hello", { channel: config.channel });
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// observador: 2s — publica state quando o payload muda; sync quando entra run nova
let lastStateJson = "";
let lastRunId = "";
let lastStateAt = "";

setInterval(async () => {
  if (!clients.size) return;
  try {
    const [state, updatedAt] = await Promise.all([readState(), readStateUpdatedAt()]);
    if (state) {
      const json = JSON.stringify(state);
      const stamp = updatedAt ? updatedAt.toISOString() : "";
      if (json !== lastStateJson || stamp !== lastStateAt) {
        lastStateJson = json;
        lastStateAt = stamp;
        broadcast("state", { ...state, updatedAt: stamp });
      }
    }
    const last = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } });
    if (last && last.id !== lastRunId) {
      lastRunId = last.id;
      broadcast("sync", { syncRunId: last.id });
    }
  } catch {
    /* banco momentaneamente indisponível: tenta de novo no próximo tick */
  }
}, 2000);
