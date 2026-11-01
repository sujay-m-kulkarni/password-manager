# Vault — offline password manager for Android

A personal password manager that keeps everything encrypted on the phone and **never connects to the internet**:
the release APK has no network permission, and the build pipeline refuses to publish one that does.

- **App:** React Native + TypeScript in [`app/`](app/) — see [app/README.md](app/README.md)
- **Docs:** [`docs/`](docs/) — start with [docs/project-notes.md](docs/project-notes.md)
- **Install:** download the latest APK from this repository's Releases page — see [docs/guides/build-pipeline.md](docs/guides/build-pipeline.md)

| Build step | Status |
|---|---|
| 1. Setup and Android hardening | Done |
| 2. Encrypted database and key hierarchy | Done |
| 3. Setup, unlock, auto-lock, lockout | Done |
| 4. Vault: list, search, folders, add/edit/delete, copy with auto-clear | Done |
| 5. Password generator and strength meter | In review |
| 6. Encrypted export/import, backup reminders | Next |
| 7. Biometrics, recovery key, master password change | Planned |
