import { Router } from "express";
import { getAdminDb, getAdminAuth } from "../lib/firebase-admin";
import { requireInternalAuth } from "../lib/auth";

// ─── Dev-only diagnostic routes ───────────────────────────────────────────────
// All routes in this file are registered ONLY when NODE_ENV !== "production".
// In production the router is exported empty — no routes match.
//
// Endpoints:
//   GET /api/admin-check  — verifies Firebase Admin SDK can initialise
//   GET /api/debug/me     — returns the decoded internalUser from a Bearer token

const router = Router();

const isDev = process.env["NODE_ENV"] !== "production";

if (isDev) {
  // ── GET /api/admin-check ────────────────────────────────────────────────────
  // Calls getAdminDb() and getAdminAuth() to confirm the Admin SDK initialises
  // successfully with the current env vars.
  //
  // Returns 200 + { ok: true }  when both singletons init without error.
  // Returns 503 + { ok: false, error: "<message>" } if credentials are missing
  // or invalid — no stack traces or secret values are included.
  //
  // Dev-only: not reachable in NODE_ENV=production.
  router.get("/admin-check", async (req, res) => {
    try {
      getAdminDb();
      getAdminAuth();
      req.log.info("admin-check: Firebase Admin SDK initialised successfully");
      res.json({
        ok: true,
        firestoreInitialized: true,
        authInitialized: true,
        note: "dev-only endpoint — not available in production",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown initialisation error";
      req.log.warn({ err }, "admin-check: Firebase Admin SDK failed to initialise");
      // Return the error message (safe — it is our own throw from firebase-admin.ts)
      // but never include stack traces or raw SDK internals.
      res.status(503).json({
        ok: false,
        error: message,
        note: "dev-only endpoint — not available in production",
      });
    }
  });

  // ── GET /api/debug/me ───────────────────────────────────────────────────────
  // Requires a valid Firebase ID token in the Authorization: Bearer header.
  // Returns the decoded internalUser so callers can verify the auth middleware
  // is reading the correct profile fields from Firestore.
  //
  // Never returns sensitive fields beyond those already on req.internalUser.
  // Dev-only: not reachable in NODE_ENV=production.
  router.get("/debug/me", requireInternalAuth, (req, res) => {
    const user = req.internalUser!; // guaranteed by requireInternalAuth
    res.json({
      ok: true,
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      canSubmitRequests: user.canSubmitRequests,
      note: "dev-only endpoint — not available in production",
    });
  });
}

export default router;
