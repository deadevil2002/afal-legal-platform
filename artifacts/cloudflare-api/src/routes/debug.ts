import { Hono } from "hono";
import { firestorePing } from "../lib/firebase";
import type { Env } from "../index";

const router = new Hono<{ Bindings: Env }>();

/**
 * GET /api/debug/firebase
 *
 * Safe connectivity probe — confirms the Worker can:
 *   1. Build and sign a Google JWT from the service account.
 *   2. Exchange it for an OAuth2 access token.
 *   3. Read at least one Firestore document.
 *
 * Returns ONLY:
 *   { projectId, connected, reason? }
 *
 * No credentials, no raw Firestore data, no internal details are exposed.
 */
router.get("/firebase", async (c) => {
  const projectId = c.env.FIREBASE_PROJECT_ID;

  if (!projectId || !c.env.FIREBASE_CLIENT_EMAIL || !c.env.FIREBASE_PRIVATE_KEY) {
    return c.json(
      {
        projectId: projectId ?? null,
        connected: false,
        reason: "Firebase env vars not configured on this Worker",
      },
      503,
    );
  }

  const result = await firestorePing({
    FIREBASE_PROJECT_ID: c.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: c.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: c.env.FIREBASE_PRIVATE_KEY,
  });

  return c.json(
    {
      projectId,
      ...result,
    },
    result.connected ? 200 : 502,
  );
});

export default router;
