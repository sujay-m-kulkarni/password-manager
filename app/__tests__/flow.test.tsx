/**
 * End-to-end flows in Node: render the whole App against real SQLite (test-support/nodeSqlite).
 */
jest.mock('@op-engineering/op-sqlite', () => require('../test-support/nodeSqlite').create());
jest.mock('react-native-quick-crypto', () => require('../test-support/nodeCrypto'));
jest.mock('react-native-keychain', () => require('../test-support/keychain'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NativeModules, TextInput } from 'react-native';
import App from '../App';
import { useSession } from '../src/store/session';

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

  // Step 2: the recovery key is shown once and must be confirmed as written down.
  expect(textOf(r)).toContain('Your recovery key');
  const code = r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Recovery key '))[0]
    .props.accessibilityLabel.replace('Recovery key ', '')
    .replace(/ /g, '');
  expect(code).toMatch(/^[0-9A-Z-]{29}$/);
  const continueBtn = () =>
    r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(t => t.props.children === 'Continue').length > 0)[0];
  expect(continueBtn().props.accessibilityState.disabled).toBe(true);
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'checkbox')[0].props.onPress();
  });
  await pressButton(r, 'Continue');

  // Step 3: no fingerprint hardware in the test, so it explains and continues.
  expect(textOf(r)).toContain('Unlock with your fingerprint');
  await pressButton(r, 'Continue');

  const after = textOf(r);
  expect(after).toContain('My Vault');
  expect(after).toContain('Banking');

  // Forgot password: lock, unlock with the recovery key, choose a new master password.
  await act(async () => {
    useSession.getState().lock();
    await wait(50);
  });
  expect(textOf(r)).toContain('Welcome back');
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'button' && n.findAll(t => t.props.children === 'Forgot password? Use recovery key').length > 0)[0].props.onPress();
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText(code.toLowerCase());
  });
  await pressButton(r, 'Unlock');
  expect(textOf(r)).toContain('Set a new master password');
  const pwInputs = r.root.findAllByType(TextInput);
  await act(async () => {
    pwInputs[0].props.onChangeText('seven quiet blue lanterns');
    pwInputs[1].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Save and open Vault');
  expect(textOf(r)).toContain('My Vault');

  // The new password now opens the vault.
  await act(async () => {
    useSession.getState().lock();
    await wait(50);
  });
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  expect(textOf(r)).toContain('My Vault');
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

test('the guide opens from the unlock screen, without unlocking', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  expect(textOf(r)).toContain('Welcome back');
  await pressButton(r, 'How to use Vault');
  expect(textOf(r)).toContain('Getting started');
  expect(textOf(r)).toContain('Write it on paper');
  await pressButton(r, 'Backups');
  expect(textOf(r)).toContain('Settings › Export backup');
  await pressButton(r, '‹ Back');
  expect(textOf(r)).toContain('Welcome back');
  await act(async () => {
    r.unmount();
    await wait(50);
  });
});

test('saving an entry returns to the list, for new and edited entries', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
    await wait(50);
  });
  // Unlock (the first test changed the password).
  await act(async () => {
    r.root.findAllByType(TextInput)[0].props.onChangeText('seven quiet blue lanterns');
  });
  await pressButton(r, 'Unlock');
  expect(textOf(r)).toContain('My Vault');

  const fab = () => r.root.findAll(n => n.props.accessibilityLabel === 'Add password' && typeof n.props.onPress === 'function')[0];
  const fill = async (title: string, secret: string) => {
    const inputs = r.root.findAllByType(TextInput);
    const byLabel = (l: string) => inputs.find(i => i.props.accessibilityLabel === l)!;
    await act(async () => {
      byLabel('Title').props.onChangeText(title);
      (byLabel('Password') ?? byLabel('PIN')).props.onChangeText(secret);
    });
  };

  // New login → back on the list.
  await act(async () => {
    fab().props.onPress();
    await wait(50);
  });
  await fill('Netflix', 'Xq7#tLm9vRw!pZ24');
  await pressButton(r, 'Save');
  let t = textOf(r);
  expect(t).toContain('My Vault');
  expect(t).toContain('Netflix');
  expect(t).not.toContain('Delete entry'); // not the entry's own page

  // New PIN → back on the list.
  await act(async () => {
    fab().props.onPress();
    await wait(50);
  });
  await act(async () => {
    r.root.findAll(n => n.props.accessibilityRole === 'radio' && n.findAll(x => x.props.children === 'PIN').length > 0)[0].props.onPress();
  });
  await fill('Phone lock', '482913');
  await pressButton(r, 'Save');
  t = textOf(r);
  expect(t).toContain('My Vault');
  expect(t).toContain('Phone lock');

  // Edit from the entry's page → back on the list, not the entry page.
  await pressButton(r, 'Netflix');
  expect(textOf(r)).toContain('Delete entry');
  await pressButton(r, 'Edit');
  await act(async () => {
    r.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'Title')!.props.onChangeText('Netflix family');
  });
  await pressButton(r, 'Save');
  t = textOf(r);
  expect(t).toContain('My Vault');
  expect(t).toContain('Netflix family');
  expect(t).not.toContain('Delete entry');

  await act(async () => {
    r.unmount();
    await wait(50);
  });
});
