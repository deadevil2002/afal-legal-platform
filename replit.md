# AF Procurement Hub

## Overview

Enterprise-grade mobile app — **AF Procurement Hub** — a procurement and supply chain workflow platform built on Expo (React Native) + Firebase. Previously known as "Arabian Fal Legal Platform"; migrating from legal services domain to full procurement workflow system.

**Migration status:** Phase 0 + Phase 2 complete. See `PROJECT_MIGRATION_AUDIT.md` for full scope.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Mobile**: Expo (React Native) — `artifacts/mobile`
- **Backend**: Express 5 — `artifacts/api-server`
- **Database**: Firebase Firestore (real-time)
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage
- **Language**: TypeScript

## Features

- **Authentication**: Email/password login & registration via Firebase Auth; forgot password flow
- **Employee Number**: Every user profile has an `employeeNumber` field (set at registration)
- **Request Management**: Users create, track, and filter 6 legal service request categories
- **Attachments**: Files (images, PDFs, Word docs) can be attached to requests and messages via Firebase Storage
- **Conversation Threads**: Per-request real-time messaging in top-level `request_messages` collection
- **Admin Dashboard**: Admins manage all requests with 8-stage workflow statuses
- **Send to Employee**: Admins can create requests directed at specific employees (search by name/number/dept)
- **Super Admin**: Ownership transfer, promote/demote assistant admins
- **Settings & Profile**: Edit profile, show employeeNumber, language toggle (EN/AR), account deletion requests
- **Bilingual**: English (default) + Arabic via settings toggle

## Brand Colors (Official Arabian Fal)

- Primary: `#2D6491` (Dark Azure Blue)
- Secondary: `#16A8BA` (Teal)
- Accent: `#BC9B5D` (Gold)
- Neutral: `#000000` (Black)
- Additional: `#112B4D`, `#0C233C`, `#006485`, `#005D8B`, `#5D1E5E`

## Security

- Firebase Security Rules enforce role-based access (user vs admin)
- Users only access their own data; admins access all
- No client-side role manipulation — all validation is backend-enforced

## Key Files

- `artifacts/mobile/lib/firebase.ts` — Firebase initialization (auth + Firestore)
- `artifacts/mobile/context/AuthContext.tsx` — Auth + language state, profile change request functions
- `artifacts/mobile/i18n/translations.ts` — EN/AR translations
- `artifacts/mobile/constants/colors.ts` — Brand design tokens
- `artifacts/mobile/app/(tabs)/` — Main screens
- `artifacts/mobile/app/(tabs)/settings.tsx` — Profile settings, phone/empNum change request flow
- `artifacts/mobile/app/request/` — Request detail + new request screens
- `artifacts/mobile/app/auth/` — Login + register screens
- `artifacts/mobile/app/admin/profile-changes.tsx` — Super Admin profile change request approval screen
- `artifacts/mobile/app/admin/export-data.tsx` — Excel export (ExcelJS loaded lazily via dynamic import)

## Critical Implementation Notes

### Firebase Auth (`lib/firebase.ts`)
- Uses `initializeAuth` (not `getAuth`) for explicit persistence control
- Native: `getReactNativePersistence(AsyncStorage)` — auth persists across app restarts
- Web: `browserLocalPersistence` — same as browser default
- Firestore: `memoryLocalCache()` on web (prevents SQLite errors in Replit iframe), default persistent cache on native

### Auth Navigation Guard (`app/_layout.tsx` — AuthGate)
- Checks `user && profile && inAuth` before redirecting to tabs (not just `user`)
- Profile being null while user is non-null means: auth exists but Firestore profile is not yet loaded — do NOT redirect

### Registration Race-Condition Fix (`context/AuthContext.tsx` — `register()`)
- `setProfile(newProfile)` is called AFTER `await batch.commit()` succeeds — NOT before
- Pre-setting profile before the batch caused AuthGate to redirect to tabs prematurely (onAuthStateChanged fires with loading=false before the batch runs)
- If the batch then failed (phone/employeeNumber taken), the account was deleted but the user was already on the tabs screen; the redirect to login swallowed the error message on the register screen
- With the fix: profile stays null until the batch commits → AuthGate stays on register → on failure, error is shown on register screen; on success, setProfile triggers the AuthGate redirect

