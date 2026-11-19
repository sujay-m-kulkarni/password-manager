# Build pipeline

The file `.github/workflows/android.yml` runs on GitHub Actions. It works the same way as Money Trail's.

| When | What runs | Result |
|---|---|---|
| Every pull request | Type check, lint, security logic tests, version-rule tests, Android debug build | A green or red check on the PR. The debug APK is kept for 14 days under the run's "Artifacts". |
| Every merge to `main` | All of the above, then a signed release build and a **network-permission check** | A GitHub Release such as **Vault 0.2.0**, tagged `v0.2.0`, with the APK attached and marked Latest. |
| A tag such as `v1.0.0` is pushed, or "Run workflow" is pressed with **release** ticked | The same as a merge to `main` | A pushed tag is used as it is; a manual run counts as a fix. |

**APK size.** Release APKs include native code for phone processors only, 64- and 32-bit ARM (about 60 MB). The
x86 copies for emulators are left out; the phone installs only its own copy, about 40 MB.

**The offline check.** After the release build, the pipeline lists the APK's permissions and fails if it asks for
`INTERNET`, `ACCESS_NETWORK_STATE` or `ACCESS_WIFI_STATE`. A release that could reach the network is never published.

**Version numbers come from the PR's label.** When a PR is merged, the pipeline takes the latest version tag and raises it:

| Label on the merged PR | Example |
|---|---|
| `release: major` | 0.2.0 → 1.0.0 |
| `release: minor` | 0.2.0 → 0.3.0 |
| none (a fix) | 0.2.0 → 0.2.1 |

With no version tag yet, it counts on from `app/package.json` (0.1.0). The rules are in `app/scripts/next-version.mjs`.
Only the newest 10 fix releases are kept; major and minor releases are kept for good.

**Merges queue, they don't cancel.** A new push to a PR branch cancels that branch's running build, but builds on
`main` wait for the one before to finish (each one publishes a release). Before 1.9.0 a second merge cancelled the first
merge's release, so its version number went to the next merge instead. GitHub keeps one waiting build per branch: merge
PRs one at a time, a few minutes apart, and if a release is ever missing, run the workflow on `main` with **release** ticked.

**Version codes.** Pipeline builds use 1,000,000 plus the run number, which only ever goes up, so each merge installs
over the last. Builds made on a laptop use the plain version (0.1.0 is 100), always below any pipeline build.

The debug APK from a pull request is signed with the React Native debug key. It is for checking that the code
builds, not for keeping your passwords in: it includes the internet permission for the Metro dev server.

## One-time setup

### 1. Create the two labels

In GitHub: Issues › Labels › New label. Create `release: major` and `release: minor`.

### 2. Create the signing key

Every release must be signed with the same key, or Android will refuse to install it over the previous one —
and for this app, **uninstalling deletes the vault**. Create the key once, on your own computer.

```
& "C:\Users\kulka\.jdks\jbr-21.0.11\bin\keytool.exe" -genkeypair -v -keystore vault.jks -alias vault -keyalg RSA -keysize 2048 -validity 10000
[Convert]::ToBase64String([IO.File]::ReadAllBytes("vault.jks")) | Set-Clipboard
```

Use a different key from Money Trail's.

### 3. Add four repository secrets

Settings › Secrets and variables › Actions › New repository secret:

| Secret | Value |
|---|---|
| `PM_KEYSTORE_BASE64` | Paste from the clipboard (step 2) |
| `PM_KEYSTORE_PASSWORD` | The keystore password |
| `PM_KEY_ALIAS` | `vault` |
| `PM_KEY_PASSWORD` | The key password (the same as the keystore password unless you chose another) |

Keep `vault.jks` and its password outside the repository. **If the key is lost, no future build can update the
installed app**, and since there is no cloud copy you would need an encrypted export to move your passwords
(Settings › Export backup). Never commit the file — `*.jks` is in `.gitignore`.

Until the secrets exist, a merge to `main` skips the release with a warning instead of failing.

Before the 15-minute release build starts, the pipeline opens the key file and checks the alias. A wrong
`PM_KEYSTORE_BASE64` or `PM_KEYSTORE_PASSWORD` stops it within seconds with a clear message. If `PM_KEY_ALIAS`
doesn't match the key in the file (a typo, a capital letter, a space), it uses the file's only key and warns,
naming the alias to put in the secret. To see the alias yourself:
`& "C:\Users\kulka\.jdks\jbr-21.0.11\bin\keytool.exe" -list -keystore C:\Users\kulka\keys\vault.jks`.

## Installing on the phone

1. When the run finishes, open the repository's Releases page in the phone's browser.
2. Download `vault-x.y.z.apk` and tap it. Android asks once to allow installs from the browser.
3. For later versions, install over the existing app. **Do not uninstall first** — that deletes the vault.
