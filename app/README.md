# Vault app — offline password manager (Android)

Build steps 1–4 from the kickoff doc ([docs/project-notes.md](../docs/project-notes.md)), styled as UI Option D.

| Step | What's in this drop |
|---|---|
| 1. Setup & hardening | Bare RN 0.88 + TypeScript strict · no `INTERNET` in release (stripped with `tools:node="remove"`) · `allowBackup=false` + data-extraction rules · `FLAG_SECURE` · R8 on · Hermes |
| 2. Database | op-sqlite with **SQLCipher** · wrapped-key hierarchy: random 256-bit data key opens the DB as a raw key; Argon2id (64 MiB, 3 passes) derives the key that wraps it · schema + migrations via `user_version` |
| 3. Auth | Setup with strength rule (12+ chars or 4+ words) · unlock · lockout (3 free tries, then 30 s doubling to 15 min) · auto-lock on background and after inactivity (30 s / 1 min / 5 min) |
| 4. Vault | List, search, colour-coded folders, favourites, add / edit / delete, show/hide, copy with auto-clear (15 / 30 s) and a countdown toast |

Not in this drop (steps 5–7): password generator, export/import, backup reminders, biometrics, recovery key, master password change. The key design already leaves room for the recovery and biometric wraps.

## Run it

Prerequisites: Node 22.11+, JDK 17, Android Studio with SDK 36 and an emulator or a phone with USB debugging.

```sh
npm ci                 # installs the exact versions in package-lock.json
npm test               # 6 logic tests (key wrapping, lockout, password rule)
npm start              # Metro, in one terminal
npm run android        # debug build, in another
```

Release APK:

```sh
cd android && ./gradlew assembleRelease
# Verify the offline guarantee on the final APK — must NOT list INTERNET:
$ANDROID_HOME/build-tools/<version>/aapt dump permissions app/build/outputs/apk/release/app-release.apk
```

Phone installs come from the pipeline's signed releases — see [docs/guides/build-pipeline.md](../docs/guides/build-pipeline.md). A laptop release build without the signing secrets falls back to the debug key, for testing only.

## Where things are

```
App.tsx                         navigation: Setup → Unlock → Vault / Entry / Edit / Settings
src/security/crypto.ts          Argon2id, AES-256-GCM wrap/unwrap, CSPRNG (react-native-quick-crypto)
src/security/keyHierarchy.ts    create vault, unlock, header (salt, KDF params, wrapped key)
src/security/lockout.ts         failed-attempt delays, stored in Keychain
src/security/AutoLock.tsx       background + inactivity lock
src/security/clipboard.ts       copy + auto-clear (JS side)
src/db/database.ts              SQLCipher open, migrations, queries
src/features/…                  screens
src/theme.ts                    Option D colours, fonts, folder palette
android/app/src/release/AndroidManifest.xml    strips INTERNET
android/app/src/main/java/com/vaultapp/MainActivity.kt   FLAG_SECURE
android/app/src/main/java/com/vaultapp/secureclipboard/  native clipboard module
```

## Design decisions worth knowing

- **Clipboard clearing runs natively.** Clearing on app background (as the original doc said) would wipe the password the moment you switch apps to paste it. The vault still locks on background, but the clipboard is cleared by a native timer that keeps running, and only if it still holds our clip. Pressing **Lock** clears it immediately.
- **Two files on disk:** `vault.sqlite` (SQLCipher-encrypted) and `vault_meta.sqlite` (plaintext; holds only the salt, KDF parameters and the wrapped data key — nothing secret).
- **No third-party clipboard package and no icon/SVG library** — fewer packages running next to the vault. Icons are text for now.
- **Wrong password detection** is the AES-GCM tag check on the wrapped key, so a wrong guess never touches the database.
- **Lockout limits** (also in `lockout.ts`): it survives restarts but not "Clear data" or a reinstall. It's a deterrent; the real protection is Argon2id cost plus a strong master password.

## Before you rely on it

1. **Tune Argon2id** on your slowest phone: unlocking should take 0.5–1 s. Adjust `DEFAULT_KDF` in `src/security/crypto.ts`. Changing it only affects vaults created afterwards.
2. **Test on a device:** create a vault, add entries, kill the app, reopen, unlock. Then confirm that a wrong password shows the lockout after 3 tries, that the app locks when you switch away, and that screenshots are blocked.
3. **Check the network:** run the release build with a network monitor (or airplane mode off and `adb shell dumpsys netstats`) to confirm zero traffic.
4. **Review dependencies:** `react-native-keychain@10.0.0` was last published in March 2025 — check its open issues before you depend on it for biometrics in step 7.

## Known limits

- JS strings can't be wiped from memory. The data key is held in a Buffer and zeroed after use, but the hex key string passed to SQLCipher and decrypted passwords shown on screen live until garbage collection.
- The Android 13+ "sensitive" clipboard flag hides the preview; older Android versions show it.
