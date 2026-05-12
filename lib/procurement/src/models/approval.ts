import { z } from "zod";
import { APPROVAL_STATUSES, APPROVAL_DECISIONS } from "../constants";
import { firestoreTimestampSchema } from "../types";

// ─── Approval — One document per chain step per request ───────────────────────
//
// There are TWO approval chains, distinguished by `chainType`:
//
//  "budget" chain (Stage 7) — runs before the PO is created.
//    stepOrder 1 → planning
//    stepOrder 2 → finance
//    stepOrder 3 → evp or ceo  (only created when requiresEVPCEO is true)
//
//  "po" chain (Stages 9–10) — runs after Procurement enters the PO details.
//    stepOrder 1 → requester / director  (canSubmitRequests: true)
//    stepOrder 2 → planning
//
// The `approverRole` field uses "requester" as a sentinel for PO chain step 1,
// meaning the specific user who created the RFQ must sign off (not any user
// with the same role). All other steps use canonical ProcurementRole values.

export const approvalSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),

  // Which of the two approval chains this document belongs to.
  chainType: z.enum(["budget", "po"]),

  // Position within this chain (1-based).
  // Budget chain: 1 = planning, 2 = finance, 3 = evp/ceo (conditional)
  // PO chain:     1 = director/requester, 2 = planning
  stepOrder: z.number().int().min(1).max(3),

  // Role responsible for this step. Use "requester" for PO chain step 1.
  approverRole: z.string().min(1),

  // UID of the specific user who acted. Null until someone acts.
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
