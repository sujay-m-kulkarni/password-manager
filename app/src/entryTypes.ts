/**
 * Entry types (they replace folders from 1.5.0). A type decides the extra fields an entry shows,
 * its colour, and its filter chip. Banking entries can also hold debit and credit cards.
 */
export type EntryType = 'banking' | 'investments' | 'social' | 'email' | 'other';

export type TypeField = {
  key: string;
  label: string;
  placeholder?: string;
  keyboard?: 'default' | 'number-pad';
  /** Upper-case as typed (IFSC). */
  upper?: boolean;
  maxLength?: number;
};

export type TypeInfo = { key: EntryType; label: string; color: string; fields: TypeField[]; cards: boolean };

export const ENTRY_TYPES: TypeInfo[] = [
  {
    key: 'banking',
    label: 'Banking',
    color: 'blue',
    cards: true,
    fields: [
      { key: 'account_number', label: 'Account number', keyboard: 'number-pad', maxLength: 20 },
      { key: 'ifsc', label: 'IFSC', placeholder: 'e.g. HDFC0001234', upper: true, maxLength: 11 },
      { key: 'customer_id', label: 'Customer ID', maxLength: 30 },
    ],
  },
  {
    key: 'investments',
    label: 'Investments',
    color: 'green',
    cards: false,
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'e.g. Zerodha / Groww client ID', maxLength: 30 },
      { key: 'demat_id', label: 'Demat (BO) ID', keyboard: 'number-pad', maxLength: 16 },
    ],
  },
  { key: 'social', label: 'Social media', color: 'pink', cards: false, fields: [] },
  { key: 'email', label: 'Email', color: 'orange', cards: false, fields: [] },
  { key: 'other', label: 'Other', color: 'violet', cards: false, fields: [] },
];

export const typeInfo = (t: string | null | undefined): TypeInfo =>
  ENTRY_TYPES.find(x => x.key === t) ?? ENTRY_TYPES[ENTRY_TYPES.length - 1];

export type TypeFields = Record<string, string>;

/** Parses the stored JSON, keeping only the string fields this type defines. */
export function parseFields(type: string, json: string | null | undefined): TypeFields {
  let raw: unknown = {};
  try {
    raw = json ? JSON.parse(json) : {};
  } catch {
    raw = {};
  }
  const out: TypeFields = {};
  for (const f of typeInfo(type).fields) {
    const v = (raw as Record<string, unknown>)?.[f.key];
    if (typeof v === 'string' && v.trim()) {
      out[f.key] = v.trim();
    }
  }
  return out;
}

/** JSON for storage: only this type's non-empty fields, or null when there are none. */
export function serializeFields(type: string, fields: TypeFields): string | null {
  const kept = parseFields(type, JSON.stringify(fields));
  return Object.keys(kept).length ? JSON.stringify(kept) : null;
}

/** SQL expression choosing a type from a folder name (used by the 1.5.0 migration and old backups). */
export const TYPE_FROM_FOLDER_SQL = `CASE
  WHEN lower(f.name) LIKE '%bank%' OR lower(f.name) LIKE '%card%' THEN 'banking'
  WHEN lower(f.name) LIKE '%invest%' OR lower(f.name) LIKE '%stock%' OR lower(f.name) LIKE '%trad%'
    OR lower(f.name) LIKE '%mutual%' OR lower(f.name) LIKE '%demat%' THEN 'investments'
  WHEN lower(f.name) LIKE '%social%' THEN 'social'
  WHEN lower(f.name) LIKE '%mail%' THEN 'email'
  ELSE 'other' END`;

export const SET_TYPE_FROM_FOLDER = `UPDATE entries SET type = coalesce(
  (SELECT ${TYPE_FROM_FOLDER_SQL} FROM folders f WHERE f.id = entries.folder_id), 'other')`;
