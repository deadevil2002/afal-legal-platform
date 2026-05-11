import { z } from "zod";
import { PAYMENT_TERMS, SUPPLIER_REVIEW_STATUSES } from "../constants";
import { firestoreTimestampSchema, attachmentRefSchema } from "../types";

// ─── Supplier Public Form — Zod Schema ────────────────────────────────────────
// This schema defines the structure of a supplier_responses document.
// Documents are written ONLY via the backend API route (Firebase Admin SDK),
// never directly from client-side Firebase SDK — suppliers have no app account.

export const supplierResponseSchema = z.object({
  id: z.string().min(1),
  linkId: z.string().min(1),
  requestId: z.string().min(1),
  submittedAt: firestoreTimestampSchema,

  // ── Company Identity ──────────────────────────────────────────────────────
  companyName: z.string().min(1),
  commercialRegistrationNumber: z.string().min(1),
  commercialRegistrationAttachment: attachmentRefSchema,
  accreditationNumber: z.string().min(1),
  accreditationAttachment: attachmentRefSchema,
  // ZATCA = Zakat, Tax and Customs Authority registration number
  zatcaNumber: z.string().min(1),

  // ── Contact ───────────────────────────────────────────────────────────────
  phone: z.string().min(1),
  email: z.string().email(),
  contactPersonName: z.string().min(1),

  // ── National Address ──────────────────────────────────────────────────────
  nationalAddressText: z.string().min(1),
  nationalAddressAttachment: attachmentRefSchema,

  // ── Banking ───────────────────────────────────────────────────────────────
  ibanText: z.string().min(1),
  ibanAttachment: attachmentRefSchema,

  // ── Pricing ───────────────────────────────────────────────────────────────
  // All amounts in Saudi Riyal (SAR).
  priceExcludingVatSar: z.number().positive(),
  // vatAmountSar and priceIncludingVatSar are always calculated server-side
  // using calculateVat() and calculatePriceIncludingVat() helpers.
  vatAmountSar: z.number().nonnegative(),
  priceIncludingVatSar: z.number().positive(),
  paymentTerms: z.enum(PAYMENT_TERMS),

  // ── Optional ──────────────────────────────────────────────────────────────
  notes: z.string().nullable(),
  extraAttachments: z.array(attachmentRefSchema),

  // ── Procurement Review ────────────────────────────────────────────────────
  // Set by Procurement after receiving the response.
  reviewStatus: z.enum(SUPPLIER_REVIEW_STATUSES),
  reviewedBy: z.string().nullable(),
  reviewedAt: firestoreTimestampSchema.nullable(),
});

export type SupplierResponse = z.infer<typeof supplierResponseSchema>;

// ─── Supplier Form Input ──────────────────────────────────────────────────────
// Shape of the raw data submitted by the supplier via the public form.
// Used to validate the POST body in the API route before writing to Firestore.
// Excludes server-computed fields (id, linkId, requestId, submittedAt,
// vatAmountSar, priceIncludingVatSar, reviewStatus, reviewedBy, reviewedAt).

export const supplierFormInputSchema = supplierResponseSchema.omit({
  id: true,
  linkId: true,
  requestId: true,
  submittedAt: true,
  vatAmountSar: true,
  priceIncludingVatSar: true,
  reviewStatus: true,
  reviewedBy: true,
  reviewedAt: true,
});

export type SupplierFormInput = z.infer<typeof supplierFormInputSchema>;
