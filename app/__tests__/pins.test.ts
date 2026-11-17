/**
 * PIN entries: validation, display grouping, and what saveEntry writes.
 * op-sqlite is mocked; a fake DB records the SQL and parameters.
 */
jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn() }));
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {},
  Buffer: require('buffer').Buffer,
}));

import type { DB } from '@op-engineering/op-sqlite';
import {
  cleanPin,
  groupPin,
  isValidPin,
  pinFormatOf,
  listEntries,
  saveEntry,
  type EntryInput,
} from '../src/db/database';

function fakeDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    executeSync: (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: [], insertId: 7 };
    },
  } as unknown as DB;
  return { db, calls };
}

const base: EntryInput = {
  folder_id: null,
  title: 'Phone lock',
  username: '',
  password: '',
  url: '',
  notes: '',
  favorite: false,
  pins: [{ label: 'Phone lock', value: '482913' }],
};

describe('PIN validation', () => {
  it('numbers: 4 to 12 digits only', () => {
    expect(isValidPin('1234', 'numeric')).toBe(true);
    expect(isValidPin('482913', 'numeric')).toBe(true);
    expect(isValidPin('123456789012', 'numeric')).toBe(true);
    expect(isValidPin('123', 'numeric')).toBe(false);
    expect(isValidPin('1234567890123', 'numeric')).toBe(false);
    expect(isValidPin('12a4', 'numeric')).toBe(false);
    expect(isValidPin('12 34', 'numeric')).toBe(false);
    expect(isValidPin('', 'numeric')).toBe(false);
  });

  it('letters & numbers: 4 to 16 letters or digits, nothing else', () => {
    expect(isValidPin('Ab12', 'alphanumeric')).toBe(true);
    expect(isValidPin('1234', 'alphanumeric')).toBe(true);
    expect(isValidPin('aB3dE6gH9jK2mN5p', 'alphanumeric')).toBe(true);
    expect(isValidPin('aB3dE6gH9jK2mN5pQ', 'alphanumeric')).toBe(false);
    expect(isValidPin('ab1', 'alphanumeric')).toBe(false);
    expect(isValidPin('ab-12', 'alphanumeric')).toBe(false);
    expect(isValidPin('ab 12', 'alphanumeric')).toBe(false);
  });

  it('without a format accepts either kind', () => {
    expect(isValidPin('482913')).toBe(true);
    expect(isValidPin('Ab12cd')).toBe(true);
    expect(isValidPin('S3cret!pass')).toBe(false);
  });

  it('tells the format from what the PIN holds, and cleans typed text', () => {
    expect(pinFormatOf('482913')).toBe('numeric');
    expect(pinFormatOf('Ab12')).toBe('alphanumeric');
    expect(cleanPin('48-29 13', 'numeric')).toBe('482913');
    expect(cleanPin('Ab-12 cd!', 'numeric')).toBe('12');
    expect(cleanPin('Ab-12 cd!', 'alphanumeric')).toBe('Ab12cd');
    expect(cleanPin('1'.repeat(20), 'numeric')).toHaveLength(12);
    expect(cleanPin('a'.repeat(20), 'alphanumeric')).toHaveLength(16);
  });
});

describe('PIN grouping for display', () => {
  it('splits into readable groups', () => {
    expect(groupPin('1234')).toBe('1234');
    expect(groupPin('482913')).toBe('482 913');
    expect(groupPin('12345678')).toBe('1234 5678');
    expect(groupPin('12345')).toBe('123 45');
  });
});

describe('saveEntry with PINs', () => {
  it('stores the entry and its named PINs; a PIN-only entry has no password', () => {
    const { db, calls } = fakeDb();
    expect(saveEntry(db, base)).toBe(7);
    const insert = calls.find(c => c.sql.includes('INSERT INTO entries'))!;
    // kind (always 'login' now), type, fields, folder, title, username, password, url, notes, favorite
    expect(insert.params.slice(0, 10)).toEqual(['login', 'other', null, null, 'Phone lock', null, '', null, null, 0]);
    const pin = calls.find(c => c.sql.includes('INSERT INTO pins'))!;
    expect(pin.params.slice(0, 3)).toEqual([7, 'Phone lock', '482913']);
  });

  it('refuses an invalid PIN and writes nothing', () => {
    const { db, calls } = fakeDb();
    expect(() => saveEntry(db, { ...base, pins: [{ label: 'UPI PIN', value: '12-ab' }] })).toThrow('UPI PIN: 4 to 12 digits');
    expect(() => saveEntry(db, { ...base, pins: [{ label: '', value: '123' }] })).toThrow('PIN: 4 to 12 digits');
    expect(calls).toHaveLength(0);
  });

  it('needs a password, a PIN or a card', () => {
    const { db, calls } = fakeDb();
    expect(() => saveEntry(db, { ...base, pins: [] })).toThrow('Add a password, a PIN or a card.');
    expect(calls).toHaveLength(0);
  });

  it('keeps username and website next to PINs', () => {
    const { db, calls } = fakeDb();
    saveEntry(db, { ...base, username: 'me', password: 'not a pin!', url: 'https://bank.in' }, 3);
    const update = calls.find(c => c.sql.includes('UPDATE entries'))!;
    expect(update.params.slice(5, 8)).toEqual(['me', 'not a pin!', 'https://bank.in']);
    expect(update.params[update.params.length - 1]).toBe(3);
  });
});

describe('listEntries', () => {
  it('can show only entries that hold PINs', () => {
    const { db, calls } = fakeDb();
    listEntries(db, '', null, true);
    expect(calls[0].sql).toContain('EXISTS (SELECT 1 FROM pins');
    listEntries(db, '', null);
    expect(calls[1].sql).not.toContain('EXISTS (SELECT 1 FROM pins');
  });
});
