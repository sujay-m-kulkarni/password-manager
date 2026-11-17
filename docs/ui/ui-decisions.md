# UI decisions

**Current direction: Option G — "Dusk Soft Dark"** (chosen 17 Nov 2026 from the softer options E–G; ships in 1.3.0).
It keeps Option D's screens and layout and changes the look: soft charcoal ground, pale lavender accent with dark
text on it, muted pastel folder colours on dark tints, rounder pill-shaped buttons and fields.

Earlier: Option D — "Full set, colourful" (chosen 1 Nov 2026 from options A–D; used up to 1.2.x).

The mockups live on the design canvas "Password Manager UI Options" in Claude (G-Unlock, G-Vault, G-Settings).

## Visual style

| Token | Value |
|---|---|
| Font | Plus Jakarta Sans (400, 600, 700, 800), bundled in `app/android/app/src/main/assets/fonts` (the mockup used Nunito; kept the bundled font) |
| Accent | `#A99CF0` lavender, text on it `#1E1F2B` |
| Background · card · raised | `#1E1F2B` · `#272938` · `#33354A` |
| Text · muted | `#E9E8F2` · `#A9A8BC` |
| Folder colours (pastel on tint) | blue `#A9C0E8`/`#2A3348` · orange `#EBB896`/`#3A2C24` · pink `#E8B3CB`/`#3A2A35` · green `#A8D4B5`/`#26362C` · sky `#9FD0E6`/`#233540` · violet `#C9C0F7`/`#33354A` |

Every text colour has at least 5:1 contrast on the background it sits on.

Each entry type keeps its colour everywhere: chips, list icons, favourite tiles and the entry header (Banking blue, Investments green, Social media pink, Email orange, Other violet, PINs amber). Types replaced folders in 1.5.0.
All colours live in `app/src/theme.ts`.

## Screens

1. **Setup** — master password, strength meter, rule: 12+ characters or 4+ words.
2. **Unlock** — fingerprint circle on the dark ground, master password, lockout message. (Fingerprint button arrives with build step 7.)
3. **Vault** — search, chips (All · Banking · Investments · Social media · Email · Other · **PINs**), list rows show the username and, for Banking, the number of cards, favourite tiles, list with Copy (PIN entries carry an amber PIN tag), clipboard countdown toast, + button (opens a PIN form when the PINs chip is on).
4. **Entry detail** — read-only first; header in the type colour, show/hide/copy, type fields (account number, IFSC, customer ID / client ID, demat ID) with Copy, a Cards section (each card: Debit/Credit · network, number masked as •••• 1234 and the card PIN hidden until Show, expiry, name on card), Edit turns the same screen into the form with Save / Cancel, strength bar, website, notes, edit, favourite, delete. Each named PIN shows large, spaced digits (482 913) once shown; no strength bar for PINs.
5. **Add/Edit form** (design H4) — used for a new entry and in place when editing: a **Type** choice, Title, then tabs **Login · PINs · Cards** (Cards for Banking) with a tick/count per filled part. Login: username, password with a strength bar, website, type fields. PINs: any number of named PINs (suggested names UPI PIN, ATM PIN, MPIN, TPIN, Phone lock, SIM PIN), each Numbers (number pad, 4–12) or Letters & numbers (4–16). Cards: + Debit card / + Credit card (number with network detection and a typo check, expiry MM/YY, card PIN 4–6 digits, name on card; no CVV). An entry needs a title and at least one of password, PIN or card; then favourite, notes.
7. **Settings tab** — backup card (last backup, Export), unlock with fingerprint (+ phone screen lock), auto-lock, clipboard timer, change master password, recovery key, export/restore, lock now.
8. **Setup** is three steps: master password → recovery key (shown once, "I've written it down") → fingerprint. "New phone? Restore from a backup" starts from a backup file instead.
9. **Unlock** offers the fingerprint straight away (the circle in the hero is the fingerprint button), the master password weekly, and "Forgot password? Use recovery key", followed by setting a new master password.

Bottom tabs: Vault · Settings (the password generator was removed in 1.6.0).

## Deliberate differences from the mockups

- Icons are simple vector line drawings (`react-native-svg`, since 1.2.0) rather than an icon font or package.
- Nothing secret is shown in an Android dialog (`<Modal>`): a dialog window doesn't inherit the screenshot block
  (`FLAG_SECURE`), so overlays are drawn inside the screen.

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
