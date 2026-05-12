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
  createdByRole: z.string().min(1),
  createdByEmployeeNumber: z.string().min(1),

  createdAt: firestoreTimestampSchema,
  updatedAt: firestoreTimestampSchema,

  // Numeric workflow step (1–12). Derived from `status` but stored separately
  // for easy range queries and list display logic.
  currentStage: z.number().int().min(1).max(12),

  // Canonical workflow state string — drives all business logic.
  status: z.enum(PROCUREMENT_STAGES),

  category: z.enum(PROCUREMENT_CATEGORIES),

  // ── Stage 1: RFQ Content ──────────────────────────────────────────────────
  // What the requester is asking to procure. "productDescription" is the
  // user-facing RFQ body; attachments carry specs, drawings, etc.
  productDescription: z.string().min(1),
  requestAttachments: z.array(attachmentRefSchema),

  // ── Stage 5: Requester Quotation Selection ────────────────────────────────
  // Set when the requester selects the winning supplier response.
  selectedSupplierResponseId: z.string().nullable(),

  // Set when the requester rejects all quotations and sends back to Procurement.
  quotationRejectedAt: firestoreTimestampSchema.nullable(),
  quotationRejectionReason: z.string().nullable(),

  // ── Stage 6: PR Number + Approved Budget ─────────────────────────────────
  // Entered by the requester (Director) after selecting a quotation.
  prNumber: z.string().nullable(),
  approvedBudgetSar: z.number().positive().nullable(),

  // ── Stage 8: SAP PO Details ───────────────────────────────────────────────
  // Entered by Procurement after the budget approval chain completes.
  poNumber: z.string().nullable(),
  poAttachment: attachmentRefSchema.nullable(),

  // ── Approval Chain Flags ─────────────────────────────────────────────────
  // Whether the EVP/CEO step (order 3) is required in the budget approval chain.
  requiresEVPCEO: z.boolean(),

  // ── Visibility ────────────────────────────────────────────────────────────
  // When true, the original requester can see the full workflow timeline.
  // When false, they see only a simplified status summary.
  showFullWorkflow: z.boolean(),

  // ── Finance / Payment ────────────────────────────────────────────────────
  paymentStatus: z.enum(PAYMENT_STATUSES),

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  isActive: z.boolean(),

  // Termination — set only by Super Admin.
  isTerminated: z.boolean(),
  terminatedBy: z.string().nullable(),
  terminationReason: z.string().nullable(),
  terminatedAt: firestoreTimestampSchema.nullable(),

  // Closure — set by Procurement at Stage 12.
  closedAt: firestoreTimestampSchema.nullable(),
  closedBy: z.string().nullable(),
});

export type ProcurementRequest = z.infer<typeof procurementRequestSchema>;
