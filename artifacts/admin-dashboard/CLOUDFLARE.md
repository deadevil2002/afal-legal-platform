# Cloudflare Pages Deployment Guide

## Prerequisites

- Node 18+ and pnpm installed
- Wrangler CLI: `pnpm add -g wrangler`
- Cloudflare account with Pages access

## Build

```bash
pnpm --filter @workspace/admin-dashboard run build
# Output: artifacts/admin-dashboard/dist/public/
```

## Deploy to Cloudflare Pages

```bash
cd artifacts/admin-dashboard
wrangler pages deploy dist/public --project-name af-admin-dashboard
```

Or connect the GitHub repo in Cloudflare Dashboard:
- Build command: `pnpm --filter @workspace/admin-dashboard run build`
- Build output directory: `artifacts/admin-dashboard/dist/public`

## Environment Variables (Cloudflare Dashboard → Settings → Environment Variables)

| Variable                             | Value                            |
|--------------------------------------|----------------------------------|
| `VITE_FIREBASE_API_KEY`              | From Firebase Console            |
| `VITE_FIREBASE_AUTH_DOMAIN`          | `<project>.firebaseapp.com`      |
| `VITE_FIREBASE_PROJECT_ID`           | Your Firebase project ID         |
| `VITE_FIREBASE_STORAGE_BUCKET`       | `<project>.appspot.com`          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`  | From Firebase Console            |
| `VITE_FIREBASE_APP_ID`               | From Firebase Console            |
| `VITE_API_BASE_URL`                  | `https://suppliers.isaudi.ai`    |

## SPA Routing

Cloudflare Pages needs a `_redirects` file for client-side routing.
This is already included in `dist/public/_redirects` via the build config.

## Security Notes

- Firebase API key is safe to expose in the frontend (it identifies the project, not a secret).
- Firebase Security Rules are the security layer — they enforce `role === "super_admin"`.
- Service account credentials (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) stay on the api-server only.
- All write actions (future phases) go through https://suppliers.isaudi.ai with Firebase ID token verification.
