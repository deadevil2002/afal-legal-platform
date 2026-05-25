import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestoreTimestampSchema, TERMINAL_STAGES } from "@workspace/procurement";
import { getAdminDb } from "../lib/firebase-admin";
import { requireInternalAuth } from "../lib/auth";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSupplierLinkBodySchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  supplierNameHint: z.string().nullable().optional(),
  expiresAt: firestoreTimestampSchema.nullable().optional(),
});

const workflowAdvanceBodySchema = z.object({
  action: z.enum([
    "planning_approve", "planning_reject",
    "finance_approve",  "finance_reject",
    "evp_approve",      "evp_reject",
    "ceo_approve",      "ceo_reject",
    "procurement_advance",
    "send_quotations_to_requester",
    "sa_advance_to_awaiting_quotations",
    "sa_advance_to_quotations_received",
    "sa_advance_to_pending_selection",
    "sa_advance_to_quotation_selected",
  ]),
  comment: z.string().nullable().optional(),
});

const approveQuotationBodySchema = z.object({
  quotationId: z.string().min(1),
  quotation: z.record(z.unknown()),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_EXPIRY_DAYS = 7;

const ADMIN_ROLES = ["super_admin", "ceo", "evp", "planning", "finance", "procurement"] as const;

const WORKFLOW_ACTIONS: Record<
  string,
  { requiredRoles: readonly string[]; requiredStatus: string | string[]; toStatus: string; eventType: string }
> = {
  planning_approve:    { requiredRoles: ["planning", "super_admin"],    requiredStatus: "planning_review",     toStatus: "finance_review",  eventType: "planning_approved" },
  planning_reject:     { requiredRoles: ["planning", "super_admin"],    requiredStatus: "planning_review",     toStatus: "planning_rejected", eventType: "planning_rejected" },
  finance_approve:     { requiredRoles: ["finance",  "super_admin"],    requiredStatus: "finance_review",      toStatus: "evp_review",      eventType: "finance_approved" },
  finance_reject:      { requiredRoles: ["finance",  "super_admin"],    requiredStatus: "finance_review",      toStatus: "finance_rejected", eventType: "finance_rejected" },
  evp_approve:         { requiredRoles: ["evp",      "super_admin"],    requiredStatus: "evp_review",          toStatus: "ceo_review",      eventType: "evp_approved" },
  evp_reject:          { requiredRoles: ["evp",      "super_admin"],    requiredStatus: "evp_review",          toStatus: "evp_rejected",    eventType: "evp_rejected" },
  ceo_approve:         { requiredRoles: ["ceo",      "super_admin"],    requiredStatus: "ceo_review",          toStatus: "approved",        eventType: "ceo_approved" },
  ceo_reject:          { requiredRoles: ["ceo",      "super_admin"],    requiredStatus: "ceo_review",          toStatus: "ceo_rejected",    eventType: "ceo_rejected" },
  procurement_advance:       { requiredRoles: ["procurement", "super_admin"], requiredStatus: "quotation_selected", toStatus: "planning_review", eventType: "advanced_to_planning" },
  // Procurement sends uploaded quotations to the requester for selection.
  // Valid from any of the three pre-selection procurement stages.
  send_quotations_to_requester: {
    requiredRoles:   ["procurement", "super_admin"],
    requiredStatus:  ["pending_procurement", "awaiting_quotations", "quotations_received"],
    toStatus:        "pending_requester_selection",
    eventType:       "sent_to_requester",
  },
  sa_advance_to_awaiting_quotations:    { requiredRoles: ["super_admin"], requiredStatus: "pending_procurement",        toStatus: "awaiting_quotations",        eventType: "sa_override_advanced" },
  sa_advance_to_quotations_received:    { requiredRoles: ["super_admin"], requiredStatus: "awaiting_quotations",         toStatus: "quotations_received",         eventType: "sa_override_advanced" },
  sa_advance_to_pending_selection:      { requiredRoles: ["super_admin"], requiredStatus: "quotations_received",         toStatus: "pending_requester_selection", eventType: "sa_override_advanced" },
  sa_advance_to_quotation_selected:     { requiredRoles: ["super_admin"], requiredStatus: "pending_requester_selection", toStatus: "quotation_selected",          eventType: "sa_override_advanced" },
};

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

// ── POST /api/procurement/supplier-links ──────────────────────────────────────

router.post("/supplier-links", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!;

    if (user.role !== "super_admin" && user.role !== "procurement") {
      errorJsonResponse(res, "Only super_admin or procurement roles may create supplier links.", 403, "forbidden");
      return;
    }

    const parsed = createSupplierLinkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ validationError: parsed.error.flatten() }, "supplier-links body invalid");
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const { requestId, supplierNameHint, expiresAt: rawExpiresAt } = parsed.data;
    const db = getAdminDb();

    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(res, `Procurement request '${requestId}' not found.`, 404, "request_not_found");
      return;
    }

    const requestData = requestSnap.data()!;

    if ((TERMINAL_STAGES as readonly string[]).includes(requestData["stage"] as string)) {
      errorJsonResponse(res, "Cannot create a supplier link for a closed or terminated request.", 409, "request_terminated");
      return;
    }

    const expiresAt: FirebaseFirestore.Timestamp = rawExpiresAt
      ? new Timestamp(rawExpiresAt.seconds, rawExpiresAt.nanoseconds)
      : Timestamp.fromDate(new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

    const token = randomBytes(32).toString("hex");

    const linkRef   = db.collection("supplier_links").doc();
    const eventRef  = db.collection("workflow_events").doc();
    const linkId    = linkRef.id;

    const batch = db.batch();
    batch.set(linkRef, {
      id: linkId,
      requestId,
      token,
      supplierNameHint: supplierNameHint ?? null,
      createdByUid: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      isActive: true,
      submittedAt: null,
      responseId: null,
    });
    batch.set(eventRef, {
      id: eventRef.id,
      requestId,
      requestCreatorUid: requestData["createdByUid"] ?? null,
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      eventType: "supplier_link_generated",
      fromStatus: requestData["status"] ?? null,
      toStatus: null,
      comment: supplierNameHint ? `Supplier link created (hint: ${supplierNameHint})` : "Supplier link created",
      attachments: [],
      createdAt: FieldValue.serverTimestamp(),
      metadata: { supplierLinkId: linkId, token },
    });
    await batch.commit();

    req.log.info({ requestId, linkId }, "supplier_links document created");

    safeJsonResponse(res, {
      id: linkId,
      token,
      requestId,
      supplierNameHint: supplierNameHint ?? null,
      publicFormUrl: `/supplier/${token}`,
      expiresAt: { seconds: expiresAt.seconds, nanoseconds: expiresAt.nanoseconds },
    }, 201);
  } catch (err) {
    req.log.error({ err }, "supplier-links write failed");
    errorJsonResponse(res, "An internal error occurred. Please try again.", 500, "server_error");
  }
});

