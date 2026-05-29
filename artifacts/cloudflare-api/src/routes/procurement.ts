/**
 * Phase 2C-1 — Authenticated procurement routes (Cloudflare Worker).
 *
 * Ported from artifacts/api-server/src/routes/procurement.ts.
 * All routes require a valid Firebase ID token (requireInternalAuth).
 *
 * Routes implemented:
 *   GET  /api/procurement/supplier-links/:requestId
 *   POST /api/procurement/supplier-links
 *   POST /api/procurement/supplier-links/:linkId/deactivate
 *   POST /api/procurement/supplier-responses/:requestId/forward
 *
 * NOT yet ported (Phase 2C-2):
 *   POST /api/procurement/workflow/:requestId/advance
 *   POST /api/procurement/workflow/:requestId/approve-quotation
 */

import { Hono } from "hono";
import { z } from "zod";
import { firestoreTimestampSchema, TERMINAL_STAGES } from "@workspace/procurement";
import {
  generateDocId,
  SERVER_TIMESTAMP,
  makeTimestamp,
  firestoreQueryWhere,
  firestoreGetDoc,
  firestoreBatchWrite,
} from "../lib/firebase";
import { requireInternalAuth } from "../lib/auth";
import type { Env, Variables } from "../lib/types";

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply auth to every route in this router
router.use("*", requireInternalAuth);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_EXPIRY_DAYS = 7;

const ADMIN_ROLES = [
  "super_admin",
  "ceo",
  "evp",
  "planning",
  "finance",
  "procurement",
] as const;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSupplierLinkBodySchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  supplierNameHint: z.string().nullable().optional(),
  expiresAt: firestoreTimestampSchema.nullable().optional(),
});

