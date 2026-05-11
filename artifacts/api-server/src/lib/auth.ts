import type { RequestHandler } from "express";
import { getAdminAuth, getAdminDb } from "./firebase-admin";
import { errorJsonResponse } from "./response";

// ─── requireInternalAuth ──────────────────────────────────────────────────────
// Express middleware that:
//   1. Reads Authorization: Bearer <Firebase ID token>
//   2. Verifies the token with Firebase Admin Auth
//   3. Loads the user profile from Firestore users/{uid}
//   4. Rejects missing, invalid, or deletion-pending accounts
//   5. Attaches req.internalUser for downstream route handlers
//
// Usage:  router.post("/route", requireInternalAuth, async (req, res) => { ... })

export const requireInternalAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    errorJsonResponse(res, "Authorization header missing or malformed.", 401, "unauthorized");
    return;
  }

  const idToken = authHeader.slice(7);

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    errorJsonResponse(res, "Invalid or expired Firebase ID token.", 401, "unauthorized");
    return;
  }

  let profileData: { [key: string]: unknown };
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get();
    if (!snap.exists) {
      errorJsonResponse(res, "User profile not found.", 401, "unauthorized");
      return;
    }
    profileData = snap.data() as { [key: string]: unknown };
  } catch {
    errorJsonResponse(res, "Failed to load user profile.", 500, "server_error");
    return;
  }

  // Reject accounts that are pending deletion
  if (profileData["deletionRequested"] === true) {
    errorJsonResponse(res, "Account is pending deletion and cannot perform this action.", 403, "forbidden");
    return;
  }

  req.internalUser = {
    uid,
    email: (profileData["email"] as string | undefined) ?? "",
    displayName: (profileData["displayName"] as string | undefined) ?? uid,
    role: (profileData["role"] as string | undefined) ?? "user",
    canSubmitRequests: profileData["canSubmitRequests"] === true,
  };

  next();
};
