import { z } from "zod";
import { firestoreTimestampSchema, attachmentRefSchema } from "../types";

// ─── Payment Record ───────────────────────────────────────────────────────────
// Created by Finance (role: "finance") at Stage 8 after processing payment
// in SAP. Multiple records are allowed per request to support partial payments,
// though the primary use case is a single full payment.

export const paymentRecordSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),

  // The reference number from the SAP payment transaction (e.g. bank transfer ref).
  paymentReference: z.string().min(1),

  // The supplier's invoice number matched to this payment.
  invoiceNumber: z.string().min(1),

  // Scan / photo of the payment slip or bank transfer confirmation.
  paymentAttachment: attachmentRefSchema,

  notes: z.string().nullable(),

  // UID of the Finance user who recorded this payment.
  paidByUid: z.string().min(1),

  // When the payment was actually processed (may differ from createdAt).
  paidAt: firestoreTimestampSchema,
  createdAt: firestoreTimestampSchema,
});

export type PaymentRecord = z.infer<typeof paymentRecordSchema>;