const forwardResponsesBodySchema = z.object({
  responseIds: z
    .array(z.string().min(1))
    .min(1, "At least one response must be selected."),
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

// Flat schema — mode resolved at runtime:
//   Mode A (legacy manual quotation): quotationId + quotation required
//   Mode B (supplier response):       selectedSupplierResponseId required
const approveQuotationBodySchema = z.object({
  selectedSupplierResponseId: z.string().min(1).optional(),
  quotationId:                z.string().min(1).optional(),
  quotation:                  z.record(z.unknown()).optional(),
});

// ─── Workflow action config ───────────────────────────────────────────────────

const WORKFLOW_ACTIONS: Record<
  string,
  {
    requiredRoles: readonly string[];
    requiredStatus: string | string[];
    toStatus: string;
    eventType: string;
  }
> = {
  planning_approve:    { requiredRoles: ["planning", "super_admin"],    requiredStatus: "planning_review",            toStatus: "finance_review",             eventType: "planning_approved" },
  planning_reject:     { requiredRoles: ["planning", "super_admin"],    requiredStatus: "planning_review",            toStatus: "planning_rejected",           eventType: "planning_rejected" },
  finance_approve:     { requiredRoles: ["finance",  "super_admin"],    requiredStatus: "finance_review",             toStatus: "evp_review",                 eventType: "finance_approved" },
  finance_reject:      { requiredRoles: ["finance",  "super_admin"],    requiredStatus: "finance_review",             toStatus: "finance_rejected",            eventType: "finance_rejected" },
  evp_approve:         { requiredRoles: ["evp",      "super_admin"],    requiredStatus: "evp_review",                 toStatus: "ceo_review",                 eventType: "evp_approved" },
  evp_reject:          { requiredRoles: ["evp",      "super_admin"],    requiredStatus: "evp_review",                 toStatus: "evp_rejected",               eventType: "evp_rejected" },
  ceo_approve:         { requiredRoles: ["ceo",      "super_admin"],    requiredStatus: "ceo_review",                 toStatus: "approved",                   eventType: "ceo_approved" },
  ceo_reject:          { requiredRoles: ["ceo",      "super_admin"],    requiredStatus: "ceo_review",                 toStatus: "ceo_rejected",               eventType: "ceo_rejected" },
  procurement_advance: { requiredRoles: ["procurement", "super_admin"], requiredStatus: "quotation_selected",         toStatus: "planning_review",            eventType: "advanced_to_planning" },
  send_quotations_to_requester: {
    requiredRoles:  ["procurement", "super_admin"],
    requiredStatus: ["draft", "pending_procurement", "awaiting_quotations", "quotations_received"],
    toStatus:       "pending_requester_selection",
    eventType:      "sent_to_requester",
  },
  sa_advance_to_awaiting_quotations: { requiredRoles: ["super_admin"], requiredStatus: "pending_procurement",        toStatus: "awaiting_quotations",        eventType: "sa_override_advanced" },
  sa_advance_to_quotations_received: { requiredRoles: ["super_admin"], requiredStatus: "awaiting_quotations",        toStatus: "quotations_received",        eventType: "sa_override_advanced" },
  sa_advance_to_pending_selection:   { requiredRoles: ["super_admin"], requiredStatus: "quotations_received",        toStatus: "pending_requester_selection", eventType: "sa_override_advanced" },
  sa_advance_to_quotation_selected:  { requiredRoles: ["super_admin"], requiredStatus: "pending_requester_selection",toStatus: "quotation_selected",         eventType: "sa_override_advanced" },
};

// ─── POST /supplier-links ─────────────────────────────────────────────────────
// Create a supplier link for a given procurement request.
// Only super_admin and procurement roles may call this.

router.post("/supplier-links", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;

    if (user.role !== "super_admin" && user.role !== "procurement") {
      return c.json(
        {
          ok: false,
          error: "Only super_admin or procurement roles may create supplier links.",
          code: "forbidden",
        },
        403,
      );
    }

    let body: z.infer<typeof createSupplierLinkBodySchema>;
    try {
      const raw = await c.req.json();
      const parsed = createSupplierLinkBodySchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { ok: false, error: parsed.error.message, code: "invalid_payload" },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const { requestId, supplierNameHint, expiresAt: rawExpiresAt } = body;

    // Verify the request exists and is not terminal
    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );
    if (requestData === null) {
      return c.json(
        {
          ok: false,
          error: `Procurement request '${requestId}' not found.`,
          code: "request_not_found",
        },
        404,
      );
    }

    if (
      (TERMINAL_STAGES as readonly string[]).includes(
        requestData["stage"] as string,
      )
    ) {
      return c.json(
        {
          ok: false,
          error:
            "Cannot create a supplier link for a closed or terminated request.",
          code: "request_terminated",
        },
        409,
      );
    }

    // Compute expiry
    const expirySeconds = rawExpiresAt
      ? rawExpiresAt.seconds
      : Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60;
    const expiryNanoseconds = rawExpiresAt?.nanoseconds ?? 0;
    const expiresAt = makeTimestamp(expirySeconds, expiryNanoseconds);

    // Generate a cryptographically random 64-char hex token (same as randomBytes(32).toString("hex"))
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const linkId = generateDocId();
    const eventId = generateDocId();

    await firestoreBatchWrite(projectId, accessToken, [
      {
        type: "set",
        collection: "supplier_links",
        id: linkId,
        data: {
          id: linkId,
          requestId,
          token,
          supplierNameHint: supplierNameHint ?? null,
          createdByUid: user.uid,
          createdAt: SERVER_TIMESTAMP,
          expiresAt,
          isActive: true,
          submittedAt: null,
          responseId: null,
        },
      },
      {
        type: "set",
        collection: "workflow_events",
        id: eventId,
        data: {
          id: eventId,
          requestId,
          requestCreatorUid: (requestData["createdByUid"] as string | null) ?? null,
          actorUid: user.uid,
          actorName: user.displayName,
          actorRole: user.role,
          eventType: "supplier_link_generated",
          fromStatus: (requestData["status"] as string | null) ?? null,
          toStatus: null,
          comment: supplierNameHint
            ? `Supplier link created (hint: ${supplierNameHint})`
            : "Supplier link created",
          attachments: [],
          createdAt: SERVER_TIMESTAMP,
          metadata: { supplierLinkId: linkId, token },
        },
      },
    ]);

    console.log(`supplier_link created: requestId=${requestId} linkId=${linkId}`);

    return c.json(
      {
        ok: true,
        data: {
          id: linkId,
          token,
          requestId,
          supplierNameHint: supplierNameHint ?? null,
          publicFormUrl: `${c.env.PUBLIC_BASE_URL}/supplier/${token}`,
          expiresAt: { seconds: expirySeconds, nanoseconds: expiryNanoseconds },
        },
      },
      201,
    );
  } catch (err) {
    console.error("supplier-links create failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred. Please try again.", code: "server_error" },
      500,
    );
  }
});

