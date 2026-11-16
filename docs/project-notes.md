# Offline Password Manager (Android) — Development Kickoff

_Revision 2 — 1 Nov 2026: key design moved to a wrapped-key hierarchy with Argon2id in v1, security caveats corrected, UI direction (Option D) chosen._

## 1. Overview

A personal mobile app that stores multiple passwords securely on the user's phone. The app is **fully offline**: it never connects to the outside world.

## 2. Decisions made

| Area | Decision |
|---|---|
| Platform | **Android only** |
| Framework | **React Native** (bare CLI, not Expo managed) |
| Language | **TypeScript** (strict mode) |
| Storage | **SQLite**, encrypted with **SQLCipher** (plain SQLite is not encrypted and must not be used for the vault) |
| Connectivity | **None.** No sync, no cloud, no telemetry |
| Autofill | **Not required.** Workflow is unlock, copy, paste |
| Key design | **Wrapped-key hierarchy from v1** (random data key; Argon2id-derived wrapping key) — see §4.2 |
| UI | **Option D — "Full set, colourful"** — see §4.7 |

## 3. Scope

### 3.1 Must-have features

**Security**

1. Master password that unlocks the vault. It is never stored; a wrapping key is derived from it with Argon2id.
2. Whole-vault encryption at rest (AES-256 via SQLCipher).
3. Auto-lock on app background, screen off, and inactivity timeout.
4. Clipboard auto-clear after copying (15–30 seconds).
5. Screenshot and recent-apps preview blocking on sensitive screens.
6. Zero network access: no internet permission, no analytics, no crash-reporting SDKs.
7. No OS cloud backup of the vault.
8. Failed-attempt lockout with increasing delays (a deterrent only — see §6).
9. Minimum master password strength enforced at setup (≥12 characters or a 4-word passphrase).

**Vault function**

10. Add, view, edit, and delete entries (title, username, password, URL, notes).
11. Show/hide and copy for username and password.
12. Search.
13. Folders or categories.
14. Password generator with configurable length and character types.
15. PIN entries (phone lock, SIM, ATM/card, UPI): 4–12 digits, number keypad, no username or website. Stored like passwords, in the encrypted vault (`entries.kind = 'pin'`, schema v2).

**Data safety**

16. Encrypted export and import. This is the only backup mechanism.
17. Master password change (re-wraps the data key; no full re-encryption needed).

### 3.2 Should-haves (include in v1 if feasible)

- Biometric unlock (master password remains the fallback)
- Password strength indicator
- Favorites
- Recovery key generated at setup
- Backup reminders

### 3.3 Deferred to later versions

- TOTP/2FA code storage
- Password history per entry
- Reuse and weak-password audit
- Secure notes, cards, and attachments
- Password expiry reminders
- Dark mode, widgets, custom fields

### 3.4 Explicitly out of scope

- Autofill into other apps
- Sync, browser extension, cloud backup
- Breach checking (requires internet)
- Favicon fetching
- iOS

## 4. Recommended technical approach

### 4.1 Stack

| Concern | Recommendation |
|---|---|
| Encrypted DB | `op-sqlite` with SQLCipher enabled |
| Keystore and biometrics | `react-native-keychain` |
| Secure random | `react-native-quick-crypto` (never `Math.random()`) |
| Key derivation | **Argon2id from v1** via a vetted native binding (e.g. `react-native-argon2`). Fallback if no binding passes review: PBKDF2-SHA512 (≥600k iterations) via quick-crypto |
| Key wrapping | AES-256-GCM via quick-crypto |
| Navigation | React Navigation |
| State | Zustand |
| Clipboard | `@react-native-clipboard/clipboard` plus a custom clear timer |

Library maintenance status changes quickly. Verify each package's recent releases and open issues before adopting it. **Pin exact versions, commit the lockfile, and keep the dependency list minimal**: every package runs next to the vault.

### 4.2 Key design (v1) — wrapped-key hierarchy

```
                ┌──────────────────────────────┐
                │  Data key (DEK)              │  random 256-bit, created at setup
                │  → SQLCipher raw key         │  PRAGMA key = "x'<hex>'"
                └──────────────┬───────────────┘
           wrapped (AES-GCM) three ways, stored in vault.header.json
     ┌──────────────────┼────────────────────────┐
     ▼                  ▼                        ▼
 Password wrap      Biometric copy           Recovery wrap
 KEK = Argon2id(    DEK in Keystore via      KEK = Argon2id(
 master pw, salt)   react-native-keychain,   recovery key, salt2)
                    BIOMETRY_CURRENT_SET
```

