/**
 * Entry types (they replace folders from 1.5.0). A type decides an entry's colour, its filter chip
 * and its starting fields (customFields.ts). Banking entries can also hold debit and credit cards.
 */
export type EntryType =
  | 'banking'
  | 'investments'
  | 'insurance'
  | 'retirement'
  | 'identity'
  | 'property'
  | 'vehicle'
  | 'loans'
  | 'will'
  | 'people'
  | 'wishes'
  | 'social'
  | 'email'
  | 'other';

export type TypeIcon =
  | 'bank'
  | 'chart'
  | 'people'
  | 'mail'
  | 'grid'
  | 'umbrella'
  | 'sunset'
  | 'id'
  | 'home'
  | 'car'
  | 'receipt'
  | 'doc'
  | 'phone'
  | 'heart';

export type TypeInfo = {
  key: EntryType;
  label: string;
  color: string;
  cards: boolean;
  icon: TypeIcon;
  /** Records a login (username, password, website) by default. Others show it only on request (1.11.0). */
  login: boolean;
  /** Nominees make sense here: money or property that passes to someone (1.11.0). */
  nominees: boolean;
};

/** In the order they're offered. The Family Kit types (1.11.0) record what exists and how to find it. */
export const ENTRY_TYPES: TypeInfo[] = [
  { key: 'banking', label: 'Banking', color: 'blue', cards: true, icon: 'bank', login: true, nominees: true },
  { key: 'investments', label: 'Investments', color: 'green', cards: false, icon: 'chart', login: true, nominees: true },
  { key: 'insurance', label: 'Insurance', color: 'sky', cards: false, icon: 'umbrella', login: false, nominees: true },
  { key: 'retirement', label: 'Retirement', color: 'amber', cards: false, icon: 'sunset', login: false, nominees: true },
  { key: 'identity', label: 'Identity', color: 'violet', cards: false, icon: 'id', login: false, nominees: false },
  { key: 'property', label: 'Property', color: 'orange', cards: false, icon: 'home', login: false, nominees: true },
  { key: 'vehicle', label: 'Vehicle', color: 'sky', cards: false, icon: 'car', login: false, nominees: true },
  { key: 'loans', label: 'Loans & dues', color: 'pink', cards: false, icon: 'receipt', login: false, nominees: false },
  { key: 'will', label: 'Will & documents', color: 'amber', cards: false, icon: 'doc', login: false, nominees: false },
  { key: 'people', label: 'People', color: 'green', cards: false, icon: 'phone', login: false, nominees: false },
  { key: 'wishes', label: 'Wishes', color: 'pink', cards: false, icon: 'heart', login: false, nominees: false },
  { key: 'social', label: 'Social media', color: 'pink', cards: false, icon: 'people', login: true, nominees: false },
  { key: 'email', label: 'Email', color: 'orange', cards: false, icon: 'mail', login: true, nominees: false },
  { key: 'other', label: 'Other', color: 'violet', cards: false, icon: 'grid', login: true, nominees: false },
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
