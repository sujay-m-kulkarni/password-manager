# Vault changelog

What's new in each release, newest first. The GitHub release notes are made from the "What's new" section of the
merged pull request (`app/scripts/release-notes.mjs`); this file keeps the whole history in one place and is updated
in every PR.

## 1.3.0

- New softer, dark look ("Dusk"): charcoal background, lavender buttons, pastel folder colours and rounder shapes.
- No white flash when the app opens.
- A PIN can now be Numbers (4–12 digits, number pad) or Letters & numbers (4–16, for app passcodes).

## 1.2.0

- Manage folders: add, rename, recolour and delete them (Settings › Folders). Entries in a deleted folder are kept, without a folder.
- Change an entry between Login and PIN when editing it.
- The app version is shown at the bottom of Settings.
- Unlocking is tuned to your phone's speed when you set or change the master password, and Settings shows how long it takes.
- Sharper icons throughout the app.
- Release notes now list what's new in every version.

## 1.1.1

- After saving an entry, Vault goes back to the list of entries instead of the entry's page.

## 1.1.0

- New app icon: a shield with a keyhole.
- "How to use Vault" guide, readable before unlocking (setup and unlock screens) and from Settings.

## 1.0.4

- Encrypted backups: export to Google Drive or anywhere, restore in Settings or on a new phone.
- Recovery key, shown once at setup, to get back in if you forget the master password.
- Unlock with fingerprint, optionally also the phone's screen lock; the master password is asked weekly.
- Change the master password in Settings.
- Backup reminder on the vault screen and in Settings.

## 1.0.3

- Fixed: the app closed right after creating the master password.

## 1.0.2

- If Vault closes unexpectedly, the next launch shows a report you can share.

## 1.0.1

- PIN entries for phone lock, SIM, ATM and UPI PINs, with a PINs filter.
- Smaller download: about 60 MB instead of 125 MB.

## 1.0.0

- First release: encrypted offline vault with master password, auto-lock and lockout after wrong attempts.
- Passwords with folders, favourites and search; copy with automatic clipboard clearing.
- Password generator and strength meter.
