# Barcode User Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register operational users from exactly 16 numeric barcode digits, generating usernames from the informed name while keeping the scanned value as the permanent bcrypt-hashed password.

**Architecture:** Keep scanner classification in shared code, but move username generation, collision handling, profile validation, authorization and persistence into the main process. The renderer only confirms the 16-digit user label, collects name/profile, shows the server-generated username after creation, and never creates Admin/Master accounts through this flow.

**Tech Stack:** Electron, React, TypeScript, sql.js/SQLite, PostgreSQL, bcryptjs, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-barcode-user-login-design.md`

## Global Constraints

- User labels are exactly 16 numeric digits.
- The scanned 16 digits are the permanent password, but only a bcrypt hash may be persisted.
- Username is generated from the informed display name and collisions receive numeric suffixes starting at `2`.
- Barcode registration profiles are only Production, Laboratory Capture and Laboratory Closure.
- Admin and Master cannot be created through barcode registration.
- Registration requires an authenticated Admin/Master and authorization is enforced in the main process.
- Non-16-digit scans continue through the existing lot flow.
- Manual login remains unchanged; barcode auto-login is out of scope.
- Central PostgreSQL identity/permissions are synchronized from the created local user.

---

### Task 1: Regression contract for the approved behavior

**Files:**
- Modify: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- `isUserBarcode(code: string): boolean`
- Main-process barcode registration contract accepts `{ barcode, displayName, profile }`.
- Supported profile values: `production`, `laboratory_capture`, `laboratory_closure`.

- [ ] **Step 1: Write failing tests**

Assert that the current implementation fails the approved contract by requiring all of the following:

```ts
expect(usersHandlers).toContain("generateUniqueUsername");
expect(usersHandlers).toContain("normalizeUsername");
expect(usersHandlers).toContain("barcodeUserRegistrationSchema");
expect(usersHandlers).toContain('z.enum(["production", "laboratory_capture", "laboratory_closure"])');
expect(registration).toContain("profile");
expect(registration).not.toContain('<option value="admin">');
expect(registration).not.toContain('<option value="master">');
expect(login).not.toContain("username: code, password: code");
```

Also assert deterministic collision suffixing through a focused exported username helper test.

- [ ] **Step 2: Run targeted test and verify RED**

Run:

```bash
npm test -- src/main/__tests__/barcode-user-access.test.ts
```

Expected: FAIL because the current flow uses the 16-digit code as username, exposes Admin/Master profile options, and still includes barcode auto-login.

### Task 2: Username generation and dedicated main-process registration

**Files:**
- Create: `src/main/users/barcode-user-registration.ts`
- Modify: `src/main/ipc/users-handlers.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**

```ts
export type BarcodeUserProfile = "production" | "laboratory_capture" | "laboratory_closure";

export interface BarcodeUserRegistrationInput {
  barcode: string;
  displayName: string;
  profile: BarcodeUserProfile;
}

export function normalizeUsername(displayName: string): string;
export function generateUniqueUsername(displayName: string, exists: (username: string) => boolean): string;
```

- [ ] **Step 1: Implement minimal username helper**

Normalize with Unicode NFD diacritic removal, lowercase, non-alphanumeric runs to `.`, trim dots, reject empty output, then suffix `2`, `3`, ... while `exists(candidate)` returns true.

- [ ] **Step 2: Add a dedicated IPC channel and schema**

Add `IPC.usersRegisterBarcode` and `BarcodeUserRegistrationInput`. Main-process validation requires `^\d{16}$`, non-empty `displayName`, and the exact three-profile enum.

- [ ] **Step 3: Map profile to the existing user model**

```ts
production -> role operator, sector PRODUCTION
laboratory_capture -> role operator, sector LABORATORY, laboratoryProfile capture
laboratory_closure -> role operator, sector LABORATORY, laboratoryProfile closure
```

Call `createUser(generatedUsername, barcode, ...)` so bcrypt remains the persistence path. Never include the barcode in audit details.

- [ ] **Step 4: Synchronize central identity**

If the central database is configured, call the existing `ensureCentralUserAccess(user)` after local creation and return an error if synchronization fails.

- [ ] **Step 5: Expose preload API**

Add `window.api.users.registerBarcode(input)` returning `ServiceResult<User>`.

### Task 3: Registration UI and scanner interception

**Files:**
- Modify: `src/renderer/components/UserBarcodeRegistration.tsx`
- Modify: `src/renderer/screens/Login.tsx`
- Test: `src/main/__tests__/barcode-user-access.test.ts`

**Interfaces:**
- Existing scanner interception remains based on `isUserBarcode` and `stopImmediatePropagation()` before lot handlers.
- Renderer calls only `window.api.users.registerBarcode({ barcode, displayName, profile })`.

- [ ] **Step 1: Remove barcode auto-login**

Delete the scanner-driven `auth.login({ username: code, password: code })` behavior from `Login.tsx`; manual login remains unchanged.

- [ ] **Step 2: Simplify registration form**

Keep confirmation first. Details phase contains:

```text
Nome
Usuário: gerado automaticamente pelo nome
Senha permanente: [16-digit scanned value]
Perfil: Produção | Laboratório — Captura | Laboratório — Fechamento
```

No Admin/Master options are rendered.

- [ ] **Step 3: Save through dedicated API**

Call `users.registerBarcode`; on success show `Usuário <generatedUsername> cadastrado com sucesso.` and close the modal.

### Task 4: Verification and integration

**Files:**
- Test: `src/main/__tests__/barcode-user-access.test.ts`
- Existing CI: `.github/workflows/build-installer.yml`

- [ ] **Step 1: Run targeted test**

```bash
npm test -- src/main/__tests__/barcode-user-access.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

```bash
npm test
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 3: Open PR**

Open a PR from `feat/barcode-user-registration-final` to `main` so the Windows workflow runs tests and packaging.

- [ ] **Step 4: Merge only after CI is green**

If CI passes and the diff matches this spec, fast-forward/merge to `main`.
