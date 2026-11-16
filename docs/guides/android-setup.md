# Android: developer setup and APK files

How to build Vault on your laptop, run it on a phone while developing, and make APK files to install. Same setup as
Money Trail and Mantralaya Yatra, minus everything to do with a server: Vault is **fully offline**, so there is no API,
no API key, no sync and nothing to point a build at. Commands are for **PowerShell**, from the `app` folder, one line at
a time.

## Which APK for what

| APK | How | Signed with | Use it for |
|---|---|---|---|
| Run on a connected phone | `npm start`, then `npm run android:run` | This laptop's debug key | Developing: edits reload on the phone as you save |
| Test APK file | `npm run android:apk` | This laptop's debug key | Trying a build on your phone without a cable. **No real passwords** |
| Release APK from GitHub | Merge a PR to `main` | The Vault key | **Your everyday app.** Each release installs over the last |
| Release APK from this laptop | `.\scripts\release-apk.ps1` | The Vault key | A signed build when GitHub is not an option |

The test APK and both release APKs are the same release build: the app's code is inside, no Metro is needed, and the
internet permission is removed. Only the key differs. They contain native code for phone processors only (64- and
32-bit ARM, which covers every Android phone), about 60 MB; an emulator needs the debug build instead. The "run on a connected phone" build is a debug build: it has
the internet permission and loads its code from Metro on the laptop.

**Keys and uninstalling.** Android only updates an app with one signed by the **same key**. A debug-key build and a
Vault-key build cannot replace each other; you have to uninstall one to install the other, and **uninstalling deletes
the vault**. There is no server copy to fall back on. So:

- Put real passwords only into a build signed with the Vault key.
- Before uninstalling, export an encrypted backup (Settings › Export backup) and keep it off the phone.

**Versions.** A laptop build is numbered from `package.json` (0.1.0 is version code 100); pipeline builds are
1,000,000 and up. A pipeline release therefore installs over a laptop release build, but a laptop build cannot be
installed over a newer pipeline release.

## One-time laptop setup

1. **Node.js 22**, as for Money Trail: `node --version` should print v22 or later.
2. **Android Studio**, which brings the Android SDK, the emulator and a JDK. In the SDK Manager also install, for
   this project: **Android API 37**, **Build-Tools 37.0.0**, **NDK 27.1.12297006** and **CMake** (tick *Show
   Package Details*). Android Studio offers the missing ones on the first sync.
3. Point command-line builds at the SDK and JDK, once per user (then open a new PowerShell window):
   ```powershell
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
   [Environment]::SetEnvironmentVariable('JAVA_HOME', "$env:USERPROFILE\.jdks\jbr-21.0.11", 'User')
   ```
   Check both folders exist first. Android Studio's own `C:\Program Files\Android\Android Studio\jbr` also works as
   `JAVA_HOME`; any JDK 17 or newer does.
4. Install the app's packages: `npm ci`.

The first Android build downloads Gradle 9.4.1 and the Android libraries, and compiles SQLCipher and the crypto
library for four CPU types: 10–15 minutes. Later builds take a minute or two.

If the Gradle download times out (`services.gradle.org`), your network is blocking it: try another network or the
phone's hotspot. If it keeps failing, place a verified `gradle-9.4.1-bin.zip` in
`%USERPROFILE%\.gradle\wrapper\dists\gradle-9.4.1-bin\arn2x92ynaizyzdaamcbpbhtj\` and sync again; Gradle unpacks it
from there without downloading. Don't change `distributionUrl` in the repository: the pipeline needs it as it is.

To halve build times while developing, build for your phone and the emulator only by setting
`reactNativeArchitectures=arm64-v8a,x86_64` in `android\gradle.properties`. Don't commit that change: release APKs
should run on every phone.

## Phone setup (only for running from the laptop over USB)

1. *Settings › About phone*: tap **Build number** seven times to unlock Developer options. On some phones it is
   under *Software information*.
2. *Settings › Developer options*: turn on **USB debugging**.
3. Connect by USB and accept **Allow USB debugging** on the phone. `adb devices` (in the SDK's `platform-tools`)
   should list it.

If Developer options will not cooperate, skip this: build `npm run android:apk` (or take a release from GitHub) and
install the APK file instead, below.

## Develop with live reload

Two PowerShell windows, both in `app`:

```powershell
npm start              # window 1: Metro, leave it running
npm run android:run    # window 2: builds, installs and opens the app on the phone or emulator
```

Saving a `.ts` or `.tsx` file in VS Code reloads the app on the phone. Kotlin, manifest or Gradle changes need
`npm run android:run` again.

**Android Studio instead of `android:run`:** open the `app\android` folder (not `app`), keep Metro running, pick the
phone or emulator and press **Run**. Build errors are easier to read there. On a phone over USB, run
`adb reverse tcp:8081 tcp:8081` once per connection first, or the app shows "Unable to load script".

## Make an APK file

```powershell
npm run android:apk
```

The APK lands in `app\apk\vault-0.1.0-test.apk` (the folder is git-ignored). Send it to the phone (USB copy, Google
Drive, or WhatsApp to yourself as a document) and open it there; Android asks once to allow installs from that app.

In Android Studio the same build is: *Build Variants* › `app` › **release**, then *Build › Build App Bundle(s) /
APK(s) › Build APK(s)*. It lands in `app\android\app\build\outputs\apk\release\`.

For a signed release APK on the laptop, the same as the pipeline's (the Vault key is made once, see
[build-pipeline.md](build-pipeline.md)):

```powershell
.\scripts\release-apk.ps1 -Keystore C:\Users\kulka\keys\vault.jks
```

It asks for the key's password, keeps it only for that build, and leaves `app\apk\vault-0.1.0-release.apk`. Add
`-Version 0.2.0` to stamp a version. If PowerShell refuses to run scripts: `Set-ExecutionPolicy -Scope Process Bypass`.

## Install releases from GitHub

Every merge to `main` publishes **Vault X.Y.Z** under the repository's *Releases*, after the pipeline has checked the
APK asks for no network permission. On the phone, open the release page in the browser, download the APK and open it.
Later releases install over it and keep the vault.

## Check before trusting a build

| Check | Expected |
|---|---|
| Screenshot inside the app | Black (`FLAG_SECURE`) |
| Switch to another app and back | Vault is locked |
| Copy a password, wait | Clipboard is empty after the countdown |
| Three wrong master passwords | "Try again in 30s" |
| Settings footer | "Offline build · no internet permission" |

## Debugging

| What | How |
|---|---|
| The app closed by itself | Open Vault again: from Android 11, a **"Vault closed unexpectedly last time"** screen shows the reason Android recorded (Java/JavaScript error with stack trace, or native crash with the readable part of the tombstone). Tap **Share report** and send it. No USB debugging needed |
| JavaScript logs and errors | Debug builds only: Metro's window, or press `j` in it to open the React Native DevTools |
| Native logs | Android Studio, **Logcat**, filter `package:com.vaultapp` |
| Kotlin breakpoints (the clipboard module) | Android Studio: open `app\android`, set a breakpoint in `SecureClipboardModule.kt`, press **Debug** |
| The database | Not viewable: `vault.sqlite` is SQLCipher-encrypted and Android Studio's Database Inspector cannot open it. That is the point |
| Release build crashes on start | Logcat; a missing R8 keep rule shows as `ClassNotFoundException`. Add it to `android\app\proguard-rules.pro` |
| Unlock takes several seconds | Argon2id is tuned too high for this phone: `DEFAULT_KDF` in `src\security\crypto.ts` (affects new vaults only) |
