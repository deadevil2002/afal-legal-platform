import { Router } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import {
  supplierFormInputSchema,
  attachmentRefSchema,
  calculateVat,
  calculatePriceIncludingVat,
  TERMINAL_STAGES,
} from "@workspace/procurement";
import { getAdminDb } from "../lib/firebase-admin";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

// ─── Phase C submission schema ────────────────────────────────────────────────
// Derived from SupplierFormInput (which is SupplierResponse minus server fields).
// Attachment fields remain optional until the file upload flow is implemented
// (Phase D). All other required fields are enforced.

const phaseCPublicSubmissionSchema = supplierFormInputSchema
  .omit({
    commercialRegistrationAttachment: true,
    accreditationAttachment: true,
    nationalAddressAttachment: true,
    ibanAttachment: true,
    extraAttachments: true,
  })
  .extend({
    // TODO (Phase D): Make these required once /api/public/upload/:token exists
    commercialRegistrationAttachment: attachmentRefSchema.optional(),
    accreditationAttachment: attachmentRefSchema.optional(),
    nationalAddressAttachment: attachmentRefSchema.optional(),
    ibanAttachment: attachmentRefSchema.optional(),
    extraAttachments: z.array(attachmentRefSchema).optional(),
  });

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/public/supplier-response/:token
 *
 * Public endpoint — no Firebase Auth required.
 * The :token identifies which supplier_links document this response belongs to.
 *
 * Writes (atomic batch):
 *   supplier_responses/{id}  — new supplier response
 *   supplier_links/{id}      — update: submittedAt, responseId, isActive=false
 *   workflow_events/{id}     — supplier_response_received event
 *
 * Error codes: invalid_payload | link_not_found | link_expired |
 *              link_already_used | request_not_found | server_error
 */
router.post("/supplier-response/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // ── Basic token format check ──────────────────────────────────────────────
    if (!token || token.length < 32) {
      errorJsonResponse(res, "Invalid or missing supplier link token.", 400, "invalid_payload");
      return;
    }

    const db = getAdminDb();

    // ── 1. Look up the supplier link by token ─────────────────────────────────
    const linkQuery = await db
      .collection("supplier_links")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (linkQuery.empty) {
      errorJsonResponse(res, "Supplier link not found.", 404, "link_not_found");
      return;
    }

    const linkDocRef = linkQuery.docs[0]!;
    const link = linkDocRef.data();
    const linkId = linkDocRef.id;

    // ── 2. Check isActive ─────────────────────────────────────────────────────
    if (link["isActive"] !== true) {
      errorJsonResponse(res, "This supplier link has been deactivated.", 410, "link_expired");
      return;
    }

    // ── 3. Check expiry ───────────────────────────────────────────────────────
    const expiresAtField = link["expiresAt"] as { seconds: number } | null | undefined;
    if (expiresAtField && Date.now() > expiresAtField.seconds * 1000) {
      errorJsonResponse(res, "This supplier link has expired.", 410, "link_expired");
      return;
    }

    // ── 4. One submission per link ────────────────────────────────────────────
    if (link["responseId"] != null || link["submittedAt"] != null) {
      errorJsonResponse(
        res,
        "A response has already been submitted for this link.",
        409,
        "link_already_used",
      );
      return;
    }

    // ── 5. Verify the parent procurement request ──────────────────────────────
    const requestId = link["requestId"] as string;
    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();

    if (!requestSnap.exists) {
      errorJsonResponse(
        res,
        "Associated procurement request not found.",
        404,
        "request_not_found",
      );
      return;
    }

    const requestData = requestSnap.data()!;

    if ((TERMINAL_STAGES as readonly string[]).includes(requestData["stage"] as string)) {
      errorJsonResponse(
        res,
        "The associated procurement request is closed and no longer accepting submissions.",
        410,
        "link_expired",
      );
      return;
    }

    // ── 6. Validate form body ─────────────────────────────────────────────────
    const parsed = phaseCPublicSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn(
        { token, validationError: parsed.error.flatten() },
        "public supplier-response body invalid",
      );
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const body = parsed.data;

    // ── 7. Compute VAT server-side ────────────────────────────────────────────
    // Never trust the client for financial calculations.
    const vatAmountSar = calculateVat(body.priceExcludingVatSar);
    const priceIncludingVatSar = calculatePriceIncludingVat(body.priceExcludingVatSar);

    // ── 8. Prepare Firestore refs ─────────────────────────────────────────────
    const responseRef = db.collection("supplier_responses").doc();
    const eventRef = db.collection("workflow_events").doc();
    const responseId = responseRef.id;

    const responseDoc = {
      id: responseId,
      linkId,
      requestId,
      submittedAt: FieldValue.serverTimestamp(),
      // Company identity
      companyName: body.companyName,
      commercialRegistrationNumber: body.commercialRegistrationNumber,
      commercialRegistrationAttachment: body.commercialRegistrationAttachment ?? null,
      accreditationNumber: body.accreditationNumber,
      accreditationAttachment: body.accreditationAttachment ?? null,
      zatcaNumber: body.zatcaNumber,
      // Contact
      phone: body.phone,
      email: body.email,
      contactPersonName: body.contactPersonName,
      // Address
      nationalAddressText: body.nationalAddressText,
      nationalAddressAttachment: body.nationalAddressAttachment ?? null,
      // Banking
      ibanText: body.ibanText,
      ibanAttachment: body.ibanAttachment ?? null,
      // Pricing — VAT computed server-side
      priceExcludingVatSar: body.priceExcludingVatSar,
      vatAmountSar,
      priceIncludingVatSar,
      paymentTerms: body.paymentTerms,
      // Optional
      notes: body.notes ?? null,
      extraAttachments: body.extraAttachments ?? [],
      // Review — set by Procurement after receiving
      reviewStatus: "pending",
      reviewedBy: null,
      reviewedAt: null,
    };

    const eventDoc = {
      id: eventRef.id,
      requestId,
      actorUid: null, // supplier has no Firebase account
      actorName: body.companyName,
      actorRole: "supplier",
      eventType: "supplier_response_received",
      fromStage: (requestData["stage"] as string | undefined) ?? null,
      toStage: null,
      comment: `Supplier response received from ${body.companyName} (${body.contactPersonName})`,
      attachments: [],
      createdAt: FieldValue.serverTimestamp(),
      metadata: { supplierLinkId: linkId, responseId },
    };

    const linkUpdate = {
      submittedAt: FieldValue.serverTimestamp(),
      responseId,
      isActive: false,
    };

    // ── 9. Atomic batch write ─────────────────────────────────────────────────
    const batch = db.batch();
    batch.set(responseRef, responseDoc);
    batch.update(linkDocRef.ref, linkUpdate);
    batch.set(eventRef, eventDoc);
    await batch.commit();

    req.log.info({ requestId, linkId, responseId }, "supplier_responses document created");

    safeJsonResponse(
      res,
      {
        responseId,
        status: "submitted",
        computedTotals: {
          priceExcludingVatSar: body.priceExcludingVatSar,
          vatAmountSar,
          priceIncludingVatSar,
          vatRatePercent: 15,
        },
      },
      201,
    );
  } catch (err) {
    req.log.error({ err }, "public supplier-response write failed");
    errorJsonResponse(res, "An internal error occurred. Please try again.", 500, "server_error");
  }
});

export default router;
