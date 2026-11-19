/** 1.5.0: entry types (replacing folders), type fields, and cards inside Banking entries. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import {
  cardNetwork,
  cardProblem,
  formatExpiry,
  groupCardNumber,
  luhnOk,
  maskCardNumber,
  type Card,
} from '../src/cards';
import {
  VAULT_DB,
  deleteEntry,
  getEntry,
  listCards,
  listPins,
  listEntries,
  openVault,
  resetMetaConnection,
  saveEntry,
  type EntryInput,
} from '../src/db/database';
import { parseCustomFields } from '../src/customFields';
import { createBackup, openBackup, parseBackup, restoreInto } from '../src/security/backup';
import { Buffer } from '../src/security/crypto';
import { createVault } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void; open: typeof OpSqlite.open };
beforeEach(() => (mock.__reset(), resetMetaConnection()));

const VISA = '4111111111111111';
const RUPAY = '6074 8200 0000 0009'; // RuPay-style prefix, valid Luhn

const login = (over: Partial<EntryInput> = {}): EntryInput => ({
  type: 'banking',
  folder_id: null,
  title: 'HDFC Bank',
  username: 'sujay.k',
  password: 'N3t!banking',
  url: '',
  notes: '',
  favorite: false,
  ...over,
});
const card = (over: Partial<Card> = {}): Card => ({ kind: 'debit', number: VISA, expiry: '08/29', name: 'SUJAY K', pin: '4829', bank: '', ...over });

describe('upgrading an existing vault', () => {
  it('turns folders into types and keeps everything else', () => {
    // A 1.4 vault: schema v2 with the default folders and a custom one.
    const dek = Buffer.alloc(32, 7);
    const old = mock.open({ name: VAULT_DB, encryptionKey: `x'${dek.toString('hex')}'` });
    old.executeSync(`CREATE TABLE folders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL)`);
    old.executeSync(`CREATE TABLE entries (id INTEGER PRIMARY KEY, folder_id INTEGER, title TEXT NOT NULL, username TEXT,
      password TEXT NOT NULL, url TEXT, notes TEXT, favorite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'login')`);
    old.executeSync(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
    old.executeSync(`INSERT INTO folders (id, name, color) VALUES (1,'Banking','blue'),(2,'Work','orange'),(3,'Email','pink'),
      (4,'Social','green'),(5,'Zerodha & Groww investments','sky')`);
    const add = (id: number, folder: number | null, title: string) =>
      old.executeSync(`INSERT INTO entries (id, folder_id, title, password, created_at, updated_at) VALUES (?,?,?,?,1,1)`, [
        id,
        folder,
        title,
        'x',
      ]);
    add(1, 1, 'HDFC');
    add(2, 2, 'Jira');
    add(3, 3, 'Gmail');
    add(4, 4, 'Instagram');
    add(5, 5, 'Zerodha');
    add(6, null, 'Wi-Fi');
    old.executeSync(`INSERT INTO entries (id, folder_id, title, password, created_at, updated_at, kind) VALUES (7, 1, 'HDFC ATM', '2468', 1, 1, 'pin')`);
    old.executeSync('PRAGMA user_version = 2');
    old.close();

    const db = openVault(dek);
    const types = Object.fromEntries(listEntries(db, '', null).map(e => [e.title, e.type]));
    expect(types).toEqual({
      HDFC: 'banking',
      Jira: 'other',
      Gmail: 'email',
      Instagram: 'social',
      Zerodha: 'investments',
      'Wi-Fi': 'other',
      'HDFC ATM': 'banking',
    });
    expect(listCards(db, 1)).toEqual([]);
    // The old PIN entry now holds its PIN as a named PIN, and has no password.
    expect(listPins(db, 7)).toMatchObject([{ label: 'PIN', value: '2468' }]);
    expect(getEntry(db, 7)).toMatchObject({ password: '', kind: 'login' });
  });
});

describe('type fields', () => {
  it('saves named fields in order and drops empty ones', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(
      db,
      login({
        fields: [
          { name: 'Account number', value: ' 50100123456789 ', kind: 'number' },
          { name: 'IFSC', value: 'HDFC0001234', kind: 'text' },
          { name: 'CIF', value: '', kind: 'text' },
        ],
      }),
    );
    expect(parseCustomFields(getEntry(db, id)!.fields)).toEqual([
      { name: 'Account number', value: '50100123456789', kind: 'number' },
      { name: 'IFSC', value: 'HDFC0001234', kind: 'text' },
    ]);
  });

  it('filters the list by type', async () => {
    const { db } = await createVault(PW);
    saveEntry(db, login());
    saveEntry(db, login({ type: 'social', title: 'Instagram' }));
    saveEntry(db, login({ type: 'investments', title: 'Groww' }));
    expect(listEntries(db, '', null, false, 'investments').map(e => e.title)).toEqual(['Groww']);
    expect(listEntries(db, '', null, false, 'banking').map(e => e.title)).toEqual(['HDFC Bank']);
  });
});

describe('cards in a Banking entry', () => {
  it('saves, replaces and lists cards; the list shows how many', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(db, login({ cards: [card(), card({ kind: 'credit', number: RUPAY, pin: '' })] }));
    const cards = listCards(db, id);
    expect(cards.map(c => [c.kind, c.number, c.expiry, c.pin])).toEqual([
      ['debit', VISA, '08/29', '4829'],
      ['credit', '6074820000000009', '08/29', ''],
    ]);
    expect(listEntries(db, '', null)[0].cards).toBe(2);

    saveEntry(db, login({ cards: [cards[1]] }), id);
    expect(listCards(db, id).map(c => c.kind)).toEqual(['credit']);

    // Saving without `cards` leaves them alone (e.g. only the favourite star changed elsewhere).
    saveEntry(db, login({ title: 'HDFC' }), id);
    expect(listCards(db, id)).toHaveLength(1);
  });

  it('refuses a bad card and saves nothing', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(db, login({ cards: [card()] }));
    expect(() => saveEntry(db, login({ title: 'Changed', cards: [card({ number: '1234' })] }), id)).toThrow('12 to 19 digits');
    expect(getEntry(db, id)!.title).toBe('HDFC Bank'); // rolled back
    expect(() => saveEntry(db, login({ cards: [card({ expiry: '13/29' })] }))).toThrow('MM/YY');
    expect(() => saveEntry(db, login({ cards: [card({ pin: '12' })] }))).toThrow('4 to 6 digits');
  });

  it('drops cards when the entry is no longer Banking, and deletes them with the entry', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(db, login({ cards: [card()] }));
    saveEntry(db, login({ type: 'other', cards: [card()] }), id);
    expect(listCards(db, id)).toEqual([]);

    const id2 = saveEntry(db, login({ cards: [card()] }));
    deleteEntry(db, id2);
    expect(listCards(db, id2)).toEqual([]);
  });
});

describe('a card\'s bank (1.8.3)', () => {
  it('is saved, listed, and carried through a backup', async () => {
    const { db, dek } = await createVault(PW);
    const id = saveEntry(db, login({ cards: [card({ bank: ' SBI Card ' }), card({ kind: 'credit', number: RUPAY })] }));
    expect(listCards(db, id).map(c => c.bank)).toEqual(['SBI Card', '']);
    const opened = (await openBackup(parseBackup(createBackup(db, dek).text), PW))!;
    restoreInto(db, opened.data);
    expect(listCards(db, listEntries(db, '', null)[0].id).map(c => c.bank)).toEqual(['SBI Card', '']);
  });
});

describe('backups', () => {
  it('carry types, fields and cards', async () => {
    const { db, dek } = await createVault(PW);
    saveEntry(db, login({ fields: [{ name: 'IFSC', value: 'HDFC0001234', kind: 'text' }], cards: [card()] }));
    const opened = (await openBackup(parseBackup(createBackup(db, dek).text), PW))!;
    expect(opened.data.cards).toHaveLength(1);

    saveEntry(db, login({ title: 'Other bank', cards: [] }));
    restoreInto(db, opened.data);
    const [e] = listEntries(db, '', null);
    expect(e).toMatchObject({ title: 'HDFC Bank', type: 'banking', cards: 1 });
    expect(parseCustomFields(getEntry(db, e.id)!.fields)).toEqual([{ name: 'IFSC', value: 'HDFC0001234', kind: 'text' }]);
  });

  it('a backup from before types gets types from its folders', async () => {
    const { db } = await createVault(PW);
    restoreInto(db, {
      schema: 2,
      folders: [
        { id: 1, name: 'Banking', color: 'blue' },
        { id: 3, name: 'Email', color: 'pink' },
      ],
      entries: [
        { id: 1, kind: 'login', folder_id: 1, title: 'SBI', username: null, password: 'x', url: null, notes: null, favorite: 0, created_at: 1, updated_at: 1 },
        { id: 2, kind: 'login', folder_id: 3, title: 'Gmail', username: null, password: 'x', url: null, notes: null, favorite: 0, created_at: 1, updated_at: 1 },
        { id: 3, kind: 'pin', folder_id: null, title: 'Phone lock', username: null, password: '482913', url: null, notes: null, favorite: 0, created_at: 1, updated_at: 1 },
      ] as never,
    });
    expect(listEntries(db, '', null).map(e => [e.title, e.type])).toEqual([
      ['Gmail', 'email'],
      ['Phone lock', 'other'],
      ['SBI', 'banking'],
    ]);
    expect(listPins(db, 3)).toMatchObject([{ label: 'PIN', value: '482913' }]);
  });
});

describe('card helpers', () => {
  it('formats, masks and checks numbers', () => {
    expect(groupCardNumber(VISA)).toBe('4111 1111 1111 1111');
    expect(groupCardNumber('378282246310005')).toBe('3782 822463 10005');
    expect(maskCardNumber(VISA)).toBe('•••• 1111');
    expect(luhnOk(VISA)).toBe(true);
    expect(luhnOk('4111111111111112')).toBe(false);
    expect(cardNetwork(VISA)).toBe('Visa');
    expect(cardNetwork('5555555555554444')).toBe('Mastercard');
    expect(cardNetwork('2221000000000009')).toBe('Mastercard');
    expect(cardNetwork(RUPAY)).toBe('RuPay');
    expect(cardNetwork('378282246310005')).toBe('Amex');
  });

  it('helps type the expiry', () => {
    expect(formatExpiry('0', '')).toBe('0');
    expect(formatExpiry('08', '0')).toBe('08/');
    expect(formatExpiry('08', '08/')).toBe('08'); // deleting the slash
    expect(formatExpiry('0829', '')).toBe('08/29');
    expect(cardProblem(card({ expiry: '' }))).toBeNull(); // expiry is optional
  });
});