- The DEK opens SQLCipher as a **raw key**, so SQLCipher's own KDF is skipped; Argon2id does the slow work.
- Argon2id parameters: tune to ~0.5–1 s on a low-end phone (start at 64 MiB memory, 3 iterations, parallelism 1). Salt and parameters are stored in plaintext in `vault.header.json` — they are not secret.
- **"Master password never stored" stays literally true:** biometrics stores the DEK, never the password.
- `BIOMETRY_CURRENT_SET` means enrolling a new fingerprint invalidates the biometric copy. The app then falls back to the master password and offers to re-enable biometrics.
- **Changing the master password re-wraps the DEK only.** No database re-encryption.

### 4.3 Proposed schema

```sql
CREATE TABLE folders (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE entries (
  id         INTEGER PRIMARY KEY,
  folder_id  INTEGER REFERENCES folders(id),
  title      TEXT NOT NULL,
  username   TEXT,
  password   TEXT NOT NULL,
  url        TEXT,
  notes      TEXT,
  favorite   INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

`folders.color` supports the colour-coded folders in Option D. Because SQLCipher encrypts the whole file, per-column encryption is not needed. Later-version tables can be added through migrations.

### 4.4 Android hardening checklist

1. **Remove `INTERNET` explicitly from the release manifest.** Libraries can re-add it through manifest merging, so declare it with `tools:node="remove"` in `android/app/src/release/AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
   ```
   Keep it only in the debug manifest for Metro.
2. Set `android:allowBackup="false"` and add data-extraction rules excluding the database.
3. Add `FLAG_SECURE` in `MainActivity` to block screenshots and the recents preview.
4. Mark copied clipboard content as sensitive on Android 13+ (`ClipDescription.EXTRA_IS_SENSITIVE`); this needs a small native module.
5. Enable R8/ProGuard for release builds and use Hermes.
6. No analytics, crash reporters, or Flipper in release builds.
7. **Release checklist step:** `aapt dump permissions app-release.apk` must not list `INTERNET`.

### 4.5 How the must-haves map to implementation

| Must-have | Implementation |
|---|---|
| Vault encryption | op-sqlite + SQLCipher, opened with the DEK as a raw key |
| Auto-lock | `AppState` listener plus inactivity timer; locking closes the DB handle and wipes the DEK from memory |
| Clipboard auto-clear | Timer, plus clear on lock and on app background (JS timers are unreliable in the background) |
| Screenshot blocking | `FLAG_SECURE` |
| Failed-attempt lockout | Attempt count and next-allowed time in Keychain. **Survives app restarts, not "Clear data"/reinstall** (Android wipes the app's Keystore entries) — a deterrent, not a vault protection |
| Encrypted export/import | Export the encrypted `.db` plus `vault.header.json` as one file. Import verifies the password (or recovery key) before replacing |
| Generator | Secure random with configurable character sets |
| Biometrics | `react-native-keychain` storing the DEK with `BIOMETRY_CURRENT_SET` |
| Master password change | Re-derive KEK, re-wrap DEK, rewrite header |

### 4.6 Proposed project structure

```
src/
  db/          // openDatabase(), migrations, queries
  security/    // key hierarchy, lock manager, keychain/biometric helpers, KDF, clipboard clear
  features/
    vault/     // entry list, entry detail, add/edit
    generator/ // password generator + strength meter
    settings/  // auto-lock timeout, export/import, change master password
    auth/      // setup, unlock screen, lockout logic
  navigation/
  store/
  theme/       // Option D colours, type, spacing
  utils/
android/       // manifest, MainActivity (FLAG_SECURE)
```

### 4.7 UI direction — Option D "Full set, colourful"

Six screens, one consistent style (font: Plus Jakarta Sans; primary violet `#5B3DF5`; background `#F7F5FF`; ink `#1B1530`):

