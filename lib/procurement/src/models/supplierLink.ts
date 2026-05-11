import { z } from "zod";
import { firestoreTimestampSchema } from "../types";

export const supplierLinkSchema = z.object({
  id: z.string().min(1),

  requestId: z.string().min(1),

  // Cryptographically random token that forms the public form URL.
  // Must be at least 32 characters to prevent guessing.
  token: z.string().min(32),

  // Optional label Procurement uses to track who the link was sent to
  // before they submit (e.g. "Al-Ameen Suppliers"). Not the official company
  // name — that comes from the supplier's own form response.
  supplierNameHint: z.string().nullable(),

  createdByUid: z.string().min(1),
  createdAt: firestoreTimestampSchema,

  // Optional expiry. Null means the link never expires (until deactivated).
  expiresAt: firestoreTimestampSchema.nullable(),

  // Set to false to invalidate the link without deleting it (audit trail).
  isActive: z.boolean(),

  // Populated when the supplier submits the form.
  submittedAt: firestoreTimestampSchema.nullable(),
  responseId: z.string().nullable(),
});

export type SupplierLink = z.infer<typeof supplierLinkSchema>;
