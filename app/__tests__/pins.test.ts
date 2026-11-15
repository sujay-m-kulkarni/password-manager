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
  groupPin,
  isValidPin,
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
  kind: 'pin',
  folder_id: null,
  title: 'Phone lock',
  username: 'left over',
  password: '482913',
  url: 'https://left.over',
  notes: '',
  favorite: false,
};

describe('PIN validation', () => {
  it('accepts 4 to 12 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('482913')).toBe(true);
    expect(isValidPin('123456789012')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567890123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('12 34')).toBe(false);
    expect(isValidPin('')).toBe(false);
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

describe('saveEntry', () => {
  it('stores a PIN with kind "pin" and drops username and website', () => {
    const { db, calls } = fakeDb();
    expect(saveEntry(db, base)).toBe(7);
    const insert = calls.find(c => c.sql.includes('INSERT INTO entries'))!;
    expect(insert.sql).toContain('kind');
    // kind, folder, title, username, password, url, notes, favorite, created, updated
    expect(insert.params.slice(0, 8)).toEqual([
      'pin',
      null,
      'Phone lock',
      null,
      '482913',
      null,
      null,
      0,
    ]);
  });

  it('refuses an invalid PIN and writes nothing', () => {
    const { db, calls } = fakeDb();
    expect(() => saveEntry(db, { ...base, password: '12ab' })).toThrow(
      '4 to 12 digits',
    );
    expect(calls).toHaveLength(0);
  });

  it('keeps username and website for a login', () => {
    const { db, calls } = fakeDb();
    saveEntry(db, { ...base, kind: 'login', password: 'not a pin!' }, 3);
    const update = calls.find(c => c.sql.includes('UPDATE entries'))!;
    expect(update.params.slice(0, 6)).toEqual([
      'login',
      null,
      'Phone lock',
      'left over',
      'not a pin!',
      'https://left.over',
    ]);
    expect(update.params[update.params.length - 1]).toBe(3);
  });
});

describe('listEntries', () => {
  it('filters by kind when asked', () => {
    const { db, calls } = fakeDb();
    listEntries(db, '', null, 'pin');
    expect(calls[0].sql).toContain('e.kind = ?');
    expect(calls[0].params).toEqual(['pin']);
    listEntries(db, '', null);
    expect(calls[1].sql).not.toContain('e.kind = ?');
    expect(calls[1].params).toEqual([]);
  });
});
