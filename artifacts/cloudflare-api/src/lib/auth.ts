/**
 * Firebase ID token verification and Hono auth middleware for Cloudflare Workers.
 *
 * Firebase ID tokens are RS256-signed JWTs. Verification flow:
 *   1. Decode the token header to get `kid`
 *   2. Fetch Firebase's public JWK set (cached 1 h at the isolate level)
 *   3. Import the matching JWK with Web Crypto
 *   4. Verify the RS256 signature
 *   5. Validate claims: iss, aud, exp, iat
 *   6. Load the user profile from Firestore users/{uid}
 *   7. Reject deletion-pending accounts
 *   8. Set internalUser + accessToken on the Hono context for downstream handlers
 *
 * No Node.js APIs — runs natively in the V8 isolate.
 */

import type { MiddlewareHandler } from "hono";
import { getAccessToken, firestoreGetDoc } from "./firebase";
import type { Env, InternalUser, Variables } from "./types";

// ─── JWK types ────────────────────────────────────────────────────────────────

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

// ─── Module-level JWK cache ───────────────────────────────────────────────────
// Workers run in long-lived V8 isolates; module state persists across requests
// within the same isolate, making this a lightweight per-isolate cache.

const FIREBASE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWK_CACHE_TTL_S = 3600;

let jwkCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function fetchPublicKeys(): Promise<Jwk[]> {
  const now = Math.floor(Date.now() / 1000);
  if (jwkCache && now - jwkCache.fetchedAt < JWK_CACHE_TTL_S) {
    return jwkCache.keys;
  }
  const res = await fetch(FIREBASE_JWK_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public JWKs: ${res.status}`);
  }
  const data = (await res.json()) as { keys: Jwk[] };
  jwkCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64urlToStr(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(pad));
}

function b64urlToBytes(s: string): Uint8Array {
  const str = b64urlToStr(s);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

// ─── Token verification ───────────────────────────────────────────────────────

export interface DecodedToken {
  uid: string;
}

/**
 * Verify a Firebase ID token entirely with Web Crypto — no Admin SDK.
 * Throws on any failure (expired, bad signature, wrong project, etc.).
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
): Promise<DecodedToken> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT: expected 3 parts");

  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlToStr(headerB64)) as typeof header;
    payload = JSON.parse(b64urlToStr(payloadB64)) as typeof payload;
  } catch {
    throw new Error("Malformed JWT: could not decode header/payload");
  }

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported JWT algorithm: ${header.alg ?? "(none)"}`);
  }
  if (!header.kid) {
    throw new Error("JWT header missing kid");
  }

  // ── Claim validation ────────────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload["exp"] !== "number" || payload["exp"] < now) {
    throw new Error("Token expired");
  }
  if (typeof payload["iat"] !== "number" || payload["iat"] > now + 300) {
    throw new Error("Token issued in the future (clock skew exceeds 5 minutes)");
  }
  const expectedIss = `https://securetoken.google.com/${projectId}`;
  if (payload["iss"] !== expectedIss) {
    throw new Error(`Invalid issuer: expected ${expectedIss}`);
  }
  if (payload["aud"] !== projectId) {
    throw new Error(`Invalid audience: expected ${projectId}`);
  }
  if (!payload["sub"] || typeof payload["sub"] !== "string") {
    throw new Error("Token missing sub claim");
  }

  // ── Signature verification ──────────────────────────────────────────────────
  const keys = await fetchPublicKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`No public key found for kid: ${header.kid}`);
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToBytes(sigB64);

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signature,
    signingInput,
  );
  if (!valid) throw new Error("JWT signature verification failed");

  return { uid: payload["sub"] as string };
}

// ─── Hono middleware ──────────────────────────────────────────────────────────

type AppEnv = { Bindings: Env; Variables: Variables };

/**
 * requireInternalAuth — Hono middleware.
 *
 * On success: sets c.var.internalUser and c.var.accessToken for downstream handlers.
 * On failure: returns a JSON 401/403/404 and halts the chain.
 *
 * The access token is cached on the context so route handlers do not need to
 * re-acquire it — every request makes at most one Google OAuth2 token exchange.
 */
export const requireInternalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { ok: false, error: "Authorization header missing or malformed.", code: "unauthorized" },
      401,
    );
  }

  const idToken = authHeader.slice(7);

  // ── 1. Verify Firebase ID token ─────────────────────────────────────────────
  let uid: string;
  try {
    const decoded = await verifyFirebaseIdToken(idToken, c.env.FIREBASE_PROJECT_ID);
    uid = decoded.uid;
  } catch (err) {
    console.warn("requireInternalAuth: token verification failed:", String(err));
    return c.json(
      { ok: false, error: "Invalid or expired Firebase ID token.", code: "unauthorized" },
      401,
    );
  }

  // ── 2. Get Firestore access token (cached on context for this request) ──────
  let accessToken: string;
  try {
    accessToken = await getAccessToken(c.env);
  } catch (err) {
    console.error("requireInternalAuth: failed to get Firestore access token:", err);
    return c.json(
      { ok: false, error: "An internal error occurred while verifying your session.", code: "server_error" },
      500,
    );
  }

  // ── 3. Load user profile from Firestore ─────────────────────────────────────
  let profileData: Record<string, unknown>;
  try {
    const doc = await firestoreGetDoc(c.env.FIREBASE_PROJECT_ID, accessToken, `users/${uid}`);
    if (doc === null) {
      console.warn("requireInternalAuth: user profile not found:", uid);
      return c.json(
        { ok: false, error: "User profile not found.", code: "profile_not_found" },
        404,
      );
    }
    profileData = doc;
  } catch (err) {
    console.error("requireInternalAuth: Firestore user read failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred while verifying your session.", code: "server_error" },
      500,
    );
  }

  // ── 4. Reject deletion-pending accounts ─────────────────────────────────────
  if (profileData["deletionRequested"] === true) {
    return c.json(
      {
        ok: false,
        error: "Account is pending deletion and cannot perform this action.",
        code: "forbidden",
      },
      403,
    );
  }

  // ── 5. Attach user + token to context ───────────────────────────────────────
  const user: InternalUser = {
    uid,
    email: (profileData["email"] as string | undefined) ?? "",
    displayName: (profileData["displayName"] as string | undefined) ?? uid,
    role: (profileData["role"] as string | undefined) ?? "user",
    canSubmitRequests: profileData["canSubmitRequests"] === true,
  };

  c.set("internalUser", user);
  c.set("accessToken", accessToken);

  await next();
};
