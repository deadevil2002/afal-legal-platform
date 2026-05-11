import { z } from "zod";
import {
  PROCUREMENT_STAGES,
  PROCUREMENT_CATEGORIES,
  PAYMENT_STATUSES,
} from "../constants";
import { firestoreTimestampSchema, attachmentRefSchema } from "../types";

export const procurementRequestSchema = z.object({
  id: z.string().min(1),

  // Human-readable unique ID assigned at closure (e.g. "PRQ-2026-0042").
  // Null until the request is closed.
  requestNumber: z.string().nullable(),

  // Creator identity snapshot — captured at request creation and never mutated.
  createdByUid: z.string().min(1),
  createdByName: z.string().min(1),
  createdByEmployeeNumber: z.string().min(1),

  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,

  // Numeric workflow step (1 = creation, 9 = closed). Derived from `status`
  // but stored separately for easy range queries and display logic.
  currentStage: z.number().int().min(1).max(9),

  // Canonical workflow state string.
  status: z.enum(PROCUREMENT_STAGES),

  category: z.enum(PROCUREMENT_CATEGORIES),

  // What the requester is asking to purchase / procure.
  productDescription: z.string().min(1),
  requestAttachments: z.array(attachmentRefSchema),

  // Set by Procurement at Stage 5 — the supplier response the Director approved.
  selectedSupplierResponseId: z.string().nullable(),

  // Entered by the requester (Director) at Stage 5 when approving a quotation.
  prNumber: z.string().nullable(),
  approvedBudgetSar: z.number().positive().nullable(),

  // Entered by Procurement at Stage 6 after creating the PO in SAP.
  poNumber: z.string().nullable(),
  poAttachment: attachmentRefSchema.nullable(),

  // Whether the EVP/CEO approval step (step 5) is required for this request.
  requiresEVPCEO: z.boolean(),

  // When true, the original requester can see the full workflow timeline.
  // When false, they see only a simplified status summary.
  showFullWorkflow: z.boolean(),

  paymentStatus: z.enum(PAYMENT_STATUSES),

  isActive: z.boolean(),

  // Termination — set only by Super Admin.
  isTerminated: z.boolean(),
  terminatedBy: z.string().nullable(),
  terminationReason: z.string().nullable(),
  terminatedAt: firestoreTimestampSchema.nullable(),

  // Closure — set by Procurement at Stage 9.
  closedAt: firestoreTimestampSchema.nullable(),
  closedBy: z.string().nullable(),

  // Director rejection at Stage 5.
  rejectedAt: firestoreTimestampSchema.nullable(),
  rejectionReason: z.string().nullable(),
});

export type ProcurementRequest = z.infer<typeof procurementRequestSchema>;
