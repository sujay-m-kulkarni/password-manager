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
4. **Entry detail** — read-only first; header in the type colour, show/hide/copy, the entry's named fields with Copy (Hidden ones as dots until Show), a Cards section (each card: Debit/Credit · network, number masked as •••• 1234 and the card PIN hidden until Show, expiry, name on card), Edit turns the same screen into the form with Save / Cancel, strength bar, website, notes, edit, favourite, delete. Each named PIN shows large, spaced digits (482 913) once shown; no strength bar for PINs.
5. **Add/Edit form** (design H4) — used for a new entry and in place when editing: a **Type** choice, Title, then tabs **Login · PINs · Cards** (Cards for Banking) with a tick/count per filled part. Login: username, password with a strength bar, website, then the entry's named fields — the type's starting fields plus any added with "+ Add field" (name with suggestions CIF, Branch, MMID, UID (Aadhaar), CKYC no, Profile password…; Text, Number or Hidden; × removes one; empty fields are not saved). PINs: any number of named PINs (suggested names UPI PIN, ATM PIN, MPIN, TPIN, Phone lock, SIM PIN), each Numbers (number pad, 4–12) or Letters & numbers (4–16). Cards: Scan a card (camera, either side; Done for a side without the number; then "Scan the other side" fills only what is missing; no photo kept, CVV never read) / + Debit card / + Credit card (number with network detection and a typo check, expiry MM/YY, card PIN 4–6 digits, name on card, Bank / issuer — filled by a scan and shown in the card's title on the entry page; no CVV; after a scan a "What the scanner read" link shows the OCR text with numbers masked; the scanner takes its time and closes itself: after the number is confirmed (or, with no number on that side, an expiry is read) it keeps reading for at least 2 s and until no new text for 1.5 s, at most 6 s; Done stops early). An entry needs a title and at least one of password, PIN or card; then favourite, notes.
7. **Settings tab** — backup card (copy on Google Drive: age, Save to Google Drive when Vault can't update it daily), unlock with fingerprint (+ phone screen lock), Entries › Entry types and their fields, auto-lock, clipboard timer, change master password, recovery key, unlock time, daily backup (time, phone folder, Drive file, last/next run, Back up now · Change folder · Save to Drive again), export/restore, How to use Vault, About & what's new, lock now.
   - **Entry types**: each type with its field count → that type's starting fields: name, Text / Number / Hidden, ↑ ↓ to reorder, Remove, + Add field, Save, Reset to default.
   - **About & what's new**: the installed version, a short description, and every release's changes (from docs/CHANGELOG.md, generated into the app by `npm run changelog`), the installed one open.
8. **Setup** is three steps: master password → recovery key (shown once, "I've written it down") → fingerprint. "New phone? Restore from a backup" starts from a backup file instead.
9. **Backup setup (1.9.0, required)** — after unlocking, until done, the only screen: "Set up your backup", a "Why Vault insists on this" panel (offline means a lost phone loses everything; the Drive copy restores it; it's encrypted and Vault still never goes online), then three step cards with ticks: 1 a folder on this phone (last 7 daily copies), 2 Save to Google Drive (Android's Save screen; a file saved on the phone itself is refused with a warning; says whether Vault can update it daily), 3 daily time (7 am · 1 pm · 9 pm default · 11 pm). "Done: open Vault" is enabled once 1 and 2 are done; How to use Vault and Lock stay available. The same screen in "Save a fresh backup" form appears when a hand-saved Drive copy is 30+ days behind changes; at 7+ days the Vault list shows a "Save" reminder.
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

## Anchor refresh (1.10.0, design I)

The app is renamed **Anchor** (package id unchanged, so it updates over Vault). Name and accent live in `app/src/brand.ts`; the
launcher label in `res/values/strings.xml`; the icon is a brass anchor on deep ink (`res/drawable/ic_launcher_foreground.xml`,
also the themed icon; PNG mipmaps for Android 7). Palette: ground #17181F, surfaces #22232F / #2C2D3B, accent brass #E2B866
with #1D1E2A on it. Screens follow canvas section I: Unlock (mark, Touch to unlock circle, last backup line), Home (name +
totals, backup strip, search with icon, type chips with icons, Favourites and Recently used tiles, rows grouped by type in one
card with an icon copy button, "Add" button), Entry (header with type · edited time, grouped Login/PINs/Cards sections, card face),
Settings (Daily backup card with both places, time and Back up now). The entry page keeps all parts on one scrolling page instead of
the design's tabs: read-only details are quicker to scan without switching tabs. "Recently used" = entries opened or copied from,
stored as `entries.used_at` (migration v6), which never changes `updated_at`.

## Family Kit, part 1 (1.11.0)

A third bottom tab, **Family** (people icon), between Anchor and Settings. It shows "Family Kit", a one-paragraph lead, a
progress card ("9 of 13 done", bar, % in the accent; Not needed items are left out of the count) and the 13 checklist items as
one grouped list: icon (a green tick when Done), title, one line (the entries' titles when Done, else why it matters) and a
status pill (Done green, To do amber, Not needed grey). Tapping expands it: why, its entries (tap to open), Add / Add another
(opens a new entry of the right type; Cards opens Banking on its Cards tab) and Not needed / Needed after all. A dark note at the
end says family access comes next. In the entry form, types without a login (all Family Kit types) call the first tab **Details**
and show "+ Add a login" instead of username/password; "Where the original is kept" sits under the tabs, then **Nominees**
(name, relationship, share %) for types where money or property passes on. The entry page shows both under **For your family**.
Scanned copies are shelved (decided 20 Nov 2026): numbers trace most records, and "Where the original is kept" covers papers.
