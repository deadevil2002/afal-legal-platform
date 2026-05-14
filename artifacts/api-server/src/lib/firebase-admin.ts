import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { logger } from "./logger";

// ─── Private key normalisation ────────────────────────────────────────────────
// Service account private keys arrive in several broken forms depending on how
// the secret was stored:
//
//   Form A — literal \n sequences (most env-var tooling):
//     "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
//
//   Form B — actual newlines (properly stored):
//     "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
//     (identical after Form A → B conversion, no action needed)
//
//   Form C — Replit secret storage replaces newlines with spaces:
//     "-----BEGIN PRIVATE KEY----- MIIEvAIBADA... -----END PRIVATE KEY-----"
//     non-empty lines = 1, entire key on a single line with spaces.
//
// This function normalises all three forms into a valid RFC 7468 PEM block.

// Extract the inner PKCS#1 RSA key from a PKCS#8 DER buffer and return it
// as a "-----BEGIN RSA PRIVATE KEY-----" PEM string.
//
// Why: Node.js 24 / OpenSSL 3.6 rejects PKCS#8 *PEM* strings via
// crypto.createPrivateKey (error:1E08010C:DECODER routines::unsupported),
// but accepts the same key bytes in DER form or as PKCS#1 PEM.
// Extracting the inner RSA key and re-wrapping as PKCS#1 PEM is the
// cleanest workaround — both firebase-admin and google-auth-library accept it.
function extractPkcs1Pem(pkcs8B64: string): string | null {
  try {
    const der = Buffer.from(pkcs8B64, "base64");

    function readLen(
      buf: Buffer,
      pos: number,
    ): { len: number; adv: number } {
      const fb = buf[pos];
      if (fb < 0x80) return { len: fb, adv: 1 };
      const nb = fb & 0x7f;
      let len = 0;
      for (let i = 0; i < nb; i++) len = (len << 8) | buf[pos + 1 + i];
      return { len, adv: 1 + nb };
    }

    let p = 0;
    if (der[p++] !== 0x30) return null; // outer SEQUENCE
    const outer = readLen(der, p);
    p += outer.adv;
    if (der[p++] !== 0x02) return null; // version INTEGER
    const ver = readLen(der, p);
    p += ver.adv + ver.len;
    if (der[p++] !== 0x30) return null; // AlgorithmIdentifier SEQUENCE
    const alg = readLen(der, p);
    p += alg.adv + alg.len;
    if (der[p++] !== 0x04) return null; // OCTET STRING
    const oct = readLen(der, p);
    p += oct.adv;

    const innerB64 = der.slice(p, p + oct.len).toString("base64");
    const chunked = (innerB64.match(/.{1,64}/g) ?? [innerB64]).join("\n");
    return `-----BEGIN RSA PRIVATE KEY-----\n${chunked}\n-----END RSA PRIVATE KEY-----\n`;
  } catch {
    return null;
  }
}

export function normalizePrivateKey(key: string): string {
  // Step 1 — convert literal \n escape sequences to real newlines (Form A → B).
  let normalized = key.replace(/\\n/g, "\n");

  // Step 2 — detect Form C (Replit spaces-as-newlines): entire key is one line.
  const nonEmptyLines = normalized.split("\n").filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length <= 1) {
    const b64 = normalized
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const chunked = (b64.match(/.{1,64}/g) ?? [b64]).join("\n");
    normalized = `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----\n`;
  }

  // Step 3 — Node.js 24 / OpenSSL 3.6 rejects PKCS#8 PEM.
  // Convert to PKCS#1 RSA PEM (-----BEGIN RSA PRIVATE KEY-----) which is accepted.
  if (normalized.includes("-----BEGIN PRIVATE KEY-----")) {
    const b64Body = normalized
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const pkcs1 = extractPkcs1Pem(b64Body);
    if (pkcs1) return pkcs1;
    // If extraction fails, fall through and return the PKCS#8 PEM as-is
    // (allows future Node.js versions that fix the issue to work without code changes).
  }

  return normalized;
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
