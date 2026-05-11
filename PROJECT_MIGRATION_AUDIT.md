# PROJECT MIGRATION AUDIT
## Arabian Fal Legal Platform → AF Procurement Hub

**Date:** 2026-05-10
**Phase:** 3 — Procurement Workflow Statuses
**Status:** Phase 0 complete. Phase 2 complete (procurement categories). Phase 3 complete (procurement statuses). App fully operational.

---

## 1. MIGRATION OVERVIEW

The application is being pivoted from a **legal services request tracker** into a
**procurement and supply chain workflow platform** called **AF Procurement Hub**.

This audit documents every file tied to the old system, files safe to keep as-is,
files that require partial rewrite, and files that should be removed in future phases.

---

## 2. PHASE 0 CHANGES MADE

| File | Change |
|------|--------|
| `app.json` | App name → "AF Procurement Hub"; permission strings updated; bundle IDs left unchanged |
| `i18n/translations.ts` | `appName`, `tagline`, `iosPhotoPermissionDenied`, `exportDialogTitle` (EN + AR) updated |
| `components/AttachmentPicker.tsx` | File header comment updated |
| `lib/cloudinary.ts` | File header comment updated |
| `app/request/new.tsx` | TODO marker added above `REQUEST_CATEGORIES` |
| `components/RequestCard.tsx` | TODO marker added above `CATEGORY_KEY_MAP` |
| `app/(tabs)/admin.tsx` | TODO marker added above `STATUS_OPTIONS` |
| `context/AuthContext.tsx` | TODO marker added above `UserRole` type |
| `i18n/translations.ts` | TODO markers added near status names and category labels |
| `app/legal/[page].tsx` | TODO marker added at file top |

## 2b. PHASE 2 CHANGES MADE (Procurement Request Types)

| File | Change |
|------|--------|
| `constants/requestTypes.ts` | **Created** — exports `REQUEST_CATEGORIES`, `RequestCategory` type, `CATEGORY_TRANSLATION_KEYS` map |
| `app/request/new.tsx` | Replaced inline `REQUEST_CATEGORIES` + `CATEGORY_KEYS` with imports from `constants/requestTypes`; default category → "Purchase Request" |
| `app/admin/send-to-employee.tsx` | Replaced local `REQUEST_CATEGORIES` with import from `constants/requestTypes`; default category and chip labels updated |
| `components/RequestCard.tsx` | `CATEGORY_KEY_MAP` updated with 6 procurement types as canonical entries; legacy legal entries kept for backward-compat display of old Firestore records |
| `i18n/translations.ts` | Added EN+AR translations for 6 procurement categories + 8 procurement statuses; legacy legal keys retained for old data display |
| `firestore.rules` | `validRequestCategory()` updated to accept 6 new procurement categories; `validRequestStatus()` updated to accept 8 new procurement statuses |
| `app/(tabs)/admin.tsx` | `Status` type + `STATUS_OPTIONS` updated to 8 procurement stages; filter labels, counts, and closedAt logic updated |
| `app/request/[id].tsx` | `STATUS_OPTIONS`, `STATUS_KEY_MAP`, `STATUS_DOT_COLORS`, `isLocked`, `sendMessage` guard all updated to procurement statuses |
| `components/StatusBadge.tsx` | `RequestStatus` type + `STATUS_CONFIG` updated with procurement colors/labels; legacy status entries retained for old records |
| `app/(tabs)/requests.tsx` | `STATUS_FILTER_ITEMS` updated to procurement stages |
| `app/(tabs)/index.tsx` | `stats.active/closed` logic updated to use terminal statuses ("Approved / PO Issued", "Rejected") |

---

## 2c. PHASE 3 CHANGES MADE (Procurement Workflow Statuses)

