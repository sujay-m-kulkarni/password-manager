/**
 * Family Kit (1.11.0): a checklist of what a family needs if the person who manages the money and
 * papers dies suddenly. Each item is Done when the vault holds something for it, Not needed when
 * the person says so, and To do otherwise. It records what exists and how to find it, never amounts.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { getSetting, setSetting } from './db/database';
import type { EntryType, TypeIcon } from './entryTypes';

export type KitItemKey =
  | 'will'
  | 'identity'
  | 'banks'
  | 'cards'
  | 'investments'
  | 'insurance'
  | 'retirement'
  | 'property'
  | 'vehicles'
  | 'loans'
  | 'digital'
  | 'people'
  | 'wishes';

export type KitItem = {
  key: KitItemKey;
  title: string;
  /** Why the family needs it, one line. */
  why: string;
  icon: TypeIcon;
  /** The type a new entry for this item gets. */
  addType: EntryType;
  /** Opens the new entry on its Cards tab. */
  addTab?: 'cards';
};

export const KIT_ITEMS: KitItem[] = [
  { key: 'will', title: 'Will & documents', why: 'Decides who inherits; nominations should match it.', icon: 'doc', addType: 'will' },
  { key: 'identity', title: 'Identity', why: 'Every claim form asks for the IDs of the person who died.', icon: 'id', addType: 'identity' },
  { key: 'banks', title: 'Bank accounts & FDs', why: 'Nominees claim with the account; without one, heirs need a succession certificate.', icon: 'bank', addType: 'banking' },
  { key: 'cards', title: 'Cards', why: 'To block cards and settle credit card dues.', icon: 'pin', addType: 'banking', addTab: 'cards' },
  { key: 'investments', title: 'Investments', why: 'Demat, mutual funds, PPF, NPS: transfer needs the account or folio.', icon: 'chart', addType: 'investments' },
  { key: 'insurance', title: 'Insurance', why: 'The policy number starts the claim; employer cover is often forgotten.', icon: 'umbrella', addType: 'insurance' },
  { key: 'retirement', title: 'Retirement (EPF, pension)', why: 'The family claims PF and pension with the UAN.', icon: 'sunset', addType: 'retirement' },
  { key: 'property', title: 'Property', why: 'Transfer needs the original deeds; say where they are.', icon: 'home', addType: 'property' },
  { key: 'vehicles', title: 'Vehicles', why: 'For transfer and insurance claims.', icon: 'car', addType: 'vehicle' },
  { key: 'loans', title: 'Loans & dues', why: 'What is owed, and what others owe you. Lender and account, not amounts.', icon: 'receipt', addType: 'loans' },
  { key: 'digital', title: 'Phone & email', why: 'Bank OTPs and statements arrive on your phone and email.', icon: 'mail', addType: 'email' },
  { key: 'people', title: 'People to call', why: 'CA, lawyer, agent, employer HR: who can help with claims.', icon: 'phone', addType: 'people' },
  { key: 'wishes', title: 'Wishes', why: 'Funeral wishes, organ donation, a note for the family. Optional.', icon: 'heart', addType: 'wishes' },
];

export type KitStatus = 'done' | 'na' | 'todo';
export type KitRow = KitItem & { status: KitStatus; entries: { id: number; title: string }[] };

const K_NA = 'family_kit_not_needed';

/** Items the person marked Not needed. */
export function notNeeded(db: DB): Set<KitItemKey> {
  try {
    const v = JSON.parse(getSetting(db, K_NA) ?? '[]');
    return new Set(Array.isArray(v) ? (v.filter(x => KIT_ITEMS.some(i => i.key === x)) as KitItemKey[]) : []);
  } catch {
    return new Set();
  }
}

export function setNotNeeded(db: DB, key: KitItemKey, on: boolean) {
  const set = notNeeded(db);
  if (on) {
    set.add(key);
  } else {
    set.delete(key);
  }
  setSetting(db, K_NA, JSON.stringify([...set]));
}

type Ref = { id: number; title: string };
const q = (db: DB, sql: string): Ref[] => (db.executeSync(sql).rows as unknown as Ref[]).map(r => ({ id: Number(r.id), title: String(r.title) }));
const ofType = (db: DB, types: string[]) =>
  q(db, `SELECT id, title FROM entries WHERE type IN (${types.map(t => `'${t}'`).join(',')}) ORDER BY title COLLATE NOCASE`);

/** The entries that count for each item. */
function entriesFor(db: DB, key: KitItemKey): Ref[] {
  switch (key) {
    case 'will':
      return ofType(db, ['will']);
    case 'identity':
      return ofType(db, ['identity']);
    case 'banks':
      return ofType(db, ['banking']);
    case 'cards':
      return q(db, 'SELECT DISTINCT e.id, e.title FROM entries e JOIN cards c ON c.entry_id = e.id ORDER BY e.title COLLATE NOCASE');
    case 'investments':
      return ofType(db, ['investments']);
    case 'insurance':
      return ofType(db, ['insurance']);
    case 'retirement':
      return ofType(db, ['retirement']);
    case 'property':
      return ofType(db, ['property']);
    case 'vehicles':
      return ofType(db, ['vehicle']);
    case 'loans':
      return ofType(db, ['loans']);
    case 'digital':
      // An email account, or a phone unlock PIN anywhere.
      return q(
        db,
        `SELECT id, title FROM entries WHERE type = 'email'
         UNION SELECT e.id, e.title FROM entries e JOIN pins p ON p.entry_id = e.id WHERE lower(p.label) LIKE '%phone%'
         ORDER BY title COLLATE NOCASE`,
      );
    case 'people':
      return ofType(db, ['people']);
    case 'wishes':
      return ofType(db, ['wishes']);
  }
}

export function kitRows(db: DB): KitRow[] {
  const na = notNeeded(db);
  return KIT_ITEMS.map(item => {
    const entries = entriesFor(db, item.key);
    const status: KitStatus = entries.length > 0 ? 'done' : na.has(item.key) ? 'na' : 'todo';
    return { ...item, status, entries };
  });
}

/** "9 of 13": items Done, out of those not marked Not needed. */
export function kitProgress(rows: KitRow[]): { done: number; total: number } {
  const counted = rows.filter(r => r.status !== 'na');
  return { done: counted.filter(r => r.status === 'done').length, total: counted.length };
}
