/**
 * Phase 2A — Public supplier routes (no authentication required).
 *
 * GET  /api/public/supplier-link/:token
 * POST /api/public/supplier-response/:token
 *
 * These are exact ports of artifacts/api-server/src/routes/publicSupplier.ts.
 * Logic, validation, Firestore schema, and batch-write behavior are preserved.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  supplierFormInputSchema,
  calculateVat,
  calculatePriceIncludingVat,
  TERMINAL_STAGES,
} from "@workspace/procurement";
import {
  getAccessToken,
  generateDocId,
  SERVER_TIMESTAMP,
  firestoreQueryWhere,
  firestoreGetDoc,
  firestoreBatchWrite,
} from "../lib/firebase";
import type { Env } from "../index";

// ─── Public attachment input schema ──────────────────────────────────────────
// Suppliers upload files directly to Cloudinary from the browser and send back
// { url, name, storagePath }. The server adds uploadedAt and uploadedBy before
// persisting, so those fields are NOT accepted from the client.

const publicAttachmentInputSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  storagePath: z.string().min(1),
});

type PublicAttachmentInput = z.infer<typeof publicAttachmentInputSchema>;

// ─── Phase C submission schema ────────────────────────────────────────────────
// Derived from supplierFormInputSchema (which is SupplierResponse minus server
// fields). Attachment fields use publicAttachmentInputSchema (no uploadedAt /
// uploadedBy — the server adds those). currency and quotationAttachment are
// optional.

const phaseCPublicSubmissionSchema = supplierFormInputSchema
  .omit({
    commercialRegistrationAttachment: true,
    accreditationAttachment: true,
    nationalAddressAttachment: true,
    ibanAttachment: true,
    extraAttachments: true,
  })
  .extend({
    commercialRegistrationAttachment: publicAttachmentInputSchema.optional(),
    accreditationAttachment: publicAttachmentInputSchema.optional(),
    nationalAddressAttachment: publicAttachmentInputSchema.optional(),
    ibanAttachment: publicAttachmentInputSchema.optional(),
    extraAttachments: z.array(publicAttachmentInputSchema).optional(),
    quotationAttachment: publicAttachmentInputSchema.optional(),
    notes: z.string().nullable().optional(),
    currency: z.enum(["SAR", "USD"]).optional(),
  });

// ─── Attachment enrichment ────────────────────────────────────────────────────

function enrichAttachment(
  att: PublicAttachmentInput | undefined | null,
): Record<string, unknown> | null {
  if (!att) return null;
  return {
    url: att.url,
    name: att.name,
    storagePath: att.storagePath,
    uploadedAt: {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
    },
    uploadedBy: "supplier",
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Hono<{ Bindings: Env }>();

/**
 * GET /api/public/supplier-link/:token
 *
 * Public — no auth. Returns context for the supplier form:
 *   - whether the link is valid / active / expired / used
 *   - optional hint label set by Procurement
 *   - productDescription from the parent procurement request
 *
 * Never exposes internal IDs, user data, or financial information.
 */