1. **Setup** — master password, strength meter, recovery-key heads-up.
2. **Unlock** — violet hero with fingerprint button, master password fallback, lockout message.
3. **Vault** — search, colour-coded folder chips, favourite tiles, list with copy buttons, clipboard countdown toast, add button, bottom tabs (Vault / Generator / Settings).
4. **Entry detail** — header in the folder's colour, show/hide/copy, strength bar, website, notes, edit, favourite, delete.
5. **Add/Edit + generator** — form with a generator bottom sheet (length slider, character-set toggles).
6. **Settings** — backup reminder card, security rows (fingerprint, auto-lock, clipboard timer, change password), export/import, recovery key.

Folder colours: Banking blue `#2563EB`, Work orange `#C2410C`, Email pink `#DB2777`, Social green `#15803D`.

## 5. Suggested build order

1. **Setup:** bare React Native + TypeScript, manifest hardening, `FLAG_SECURE`.
2. **Database layer:** key hierarchy, SQLCipher opening with the DEK, schema, migrations.
3. **Auth flow:** master password creation, unlock screen, auto-lock, lockout.
4. **Vault CRUD:** list, search, folders, add/edit/delete, copy with auto-clear.
5. **Generator and strength meter.**
6. **Export/import and backup reminders.**
7. **Biometrics, recovery key, master password change.**

### 5.1 As built (1.1.0): keys, fingerprint and backups

- **Data key in memory while unlocked** (session store), wiped on lock, so Settings can turn on fingerprint, make a recovery key or export without re-asking for the password.
- **Recovery key:** 15 random bytes as 24 Crockford base32 characters (`XXXX-XXXX-…`, no I/L/O/U); light Argon2id (8 MiB, 1 pass) since it is already high-entropy. Made at setup and from Settings (after confirming the master password). A new one replaces the old for the vault; backups keep the wrap they were made with.
- **Fingerprint:** a copy of the data key in react-native-keychain's Keystore-backed AES-GCM storage, access control `BIOMETRY_CURRENT_SET` (or `BIOMETRY_ANY_OR_DEVICE_PASSCODE` when the phone's screen lock is allowed). The master password is asked if it hasn't been typed for 7 days. If Android drops the key (screen lock removed), unlocking falls back to the password and Settings offers to turn it on again.
- **Backup file (`.vaultbackup`, JSON):** the header's password and recovery wraps of the data key, plus folders and entries as JSON under AES-256-GCM with `HMAC-SHA256(DEK, "vault-backup-data:v1")`. It opens with the master password it was made with or the recovery key. Restore in Settings replaces the entries (the vault keeps its own key); restore at Setup adopts the backup's key, password and recovery key.
- **Files** go through Android's file picker (Storage Access Framework, `VaultFilesModule.kt`): no storage permission, and auto-lock is paused while the picker is open.
- **Backup reminder** when there are entries and no backup, or changes since a backup more than 30 days old.

## 6. Risks and rules

- **No cloud means no recovery.** If the phone is lost or both the master password and recovery key are forgotten, the passwords are gone. Mitigate with regular encrypted exports stored off the phone and a recovery key.
- **The lockout is a speed bump, not a vault protection.** Anyone who copies `vault.db` can attack it offline. The real defences are Argon2id cost and a strong master password. **Do not add "wipe after N attempts"** — with no cloud backup it is more likely to destroy the owner's data than stop an attacker.
- **Old exports keep the old password.** After a master password change, earlier exports still open with the previous password. Because every export also contains the recovery-key wrap, the recovery key opens any export. After a password change, warn the user and offer a fresh export. Put the date in export file names.
- **Do not write custom cryptography.** Use vetted libraries and platform APIs only.
- **Dependency risk.** JavaScript supply-chain attacks are real. Review each package, pin versions, and avoid packages that cannot be justified.
- **Verify the offline claim.** Inspect the merged release manifest and the final APK (§4.4), and test with a network monitor running.

## 7. Open questions for the team

- Which of the should-haves ship in v1? (Option D's design assumes all of them.)
- ~~Is SQLCipher's built-in KDF acceptable for v1, or should Argon2id be used from the start?~~ **Decided: Argon2id from v1**, with PBKDF2 fallback only if no binding passes review.
- Is the app for personal use only, or will it be distributed? Public release would require a security review and a privacy policy.
- How will release builds be distributed (sideloaded APK or Play Store)?
