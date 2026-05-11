import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { logger } from "./logger";

// ─── Private key normalisation ────────────────────────────────────────────────
// Service account private keys stored as env vars often have their literal
// newlines replaced with the two-character sequence \n.  Convert them back.

export function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

// ─── Lazy singleton initialisation ───────────────────────────────────────────
// initAdminApp() is called the first time getAdminDb() is invoked so that
// missing env vars produce a clear runtime error only when the SDK is actually
// needed, not on server startup.

let _db: Firestore | null = null;
let _auth: Auth | null = null;

function initAdminApp(): void {
  if (getApps().length > 0) return; // already initialised

  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin SDK is not configured. " +
        "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY " +
        "environment variables before calling getAdminDb().",
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    }),
  });

  logger.info("Firebase Admin SDK initialized");
}

/**
 * Returns the Admin Firestore instance.
 * Initialises the Admin SDK on first call.
 * Throws if FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * are not set.
 */
export function getAdminDb(): Firestore {
  if (!_db) {
    initAdminApp();
    _db = getFirestore();
  }
  return _db;
}

/**
 * Returns the Admin Auth instance.
 * Initialises the Admin SDK on first call.
 * Throws if service account env vars are not set.
 */
export function getAdminAuth(): Auth {
  if (!_auth) {
    initAdminApp();
    _auth = getAuth();
  }
  return _auth;
}