router.get("/supplier-link/:token", async (c) => {
  const token = c.req.param("token");

  if (!token || token.length < 32) {
    return c.json({ error: "Invalid token.", code: "invalid_payload" }, 400);
  }

  try {
    const accessToken = await getAccessToken(c.env);
    const projectId = c.env.FIREBASE_PROJECT_ID;

    // ── 1. Look up the supplier link by token ─────────────────────────────────
    const linkDocs = await firestoreQueryWhere(
      projectId,
      accessToken,
      "supplier_links",
      "token",
      token,
      1,
    );

    if (linkDocs.length === 0) {
      return c.json(
        { error: "Supplier link not found.", code: "link_not_found" },
        404,
      );
    }

    const link = linkDocs[0]!.data;

    // ── 2. Determine link status ──────────────────────────────────────────────
    const nowSeconds = Date.now() / 1000;
    const expiresAt = link["expiresAt"] as
      | { seconds: number }
      | null
      | undefined;
    const isExpired = expiresAt ? nowSeconds > expiresAt.seconds : false;
    const isUsed =
      link["responseId"] != null || link["submittedAt"] != null;
    const isActive = link["isActive"] === true && !isExpired && !isUsed;

    let status: "active" | "expired" | "used" | "deactivated";
    if (isUsed) status = "used";
    else if (!link["isActive"]) status = "deactivated";
    else if (isExpired) status = "expired";
    else status = "active";

    // ── 3. Fetch productDescription from the parent request (non-fatal) ───────
    let productDescription: string | null = null;
    const requestId = link["requestId"] as string | undefined;
    if (requestId) {
      try {
        const requestData = await firestoreGetDoc(
          projectId,
          accessToken,
          `procurement_requests/${requestId}`,
        );
        if (requestData !== null) {
          productDescription =
            (requestData["productDescription"] as string | undefined) ?? null;
        }
      } catch {
        // Non-fatal — form still works without description
      }
    }

    // Return flat — the supplier form reads status/supplierNameHint at top level.
    return c.json({
      status,
      supplierNameHint: (link["supplierNameHint"] as string | null) ?? null,
      isActive,
      productDescription,
    });
  } catch (err) {
    console.error("supplier-link info failed:", err);
    return c.json(
      {
        error: "An internal error occurred.",
        code: "server_error",
      },
      500,
    );
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
router.post("/supplier-response/:token", async (c) => {
  const token = c.req.param("token");

  if (!token || token.length < 32) {
    return c.json(
      { error: "Invalid or missing supplier link token.", code: "invalid_payload" },
      400,
    );
  }

  try {
    const accessToken = await getAccessToken(c.env);
    const projectId = c.env.FIREBASE_PROJECT_ID;

    // ── 1. Look up the supplier link by token ─────────────────────────────────
    const linkDocs = await firestoreQueryWhere(
      projectId,
      accessToken,
      "supplier_links",
      "token",
      token,
      1,
    );

    if (linkDocs.length === 0) {
      return c.json(
        { error: "Supplier link not found.", code: "link_not_found" },
        404,
      );
    }

    const linkDoc = linkDocs[0]!;
    const link = linkDoc.data;
    const linkId = linkDoc.id;

    // ── 2. Check isActive ─────────────────────────────────────────────────────
    if (link["isActive"] !== true) {
      return c.json(
        {
          error: "This supplier link has been deactivated.",
          code: "link_expired",
        },
        410,
      );
    }

    // ── 3. Check expiry ───────────────────────────────────────────────────────
    const expiresAt = link["expiresAt"] as { seconds: number } | null | undefined;
    if (expiresAt && Date.now() > expiresAt.seconds * 1000) {
      return c.json(
        { error: "This supplier link has expired.", code: "link_expired" },
        410,
      );
    }

    // ── 4. One submission per link ────────────────────────────────────────────
    if (link["responseId"] != null || link["submittedAt"] != null) {
      return c.json(
        {
          error: "A response has already been submitted for this link.",
          code: "link_already_used",
        },
        409,
      );
    }

    // ── 5. Verify the parent procurement request ──────────────────────────────
    const requestId = link["requestId"] as string;
    const requestData = await firestoreGetDoc(
      projectId,
      accessToken,
      `procurement_requests/${requestId}`,
    );

    if (requestData === null) {
      return c.json(
        {
          error: "Associated procurement request not found.",
          code: "request_not_found",
        },
        404,
      );
    }

    if (
      (TERMINAL_STAGES as readonly string[]).includes(
        requestData["status"] as string,
      )
    ) {
      return c.json(
        {
          error:
            "The associated procurement request is closed and no longer accepting submissions.",
          code: "link_expired",
        },
        410,
      );
    }

    // ── 6. Validate form body ─────────────────────────────────────────────────
    let body: z.infer<typeof phaseCPublicSubmissionSchema>;
    try {
      const rawBody = await c.req.json();
      const parsed = phaseCPublicSubmissionSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          {
            error: parsed.error.message,
            code: "invalid_payload",
          },
          400,
        );
      }
      body = parsed.data;
    } catch {
      return c.json(
        { error: "Invalid JSON body.", code: "invalid_payload" },
        400,
      );
    }

    const currency = body.currency ?? "SAR";

    // ── 7. Compute VAT server-side ────────────────────────────────────────────
    // VAT applies only to SAR-quoted prices. USD quotations carry 0 VAT.
    const vatAmountSar =
      currency === "SAR" ? calculateVat(body.priceExcludingVatSar) : 0;
    const priceIncludingVatSar =
      currency === "SAR"
        ? calculatePriceIncludingVat(body.priceExcludingVatSar)
        : body.priceExcludingVatSar;

    // ── 8. Generate document IDs ──────────────────────────────────────────────
    const responseId = generateDocId();
    const eventId = generateDocId();

    // ── 9. Build documents ────────────────────────────────────────────────────
    const responseDoc: Record<string, unknown> = {
      id: responseId,
      linkId,
      requestId,
      submittedAt: SERVER_TIMESTAMP,
      // Company identity
      companyName: body.companyName,
      commercialRegistrationNumber: body.commercialRegistrationNumber,
      commercialRegistrationAttachment: enrichAttachment(
        body.commercialRegistrationAttachment,
      ),
      accreditationNumber: body.accreditationNumber,
      accreditationAttachment: enrichAttachment(body.accreditationAttachment),
      zatcaNumber: body.zatcaNumber,
      // Contact
      phone: body.phone,
      email: body.email,
      contactPersonName: body.contactPersonName,
      // Address
      nationalAddressText: body.nationalAddressText,
      nationalAddressAttachment: enrichAttachment(
        body.nationalAddressAttachment,
      ),
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
      extraAttachments: (body.extraAttachments ?? [])
        .map(enrichAttachment)
        .filter((a): a is Record<string, unknown> => a !== null),
      // Review — set by Procurement after receiving
      reviewStatus: "pending",
      reviewedBy: null,
      reviewedAt: null,
    };

    const eventDoc: Record<string, unknown> = {
      id: eventId,
      requestId,
      actorUid: null,
      actorName: body.companyName,
      actorRole: "supplier",
      eventType: "supplier_response_received",
      fromStatus: (requestData["status"] as string | undefined) ?? null,
      toStatus: null,
      comment: `Supplier response received from ${body.companyName} (${body.contactPersonName})`,
      attachments: [],
      createdAt: SERVER_TIMESTAMP,
      metadata: { supplierLinkId: linkId, responseId },
    };

    const linkUpdate: Record<string, unknown> = {
      submittedAt: SERVER_TIMESTAMP,
      responseId,
      isActive: false,
    };

    // ── 10. Atomic batch write ────────────────────────────────────────────────
    await firestoreBatchWrite(projectId, accessToken, [
      { type: "set", collection: "supplier_responses", id: responseId, data: responseDoc },
      { type: "update", collection: "supplier_links", id: linkId, data: linkUpdate },
      { type: "set", collection: "workflow_events", id: eventId, data: eventDoc },
    ]);

    console.log(`supplier_response created: requestId=${requestId} linkId=${linkId} responseId=${responseId} currency=${currency}`);

    return c.json(
      {
        ok: true,
        data: {
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
      },
      201,
    );
  } catch (err) {
    console.error("public supplier-response write failed:", err);
    return c.json(
      {
        error: "An internal error occurred. Please try again.",
        code: "server_error",
      },
      500,
    );
  }
});

export default router;
