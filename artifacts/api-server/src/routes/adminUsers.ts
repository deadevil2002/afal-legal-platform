import { Router } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "../lib/firebase-admin";
import { requireInternalAuth } from "../lib/auth";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

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
type ValidRole = z.infer<typeof roleSchema>;

const createRoleSchema = z.enum([
  "ceo",
  "evp",
  "operations",
  "planning",
  "finance",
  "procurement",
]);

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

const router = Router();

/**
 * POST /api/admin/users/lookup-employee
 *
 * PUBLIC — no authentication required.
 */
router.post("/lookup-employee", async (req, res) => {
  try {
    const { employeeNumber } = req.body as { employeeNumber?: string };
    if (!employeeNumber || typeof employeeNumber !== "string" || !employeeNumber.trim()) {
      errorJsonResponse(res, "employeeNumber is required.", 400, "invalid_payload");
      return;
    }
    const trimmed = employeeNumber.trim();
    const db = getAdminDb();

    const empSnap = await db.collection("user_employee_index").doc(trimmed).get();
    if (!empSnap.exists) {
      errorJsonResponse(res, "Employee number not found.", 404, "not_found");
      return;
    }

    const empData = empSnap.data() as { uid: string; email?: string };

    if (empData.email) {
      safeJsonResponse(res, { email: empData.email.toLowerCase() }, 200);
      return;
    }

    const userSnap = await db.collection("users").doc(empData.uid).get();
    if (!userSnap.exists) {
      errorJsonResponse(res, "Employee profile not found.", 404, "not_found");
      return;
    }

    const userData = userSnap.data() as { email?: string };
    if (!userData.email) {
      errorJsonResponse(res, "Employee email not on record.", 404, "not_found");
      return;
    }

    safeJsonResponse(res, { email: userData.email.toLowerCase() }, 200);
  } catch (err) {
    req.log.error({ err }, "lookup-employee failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

/**
 * POST /api/admin/users
 *
 * Super Admin only. Creates a new Firebase Auth user and all Firestore docs.
 */
router.post("/", requireInternalAuth, async (req, res) => {
  try {
    const caller = req.internalUser!;

    if (caller.role !== "super_admin") {
      errorJsonResponse(res, "Only Super Admin may create users.", 403, "not_super_admin");
      return;
    }

    const parsed = createUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      errorJsonResponse(res, parsed.error.errors[0]?.message ?? "Invalid payload", 400, "invalid_payload");
      return;
    }

    const { email, password, displayName, employeeNumber, phone, department, role, canSubmitRequests } = parsed.data;

    const normalizedPhone = normalizePhone(phone);
    const trimmedEmpNum = employeeNumber.trim();
    const lowerEmail = email.toLowerCase();

    const db = getAdminDb();
    const adminAuth = getAdminAuth();

    const [phoneSnap, empSnap] = await Promise.all([
      normalizedPhone ? db.collection("user_phone_index").doc(normalizedPhone).get() : Promise.resolve(null),
      trimmedEmpNum ? db.collection("user_employee_index").doc(trimmedEmpNum).get() : Promise.resolve(null),
    ]);

    if (phoneSnap?.exists) {
      errorJsonResponse(res, "This phone number is already registered.", 409, "phone_taken");
      return;
    }

    if (empSnap?.exists) {
      errorJsonResponse(res, "This employee number is already registered.", 409, "employee_taken");
      return;
    }

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
      const err = authErr as { code?: string };
      if (err.code === "auth/email-already-exists") {
        errorJsonResponse(res, "This email address is already registered.", 409, "email_taken");
        return;
      }
      req.log.error({ err: authErr }, "adminUsers createUser auth error");
      errorJsonResponse(res, "Failed to create auth user.", 500, "server_error");
      return;
    }

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
        email: lowerEmail,
        employeeNumber: trimmedEmpNum,
        createdAt: now,
      });
    }

    // Audit log
    batch.set(db.collection("audit_logs").doc(), {
      type: "user_created",
      targetUid: uid,
      targetEmail: lowerEmail,
      createdByUid: caller.uid,
      createdByEmail: caller.email,
      role,
      createdAt: now,
    });

    try {
      await batch.commit();
    } catch (firestoreErr: unknown) {
      req.log.error({ err: firestoreErr }, "create-user Firestore batch failed — rolling back Auth user");
      try {
        await adminAuth.deleteUser(uid);
      } catch (delErr) {
        req.log.error({ err: delErr }, "Failed to delete orphaned Auth user after batch rollback");
      }
      errorJsonResponse(res, "Failed to save user profile. Auth account rolled back.", 500, "server_error");
      return;
    }

    req.log.info({ uid, email: lowerEmail, role }, "admin created new user");
    safeJsonResponse(res, { uid, email: lowerEmail, displayName, role }, 201);
  } catch (err) {
    req.log.error({ err }, "admin create-user failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

/**
 * PATCH /api/admin/users/:uid
 *
 * Super Admin only. Updates profile, syncs uniqueness indexes, writes audit log.
 */
router.patch("/:uid", requireInternalAuth, async (req, res) => {
  try {
    const caller = req.internalUser!;

    if (caller.role !== "super_admin") {
      errorJsonResponse(res, "Only Super Admin may update users.", 403, "forbidden");
      return;
    }

    const { uid } = req.params as { uid: string };
    if (!uid) {
      errorJsonResponse(res, "uid is required.", 400, "invalid_payload");
      return;
    }

    const parsed = updateUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      errorJsonResponse(res, parsed.error.errors[0]?.message ?? "Invalid payload", 400, "invalid_payload");
      return;
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      errorJsonResponse(res, "No fields provided to update.", 400, "invalid_payload");
      return;
    }

    const db = getAdminDb();

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      errorJsonResponse(res, "User not found.", 404, "not_found");
      return;
    }

    const current = userSnap.data() as {
      email: string;
      phone?: string;
      employeeNumber?: string;
      role?: ValidRole;
      isActive?: boolean;
      [key: string]: unknown;
    };

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    const auditFields: Record<string, unknown> = {};

    // ── Phone index sync ─────────────────────────────────────────────────────
    if (updates.phone !== undefined) {
      const newPhone = normalizePhone(updates.phone);
      const oldPhone = current.phone ? normalizePhone(current.phone) : "";

      if (newPhone !== oldPhone) {
        if (newPhone) {
          const existingSnap = await db.collection("user_phone_index").doc(newPhone).get();
          if (existingSnap.exists && (existingSnap.data() as { uid?: string })?.uid !== uid) {
            errorJsonResponse(res, "This phone number is already registered.", 409, "phone_taken");
            return;
          }
          batch.set(db.collection("user_phone_index").doc(newPhone), { uid, phone: newPhone, createdAt: now });
        }
        if (oldPhone) {
          batch.delete(db.collection("user_phone_index").doc(oldPhone));
        }
        updates.phone = newPhone;
      } else {
        delete updates.phone;
      }
    }

    // ── Employee number index sync ───────────────────────────────────────────
    if (updates.employeeNumber !== undefined) {
      const newEmpNum = updates.employeeNumber.trim();
      const oldEmpNum = (current.employeeNumber ?? "").trim();

      if (newEmpNum !== oldEmpNum) {
        if (newEmpNum) {
          const existingSnap = await db.collection("user_employee_index").doc(newEmpNum).get();
          if (existingSnap.exists && (existingSnap.data() as { uid?: string })?.uid !== uid) {
            errorJsonResponse(res, "This employee number is already registered.", 409, "employee_taken");
            return;
          }
          batch.set(db.collection("user_employee_index").doc(newEmpNum), {
            uid,
            email: current.email.toLowerCase(),
            employeeNumber: newEmpNum,
            createdAt: now,
          });
        }
        if (oldEmpNum) {
          batch.delete(db.collection("user_employee_index").doc(oldEmpNum));
        }
        updates.employeeNumber = newEmpNum;
      } else {
        delete updates.employeeNumber;
      }
    }

    // ── Build update payload ─────────────────────────────────────────────────
    const updatePayload: Record<string, unknown> = { updatedAt: now };
    if (updates.displayName !== undefined)      updatePayload.displayName = updates.displayName;
    if (updates.department !== undefined)       updatePayload.department = updates.department;
    if (updates.canSubmitRequests !== undefined) updatePayload.canSubmitRequests = updates.canSubmitRequests;
    if (updates.phone !== undefined)            updatePayload.phone = updates.phone;
    if (updates.employeeNumber !== undefined)   updatePayload.employeeNumber = updates.employeeNumber;
    if (updates.isActive !== undefined)         updatePayload.isActive = updates.isActive;

    if (updates.role !== undefined) {
      updatePayload.role = updates.role;
      auditFields.oldRole = current.role;
      auditFields.newRole = updates.role;
    }
    if (updates.isActive !== undefined) {
      auditFields.isActive = updates.isActive;
    }

    batch.update(userRef, updatePayload);

    // Write audit log for significant actions
    if (Object.keys(auditFields).length > 0) {
      batch.set(db.collection("audit_logs").doc(), {
        type: updates.role !== undefined ? "role_change" : "user_status_change",
        targetUid: uid,
        targetEmail: current.email,
        changedByUid: caller.uid,
        changedByEmail: caller.email,
        ...auditFields,
        changedAt: now,
      });
    }

    try {
      await batch.commit();
    } catch (firestoreErr: unknown) {
      req.log.error({ err: firestoreErr }, "update-user Firestore batch failed");
      errorJsonResponse(res, "Failed to update user profile.", 500, "server_error");
      return;
    }

    req.log.info({ uid, updates: Object.keys(updates) }, "admin updated user");
    safeJsonResponse(res, { uid, updated: Object.keys(updates) }, 200);
  } catch (err) {
    req.log.error({ err }, "admin update-user failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

export default router;
