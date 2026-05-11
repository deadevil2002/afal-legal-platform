import { z } from "zod";
import { WORKFLOW_EVENT_TYPES, PROCUREMENT_STAGES } from "../constants";
import { firestoreTimestampSchema, attachmentRefSchema } from "../types";

// ─── Workflow Event — Immutable Audit Log Entry ────────────────────────────────
// One document per stage transition, comment, or significant action.
// Documents are NEVER updated or deleted (except by Super Admin emergency delete).
// This collection is the single source of truth for the full request timeline.

export const workflowEventSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),

  // The person who triggered this event.
  // Null only for automated system events (e.g. VAT recalculation).
  actorUid: z.string().nullable(),
  actorName: z.string().nullable(),
  // Role snapshot at time of event — stored so the timeline remains accurate
  // even if the actor's role changes later.
  actorRole: z.string().nullable(),

  eventType: z.enum(WORKFLOW_EVENT_TYPES),

  // Stage the request was in before this event.
  fromStage: z.enum(PROCUREMENT_STAGES).nullable(),
  // Stage the request moved to as a result of this event.
  toStage: z.enum(PROCUREMENT_STAGES).nullable(),

  // Human-readable note the actor attached to this event.
  comment: z.string().nullable(),

  // Any files attached alongside the event (e.g. PO document, payment slip).
  attachments: z.array(attachmentRefSchema),

  createdAt: firestoreTimestampSchema,

  // Extra structured data specific to the event type.
  // e.g. { supplierLinkId: "abc" } for supplier_link_generated
  //      { poNumber: "PO-123" }    for po_added
  metadata: z.record(z.unknown()).nullable(),
});

export type WorkflowEvent = z.infer<typeof workflowEventSchema>;