// ─── GET /supplier-links/:requestId ──────────────────────────────────────────
// List all supplier links (with embedded responses) for a procurement request.
// Allowed: any admin-role user, or the original request creator.

router.get("/supplier-links/:requestId", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    const requestId = c.req.param("requestId");

    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );
    if (requestData === null) {
      return c.json(
        { ok: false, error: "Request not found.", code: "not_found" },
        404,
      );
    }

    const isAdminRole = (ADMIN_ROLES as readonly string[]).includes(user.role);
    const isCreator = requestData["createdByUid"] === user.uid;

    if (!isAdminRole && !isCreator) {
      return c.json(
        { ok: false, error: "Access denied.", code: "forbidden" },
        403,
      );
    }

    // Fetch all supplier links for this request (no limit)
    const linkDocs = await firestoreQueryWhere(
      projectId,
      accessToken,
      "supplier_links",
      "requestId",
      requestId,
    );

    // Sort descending by createdAt.seconds (mirrors Express server sort)
    linkDocs.sort((a, b) => {
      const aTs =
        (a.data["createdAt"] as { seconds: number } | null)?.seconds ?? 0;
      const bTs =
        (b.data["createdAt"] as { seconds: number } | null)?.seconds ?? 0;
      return bTs - aTs;
    });

    // Embed supplier response for each link that has one (parallel fetches)
    const links = await Promise.all(
      linkDocs.map(async (linkDoc) => {
        const link: Record<string, unknown> = { id: linkDoc.id, ...linkDoc.data };

        if (link["responseId"]) {
          try {
            const responseData = await firestoreGetDoc(
              projectId,
              accessToken,
              `supplier_responses/${link["responseId"] as string}`,
            );
            link["response"] = responseData
              ? { id: link["responseId"], ...responseData }
              : null;
          } catch {
            link["response"] = null;
          }
        } else {
          link["response"] = null;
        }

        return link;
      }),
    );

    return c.json({ ok: true, data: { links } });
  } catch (err) {
    console.error("supplier-links list failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── POST /supplier-links/:linkId/deactivate ─────────────────────────────────
// Mark a supplier link as inactive. Only super_admin and procurement may do this.

router.post("/supplier-links/:linkId/deactivate", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    const linkId = c.req.param("linkId");

    if (user.role !== "super_admin" && user.role !== "procurement") {
      return c.json(
        {
          ok: false,
          error: "Only super_admin or procurement may deactivate supplier links.",
          code: "forbidden",
        },
        403,
      );
    }

    const linkData = await firestoreGetDoc(
      projectId,
      accessToken,
      `supplier_links/${linkId}`,
    );
    if (linkData === null) {
      return c.json(
        { ok: false, error: "Supplier link not found.", code: "not_found" },
        404,
      );
    }

    await firestoreBatchWrite(projectId, accessToken, [
      {
        type: "update",
        collection: "supplier_links",
        id: linkId,
        data: { isActive: false },
      },
    ]);

    console.log(`supplier_link deactivated: linkId=${linkId}`);

    return c.json({ ok: true, data: { deactivated: true } });
  } catch (err) {
    console.error("supplier-link deactivate failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── POST /supplier-responses/:requestId/forward ─────────────────────────────
// Mark selected supplier_response docs as reviewStatus="forwarded",
// advance request to pending_requester_selection, and record a workflow event.
// Only procurement and super_admin may call this.

router.post("/supplier-responses/:requestId/forward", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    const requestId = c.req.param("requestId");

    if (user.role !== "super_admin" && user.role !== "procurement") {
      return c.json(
        {
          ok: false,
          error: "Only procurement or super_admin may forward supplier responses.",
          code: "forbidden",
        },
        403,
      );
    }

    let body: z.infer<typeof forwardResponsesBodySchema>;
    try {
      const raw = await c.req.json();
      const parsed = forwardResponsesBodySchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { ok: false, error: parsed.error.message, code: "invalid_payload" },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const { responseIds } = body;

    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );
    if (requestData === null) {
      return c.json(
        { ok: false, error: "Request not found.", code: "not_found" },
        404,
      );
    }

    const currentStatus = requestData["status"] as string | undefined;
    const VALID_STATUSES = [
      "draft",
      "pending_procurement",
      "awaiting_quotations",
      "quotations_received",
    ];
    if (!VALID_STATUSES.includes(currentStatus ?? "")) {
      return c.json(
        {
          ok: false,
          error: `Cannot forward responses from status '${currentStatus ?? "unknown"}'. Expected one of: ${VALID_STATUSES.join(", ")}.`,
          code: "invalid_status",
        },
        409,
      );
    }

    const eventId = generateDocId();

    // Batch: update N supplier_response docs + update request + set event
    await firestoreBatchWrite(projectId, accessToken, [
      // Mark each response as forwarded
      ...responseIds.map((responseId) => ({
        type: "update" as const,
        collection: "supplier_responses",
        id: responseId,
        data: {
          reviewStatus: "forwarded",
          reviewedBy: user.uid,
          reviewedAt: SERVER_TIMESTAMP,
        },
      })),
      // Advance request status
      {
        type: "update" as const,
        collection: "procurement_requests",
        id: requestId,
        data: {
          status: "pending_requester_selection",
          forwardedResponseIds: responseIds,
          updatedAt: SERVER_TIMESTAMP,
        },
      },
      // Record workflow event
      {
        type: "set" as const,
        collection: "workflow_events",
        id: eventId,
        data: {
          id: eventId,
          requestId,
          requestCreatorUid:
            (requestData["createdByUid"] as string | null) ?? null,
          actorUid: user.uid,
          actorName: user.displayName,
          actorRole: user.role,
          eventType: "quotations_forwarded",
          fromStatus: currentStatus ?? null,
          toStatus: "pending_requester_selection",
          comment: `${responseIds.length} supplier response(s) forwarded to requester.`,
          attachments: [],
          createdAt: SERVER_TIMESTAMP,
          metadata: { forwardedResponseIds: responseIds },
        },
      },
    ]);

    console.log(
      `supplier_responses forwarded: requestId=${requestId} count=${responseIds.length} actorUid=${user.uid}`,
    );

    return c.json({
      ok: true,
      data: {
        requestId,
        forwardedCount: responseIds.length,
        toStatus: "pending_requester_selection",
      },
    });
  } catch (err) {
    console.error("supplier-responses forward failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── POST /workflow/:requestId/advance ───────────────────────────────────────
// Role-specific workflow stage transition.
// Each role may only perform its own action; super_admin may perform any.

router.post("/workflow/:requestId/advance", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    const requestId = c.req.param("requestId");

    let body: { action: string; comment?: string | null };
    try {
      const raw = await c.req.json();
      const parsed = workflowAdvanceBodySchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { ok: false, error: parsed.error.message, code: "invalid_payload" },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const { action, comment } = body;
    const cfg = WORKFLOW_ACTIONS[action];

    if (!cfg) {
      return c.json(
        { ok: false, error: `Unknown workflow action: '${action}'.`, code: "invalid_payload" },
        400,
      );
    }

    if (!cfg.requiredRoles.includes(user.role)) {
      return c.json(
        {
          ok: false,
          error: `Role '${user.role}' is not permitted to perform action '${action}'.`,
          code: "forbidden",
        },
        403,
      );
    }

    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );
    if (requestData === null) {
      return c.json(
        { ok: false, error: "Request not found.", code: "not_found" },
        404,
      );
    }

    const currentStatus = requestData["status"] as string | undefined;
    const validStatuses = Array.isArray(cfg.requiredStatus)
      ? cfg.requiredStatus
      : [cfg.requiredStatus];

    if (!validStatuses.includes(currentStatus ?? "")) {
      return c.json(
        {
          ok: false,
          error: `Action '${action}' requires status in [${validStatuses.join(", ")}] but current status is '${currentStatus ?? "unknown"}'.`,
          code: "invalid_status",
        },
        409,
      );
    }

    const eventId = generateDocId();

    await firestoreBatchWrite(projectId, accessToken, [
      {
        type: "update",
        collection: "procurement_requests",
        id: requestId,
        data: {
          status: cfg.toStatus,
          updatedAt: SERVER_TIMESTAMP,
        },
      },
      {
        type: "set",
        collection: "workflow_events",
        id: eventId,
        data: {
          id: eventId,
          requestId,
          requestCreatorUid: (requestData["createdByUid"] as string | null) ?? null,
          actorUid: user.uid,
          actorName: user.displayName,
          actorRole: user.role,
          eventType: cfg.eventType,
          fromStatus: currentStatus ?? null,
          toStatus: cfg.toStatus,
          comment: comment ?? null,
          attachments: [],
          createdAt: SERVER_TIMESTAMP,
          metadata: null,
        },
      },
    ]);

    console.log(
      `workflow advanced: requestId=${requestId} action=${action} ${currentStatus}→${cfg.toStatus} actor=${user.uid}`,
    );

    return c.json({
      ok: true,
      data: { requestId, fromStatus: currentStatus, toStatus: cfg.toStatus },
    });
  } catch (err) {
    console.error("workflow advance failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

// ─── POST /workflow/:requestId/approve-quotation ──────────────────────────────
// Called by the original request creator (or super_admin) to confirm their
// quotation selection and atomically advance status to quotation_selected.
//
// Mode A (legacy manual):   quotationId + quotation in body
// Mode B (supplier response): selectedSupplierResponseId in body

router.post("/workflow/:requestId/approve-quotation", async (c) => {
  try {
    const user = c.get("internalUser");
    const accessToken = c.get("accessToken");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    const requestId = c.req.param("requestId");

    let body: {
      selectedSupplierResponseId?: string;
      quotationId?: string;
      quotation?: Record<string, unknown>;
    };
    try {
      const raw = await c.req.json();
      const parsed = approveQuotationBodySchema.safeParse(raw);
      if (!parsed.success) {
        return c.json(
          { ok: false, error: parsed.error.message, code: "invalid_payload" },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json(
        { ok: false, error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const { quotationId, quotation, selectedSupplierResponseId } = body;
    const mode = selectedSupplierResponseId
      ? "supplier_response"
      : quotationId && quotation
        ? "legacy_quotation"
        : null;

    console.log(
      `[approve-quotation] requestId=${requestId} mode=${mode ?? "null"} selectedSupplierResponseId=${selectedSupplierResponseId ?? "null"}`,
    );

    if (!mode) {
      return c.json(
        {
          ok: false,
          error:
            "Provide either selectedSupplierResponseId (supplier quotation) or quotationId + quotation (manual quotation).",
          code: "invalid_payload",
        },
        400,
      );
    }

    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );
    if (requestData === null) {
      return c.json(
        { ok: false, error: "Request not found.", code: "not_found" },
        404,
      );
    }

    const currentStatus = requestData["status"] as string | undefined;

    if (currentStatus !== "pending_requester_selection") {
      return c.json(
        {
          ok: false,
          error: `Quotation approval requires status 'pending_requester_selection' but current status is '${currentStatus ?? "unknown"}'.`,
          code: "invalid_status",
        },
        409,
      );
    }

    const isCreator = requestData["createdByUid"] === user.uid;
    const isSuperAdmin = user.role === "super_admin";

    if (!isCreator && !isSuperAdmin) {
      return c.json(
        {
          ok: false,
          error: "Only the original requester or a super_admin may approve a quotation.",
          code: "forbidden",
        },
        403,
      );
    }

    const eventId = generateDocId();

    if (mode === "supplier_response") {
      // Mode B — fetch and validate the supplier response server-side
      const responseData = await firestoreGetDoc(
        projectId,
        accessToken,
        `supplier_responses/${selectedSupplierResponseId!}`,
      );
      if (responseData === null) {
        return c.json(
          { ok: false, error: "Supplier response not found.", code: "not_found" },
          404,
        );
      }
      if (responseData["requestId"] !== requestId) {
        return c.json(
          { ok: false, error: "Supplier response does not belong to this request.", code: "forbidden" },
          403,
        );
      }
      if (responseData["reviewStatus"] !== "forwarded") {
        return c.json(
          {
            ok: false,
            error: "Supplier response has not been forwarded to the requester.",
            code: "invalid_status",
          },
          409,
        );
      }

      const qa = responseData["quotationAttachment"] ?? null;
      const companyName = String(
        responseData["companyName"] ?? selectedSupplierResponseId,
      );

      // Build a serialisable snapshot (timestamps already { seconds, nanoseconds }
      // from firestoreGetDoc → fromFirestoreFields — stored as Firestore mapValue)
      const snapshotData = {
        ...responseData,
        id: selectedSupplierResponseId,
        reviewedAt: null,
      };

      await firestoreBatchWrite(projectId, accessToken, [
        {
          type: "update",
          collection: "procurement_requests",
          id: requestId,
          data: {
            selectedSupplierResponseId: selectedSupplierResponseId!,
            approvedSupplierResponse: snapshotData,
            approvedAttachment: qa ?? null,
            status: "quotation_selected",
            updatedAt: SERVER_TIMESTAMP,
          },
        },
        {
          type: "set",
          collection: "workflow_events",
          id: eventId,
          data: {
            id: eventId,
            requestId,
            requestCreatorUid: (requestData["createdByUid"] as string | null) ?? null,
            actorUid: user.uid,
            actorName: user.displayName,
            actorRole: user.role,
            eventType: "requester_selected_supplier_quotation",
            fromStatus: currentStatus ?? null,
            toStatus: "quotation_selected",
            comment:
              isSuperAdmin && !isCreator
                ? `SA override: selected quotation from ${companyName}`
                : `Selected quotation from ${companyName}`,
            attachments: [],
            createdAt: SERVER_TIMESTAMP,
            metadata: { selectedSupplierResponseId: selectedSupplierResponseId! },
          },
        },
      ]);

      console.log(
        `approve-quotation (mode B): requestId=${requestId} responseId=${selectedSupplierResponseId} actor=${user.uid}`,
      );
    } else {
      // Mode A — legacy manual quotation
      await firestoreBatchWrite(projectId, accessToken, [
        {
          type: "update",
          collection: "procurement_requests",
          id: requestId,
          data: {
            selectedQuotationAttachmentId: quotationId!,
            approvedAttachment: quotation!,
            status: "quotation_selected",
            updatedAt: SERVER_TIMESTAMP,
          },
        },
        {
          type: "set",
          collection: "workflow_events",
          id: eventId,
          data: {
            id: eventId,
            requestId,
            requestCreatorUid: (requestData["createdByUid"] as string | null) ?? null,
            actorUid: user.uid,
            actorName: user.displayName,
            actorRole: user.role,
            eventType: "quotation_selected",
            fromStatus: currentStatus ?? null,
            toStatus: "quotation_selected",
            comment:
              isSuperAdmin && !isCreator ? "Super Admin override selection" : null,
            attachments: [],
            createdAt: SERVER_TIMESTAMP,
            metadata: null,
          },
        },
      ]);

      console.log(
        `approve-quotation (mode A): requestId=${requestId} quotationId=${quotationId} actor=${user.uid}`,
      );
    }

    return c.json({
      ok: true,
      data: { requestId, toStatus: "quotation_selected" },
    });
  } catch (err) {
    console.error("approve-quotation failed:", err);
    return c.json(
      { ok: false, error: "An internal error occurred.", code: "server_error" },
      500,
    );
  }
});

export default router;
