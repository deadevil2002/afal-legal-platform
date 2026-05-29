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

// Flat schema — all fields optional; handler validates mode at runtime:
//   Mode A (legacy manual quotation): quotationId + quotation required, no selectedSupplierResponseId
//   Mode B (supplier response):       selectedSupplierResponseId required, quotationId/quotation absent
const approveQuotationBodySchema = z.object({
  selectedSupplierResponseId: z.string().min(1).optional(),
  quotationId:                z.string().min(1).optional(),
  quotation:                  z.record(z.unknown()).optional(),
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
    requiredStatus:  ["draft", "pending_procurement", "awaiting_quotations", "quotations_received"],
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
      publicFormUrl: `https://suppliers.isaudi.ai/supplier/${token}`,
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
      .get();

    const sortedDocs = linksSnap.docs.slice().sort((a, b) => {
      const aTs = (a.data()["createdAt"] as { seconds: number } | null)?.seconds ?? 0;
      const bTs = (b.data()["createdAt"] as { seconds: number } | null)?.seconds ?? 0;
      return bTs - aTs;
    });

    const links = await Promise.all(
      sortedDocs.map(async (linkDoc) => {
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
    const e = err as { message?: string; code?: string | number };
    req.log.error({ errCode: e?.code, errMessage: e?.message }, "supplier-links list failed");
    const isDev = process.env.NODE_ENV !== "production";
    errorJsonResponse(
      res,
      isDev ? `supplier-links list failed: ${e?.message ?? String(err)}` : "An internal error occurred.",
      500,
      "server_error"
    );
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

    const { quotationId, quotation, selectedSupplierResponseId } = parsed.data;
    const mode = selectedSupplierResponseId ? "supplier_response" : quotationId && quotation ? "legacy_quotation" : null;

    req.log.info({ body: req.body, mode, selectedSupplierResponseId, quotationId: quotationId ?? null }, "[approve-quotation] raw body + parsed mode");

    if (!mode) {
      errorJsonResponse(
        res,
        "Provide either selectedSupplierResponseId (supplier quotation) or quotationId + quotation (manual quotation).",
        400,
        "invalid_payload"
      );
      return;
    }

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

    if (mode === "supplier_response") {
      // Mode B — fetch and validate supplier response from Firestore (server-side, no client snapshot)
      const responseSnap = await db.collection("supplier_responses").doc(selectedSupplierResponseId!).get();
      if (!responseSnap.exists) {
        errorJsonResponse(res, "Supplier response not found.", 404, "not_found");
        return;
      }
      const responseData = responseSnap.data()!;
      if (responseData["requestId"] !== requestId) {
        errorJsonResponse(res, "Supplier response does not belong to this request.", 403, "forbidden");
        return;
      }
      if (responseData["reviewStatus"] !== "forwarded") {
        errorJsonResponse(res, "Supplier response has not been forwarded to the requester.", 409, "invalid_status");
        return;
      }

      const qa = responseData["quotationAttachment"] ?? null;
      const companyName = String(responseData["companyName"] ?? selectedSupplierResponseId);

      // Serialize Firestore timestamps for the snapshot
      const rsa = responseData["submittedAt"] as { seconds: number; nanoseconds: number } | null;
      const snapshotData = {
        ...responseData,
        id: selectedSupplierResponseId,
        submittedAt: rsa ? { seconds: rsa.seconds, nanoseconds: rsa.nanoseconds } : null,
        reviewedAt: null,
      };

      batch.update(requestRef, {
        selectedSupplierResponseId,
        approvedSupplierResponse:   snapshotData,
        approvedAttachment:         qa ?? null,
        status:                     "quotation_selected",
        updatedAt:                  FieldValue.serverTimestamp(),
      });
      batch.set(eventRef, {
        id:                eventRef.id,
        requestId,
        requestCreatorUid: requestData["createdByUid"] ?? null,
        actorUid:          user.uid,
        actorName:         user.displayName,
        actorRole:         user.role,
        eventType:         "requester_selected_supplier_quotation",
        fromStatus:        currentStatus,
        toStatus:          "quotation_selected",
        comment:           isSuperAdmin && !isCreator
          ? `SA override: selected quotation from ${companyName}`
          : `Selected quotation from ${companyName}`,
        attachments:       [],
        createdAt:         FieldValue.serverTimestamp(),
        metadata:          { selectedSupplierResponseId },
      });
    } else {
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
    }

    await batch.commit();

    req.log.info({ requestId, actorUid: user.uid }, "quotation/supplier-response approved");
    safeJsonResponse(res, { requestId, toStatus: "quotation_selected" });
  } catch (err) {
    req.log.error({ err }, "approve-quotation failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

// ── POST /api/procurement/supplier-responses/:requestId/forward ──────────────
// Marks selected supplier_response docs as reviewStatus = "forwarded",
// advances request status to pending_requester_selection, and records
// a workflow event. Separate from the legacy manual-quotation flow.

const forwardResponsesBodySchema = z.object({
  responseIds: z.array(z.string().min(1)).min(1, "At least one response must be selected."),
});

router.post("/supplier-responses/:requestId/forward", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!;

    if (user.role !== "super_admin" && user.role !== "procurement") {
      errorJsonResponse(res, "Only procurement or super_admin may forward supplier responses.", 403, "forbidden");
      return;
    }

    const requestId = String(req.params.requestId);

    const parsed = forwardResponsesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const { responseIds } = parsed.data;
    const db = getAdminDb();

    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(res, "Request not found.", 404, "not_found");
      return;
    }

    const requestData = requestSnap.data()!;
    const currentStatus = requestData["status"] as string | undefined;

    const VALID_STATUSES = ["draft", "pending_procurement", "awaiting_quotations", "quotations_received"];
    if (!VALID_STATUSES.includes(currentStatus ?? "")) {
      errorJsonResponse(
        res,
        `Cannot forward responses from status '${currentStatus ?? "unknown"}'. Expected one of: ${VALID_STATUSES.join(", ")}.`,
        409,
        "invalid_status"
      );
      return;
    }

    const batch = db.batch();

    for (const responseId of responseIds) {
      batch.update(db.collection("supplier_responses").doc(responseId), {
        reviewStatus: "forwarded",
        reviewedBy: user.uid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
    }

    batch.update(db.collection("procurement_requests").doc(requestId), {
      status: "pending_requester_selection",
      forwardedResponseIds: responseIds,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const eventRef = db.collection("workflow_events").doc();
    batch.set(eventRef, {
      id: eventRef.id,
      requestId,
      requestCreatorUid: requestData["createdByUid"] ?? null,
      actorUid:   user.uid,
      actorName:  user.displayName,
      actorRole:  user.role,
      eventType:  "quotations_forwarded",
      fromStatus: currentStatus,
      toStatus:   "pending_requester_selection",
      comment:    `${responseIds.length} supplier response(s) forwarded to requester.`,
      attachments: [],
      createdAt:  FieldValue.serverTimestamp(),
      metadata:   { forwardedResponseIds: responseIds },
    });

    await batch.commit();

    req.log.info({ requestId, responseIds, actorUid: user.uid }, "supplier_responses forwarded");
    safeJsonResponse(res, {
      requestId,
      forwardedCount: responseIds.length,
      toStatus: "pending_requester_selection",
    });
  } catch (err) {
    req.log.error({ err }, "supplier-responses forward failed");
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
