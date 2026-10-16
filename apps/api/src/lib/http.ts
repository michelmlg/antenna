import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") {
    super(message);
  }
}

/** Envolve handlers async e manda erros pro middleware de erro. */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(400).json({ error: resumo(r.error), code: "VALIDATION" });
      return;
    }
    req.body = r.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.query);
    if (!r.success) {
      res.status(400).json({ error: resumo(r.error), code: "VALIDATION" });
      return;
    }
    res.locals.query = r.data;
    next();
  };
}

function resumo(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "campo"}: ${i.message}`).join("; ").slice(0, 300);
}

export function notFound(req: Request, res: Response): void {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "não encontrado", code: "NOT_FOUND" });
    return;
  }
  res.status(404).send("não encontrado");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  logger.error({ err }, "unhandled");
  res.status(500).json({ error: "erro interno", code: "INTERNAL" });
}
