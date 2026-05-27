# AF Procurement – Cloudflare Worker API

Parallel API server built on Cloudflare Workers + Hono.
This is Phase 1 of the Replit → Cloudflare migration.
Current Replit production (`suppliers.isaudi.ai`) is **not affected** until DNS is switched.

## Stack

- **Runtime**: Cloudflare Workers (V8 isolate, zero cold start)
- **Router**: [Hono](https://hono.dev/)
- **Firebase**: Firestore REST API + Web Crypto JWT (no Node.js Admin SDK needed)

## Routes implemented (Phase 1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check — no Firebase needed |
| GET | `/api/debug/firebase` | Confirms Firebase credentials + Firestore connectivity |

## Environment variables

### Non-secret (set in `wrangler.toml` `[vars]` or Cloudflare Dashboard)

| Variable | Example value |
|---|---|
| `ALLOWED_ORIGINS` | `https://admin.isaudi.ai,https://suppliers.isaudi.ai` |
| `PUBLIC_BASE_URL` | `https://suppliers.isaudi.ai` |

### Secrets (never in `wrangler.toml` — use `wrangler secret put`)

| Secret | Where to get it |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase Console → Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `FIREBASE_PRIVATE_KEY` | Same JSON file — the `private_key` field (full PEM block) |

## Local development

```bash
# Install dependencies
pnpm install

# Start local Worker (uses .dev.vars for secrets)
pnpm --filter @workspace/cloudflare-api run dev
```

Create `.dev.vars` in `artifacts/cloudflare-api/` (gitignored):

```ini
FIREBASE_PROJECT_ID=af-procurement-hub
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@af-procurement-hub.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n
```

> Wrangler reads `.dev.vars` locally instead of real secrets.
> The private key can use literal `\n` or actual newlines — both are handled.

Test locally:
```bash
curl http://localhost:8787/api/healthz
curl http://localhost:8787/api/debug/firebase
```

## Deploy to Cloudflare

### 1. Authenticate

```bash
wrangler login
```

### 2. Set secrets

```bash
wrangler secret put FIREBASE_PROJECT_ID
# → paste: af-procurement-hub

wrangler secret put FIREBASE_CLIENT_EMAIL
# → paste: firebase-adminsdk-xxxxx@...

wrangler secret put FIREBASE_PRIVATE_KEY
# → paste the full -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY----- block
```

### 3. Deploy

```bash
pnpm --filter @workspace/cloudflare-api run deploy
```

Or from the artifact directory:
```bash
cd artifacts/cloudflare-api
wrangler deploy
```

### 4. Verify

```bash
# Replace with your Worker's *.workers.dev URL shown after deploy
curl https://af-procurement-api.<your-subdomain>.workers.dev/api/healthz
# Expected: {"status":"ok","runtime":"cloudflare-worker","timestamp":"..."}

curl https://af-procurement-api.<your-subdomain>.workers.dev/api/debug/firebase
# Expected: {"projectId":"af-procurement-hub","connected":true}
```

## Custom domain (after Phase 2+)

Once all routes are migrated:
1. Cloudflare Dashboard → Workers → af-procurement-api → Triggers → Custom Domains
2. Add `suppliers.isaudi.ai`
3. Update DNS CNAME to point at the Worker (Cloudflare handles TLS automatically)

**Do not do this in Phase 1** — current Replit production remains live on that domain.

## Migration phases

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Health + Firebase connectivity proof | **This branch** |
| Phase 2 | Public supplier routes (`/api/public/*`) | Planned |
| Phase 3 | Admin routes (`/api/admin/*`) | Planned |
| Phase 4 | Procurement routes (`/api/procurement/*`) | Planned |
| DNS cut-over | Point `suppliers.isaudi.ai` at Worker | After Phase 4 |
