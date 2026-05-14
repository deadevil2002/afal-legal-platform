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
      req.log.warn({ uid }, "requireInternalAuth: user profile not found in Firestore");
      errorJsonResponse(res, "User profile not found.", 404, "profile_not_found");
      return;
    }

    profileData = snap.data() as { [key: string]: unknown };
  } catch (profileReadErr: unknown) {
    const e = profileReadErr as { code?: string | number; message?: string };

    req.log.error(
      { uid, errCode: e?.code, errMessage: e?.message },
      "requireInternalAuth: Admin SDK Firestore read failed",
    );

    const isPermissionDenied =
      e?.code === 7 ||
      String(e?.code).toUpperCase() === "PERMISSION_DENIED" ||
      String(e?.message).toLowerCase().includes("permission");

    errorJsonResponse(
      res,
      "An internal error occurred while verifying your session.",
      500,
      isPermissionDenied ? "admin_sdk_permission_denied" : "admin_sdk_error",
    );
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
