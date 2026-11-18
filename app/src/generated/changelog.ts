// Generated from docs/CHANGELOG.md by scripts/changelog-to-app.mjs — do not edit by hand.
export type Release = { version: string; points: string[] };

export const CHANGELOG: Release[] = [
  {
    "version": "1.8.1",
    "points": [
      "Fixed: Scan a card closed the app instead of opening the camera.",
      "If scanning can't start on a phone, Vault now says so and you can type the details instead."
    ]
  },
  {
    "version": "1.8.0",
    "points": [
      "Scan a card: on the Cards tab, tap Scan a card and Vault reads the card number, expiry and name with the camera. Cards that print details on the back work too: scan one side, then tap Scan the other side for whatever is missing.",
      "Scanning happens on the phone: no photo is kept, nothing goes online, and the CVV is never read. Vault asks for the camera only the first time you scan."
    ]
  },
  {
    "version": "1.7.0",
    "points": [
      "Custom fields: add your own fields to any entry (CIF, Branch, MMID, UID, CKYC no…), each Text, Number or Hidden. Hidden fields stay as dots until you tap Show.",
      "Each type starts with a list of fields you can change in Settings › Entry types: rename, add, remove, reorder, or reset. Banking now starts with Account number, IFSC, Customer ID, CIF, Branch, Branch code, MMID, UID (Aadhaar, hidden) and CKYC no.",
      "Search also finds entries by their field values (never by hidden ones).",
      "New Settings › About & what's new: the version you have and what changed in each release."
    ]
  },
  {
    "version": "1.6.0",
    "points": [
      "Removed the password generator (the Generator tab and the Generate button). Type or paste passwords; the strength bar still shows how strong they are."
    ]
  },
  {
    "version": "1.5.0",
    "points": [
      "Entry types replace folders: Banking, Investments, Social media, Email and Other, each with its own filter chip and colour. Your folders were turned into the matching types.",
      "Banking entries hold the account number, IFSC and customer ID, plus the account’s debit and credit cards (number, expiry, name on card, card PIN; no CVV).",
      "Investments entries (Zerodha, Groww…) hold the client ID and demat ID.",
      "One entry holds a login, PINs and cards: the new and edit screens have tabs Login · PINs · Cards. Add several named PINs (UPI PIN, ATM PIN, MPIN…) to one entry; a phone lock is just a PIN with no password. Your PIN entries were kept, each as an entry with one PIN.",
      "An entry opens read-only; card numbers and PINs stay hidden until you tap Show. Edit turns the same screen into text boxes, with Save and Cancel."
    ]
  },
  {
    "version": "1.4.0",
    "points": [
      "Automatic backup: choose a folder once in Settings › Backup, and Vault saves an encrypted backup there whenever your entries change (newest 5 kept). The files stay even if Vault is uninstalled.",
      "Uninstalling now offers “Keep app data”: tick it and reinstalling Vault opens the same vault."
    ]
  },
  {
    "version": "1.3.2",
    "points": [
      "Fixed: Vault could close by itself a moment after opening (often during the fingerprint prompt), most often after updating from an older version."
    ]
  },
  {
    "version": "1.3.1",
    "points": [
      "If Vault closes unexpectedly, the next launch shows the report before anything else, and keeps showing it until you close it, so it can always be shared.",
      "An error on a screen now shows the report instead of closing the app.",
      "Crash reports now list the app's last steps (starting, unlocking, opening the vault, showing the list), to show where it stopped. They contain step names only, never vault contents."
    ]
  },
  {
    "version": "1.3.0",
    "points": [
      "New softer, dark look (\"Dusk\"): charcoal background, lavender buttons, pastel folder colours and rounder shapes.",
      "No white flash when the app opens.",
      "A PIN can now be Numbers (4–12 digits, number pad) or Letters & numbers (4–16, for app passcodes)."
    ]
  },
  {
    "version": "1.2.0",
    "points": [
      "Manage folders: add, rename, recolour and delete them (Settings › Folders). Entries in a deleted folder are kept, without a folder.",
      "Change an entry between Login and PIN when editing it.",
      "The app version is shown at the bottom of Settings.",
      "Unlocking is tuned to your phone's speed when you set or change the master password, and Settings shows how long it takes.",
      "Sharper icons throughout the app.",
      "Release notes now list what's new in every version."
    ]
  },
  {
    "version": "1.1.1",
    "points": [
      "After saving an entry, Vault goes back to the list of entries instead of the entry's page."
    ]
  },
  {
    "version": "1.1.0",
    "points": [
      "New app icon: a shield with a keyhole.",
      "\"How to use Vault\" guide, readable before unlocking (setup and unlock screens) and from Settings."
    ]
  },
  {
    "version": "1.0.4",
    "points": [
      "Encrypted backups: export to Google Drive or anywhere, restore in Settings or on a new phone.",
      "Recovery key, shown once at setup, to get back in if you forget the master password.",
      "Unlock with fingerprint, optionally also the phone's screen lock; the master password is asked weekly.",
      "Change the master password in Settings.",
      "Backup reminder on the vault screen and in Settings."
    ]
  },
  {
    "version": "1.0.3",
    "points": [
      "Fixed: the app closed right after creating the master password."
    ]
  },
  {
    "version": "1.0.2",
    "points": [
      "If Vault closes unexpectedly, the next launch shows a report you can share."
    ]
  },
  {
    "version": "1.0.1",
    "points": [
      "PIN entries for phone lock, SIM, ATM and UPI PINs, with a PINs filter.",
      "Smaller download: about 60 MB instead of 125 MB."
    ]
  },
  {
    "version": "1.0.0",
    "points": [
      "First release: encrypted offline vault with master password, auto-lock and lockout after wrong attempts.",
      "Passwords with folders, favourites and search; copy with automatic clipboard clearing.",
      "Password generator and strength meter."
    ]
  }
];
