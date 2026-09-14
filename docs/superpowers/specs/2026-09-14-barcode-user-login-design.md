# Barcode User Registration Design

## Goal

Allow PORTUS to recognize exactly 16 numeric digits from the physical barcode scanner as a user-registration label, ask for confirmation, collect the operator's name and operational profile, and persist the user safely in the existing `users` domain.

## Approved functional rules

- A user label is exactly 16 numeric digits: `^\d{16}$`.
- Any other scanned value continues through the existing lot/barcode flow unchanged.
- When a 16-digit label is scanned, PORTUS asks whether the code represents a user before creating anything.
- The operator must inform the user's name.
- PORTUS generates the login username from that name, normalized to lowercase ASCII words separated by dots. Example: `João da Silva` -> `joao.da.silva`.
- Username collisions are resolved automatically with a numeric suffix: `joao.da.silva`, `joao.da.silva2`, `joao.da.silva3`, and so on.
- The permanent password is exactly the scanned 16-digit value.
- The password is never persisted in plaintext; the existing bcrypt path remains responsible for hashing.
- The registration flow offers only operational profiles:
  - Production operator;
  - Laboratory capture;
  - Laboratory closure.
- Admin and Master cannot be created through the 16-digit barcode flow.
- Registration itself remains restricted to an authenticated Admin or Master, with authorization enforced in the main process.
- The new account must be persisted in the local `users` table and mirrored to the central PostgreSQL user/permission tables when central mode is configured.
- This feature does not add barcode auto-login. Manual authentication remains unchanged.

## Data and identity mapping

The existing local user model keeps `username`, `password_hash`, `display_name`, `role`, `sector_code` and `laboratory_profile`.

For a barcode registration:

- `display_name` = the name entered by the operator.
- `username` = generated from `display_name` with collision suffixing.
- `password_hash` = bcrypt hash of the 16-digit barcode value.
- Production profile = `role: operator`, `sectorCode: PRODUCTION`, no laboratory profile.
- Laboratory capture = `role: operator`, `sectorCode: LABORATORY`, `laboratoryProfile: capture`.
- Laboratory closure = `role: operator`, `sectorCode: LABORATORY`, `laboratoryProfile: closure`.

Central synchronization must mirror the resulting local identity through `ensureCentralUserAccess`, so central permissions remain consistent with the selected profile.

## UI flow

1. An authenticated Admin/Master is using PORTUS.
2. The scanner reads a value.
3. If it is not exactly 16 numeric digits, the existing lot flow continues.
4. If it is exactly 16 numeric digits, the lot flow is intercepted.
5. PORTUS opens a confirmation modal: `Este código de 16 dígitos é um usuário?`.
6. If the operator cancels, nothing is persisted.
7. If confirmed, PORTUS asks for the user's name and one of the three operational profiles.
8. The UI shows the generated username and the scanned 16 digits as the permanent password before saving.
9. Saving calls a dedicated main-process registration path. The renderer does not decide collision suffixes or authorization.
10. The main process validates the barcode, normalizes/generates a unique username, creates the bcrypt-hashed local user, synchronizes central access when configured, writes audit information, and returns the created user.
11. The UI shows a short success message with the generated username.

## Username generation

Normalization is deterministic:

1. Trim surrounding whitespace.
2. Unicode-normalize and remove diacritics.
3. Lowercase.
4. Convert non-alphanumeric runs to dots.
5. Trim leading/trailing dots.
6. Reject an empty result.
7. Check uniqueness in the local user repository.
8. If occupied, append `2`, `3`, ... until an available username is found.

Examples:

- `João da Silva` -> `joao.da.silva`
- another `João da Silva` -> `joao.da.silva2`
- `MARIA   Souza` -> `maria.souza`

## Security and error handling

- Only `requireAdmin`-authorized sessions can register a barcode user.
- Input role/sector values are not trusted from the renderer. The barcode registration contract accepts only the three approved operational profiles.
- The 16-digit value must not be written to logs, audit `details`, or persisted plaintext fields.
- Duplicate names are allowed because the username suffix is generated automatically.
- A malformed barcode is rejected by the main process even if renderer interception fails.
- If central synchronization fails after local creation, registration returns an error and must not silently report success. The implementation should keep behavior consistent with the existing user/central synchronization model and avoid plaintext credential leakage.

## Testing

Regression coverage must prove:

- exactly 16 numeric digits are classified as user labels;
- other values remain lot codes;
- username normalization and collision suffixing (`joao.da.silva`, `joao.da.silva2`);
- only the three operational profiles are accepted;
- Admin/Master roles cannot be created through this flow;
- bcrypt remains the password persistence path;
- scanner interception happens before the lot flow;
- the renderer displays the generated username and permanent password wording;
- barcode auto-login is not introduced;
- central synchronization receives the created local user profile.
