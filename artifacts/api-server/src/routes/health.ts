import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// ─── /api/healthz — original minimal health check ────────────────────────────
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ─── /api/health — richer health check ───────────────────────────────────────
// Reports whether Firebase Admin credentials are present (not their values).
// Safe to expose publicly — no secrets are returned.
router.get("/health", (_req, res) => {
  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];

  res.json({
    ok: true,
    api: "AF Procurement Hub API",
    firebaseAdmin: {
      FIREBASE_PROJECT_ID: projectId ? "present" : "missing",
      FIREBASE_CLIENT_EMAIL: clientEmail ? "present" : "missing",
      FIREBASE_PRIVATE_KEY: privateKey ? "present" : "missing",
      allConfigured: !!(projectId && clientEmail && privateKey),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