| File | Change |
|------|--------|
| `constants/requestStatuses.ts` | **Created** — exports `REQUEST_STATUSES`, `RequestStatus` type, `TERMINAL_STATUSES` array, `STATUS_TRANSLATION_KEYS` map |
| `app/(tabs)/admin.tsx` | `Status` type + `STATUS_OPTIONS` now imported from `constants/requestStatuses`; local `TERMINAL_STATUSES` merges imported array with legacy values for backward-compat |
| `app/request/[id].tsx` | `STATUS_OPTIONS` and `STATUS_KEY_MAP` now imported from `constants/requestStatuses` |
| `components/StatusBadge.tsx` | `RequestStatus` type + `STATUS_CONFIG` already updated in Phase 2 with all 8 procurement stages and legacy display-only entries — no further change required |
| `i18n/translations.ts` | EN+AR labels for all 8 procurement statuses already added in Phase 2 — no further change required |
| `firestore.rules` | `validRequestStatus()` and `validRequestStatusForUpdate()` already updated in Phase 2 — no further change required |
| `PROJECT_MIGRATION_AUDIT.md` | Phase 3 marked complete |

---

## 3. FILES TIED TO OLD LEGAL WORKFLOW

These files contain legal-domain logic that will need full rewrite or removal:

### 3a. Remove Entirely (Future Phase)
| File | Reason |
|------|--------|
| `app/legal/[page].tsx` | Entire file is legal policy pages (Privacy Policy, Terms of Use, Account Deletion Policy, Data Retention Policy, Contact & Support) with hardcoded Arabian Fal Legal content |

### 3b. Replace/Rewrite (Future Phases)
| File | What Needs Changing |
|------|---------------------|
| `app/request/new.tsx` | `REQUEST_CATEGORIES` constant — 6 legal types must be replaced with procurement workflow types |
| `components/RequestCard.tsx` | `CATEGORY_KEY_MAP` — maps old legal category strings to translation keys |
| `app/(tabs)/admin.tsx` | `Status` type + `STATUS_OPTIONS` — 8-stage legal workflow statuses |
| `context/RequestsContext.tsx` | Status filtering logic mirrors the 8 legal stages |
| `i18n/translations.ts` | `typeAmicable`, `typeComplaint`, `typeLegalConsultation`, `typeInvestigation`, `typeContractIssue`, `typeViolationReport` keys; 8 status name keys; `legalAndPrivacy` section |
| `app/admin/export-data.tsx` | Column headers reference legal categories; sheet name is "Requests (Legal)" style |
| `components/StatusBadge.tsx` | Color/icon logic based on legal status names |
| `firestore.rules` | `validRequestCategory()` and `validRequestStatus()` functions list legal values |

### 3c. Partial Rewrite (Roles & Permissions)
| File | What Needs Changing |
|------|---------------------|
| `context/AuthContext.tsx` | `UserRole` type has `assistant_admin`; profile change request system; deletion request helpers |
| `app/(tabs)/admin.tsx` | `assistant_admin` promotion/demotion UI; "Employee Contacted" / "Employee Feedback" statuses |
| `app/(tabs)/settings.tsx` | Profile change request flow; account deletion request flow |
| `app/admin/profile-changes.tsx` | Entire screen — old profile change approval system |
| `app/admin/deletion-requests.tsx` | Entire screen — old account deletion request system |
| `app/admin/send-to-employee.tsx` | "Send to Employee" concept; may be repurposed for procurement routing |
| `firestore.rules` | `validRole()` function; `profile_change_requests` and `deletion_requests` collections |

---

## 4. FILES SAFE TO KEEP (Minimal or No Changes Required)

| File | Notes |
|------|-------|
| `lib/firebase.ts` | Firebase init — do NOT change. Native/web persistence split is correct. |
| `app/_layout.tsx` | Auth gate + navigation shell — generic, no legal content |
| `app/auth/login.tsx` | Generic auth screen |
| `app/auth/register.tsx` | Generic auth screen |
| `app/auth/forgot-password.tsx` | Generic forgot password |
| `app/transfer-super-admin.tsx` | Super admin transfer — role names will change but flow is generic |
| `constants/colors.ts` | Brand colors — can update palette in future phase |
| `hooks/useColors.ts` | Generic theme hook |
| `hooks/useT.ts` | Generic translation hook |
| `components/Logo.tsx` | Displays logo asset — replace asset in future phase |
| `components/Icon.tsx` | Generic icon wrapper |
| `components/UserProfileModal.tsx` | Generic profile popup |
| `lib/cloudinary.ts` | Upload service — fully generic, folder paths use `afal/` prefix (update later) |
| `components/AttachmentPicker.tsx` | Generic file picker — no legal logic |
| `app/(tabs)/_layout.tsx` | Tab bar navigation — generic |
| `app/request/[id].tsx` | Request detail + messaging — mostly generic; status names will need update |
| `app/(tabs)/requests.tsx` | Request list — generic filter UI; status names will need update |
| `app/(tabs)/index.tsx` | Home dashboard — generic stats and recent items |
| `lib/pushNotifications.ts` | Push notification stub — currently unused; keep for future |

