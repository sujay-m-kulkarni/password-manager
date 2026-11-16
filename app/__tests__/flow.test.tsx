/**
 * End-to-end flow in Node: render the whole App, create a vault on the Setup screen,
 * and check the Vault screen appears. op-sqlite is backed by Node's built-in SQLite.
 */
jest.mock('@op-engineering/op-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
  return {
    open: ({ name, encryptionKey }: { name: string; encryptionKey?: string }) => {
      const file = path.join(dir, name);
      const raw = new DatabaseSync(file);
      return {
        executeSync: (sql: string, params: unknown[] = []) => {
          const t = sql.trim().toUpperCase();
          if (t.startsWith('SELECT') || (t.startsWith('PRAGMA') && !t.includes('='))) {
            return { rows: raw.prepare(sql).all(...params), insertId: undefined };
          }
          if (params.length === 0) {
            raw.exec(sql);
            return { rows: [], insertId: undefined };
          }
          const r = raw.prepare(sql).run(...params);
          return { rows: [], insertId: Number(r.lastInsertRowid) };
        },
        close: () => raw.close(),
        delete: () => {
          raw.close();
          fs.rmSync(file, { force: true });
        },
        _key: encryptionKey,
      };
    },
  };
});

jest.mock('react-native-quick-crypto', () => {
  const nodeCrypto = require('crypto');
  const NodeBuffer = require('buffer').Buffer;
  return {
    __esModule: true,
    default: {
      randomBytes: (n: number) => nodeCrypto.randomBytes(n),
      createCipheriv: nodeCrypto.createCipheriv,
      createDecipheriv: nodeCrypto.createDecipheriv,
      argon2: (_a: string, p: any, cb: any) => nodeCrypto.scrypt(p.message, p.nonce, p.tagLength, cb),
    },
    Buffer: NodeBuffer,
  };
});

jest.mock('react-native-keychain', () => {
  const store = new Map<string, string>();
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' },
    getGenericPassword: async ({ service }: any) => (store.has(service) ? { password: store.get(service) } : false),
    setGenericPassword: async (_u: string, p: string, { service }: any) => {
      store.set(service, p);
      return true;
    },
  };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NativeModules, TextInput } from 'react-native';
import App from '../App';

const wait = (ms: number) => new Promise<void>(res => setTimeout(() => res(), ms));

const textOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => typeof n.props.children === 'string' || typeof n.props.children === 'number')
    .map(n => String(n.props.children))
    .join(' | ');

const pressButton = async (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const button = r.root.findAll(
    n =>
      n.props.accessibilityRole === 'button' &&
      typeof n.props.onPress === 'function' &&
      n.findAll(t => t.props.children === label).length > 0,
  )[0];
  await act(async () => {
    button.props.onPress();
    await wait(300);
  });
};

afterEach(async () => {
  delete NativeModules.CrashReport;
});

test('setup creates the vault and opens the Vault screen', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  expect(textOf(r)).toContain('Create your master password');

  const inputs = r.root.findAllByType(TextInput);
  await act(async () => {
    inputs[0].props.onChangeText('purple mango river forty');
    inputs[1].props.onChangeText('purple mango river forty');
  });
  await pressButton(r, 'Create vault');

  const after = textOf(r);
  expect(after).toContain('My Vault');
  expect(after).toContain('Banking');
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('shows the crash report from the last run, once', async () => {
  NativeModules.CrashReport = {
    takeLastCrash: jest.fn().mockResolvedValue({
      reason: 'Crash (native code)',
      when: 0,
      details: 'Abort message: example',
      device: 'Test phone',
      appVersion: '1.0.1',
    }),
  };
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  expect(textOf(r)).toContain('Vault closed unexpectedly last time');
  expect(textOf(r)).toContain('Vault 1.0.1 closed unexpectedly');
  await pressButton(r, 'Close');
  expect(textOf(r)).not.toContain('Vault closed unexpectedly last time');
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});