// ── GET /api/procurement/supplier-links/:requestId ────────────────────────────
// Returns all supplier links + embedded supplier responses for a request.
// Allowed: any authenticated user who is an admin OR the request creator.

router.get("/supplier-links/:requestId", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!;
    const requestId = String(req.params.requestId);
    const db = getAdminDb();

    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(res, "Request not found.", 404, "not_found");
      return;
    }

    const requestData = requestSnap.data()!;
    const isAdminRole = (ADMIN_ROLES as readonly string[]).includes(user.role);
    const isCreator   = requestData["createdByUid"] === user.uid;

    if (!isAdminRole && !isCreator) {
      errorJsonResponse(res, "Access denied.", 403, "forbidden");
      return;
    }

    const linksSnap = await db
      .collection("supplier_links")
      .where("requestId", "==", requestId)
      .orderBy("createdAt", "desc")
      .get();

    const links = await Promise.all(
      linksSnap.docs.map(async (linkDoc) => {
        const link = { id: linkDoc.id, ...linkDoc.data() } as Record<string, unknown>;

        const expiresAtTs = link.expiresAt as { seconds: number; nanoseconds: number } | null;
        const submittedAtTs = link.submittedAt as { seconds: number; nanoseconds: number } | null;
        const createdAtTs = link.createdAt as { seconds: number; nanoseconds: number } | null;

        // Serialize timestamps so they're JSON-safe
        link.expiresAt   = expiresAtTs   ? { seconds: expiresAtTs.seconds,   nanoseconds: expiresAtTs.nanoseconds }   : null;
        link.submittedAt = submittedAtTs ? { seconds: submittedAtTs.seconds,  nanoseconds: submittedAtTs.nanoseconds } : null;
        link.createdAt   = createdAtTs   ? { seconds: createdAtTs.seconds,    nanoseconds: createdAtTs.nanoseconds }   : null;

        if (link.responseId) {
          const responseSnap = await db
            .collection("supplier_responses")
            .doc(link.responseId as string)
            .get();
          if (responseSnap.exists) {
            const rd = responseSnap.data()!;
            // Serialize timestamps in response
            const rsa = rd["submittedAt"] as { seconds: number; nanoseconds: number } | null;
            const rra = rd["reviewedAt"]  as { seconds: number; nanoseconds: number } | null;
            rd["submittedAt"] = rsa ? { seconds: rsa.seconds, nanoseconds: rsa.nanoseconds } : null;
            rd["reviewedAt"]  = rra ? { seconds: rra.seconds, nanoseconds: rra.nanoseconds } : null;
            link.response = { id: responseSnap.id, ...rd };
          } else {
            link.response = null;
          }
        } else {
          link.response = null;
        }

        return link;
      })
    );

    safeJsonResponse(res, { links });
  } catch (err) {
    req.log.error({ err }, "supplier-links list failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

// ── POST /api/procurement/workflow/:requestId/advance ─────────────────────────
// Role-specific workflow stage transition. Each role may only perform its own action.
// super_admin may perform any action regardless of their own assigned stage.

router.post("/workflow/:requestId/advance", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!;
    const requestId = String(req.params.requestId);

    const parsed = workflowAdvanceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const { action, comment } = parsed.data;
    const cfg = WORKFLOW_ACTIONS[action];

    if (!cfg.requiredRoles.includes(user.role)) {
      errorJsonResponse(
        res,
        `Role '${user.role}' is not permitted to perform action '${action}'.`,
        403,
        "forbidden"
      );
      return;
    }

    const db = getAdminDb();
    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(res, "Request not found.", 404, "not_found");
      return;
    }

    const requestData   = requestSnap.data()!;
    const currentStatus = requestData["status"] as string | undefined;

    const validStatuses = Array.isArray(cfg.requiredStatus) ? cfg.requiredStatus : [cfg.requiredStatus];
    if (!validStatuses.includes(currentStatus ?? "")) {
      errorJsonResponse(
        res,
        `Action '${action}' requires status in [${validStatuses.join(", ")}] but current status is '${currentStatus ?? "unknown"}'.`,
        409,
        "invalid_status"
      );
      return;
    }

    const batch      = db.batch();
    const requestRef = db.collection("procurement_requests").doc(requestId);
    const eventRef   = db.collection("workflow_events").doc();

    batch.update(requestRef, {
      status: cfg.toStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(eventRef, {
      id: eventRef.id,
      requestId,
      requestCreatorUid: requestData["createdByUid"] ?? null,
      actorUid:   user.uid,
      actorName:  user.displayName,
      actorRole:  user.role,
      eventType:  cfg.eventType,
      fromStatus: currentStatus,
      toStatus:   cfg.toStatus,
      comment:    comment ?? null,
      attachments: [],
      createdAt: FieldValue.serverTimestamp(),
      metadata: null,
    });

    await batch.commit();

    req.log.info({ requestId, action, fromStatus: currentStatus, toStatus: cfg.toStatus }, "workflow advanced");
    safeJsonResponse(res, { requestId, fromStatus: currentStatus, toStatus: cfg.toStatus });
  } catch (err) {
    req.log.error({ err }, "workflow advance failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

// ── POST /api/procurement/workflow/:requestId/approve-quotation ───────────────
// Called by the original request creator (or super_admin) to confirm their
// quotation selection and atomically advance status to quotation_selected.
// The client passes the chosen quotation object; the server writes everything
// via Admin SDK so Firestore rules don't block the status transition.

router.post("/workflow/:requestId/approve-quotation", requireInternalAuth, async (req, res) => {
  try {
    const user      = req.internalUser!;
    const requestId = String(req.params.requestId);

    const parsed = approveQuotationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const { quotationId, quotation } = parsed.data;

    const db          = getAdminDb();
    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(res, "Request not found.", 404, "not_found");
      return;
    }

    const requestData   = requestSnap.data()!;
    const currentStatus = requestData["status"] as string | undefined;

    if (currentStatus !== "pending_requester_selection") {
      errorJsonResponse(
        res,
        `Quotation approval requires status 'pending_requester_selection' but current status is '${currentStatus ?? "unknown"}'.`,
        409,
        "invalid_status"
      );
      return;
    }

    const isCreator    = requestData["createdByUid"] === user.uid;
    const isSuperAdmin = user.role === "super_admin";

    if (!isCreator && !isSuperAdmin) {
      errorJsonResponse(
        res,
        "Only the original requester or a super_admin may approve a quotation.",
        403,
        "forbidden"
      );
      return;
    }

    const batch      = db.batch();
    const requestRef = db.collection("procurement_requests").doc(requestId);
    const eventRef   = db.collection("workflow_events").doc();

    batch.update(requestRef, {
      selectedQuotationAttachmentId: quotationId,
      approvedAttachment:            quotation,
      status:                        "quotation_selected",
      updatedAt:                     FieldValue.serverTimestamp(),
    });

    batch.set(eventRef, {
      id:                eventRef.id,
      requestId,
      requestCreatorUid: requestData["createdByUid"] ?? null,
      actorUid:          user.uid,
      actorName:         user.displayName,
      actorRole:         user.role,
      eventType:         "quotation_selected",
      fromStatus:        currentStatus,
      toStatus:          "quotation_selected",
      comment:           isSuperAdmin && !isCreator ? "Super Admin override selection" : null,
      attachments:       [],
      createdAt:         FieldValue.serverTimestamp(),
      metadata:          null,
    });

    await batch.commit();

    req.log.info({ requestId, quotationId, actorUid: user.uid }, "quotation approved");
    safeJsonResponse(res, { requestId, quotationId, toStatus: "quotation_selected" });
  } catch (err) {
    req.log.error({ err }, "approve-quotation failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

// ── POST /api/procurement/supplier-links/:linkId/deactivate ───────────────────

router.post("/supplier-links/:linkId/deactivate", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!;

    if (user.role !== "super_admin" && user.role !== "procurement") {
      errorJsonResponse(res, "Only super_admin or procurement may deactivate supplier links.", 403, "forbidden");
      return;
    }

    const linkId = String(req.params.linkId);
    const db = getAdminDb();

    const linkSnap = await db.collection("supplier_links").doc(linkId).get();
    if (!linkSnap.exists) {
      errorJsonResponse(res, "Supplier link not found.", 404, "not_found");
      return;
    }

    await db.collection("supplier_links").doc(linkId).update({ isActive: false });

    req.log.info({ linkId }, "supplier link deactivated");
    safeJsonResponse(res, { deactivated: true });
  } catch (err) {
    req.log.error({ err }, "supplier-link deactivate failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

export default router;