---

## 5. ROLE LOGIC LOCATIONS

All role logic must be updated together when the new role structure is implemented:

| Location | Detail |
|----------|--------|
| `context/AuthContext.tsx` line 43 | `UserRole` type — currently `"user" \| "assistant_admin" \| "super_admin"` |
| `context/AuthContext.tsx` `resolveRole()` | Reads `settings/app.superAdminEmail` and user `role` field |
| `context/AuthContext.tsx` `isAdmin` | Returns true for `super_admin` or `assistant_admin` |
| `firestore.rules` `validRole()` | Validates role values on write |
| `firestore.rules` `isAssistantAdmin()` | Check that must expand for new roles |
| `app/(tabs)/admin.tsx` | Admin tab access guarded by `isAdmin` |
| `app/(tabs)/settings.tsx` | Super Admin section guarded by `isSuperAdmin` |
| `app/admin/*.tsx` (all screens) | Admin sub-screens guarded by `isAdmin`/`isSuperAdmin` |

**Future role structure (do not implement yet):**
- `super_admin` — system owner
- `ceo` — final approval authority
- `evp` — executive approval stage
- `planning` — planning team reviewer
- `finance` — finance team reviewer
- `procurement` — procurement team processor
- Requester = permission flag (`canSubmitRequests: true`) assigned by super_admin — NOT a role

---

## 6. DASHBOARD LOGIC LOCATIONS

| Location | Detail |
|----------|--------|
| `app/(tabs)/index.tsx` | Home: stats (total/submitted/active/closed), recent requests |
| `app/(tabs)/requests.tsx` | Full request list with status filter |
| `app/(tabs)/admin.tsx` | Admin dashboard: all requests + user management |
| `context/RequestsContext.tsx` | Firestore subscription that feeds all request screens |
| `components/RequestCard.tsx` | Single request card displayed in all lists |

---

## 7. FIRESTORE DEPENDENCY LOCATIONS

| Collection | Used In |
|------------|---------|
| `users/{uid}` | AuthContext, admin.tsx, send-to-employee.tsx, profile-changes.tsx |
| `requests/{id}` | RequestsContext, request/new.tsx, request/[id].tsx, admin.tsx, export-data.tsx |
| `request_messages/{id}` | request/[id].tsx (conversation thread) |
| `deletion_requests/{id}` | settings.tsx, admin/deletion-requests.tsx |
| `profile_change_requests/{id}` | settings.tsx, admin/profile-changes.tsx, AuthContext |
| `user_phone_index/{phone}` | AuthContext (unique phone enforcement) |
| `user_employee_index/{empNum}` | AuthContext (unique employee number enforcement) |
| `settings/app` | AuthContext (superAdminEmail, allowUserSignup) |
| `public_config/app` | AuthContext (allowUserSignup toggle) |
| `audit_logs/{id}` | AuthContext (super admin transfer audit trail) |

**Firestore index collections to rename in future phase:**
- `user_phone_index` → keep or rename based on new user model
- `user_employee_index` → keep (employee numbers are still relevant in procurement)

---

## 8. NOTIFICATION LOGIC LOCATIONS

| Location | Detail |
|----------|--------|
| `lib/pushNotifications.ts` | Stub only — Expo push token registration. Currently unused. |
| `settings.tsx` | Notification badges: pending deletion requests + profile change requests (red dots) |
| `app/(tabs)/_layout.tsx` | Likely reads badge counts for tab bar |
| Firebase Cloud Messaging | Not yet integrated — future phase |

**Note:** No live push notifications are sent yet. Badge counts come from Firestore `onSnapshot` listeners.

---

## 9. TRACKING LOGIC LOCATIONS

