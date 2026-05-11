import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { firestoreTimestampSchema } from "@workspace/procurement";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

// ─── Request body schema ──────────────────────────────────────────────────────
// Used to validate the POST /procurement/supplier-links body.
// The token and all server-set fields (createdByUid, createdAt, isActive,
// submittedAt, responseId) are NOT accepted from the caller — they are
// computed or enforced server-side.

const createSupplierLinkBodySchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  supplierNameHint: z.string().nullable().optional(),
  expiresAt: firestoreTimestampSchema.nullable().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/procurement/supplier-links
 *
 * Creates a new supplier form link for a procurement request.
 *
 * TODO (Phase C): Enforce Firebase ID token auth — reject requests from
 *   callers whose decoded token does not have role "procurement" or
 *   "super_admin" in their Firestore user document.
 * TODO (Phase C): Write the supplier_links document to Firestore via
 *   getAdminDb() using the SupplierLink schema from @workspace/procurement.
 * TODO (Phase C): Append a workflow_events document (type: supplier_link_generated).
 */
router.post("/supplier-links", (req, res) => {
  const parsed = createSupplierLinkBodySchema.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ validationError: parsed.error.flatten() }, "supplier-links body invalid");
    return errorJsonResponse(res, parsed.error.message, 400);
  }

  const { requestId, supplierNameHint, expiresAt } = parsed.data;

  // Generate a cryptographically random 64-character hex token.
  // This becomes the unguessable public URL segment.
  const token = randomBytes(32).toString("hex");

  req.log.info({ requestId, token }, "supplier-link token generated (Phase B — not yet persisted)");

  // Phase B: return the computed token without writing to Firestore.
  // Remove _phase and _todo keys once Phase C write is implemented.
  return safeJsonResponse(
    res,
    {
      _phase: "B_FOUNDATION",
      _todo: "Auth enforcement and Firestore write will be added in Phase C.",
      token,
      requestId,
      supplierNameHint: supplierNameHint ?? null,
      expiresAt: expiresAt ?? null,
      publicFormUrl: `/supplier/${token}`, // placeholder — real URL in Phase C
    },
    202,
  );
});

export default router;
