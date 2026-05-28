/**
 * Admin user management routes for the Cloudflare Worker.
 *
 * POST /api/admin/users/lookup-employee  — public, no auth
 * POST /api/admin/users                  — super_admin only, creates Firebase Auth user + Firestore docs
 * PATCH /api/admin/users/:uid            — super_admin only, updates profile + indexes + audit log
 *
 * Firebase Auth is managed via the Identity Toolkit Admin REST API (no Admin SDK).
 * Firestore is managed via the existing REST helpers in lib/firebase.ts.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getAccessToken,
  FIREBASE_AUTH_SCOPE,
  createFirebaseAuthUser,
  deleteFirebaseAuthUser,
  firestoreGetDoc,
  firestoreBatchWrite,
  generateDocId,
  SERVER_TIMESTAMP,
} from "../lib/firebase";
import { requireInternalAuth } from "../lib/auth";
import type { Env, Variables } from "../lib/types";

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const roleSchema = z.enum([
  "super_admin",
  "ceo",
  "evp",
  "operations",
  "planning",
  "finance",
  "procurement",
  "assistant_admin",
]);

const createRoleSchema = z.enum([
  "ceo",
  "evp",
  "operations",
  "planning",
  "finance",
  "procurement",
]);

const createUserBodySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Full name is required"),
  employeeNumber: z.string().min(1, "Employee number is required"),
  phone: z.string().min(1, "Phone number is required"),
  department: z.string().optional().default(""),
  role: createRoleSchema,
  canSubmitRequests: z.boolean().default(false),
});

const updateUserBodySchema = z.object({
  displayName: z.string().min(1).optional(),
  department: z.string().optional(),
  role: roleSchema.optional(),
  canSubmitRequests: z.boolean().optional(),
  phone: z.string().optional(),
  employeeNumber: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// ─── Phone normalisation ──────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("0")) return "966" + digits.slice(1);
  return "966" + digits;
}

// ─── POST /lookup-employee  (public) ─────────────────────────────────────────

router.post("/lookup-employee", async (c) => {
  try {
    let body: { employeeNumber?: unknown };
    try {
      body = (await c.req.json()) as { employeeNumber?: unknown };
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const employeeNumber =
      typeof body.employeeNumber === "string" ? body.employeeNumber.trim() : "";

    if (!employeeNumber) {
      return c.json(
        { ok: false, error: "employeeNumber is required.", code: "invalid_payload" },
        400,
      );
    }

    const projectId = c.env.FIREBASE_PROJECT_ID;
    const accessToken = await getAccessToken(c.env);

    const empData = await firestoreGetDoc(
      projectId,
      accessToken,
      `user_employee_index/${employeeNumber}`,
    );

    if (empData === null) {
      return c.json(
        { ok: false, error: "Employee number not found.", code: "not_found" },
        404,
      );
    }

    // Fast path — email stored directly on the index doc
    if (empData["email"] && typeof empData["email"] === "string") {
      return c.json({
        ok: true,
        data: { email: empData["email"].toLowerCase() },
      });
    }

    // Slow path — look up users/{uid}
    const uid = empData["uid"] as string | undefined;
    if (!uid) {
      return c.json(
        { ok: false, error: "Employee profile not found.", code: "not_found" },
        404,
      );
    }

    const userData = await firestoreGetDoc(projectId, accessToken, `users/${uid}`);
    if (!userData || typeof userData["email"] !== "string") {
      return c.json(
        { ok: false, error: "Employee email not on record.", code: "not_found" },
        404,
      );
    }

    return c.json({
      ok: true,
      data: { email: (userData["email"] as string).toLowerCase() },
    });
  } catch (err) {
    console.error("lookup-employee failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── POST /  (super_admin only — create user) ─────────────────────────────────

router.post("/", requireInternalAuth, async (c) => {
  try {
    const caller = c.get("internalUser");

    if (caller.role !== "super_admin") {
      return c.json(
        { ok: false, error: "Only Super Admin may create users.", code: "not_super_admin" },
        403,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const parsed = createUserBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.errors[0]?.message ?? "Invalid payload",
          code: "invalid_payload",
        },
        400,
      );
    }

    const { email, password, displayName, employeeNumber, phone, department, role, canSubmitRequests } =
      parsed.data;

    const normalizedPhone = normalizePhone(phone);
    const trimmedEmpNum = employeeNumber.trim();
    const lowerEmail = email.toLowerCase();

    const projectId = c.env.FIREBASE_PROJECT_ID;
    const accessToken = c.get("accessToken");

    // ── Check duplicates in parallel ────────────────────────────────────────
    const [phoneData, empData] = await Promise.all([
      normalizedPhone
        ? firestoreGetDoc(projectId, accessToken, `user_phone_index/${normalizedPhone}`)
        : Promise.resolve(null),
      trimmedEmpNum
        ? firestoreGetDoc(projectId, accessToken, `user_employee_index/${trimmedEmpNum}`)
        : Promise.resolve(null),
    ]);

    if (phoneData !== null) {
      return c.json(
        { ok: false, error: "This phone number is already registered.", code: "phone_taken" },
        409,
      );
    }
    if (empData !== null) {
      return c.json(
        { ok: false, error: "This employee number is already registered.", code: "employee_taken" },
        409,
      );
    }

    // ── Create Firebase Auth user ───────────────────────────────────────────
    // Requires a separate OAuth2 token with the firebase scope.
    const authAdminToken = await getAccessToken(c.env, FIREBASE_AUTH_SCOPE);

    let uid: string;
    try {
      const authUser = await createFirebaseAuthUser(projectId, authAdminToken, {
        email: lowerEmail,
        password,
        displayName,
      });
      uid = authUser.uid;
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      if (msg === "auth/email-already-exists") {
        return c.json(
          { ok: false, error: "This email address is already registered.", code: "email_taken" },
          409,
        );
      }
      console.error("adminUsers createUser auth error:", authErr);
      return c.json(
        { ok: false, error: "Failed to create auth user.", code: "server_error" },
        500,
      );
    }

    // ── Atomic Firestore batch ──────────────────────────────────────────────
    const auditId = generateDocId();

    try {
      await firestoreBatchWrite(projectId, accessToken, [
        {
          type: "set",
          collection: "users",
          id: uid,
          data: {
            uid,
            email: lowerEmail,
            displayName,
            employeeNumber: trimmedEmpNum,
            role,
            canSubmitRequests,
            department: department ?? "",
            phone: normalizedPhone,
            isActive: true,
            createdAt: SERVER_TIMESTAMP,
            updatedAt: SERVER_TIMESTAMP,
            language: "en",
          },
        },
        ...(normalizedPhone
          ? [
              {
                type: "set" as const,
                collection: "user_phone_index",
                id: normalizedPhone,
                data: {
                  uid,
                  phone: normalizedPhone,
                  createdAt: SERVER_TIMESTAMP,
                },
              },
            ]
          : []),
        ...(trimmedEmpNum
          ? [
              {
                type: "set" as const,
                collection: "user_employee_index",
                id: trimmedEmpNum,
                data: {
                  uid,
                  email: lowerEmail,
                  employeeNumber: trimmedEmpNum,
                  createdAt: SERVER_TIMESTAMP,
                },
              },
            ]
          : []),
        {
          type: "set",
          collection: "audit_logs",
          id: auditId,
          data: {
            type: "user_created",
            targetUid: uid,
            targetEmail: lowerEmail,
            createdByUid: caller.uid,
            createdByEmail: caller.email,
            role,
            createdAt: SERVER_TIMESTAMP,
          },
        },
      ]);
    } catch (firestoreErr: unknown) {
      console.error(
        "adminUsers create-user Firestore batch failed — rolling back Auth user:",
        firestoreErr,
      );
      await deleteFirebaseAuthUser(projectId, authAdminToken, uid);
      return c.json(
        {
          ok: false,
          error: "Failed to save user profile. Auth account rolled back.",
          code: "server_error",
        },
        500,
      );
    }

    console.log(`admin created user uid=${uid} email=${lowerEmail} role=${role}`);
    return c.json({ ok: true, data: { uid, email: lowerEmail, displayName, role } }, 201);
  } catch (err) {
    console.error("admin create-user failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── PATCH /:uid  (super_admin only — update user) ────────────────────────────

router.patch("/:uid", requireInternalAuth, async (c) => {
  try {
    const caller = c.get("internalUser");

    if (caller.role !== "super_admin") {
      return c.json(
        { ok: false, error: "Only Super Admin may update users.", code: "forbidden" },
        403,
      );
    }

    const targetUid = c.req.param("uid");
    if (!targetUid) {
      return c.json(
        { ok: false, error: "uid is required.", code: "invalid_payload" },
        400,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const parsed = updateUserBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.errors[0]?.message ?? "Invalid payload",
          code: "invalid_payload",
        },
        400,
      );
    }

    const updates = { ...parsed.data };

    if (Object.keys(updates).length === 0) {
      return c.json(
        { ok: false, error: "No fields provided to update.", code: "invalid_payload" },
        400,
      );
    }

    const projectId = c.env.FIREBASE_PROJECT_ID;
    const accessToken = c.get("accessToken");

    const currentData = await firestoreGetDoc(projectId, accessToken, `users/${targetUid}`);
    if (currentData === null) {
      return c.json(
        { ok: false, error: "User not found.", code: "not_found" },
        404,
      );
    }

    const currentEmail = (currentData["email"] as string | undefined) ?? "";
    const currentPhone = (currentData["phone"] as string | undefined) ?? "";
    const currentEmpNum = (currentData["employeeNumber"] as string | undefined) ?? "";
    const currentRole = currentData["role"] as string | undefined;
    const currentIsActive = currentData["isActive"] as boolean | undefined;

    const batchOps: Parameters<typeof firestoreBatchWrite>[2] = [];
    const auditFields: Record<string, unknown> = {};

    // ── Phone index sync ───────────────────────────────────────────────────
    if (updates.phone !== undefined) {
      const newPhone = normalizePhone(updates.phone);
      const oldPhone = currentPhone ? normalizePhone(currentPhone) : "";

      if (newPhone !== oldPhone) {
        if (newPhone) {
          const existing = await firestoreGetDoc(
            projectId,
            accessToken,
            `user_phone_index/${newPhone}`,
          );
          if (existing !== null && existing["uid"] !== targetUid) {
            return c.json(
              { ok: false, error: "This phone number is already registered.", code: "phone_taken" },
              409,
            );
          }
          batchOps.push({
            type: "set",
            collection: "user_phone_index",
            id: newPhone,
            data: { uid: targetUid, phone: newPhone, createdAt: SERVER_TIMESTAMP },
          });
        }
        if (oldPhone) {
          batchOps.push({
            type: "delete",
            collection: "user_phone_index",
            id: oldPhone,
          });
        }
        updates.phone = newPhone;
      } else {
        delete updates.phone;
      }
    }

    // ── Employee number index sync ─────────────────────────────────────────
    if (updates.employeeNumber !== undefined) {
      const newEmpNum = updates.employeeNumber.trim();
      const oldEmpNum = currentEmpNum.trim();

      if (newEmpNum !== oldEmpNum) {
        if (newEmpNum) {
          const existing = await firestoreGetDoc(
            projectId,
            accessToken,
            `user_employee_index/${newEmpNum}`,
          );
          if (existing !== null && existing["uid"] !== targetUid) {
            return c.json(
              {
                ok: false,
                error: "This employee number is already registered.",
                code: "employee_taken",
              },
              409,
            );
          }
          batchOps.push({
            type: "set",
            collection: "user_employee_index",
            id: newEmpNum,
            data: {
              uid: targetUid,
              email: currentEmail.toLowerCase(),
              employeeNumber: newEmpNum,
              createdAt: SERVER_TIMESTAMP,
            },
          });
        }
        if (oldEmpNum) {
          batchOps.push({
            type: "delete",
            collection: "user_employee_index",
            id: oldEmpNum,
          });
        }
        updates.employeeNumber = newEmpNum;
      } else {
        delete updates.employeeNumber;
      }
    }

    // ── Build user update payload ──────────────────────────────────────────
    const updatePayload: Record<string, unknown> = { updatedAt: SERVER_TIMESTAMP };
    if (updates.displayName !== undefined)       updatePayload.displayName = updates.displayName;
    if (updates.department !== undefined)        updatePayload.department = updates.department;
    if (updates.canSubmitRequests !== undefined) updatePayload.canSubmitRequests = updates.canSubmitRequests;
    if (updates.phone !== undefined)             updatePayload.phone = updates.phone;
    if (updates.employeeNumber !== undefined)    updatePayload.employeeNumber = updates.employeeNumber;
    if (updates.isActive !== undefined)          updatePayload.isActive = updates.isActive;

    if (updates.role !== undefined) {
      updatePayload.role = updates.role;
      auditFields.oldRole = currentRole;
      auditFields.newRole = updates.role;
    }
    if (updates.isActive !== undefined) {
      auditFields.isActive = updates.isActive;
      auditFields.previousIsActive = currentIsActive;
    }

    batchOps.push({
      type: "update",
      collection: "users",
      id: targetUid,
      data: updatePayload,
    });

    // ── Audit log for significant changes ──────────────────────────────────
    if (Object.keys(auditFields).length > 0) {
      const auditId = generateDocId();
      batchOps.push({
        type: "set",
        collection: "audit_logs",
        id: auditId,
        data: {
          type: updates.role !== undefined ? "role_change" : "user_status_change",
          targetUid,
          targetEmail: currentEmail,
          changedByUid: caller.uid,
          changedByEmail: caller.email,
          ...auditFields,
          changedAt: SERVER_TIMESTAMP,
        },
      });
    }

    try {
      await firestoreBatchWrite(projectId, accessToken, batchOps);
    } catch (firestoreErr: unknown) {
      console.error("adminUsers update-user Firestore batch failed:", firestoreErr);
      return c.json(
        { ok: false, error: "Failed to update user profile.", code: "server_error" },
        500,
      );
    }

    const updatedFields = Object.keys(updates).filter(
      (k) => updates[k as keyof typeof updates] !== undefined,
    );
    console.log(`admin updated user uid=${targetUid} fields=${updatedFields.join(",")}`);
    return c.json({ ok: true, data: { uid: targetUid, updated: updatedFields } });
  } catch (err) {
    console.error("admin update-user failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

export default router;
