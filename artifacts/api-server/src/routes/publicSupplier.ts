import { Router } from "express";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import {
  supplierFormInputSchema,
  calculateVat,
  calculatePriceIncludingVat,
  TERMINAL_STAGES,
} from "@workspace/procurement";
import { getAdminDb } from "../lib/firebase-admin";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

// ─── Public attachment input schema ───────────────────────────────────────────
// Suppliers upload files directly to Cloudinary from the browser and send back
// { url, name, storagePath }. The server adds uploadedAt and uploadedBy before
// persisting, so those fields are not accepted from the client.

const publicAttachmentInputSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  storagePath: z.string().min(1),
});

type PublicAttachmentInput = z.infer<typeof publicAttachmentInputSchema>;

function enrichAttachment(
  att: PublicAttachmentInput | undefined | null,
) {
  if (!att) return null;
  return {
    url: att.url,
    name: att.name,
    storagePath: att.storagePath,
    uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    uploadedBy: "supplier",
  };
}

// ─── Phase C submission schema ────────────────────────────────────────────────
// Derived from SupplierFormInput (which is SupplierResponse minus server fields).
// Attachment fields use publicAttachmentInputSchema (no uploadedAt/uploadedBy —
// the server adds those). currency and quotationAttachment are optional.

const phaseCPublicSubmissionSchema = supplierFormInputSchema
  .omit({
    commercialRegistrationAttachment: true,
    accreditationAttachment: true,
    nationalAddressAttachment: true,
    ibanAttachment: true,
    extraAttachments: true,
  })
  .extend({
    // Attachment fields: supplier uploads directly to Cloudinary; server enriches
    // with uploadedAt + uploadedBy before persisting.
    commercialRegistrationAttachment: publicAttachmentInputSchema.optional(),
    accreditationAttachment: publicAttachmentInputSchema.optional(),
    nationalAddressAttachment: publicAttachmentInputSchema.optional(),
    ibanAttachment: publicAttachmentInputSchema.optional(),
    extraAttachments: z.array(publicAttachmentInputSchema).optional(),
    // .extend() overrides the base schema's quotationAttachment field type
    quotationAttachment: publicAttachmentInputSchema.optional(),
    // notes is optional on the public form
    notes: z.string().nullable().optional(),
    // currency overrides the base default("SAR") field
    currency: z.enum(["SAR", "USD"]).optional(),
  });

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/public/supplier-link/:token
 *
 * Public — no auth. Returns context for the supplier form:
 * - whether the link is valid/active/expired/used
 * - optional hint label set by Procurement
 * - productDescription from the parent procurement request (what the supplier
 *   is quoting for)
 *
 * Never exposes internal IDs, user data, or financial information.
 */
router.get("/supplier-link/:token", async (req, res) => {
  try {
    const token = String(req.params.token);
    if (!token || token.length < 32) {
      errorJsonResponse(res, "Invalid token.", 400, "invalid_payload");
      return;
    }

    const db = getAdminDb();
    const linkQuery = await db
      .collection("supplier_links")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (linkQuery.empty) {
      errorJsonResponse(res, "Supplier link not found.", 404, "link_not_found");
      return;
    }

    const link = linkQuery.docs[0]!.data();
    const nowSeconds = Date.now() / 1000;
    const expiresAt = link["expiresAt"] as { seconds: number } | null | undefined;
    const isExpired = expiresAt ? nowSeconds > expiresAt.seconds : false;
    const isUsed = link["responseId"] != null || link["submittedAt"] != null;
    const isActive = link["isActive"] === true && !isExpired && !isUsed;

    let status: "active" | "expired" | "used" | "deactivated";
    if (isUsed) status = "used";
    else if (!link["isActive"]) status = "deactivated";
    else if (isExpired) status = "expired";
    else status = "active";

    // Fetch productDescription from the parent request so the supplier
    // knows what they are quoting for.
    let productDescription: string | null = null;
    const requestId = link["requestId"] as string | undefined;
    if (requestId) {
      try {
        const requestSnap = await db
          .collection("procurement_requests")
          .doc(requestId)
          .get();
        if (requestSnap.exists) {
          productDescription =
            (requestSnap.data()!["productDescription"] as string | undefined) ?? null;
        }
      } catch {
        // Non-fatal — form still works without description
      }
    }

    safeJsonResponse(res, {
      status,
      supplierNameHint: (link["supplierNameHint"] as string | null) ?? null,
      isActive,
      productDescription,
    });
  } catch (err) {
    req.log.error({ err }, "supplier-link info failed");
    errorJsonResponse(res, "An internal error occurred.", 500, "server_error");
  }
});

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

    if ((TERMINAL_STAGES as readonly string[]).includes(requestData["status"] as string)) {
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
    const currency = body.currency ?? "SAR";

    // ── 7. Compute VAT server-side ────────────────────────────────────────────
    // VAT applies only to SAR-quoted prices. USD quotations carry 0 VAT.
    const vatAmountSar =
      currency === "SAR" ? calculateVat(body.priceExcludingVatSar) : 0;
    const priceIncludingVatSar =
      currency === "SAR"
        ? calculatePriceIncludingVat(body.priceExcludingVatSar)
        : body.priceExcludingVatSar;

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
      commercialRegistrationAttachment: enrichAttachment(body.commercialRegistrationAttachment),
      accreditationNumber: body.accreditationNumber,
      accreditationAttachment: enrichAttachment(body.accreditationAttachment),
      zatcaNumber: body.zatcaNumber,
      // Contact
      phone: body.phone,
      email: body.email,
      contactPersonName: body.contactPersonName,
      // Address
      nationalAddressText: body.nationalAddressText,
      nationalAddressAttachment: enrichAttachment(body.nationalAddressAttachment),
      // Banking
      ibanText: body.ibanText,
      ibanAttachment: enrichAttachment(body.ibanAttachment),
      // Pricing — VAT computed server-side
      currency,
      priceExcludingVatSar: body.priceExcludingVatSar,
      vatAmountSar,
      priceIncludingVatSar,
      paymentTerms: body.paymentTerms,
      // Optional
      notes: body.notes ?? null,
      quotationAttachment: enrichAttachment(body.quotationAttachment),
      extraAttachments: (body.extraAttachments ?? []).map(enrichAttachment).filter(Boolean),
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
      fromStatus: (requestData["status"] as string | undefined) ?? null,
      toStatus: null,
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

    req.log.info({ requestId, linkId, responseId, currency }, "supplier_responses document created");

    safeJsonResponse(
      res,
      {
        responseId,
        status: "submitted",
        computedTotals: {
          currency,
          priceExcludingVat: body.priceExcludingVatSar,
          vatAmount: vatAmountSar,
          priceIncludingVat: priceIncludingVatSar,
          vatRatePercent: currency === "SAR" ? 15 : 0,
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
