/** Montagem do app Express. */
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./lib/http";
import { logger } from "./lib/logger";
import { eventsRoutes } from "./modules/events.routes";
import { mediaRoutes } from "./modules/media.routes";
import { playoutRoutes } from "./modules/playout.routes";
import { scheduleRoutes } from "./modules/scheduling.routes";
import { streamRoutes } from "./modules/stream.routes";
import { syncRoutes } from "./modules/sync.routes";
import genresRouter from "./modules/genres.routes";

export function buildApp(): express.Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  app.use("/api/v1/genres", genresRouter);
  app.use("/api/v1/media", mediaRoutes);
  app.use("/api/v1/schedule", scheduleRoutes);
  app.use("/api/v1/playout", playoutRoutes);
  app.use("/api/v1/sync", syncRoutes);
  app.use("/api/v1/stream", streamRoutes);
  app.use("/api/v1", eventsRoutes);

  app.use(notFound);
  app.use(errorHandler);
  logger.debug("app montado");
  return app;
}
