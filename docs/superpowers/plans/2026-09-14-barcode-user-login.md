# Barcode User Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 16-digit barcode-based user registration and login while preserving existing manual login and lot scanning.

**Architecture:** Reuse the existing local user repository and auth IPC as the source of truth. Add display-name support to the local user model, classify 16-digit scans in the dashboard before lot handling, and use the same scanner hook on Login with input interception enabled. Keep all privilege checks in the main process.

**Tech Stack:** Electron, React, TypeScript, sql.js/SQLite, bcryptjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-barcode-user-login-design.md`

## Global Constraints

- User labels are exactly 16 numeric digits.
- Username and initial password are both the scanned 16-digit code.
- Passwords remain bcrypt-hashed and are never persisted in plaintext.
- Only Admin/Master can register users by label; only Master can create another Master.
- Manual login and non-16-digit lot scanning must continue to work.
- History reopen UI must be Master-only.

---

### Task 1: User model and persistence

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/db/migrations.ts`
- Modify: `src/main/db/users-repo.ts`
- Modify: `src/main/validation/schemas.ts`
- Modify: `src/main/db/central-users-repo.ts`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- `User.displayName?: string`
- `UserCreateInput.displayName: string`
- `createUser(username, password, role, sectorCode, laboratoryProfile, displayName)`

- [ ] Write failing tests asserting migration `019_user_display_name`, input validation, and central display-name mirroring.
- [ ] Verify tests fail because display-name support is absent.
- [ ] Add nullable local `display_name`, shared types, repository mapping/insertion, validation, and central mirroring.
- [ ] Run targeted tests and verify green.

### Task 2: Barcode classification and scanner behavior

**Files:**
- Create: `src/shared/user-barcode.ts`
- Modify: `src/renderer/hooks/useBarcodeScanner.ts`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- `isUserBarcode(code: string): boolean`
- `useBarcodeScanner(onScan, enabled, options?: { ignoreFormFields?: boolean })`

- [ ] Write failing tests for exact 16-digit classification and source-level scanner option contract.
- [ ] Verify red.
- [ ] Implement classifier and scanner option with default behavior unchanged.
- [ ] Verify targeted tests green.

### Task 3: Admin/Master registration from dashboard

**Files:**
- Modify: `src/renderer/screens/Dashboard.tsx`
- Modify: `src/main/ipc/users-handlers.ts`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- Dashboard intercepts `isUserBarcode(code)` before lot handling for Admin/Master.
- Existing `window.api.users.create` is used with scanned code for username/password.

- [ ] Write failing contract tests for dashboard interception, modal fields, and main-process Admin/Master authorization.
- [ ] Verify red.
- [ ] Add registration state/modal, role/sector/profile fields, save flow and user-facing success/error.
- [ ] Keep existing `requireAdmin` and Master-only Master creation enforcement in main process; persist display name.
- [ ] Verify targeted tests green.

### Task 4: Barcode auto-login

**Files:**
- Modify: `src/renderer/screens/Login.tsx`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- Login scanner calls `auth.login({ username: code, password: code })` only for `isUserBarcode(code)`.

- [ ] Write failing contract test for barcode login payload and scanner option.
- [ ] Verify red.
- [ ] Add scanner login callback with loading/error handling shared with manual login.
- [ ] Verify targeted tests green.

### Task 5: Master-only reopen UI and full verification

**Files:**
- Modify: `src/renderer/screens/History.tsx`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

- [ ] Write failing test that reopen visibility checks `user.role === "master"`.
- [ ] Verify red.
- [ ] Restrict UI visibility to Master.
- [ ] Run `npm test` and `npm run typecheck`.
- [ ] Open PR so the Windows packaging workflow validates the branch; merge to `main` only after successful verification.
