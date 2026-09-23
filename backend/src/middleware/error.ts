import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { emitStructuredLog } from "./observability.js";

export function handleValidation(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Please check the highlighted fields.",
      details: errors.array().map((e) => ({ field: "path" in e ? e.path : "body", message: e.msg })),
    });
  }
  next();
}

export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  emitStructuredLog({
    level: "error",
    event: "unhandled_request_error",
    request_id: String(res.getHeader("X-Request-Id") || ""),
    method: req.method,
    path: req.path,
    error_name: err instanceof Error ? err.name : "UnknownError",
    error_message: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
  });
  const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
  if (
    /not found|Cannot move|Unknown project|Unknown category|Allowed files|Cluster needs|You can only/i.test(
      message
    )
  ) {
    const status = /not found/i.test(message) ? 404 : 400;
    return res.status(status).json({ error: message });
  }
  res.status(500).json({
    error: "The server could not complete that request. If this continues, contact the CivicForge administrator.",
  });
}
