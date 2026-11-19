/**
 * Entry types (they replace folders from 1.5.0). A type decides an entry's colour, its filter chip
 * and its starting fields (customFields.ts). Banking entries can also hold debit and credit cards.
 */
export type EntryType = 'banking' | 'investments' | 'social' | 'email' | 'other';

export type TypeInfo = { key: EntryType; label: string; color: string; cards: boolean; icon: 'bank' | 'chart' | 'people' | 'mail' | 'grid' };

export const ENTRY_TYPES: TypeInfo[] = [
  {
    key: 'banking',
    label: 'Banking',
    color: 'blue',
    cards: true,
    icon: 'bank',
  },
  {
    key: 'investments',
    label: 'Investments',
    color: 'green',
    cards: false,
    icon: 'chart',
  },
  { key: 'social', label: 'Social media', color: 'pink', cards: false, icon: 'people' },
  { key: 'email', label: 'Email', color: 'orange', cards: false, icon: 'mail' },
  { key: 'other', label: 'Other', color: 'violet', cards: false, icon: 'grid' },
];

export const typeInfo = (t: string | null | undefined): TypeInfo =>
  ENTRY_TYPES.find(x => x.key === t) ?? ENTRY_TYPES[ENTRY_TYPES.length - 1];

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
