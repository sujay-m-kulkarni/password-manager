# UI decisions

**Chosen direction: Option D — "Full set, colourful"** (chosen 1 Nov 2026 from options A–D).

The mockups live on the design canvas "Password Manager UI Options" in Claude; Option D's six screens are clickable there.

## Visual style

| Token | Value |
|---|---|
| Font | Plus Jakarta Sans (400, 600, 700, 800), bundled in `app/android/app/src/main/assets/fonts` |
| Primary | `#5B3DF5` violet |
| Background | `#F7F5FF` |
| Ink | `#1B1530` |
| Folder colours | Banking blue `#2563EB` · Work orange `#C2410C` · Email pink `#DB2777` · Social green `#15803D` |

Each folder keeps its colour everywhere: chips, list icons, favourite tiles and the entry header.
All colours live in `app/src/theme.ts`.

## Screens

1. **Setup** — master password, strength meter, rule: 12+ characters or 4+ words.
2. **Unlock** — violet hero, master password, lockout message. (Fingerprint button arrives with build step 7.)
3. **Vault** — search, chips (All · **PINs** · folders), favourite tiles, list with Copy (PIN entries carry an amber PIN tag), clipboard countdown toast, + button (opens a PIN form when the PINs chip is on).
4. **Entry detail** — header in the folder colour, show/hide/copy, strength bar, website, notes, edit, favourite, delete. A PIN shows large, spaced digits (482 913) and no strength bar.
5. **Add/Edit** — a **Login / PIN** choice when adding. Login: form with a Generate button that opens the generator as a bottom sheet. PIN: title, a digits-only field on the number keypad (4–12 digits, with a running count), folder, favourite, notes.
6. **Generator tab** — same generator, with Copy.
7. **Settings tab** — backup card (last backup, Export), unlock with fingerprint (+ phone screen lock), auto-lock, clipboard timer, change master password, recovery key, export/restore, lock now.
8. **Setup** is three steps: master password → recovery key (shown once, "I've written it down") → fingerprint. "New phone? Restore from a backup" starts from a backup file instead.
9. **Unlock** offers the fingerprint straight away (the circle in the hero is the fingerprint button), the master password weekly, and "Forgot password? Use recovery key", followed by setting a new master password.

Bottom tabs: Vault · Generator · Settings.

## Deliberate differences from the mockups

- Icons are text glyphs for now; no icon or SVG package, to keep dependencies running next to the vault to a minimum.
- The generator sheet is an in-screen overlay rather than an Android dialog, because a dialog window doesn't inherit
  the screenshot block (`FLAG_SECURE`).

## App icon

**Shield keyhole** (chosen 16 Nov 2026 from four options on the design canvas): a white shield on Vault violet
`#5B3DF5`, with the keyhole cut out so the background shows through. It's the same shield as the Vault tab.

- Android 8+: adaptive icon (`mipmap-anydpi-v26`), foreground `drawable/ic_launcher_foreground.xml` (vector, inside the
  66dp safe zone), background colour `ic_launcher_background`. The same vector is the Android 13+ themed (monochrome) icon.
- Android 7: PNGs in `mipmap-*dpi`, rendered from the same path.

## Guide

"How to use Vault" (Help screen) opens from the Setup and Unlock screens without unlocking, and from Settings. It covers
getting started, unlocking, saving passwords and PINs, copying, backups, what to do when something goes wrong, and
keeping the vault safe. It holds no vault data.
