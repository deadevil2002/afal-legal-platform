/**
 * Shared type definitions for the Cloudflare Worker.
 * Centralised here so lib/auth.ts, routes, and index.ts
 * can all import without circular dependencies.
 */

// ─── Worker environment bindings ─────────────────────────────────────────────

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_BASE_URL: string;
  /** Cloudinary cloud name — used by the supplier HTML page for unsigned uploads */
  CLOUDINARY_CLOUD_NAME: string;
  /** Cloudinary unsigned upload preset — used by the supplier HTML page */
  CLOUDINARY_UPLOAD_PRESET: string;
}

// ─── Authenticated user attached by requireInternalAuth ──────────────────────

export interface InternalUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  canSubmitRequests: boolean;
}

// ─── Hono per-request variables ──────────────────────────────────────────────
// Set by requireInternalAuth, read by route handlers.

export interface Variables {
  internalUser: InternalUser;
  accessToken: string;
}
