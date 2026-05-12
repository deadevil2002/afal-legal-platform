import { Router } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "../lib/firebase-admin";
import { requireInternalAuth } from "../lib/auth";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

const roleSchema = z.enum([
  "ceo",
  "evp",
  "operations",
  "planning",
  "finance",
  "procurement",
]);
type ValidRole = z.infer<typeof roleSchema>;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("0")) return "966" + digits.slice(1);
  return "966" + digits;
}

const createUserBodySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Full name is required"),
  employeeNumber: z.string().min(1, "Employee number is required"),
  phone: z.string().min(1, "Phone number is required"),
  department: z.string().optional().default(""),
  role: roleSchema,
  canSubmitRequests: z.boolean().default(false),
});

const router = Router();

/**
 * POST /api/admin/users
 *
 * Super Admin only. Creates a new Firebase Auth user and writes all
 * associated Firestore documents atomically via Admin SDK, bypassing
 * client-side Firestore rules entirely.
 *
 * Writes:
 *   users/{uid}                      — user profile
 *   user_phone_index/{phone}         — phone uniqueness index
 *   user_employee_index/{empNum}     — employee number uniqueness index
 */
router.post("/", requireInternalAuth, async (req, res) => {
  try {
    const caller = req.internalUser!;

    if (caller.role !== "super_admin") {
      errorJsonResponse(res, "Only Super Admin may create users.", 403, "forbidden");
      return;
    }

    const parsed = createUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ validationError: parsed.error.flatten() }, "create-user body invalid");
      errorJsonResponse(
        res,
        parsed.error.errors[0]?.message ?? "Invalid payload",
        400,
        "invalid_payload",
      );
      return;
    }

    const { email, password, displayName, employeeNumber, phone, department, role, canSubmitRequests } =
      parsed.data;

    const normalizedPhone = normalizePhone(phone);
    const trimmedEmpNum = employeeNumber.trim();
    const lowerEmail = email.toLowerCase();

    const db = getAdminDb();
    const adminAuth = getAdminAuth();

    // ── Uniqueness pre-checks ────────────────────────────────────────────────
    const [phoneSnap, empSnap] = await Promise.all([
      normalizedPhone
        ? db.collection("user_phone_index").doc(normalizedPhone).get()
        : Promise.resolve(null),
      trimmedEmpNum
        ? db.collection("user_employee_index").doc(trimmedEmpNum).get()
        : Promise.resolve(null),
    ]);

    if (phoneSnap?.exists) {
      errorJsonResponse(res, "This phone number is already registered.", 409, "phone_taken");
      return;
    }

    if (empSnap?.exists) {
      errorJsonResponse(
        res,
        "This employee number is already registered.",
        409,
        "employee_taken",
      );
      return;
    }

    // ── Create Firebase Auth user ────────────────────────────────────────────
    let uid: string;
    try {
      const authUser = await adminAuth.createUser({
        email: lowerEmail,
        password,
        displayName,
        emailVerified: false,
      });
      uid = authUser.uid;
    } catch (authErr: unknown) {
      const err = authErr as { code?: string; message?: string };
      if (err.code === "auth/email-already-exists") {
        errorJsonResponse(res, "This email address is already registered.", 409, "email_taken");
        return;
      }
      req.log.error({ err: authErr }, "adminUsers createUser auth error");
      errorJsonResponse(res, "Failed to create auth user.", 500, "server_error");
      return;
    }

    // ── Atomic Firestore batch ───────────────────────────────────────────────
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(db.collection("users").doc(uid), {
      uid,
      email: lowerEmail,
      displayName,
      employeeNumber: trimmedEmpNum,
      role,
      canSubmitRequests,
      department: department ?? "",
      phone: normalizedPhone,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      language: "en",
    });

    if (normalizedPhone) {
      batch.set(db.collection("user_phone_index").doc(normalizedPhone), {
        uid,
        phone: normalizedPhone,
        createdAt: now,
      });
    }

    if (trimmedEmpNum) {
      batch.set(db.collection("user_employee_index").doc(trimmedEmpNum), {
        uid,
        employeeNumber: trimmedEmpNum,
        createdAt: now,
      });
    }

    try {
      await batch.commit();
    } catch (firestoreErr: unknown) {
      req.log.error(
        { err: firestoreErr },
        "create-user Firestore batch failed — rolling back Auth user",
      );
      try {
        await adminAuth.deleteUser(uid);
      } catch (delErr) {
        req.log.error({ err: delErr }, "Failed to delete orphaned Auth user after batch rollback");
      }
      errorJsonResponse(
        res,
        "Failed to save user profile. Auth account rolled back.",
        500,
        "server_error",
      );
      return;
    }

    req.log.info({ uid, email: lowerEmail, role }, "admin created new user");
    safeJsonResponse(res, { uid, email: lowerEmail, displayName, role }, 201);
  } catch (err) {
    req.log.error({ err }, "admin create-user failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

export default router;