| Location | Detail |
|----------|--------|
| `request/[id].tsx` | Status change history display (statusChangedAt, statusChangedBy fields) |
| `app/(tabs)/admin.tsx` | Admin status update writes `statusChangedBy` + `statusChangedAt` to Firestore |
| `context/RequestsContext.tsx` | Real-time listener on `requests` collection |
| `audit_logs` collection | Super admin transfer audit (immutable records) |
| `components/RequestCard.tsx` | `viewedBy` field tracking (unread dot indicator) |

---

## 10. OLD LEGAL TRANSLATIONS TO REPLACE

These translation keys are candidates for renaming or replacement:

```
typeAmicable          → future procurement type (e.g. typePurchaseRequest)
typeComplaint         → retain or repurpose
typeLegalConsultation → future procurement type (e.g. typeContractReview)
typeInvestigation     → retain or repurpose
typeContractIssue     → retain as typeContractReview
typeViolationReport   → retain

statusEmployeeContacted → rename to match procurement stage
statusEmployeeFeedback  → rename to match procurement stage
statusProposedResolution → rename to match procurement stage
statusResolvedClosed   → rename to match procurement stage

legalAndPrivacy section → replace or remove with new policy pages
```

---

## 11. RISKS DISCOVERED

| Risk | Severity | Notes |
|------|----------|-------|
| Firestore data has existing records with old category strings | HIGH | Do NOT rename category values before running a data migration script. The `CATEGORY_KEY_MAP` snake_case fallbacks exist precisely for this reason. |
| `bundleIdentifier: "com.arabianfal.legal"` | MEDIUM | Cannot change without breaking existing App Store/Play Store installations. Defer until major version bump. |
| `assistant_admin` role exists in live Firestore user documents | MEDIUM | When roles are redesigned, existing `assistant_admin` users must be migrated in Firestore before the app deploys the new role model. |
| Legal pages still accessible via `app/legal/[page].tsx` | LOW | Content is outdated but functional. Remove after replacement pages are written. |
| Cloudinary folder prefix `afal/` in existing uploaded files | LOW | Renaming the folder path only affects new uploads. Existing file URLs are permanent CDN links and will not break. |
| Profile change requests + deletion requests in flight | LOW | If removed prematurely, in-progress requests will have no UI. Defer removal until all pending records are resolved. |
| Super admin bootstrap email hardcoded in AuthContext | LOW | `INITIAL_SUPER_ADMIN_EMAIL = "Naimi.salem@gmail.com"` — keep this unchanged. |

---

## 12. RECOMMENDED NEXT PHASES

### Phase 1 — New Role Model
- Define new `UserRole` type (super_admin, ceo, evp, planning, finance, procurement)
- Update Firestore security rules `validRole()`
- Update admin UI to promote/demote into new roles
- Add `canSubmitRequests` permission flag to user profile

### Phase 2 — Procurement Request Types
- Define new `REQUEST_CATEGORIES` (Purchase Request, Supplier Onboarding, Contract Review, PO Tracking, etc.)
- Write Firestore data migration script to back-fill existing records with a `legacyCategory` field
- Update `CATEGORY_KEY_MAP`, translations, and Firestore `validRequestCategory()` rule

### Phase 3 — Procurement Workflow Statuses
- Replace 8 legal statuses with procurement lifecycle stages
- Update `StatusBadge` colors and icons
- Update Firestore `validRequestStatus()` rule
- Write migration script for existing request documents

### Phase 4 — Approval Routing Engine
- Multi-stage approval routing (CEO → EVP → Planning → Finance → Procurement)
- Per-stage Firestore subcollection or status machine
- Role-gated approve/reject actions

### Phase 5 — External Integrations
- Supplier onboarding forms
- SAP payment tracking
- PO number generation and tracking
- Finance review integration

### Phase 6 — Cleanup
- Remove `app/legal/[page].tsx`
- Remove `app/admin/deletion-requests.tsx` (if replaced)
- Remove `app/admin/profile-changes.tsx` (if replaced)
- Remove `assistant_admin` role remnants
- Update Cloudinary folder prefix from `afal/` to `afph/` for new uploads
- Update bundle IDs in a major app store release
