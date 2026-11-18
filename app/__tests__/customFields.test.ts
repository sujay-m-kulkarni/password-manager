/** 1.7.0: custom fields on entries and each type's editable starting list. */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));

import * as OpSqlite from '@op-engineering/op-sqlite';
import {
  DEFAULT_FIELDS,
  fieldSearchText,
  fieldsProblem,
  formFields,
  getTypeFields,
  parseCustomFields,
  resetTypeFields,
  serializeCustomFields,
  setTypeFields,
  type CustomField,
} from '../src/customFields';
import { getEntry, listEntries, resetMetaConnection, saveEntry, type EntryInput } from '../src/db/database';
import { restoreInto } from '../src/security/backup';
import { createVault } from '../src/security/keyHierarchy';

const PW = 'purple mango river forty';
const mock = OpSqlite as unknown as { __reset: () => void };
beforeEach(() => (mock.__reset(), resetMetaConnection()));

const bank = (fields: CustomField[], over: Partial<EntryInput> = {}): EntryInput => ({
  type: 'banking',
  folder_id: null,
  title: 'HDFC Bank',
  username: 'sujay.k',
  password: 'N3t!banking',
  url: '',
  notes: '',
  favorite: false,
  fields,
  ...over,
});

describe('reading and writing fields', () => {
  it('reads the 1.5/1.6 fixed fields as named fields', () => {
    expect(parseCustomFields('{"account_number":"5010012345","ifsc":"HDFC0001234","client_id":" "}')).toEqual([
      { name: 'Account number', value: '5010012345', kind: 'number' },
      { name: 'IFSC', value: 'HDFC0001234', kind: 'text' },
    ]);
  });

  it('keeps order, trims, drops empty fields, and survives bad data', () => {
    const json = serializeCustomFields([
      { name: ' CIF ', value: ' 1234567 ', kind: 'text' },
      { name: 'Branch', value: '', kind: 'text' },
      { name: 'UID (Aadhaar)', value: '1234 5678 9012', kind: 'hidden' },
    ]);
    expect(parseCustomFields(json)).toEqual([
      { name: 'CIF', value: '1234567', kind: 'text' },
      { name: 'UID (Aadhaar)', value: '1234 5678 9012', kind: 'hidden' },
    ]);
    expect(serializeCustomFields([{ name: 'CIF', value: ' ', kind: 'text' }])).toBeNull();
    expect(parseCustomFields('not json')).toEqual([]);
    expect(parseCustomFields('[{"name":"X","value":"1","kind":"weird"}]')).toEqual([{ name: 'X', value: '1', kind: 'text' }]);
  });

  it('search text leaves out hidden fields', () => {
    expect(
      fieldSearchText([
        { name: 'CIF', value: '1234567', kind: 'text' },
        { name: 'UID (Aadhaar)', value: '999988887777', kind: 'hidden' },
        { name: 'MMID', value: '9229001', kind: 'number' },
      ]),
    ).toBe('1234567 9229001');
  });

  it('checks names and digits', () => {
    expect(fieldsProblem([{ name: 'MMID', value: '92 29001', kind: 'number' }])).toBeNull();
    expect(fieldsProblem([{ name: 'MMID', value: '92a', kind: 'number' }])).toBe('MMID takes digits only.');
    expect(fieldsProblem([{ name: ' ', value: 'x', kind: 'text' }])).toBe('Give every field a name.');
    expect(fieldsProblem([{ name: '', value: '', kind: 'text' }])).toBeNull(); // empty rows are ignored
  });
});

describe('entries with fields', () => {
  it('search finds field values, but never hidden ones', async () => {
    const { db } = await createVault(PW);
    const id = saveEntry(
      db,
      bank([
        { name: 'CIF', value: '88776655', kind: 'text' },
        { name: 'UID (Aadhaar)', value: '123456789012', kind: 'hidden' },
      ]),
    );
    saveEntry(db, bank([], { title: 'SBI' }));
    expect(listEntries(db, '88776655', null).map(e => e.id)).toEqual([id]);
    expect(listEntries(db, '123456789012', null)).toEqual([]);
    expect(parseCustomFields(getEntry(db, id)!.fields).map(f => f.name)).toEqual(['CIF', 'UID (Aadhaar)']);
  });

  it('refuses letters in a Number field and saves nothing', async () => {
    const { db } = await createVault(PW);
    expect(() => saveEntry(db, bank([{ name: 'MMID', value: 'abc', kind: 'number' }]))).toThrow('MMID takes digits only.');
    expect(listEntries(db, '', null)).toEqual([]);
  });

  it('restoring a 1.6 backup makes its fields searchable', async () => {
    const { db } = await createVault(PW);
    restoreInto(db, {
      schema: 3,
      folders: [],
      entries: [
        {
          id: 1,
          kind: 'login',
          type: 'banking',
          fields: '{"account_number":"50100123456789","ifsc":"HDFC0001234"}',
          folder_id: null,
          title: 'HDFC',
          username: null,
          password: 'x',
          url: null,
          notes: null,
          favorite: 0,
          created_at: 1,
          updated_at: 1,
        },
      ] as never,
    });
    expect(listEntries(db, 'HDFC0001234', null).map(e => e.title)).toEqual(['HDFC']);
  });
});

describe('starting fields per type', () => {
  it('Banking starts with the agreed list; UID is hidden', async () => {
    const { db } = await createVault(PW);
    const list = getTypeFields(db, 'banking');
    expect(list.map(f => f.name)).toEqual([
      'Account number',
      'IFSC',
      'Customer ID',
      'CIF',
      'Branch',
      'Branch code',
      'MMID',
      'UID (Aadhaar)',
      'CKYC no',
    ]);
    expect(list.find(f => f.name.startsWith('UID'))?.kind).toBe('hidden');
    expect(getTypeFields(db, 'social')).toEqual([]);
  });

  it('each person can rename, add, remove and reset', async () => {
    const { db } = await createVault(PW);
    setTypeFields(db, 'social', [
      { name: ' Handle ', kind: 'text' },
      { name: 'Recovery phone', kind: 'number' },
    ]);
    expect(getTypeFields(db, 'social')).toEqual([
      { name: 'Handle', kind: 'text' },
      { name: 'Recovery phone', kind: 'number' },
    ]);
    expect(() => setTypeFields(db, 'social', [{ name: 'Handle', kind: 'text' }, { name: 'handle', kind: 'text' }])).toThrow('twice');
    expect(() => setTypeFields(db, 'social', [{ name: '', kind: 'text' }])).toThrow('name');
    resetTypeFields(db, 'social');
    expect(getTypeFields(db, 'social')).toEqual(DEFAULT_FIELDS.social);
  });

  it('the form shows the entry\'s fields, then starting fields it lacks', () => {
    const own: CustomField[] = [
      { name: 'Profile password', value: 'p@ss', kind: 'hidden' },
      { name: 'ifsc', value: 'HDFC0001234', kind: 'text' },
    ];
    expect(formFields(own, DEFAULT_FIELDS.banking.slice(0, 3)).map(f => [f.name, f.value])).toEqual([
      ['Profile password', 'p@ss'],
      ['ifsc', 'HDFC0001234'],
      ['Account number', ''],
      ['Customer ID', ''],
    ]);
  });
});
