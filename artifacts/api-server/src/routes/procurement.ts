import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestoreTimestampSchema, TERMINAL_STAGES } from "@workspace/procurement";
import { getAdminDb } from "../lib/firebase-admin";
import { requireInternalAuth } from "../lib/auth";
import { safeJsonResponse, errorJsonResponse } from "../lib/response";

// ─── Request body schema ──────────────────────────────────────────────────────
// Only the caller-supplied fields. Token and all server-computed fields
// (createdByUid, createdAt, isActive, submittedAt, responseId) are set here.

const createSupplierLinkBodySchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
  supplierNameHint: z.string().nullable().optional(),
  // Optional caller-supplied expiry. Defaults to DEFAULT_EXPIRY_DAYS if omitted.
  expiresAt: firestoreTimestampSchema.nullable().optional(),
});

const DEFAULT_EXPIRY_DAYS = 7;

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/procurement/supplier-links
 *
 * Authenticated internal route — requires Firebase ID token.
 * Allowed roles: super_admin, procurement.
 *
 * Writes:
 *   supplier_links/{id}      — new link document
 *   workflow_events/{id}     — supplier_link_generated event
 */
router.post("/supplier-links", requireInternalAuth, async (req, res) => {
  try {
    const user = req.internalUser!; // guaranteed by requireInternalAuth

    // ── Role check ────────────────────────────────────────────────────────────
    if (user.role !== "super_admin" && user.role !== "procurement") {
      errorJsonResponse(
        res,
        "Only super_admin or procurement roles may create supplier links.",
        403,
        "forbidden",
      );
      return;
    }

    // ── Body validation ───────────────────────────────────────────────────────
    const parsed = createSupplierLinkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ validationError: parsed.error.flatten() }, "supplier-links body invalid");
      errorJsonResponse(res, parsed.error.message, 400, "invalid_payload");
      return;
    }

    const { requestId, supplierNameHint, expiresAt: rawExpiresAt } = parsed.data;

    const db = getAdminDb();

    // ── Verify the procurement request exists ─────────────────────────────────
    const requestSnap = await db.collection("procurement_requests").doc(requestId).get();
    if (!requestSnap.exists) {
      errorJsonResponse(
        res,
        `Procurement request '${requestId}' not found.`,
        404,
        "request_not_found",
      );
      return;
    }

    const requestData = requestSnap.data()!;

    // ── Reject terminal requests ───────────────────────────────────────────────
    if ((TERMINAL_STAGES as readonly string[]).includes(requestData["stage"] as string)) {
      errorJsonResponse(
        res,
        "Cannot create a supplier link for a closed or terminated request.",
        409,
        "request_terminated",
      );
      return;
    }

    // ── Resolve expiresAt ─────────────────────────────────────────────────────
    // If caller did not provide an expiry, default to DEFAULT_EXPIRY_DAYS from now.
    const expiresAt: FirebaseFirestore.Timestamp = rawExpiresAt
      ? new Timestamp(rawExpiresAt.seconds, rawExpiresAt.nanoseconds)
      : Timestamp.fromDate(new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

    // ── Generate token ────────────────────────────────────────────────────────
    const token = randomBytes(32).toString("hex"); // 64-char hex, unguessable

    // ── Prepare Firestore refs ────────────────────────────────────────────────
    const linkRef = db.collection("supplier_links").doc();
    const eventRef = db.collection("workflow_events").doc();
    const linkId = linkRef.id;

    const linkDoc = {
      id: linkId,
      requestId,
      token,
      supplierNameHint: supplierNameHint ?? null,
      createdByUid: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      isActive: true,
      submittedAt: null,
      responseId: null,
    };

    const eventDoc = {
      id: eventRef.id,
      requestId,
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      eventType: "supplier_link_generated",
      fromStage: (requestData["stage"] as string | undefined) ?? null,
      toStage: null,
      comment: supplierNameHint
        ? `Supplier link created (hint: ${supplierNameHint})`
        : "Supplier link created",
      attachments: [],
      createdAt: FieldValue.serverTimestamp(),
      metadata: { supplierLinkId: linkId, token },
    };

    // ── Atomic batch write ────────────────────────────────────────────────────
    const batch = db.batch();
    batch.set(linkRef, linkDoc);
    batch.set(eventRef, eventDoc);
    await batch.commit();

    req.log.info({ requestId, linkId }, "supplier_links document created");

    safeJsonResponse(
      res,
      {
        id: linkId,
        token,
        requestId,
        supplierNameHint: supplierNameHint ?? null,
        publicFormUrl: `/supplier/${token}`,
        expiresAt: { seconds: expiresAt.seconds, nanoseconds: expiresAt.nanoseconds },
      },
      201,
    );
  } catch (err) {
    req.log.error({ err }, "supplier-links write failed");
    errorJsonResponse(res, "An internal error occurred. Please try again.", 500, "server_error");
  }
});

export default router;
