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
  let decodedEmail: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    decodedEmail = decoded.email ?? "(no email in token)";

    req.log.info(
      {
        decodedUid: uid,
        decodedEmail,
        adminProjectId: process.env["FIREBASE_PROJECT_ID"] ?? "(FIREBASE_PROJECT_ID not set!)",
        firestorePath: `users/${uid}`,
      },
      "requireInternalAuth: token verified — reading Firestore users/{uid}",
    );
  } catch {
    errorJsonResponse(res, "Invalid or expired Firebase ID token.", 401, "unauthorized");
    return;
  }

  let profileData: { [key: string]: unknown };
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get();

    req.log.info(
      {
        decodedUid: uid,
        decodedEmail,
        firestorePath: `users/${uid}`,
        docExists: snap.exists,
      },
      "requireInternalAuth: Firestore users read completed",
    );

    if (!snap.exists) {
      req.log.warn(
        { uid, decodedEmail, firestorePath: `users/${uid}` },
        `requireInternalAuth: users/${uid} does NOT exist in Firestore (profile_not_found)`,
      );
      errorJsonResponse(
        res,
        `User profile not found in Firestore (users/${uid}). ` +
          `decodedUid=${uid} decodedEmail=${decodedEmail}`,
        404,
        "profile_not_found",
      );
      return;
    }

    profileData = snap.data() as { [key: string]: unknown };
  } catch (profileReadErr: unknown) {
    const e = profileReadErr as {
      code?: string | number;
      message?: string;
      details?: string;
      stack?: string;
    };

    req.log.error(
      {
        decodedUid: uid,
        decodedEmail,
        adminProjectId: process.env["FIREBASE_PROJECT_ID"] ?? "(not set)",
        firestorePath: `users/${uid}`,
        errCode: e?.code,
        errMessage: e?.message,
        errDetails: e?.details,
        errFull: (() => {
          try {
            return JSON.stringify(profileReadErr);
          } catch {
            return String(profileReadErr);
          }
        })(),
      },
      "requireInternalAuth: Firestore .get() THREW — Admin SDK cannot read Firestore. " +
        "Most likely cause: FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY do not belong to " +
        "the project set in FIREBASE_PROJECT_ID, OR the service account lacks Firestore access.",
    );

    const isPermissionDenied =
      e?.code === 7 ||
      String(e?.code).toUpperCase() === "PERMISSION_DENIED" ||
      String(e?.message).toLowerCase().includes("permission");

    const humanMsg =
      `Admin SDK Firestore read failed for users/${uid}. ` +
      `code=${e?.code ?? "?"} message=${e?.message ?? "?"} details=${e?.details ?? "?"}`;

    errorJsonResponse(
      res,
      humanMsg,
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
