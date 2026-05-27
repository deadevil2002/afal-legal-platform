/**
 * Firebase Admin access for Cloudflare Workers.
 *
 * Workers cannot run the Node.js Firebase Admin SDK.
 * Instead we:
 *   1. Build a signed JWT from the service account key using Web Crypto (RS256).
 *   2. Exchange the JWT for a short-lived Google OAuth2 access token.
 *   3. Call Firestore via its REST API using that access token.
 *
 * No Node.js APIs are used — this runs natively in the V8 isolate.
 */

export interface FirebaseEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function jsonB64url(obj: object): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Parse the PEM private key string from the Cloudflare secret.
 *
 * Replit (and many secret stores) encode newlines as literal \n.
 * We normalize both forms before stripping the PEM header/footer.
 */
function pemToBuffer(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

// ─── Access token ─────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

/**
 * Returns a short-lived Google OAuth2 access token for the given service account.
 * The token is valid for 1 hour; callers should cache per-request if needed
 * (Worker invocations are typically short-lived so per-request is fine).
 */
export async function getAccessToken(env: FirebaseEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: FIRESTORE_SCOPE,
  };

  const signingInput = `${jsonB64url(header)}.${jsonB64url(payload)}`;

  const keyBuf = pemToBuffer(env.FIREBASE_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const encoder = new TextEncoder();
  const signatureBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${b64urlEncode(signatureBuf)}`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${body}`);
  }

  const data = (await tokenRes.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google token response missing access_token");
  }
  return data.access_token;
}

// ─── Firestore REST helpers ───────────────────────────────────────────────────

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

/**
 * Fetches a single Firestore document by path.
 * path example: "settings/app"
 */
export async function firestoreGet(
  projectId: string,
  accessToken: string,
  docPath: string,
): Promise<unknown> {
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore GET "${docPath}" failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Lightweight connectivity check.
 * Attempts to read the `settings/app` document (known to exist in this project).
 * Returns { connected: true } on success, { connected: false, reason } on failure.
 * Never exposes credentials or raw Firestore content.
 */
export async function firestorePing(
  env: FirebaseEnv,
): Promise<{ connected: boolean; reason?: string }> {
  try {
    const token = await getAccessToken(env);
    await firestoreGet(env.FIREBASE_PROJECT_ID, token, "settings/app");
    return { connected: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { connected: false, reason };
  }
}
