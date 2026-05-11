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
// code: machine-readable error identifier for clients (e.g. "link_expired").
// Omit code to return a generic error without a code field.

export function errorJsonResponse(
  res: Response,
  message: string,
  status = 400,
  code?: string,
): Response {
  const body: { ok: false; error: string; code?: string } = { ok: false, error: message };
  if (code !== undefined) body.code = code;
  return res.status(status).json(body);
}
