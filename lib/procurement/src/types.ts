import { z } from "zod";

// ─── Firestore Timestamp ──────────────────────────────────────────────────────
// Structural type compatible with both Firebase client SDK and Admin SDK
// Timestamp objects. Uses z.infer so the interface stays in sync with the schema.

export const firestoreTimestampSchema = z.object({
  seconds: z.number().int(),
  nanoseconds: z.number().int().min(0),
});

export type FirestoreTimestamp = z.infer<typeof firestoreTimestampSchema>;

// ─── Attachment Reference ─────────────────────────────────────────────────────
// Stored inside documents wherever a file attachment is referenced.
// uploadedBy is a UID for authenticated uploads, or "supplier" for public form uploads.

export const attachmentRefSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  storagePath: z.string().min(1),
  uploadedAt: firestoreTimestampSchema,
  uploadedBy: z.string().min(1),
});

export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
