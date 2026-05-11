import type { Response } from "express";

// ─── Typed success response ───────────────────────────────────────────────────

export function safeJsonResponse<T>(
  res: Response,
  data: T,
  status = 200,
): Response {
  return res.status(status).json({ ok: true, data });
}

// ─── Typed error response ─────────────────────────────────────────────────────

export function errorJsonResponse(
  res: Response,
  message: string,
  status = 400,
): Response {
  return res.status(status).json({ ok: false, error: message });
}
