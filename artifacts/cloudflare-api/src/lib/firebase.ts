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

// ─── JWT helpers ──────────────────────────────────────────────────────────────

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
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";

/**
 * Returns a short-lived Google OAuth2 access token for the given service account.
 * Valid for 1 hour — Workers are short-lived so per-request is fine.
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

// ─── Document ID generation ───────────────────────────────────────────────────

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Generate a random Firestore-style document ID (20 base62 chars). */
export function generateDocId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => ID_CHARS[b % ID_CHARS.length]!)
    .join("");
}

// ─── Server timestamp sentinel ────────────────────────────────────────────────

/**
 * Use this value in place of FieldValue.serverTimestamp().
 * firestoreBatchWrite detects it and generates the correct REST field transform.
 */
export const SERVER_TIMESTAMP = "__server_timestamp__" as const;
type ServerTimestampSentinel = typeof SERVER_TIMESTAMP;

// ─── Firestore REST value encoding ───────────────────────────────────────────

type RestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values: RestValue[] } }
  | { mapValue: { fields: Record<string, RestValue> } };

/** Convert a JS value to Firestore REST typed format. SERVER_TIMESTAMP → null (stripped). */
function toRestValue(val: unknown): RestValue | null {
  if (val === null || val === undefined) return { nullValue: null };
  if (val === SERVER_TIMESTAMP) return null;
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val)
      ? { integerValue: String(val) }
      : { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val
          .map((v) => toRestValue(v))
          .filter((v): v is RestValue => v !== null),
      },
    };
  }
  if (typeof val === "object") {
    const fields: Record<string, RestValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === SERVER_TIMESTAMP) continue;
      const converted = toRestValue(v);
      if (converted !== null) fields[k] = converted;
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Convert a plain JS object to a Firestore REST `fields` map.
 * Top-level SERVER_TIMESTAMP values are omitted — use updateTransforms instead.
 */
function toFirestoreFields(
  obj: Record<string, unknown>,
): Record<string, RestValue> {
  const fields: Record<string, RestValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === SERVER_TIMESTAMP) continue;
    const converted = toRestValue(v);
    if (converted !== null) fields[k] = converted;
  }
  return fields;
}

/**
 * Collect top-level keys whose value is SERVER_TIMESTAMP.
 * Used to build `updateTransforms` for server timestamp fields.
 */
function collectTimestampKeys(obj: Record<string, unknown>): string[] {
  return Object.entries(obj)
    .filter(([, v]) => v === SERVER_TIMESTAMP)
    .map(([k]) => k);
}

// ─── Firestore REST value decoding ───────────────────────────────────────────

function fromRestValue(val: Record<string, unknown>): unknown {
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val["booleanValue"];
  if ("integerValue" in val) return Number(val["integerValue"]);
  if ("doubleValue" in val) return val["doubleValue"];
  if ("stringValue" in val) return val["stringValue"];
  if ("timestampValue" in val) {
    const ts = val["timestampValue"] as string;
    const ms = new Date(ts).getTime();
    return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
  }
  if ("arrayValue" in val) {
    const arr = val["arrayValue"] as { values?: unknown[] };
    return (arr.values ?? []).map((v) =>
      fromRestValue(v as Record<string, unknown>),
    );
  }
  if ("mapValue" in val) {
    const map = val["mapValue"] as { fields?: Record<string, unknown> };
    return fromFirestoreFields(map.fields ?? {});
  }
  return null;
}

function fromFirestoreFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromRestValue(v as Record<string, unknown>);
  }
  return out;
}

// ─── Document name helper ─────────────────────────────────────────────────────

function docName(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface FirestoreDoc {
  id: string;
  docPath: string;
  data: Record<string, unknown>;
}

/**
 * Run a single-field equality query against a collection.
 * Returns parsed documents — never raw REST format.
 */
export async function firestoreQueryWhere(
  projectId: string,
  accessToken: string,
  collectionId: string,
  field: string,
  value: string,
  limitCount = 1,
): Promise<FirestoreDoc[]> {
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents:runQuery`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: { stringValue: value },
          },
        },
        limit: limitCount,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Firestore runQuery "${collectionId}" failed (${res.status}): ${body}`,
    );
  }

  type QueryRow = {
    document?: { name?: string; fields?: Record<string, unknown> };
    readTime?: string;
  };

  const rows = (await res.json()) as QueryRow[];

  return rows
    .filter((row) => row.document?.name)
    .map((row) => {
      const name = row.document!.name!;
      const id = name.split("/").pop()!;
      const data = fromFirestoreFields(row.document!.fields ?? {});
      return { id, docPath: `${collectionId}/${id}`, data };
    });
}

// ─── Get single document ──────────────────────────────────────────────────────

/**
 * Get a single Firestore document by collection/id path.
 * Returns null if the document does not exist.
 */
export async function firestoreGetDoc(
  projectId: string,
  accessToken: string,
  docPath: string,
): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Firestore GET "${docPath}" failed (${res.status}): ${body}`,
    );
  }
  const doc = (await res.json()) as { fields?: Record<string, unknown> };
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}

// ─── Batch write ──────────────────────────────────────────────────────────────

export type BatchOp =
  | {
      type: "set";
      collection: string;
      id: string;
      data: Record<string, unknown | ServerTimestampSentinel>;
    }
  | {
      type: "update";
      collection: string;
      id: string;
      data: Record<string, unknown | ServerTimestampSentinel>;
    };

/**
 * Execute an atomic batch write using the Firestore REST batchWrite endpoint.
 *
 * Any field value equal to SERVER_TIMESTAMP is automatically converted to a
 * `setToServerValue: "REQUEST_TIME"` field transform — matching the behavior
 * of FieldValue.serverTimestamp() in the Admin SDK.
 *
 * "set"    → creates or fully replaces the document (no updateMask)
 * "update" → patches only the listed fields (updateMask + currentDocument:exists)
 */
export async function firestoreBatchWrite(
  projectId: string,
  accessToken: string,
  ops: BatchOp[],
): Promise<void> {
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents:batchWrite`;

  const writes = ops.map((op) => {
    const name = docName(projectId, `${op.collection}/${op.id}`);
    const fields = toFirestoreFields(op.data);
    const tsPaths = collectTimestampKeys(op.data);

    const write: Record<string, unknown> = {
      update: { name, fields },
    };

    if (op.type === "update") {
      const allPaths = [
        ...Object.keys(op.data).filter((k) => op.data[k] !== SERVER_TIMESTAMP),
        ...tsPaths,
      ];
      write["updateMask"] = { fieldPaths: allPaths };
      write["currentDocument"] = { exists: true };
    }

    if (tsPaths.length > 0) {
      write["updateTransforms"] = tsPaths.map((fieldPath) => ({
        fieldPath,
        setToServerValue: "REQUEST_TIME",
      }));
    }

    return write;
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore batchWrite failed (${res.status}): ${body}`);
  }
}

// ─── Connectivity probe (used by /api/debug/firebase) ─────────────────────────

export async function firestorePing(
  env: FirebaseEnv,
): Promise<{ connected: boolean; reason?: string }> {
  try {
    const token = await getAccessToken(env);
    const doc = await firestoreGetDoc(
      env.FIREBASE_PROJECT_ID,
      token,
      "settings/app",
    );
    if (doc === null) {
      return { connected: false, reason: "settings/app document not found" };
    }
    return { connected: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { connected: false, reason };
  }
}