### ExcelJS (`app/admin/export-data.tsx`)
- MUST remain `import type ExcelJS from "exceljs"` — static import causes stack overflow on app startup
- MUST use `const ExcelJS = (await import("exceljs")).default` inside the handler only
- Never change back to a static `import ExcelJS from "exceljs"`

### Profile Change Request Flow
- Phone and employeeNumber changes by normal users go through `requestProfileChange()` in AuthContext
- Super Admin reviews/approves/rejects via `app/admin/profile-changes.tsx`
- Approval uses Firestore batch: updates user doc + updates index docs + marks request approved
- `updateUserProfile` whitelist: `displayName`, `department`, `language`, `updatedAt` ONLY

### Interface Imports
- `ProfileChangeRequest` is a TypeScript interface — always use `import type { ProfileChangeRequest }` to avoid runtime `undefined` values
- Babel strips `import type` completely; without `type`, Metro keeps the import statement but the value is `undefined` at runtime

### StyleSheet
- Never use `marginLeft: "auto" as unknown as number` — React Native StyleSheet does not accept string values for numeric props via cast hacks
- Use `justifyContent: "space-between"` on the parent row instead

## Super Admin Logic

- **Initial bootstrap Super Admin email**: `Naimi.salem@gmail.com` (in `context/AuthContext.tsx` as `INITIAL_SUPER_ADMIN_EMAIL`)
- This is a **bootstrap-only** email — after a Super Admin transfer, the active super admin is tracked in Firestore at `settings/app.superAdminEmail`
- `resolveRole()` checks `settings/app.superAdminEmail` dynamically (subscribes via `onSnapshot`) — not statically hardcoded
- Super Admin can promote users to `assistant_admin` or demote them back to `user`
- **Super Admin Transfer** — stored atomically in Firestore:
  - `settings/app.superAdminEmail` → updated to new owner
  - `audit_logs` collection → immutable audit record with `transferredBy`, `transferredAt`, `previousSuperAdmin`, `newSuperAdmin`
  - Previous super admin role → downgraded to `assistant_admin`
  - New super admin role → elevated to `super_admin`
  - Requires Firebase re-authentication (password confirmation) before executing
- Regular users cannot self-assign elevated roles (`updateUserProfile` strips `role` field)
- All role enforcement is done server-side in Firestore security rules

## Request Types

The approved procurement request types are:
1. Purchase Request
2. Vendor Approval
3. Contract Review
4. Budget Request
5. Supplier Onboarding
6. Violation Report

Canonical values are defined in `artifacts/mobile/constants/requestTypes.ts`.
Legacy legal category strings ("Amicable Settlement", "Complaint", etc.) are retained in `CATEGORY_KEY_MAP` and translations for backward-compatible display of existing Firestore records.

## Firebase Setup

Requires environment secrets:
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## Firebase Security Rules (Deploy to Firebase Console)

Deploy these rules in Firebase Console → Firestore → Rules.

**Key design decisions:**
- `userId` field on `requests` and `request_messages` (not `createdBy`) — required by these rules
- `request_messages` is a **top-level collection**, not a subcollection of `requests`
- Super Admin is dynamically resolved: `role == "super_admin"` in Firestore (bootstrap email check removed from rules; bootstrap is only used in `AuthContext.tsx` at runtime)
- Composite Firestore index required: `requests` collection — `userId` (ASC) + `createdAt` (DESC)
- Composite Firestore index required: `request_messages` collection — `requestId` (ASC) + `createdAt` (ASC)

See canonical source: `artifacts/mobile/firestore.rules`

**Key rule highlights (as of Phase 2 migration):**
- `validRole()` accepts: `"super_admin"`, `"ceo"`, `"evp"`, `"planning"`, `"finance"`, `"procurement"` — legacy `"user"` and `"assistant_admin"` excluded
- Self-registration requires `role == "procurement"` (the new default for new employees)
- `isAssistantAdmin()` covers new operational roles (`ceo`, `evp`, `planning`, `finance`, `procurement`) plus legacy `assistant_admin`
- Legacy category/status values still accepted on `update` (via `validRequestCategoryForUpdate` / `validRequestStatusForUpdate`) for backward-compat during data migration
