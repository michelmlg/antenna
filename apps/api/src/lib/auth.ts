import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

/** Se ADMIN_TOKEN estiver definido, exige "Bearer <token>" (senão LAN aberta). */
export function auth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) return next();
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${config.adminToken}`) {
    res.status(401).json({ error: "não autorizado", code: "UNAUTHORIZED" });
    return;
  }
  next();
}
