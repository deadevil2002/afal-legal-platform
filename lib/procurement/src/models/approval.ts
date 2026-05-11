import { z } from "zod";
import { APPROVAL_STATUSES, APPROVAL_DECISIONS } from "../constants";
import { firestoreTimestampSchema } from "../types";

// ─── Approval — One document per chain step per request ───────────────────────
// Created when the PO is added (Stage 6) and the approval chain is initialised.
// The chain always has steps 1-4; step 5 (EVP/CEO) is only created when
// requiresEVPCEO is true on the parent procurement_request.

export const approvalSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),

  // Position in the approval chain (1–5). See APPROVAL_CHAIN_STEPS in constants.
  // 1 = requester (canSubmitRequests), 2 = operations, 3 = planning,
  // 4 = finance, 5 = evp/ceo (conditional).
  stepOrder: z.number().int().min(1).max(5),

  // Role responsible for this step. Use "requester" for step 1 — it is a
  // sentinel value, not a system role. Steps 2-5 use ProcurementRole values.
  approverRole: z.string().min(1),

  // UID of the specific user who acted on this step. May be null when the
  // step is first created and no one has acted yet.
  approverUid: z.string().nullable(),

  status: z.enum(APPROVAL_STATUSES),

  // The actual decision taken. Null while status is "pending".
  decision: z.enum(APPROVAL_DECISIONS).nullable(),

  // Optional note the approver attached to their decision.
  comment: z.string().nullable(),

  decidedAt: firestoreTimestampSchema.nullable(),
  createdAt: firestoreTimestampSchema,
});

export type Approval = z.infer<typeof approvalSchema>;
