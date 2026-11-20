/**
 * Custom fields (1.7.0): any entry can hold named fields — CIF, Branch, MMID, UID (Aadhaar)… —
 * each Text, Number or Hidden. Every type has a starting list of fields that each person can edit
 * (Settings › Entry types); a new entry starts with that list, and "+ Add field" adds more.
 *
 * Stored in entries.fields as a JSON array, in the order shown. Entries saved by 1.5/1.6 hold an
 * object of fixed keys ({"account_number": …}); those are read as the matching named fields.
 */
import type { DB } from '@op-engineering/op-sqlite';
import type { EntryType } from './entryTypes';

export type FieldKind = 'text' | 'number' | 'hidden';
export type CustomField = { name: string; value: string; kind: FieldKind };
export type FieldSpec = { name: string; kind: FieldKind };

export const FIELD_NAME_MAX = 30;
export const FIELD_VALUE_MAX = 200;
export const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'number', label: 'Number' },
  { kind: 'hidden', label: 'Hidden' },
];

/** What each type starts with until the person changes it. */
export const DEFAULT_FIELDS: Record<EntryType, FieldSpec[]> = {
  banking: [
    { name: 'Account number', kind: 'number' },
    { name: 'IFSC', kind: 'text' },
    { name: 'Customer ID', kind: 'text' },
    { name: 'CIF', kind: 'text' },
    { name: 'Branch', kind: 'text' },
    { name: 'Branch code', kind: 'text' },
    { name: 'MMID', kind: 'number' },
    { name: 'UID (Aadhaar)', kind: 'hidden' },
    { name: 'CKYC no', kind: 'number' },
  ],
  investments: [
    { name: 'Client ID', kind: 'text' },
    { name: 'Demat (BO) ID', kind: 'number' },
  ],
  // Family Kit types (1.11.0): what exists and the numbers that prove it, never amounts.
  insurance: [
    { name: 'Insurer', kind: 'text' },
    { name: 'Policy number', kind: 'text' },
    { name: 'Policy type', kind: 'text' },
    { name: 'Sum assured', kind: 'text' },
    { name: 'Agent', kind: 'text' },
    { name: 'Agent phone', kind: 'number' },
    { name: 'Group policy via employer', kind: 'text' },
  ],
  retirement: [
    { name: 'UAN', kind: 'number' },
    { name: 'Employer', kind: 'text' },
    { name: 'EPF member ID', kind: 'text' },
    { name: 'NPS PRAN', kind: 'number' },
    { name: 'PPO number', kind: 'text' },
  ],
  identity: [
    { name: 'Aadhaar', kind: 'hidden' },
    { name: 'PAN', kind: 'text' },
    { name: 'Passport number', kind: 'text' },
    { name: 'Passport expiry', kind: 'text' },
    { name: 'Voter ID', kind: 'text' },
    { name: 'Driving licence', kind: 'text' },
  ],
  property: [
    { name: 'Address', kind: 'text' },
    { name: 'Sale deed number', kind: 'text' },
    { name: 'Khata number', kind: 'text' },
    { name: 'Co-owners', kind: 'text' },
    { name: 'Home loan with', kind: 'text' },
  ],
  vehicle: [
    { name: 'Registration number', kind: 'text' },
    { name: 'Insurer', kind: 'text' },
    { name: 'Policy number', kind: 'text' },
  ],
  loans: [
    { name: 'Lender', kind: 'text' },
    { name: 'Loan account number', kind: 'text' },
    { name: 'Loan type', kind: 'text' },
    { name: 'Co-borrower', kind: 'text' },
  ],
  will: [
    { name: 'Document', kind: 'text' },
    { name: 'Date', kind: 'text' },
    { name: 'Executor', kind: 'text' },
    { name: 'Lawyer', kind: 'text' },
  ],
  people: [
    { name: 'Role', kind: 'text' },
    { name: 'Phone', kind: 'number' },
    { name: 'Email', kind: 'text' },
    { name: 'Helps with', kind: 'text' },
  ],
  wishes: [],
  social: [],
  email: [],
  other: [],
};

/** One-tap names offered when adding a field. */
export const FIELD_SUGGESTIONS: FieldSpec[] = [
  { name: 'CIF', kind: 'text' },
  { name: 'Branch', kind: 'text' },
  { name: 'Branch code', kind: 'text' },
  { name: 'MMID', kind: 'number' },
  { name: 'UID (Aadhaar)', kind: 'hidden' },
  { name: 'CKYC no', kind: 'number' },
  { name: 'Profile password', kind: 'hidden' },
  { name: 'Customer ID', kind: 'text' },
  { name: 'PAN', kind: 'text' },
  { name: 'Registered mobile', kind: 'number' },
];

