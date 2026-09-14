# Barcode User Login Design

## Goal

Allow PORTUS to use 16-digit barcode labels as user credentials. Admin and Master users can register a new labeled user by scanning the label; registered users can later scan the same label on the login screen to authenticate automatically.

## Functional rules

- A user label is exactly 16 numeric digits: `^\d{16}$`.
- For label-created accounts, `username` is the 16-digit code and the initial password is the same 16-digit code.
- The password must never be stored in plaintext; the existing bcrypt user repository remains the authority for password hashing.
- The registration flow asks for the user's display name and operational profile.
- Only authenticated `admin` or `master` users may register a label-created account.
- An `admin` may create `admin` or `operator` accounts but may not create `master`; only `master` may create another `master`, preserving the existing authorization rule.
- The creator selects sector (`PRODUCTION` or `LABORATORY`). Laboratory users must also select `capture` or `closure` profile.
- When an authenticated Admin/Master scans a 16-digit code from the dashboard, PORTUS must not treat it as a lot code. It opens a confirmation/registration modal instead.
- On the login screen, scanning a registered 16-digit label calls the normal authentication path with username and password both equal to the scanned code. Invalid/unknown labels show the existing login error and do not create accounts.
- Manual username/password login remains unchanged.
- In History, only `master` sees the "Reabrir lote" action, matching the PostgreSQL function that already restricts reopening to Master.

## Data model

The local SQLite `users` table gains nullable `display_name TEXT`. Existing rows remain valid. The shared `User` type gains optional `displayName` and user creation input requires `displayName` for new registration UI. The central PostgreSQL `users.display_name` already exists; `ensureCentralUserAccess` must mirror `displayName` when available and fall back to username for legacy users.

## UI flow

### Registration

1. Admin/Master is authenticated and on the dashboard.
2. Scanner reads 16 digits.
3. PORTUS asks whether this is a user label and shows the 16-digit credential value.
4. On confirmation, the same modal collects display name, role, sector and laboratory profile when required.
5. Saving calls the existing `users.create` IPC API with username/password equal to the label.
6. Successful creation closes the modal and shows a short success message. Duplicate labels return the existing duplicate-user error.

### Login

1. Login screen listens to fast HID scanner input even while the username field is focused.
2. Only exactly 16 numeric digits trigger barcode auto-login.
3. PORTUS authenticates through the existing `auth.login` IPC handler with both fields set to the scanned code.
4. Successful authentication transitions normally to the app.

## Security and error handling

- Registration authorization stays in the main process via `requireAdmin`; renderer checks are UX only.
- Master creation remains enforced in the main process.
- Password hashing remains in `createUser` with bcrypt.
- Unknown labels never auto-create accounts at login.
- Scanner classification is deterministic: only 16 numeric digits are user labels; all other dashboard scans continue through the lot flow.
- Duplicate scans while the modal is open are ignored because the dashboard scanner is disabled while registration is active.

## Testing

Add regression tests for: barcode classification, scanner input handling option, local migration/display name persistence, main-process authorization contract, dashboard interception of 16-digit labels, login auto-auth payload, and master-only history reopen visibility.
