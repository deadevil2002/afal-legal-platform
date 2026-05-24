/**
 * migrate-categories.ts
 *
 * One-time migration script: updates all Firestore `requests` documents that
 * still carry legacy legal category strings to the nearest equivalent
 * procurement category.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *   export FIREBASE_PROJECT_ID=your-project-id          # optional if set in creds
 *   pnpm --filter @workspace/scripts run migrate-categories
 *
 * Or pass the service account key inline:
 *   GOOGLE_APPLICATION_CREDENTIALS=./key.json FIREBASE_PROJECT_ID=my-proj \
 *     pnpm --filter @workspace/scripts run migrate-categories
 *
 * Flags:
 *   --dry-run   Print what would change without writing to Firestore
 *
 * The script:
 *   1. Reads every document in the `requests` collection.
 *   2. Skips documents whose `category` is already a valid procurement value
 *      or whose `legacyCategory` field is already set (already migrated).
 *   3. Maps legacy category strings to the nearest procurement equivalent.
 *   4. Writes { category: <new>, legacyCategory: <old>, migratedAt: <ts> }
 *      back to Firestore in batches of 400.
 *   5. Prints a summary of changes.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "Purchase Request",
  "Vendor Approval",
  "Contract Review",
  "Budget Request",
  "Supplier Onboarding",
  "Violation Report",
]);

/**
 * Maps every legacy category string (title-case and snake_case variants)
 * to the nearest procurement equivalent.
 *
 * Rationale:
 *   Amicable Settlement  → Violation Report  (dispute / conflict resolution)
 *   Complaint            → Violation Report  (employee/vendor complaints)
 *   Investigation Request→ Violation Report  (misconduct / compliance probes)
 *   Legal Consultation   → Contract Review   (contract/legal advisory)
 *   Contract Issue       → Contract Review   (contract defects / disputes)
 */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  // Title-case
  "Amicable Settlement":   "Violation Report",
  "Complaint":             "Violation Report",
  "Legal Consultation":    "Contract Review",
  "Investigation Request": "Violation Report",
  "Contract Issue":        "Contract Review",
  // snake_case (and the known typo variant)
  "amicable_settlement":   "Violation Report",
  "amicaable_settlement":  "Violation Report",
  "complaint":             "Violation Report",
  "legal_consultation":    "Contract Review",
  "investigation_request": "Violation Report",
  "contract_issue":        "Contract Review",
  "violation_report":      "Violation Report",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

function initFirebase(): ReturnType<typeof getFirestore> {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!credsPath) {
    console.error(
      "ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.\n" +
      "  Export it pointing to your Firebase service account JSON key file.\n" +
      "  e.g.  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json"
    );
    process.exit(1);
  }

  let credential;
  try {
    const raw = readFileSync(resolve(credsPath), "utf8");
    credential = cert(JSON.parse(raw));
  } catch (err) {
    console.error(`ERROR: Could not read service account key at "${credsPath}":`, err);
    process.exit(1);
  }

  initializeApp({ credential, ...(projectId ? { projectId } : {}) });
  return getFirestore();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = isDryRun();

  console.log("=".repeat(60));
  console.log("AF Procurement Hub — Category Migration Script");
  console.log("=".repeat(60));
  if (dryRun) console.log("DRY-RUN mode — no writes will be made.\n");

  const db = initFirebase();

  console.log("Fetching all documents from `requests` collection…");
  const snapshot = await db.collection("requests").get();
  console.log(`  Total documents found: ${snapshot.size}\n`);

  type PendingUpdate = {
    id: string;
    oldCategory: string;
    newCategory: string;
  };

  const toUpdate: PendingUpdate[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const rawCategory: string = (data.category ?? data.type ?? "") as string;

    if (!rawCategory) {
      skipped.push({ id: doc.id, reason: "no category/type field" });
      continue;
    }

    if (data.legacyCategory) {
      skipped.push({ id: doc.id, reason: "already migrated (legacyCategory present)" });
      continue;
    }

    if (VALID_CATEGORIES.has(rawCategory)) {
      skipped.push({ id: doc.id, reason: `already a valid procurement category: "${rawCategory}"` });
      continue;
    }

    const mapped = LEGACY_CATEGORY_MAP[rawCategory];
    if (!mapped) {
      // Unknown category — fall back to Violation Report and log a warning
      console.warn(
        `  WARN: Unknown category "${rawCategory}" on doc ${doc.id}; ` +
        `mapping to "Violation Report" (unclassifiable fallback)`
      );
      toUpdate.push({ id: doc.id, oldCategory: rawCategory, newCategory: "Violation Report" });
      continue;
    }

    toUpdate.push({ id: doc.id, oldCategory: rawCategory, newCategory: mapped });
  }

  // ── Summary of planned changes ──────────────────────────────────────────

  console.log(`Documents to migrate:  ${toUpdate.length}`);
  console.log(`Documents to skip:     ${skipped.length}`);
  console.log();

  if (toUpdate.length === 0) {
    console.log("Nothing to migrate. All documents are already up-to-date.");
    return;
  }

  // Show a breakdown by legacy → new mapping
  const breakdown: Record<string, number> = {};
  for (const { oldCategory, newCategory } of toUpdate) {
    const key = `"${oldCategory}" → "${newCategory}"`;
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  console.log("Migration breakdown:");
  for (const [mapping, count] of Object.entries(breakdown)) {
    console.log(`  ${count.toString().padStart(4)} × ${mapping}`);
  }
  console.log();

  if (dryRun) {
    console.log("DRY-RUN complete. Re-run without --dry-run to apply changes.");
    return;
  }

  // ── Write in Firestore batches (max 500 ops per batch; use 400 for safety) ─

  const BATCH_SIZE = 400;
  const migratedAt = Timestamp.now();
  let totalWritten = 0;

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const { id, oldCategory, newCategory } of chunk) {
      const ref = db.collection("requests").doc(id);
      batch.update(ref, {
        category: newCategory,
        legacyCategory: oldCategory,
        migratedAt,
      });
    }

    await batch.commit();
    totalWritten += chunk.length;
    console.log(`  Committed batch ${Math.ceil((i + BATCH_SIZE) / BATCH_SIZE)}: ${totalWritten}/${toUpdate.length} documents`);
  }

  console.log();
  console.log(`Migration complete. ${totalWritten} document(s) updated.`);
  console.log();
  console.log("Next steps:");
  console.log("  1. Verify the data in Firebase Console — confirm each migrated");
  console.log("     document has a valid procurement category and a legacyCategory");
  console.log("     field for audit.");
  console.log("  2. The app code (CATEGORY_KEY_MAP and legacy translation keys)");
  console.log("     has already been cleaned up — no further code changes needed.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