/** 1.5/1.6 fixed keys → named fields. */
const LEGACY: Record<string, FieldSpec> = {
  account_number: { name: 'Account number', kind: 'number' },
  ifsc: { name: 'IFSC', kind: 'text' },
  customer_id: { name: 'Customer ID', kind: 'text' },
  client_id: { name: 'Client ID', kind: 'text' },
  demat_id: { name: 'Demat (BO) ID', kind: 'number' },
};

const isKind = (k: unknown): k is FieldKind => k === 'text' || k === 'number' || k === 'hidden';
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** IFSC codes are upper-case; typed in lower case they are corrected. */
export const upperCaseField = (name: string) => /^ifsc\b/i.test(name.trim());

/** Reads entries.fields (array, or the 1.5/1.6 object) into named fields, in order. */
export function parseCustomFields(json: string | null | undefined): CustomField[] {
  let raw: unknown;
  try {
    raw = json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (f): f is CustomField =>
          !!f && typeof f.name === 'string' && typeof f.value === 'string' && f.name.trim() !== '' && f.value !== '',
      )
      .map(f => ({ name: f.name.trim(), value: f.value, kind: isKind(f.kind) ? f.kind : 'text' }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      .map(([k, v]) => ({ ...(LEGACY[k] ?? { name: k, kind: 'text' as const }), value: (v as string).trim() }));
  }
  return [];
}

/** JSON for storage: fields with a name and a value, trimmed; null when there are none. */
export function serializeCustomFields(fields: CustomField[]): string | null {
  const kept = fields
    .map(f => ({ name: f.name.trim().slice(0, FIELD_NAME_MAX), value: f.value.trim().slice(0, FIELD_VALUE_MAX), kind: f.kind }))
    .filter(f => f.name && f.value);
  return kept.length ? JSON.stringify(kept) : null;
}

/** Text that search may look in: values of fields that are not Hidden. */
export function fieldSearchText(fields: CustomField[]): string | null {
  const text = fields
    .filter(f => f.kind !== 'hidden')
    .map(f => f.value.trim())
    .filter(Boolean)
    .join(' ');
  return text || null;
}

/** First problem with the fields, or null. */
export function fieldsProblem(fields: CustomField[]): string | null {
  const named = fields.filter(f => f.value.trim());
  for (const f of named) {
    if (!f.name.trim()) {
      return 'Give every field a name.';
    }
    if (f.kind === 'number' && !/^[0-9 ]+$/.test(f.value.trim())) {
      return `${f.name.trim()} takes digits only.`;
    }
  }
  return null;
}

// ---- Starting field list per type (vault settings; each person edits their own) ----

const settingKey = (type: EntryType) => `type_fields:${type}`;

export function getTypeFields(db: DB, type: EntryType): FieldSpec[] {
  const row = db.executeSync('SELECT value FROM settings WHERE key = ?', [settingKey(type)]).rows[0] as
    | { value: string | null }
    | undefined;
  if (row?.value) {
    try {
      const list = JSON.parse(row.value);
      if (Array.isArray(list)) {
        return list
          .filter(f => f && typeof f.name === 'string' && f.name.trim())
          .map(f => ({ name: String(f.name).trim(), kind: isKind(f.kind) ? f.kind : 'text' }));
      }
    } catch {
      // fall back to the defaults
    }
  }
  return DEFAULT_FIELDS[type] ?? [];
}

/** Saves a type's starting list. Names must be unique (ignoring case) and non-empty. */
export function setTypeFields(db: DB, type: EntryType, list: FieldSpec[]) {
  const clean = list.map(f => ({ name: f.name.trim().slice(0, FIELD_NAME_MAX), kind: f.kind }));
  if (clean.some(f => !f.name)) {
    throw new Error('Give every field a name.');
  }
  const dup = clean.find((f, i) => clean.findIndex(g => sameName(g.name, f.name)) !== i);
  if (dup) {
    throw new Error(`"${dup.name}" is in the list twice.`);
  }
  db.executeSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [settingKey(type), JSON.stringify(clean)],
  );
}

export function resetTypeFields(db: DB, type: EntryType) {
  db.executeSync('DELETE FROM settings WHERE key = ?', [settingKey(type)]);
}

/**
 * The fields the form shows: the entry's own fields first (in their order), then the type's
 * starting fields it doesn't have yet, empty. Empty fields are not saved.
 */
export function formFields(existing: CustomField[], starting: FieldSpec[]): CustomField[] {
  const out = existing.map(f => ({ ...f }));
  for (const s of starting) {
    if (!out.some(f => sameName(f.name, s.name))) {
      out.push({ name: s.name, kind: s.kind, value: '' });
    }
  }
  return out;
}
